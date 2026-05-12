'use strict';

const { assert, assertIncludesSubset } = require('../support/assertions');

module.exports = {
  name: 'GET/POST /api/cameras',
  run: async ({ api, state }) => {
    const initial = await api.expectJson({
      path: '/api/cameras'
    });

    assert.deepEqual(initial, { cameras: [] }, 'database should start empty');

    const input = {
      camera_id: state.frontDoorCameraId,
      name: 'Front Door',
      description: 'E2E front door camera',
      enabled: true
    };
    const created = await api.expectJson({
      method: 'POST',
      path: '/api/cameras',
      body: input
    });

    assert.equal(created.ok, true);
    assertIncludesSubset({
      actual: created.camera,
      expected: input
    });

    const listed = await api.expectJson({
      path: '/api/cameras'
    });

    assert.equal(listed.cameras.length, 1);
    assertIncludesSubset({
      actual: listed.cameras[0],
      expected: input
    });
  }
};
