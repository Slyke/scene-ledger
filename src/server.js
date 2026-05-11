'use strict';

const { config } = require('./config');
const { createApp } = require('./app');
const { generateLog, wrapError } = require('./errors');

const main = async () => {
  const { app, db } = await createApp();

  const server = app.listen(config.port, () => {
    generateLog({
      level: 'info',
      caller: 'server::listen',
      message: 'Scene Ledger API listening',
      context: {
        port: config.port,
        db: config.db.driver,
        ollamaModel: config.ollama.model
      }
    });
  });

  const shutdown = async ({ signal }) => {
    generateLog({
      level: 'info',
      caller: 'server::shutdown',
      message: 'Stopping Scene Ledger API',
      context: { signal }
    });

    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => {
    shutdown({ signal: 'SIGINT' });
  });

  process.on('SIGTERM', () => {
    shutdown({ signal: 'SIGTERM' });
  });
};

main().catch((err) => {
  wrapError({
    caller: 'server::main',
    reason: 'Failed to start Scene Ledger API',
    errorKey: 'SERVER_START_FAILED',
    err,
    includeStackTrace: true
  });
  process.exitCode = 1;
});
