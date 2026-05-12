'use strict';

const fs = require('fs');

const { assert } = require('../support/assertions');

const expectedItems = [
  {
    name: 'blue car',
    loc: 'center',
    conf: 'high',
    box: { x: 10, y: 10, w: 50, h: 30 }
  },
  {
    name: 'license plate',
    loc: 'bottom-center',
    conf: 'medium',
    box: { x: 22, y: 36, w: 16, h: 6 },
    text: [{ v: 'E2E-2048', conf: 'high' }]
  }
];

module.exports = {
  name: 'POST /api/analyse/upload',
  run: async ({ api, fixtures, state }) => {
    const capturedAt = '2025-01-03T04:05:06.000Z';
    const imageBytes = Buffer.from(fs.readFileSync(fixtures.uploadPngBase64Path, 'utf8').trim(), 'base64');
    const input = new FormData();

    input.set('camera_id', state.drivewayCameraId);
    input.set('captured_at', capturedAt);
    input.set('image', new Blob([imageBytes], { type: 'image/png' }), 'driveway.png');

    const response = await api.request({
      method: 'POST',
      path: '/api/analyse/upload',
      body: input
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.camera_id, state.drivewayCameraId);
    assert.equal(response.body.captured_at, capturedAt);
    assert.equal(typeof response.body.frame_id, 'number');
    assert.deepEqual(response.body.items, expectedItems);

    state.uploadFrameId = response.body.frame_id;
    state.uploadCapturedAt = response.body.captured_at;
    state.uploadExpectedItems = expectedItems;
  }
};
