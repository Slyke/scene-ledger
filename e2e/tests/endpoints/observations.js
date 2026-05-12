'use strict';

const { assert } = require('../support/assertions');

module.exports = {
  name: 'GET /api/observations/*',
  run: async ({ api }) => {
    const names = await api.expectJson({
      path: '/api/observations/names'
    });
    assert.deepEqual(names.names, [
      { name: 'blue car', count: 1 },
      { name: 'delivery package', count: 1 },
      { name: 'license plate', count: 1 },
      { name: 'porch light', count: 1 }
    ]);

    const frontDoorNames = await api.expectJson({
      path: '/api/observations/names',
      query: {
        camera_id: 'front_door'
      }
    });
    assert.deepEqual(frontDoorNames.names, [
      { name: 'delivery package', count: 1 },
      { name: 'porch light', count: 1 }
    ]);

    const locations = await api.expectJson({
      path: '/api/observations/locations'
    });
    assert.ok(locations.locations.includes('center'));
    assert.ok(locations.locations.includes('bottom-center'));
    assert.ok(locations.locations.includes('top-right'));
  }
};
