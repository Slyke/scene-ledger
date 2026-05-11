'use strict';

const { config } = require('../src/config');
const { createDb } = require('../src/db');
const { generateLog, wrapError } = require('../src/errors');
const { runRetention } = require('../src/services/retentionService');

const main = async () => {
  const db = await createDb({ config });

  try {
    await db.init();
    const result = await runRetention({ config, db });

    generateLog({
      level: 'info',
      caller: 'retention::main',
      message: 'Retention job complete',
      context: result
    });
  } finally {
    await db.close();
  }
};

main().catch((err) => {
  wrapError({
    caller: 'retention::main',
    reason: 'Retention job failed',
    errorKey: 'RETENTION_JOB_FAILED',
    err,
    includeStackTrace: true
  });
  process.exitCode = 1;
});
