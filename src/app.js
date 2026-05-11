'use strict';

const express = require('express');

const { config } = require('./config');
const { createDb } = require('./db');
const { createHttpError } = require('./httpError');
const { createErrorHandler, createAuthMiddleware } = require('./middleware');
const { createFrameService } = require('./services/frameService');
const { createHealthRouter } = require('./routes/health');
const { createCamerasRouter } = require('./routes/cameras');
const { createAnalyseRouter } = require('./routes/analyse');
const { createFramesRouter } = require('./routes/frames');
const { createTimelineRouter } = require('./routes/timeline');
const { createSearchRouter, createObservationsRouter } = require('./routes/search');

const createApp = async () => {
  const db = await createDb({ config });
  await db.init();

  const frameService = createFrameService({ config, db });
  const app = express();

  app.set('trust proxy', config.trustProxy);
  app.use('/api', createAuthMiddleware({ config }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/health', createHealthRouter({ config, db }));
  app.use('/api/cameras', createCamerasRouter({ db }));
  app.use('/api/analyse', createAnalyseRouter({ config, frameService }));
  app.use('/api/frames', createFramesRouter({ config, db, frameService }));
  app.use('/api/timeline', createTimelineRouter({ db }));
  app.use('/api/search', createSearchRouter({ db }));
  app.use('/api/observations', createObservationsRouter({ db }));

  app.use((req, res, next) => {
    next(createHttpError({
      status: 404,
      message: 'Not found',
      errorKey: 'APP_NOT_FOUND',
      caller: 'app::notFound',
      context: {
        method: req.method,
        path: req.path
      }
    }));
  });

  app.use(createErrorHandler());

  return { app, db };
};

module.exports = {
  createApp
};
