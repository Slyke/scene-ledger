'use strict';

const { assert } = require('../support/assertions');

const frameIds = ({ results }) => {
  return results.map((result) => result.frame_id);
};

module.exports = {
  name: 'GET /api/search and /api/search/text',
  run: async ({ api, state }) => {
    const byObjectName = await api.expectJson({
      path: '/api/search',
      query: { q: 'package' }
    });
    assert.deepEqual(frameIds({ results: byObjectName.results }), [state.pathFrameId]);
    assert.equal(byObjectName.results[0].matched.name, 'delivery package');

    const byObservationText = await api.expectJson({
      path: '/api/search',
      query: { q: 'UPS', has_text: true }
    });
    assert.deepEqual(frameIds({ results: byObservationText.results }), [state.pathFrameId]);
    assert.equal(byObservationText.results[0].matched.name, 'delivery package');

    const byCameraLocConf = await api.expectJson({
      path: '/api/search',
      query: {
        camera_id: state.drivewayCameraId,
        loc: 'center',
        conf: 'high'
      }
    });
    assert.deepEqual(frameIds({ results: byCameraLocConf.results }), [state.uploadFrameId]);
    assert.equal(byCameraLocConf.results[0].matched.name, 'blue car');

    const text = await api.expectJson({
      path: '/api/search/text',
      query: { q: 'E2E-2048' }
    });
    assert.deepEqual(frameIds({ results: text.results }), [state.uploadFrameId]);
    assert.equal(text.results[0].text.v, 'E2E-2048');
    assert.equal(text.results[0].item.name, 'license plate');

    const firstPage = await api.expectJson({
      path: '/api/search',
      query: { limit: 1 }
    });
    assert.equal(firstPage.results.length, 1);
    assert.equal(typeof firstPage.next_cursor, 'string');

    const secondPage = await api.expectJson({
      path: '/api/search',
      query: { limit: 1, cursor: firstPage.next_cursor }
    });
    assert.equal(secondPage.results.length, 1);
    assert.notEqual(secondPage.results[0].matched.name, firstPage.results[0].matched.name);
  }
};
