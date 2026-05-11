'use strict';

const LOC_ADJACENCIES = {
  'top-left': new Set(['top-left', 'top-center', 'center-left', 'center']),
  'top-center': new Set(['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right']),
  'top-right': new Set(['top-center', 'top-right', 'center', 'center-right']),
  'center-left': new Set(['top-left', 'top-center', 'center-left', 'center', 'bottom-left', 'bottom-center']),
  center: new Set([
    'top-left',
    'top-center',
    'top-right',
    'center-left',
    'center',
    'center-right',
    'bottom-left',
    'bottom-center',
    'bottom-right'
  ]),
  'center-right': new Set(['top-center', 'top-right', 'center', 'center-right', 'bottom-center', 'bottom-right']),
  'bottom-left': new Set(['center-left', 'center', 'bottom-left', 'bottom-center']),
  'bottom-center': new Set(['center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right']),
  'bottom-right': new Set(['center', 'center-right', 'bottom-center', 'bottom-right'])
};

const normalizeName = ({ name }) => {
  return String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
};

const calculateIoU = ({ a, b }) => {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  const intersection = width * height;
  const union = (a.w * a.h) + (b.w * b.h) - intersection;

  if (union <= 0) {
    return 0;
  }

  return intersection / union;
};

const namesSimilar = ({ a, b }) => {
  const left = normalizeName({ name: a });
  const right = normalizeName({ name: b });

  return left === right || left.includes(right) || right.includes(left);
};

const locationsAdjacent = ({ a, b }) => {
  return LOC_ADJACENCIES[a]?.has(b) ?? false;
};

const findBestMatch = ({ current, previous, usedPrevious }) => {
  let best = null;

  for (const previousObservation of previous) {
    if (usedPrevious.has(previousObservation.id)) {
      continue;
    }

    if (!namesSimilar({ a: current.name, b: previousObservation.name })) {
      continue;
    }

    const iou = calculateIoU({ a: current.box, b: previousObservation.box });
    const sameLoc = current.loc === previousObservation.loc;
    const adjacent = locationsAdjacent({ a: current.loc, b: previousObservation.loc });

    if (iou >= 0.25) {
      best = { previousObservation, type: 'unchanged', score: iou + 1 };
      continue;
    }

    if ((sameLoc || adjacent) && iou > 0) {
      const score = iou + (sameLoc ? 0.5 : 0.25);

      if (!best || score > best.score) {
        best = { previousObservation, type: 'possibly_moved', score };
      }
    }
  }

  return best;
};

const deriveChanges = ({ previous, current }) => {
  const usedPrevious = new Set();
  const changes = [];

  for (const currentObservation of current) {
    const match = findBestMatch({
      current: currentObservation,
      previous,
      usedPrevious
    });

    if (!match) {
      changes.push({ type: 'appeared', current: currentObservation });
      continue;
    }

    usedPrevious.add(match.previousObservation.id);
    changes.push({
      type: match.type,
      previous: match.previousObservation,
      current: currentObservation
    });
  }

  for (const previousObservation of previous) {
    if (!usedPrevious.has(previousObservation.id)) {
      changes.push({ type: 'disappeared', previous: previousObservation });
    }
  }

  return changes;
};

module.exports = {
  calculateIoU,
  deriveChanges
};
