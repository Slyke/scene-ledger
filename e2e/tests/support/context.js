'use strict';

const fs = require('fs');

const { createClient } = require('./client');

const isTruthy = ({ value }) => {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
};

const createErrors = ({ errorFilePath }) => {
  const codes = JSON.parse(fs.readFileSync(errorFilePath, 'utf8'));

  return {
    codeFor: ({ errorKey }) => {
      if (!codes[errorKey]) {
        throw new Error('Missing error key in errors.json: ' + errorKey);
      }

      return codes[errorKey];
    }
  };
};

const createContext = () => {
  const fixtureRoot = process.env.FIXTURE_ROOT ?? '/e2e/fixtures/images';

  return {
    api: createClient({
      baseUrl: process.env.API_BASE_URL ?? 'http://127.0.0.1:3000',
      verbose: isTruthy({ value: process.env.E2E_VERBOSE })
    }),
    errors: createErrors({ errorFilePath: process.env.ERROR_FILE_PATH ?? './src/errors.json' }),
    fixtures: {
      frontDoorPathInApi: '/app/images/front-door.svg',
      uploadPngBase64Path: fixtureRoot + '/driveway.png.base64',
      emptyScenePathInApi: '/app/images/sequence/empty-scene.svg',
      sequencePathsInApi: [
        '/app/images/sequence/yard-01.svg',
        '/app/images/sequence/yard-02.svg',
        '/app/images/sequence/yard-03.svg',
        '/app/images/sequence/yard-04.svg',
        '/app/images/sequence/yard-05.svg'
      ],
      errorPathsInApi: {
        invalidJson: '/app/images/errors/invalid-json.svg',
        missingContent: '/app/images/errors/missing-content.svg',
        invalidObservation: '/app/images/errors/invalid-observation.svg',
        httpFail: '/app/images/errors/http-fail.svg'
      }
    },
    state: {
      frontDoorCameraId: 'front_door',
      drivewayCameraId: 'driveway',
      sequenceCameraId: 'yard_sequence'
    },
    verbose: isTruthy({ value: process.env.E2E_VERBOSE })
  };
};

module.exports = {
  createContext
};
