'use strict';

const fs = require('fs');
const path = require('path');

const { debugAndErrors } = require('./logger');

const ERROR_FILE_PATH = process.env.ERROR_FILE_PATH
  ? path.resolve(process.env.ERROR_FILE_PATH)
  : path.join(__dirname, 'errors.json');

const loadErrorCodeMap = () => {
  if (!fs.existsSync(ERROR_FILE_PATH)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(ERROR_FILE_PATH, 'utf8'));
};

const errorCodeMap = loadErrorCodeMap();

const { generateLog, generateError, wrapError } = debugAndErrors({
  settings: {
    logging: {
      sinks: {
        console: { enabled: true, format: 'text', levels: [] },
        file: { enabled: false, format: 'json', path: '', levels: [] },
        http: { enabled: false, url: '', method: 'POST', timeoutMs: 2500 }
      },
      kubernetes: { enabled: false }
    }
  },
  errorCodeMap
});

const createErrorDetails = ({ caller = 'unknown', reason, errorKey = 'ERR_UNKNOWN', context }) => {
  const details = {
    caller,
    reason,
    errorKey,
    errorCode: errorCodeMap[errorKey] ?? errorCodeMap.ERR_UNKNOWN ?? null
  };

  if (context !== undefined) {
    details.context = context;
  }

  return details;
};

module.exports = {
  createErrorDetails,
  generateError,
  generateLog,
  wrapError
};
