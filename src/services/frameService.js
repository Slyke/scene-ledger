'use strict';

const fs = require('fs/promises');

const { wrapError } = require('../errors');
const { createHttpError } = require('../httpError');
const { makeImageVariants } = require('../images/makeThumbnail');
const { resolveSafeImagePath } = require('../images/safePath');
const { storeUploadedImage } = require('../images/storeImage');
const { analyseImageWithOllama } = require('../ollama/analyseImage');
const { normalizeObservationItems } = require('./observationService');
const { getPreviousItems } = require('./previousItemsService');

const CAMERA_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

const pathExists = async ({ filePath }) => {
  if (!filePath) {
    return false;
  }

  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const normalizeCameraId = ({ cameraId }) => {
  const normalized = String(cameraId ?? '').trim();

  if (!CAMERA_ID_PATTERN.test(normalized)) {
    throw createHttpError({
      status: 400,
      message: 'Invalid camera_id',
      errorKey: 'VALIDATION_CAMERA_ID_INVALID',
      caller: 'services::frameService::normalizeCameraId',
      details: { camera_id: 'Use 1-128 letters, numbers, underscore, or hyphen characters.' },
      context: { cameraId }
    });
  }

  return normalized;
};

const normalizeCapturedAt = ({ capturedAt }) => {
  const value = capturedAt ?? new Date().toISOString();
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError({
      status: 400,
      message: 'Invalid captured_at',
      errorKey: 'VALIDATION_CAPTURED_AT_INVALID',
      caller: 'services::frameService::normalizeCapturedAt',
      context: { capturedAt }
    });
  }

  return parsed.toISOString();
};

const readableCameraName = ({ cameraId }) => {
  return cameraId
    .replace(/[_-]+/g, ' ')
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
};

const toPublicItem = ({ item }) => {
  const publicItem = {
    name: item.name,
    loc: item.loc,
    conf: item.conf,
    box: item.box
  };

  if (item.text && item.text.length > 0) {
    publicItem.text = item.text;
  }

  return publicItem;
};

const toPublicFrame = async ({ frame }) => {
  return {
    id: frame.id,
    camera_id: frame.camera_id,
    captured_at: frame.captured_at,
    received_at: frame.received_at,
    image_url: '/api/frames/' + frame.id + '/image',
    thumbnail_url: frame.thumbnail_path ? '/api/frames/' + frame.id + '/thumbnail' : null,
    preview_url: frame.preview_path ? '/api/frames/' + frame.id + '/preview' : null,
    width: frame.width,
    height: frame.height,
    analysis_status: frame.analysis_status,
    error: frame.error,
    ollama_model: frame.ollama_model,
    ollama_duration_ms: frame.ollama_duration_ms,
    image_available: await pathExists({ filePath: frame.image_path }),
    thumbnail_available: await pathExists({ filePath: frame.thumbnail_path }),
    preview_available: await pathExists({ filePath: frame.preview_path })
  };
};

const errorPayload = ({ err }) => {
  if (!err) {
    return {};
  }

  return {
    error: err.publicMessage ?? err.message,
    error_key: err.errorKey ?? err.details?.errorKey,
    error_code: err.errorCode ?? err.details?.errorCode
  };
};

const createAnalysisResponse = ({ ok, frame, items, err }) => {
  const response = {
    ok,
    frame_id: frame.id,
    camera_id: frame.camera_id,
    captured_at: frame.captured_at,
    image_url: '/api/frames/' + frame.id + '/image',
    thumbnail_url: frame.thumbnail_path ? '/api/frames/' + frame.id + '/thumbnail' : null
  };

  if (ok) {
    response.items = items.map((item) => toPublicItem({ item }));
    return response;
  }

  return {
    ...response,
    ...errorPayload({ err })
  };
};

const ensureCamera = async ({ db, cameraId }) => {
  const existing = await db.getCameraByCameraId({ cameraId });

  if (existing) {
    return existing;
  }

  return db.upsertCamera({
    camera: {
      camera_id: cameraId,
      name: readableCameraName({ cameraId }),
      description: null,
      enabled: true
    }
  });
};

const normalizeAnalysisError = ({ err, frame }) => {
  if (err.errorKey) {
    return err;
  }

  return wrapError({
    caller: 'services::frameService::runAnalysisForFrame',
    reason: 'Frame analysis failed',
    errorKey: 'FRAME_ANALYSIS_FAILED',
    err,
    includeStackTrace: true,
    context: {
      frameId: frame.id,
      cameraId: frame.camera_id,
      capturedAt: frame.captured_at
    }
  });
};

const createFrameService = ({ config, db }) => {
  const runAnalysisForFrame = async ({ frame, model, usePreviousItems }) => {
    try {
      const variants = await makeImageVariants({
        sourcePath: frame.image_path,
        cameraId: frame.camera_id,
        capturedAt: frame.captured_at,
        thumbRoot: config.images.thumbRoot
      });

      frame = await db.updateFrame({
        frameId: frame.id,
        updates: {
          ...variants,
          analysis_status: 'pending',
          error: null,
          ollama_model: model
        }
      });

      const previousItems = usePreviousItems
        ? await getPreviousItems({
          db,
          cameraId: frame.camera_id,
          capturedAt: frame.captured_at,
          maxAgeSeconds: config.previousFrameMaxAgeSeconds
        })
        : [];

      const ollamaResult = await analyseImageWithOllama({
        config,
        imagePath: frame.image_path,
        previousItems,
        model
      });
      const items = normalizeObservationItems({ payload: ollamaResult.parsed });

      await db.replaceObservationsForFrame({
        frameId: frame.id,
        cameraId: frame.camera_id,
        capturedAt: frame.captured_at,
        items
      });

      frame = await db.updateFrame({
        frameId: frame.id,
        updates: {
          analysis_status: 'complete',
          error: null,
          raw_response_json: ollamaResult.rawResponse,
          ollama_duration_ms: ollamaResult.durationMs,
          ollama_model: ollamaResult.model
        }
      });

      return createAnalysisResponse({ ok: true, frame, items });
    } catch (err) {
      const analysisError = normalizeAnalysisError({ err, frame });

      frame = await db.updateFrame({
        frameId: frame.id,
        updates: {
          analysis_status: 'failed',
          error: analysisError.publicMessage ?? analysisError.message
        }
      });

      return createAnalysisResponse({
        ok: false,
        frame,
        items: [],
        err: analysisError
      });
    }
  };

  const analyseStoredImage = async ({ cameraId, capturedAt, imagePath, model, usePreviousItems = true }) => {
    await ensureCamera({ db, cameraId });

    const frame = await db.createFrame({
      frame: {
        camera_id: cameraId,
        captured_at: capturedAt,
        received_at: new Date().toISOString(),
        image_path: imagePath,
        thumbnail_path: null,
        preview_path: null,
        width: null,
        height: null,
        ollama_model: model,
        ollama_duration_ms: null,
        analysis_status: 'pending',
        error: null,
        raw_response_json: null
      }
    });

    return runAnalysisForFrame({ frame, model, usePreviousItems });
  };

  const analysePath = async ({ cameraId, capturedAt, imagePath }) => {
    const normalizedCameraId = normalizeCameraId({ cameraId });
    const normalizedCapturedAt = normalizeCapturedAt({ capturedAt });
    const safeImagePath = await resolveSafeImagePath({
      root: config.images.root,
      inputPath: imagePath
    });

    return analyseStoredImage({
      cameraId: normalizedCameraId,
      capturedAt: normalizedCapturedAt,
      imagePath: safeImagePath,
      model: config.ollama.model
    });
  };

  const analyseUpload = async ({ cameraId, capturedAt, file }) => {
    const normalizedCameraId = normalizeCameraId({ cameraId });
    const normalizedCapturedAt = normalizeCapturedAt({ capturedAt });
    const imagePath = await storeUploadedImage({
      file,
      cameraId: normalizedCameraId,
      capturedAt: normalizedCapturedAt,
      storageRoot: config.images.storageRoot
    });

    return analyseStoredImage({
      cameraId: normalizedCameraId,
      capturedAt: normalizedCapturedAt,
      imagePath,
      model: config.ollama.model
    });
  };

  const getFramePayload = async ({ frameId }) => {
    const frame = await db.getFrame({ frameId });

    if (!frame) {
      throw createHttpError({
        status: 404,
        message: 'Frame not found',
        errorKey: 'FRAME_NOT_FOUND',
        caller: 'services::frameService::getFramePayload',
        context: { frameId }
      });
    }

    const items = await db.getObservationsForFrame({ frameId });

    return {
      frame: await toPublicFrame({ frame }),
      items: items.map((item) => toPublicItem({ item }))
    };
  };

  const reanalyseFrame = async ({ frameId, model, usePreviousItems = true }) => {
    const frame = await db.getFrame({ frameId });

    if (!frame) {
      throw createHttpError({
        status: 404,
        message: 'Frame not found',
        errorKey: 'FRAME_NOT_FOUND',
        caller: 'services::frameService::reanalyseFrame',
        context: { frameId }
      });
    }

    if (!(await pathExists({ filePath: frame.image_path }))) {
      const missingImageError = wrapError({
        caller: 'services::frameService::reanalyseFrame',
        reason: 'Original image is missing',
        errorKey: 'FRAME_ORIGINAL_MISSING',
        context: { frameId }
      });
      const failedFrame = await db.updateFrame({
        frameId,
        updates: {
          analysis_status: 'failed',
          error: missingImageError.message
        }
      });

      return createAnalysisResponse({
        ok: false,
        frame: failedFrame,
        items: [],
        err: missingImageError
      });
    }

    const selectedModel = model ?? config.ollama.model;
    const pendingFrame = await db.updateFrame({
      frameId,
      updates: {
        analysis_status: 'pending',
        error: null,
        ollama_model: selectedModel
      }
    });

    await db.deleteObservationsForFrame({ frameId });

    return runAnalysisForFrame({
      frame: pendingFrame,
      model: selectedModel,
      usePreviousItems
    });
  };

  return {
    analysePath,
    analyseUpload,
    getFramePayload,
    reanalyseFrame
  };
};

module.exports = {
  createFrameService,
  normalizeCameraId,
  normalizeCapturedAt,
  pathExists,
  toPublicFrame,
  toPublicItem
};
