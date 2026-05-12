'use strict';

const { assert } = require('../support/assertions');

const sequence = [
  {
    captured_at: '2025-01-04T00:00:00.000Z',
    items: [
      {
        name: 'courier',
        loc: 'center-left',
        conf: 'high',
        box: { x: 8, y: 18, w: 16, h: 34 }
      },
      {
        name: 'rolling cart',
        loc: 'center-right',
        conf: 'medium',
        box: { x: 66, y: 30, w: 20, h: 18 }
      },
      {
        name: 'gate sign',
        loc: 'top-center',
        conf: 'low',
        box: { x: 38, y: 8, w: 20, h: 10 },
        text: [{ v: 'G12', conf: 'low' }]
      }
    ]
  },
  {
    captured_at: '2025-01-04T00:00:02.000Z',
    items: [
      {
        name: 'courier',
        loc: 'center',
        conf: 'high',
        box: { x: 34, y: 18, w: 16, h: 34 }
      },
      {
        name: 'delivery package',
        loc: 'bottom-left',
        conf: 'medium',
        box: { x: 14, y: 48, w: 18, h: 12 }
      },
      {
        name: 'gate sign',
        loc: 'top-center',
        conf: 'medium',
        box: { x: 38, y: 8, w: 20, h: 10 },
        text: [{ v: 'Gate 1?', conf: 'medium' }]
      }
    ]
  },
  {
    captured_at: '2025-01-04T00:00:04.000Z',
    items: [
      {
        name: 'courier',
        loc: 'center-right',
        conf: 'high',
        box: { x: 62, y: 18, w: 16, h: 34 }
      },
      {
        name: 'gate sign',
        loc: 'top-center',
        conf: 'high',
        box: { x: 38, y: 8, w: 20, h: 10 },
        text: [{ v: 'Gate 12', conf: 'high' }]
      }
    ]
  },
  {
    captured_at: '2025-01-04T00:00:06.000Z',
    items: [
      {
        name: 'delivery package',
        loc: 'bottom-right',
        conf: 'high',
        box: { x: 62, y: 48, w: 18, h: 12 }
      },
      {
        name: 'gate sign',
        loc: 'top-center',
        conf: 'high',
        box: { x: 38, y: 8, w: 20, h: 10 },
        text: [{ v: 'Gate 12', conf: 'high' }]
      }
    ]
  },
  {
    captured_at: '2025-01-04T00:00:08.000Z',
    items: [
      {
        name: 'rolling cart',
        loc: 'bottom-center',
        conf: 'low',
        box: { x: 42, y: 44, w: 20, h: 18 }
      }
    ]
  }
];

const namesFor = ({ frame }) => {
  return frame.items.map((item) => item.name);
};

const itemNamed = ({ frame, name }) => {
  return frame.items.find((item) => item.name === name);
};

module.exports = {
  name: 'multi-frame scene sequence',
  run: async ({ api, fixtures, state }) => {
    state.sequenceFrameIds = [];
    state.sequenceExpectedItems = sequence.map((frame) => frame.items);

    for (const [index, frame] of sequence.entries()) {
      const output = await api.expectJson({
        method: 'POST',
        path: '/api/analyse/path',
        body: {
          camera_id: state.sequenceCameraId,
          captured_at: frame.captured_at,
          path: fixtures.sequencePathsInApi[index]
        }
      });

      assert.equal(output.ok, true);
      assert.equal(output.camera_id, state.sequenceCameraId);
      assert.equal(output.captured_at, frame.captured_at);
      assert.deepEqual(output.items, frame.items);
      state.sequenceFrameIds.push(output.frame_id);
    }

    const emptyScene = await api.expectJson({
      method: 'POST',
      path: '/api/analyse/path',
      body: {
        camera_id: state.sequenceCameraId,
        captured_at: '2025-01-04T00:00:10.000Z',
        path: fixtures.emptyScenePathInApi
      }
    });
    assert.equal(emptyScene.ok, true);
    assert.deepEqual(emptyScene.items, []);
    state.emptySceneFrameId = emptyScene.frame_id;

    const frames = [];
    for (const frameId of state.sequenceFrameIds) {
      frames.push(await api.expectJson({
        path: '/api/frames/' + frameId
      }));
    }

    assert.deepEqual(frames.map((frame) => itemNamed({ frame, name: 'courier' })?.box.x), [8, 34, 62, undefined, undefined]);
    assert.deepEqual(frames.map((frame) => itemNamed({ frame, name: 'courier' })?.loc), ['center-left', 'center', 'center-right', undefined, undefined]);
    assert.deepEqual(frames.map((frame) => namesFor({ frame }).includes('delivery package')), [false, true, false, true, false]);
    assert.deepEqual(frames.map((frame) => namesFor({ frame }).includes('rolling cart')), [true, false, false, false, true]);
    assert.deepEqual(frames.map((frame) => itemNamed({ frame, name: 'gate sign' })?.text?.[0]?.conf), ['low', 'medium', 'high', 'high', undefined]);

    const emptyPayload = await api.expectJson({
      path: '/api/frames/' + state.emptySceneFrameId
    });
    assert.equal(emptyPayload.frame.analysis_status, 'complete');
    assert.deepEqual(emptyPayload.items, []);

    const sequenceDay = await api.expectJson({
      path: '/api/timeline/day',
      query: {
        date: '2025-01-04',
        camera_id: state.sequenceCameraId,
        include_items: true,
        limit: 10
      }
    });
    assert.equal(sequenceDay.frames.length, 6);
    assert.deepEqual(sequenceDay.frames.map((frame) => frame.item_count), [3, 3, 2, 2, 1, 0]);

    const buckets = await api.expectJson({
      path: '/api/timeline/range',
      query: {
        start: '2025-01-04T00:00:00.000Z',
        end: '2025-01-04T00:00:12.000Z',
        camera_id: state.sequenceCameraId,
        mode: 'buckets',
        interval_seconds: 4
      }
    });
    assert.deepEqual(buckets.buckets.map((bucket) => bucket.frame_count), [2, 2, 2]);
    assert.ok(buckets.buckets[0].top_items.includes('courier'));
    assert.ok(buckets.buckets[1].top_items.includes('gate sign'));
    assert.ok(buckets.buckets[2].top_items.includes('rolling cart'));

    const movingCourier = await api.expectJson({
      path: '/api/search',
      query: {
        camera_id: state.sequenceCameraId,
        q: 'courier',
        limit: 5
      }
    });
    assert.deepEqual(movingCourier.results.map((result) => result.frame_id), [
      state.sequenceFrameIds[2],
      state.sequenceFrameIds[1],
      state.sequenceFrameIds[0]
    ]);

    const packageReappeared = await api.expectJson({
      path: '/api/search',
      query: {
        camera_id: state.sequenceCameraId,
        q: 'package',
        limit: 5
      }
    });
    assert.deepEqual(packageReappeared.results.map((result) => result.frame_id), [
      state.sequenceFrameIds[3],
      state.sequenceFrameIds[1]
    ]);
    assert.deepEqual(packageReappeared.results.map((result) => result.matched.loc), ['bottom-right', 'bottom-left']);

    const textConfidence = await api.expectJson({
      path: '/api/search/text',
      query: {
        camera_id: state.sequenceCameraId,
        q: 'Gate',
        limit: 5
      }
    });
    assert.deepEqual(textConfidence.results.map((result) => result.frame_id), [
      state.sequenceFrameIds[3],
      state.sequenceFrameIds[2],
      state.sequenceFrameIds[1]
    ]);
    assert.deepEqual(textConfidence.results.map((result) => result.text.conf), ['high', 'high', 'medium']);

    const noTextItems = await api.expectJson({
      path: '/api/search',
      query: {
        camera_id: state.sequenceCameraId,
        has_text: false,
        limit: 10
      }
    });
    assert.ok(noTextItems.results.some((result) => result.matched.name === 'courier'));
    assert.ok(noTextItems.results.some((result) => result.matched.name === 'rolling cart'));
    assert.ok(noTextItems.results.every((result) => result.matched.name !== 'gate sign'));

    const reanalysed = await api.expectJson({
      method: 'POST',
      path: '/api/frames/' + state.sequenceFrameIds[0] + '/reanalyse',
      body: {
        use_previous_items: true
      }
    });
    assert.equal(reanalysed.ok, true);

    const replaced = await api.expectJson({
      path: '/api/frames/' + state.sequenceFrameIds[0]
    });
    assert.deepEqual(replaced.items, sequence[0].items);
  }
};
