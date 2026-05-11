'use strict';

const { createHttpError } = require('./httpError');
const { generateLog, wrapError } = require('./errors');

const createAuthMiddleware = ({ config }) => {
  return (req, res, next) => {
    if (!config.apiKey) {
      next();
      return;
    }

    const expected = 'Bearer ' + config.apiKey;

    if (req.get('authorization') === expected) {
      next();
      return;
    }

    next(createHttpError({
      status: 401,
      message: 'Unauthorized',
      errorKey: 'HTTP_AUTH_UNAUTHORIZED',
      caller: 'middleware::auth',
      context: { path: req.path }
    }));
  };
};

const createAnalyseRateLimitMiddleware = ({ config }) => {
  const hitsByIp = new Map();
  const windowMs = 60 * 1000;

  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const current = hitsByIp.get(ip);

    if (!current || current.resetAt <= now) {
      hitsByIp.set(ip, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    current.count += 1;

    if (current.count <= config.analyseRateLimitPerMinute) {
      next();
      return;
    }

    res.set('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
    next(createHttpError({
      status: 429,
      message: 'Too many analyse requests',
      errorKey: 'HTTP_RATE_LIMIT_EXCEEDED',
      caller: 'middleware::analyseRateLimit',
      context: {
        ip,
        limit: config.analyseRateLimitPerMinute
      }
    }));
  };
};

const createErrorHandler = () => {
  return (err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    const status = err.status ?? 500;
    const structuredError = err.errorKey
      ? err
      : wrapError({
        caller: 'http::errorHandler',
        reason: 'Unhandled request error',
        errorKey: 'HTTP_REQUEST_UNHANDLED',
        err,
        includeStackTrace: true,
        context: {
          method: req.method,
          path: req.path,
          status
        }
      });
    const responseStatus = structuredError.status ?? status;

    generateLog({
      level: responseStatus >= 500 ? 'error' : 'warn',
      caller: 'http::errorHandler',
      message: structuredError.publicMessage ?? structuredError.message,
      context: {
        method: req.method,
        path: req.path,
        status: responseStatus
      },
      error: structuredError.details
    });

    const body = {
      ok: false,
      error: responseStatus >= 500
        ? 'Internal server error'
        : (structuredError.publicMessage ?? structuredError.message),
      error_key: structuredError.errorKey ?? structuredError.details?.errorKey,
      error_code: structuredError.errorCode ?? structuredError.details?.errorCode
    };

    if (responseStatus < 500 && structuredError.responseDetails !== undefined) {
      body.details = structuredError.responseDetails;
    }

    res.status(responseStatus).json(body);
  };
};

module.exports = {
  createAnalyseRateLimitMiddleware,
  createAuthMiddleware,
  createErrorHandler
};
