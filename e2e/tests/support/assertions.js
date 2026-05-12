'use strict';

const assert = require('node:assert/strict');

const assertIncludesSubset = ({ actual, expected, message }) => {
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(actual[key], value, message ?? 'Expected field ' + key);
  }
};

const assertStructuredError = ({ response, status, errorKey, errors }) => {
  assert.equal(response.status, status);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.error_key, errorKey);
  assert.equal(response.body.error_code, errors.codeFor({ errorKey }));
};

module.exports = {
  assert,
  assertIncludesSubset,
  assertStructuredError
};
