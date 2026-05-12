'use strict';

const { assert } = require('../support/assertions');

module.exports = {
  name: 'GET /api/health',
  run: async ({ api }) => {
    const output = await api.expectJson({
      path: '/api/health'
    });

    assert.deepEqual(output, {
      ok: true,
      db: 'sqlite',
      ollama_url: 'http://ollama-mock:11434/api/chat',
      ollama_model: 'e2e-vision-model'
    });
  }
};
