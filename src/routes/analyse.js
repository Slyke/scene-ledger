'use strict';

const express = require('express');
const multer = require('multer');

const { createHttpError } = require('../httpError');
const { createAnalyseRateLimitMiddleware } = require('../middleware');
const { asyncRoute } = require('./helpers');

const createUploadMiddleware = ({ config }) => {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: config.images.maxImageBytes,
      files: 1
    }
  }).single('image');

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (!err) {
        next();
        return;
      }

      next(createHttpError({
        status: 400,
        message: err.message,
        errorKey: 'HTTP_UPLOAD_FAILED',
        caller: 'routes::analyse::uploadMiddleware',
        err
      }));
    });
  };
};

const createAnalyseRouter = ({ config, frameService }) => {
  const router = express.Router();
  const rateLimit = createAnalyseRateLimitMiddleware({ config });
  const upload = createUploadMiddleware({ config });

  router.post('/path', rateLimit, asyncRoute({
    handler: async ({ req, res }) => {
      const result = await frameService.analysePath({
        cameraId: req.body?.camera_id,
        capturedAt: req.body?.captured_at,
        imagePath: req.body?.path
      });

      res.status(result.ok ? 200 : 502).json(result);
    }
  }));

  router.post('/upload', rateLimit, upload, asyncRoute({
    handler: async ({ req, res }) => {
      const result = await frameService.analyseUpload({
        cameraId: req.body?.camera_id,
        capturedAt: req.body?.captured_at,
        file: req.file
      });

      res.status(result.ok ? 200 : 502).json(result);
    }
  }));

  return router;
};

module.exports = {
  createAnalyseRouter
};
