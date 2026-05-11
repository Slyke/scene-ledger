'use strict';

const { wrapError } = require('../errors');

const parseJsonValue = ({ value }) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (err) {
    throw wrapError({
      caller: 'db::records::parseJsonValue',
      reason: 'Failed to parse stored JSON value',
      errorKey: 'DB_JSON_PARSE_FAILED',
      err
    });
  }
};

const stringifyJsonValue = ({ value }) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
};

const toIsoString = ({ value }) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
};

const normalizeCameraRow = ({ row }) => {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    camera_id: row.camera_id,
    name: row.name,
    description: row.description,
    enabled: row.enabled === true || row.enabled === 1,
    created_at: toIsoString({ value: row.created_at }),
    updated_at: toIsoString({ value: row.updated_at })
  };
};

const normalizeFrameRow = ({ row }) => {
  if (!row) {
    return null;
  }

  const frame = {
    id: Number(row.id),
    camera_id: row.camera_id,
    captured_at: toIsoString({ value: row.captured_at }),
    received_at: toIsoString({ value: row.received_at }),
    image_path: row.image_path,
    thumbnail_path: row.thumbnail_path,
    preview_path: row.preview_path,
    width: row.width === null || row.width === undefined ? null : Number(row.width),
    height: row.height === null || row.height === undefined ? null : Number(row.height),
    ollama_model: row.ollama_model,
    ollama_duration_ms: row.ollama_duration_ms === null || row.ollama_duration_ms === undefined
      ? null
      : Number(row.ollama_duration_ms),
    analysis_status: row.analysis_status,
    error: row.error,
    raw_response_json: parseJsonValue({ value: row.raw_response_json }),
    created_at: toIsoString({ value: row.created_at })
  };

  if (row.item_count !== undefined) {
    frame.item_count = Number(row.item_count);
  }

  return frame;
};

const normalizeObservationRow = ({ row }) => {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    frame_id: Number(row.frame_id),
    camera_id: row.camera_id,
    captured_at: toIsoString({ value: row.captured_at }),
    name: row.name,
    loc: row.loc,
    conf: row.conf,
    box: {
      x: Number(row.box_x),
      y: Number(row.box_y),
      w: Number(row.box_w),
      h: Number(row.box_h)
    },
    text: parseJsonValue({ value: row.text_json }) ?? undefined,
    created_at: toIsoString({ value: row.created_at })
  };
};

const normalizeObservationTextRow = ({ row }) => {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    observation_id: Number(row.observation_id),
    frame_id: Number(row.frame_id),
    camera_id: row.camera_id,
    captured_at: toIsoString({ value: row.captured_at }),
    value: row.value,
    conf: row.conf,
    created_at: toIsoString({ value: row.created_at })
  };
};

module.exports = {
  normalizeCameraRow,
  normalizeFrameRow,
  normalizeObservationRow,
  normalizeObservationTextRow,
  parseJsonValue,
  stringifyJsonValue,
  toIsoString
};
