'use strict';

const { Pool } = require('pg');

const { wrapError } = require('../errors');

const {
  normalizeCameraRow,
  normalizeFrameRow,
  normalizeObservationRow,
  normalizeObservationTextRow
} = require('./records');

const createParamBuilder = () => {
  const values = [];

  return {
    add: (value) => {
      values.push(value);
      return `$${values.length}`;
    },
    values
  };
};

const createSchema = async ({ pool }) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cameras (
      id BIGSERIAL PRIMARY KEY,
      camera_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS frames (
      id BIGSERIAL PRIMARY KEY,
      camera_id TEXT NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL,
      received_at TIMESTAMPTZ NOT NULL,
      image_path TEXT NOT NULL,
      thumbnail_path TEXT,
      preview_path TEXT,
      width INTEGER,
      height INTEGER,
      ollama_model TEXT NOT NULL,
      ollama_duration_ms INTEGER,
      analysis_status TEXT NOT NULL,
      error TEXT,
      raw_response_json JSONB,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS observations (
      id BIGSERIAL PRIMARY KEY,
      frame_id BIGINT NOT NULL REFERENCES frames(id) ON DELETE CASCADE,
      camera_id TEXT NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL,
      name TEXT NOT NULL,
      loc TEXT NOT NULL,
      conf TEXT NOT NULL,
      box_x INTEGER NOT NULL,
      box_y INTEGER NOT NULL,
      box_w INTEGER NOT NULL,
      box_h INTEGER NOT NULL,
      text_json JSONB,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS observation_text (
      id BIGSERIAL PRIMARY KEY,
      observation_id BIGINT NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
      frame_id BIGINT NOT NULL REFERENCES frames(id) ON DELETE CASCADE,
      camera_id TEXT NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL,
      value TEXT NOT NULL,
      conf TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS derived_events (
      id BIGSERIAL PRIMARY KEY,
      camera_id TEXT NOT NULL,
      start_frame_id BIGINT NOT NULL,
      end_frame_id BIGINT,
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ,
      event_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      confidence TEXT NOT NULL,
      data_json JSONB,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_frames_camera_captured ON frames(camera_id, captured_at DESC);
    CREATE INDEX IF NOT EXISTS idx_frames_captured ON frames(captured_at DESC);
    CREATE INDEX IF NOT EXISTS idx_observations_camera_captured ON observations(camera_id, captured_at DESC);
    CREATE INDEX IF NOT EXISTS idx_observations_name ON observations(name);
    CREATE INDEX IF NOT EXISTS idx_observations_loc ON observations(loc);
    CREATE INDEX IF NOT EXISTS idx_observation_text_value ON observation_text(value);
    CREATE INDEX IF NOT EXISTS idx_observation_text_camera_captured ON observation_text(camera_id, captured_at DESC);
  `);
};

const addItemsToFrames = async ({ pool, frames }) => {
  if (frames.length === 0) {
    return frames;
  }

  const ids = frames.map((frame) => frame.id);
  const result = await pool.query(
    'SELECT * FROM observations WHERE frame_id = ANY($1::bigint[]) ORDER BY frame_id ASC, id ASC',
    [ids]
  );
  const observationsByFrame = new Map();

  for (const row of result.rows) {
    const observation = normalizeObservationRow({ row });
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

const buildObservationFilters = ({ q, cameraId, start, end, loc, conf, hasText }) => {
  const params = createParamBuilder();
  const where = [];

  if (q) {
    const pattern = params.add(`%${q}%`);
    where.push(`(
      o.name ILIKE ${pattern}
      OR EXISTS (
        SELECT 1 FROM observation_text ot
        WHERE ot.observation_id = o.id
        AND ot.value ILIKE ${pattern}
      )
    )`);
  }

  if (cameraId) {
    where.push(`o.camera_id = ${params.add(cameraId)}`);
  }

  if (start) {
    where.push(`o.captured_at >= ${params.add(start)}`);
  }

  if (end) {
    where.push(`o.captured_at < ${params.add(end)}`);
  }

  if (loc) {
    where.push(`o.loc = ${params.add(loc)}`);
  }

  if (conf) {
    where.push(`o.conf = ${params.add(conf)}`);
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

const createPostgresDb = ({ databaseUrl }) => {
  if (!databaseUrl) {
    throw wrapError({
      caller: 'db::postgres::createPostgresDb',
      reason: 'DATABASE_URL is required when DB_DRIVER=postgres',
      errorKey: 'CONFIG_POSTGRES_URL_REQUIRED'
    });
  }

  const pool = new Pool({ connectionString: databaseUrl });

  return {
    init: async () => {
      await createSchema({ pool });
    },

    close: async () => {
      await pool.end();
    },

    health: async () => {
      await pool.query('SELECT 1 AS ok');
      return true;
    },

    listCameras: async () => {
      const result = await pool.query('SELECT * FROM cameras ORDER BY camera_id ASC');

      return result.rows.map((row) => normalizeCameraRow({ row }));
    },

    getCameraByCameraId: async ({ cameraId }) => {
      const result = await pool.query('SELECT * FROM cameras WHERE camera_id = $1', [cameraId]);

      return normalizeCameraRow({ row: result.rows[0] });
    },

    upsertCamera: async ({ camera }) => {
      const now = new Date().toISOString();
      const result = await pool.query(`
        INSERT INTO cameras (camera_id, name, description, enabled, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $5)
        ON CONFLICT(camera_id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          enabled = excluded.enabled,
          updated_at = excluded.updated_at
        RETURNING *
      `, [
        camera.camera_id,
        camera.name,
        camera.description ?? null,
        Boolean(camera.enabled),
        now
      ]);

      return normalizeCameraRow({ row: result.rows[0] });
    },

    createFrame: async ({ frame }) => {
      const createdAt = new Date().toISOString();
      const result = await pool.query(`
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `, [
        frame.camera_id,
        frame.captured_at,
        frame.received_at,
        frame.image_path,
        frame.thumbnail_path,
        frame.preview_path,
        frame.width,
        frame.height,
        frame.ollama_model,
        frame.ollama_duration_ms,
        frame.analysis_status,
        frame.error,
        frame.raw_response_json,
        createdAt
      ]);

      return normalizeFrameRow({ row: result.rows[0] });
    },

    updateFrame: async ({ frameId, updates }) => {
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
      const params = createParamBuilder();
      const setSql = [];

      for (const [key, value] of Object.entries(updates)) {
        if (!allowed.has(key)) {
          continue;
        }

        setSql.push(`${key} = ${params.add(value)}`);
      }

      if (setSql.length === 0) {
        const result = await pool.query('SELECT * FROM frames WHERE id = $1', [frameId]);

        return normalizeFrameRow({ row: result.rows[0] });
      }

      const idParam = params.add(frameId);
      const result = await pool.query(`
        UPDATE frames
        SET ${setSql.join(', ')}
        WHERE id = ${idParam}
        RETURNING *
      `, params.values);

      return normalizeFrameRow({ row: result.rows[0] });
    },

    getFrame: async ({ frameId }) => {
      const result = await pool.query('SELECT * FROM frames WHERE id = $1', [frameId]);

      return normalizeFrameRow({ row: result.rows[0] });
    },

    deleteObservationsForFrame: async ({ frameId }) => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM observation_text WHERE frame_id = $1', [frameId]);
        await client.query('DELETE FROM observations WHERE frame_id = $1', [frameId]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    replaceObservationsForFrame: async ({ frameId, cameraId, capturedAt, items }) => {
      const client = await pool.connect();
      const createdAt = new Date().toISOString();
      const inserted = [];

      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM observation_text WHERE frame_id = $1', [frameId]);
        await client.query('DELETE FROM observations WHERE frame_id = $1', [frameId]);

        for (const item of items) {
          const result = await client.query(`
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
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
          `, [
            frameId,
            cameraId,
            capturedAt,
            item.name,
            item.loc,
            item.conf,
            item.box.x,
            item.box.y,
            item.box.w,
            item.box.h,
            item.text ?? null,
            createdAt
          ]);
          const observation = normalizeObservationRow({ row: result.rows[0] });

          if (item.text) {
            for (const text of item.text) {
              await client.query(`
                INSERT INTO observation_text (
                  observation_id,
                  frame_id,
                  camera_id,
                  captured_at,
                  value,
                  conf,
                  created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
              `, [
                observation.id,
                frameId,
                cameraId,
                capturedAt,
                text.v,
                text.conf,
                createdAt
              ]);
            }
          }

          inserted.push(observation);
        }

        await client.query('COMMIT');
        return inserted;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    getObservationsForFrame: async ({ frameId }) => {
      const result = await pool.query('SELECT * FROM observations WHERE frame_id = $1 ORDER BY id ASC', [frameId]);

      return result.rows.map((row) => normalizeObservationRow({ row }));
    },

    getPreviousObservations: async ({ cameraId, capturedAt, maxAgeSeconds }) => {
      const params = createParamBuilder();
      const where = [
        `camera_id = ${params.add(cameraId)}`,
        `captured_at < ${params.add(capturedAt)}`,
        "analysis_status = 'complete'"
      ];

      if (maxAgeSeconds > 0) {
        where.push(`captured_at >= ${params.add(new Date(new Date(capturedAt).getTime() - (maxAgeSeconds * 1000)).toISOString())}`);
      }

      const frameResult = await pool.query(`
        SELECT *
        FROM frames
        WHERE ${where.join(' AND ')}
        ORDER BY captured_at DESC, id DESC
        LIMIT 1
      `, params.values);
      const previousFrame = normalizeFrameRow({ row: frameResult.rows[0] });

      if (!previousFrame) {
        return [];
      }

      const observationResult = await pool.query(
        'SELECT * FROM observations WHERE frame_id = $1 ORDER BY id ASC',
        [previousFrame.id]
      );

      return observationResult.rows.map((row) => normalizeObservationRow({ row }));
    },

    listDays: async ({ cameraId }) => {
      const params = createParamBuilder();
      const cameraClause = cameraId ? `WHERE fd.camera_id = ${params.add(cameraId)}` : '';
      const thumbnailCameraClause = cameraId ? `AND fx.camera_id = ${params.add(cameraId)}` : '';
      const result = await pool.query(`
        WITH frame_days AS (
          SELECT
            f.*,
            to_char(f.captured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day
          FROM frames f
        )
        SELECT
          fd.day AS date,
          COUNT(DISTINCT fd.id) AS frame_count,
          COUNT(o.id) AS observation_count,
          MIN(fd.captured_at) AS first_frame_at,
          MAX(fd.captured_at) AS last_frame_at,
          (
            SELECT fx.id
            FROM frames fx
            WHERE to_char(fx.captured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') = fd.day
            ${thumbnailCameraClause}
            ORDER BY fx.captured_at DESC, fx.id DESC
            LIMIT 1
          ) AS thumbnail_frame_id
        FROM frame_days fd
        LEFT JOIN observations o ON o.frame_id = fd.id
        ${cameraClause}
        GROUP BY fd.day
        ORDER BY fd.day DESC
      `, params.values);

      return result.rows.map((row) => {
        return {
          date: row.date,
          frame_count: Number(row.frame_count),
          observation_count: Number(row.observation_count),
          first_frame_at: row.first_frame_at.toISOString(),
          last_frame_at: row.last_frame_at.toISOString(),
          thumbnail_frame_id: row.thumbnail_frame_id === null ? null : Number(row.thumbnail_frame_id)
        };
      });
    },

    listFrames: async ({ start, end, cameraId, limit, offset, includeItems, order = 'ASC' }) => {
      const params = createParamBuilder();
      const where = [
        `f.captured_at >= ${params.add(start)}`,
        `f.captured_at < ${params.add(end)}`
      ];
      const direction = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

      if (cameraId) {
        where.push(`f.camera_id = ${params.add(cameraId)}`);
      }

      const limitParam = params.add(limit);
      const offsetParam = params.add(offset);
      const result = await pool.query(`
        SELECT
          f.*,
          (SELECT COUNT(*) FROM observations o WHERE o.frame_id = f.id) AS item_count
        FROM frames f
        WHERE ${where.join(' AND ')}
        ORDER BY f.captured_at ${direction}, f.id ${direction}
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `, params.values);
      let frames = result.rows.map((row) => normalizeFrameRow({ row }));

      if (includeItems) {
        frames = await addItemsToFrames({ pool, frames });
      }

      return frames;
    },

    listFramesForRetention: async ({ before, limit, offset }) => {
      const result = await pool.query(`
        SELECT *
        FROM frames
        WHERE captured_at < $1
        ORDER BY captured_at ASC, id ASC
        LIMIT $2 OFFSET $3
      `, [before, limit, offset]);

      return result.rows.map((row) => normalizeFrameRow({ row }));
    },

    searchObservations: async ({ q, cameraId, start, end, loc, conf, hasText, limit, offset }) => {
      const filters = buildObservationFilters({ q, cameraId, start, end, loc, conf, hasText });
      const limitParam = filters.params.add(limit);
      const offsetParam = filters.params.add(offset);
      const result = await pool.query(`
        SELECT o.*
        FROM observations o
        ${filters.clause}
        ORDER BY o.captured_at DESC, o.id DESC
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `, filters.params.values);

      return result.rows.map((row) => normalizeObservationRow({ row }));
    },

    searchText: async ({ q, cameraId, start, end, limit, offset }) => {
      const params = createParamBuilder();
      const where = [];

      if (q) {
        where.push(`ot.value ILIKE ${params.add(`%${q}%`)}`);
      }

      if (cameraId) {
        where.push(`ot.camera_id = ${params.add(cameraId)}`);
      }

      if (start) {
        where.push(`ot.captured_at >= ${params.add(start)}`);
      }

      if (end) {
        where.push(`ot.captured_at < ${params.add(end)}`);
      }

      const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const limitParam = params.add(limit);
      const offsetParam = params.add(offset);
      const result = await pool.query(`
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
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `, params.values);

      return result.rows.map((row) => {
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
      const params = createParamBuilder();
      const where = [];

      if (cameraId) {
        where.push(`camera_id = ${params.add(cameraId)}`);
      }

      if (start) {
        where.push(`captured_at >= ${params.add(start)}`);
      }

      if (end) {
        where.push(`captured_at < ${params.add(end)}`);
      }

      const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const result = await pool.query(`
        SELECT name, COUNT(*) AS count
        FROM observations
        ${clause}
        GROUP BY name
        ORDER BY count DESC, name ASC
      `, params.values);

      return result.rows.map((row) => {
        return {
          name: row.name,
          count: Number(row.count)
        };
      });
    }
  };
};

module.exports = {
  createPostgresDb
};
