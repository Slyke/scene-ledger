'use strict';

const fs = require('fs/promises');
const path = require('path');

const isInsideRoot = ({ root, target }) => {
  const relative = path.relative(path.resolve(root), path.resolve(target));

  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const isDeletablePath = ({ config, filePath }) => {
  if (!filePath) {
    return false;
  }

  return [
    config.images.root,
    config.images.storageRoot,
    config.images.thumbRoot
  ].some((root) => isInsideRoot({ root, target: filePath }));
};

const deleteFileIfAllowed = async ({ config, filePath }) => {
  if (!isDeletablePath({ config, filePath })) {
    return { deleted: false, skipped: true };
  }

  try {
    await fs.rm(filePath, { force: true });
    return { deleted: true, skipped: false };
  } catch (err) {
    return {
      deleted: false,
      skipped: false,
      error: err.message
    };
  }
};

const cutoffIso = ({ days }) => {
  return new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString();
};

const runRetention = async ({ config, db }) => {
  const originalBefore = cutoffIso({ days: config.retention.originalDays });
  const thumbnailBefore = cutoffIso({ days: config.retention.thumbnailDays });
  const queryBefore = new Date(Math.max(
    new Date(originalBefore).getTime(),
    new Date(thumbnailBefore).getTime()
  )).toISOString();
  const stats = {
    scanned_frames: 0,
    deleted_originals: 0,
    deleted_thumbnails: 0,
    deleted_previews: 0,
    skipped_paths: 0,
    errors: []
  };
  const limit = 500;
  let offset = 0;

  while (true) {
    const frames = await db.listFramesForRetention({
      before: queryBefore,
      limit,
      offset
    });

    if (frames.length === 0) {
      break;
    }

    for (const frame of frames) {
      stats.scanned_frames += 1;

      if (frame.captured_at < originalBefore) {
        const result = await deleteFileIfAllowed({ config, filePath: frame.image_path });

        if (result.deleted) {
          stats.deleted_originals += 1;
        }

        if (result.skipped) {
          stats.skipped_paths += 1;
        }

        if (result.error) {
          stats.errors.push({ frame_id: frame.id, file: 'image', error: result.error });
        }
      }

      if (frame.captured_at < thumbnailBefore) {
        const thumbnailResult = await deleteFileIfAllowed({ config, filePath: frame.thumbnail_path });
        const previewResult = await deleteFileIfAllowed({ config, filePath: frame.preview_path });

        if (thumbnailResult.deleted) {
          stats.deleted_thumbnails += 1;
        }

        if (previewResult.deleted) {
          stats.deleted_previews += 1;
        }

        if (thumbnailResult.skipped) {
          stats.skipped_paths += 1;
        }

        if (previewResult.skipped) {
          stats.skipped_paths += 1;
        }

        if (thumbnailResult.error) {
          stats.errors.push({ frame_id: frame.id, file: 'thumbnail', error: thumbnailResult.error });
        }

        if (previewResult.error) {
          stats.errors.push({ frame_id: frame.id, file: 'preview', error: previewResult.error });
        }
      }
    }

    if (frames.length < limit) {
      break;
    }

    offset += frames.length;
  }

  return stats;
};

module.exports = {
  runRetention
};
