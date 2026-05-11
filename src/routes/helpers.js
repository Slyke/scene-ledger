'use strict';

const { createHttpError } = require('../httpError');

const asyncRoute = ({ handler }) => {
  return (req, res, next) => {
    Promise.resolve(handler({ req, res, next })).catch(next);
  };
};

const parseLimit = ({ value, fallback = 100, max = 500 }) => {
  const parsed = Number.parseInt(value ?? fallback, 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
};

const decodeCursor = ({ cursor }) => {
  if (!cursor) {
    return 0;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const offset = Number.parseInt(parsed.offset, 10);

    return Number.isNaN(offset) || offset < 0 ? 0 : offset;
  } catch (err) {
    throw createHttpError({
      status: 400,
      message: 'Invalid cursor',
      errorKey: 'VALIDATION_CURSOR_INVALID',
      caller: 'routes::helpers::decodeCursor',
      err
    });
  }
};

const encodeCursor = ({ offset }) => {
  return Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url');
};

const parseBooleanQuery = ({ value, field = 'boolean query parameter' }) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw createHttpError({
    status: 400,
    message: 'Invalid boolean query parameter',
    errorKey: 'VALIDATION_BOOLEAN_QUERY_INVALID',
    caller: 'routes::helpers::parseBooleanQuery',
    context: { field, value }
  });
};

const requireIsoDateTime = ({ value, field }) => {
  const parsed = new Date(value);

  if (!value || Number.isNaN(parsed.getTime())) {
    throw createHttpError({
      status: 400,
      message: 'Invalid ' + field,
      errorKey: 'VALIDATION_DATETIME_INVALID',
      caller: 'routes::helpers::requireIsoDateTime',
      context: { field, value }
    });
  }

  return parsed.toISOString();
};

const dayBounds = ({ date }) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
    throw createHttpError({
      status: 400,
      message: 'Invalid date',
      errorKey: 'VALIDATION_DATE_INVALID',
      caller: 'routes::helpers::dayBounds',
      context: { date }
    });
  }

  const start = new Date(date + 'T00:00:00.000Z');

  if (Number.isNaN(start.getTime())) {
    throw createHttpError({
      status: 400,
      message: 'Invalid date',
      errorKey: 'VALIDATION_DATE_INVALID',
      caller: 'routes::helpers::dayBounds',
      context: { date }
    });
  }

  const end = new Date(start.getTime() + (24 * 60 * 60 * 1000));

  return {
    start: start.toISOString(),
    end: end.toISOString()
  };
};

const requireTimeRange = ({ start, end }) => {
  const normalizedStart = requireIsoDateTime({ value: start, field: 'start' });
  const normalizedEnd = requireIsoDateTime({ value: end, field: 'end' });

  if (new Date(normalizedEnd).getTime() <= new Date(normalizedStart).getTime()) {
    throw createHttpError({
      status: 400,
      message: 'Invalid time range',
      errorKey: 'VALIDATION_DATETIME_INVALID',
      caller: 'routes::helpers::requireTimeRange',
      context: { start, end }
    });
  }

  return {
    start: normalizedStart,
    end: normalizedEnd
  };
};

const withCursor = ({ rows, limit, offset }) => {
  const hasMore = rows.length > limit;
  const visibleRows = hasMore ? rows.slice(0, limit) : rows;

  return {
    rows: visibleRows,
    nextCursor: hasMore ? encodeCursor({ offset: offset + limit }) : null
  };
};

module.exports = {
  asyncRoute,
  dayBounds,
  decodeCursor,
  parseBooleanQuery,
  parseLimit,
  requireIsoDateTime,
  requireTimeRange,
  withCursor
};
