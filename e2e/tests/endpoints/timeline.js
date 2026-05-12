'use strict';

const { assert } = require('../support/assertions');

module.exports = {
  name: 'GET /api/timeline/*',
  run: async ({ api, state }) => {
    const days = await api.expectJson({
      path: '/api/timeline/days'
    });
    assert.deepEqual(days.days.map((day) => day.date), ['2025-01-03', '2025-01-02']);
    assert.deepEqual(days.days.map((day) => day.frame_count), [1, 1]);
    assert.deepEqual(days.days.map((day) => day.observation_count), [2, 2]);

    const day = await api.expectJson({
      path: '/api/timeline/day',
      query: {
        date: '2025-01-02',
        include_items: true
      }
    });
    assert.equal(day.frames.length, 1);
    assert.equal(day.frames[0].id, state.pathFrameId);
    assert.deepEqual(day.frames[0].items, state.pathExpectedItems.map((item) => {
      return {
        name: item.name,
        loc: item.loc,
        conf: item.conf
      };
    }));

    const range = await api.expectJson({
      path: '/api/timeline/range',
      query: {
        start: '2025-01-02T00:00:00.000Z',
        end: '2025-01-04T00:00:00.000Z',
        include_items: true
      }
    });
    assert.deepEqual(range.frames.map((frame) => frame.id), [state.pathFrameId, state.uploadFrameId]);

    const buckets = await api.expectJson({
      path: '/api/timeline/range',
      query: {
        start: '2025-01-02T00:00:00.000Z',
        end: '2025-01-04T00:00:00.000Z',
        mode: 'buckets',
        interval_seconds: 86400
      }
    });
    assert.equal(buckets.buckets.length, 2);
    assert.deepEqual(buckets.buckets.map((bucket) => bucket.frame_count), [1, 1]);
    assert.ok(buckets.buckets[0].top_items.includes('delivery package'));
    assert.ok(buckets.buckets[1].top_items.includes('blue car'));
  }
};
