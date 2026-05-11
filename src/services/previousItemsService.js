'use strict';

const { compactObservations } = require('./observationService');

const getPreviousItems = async ({ db, cameraId, capturedAt, maxAgeSeconds }) => {
  const previousObservations = await db.getPreviousObservations({
    cameraId,
    capturedAt,
    maxAgeSeconds
  });

  return compactObservations({ observations: previousObservations });
};

module.exports = {
  getPreviousItems
};
