'use strict';

const express = require('express');

const { createHttpError } = require('../httpError');
const { normalizeCameraId } = require('../services/frameService');
const { asyncRoute } = require('./helpers');

const toPublicCamera = ({ camera }) => {
  return {
    camera_id: camera.camera_id,
    name: camera.name,
    description: camera.description,
    enabled: camera.enabled
  };
};

const createCamerasRouter = ({ db }) => {
  const router = express.Router();

  router.get('/', asyncRoute({
    handler: async ({ res }) => {
      const cameras = await db.listCameras();

      res.json({
        cameras: cameras.map((camera) => toPublicCamera({ camera }))
      });
    }
  }));

  router.post('/', asyncRoute({
    handler: async ({ req, res }) => {
      const cameraId = normalizeCameraId({ cameraId: req.body?.camera_id });
      const name = String(req.body?.name ?? cameraId).trim();

      if (!name) {
        throw createHttpError({
          status: 400,
          message: 'Camera name is required',
          errorKey: 'VALIDATION_CAMERA_NAME_REQUIRED',
          caller: 'routes::cameras::upsert'
        });
      }

      const camera = await db.upsertCamera({
        camera: {
          camera_id: cameraId,
          name,
          description: req.body?.description ?? null,
          enabled: req.body?.enabled ?? true
        }
      });

      res.json({
        ok: true,
        camera: toPublicCamera({ camera })
      });
    }
  }));

  return router;
};

module.exports = {
  createCamerasRouter
};
