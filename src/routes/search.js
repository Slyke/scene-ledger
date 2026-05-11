'use strict';

const express = require('express');

const { createHttpError } = require('../httpError');
const { VALID_CONFIDENCES, VALID_LOCS } = require('../services/observationService');
const {
  asyncRoute,
  decodeCursor,
  parseBooleanQuery,
  parseLimit,
  requireIsoDateTime,
  withCursor
} = require('./helpers');

const optionalIsoDateTime = ({ value, field }) => {
  if (!value) {
    return undefined;
  }

  return requireIsoDateTime({ value, field });
};

const optionalLoc = ({ value }) => {
  if (!value) {
    return undefined;
  }

  if (!VALID_LOCS.has(value)) {
    throw createHttpError({
      status: 400,
      message: 'Invalid loc',
      errorKey: 'OBSERVATION_LOC_INVALID',
      caller: 'routes::search::optionalLoc',
      context: { value }
    });
  }

  return value;
};

const optionalConf = ({ value }) => {
  if (!value) {
    return undefined;
  }

  if (!VALID_CONFIDENCES.has(value)) {
    throw createHttpError({
      status: 400,
      message: 'Invalid conf',
      errorKey: 'OBSERVATION_CONF_INVALID',
      caller: 'routes::search::optionalConf',
      context: { value }
    });
  }

  return value;
};

const toObservationSearchResult = ({ observation }) => {
  return {
    frame_id: observation.frame_id,
    camera_id: observation.camera_id,
    captured_at: observation.captured_at,
    thumbnail_url: '/api/frames/' + observation.frame_id + '/thumbnail',
    image_url: '/api/frames/' + observation.frame_id + '/image',
    matched: {
      type: 'observation',
      name: observation.name,
      loc: observation.loc,
      conf: observation.conf,
      box: observation.box
    }
  };
};

const toTextSearchResult = ({ result }) => {
  return {
    frame_id: result.text.frame_id,
    camera_id: result.text.camera_id,
    captured_at: result.text.captured_at,
    thumbnail_url: '/api/frames/' + result.text.frame_id + '/thumbnail',
    image_url: '/api/frames/' + result.text.frame_id + '/image',
    text: {
      v: result.text.value,
      conf: result.text.conf
    },
    item: result.item
  };
};

const createSearchRouter = ({ db }) => {
  const router = express.Router();

  router.get('/', asyncRoute({
    handler: async ({ req, res }) => {
      const limit = parseLimit({ value: req.query.limit, fallback: 100, max: 500 });
      const offset = decodeCursor({ cursor: req.query.cursor });
      const hasText = parseBooleanQuery({ value: req.query.has_text, field: 'has_text' });
      const rows = await db.searchObservations({
        q: req.query.q,
        cameraId: req.query.camera_id,
        start: optionalIsoDateTime({ value: req.query.start, field: 'start' }),
        end: optionalIsoDateTime({ value: req.query.end, field: 'end' }),
        loc: optionalLoc({ value: req.query.loc }),
        conf: optionalConf({ value: req.query.conf }),
        hasText,
        limit: limit + 1,
        offset
      });
      const paged = withCursor({ rows, limit, offset });

      res.json({
        results: paged.rows.map((observation) => toObservationSearchResult({ observation })),
        next_cursor: paged.nextCursor
      });
    }
  }));

  router.get('/text', asyncRoute({
    handler: async ({ req, res }) => {
      const limit = parseLimit({ value: req.query.limit, fallback: 100, max: 500 });
      const offset = decodeCursor({ cursor: req.query.cursor });
      const rows = await db.searchText({
        q: req.query.q,
        cameraId: req.query.camera_id,
        start: optionalIsoDateTime({ value: req.query.start, field: 'start' }),
        end: optionalIsoDateTime({ value: req.query.end, field: 'end' }),
        limit: limit + 1,
        offset
      });
      const paged = withCursor({ rows, limit, offset });

      res.json({
        results: paged.rows.map((result) => toTextSearchResult({ result })),
        next_cursor: paged.nextCursor
      });
    }
  }));

  return router;
};

const createObservationsRouter = ({ db }) => {
  const router = express.Router();

  router.get('/names', asyncRoute({
    handler: async ({ req, res }) => {
      const names = await db.listObservationNames({
        cameraId: req.query.camera_id,
        start: optionalIsoDateTime({ value: req.query.start, field: 'start' }),
        end: optionalIsoDateTime({ value: req.query.end, field: 'end' })
      });

      res.json({ names });
    }
  }));

  router.get('/locations', asyncRoute({
    handler: async ({ res }) => {
      res.json({
        locations: Array.from(VALID_LOCS)
      });
    }
  }));

  return router;
};

module.exports = {
  createObservationsRouter,
  createSearchRouter
};
