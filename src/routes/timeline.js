'use strict';

const express = require('express');

const {
  asyncRoute,
  dayBounds,
  decodeCursor,
  parseBooleanQuery,
  parseLimit,
  requireTimeRange,
  withCursor
} = require('./helpers');

const frameUrls = ({ frame }) => {
  return {
    thumbnail_url: frame.thumbnail_path ? '/api/frames/' + frame.id + '/thumbnail' : null,
    image_url: '/api/frames/' + frame.id + '/image'
  };
};

const toTimelineFrame = ({ frame, includeItems }) => {
  const publicFrame = {
    id: frame.id,
    camera_id: frame.camera_id,
    captured_at: frame.captured_at,
    ...frameUrls({ frame }),
    item_count: frame.item_count ?? 0
  };

  if (includeItems) {
    publicFrame.items = (frame.items ?? []).map((item) => {
      return {
        name: item.name,
        loc: item.loc,
        conf: item.conf
      };
    });
  }

  return publicFrame;
};

const createBuckets = ({ frames, intervalSeconds }) => {
  const intervalMs = intervalSeconds * 1000;
  const bucketsByStart = new Map();

  for (const frame of frames) {
    const capturedMs = new Date(frame.captured_at).getTime();
    const startMs = Math.floor(capturedMs / intervalMs) * intervalMs;
    const key = String(startMs);
    const bucket = bucketsByStart.get(key) ?? {
      start: new Date(startMs).toISOString(),
      end: new Date(startMs + intervalMs).toISOString(),
      frame_count: 0,
      thumbnail_url: null,
      itemCounts: new Map()
    };

    bucket.frame_count += 1;
    bucket.thumbnail_url = bucket.thumbnail_url ?? (frame.thumbnail_path ? '/api/frames/' + frame.id + '/thumbnail' : null);

    for (const item of frame.items ?? []) {
      bucket.itemCounts.set(item.name, (bucket.itemCounts.get(item.name) ?? 0) + 1);
    }

    bucketsByStart.set(key, bucket);
  }

  return Array.from(bucketsByStart.values()).map((bucket) => {
    const topItems = Array.from(bucket.itemCounts.entries())
      .sort((a, b) => {
        return (b[1] - a[1]) || a[0].localeCompare(b[0]);
      })
      .slice(0, 5)
      .map(([name]) => name);

    return {
      start: bucket.start,
      end: bucket.end,
      frame_count: bucket.frame_count,
      thumbnail_url: bucket.thumbnail_url,
      top_items: topItems
    };
  });
};

const createTimelineRouter = ({ db }) => {
  const router = express.Router();

  router.get('/days', asyncRoute({
    handler: async ({ req, res }) => {
      const cameraId = req.query.camera_id;
      const days = await db.listDays({ cameraId });

      res.json({
        days: days.map((day) => {
          return {
            date: day.date,
            frame_count: day.frame_count,
            observation_count: day.observation_count,
            first_frame_at: day.first_frame_at,
            last_frame_at: day.last_frame_at,
            thumbnail_url: day.thumbnail_frame_id ? '/api/frames/' + day.thumbnail_frame_id + '/thumbnail' : null
          };
        })
      });
    }
  }));

  router.get('/day', asyncRoute({
    handler: async ({ req, res }) => {
      const limit = parseLimit({ value: req.query.limit, fallback: 200, max: 500 });
      const offset = decodeCursor({ cursor: req.query.cursor });
      const includeItems = parseBooleanQuery({ value: req.query.include_items, field: 'include_items' }) ?? false;
      const bounds = dayBounds({ date: req.query.date });
      const rows = await db.listFrames({
        start: bounds.start,
        end: bounds.end,
        cameraId: req.query.camera_id,
        limit: limit + 1,
        offset,
        includeItems
      });
      const paged = withCursor({ rows, limit, offset });

      res.json({
        date: req.query.date,
        camera_id: req.query.camera_id ?? null,
        frames: paged.rows.map((frame) => toTimelineFrame({ frame, includeItems })),
        next_cursor: paged.nextCursor
      });
    }
  }));

  router.get('/range', asyncRoute({
    handler: async ({ req, res }) => {
      const mode = req.query.mode === 'buckets' ? 'buckets' : 'frames';
      const range = requireTimeRange({ start: req.query.start, end: req.query.end });
      const includeItems = mode === 'buckets'
        ? true
        : (parseBooleanQuery({ value: req.query.include_items, field: 'include_items' }) ?? false);
      const limit = parseLimit({ value: req.query.limit, fallback: mode === 'buckets' ? 2000 : 500, max: 5000 });
      const rows = await db.listFrames({
        start: range.start,
        end: range.end,
        cameraId: req.query.camera_id,
        limit,
        offset: 0,
        includeItems
      });

      if (mode === 'buckets') {
        const intervalSeconds = parseLimit({
          value: req.query.interval_seconds,
          fallback: 60,
          max: 86400
        });

        res.json({
          buckets: createBuckets({ frames: rows, intervalSeconds })
        });
        return;
      }

      res.json({
        frames: rows.map((frame) => toTimelineFrame({ frame, includeItems }))
      });
    }
  }));

  return router;
};

module.exports = {
  createTimelineRouter
};
