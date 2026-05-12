'use strict';

const { assertStructuredError } = require('../support/assertions');

const cases = [
  {
    name: 'invalidJson',
    errorKey: 'OLLAMA_JSON_INVALID'
  },
  {
    name: 'missingContent',
    errorKey: 'OLLAMA_CONTENT_MISSING'
  },
  {
    name: 'invalidObservation',
    errorKey: 'OBSERVATION_NAME_MISSING'
  },
  {
    name: 'httpFail',
    errorKey: 'OLLAMA_HTTP_FAILED'
  }
];

module.exports = {
  name: 'POST /api/analyse/path failure modes',
  run: async ({ api, errors, fixtures }) => {
    for (const [index, testCase] of cases.entries()) {
      const response = await api.request({
        method: 'POST',
        path: '/api/analyse/path',
        body: {
          camera_id: 'error_fixtures',
          captured_at: new Date(Date.UTC(2025, 0, 5, 0, 0, index)).toISOString(),
          path: fixtures.errorPathsInApi[testCase.name]
        }
      });

      assertStructuredError({
        response,
        status: 502,
        errorKey: testCase.errorKey,
        errors
      });
    }
  }
};
