'use strict';

const express = require('express');

const { createHttpError } = require('../httpError');
const { resolveStoredImagePath } = require('../images/safePath');
const { parseBooleanQuery } = require('./helpers');
const { asyncRoute } = require('./helpers');

const parseFrameId = ({ value }) => {
  const frameId = Number.parseInt(value, 10);

  if (Number.isNaN(frameId) || frameId < 1) {
    throw createHttpError({
      status: 400,
      message: 'Invalid frame_id',
      errorKey: 'VALIDATION_FRAME_ID_INVALID',
      caller: 'routes::frames::parseFrameId',
      context: { value }
    });
  }

  return frameId;
};

const allowedRootsForColumn = ({ config, column }) => {
  if (column === 'image_path') {
    return [config.images.root, config.images.storageRoot];
  }

  return [config.images.thumbRoot];
};

const sendFrameFile = async ({ config, db, req, res, next, column }) => {
  const frameId = parseFrameId({ value: req.params.frame_id });
  const frame = await db.getFrame({ frameId });

  if (!frame) {
    throw createHttpError({
      status: 404,
      message: 'Frame not found',
      errorKey: 'FRAME_NOT_FOUND',
      caller: 'routes::frames::sendFrameFile',
      context: { frameId }
    });
  }

  const filePath = await resolveStoredImagePath({
    roots: allowedRootsForColumn({ config, column }),
    filePath: frame[column]
  });

  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(filePath, (err) => {
    if (err) {
      next(createHttpError({
        status: 404,
        message: 'Image is unavailable',
        errorKey: 'IMAGE_FILE_UNAVAILABLE',
        caller: 'routes::frames::sendFrameFile',
        err,
        context: {
          frameId,
          column
        }
      }));
    }
  });
};

const createFramesRouter = ({ config, db, frameService }) => {
  const router = express.Router();

  router.get('/:frame_id', asyncRoute({
    handler: async ({ req, res }) => {
      const frameId = parseFrameId({ value: req.params.frame_id });
      const payload = await frameService.getFramePayload({ frameId });

      res.json(payload);
    }
  }));

  router.get('/:frame_id/image', asyncRoute({
    handler: async ({ req, res, next }) => {
      await sendFrameFile({ config, db, req, res, next, column: 'image_path' });
    }
  }));

  router.get('/:frame_id/thumbnail', asyncRoute({
    handler: async ({ req, res, next }) => {
      await sendFrameFile({ config, db, req, res, next, column: 'thumbnail_path' });
    }
  }));

  router.get('/:frame_id/preview', asyncRoute({
    handler: async ({ req, res, next }) => {
      await sendFrameFile({ config, db, req, res, next, column: 'preview_path' });
    }
  }));

  router.post('/:frame_id/reanalyse', asyncRoute({
    handler: async ({ req, res }) => {
      const frameId = parseFrameId({ value: req.params.frame_id });
      const usePreviousItems = parseBooleanQuery({
        value: req.body?.use_previous_items === undefined
          ? 'true'
          : String(req.body.use_previous_items),
        field: 'use_previous_items'
      });
      const result = await frameService.reanalyseFrame({
        frameId,
        model: req.body?.model,
        usePreviousItems
      });

      res.status(result.ok ? 200 : 409).json({
        ok: result.ok,
        frame_id: result.frame_id,
        analysis_status: result.ok ? 'complete' : 'failed',
        error: result.error,
        error_key: result.error_key,
        error_code: result.error_code
      });
    }
  }));

  return router;
};

module.exports = {
  createFramesRouter,
  parseFrameId
};
