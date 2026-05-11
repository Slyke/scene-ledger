'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const {
  normalizeCameraRow,
  normalizeFrameRow,
  normalizeObservationRow,
  normalizeObservationTextRow,
  stringifyJsonValue
} = require('./records');

const createSchema = ({ db }) => {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS cameras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      camera_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS frames (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      camera_id TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      received_at TEXT NOT NULL,
      image_path TEXT NOT NULL,
      thumbnail_path TEXT,
      preview_path TEXT,
      width INTEGER,
      height INTEGER,
      ollama_model TEXT NOT NULL,
      ollama_duration_ms INTEGER,
      analysis_status TEXT NOT NULL,
      error TEXT,
      raw_response_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      frame_id INTEGER NOT NULL,
      camera_id TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      name TEXT NOT NULL,
      loc TEXT NOT NULL,
      conf TEXT NOT NULL,
      box_x INTEGER NOT NULL,
      box_y INTEGER NOT NULL,
      box_w INTEGER NOT NULL,
      box_h INTEGER NOT NULL,
      text_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(frame_id) REFERENCES frames(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS observation_text (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      observation_id INTEGER NOT NULL,
      frame_id INTEGER NOT NULL,
      camera_id TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      value TEXT NOT NULL,
      conf TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(observation_id) REFERENCES observations(id) ON DELETE CASCADE,
      FOREIGN KEY(frame_id) REFERENCES frames(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS derived_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      camera_id TEXT NOT NULL,
      start_frame_id INTEGER NOT NULL,
      end_frame_id INTEGER,
      start_time TEXT NOT NULL,
      end_time TEXT,
      event_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      confidence TEXT NOT NULL,
      data_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_frames_camera_captured ON frames(camera_id, captured_at);
    CREATE INDEX IF NOT EXISTS idx_frames_captured ON frames(captured_at);
    CREATE INDEX IF NOT EXISTS idx_observations_camera_captured ON observations(camera_id, captured_at);
    CREATE INDEX IF NOT EXISTS idx_observations_name ON observations(name);
    CREATE INDEX IF NOT EXISTS idx_observations_loc ON observations(loc);
    CREATE INDEX IF NOT EXISTS idx_observation_text_value ON observation_text(value);
    CREATE INDEX IF NOT EXISTS idx_observation_text_camera_captured ON observation_text(camera_id, captured_at);
  `);
};

const createFrameFromRow = ({ row }) => {
  return normalizeFrameRow({ row });
};

const createObservationFromRow = ({ row }) => {
  return normalizeObservationRow({ row });
};

const addItemsToFrames = ({ db, frames }) => {
  if (frames.length === 0) {
    return frames;
  }

  const ids = frames.map((frame) => frame.id);
  const placeholders = ids.map(() => '?').join(', ');
  const rows = db
    .prepare(`SELECT * FROM observations WHERE frame_id IN (${placeholders}) ORDER BY frame_id ASC, id ASC`)
    .all(...ids);
  const observationsByFrame = new Map();

  for (const row of rows) {
    const observation = createObservationFromRow({ row });
    const list = observationsByFrame.get(observation.frame_id) ?? [];

    list.push(observation);
    observationsByFrame.set(observation.frame_id, list);
  }

  return frames.map((frame) => {
    return {
      ...frame,
      items: observationsByFrame.get(frame.id) ?? []
    };
  });
};

const normalizeFrameUpdates = ({ updates }) => {
  const allowed = new Set([
    'thumbnail_path',
    'preview_path',
    'width',
    'height',
    'ollama_model',
    'ollama_duration_ms',
    'analysis_status',
    'error',
    'raw_response_json'
  ]);
  const normalized = {};

  for (const [key, value] of Object.entries(updates)) {
    if (!allowed.has(key)) {
      continue;
    }

    normalized[key] = key === 'raw_response_json'
      ? stringifyJsonValue({ value })
      : value;
  }

  return normalized;
};

const createSqliteDb = ({ dbPath }) => {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);

  createSchema({ db });

  const insertObservation = db.prepare(`
    INSERT INTO observations (
      frame_id,
      camera_id,
      captured_at,
      name,
      loc,
      conf,
      box_x,
      box_y,
      box_w,
      box_h,
      text_json,
      created_at
    )
    VALUES (
      @frame_id,
      @camera_id,
      @captured_at,
      @name,
      @loc,
      @conf,
      @box_x,
      @box_y,
      @box_w,
      @box_h,
      @text_json,
      @created_at
    )
  `);

  const insertObservationText = db.prepare(`
    INSERT INTO observation_text (
      observation_id,
      frame_id,
      camera_id,
      captured_at,
      value,
      conf,
      created_at
    )
    VALUES (
      @observation_id,
      @frame_id,
      @camera_id,
      @captured_at,
      @value,
      @conf,
      @created_at
    )
  `);

  const deleteObservations = db.transaction(({ frameId }) => {
    db.prepare('DELETE FROM observation_text WHERE frame_id = ?').run(frameId);
    db.prepare('DELETE FROM observations WHERE frame_id = ?').run(frameId);
  });

  const replaceObservations = db.transaction(({ frameId, cameraId, capturedAt, items }) => {
    deleteObservations({ frameId });

    const createdAt = new Date().toISOString();
    const inserted = [];

    for (const item of items) {
      const result = insertObservation.run({
        frame_id: frameId,
        camera_id: cameraId,
        captured_at: capturedAt,
        name: item.name,
        loc: item.loc,
        conf: item.conf,
        box_x: item.box.x,
        box_y: item.box.y,
        box_w: item.box.w,
        box_h: item.box.h,
        text_json: stringifyJsonValue({ value: item.text }),
        created_at: createdAt
      });
      const observationId = Number(result.lastInsertRowid);

      if (item.text) {
        for (const text of item.text) {
          insertObservationText.run({
            observation_id: observationId,
            frame_id: frameId,
            camera_id: cameraId,
            captured_at: capturedAt,
            value: text.v,
            conf: text.conf,
            created_at: createdAt
          });
        }
      }

      inserted.push({ id: observationId, ...item });
    }

    return inserted;
  });

  const buildObservationFilters = ({ q, cameraId, start, end, loc, conf, hasText }) => {
    const where = [];
    const params = {};

    if (q) {
      params.pattern = `%${q.toLowerCase()}%`;
      where.push(`(
        lower(o.name) LIKE @pattern
        OR EXISTS (
          SELECT 1 FROM observation_text ot
          WHERE ot.observation_id = o.id
          AND lower(ot.value) LIKE @pattern
        )
      )`);
    }

    if (cameraId) {
      params.camera_id = cameraId;
      where.push('o.camera_id = @camera_id');
    }

    if (start) {
      params.start = start;
      where.push('o.captured_at >= @start');
    }

    if (end) {
      params.end = end;
      where.push('o.captured_at < @end');
    }

    if (loc) {
      params.loc = loc;
      where.push('o.loc = @loc');
    }

    if (conf) {
      params.conf = conf;
      where.push('o.conf = @conf');
    }

    if (hasText === true) {
      where.push('EXISTS (SELECT 1 FROM observation_text ot WHERE ot.observation_id = o.id)');
    }

    if (hasText === false) {
      where.push('NOT EXISTS (SELECT 1 FROM observation_text ot WHERE ot.observation_id = o.id)');
    }

    return {
      clause: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '',
      params
    };
  };

  return {
    init: async () => {
      createSchema({ db });
    },

    close: async () => {
      db.close();
    },

    health: async () => {
      db.prepare('SELECT 1 AS ok').get();
      return true;
    },

    listCameras: async () => {
      return db
        .prepare('SELECT * FROM cameras ORDER BY camera_id ASC')
        .all()
        .map((row) => normalizeCameraRow({ row }));
    },

    getCameraByCameraId: async ({ cameraId }) => {
      return normalizeCameraRow({
        row: db.prepare('SELECT * FROM cameras WHERE camera_id = ?').get(cameraId)
      });
    },

    upsertCamera: async ({ camera }) => {
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO cameras (camera_id, name, description, enabled, created_at, updated_at)
        VALUES (@camera_id, @name, @description, @enabled, @created_at, @updated_at)
        ON CONFLICT(camera_id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          enabled = excluded.enabled,
          updated_at = excluded.updated_at
      `).run({
        camera_id: camera.camera_id,
        name: camera.name,
        description: camera.description ?? null,
        enabled: camera.enabled ? 1 : 0,
        created_at: now,
        updated_at: now
      });

      return normalizeCameraRow({
        row: db.prepare('SELECT * FROM cameras WHERE camera_id = ?').get(camera.camera_id)
      });
    },

    createFrame: async ({ frame }) => {
      const createdAt = new Date().toISOString();
      const result = db.prepare(`
        INSERT INTO frames (
          camera_id,
          captured_at,
          received_at,
          image_path,
          thumbnail_path,
          preview_path,
          width,
          height,
          ollama_model,
          ollama_duration_ms,
          analysis_status,
          error,
          raw_response_json,
          created_at
        )
        VALUES (
          @camera_id,
          @captured_at,
          @received_at,
          @image_path,
          @thumbnail_path,
          @preview_path,
          @width,
          @height,
          @ollama_model,
          @ollama_duration_ms,
          @analysis_status,
          @error,
          @raw_response_json,
          @created_at
        )
      `).run({
        ...frame,
        raw_response_json: stringifyJsonValue({ value: frame.raw_response_json }),
        created_at: createdAt
      });

      return createFrameFromRow({
        row: db.prepare('SELECT * FROM frames WHERE id = ?').get(result.lastInsertRowid)
      });
    },

    updateFrame: async ({ frameId, updates }) => {
      const normalized = normalizeFrameUpdates({ updates });
      const entries = Object.entries(normalized);

      if (entries.length > 0) {
        const setSql = entries.map(([key]) => `${key} = @${key}`).join(', ');

        db.prepare(`UPDATE frames SET ${setSql} WHERE id = @id`).run({
          id: frameId,
          ...normalized
        });
      }

      return createFrameFromRow({
        row: db.prepare('SELECT * FROM frames WHERE id = ?').get(frameId)
      });
    },

    getFrame: async ({ frameId }) => {
      return createFrameFromRow({
        row: db.prepare('SELECT * FROM frames WHERE id = ?').get(frameId)
      });
    },

    deleteObservationsForFrame: async ({ frameId }) => {
      deleteObservations({ frameId });
    },

    replaceObservationsForFrame: async ({ frameId, cameraId, capturedAt, items }) => {
      return replaceObservations({ frameId, cameraId, capturedAt, items });
    },

    getObservationsForFrame: async ({ frameId }) => {
      return db
        .prepare('SELECT * FROM observations WHERE frame_id = ? ORDER BY id ASC')
        .all(frameId)
        .map((row) => createObservationFromRow({ row }));
    },

    getPreviousObservations: async ({ cameraId, capturedAt, maxAgeSeconds }) => {
      const params = {
        camera_id: cameraId,
        captured_at: capturedAt
      };
      const ageClause = maxAgeSeconds > 0
        ? 'AND captured_at >= @min_captured_at'
        : '';

      if (maxAgeSeconds > 0) {
        params.min_captured_at = new Date(new Date(capturedAt).getTime() - (maxAgeSeconds * 1000)).toISOString();
      }

      const previousFrame = db.prepare(`
        SELECT *
        FROM frames
        WHERE camera_id = @camera_id
        AND captured_at < @captured_at
        AND analysis_status = 'complete'
        ${ageClause}
        ORDER BY captured_at DESC, id DESC
        LIMIT 1
      `).get(params);

      if (!previousFrame) {
        return [];
      }

      return db
        .prepare('SELECT * FROM observations WHERE frame_id = ? ORDER BY id ASC')
        .all(previousFrame.id)
        .map((row) => createObservationFromRow({ row }));
    },

    listDays: async ({ cameraId }) => {
      const cameraClause = cameraId ? 'WHERE f.camera_id = @camera_id' : '';
      const thumbnailCameraClause = cameraId ? 'AND fx.camera_id = @camera_id' : '';

      return db.prepare(`
        SELECT
          substr(f.captured_at, 1, 10) AS date,
          COUNT(DISTINCT f.id) AS frame_count,
          COUNT(o.id) AS observation_count,
          MIN(f.captured_at) AS first_frame_at,
          MAX(f.captured_at) AS last_frame_at,
          (
            SELECT fx.id
            FROM frames fx
            WHERE substr(fx.captured_at, 1, 10) = substr(f.captured_at, 1, 10)
            ${thumbnailCameraClause}
            ORDER BY fx.captured_at DESC, fx.id DESC
            LIMIT 1
          ) AS thumbnail_frame_id
        FROM frames f
        LEFT JOIN observations o ON o.frame_id = f.id
        ${cameraClause}
        GROUP BY substr(f.captured_at, 1, 10)
        ORDER BY date DESC
      `).all(cameraId ? { camera_id: cameraId } : {}).map((row) => {
        return {
          date: row.date,
          frame_count: Number(row.frame_count),
          observation_count: Number(row.observation_count),
          first_frame_at: row.first_frame_at,
          last_frame_at: row.last_frame_at,
          thumbnail_frame_id: row.thumbnail_frame_id === null ? null : Number(row.thumbnail_frame_id)
        };
      });
    },

    listFrames: async ({ start, end, cameraId, limit, offset, includeItems, order = 'ASC' }) => {
      const where = ['f.captured_at >= @start', 'f.captured_at < @end'];
      const params = { start, end, limit, offset };
      const direction = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

      if (cameraId) {
        where.push('f.camera_id = @camera_id');
        params.camera_id = cameraId;
      }

      let frames = db.prepare(`
        SELECT
          f.*,
          (SELECT COUNT(*) FROM observations o WHERE o.frame_id = f.id) AS item_count
        FROM frames f
        WHERE ${where.join(' AND ')}
        ORDER BY f.captured_at ${direction}, f.id ${direction}
        LIMIT @limit OFFSET @offset
      `).all(params).map((row) => createFrameFromRow({ row }));

      if (includeItems) {
        frames = addItemsToFrames({ db, frames });
      }

      return frames;
    },

    listFramesForRetention: async ({ before, limit, offset }) => {
      return db.prepare(`
        SELECT *
        FROM frames
        WHERE captured_at < @before
        ORDER BY captured_at ASC, id ASC
        LIMIT @limit OFFSET @offset
      `).all({ before, limit, offset }).map((row) => createFrameFromRow({ row }));
    },

    searchObservations: async ({ q, cameraId, start, end, loc, conf, hasText, limit, offset }) => {
      const filters = buildObservationFilters({ q, cameraId, start, end, loc, conf, hasText });

      return db.prepare(`
        SELECT o.*
        FROM observations o
        ${filters.clause}
        ORDER BY o.captured_at DESC, o.id DESC
        LIMIT @limit OFFSET @offset
      `).all({
        ...filters.params,
        limit,
        offset
      }).map((row) => createObservationFromRow({ row }));
    },

    searchText: async ({ q, cameraId, start, end, limit, offset }) => {
      const where = [];
      const params = { limit, offset };

      if (q) {
        params.pattern = `%${q.toLowerCase()}%`;
        where.push('lower(ot.value) LIKE @pattern');
      }

      if (cameraId) {
        params.camera_id = cameraId;
        where.push('ot.camera_id = @camera_id');
      }

      if (start) {
        params.start = start;
        where.push('ot.captured_at >= @start');
      }

      if (end) {
        params.end = end;
        where.push('ot.captured_at < @end');
      }

      const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

      return db.prepare(`
        SELECT
          ot.*,
          o.name,
          o.loc,
          o.box_x,
          o.box_y,
          o.box_w,
          o.box_h
        FROM observation_text ot
        JOIN observations o ON o.id = ot.observation_id
        ${clause}
        ORDER BY ot.captured_at DESC, ot.id DESC
        LIMIT @limit OFFSET @offset
      `).all(params).map((row) => {
        return {
          text: normalizeObservationTextRow({ row }),
          item: {
            name: row.name,
            loc: row.loc,
            box: {
              x: Number(row.box_x),
              y: Number(row.box_y),
              w: Number(row.box_w),
              h: Number(row.box_h)
            }
          }
        };
      });
    },

    listObservationNames: async ({ cameraId, start, end }) => {
      const where = [];
      const params = {};

      if (cameraId) {
        params.camera_id = cameraId;
        where.push('camera_id = @camera_id');
      }

      if (start) {
        params.start = start;
        where.push('captured_at >= @start');
      }

      if (end) {
        params.end = end;
        where.push('captured_at < @end');
      }

      const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

      return db.prepare(`
        SELECT name, COUNT(*) AS count
        FROM observations
        ${clause}
        GROUP BY name
        ORDER BY count DESC, name ASC
      `).all(params).map((row) => {
        return {
          name: row.name,
          count: Number(row.count)
        };
      });
    }
  };
};

module.exports = {
  createSqliteDb
};
