'use strict';

const { assert } = require('../support/assertions');

const expectedItems = [
  {
    name: 'delivery package',
    loc: 'bottom-center',
    conf: 'high',
    box: { x: 52, y: 35, w: 32, h: 16 },
    text: [{ v: 'UPS 42', conf: 'medium' }]
  },
  {
    name: 'porch light',
    loc: 'top-right',
    conf: 'medium',
    box: { x: 71, y: 11, w: 14, h: 14 }
  }
];

module.exports = {
  name: 'POST /api/analyse/path',
  run: async ({ api, fixtures, state }) => {
    const input = {
      camera_id: state.frontDoorCameraId,
      captured_at: '2025-01-02T03:04:05.000Z',
      path: fixtures.frontDoorPathInApi
    };
    const output = await api.expectJson({
      method: 'POST',
      path: '/api/analyse/path',
      body: input
    });

    assert.equal(output.ok, true);
    assert.equal(output.camera_id, input.camera_id);
    assert.equal(output.captured_at, input.captured_at);
    assert.equal(typeof output.frame_id, 'number');
    assert.deepEqual(output.items, expectedItems);

    state.pathFrameId = output.frame_id;
    state.pathCapturedAt = output.captured_at;
    state.pathExpectedItems = expectedItems;
  }
};
