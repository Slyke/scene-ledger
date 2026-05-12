'use strict';

const { assert, assertStructuredError } = require('../support/assertions');

const assertFramePayload = ({ payload, frameId, cameraId, capturedAt, expectedItems }) => {
  assert.equal(payload.frame.id, frameId);
  assert.equal(payload.frame.camera_id, cameraId);
  assert.equal(payload.frame.captured_at, capturedAt);
  assert.equal(payload.frame.analysis_status, 'complete');
  assert.equal(payload.frame.error, null);
  assert.equal(payload.frame.image_available, true);
  assert.equal(payload.frame.thumbnail_available, true);
  assert.equal(payload.frame.preview_available, true);
  assert.deepEqual(payload.items, expectedItems);
};

module.exports = {
  name: 'GET/POST /api/frames/:frame_id',
  run: async ({ api, errors, state }) => {
    const pathFrame = await api.expectJson({
      path: '/api/frames/' + state.pathFrameId
    });

    assertFramePayload({
      payload: pathFrame,
      frameId: state.pathFrameId,
      cameraId: state.frontDoorCameraId,
      capturedAt: state.pathCapturedAt,
      expectedItems: state.pathExpectedItems
    });

    const image = await api.request({
      path: '/api/frames/' + state.pathFrameId + '/image'
    });
    assert.equal(image.status, 200);
    assert.ok(image.body.length > 0);

    const thumbnail = await api.request({
      path: '/api/frames/' + state.pathFrameId + '/thumbnail'
    });
    assert.equal(thumbnail.status, 200);
    assert.match(thumbnail.headers.get('content-type') ?? '', /^image\/jpeg/);
    assert.ok(thumbnail.body.length > 0);

    const reanalysed = await api.expectJson({
      method: 'POST',
      path: '/api/frames/' + state.uploadFrameId + '/reanalyse',
      body: {
        model: 'e2e-alt-model',
        use_previous_items: false
      }
    });
    assert.equal(reanalysed.ok, true);
    assert.equal(reanalysed.frame_id, state.uploadFrameId);

    const uploadFrame = await api.expectJson({
      path: '/api/frames/' + state.uploadFrameId
    });
    assertFramePayload({
      payload: uploadFrame,
      frameId: state.uploadFrameId,
      cameraId: state.drivewayCameraId,
      capturedAt: state.uploadCapturedAt,
      expectedItems: state.uploadExpectedItems
    });
    assert.equal(uploadFrame.frame.ollama_model, 'e2e-alt-model');

    const missing = await api.request({
      path: '/api/frames/999999'
    });
    assertStructuredError({
      response: missing,
      status: 404,
      errorKey: 'FRAME_NOT_FOUND',
      errors
    });
  }
};
