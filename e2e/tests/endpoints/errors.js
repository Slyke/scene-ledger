'use strict';

const { assertStructuredError } = require('../support/assertions');

const assertErrorResponse = async ({ api, errors, request, status, errorKey }) => {
  const response = await api.request(request);

  assertStructuredError({
    response,
    status,
    errorKey,
    errors
  });
};

module.exports = {
  name: 'structured errors',
  run: async ({ api, errors }) => {
    await assertErrorResponse({
      api,
      errors,
      request: {
        path: '/api/not-a-route'
      },
      status: 404,
      errorKey: 'APP_NOT_FOUND'
    });

    await assertErrorResponse({
      api,
      errors,
      request: {
        method: 'POST',
        path: '/api/cameras',
        body: {
          camera_id: '',
          name: 'Invalid'
        }
      },
      status: 400,
      errorKey: 'VALIDATION_CAMERA_ID_INVALID'
    });

    await assertErrorResponse({
      api,
      errors,
      request: {
        method: 'POST',
        path: '/api/cameras',
        body: {
          camera_id: 'valid_camera',
          name: '   '
        }
      },
      status: 400,
      errorKey: 'VALIDATION_CAMERA_NAME_REQUIRED'
    });

    await assertErrorResponse({
      api,
      errors,
      request: {
        path: '/api/frames/not-a-number'
      },
      status: 400,
      errorKey: 'VALIDATION_FRAME_ID_INVALID'
    });

    await assertErrorResponse({
      api,
      errors,
      request: {
        path: '/api/search',
        query: {
          has_text: 'sometimes'
        }
      },
      status: 400,
      errorKey: 'VALIDATION_BOOLEAN_QUERY_INVALID'
    });

    await assertErrorResponse({
      api,
      errors,
      request: {
        path: '/api/search',
        query: {
          cursor: 'not-a-valid-cursor'
        }
      },
      status: 400,
      errorKey: 'VALIDATION_CURSOR_INVALID'
    });

    await assertErrorResponse({
      api,
      errors,
      request: {
        path: '/api/search',
        query: {
          loc: 'somewhere'
        }
      },
      status: 400,
      errorKey: 'OBSERVATION_LOC_INVALID'
    });

    await assertErrorResponse({
      api,
      errors,
      request: {
        path: '/api/search',
        query: {
          conf: 'certain'
        }
      },
      status: 400,
      errorKey: 'OBSERVATION_CONF_INVALID'
    });

    await assertErrorResponse({
      api,
      errors,
      request: {
        path: '/api/timeline/day',
        query: {
          date: '2025-99-99'
        }
      },
      status: 400,
      errorKey: 'VALIDATION_DATE_INVALID'
    });

    await assertErrorResponse({
      api,
      errors,
      request: {
        path: '/api/timeline/range',
        query: {
          start: '2025-01-04T00:00:10.000Z',
          end: '2025-01-04T00:00:00.000Z'
        }
      },
      status: 400,
      errorKey: 'VALIDATION_DATETIME_INVALID'
    });

    await assertErrorResponse({
      api,
      errors,
      request: {
        method: 'POST',
        path: '/api/analyse/path',
        body: {
          camera_id: 'front_door',
          captured_at: '2025-01-06T00:00:00.000Z'
        }
      },
      status: 400,
      errorKey: 'IMAGE_PATH_REQUIRED'
    });

    await assertErrorResponse({
      api,
      errors,
      request: {
        method: 'POST',
        path: '/api/analyse/path',
        body: {
          camera_id: 'front_door',
          captured_at: '2025-01-06T00:00:01.000Z',
          path: 'front-door.svg'
        }
      },
      status: 400,
      errorKey: 'IMAGE_PATH_NOT_ABSOLUTE'
    });

    await assertErrorResponse({
      api,
      errors,
      request: {
        method: 'POST',
        path: '/api/analyse/path',
        body: {
          camera_id: 'front_door',
          captured_at: '2025-01-06T00:00:02.000Z',
          path: '/app/images/missing.svg'
        }
      },
      status: 404,
      errorKey: 'IMAGE_FILE_UNAVAILABLE'
    });

    await assertErrorResponse({
      api,
      errors,
      request: {
        method: 'POST',
        path: '/api/analyse/path',
        body: {
          camera_id: 'front_door',
          captured_at: '2025-01-06T00:00:03.000Z',
          path: '/etc/hosts'
        }
      },
      status: 403,
      errorKey: 'IMAGE_PATH_OUTSIDE_ROOT'
    });

    await assertErrorResponse({
      api,
      errors,
      request: {
        method: 'POST',
        path: '/api/analyse/upload',
        body: {
          camera_id: 'front_door',
          captured_at: '2025-01-06T00:00:04.000Z'
        }
      },
      status: 400,
      errorKey: 'IMAGE_UPLOAD_MISSING'
    });

    const unsupportedUpload = new FormData();
    unsupportedUpload.set('camera_id', 'front_door');
    unsupportedUpload.set('captured_at', '2025-01-06T00:00:05.000Z');
    unsupportedUpload.set('image', new Blob([Buffer.from('not an image')], { type: 'text/plain' }), 'note.txt');

    await assertErrorResponse({
      api,
      errors,
      request: {
        method: 'POST',
        path: '/api/analyse/upload',
        body: unsupportedUpload
      },
      status: 400,
      errorKey: 'IMAGE_MIME_UNSUPPORTED'
    });
  }
};
