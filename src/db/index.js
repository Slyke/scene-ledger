'use strict';

const { wrapError } = require('../errors');
const { createPostgresDb } = require('./postgres');
const { createSqliteDb } = require('./sqlite');

const createDb = async ({ config }) => {
  if (config.db.driver === 'sqlite') {
    return createSqliteDb({ dbPath: config.db.path });
  }

  if (config.db.driver === 'postgres') {
    return createPostgresDb({ databaseUrl: config.db.databaseUrl });
  }

  throw wrapError({
    caller: 'db::index::createDb',
    reason: 'Unsupported DB_DRIVER: ' + config.db.driver,
    errorKey: 'CONFIG_DB_DRIVER_UNSUPPORTED',
    context: { dbDriver: config.db.driver }
  });
};

module.exports = {
  createDb
};
