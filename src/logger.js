'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const DEFAULT_TEXT_FORMAT = '[{$timestamp}] {$level} {$caller} {$message}';

const asBoolean = ({ value, fallback = false }) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return String(value).toLowerCase() === 'true';
};

const normalizeLevels = ({ levels }) => {
  if (Array.isArray(levels)) {
    return levels.map((level) => String(level).toLowerCase()).filter(Boolean);
  }

  if (typeof levels === 'string') {
    return levels
      .split(',')
      .map((level) => level.trim().toLowerCase())
      .filter(Boolean);
  }

  return [];
};

const mergeDefined = ({ base, override }) => {
  const merged = { ...base };

  for (const [key, value] of Object.entries(override || {})) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  return merged;
};

const safeStringify = ({ value }) => {
  const seen = new WeakSet();

  return JSON.stringify(value, (key, nestedValue) => {
    if (
      nestedValue
      && typeof nestedValue === 'object'
    ) {
      if (seen.has(nestedValue)) {
        return '[Circular]';
      }

      seen.add(nestedValue);
    }

    if (nestedValue instanceof Error) {
      return serializeError({ err: nestedValue, includeStackTrace: true });
    }

    return nestedValue;
  });
};

const serializeError = ({ err, includeStackTrace = false }) => {
  if (!err) {
    return null;
  }

  if (err instanceof Error) {
    const serialized = {
      name: err.name,
      message: err.message
    };

    if (includeStackTrace && err.stack) {
      serialized.stack = err.stack;
    }

    if (err.cause) {
      serialized.cause = serializeError({ err: err.cause, includeStackTrace });
    }

    if (err.details !== undefined) {
      serialized.details = err.details;
    }

    return serialized;
  }

  if (typeof err === 'object') {
    return { ...err };
  }

  return { message: String(err) };
};

const formatTextLog = ({ template, entry }) => {
  const tokenValues = {
    timestamp: entry.timestamp,
    level: entry.level.toUpperCase(),
    caller: entry.caller,
    message: entry.message,
    correlationId: entry.correlationId ?? '',
    errorCode: entry.errorCode ?? '',
    errorKey: entry.errorKey ?? ''
  };

  let rendered = template.replace(/\{\$([a-zA-Z0-9_]+)\}/g, (match, token) => {
    return tokenValues[token] ?? '';
  });

  if (entry.context !== undefined) {
    rendered += ` context=${safeStringify({ value: entry.context })}`;
  }

  if (entry.error !== undefined) {
    rendered += ` error=${safeStringify({ value: entry.error })}`;
  }

  if (entry.kubernetes !== undefined) {
    rendered += ` kubernetes=${safeStringify({ value: entry.kubernetes })}`;
  }

  return rendered.trim();
};

const getConsoleMethod = ({ level }) => {
  if (level === 'error') {
    return console.error;
  }

  if (level === 'warn' || level === 'warning') {
    return console.warn;
  }

  return console.log;
};

const shouldEmitLevel = ({ sink, level }) => {
  return sink.levels.length === 0 || sink.levels.includes(level);
};

const sendHttpLog = ({ sink, payload, contentType }) => {
  if (!sink.url) {
    return;
  }

  const parsedUrl = new URL(sink.url);
  const transport = parsedUrl.protocol === 'https:' ? https : http;
  const request = transport.request(
    {
      method: sink.method,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || undefined,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      timeout: sink.timeoutMs,
      headers: {
        'content-type': contentType,
        'content-length': Buffer.byteLength(payload)
      }
    },
    (response) => {
      response.resume();
    }
  );

  request.on('error', () => {});
  request.on('timeout', () => {
    request.destroy();
  });
  request.end(payload);
};

const resolveKubernetesMetadata = ({ kubernetes }) => {
  if (!kubernetes.enabled) {
    return undefined;
  }

  const metadata = {
    podName: kubernetes.podName,
    deployment: kubernetes.deployment,
    namespace: kubernetes.namespace,
    podIp: kubernetes.podIp,
    podIps: kubernetes.podIps,
    nodeName: kubernetes.nodeName
  };

  const filtered = Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined && value !== '')
  );

  return Object.keys(filtered).length > 0 ? filtered : undefined;
};

const resolveLoggingConfig = ({ settings = {} }) => {
  const envConsole = {
    enabled: asBoolean({ value: process.env.LOG_CONSOLE_ENABLED, fallback: true }),
    format: process.env.LOG_CONSOLE_FORMAT,
    levels: normalizeLevels({ levels: process.env.LOG_CONSOLE_LEVELS })
  };
  const envFile = {
    enabled: asBoolean({ value: process.env.LOG_FILE_ENABLED, fallback: false }),
    format: process.env.LOG_FILE_FORMAT,
    path: process.env.LOG_FILE_PATH,
    levels: normalizeLevels({ levels: process.env.LOG_FILE_LEVELS })
  };
  const envHttp = {
    enabled: asBoolean({ value: process.env.LOG_HTTP_ENABLED, fallback: false }),
    format: 'json',
    url: process.env.LOG_HTTP_URL,
    method: process.env.LOG_HTTP_METHOD,
    timeoutMs: process.env.LOG_HTTP_TIMEOUT_MS ? Number(process.env.LOG_HTTP_TIMEOUT_MS) : undefined,
    levels: normalizeLevels({ levels: process.env.LOG_HTTP_LEVELS })
  };
  const envKubernetes = {
    enabled: asBoolean({ value: process.env.LOG_K8S_METADATA_ENABLED, fallback: false }),
    podName: process.env.K8S_POD_NAME,
    deployment: process.env.K8S_DEPLOYMENT,
    namespace: process.env.K8S_NAMESPACE,
    podIp: process.env.K8S_POD_IP,
    podIps: process.env.K8S_POD_IPS,
    nodeName: process.env.K8S_NODE_NAME
  };

  const logging = settings.logging || {};
  const sinks = logging.sinks || {};

  return {
    logTextFormat: logging.logTextFormat ?? process.env.LOG_TEXT_FORMAT ?? DEFAULT_TEXT_FORMAT,
    sinks: {
      console: {
        ...mergeDefined({
          base: {
            enabled: true,
            format: 'text',
            levels: []
          },
          override: envConsole
        }),
        ...mergeDefined({
          base: {},
          override: sinks.console || {}
        }),
        levels: normalizeLevels({ levels: (sinks.console || {}).levels ?? envConsole.levels })
      },
      file: {
        ...mergeDefined({
          base: {
            enabled: false,
            format: 'json',
            path: '',
            levels: []
          },
          override: envFile
        }),
        ...mergeDefined({
          base: {},
          override: sinks.file || {}
        }),
        levels: normalizeLevels({ levels: (sinks.file || {}).levels ?? envFile.levels })
      },
      http: {
        ...mergeDefined({
          base: {
            enabled: false,
            format: 'json',
            url: '',
            method: 'POST',
            timeoutMs: 2500,
            levels: ['error']
          },
          override: envHttp
        }),
        ...mergeDefined({
          base: {},
          override: sinks.http || {}
        }),
        levels: normalizeLevels({ levels: (sinks.http || {}).levels ?? envHttp.levels ?? ['error'] })
      }
    },
    kubernetes: mergeDefined({
      base: envKubernetes,
      override: logging.kubernetes || {}
    })
  };
};

const emitLog = ({ entry, config }) => {
  const textPayload = formatTextLog({
    template: config.logTextFormat,
    entry
  });
  const jsonPayload = `${safeStringify({ value: entry })}\n`;

  if (
    config.sinks.console.enabled
    && shouldEmitLevel({ sink: config.sinks.console, level: entry.level })
  ) {
    const consoleMethod = getConsoleMethod({ level: entry.level });
    const payload = config.sinks.console.format === 'json' ? jsonPayload.trimEnd() : textPayload;
    consoleMethod(payload);
  }

  if (
    config.sinks.file.enabled
    && config.sinks.file.path
    && shouldEmitLevel({ sink: config.sinks.file, level: entry.level })
  ) {
    fs.mkdirSync(path.dirname(config.sinks.file.path), { recursive: true });
    const payload = config.sinks.file.format === 'text' ? `${textPayload}\n` : jsonPayload;
    fs.appendFileSync(config.sinks.file.path, payload);
  }

  if (
    config.sinks.http.enabled
    && shouldEmitLevel({ sink: config.sinks.http, level: entry.level })
  ) {
    const payload = config.sinks.http.format === 'text' ? textPayload : jsonPayload.trimEnd();
    const contentType = config.sinks.http.format === 'text' ? 'text/plain' : 'application/json';
    sendHttpLog({
      sink: config.sinks.http,
      payload,
      contentType
    });
  }
};

const debugAndErrors = ({ settings = {}, errorCodeMap = {} } = {}) => {
  const config = resolveLoggingConfig({ settings });
  const kubernetes = resolveKubernetesMetadata({ kubernetes: config.kubernetes });

  const generateLog = ({
    level = 'info',
    caller = 'unknown',
    message = '',
    correlationId,
    context,
    error
  } = {}) => {
    const normalizedLevel = String(level).toLowerCase();
    const entry = {
      timestamp: new Date().toISOString(),
      level: normalizedLevel,
      caller,
      message
    };

    if (correlationId !== undefined) {
      entry.correlationId = correlationId;
    }

    if (context !== undefined) {
      entry.context = context;
    }

    if (error !== undefined) {
      entry.error = error;
      if (error.errorCode !== undefined) {
        entry.errorCode = error.errorCode;
      }
      if (error.errorKey !== undefined) {
        entry.errorKey = error.errorKey;
      }
    }

    if (kubernetes !== undefined) {
      entry.kubernetes = kubernetes;
    }

    emitLog({ entry, config });
    return entry;
  };

  const generateError = ({
    caller = 'unknown',
    reason = 'Unexpected error',
    errorKey = 'ERR_UNKNOWN',
    err,
    includeStackTrace = false,
    correlationId,
    context
  } = {}) => {
    const serializedCause = serializeError({ err, includeStackTrace });
    const errorDetails = {
      caller,
      reason,
      errorKey,
      errorCode: errorCodeMap[errorKey] ?? errorCodeMap.ERR_UNKNOWN ?? null
    };

    if (correlationId !== undefined) {
      errorDetails.correlationId = correlationId;
    }

    if (context !== undefined) {
      errorDetails.context = context;
    }

    if (serializedCause !== null) {
      errorDetails.cause = serializedCause;
    }

    generateLog({
      level: 'error',
      caller,
      message: reason,
      correlationId,
      context,
      error: errorDetails
    });

    return errorDetails;
  };

  const wrapError = ({
    caller = 'unknown',
    reason = 'Unexpected error',
    errorKey = 'ERR_UNKNOWN',
    err,
    includeStackTrace = false,
    correlationId,
    context
  } = {}) => {
    const errorDetails = generateError({
      caller,
      reason,
      errorKey,
      err,
      includeStackTrace,
      correlationId,
      context
    });
    const wrappedError = new Error(reason);

    wrappedError.name = 'StructuredError';
    wrappedError.details = errorDetails;
    wrappedError.errorKey = errorDetails.errorKey;
    wrappedError.errorCode = errorDetails.errorCode;

    if (correlationId !== undefined) {
      wrappedError.correlationId = correlationId;
    }

    if (context !== undefined) {
      wrappedError.context = context;
    }

    if (err !== undefined) {
      wrappedError.cause = err;
    }

    return wrappedError;
  };

  return {
    generateLog,
    generateError,
    wrapError
  };
};

module.exports = {
  debugAndErrors
};
