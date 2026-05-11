'use strict';

const express = require('express');

const { asyncRoute } = require('./helpers');

const createHealthRouter = ({ config, db }) => {
  const router = express.Router();

  router.get('/', asyncRoute({
    handler: async ({ res }) => {
      await db.health();

      res.json({
        ok: true,
        db: config.db.driver,
        ollama_url: config.ollama.url,
        ollama_model: config.ollama.model
      });
    }
  }));

  return router;
};

module.exports = {
  createHealthRouter
};
