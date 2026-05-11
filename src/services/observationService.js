'use strict';

const { wrapError } = require('../errors');

const VALID_LOCS = new Set([
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center',
  'center-right',
  'bottom-left',
  'bottom-center',
  'bottom-right'
]);

const VALID_CONFIDENCES = new Set(['high', 'medium', 'low']);

const createObservationError = ({ reason, errorKey, context }) => {
  return wrapError({
    caller: 'services::observationService',
    reason,
    errorKey,
    context
  });
};

const normalizeInteger = ({ value, field, index }) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createObservationError({
      reason: 'Invalid observation box coordinate',
      errorKey: 'OBSERVATION_BOX_INVALID',
      context: { field, index, value }
    });
  }

  return Math.round(parsed);
};

const normalizeText = ({ text, index }) => {
  if (text === undefined || text === null) {
    return undefined;
  }

  if (!Array.isArray(text)) {
    throw createObservationError({
      reason: 'Invalid item text',
      errorKey: 'OBSERVATION_TEXT_INVALID',
      context: { index }
    });
  }

  const normalized = text
    .map((entry) => {
      const value = String(entry?.v ?? '').trim();
      const conf = String(entry?.conf ?? '').trim();

      if (!value || !VALID_CONFIDENCES.has(conf)) {
        return null;
      }

      return { v: value, conf };
    })
    .filter(Boolean);

  return normalized.length > 0 ? normalized : undefined;
};

const normalizeObservationItems = ({ payload }) => {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.items)) {
    throw createObservationError({
      reason: 'Ollama JSON must contain an items array',
      errorKey: 'OBSERVATION_ITEMS_MISSING'
    });
  }

  return payload.items.map((item, index) => {
    const name = String(item?.name ?? '').trim();
    const loc = String(item?.loc ?? '').trim();
    const conf = String(item?.conf ?? '').trim();
    const box = item?.box;

    if (!name) {
      throw createObservationError({
        reason: 'Observation item is missing name',
        errorKey: 'OBSERVATION_NAME_MISSING',
        context: { index }
      });
    }

    if (!VALID_LOCS.has(loc)) {
      throw createObservationError({
        reason: 'Observation item has invalid loc',
        errorKey: 'OBSERVATION_LOC_INVALID',
        context: { index, loc }
      });
    }

    if (!VALID_CONFIDENCES.has(conf)) {
      throw createObservationError({
        reason: 'Observation item has invalid conf',
        errorKey: 'OBSERVATION_CONF_INVALID',
        context: { index, conf }
      });
    }

    if (!box || typeof box !== 'object') {
      throw createObservationError({
        reason: 'Observation item is missing box',
        errorKey: 'OBSERVATION_BOX_MISSING',
        context: { index }
      });
    }

    const normalized = {
      name,
      loc,
      conf,
      box: {
        x: normalizeInteger({ value: box.x, field: 'x', index }),
        y: normalizeInteger({ value: box.y, field: 'y', index }),
        w: normalizeInteger({ value: box.w, field: 'w', index }),
        h: normalizeInteger({ value: box.h, field: 'h', index })
      }
    };

    const text = normalizeText({ text: item.text, index });

    if (text !== undefined) {
      normalized.text = text;
    }

    return normalized;
  });
};

const compactObservation = ({ observation }) => {
  const compact = {
    name: observation.name,
    loc: observation.loc,
    conf: observation.conf,
    box: observation.box
  };

  if (observation.text && observation.text.length > 0) {
    compact.text = observation.text;
  }

  return compact;
};

const compactObservations = ({ observations }) => {
  return observations.map((observation) => {
    return compactObservation({ observation });
  });
};

module.exports = {
  VALID_CONFIDENCES,
  VALID_LOCS,
  compactObservation,
  compactObservations,
  normalizeObservationItems
};
