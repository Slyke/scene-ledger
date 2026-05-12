'use strict';

const assert = require('node:assert/strict');

const describeBody = ({ body }) => {
  if (body === undefined) {
    return undefined;
  }

  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const fields = [];

    for (const [name, value] of body.entries()) {
      fields.push(typeof value === 'string'
        ? { name, value }
        : {
            name,
            file: value.name ?? null,
            type: value.type,
            size: value.size
          });
    }

    return {
      type: 'multipart/form-data',
      fields
    };
  }

  if (Buffer.isBuffer(body)) {
    return {
      type: 'buffer',
      bytes: body.length
    };
  }

  return body;
};

const describeResponseBody = ({ body, contentType }) => {
  if (Buffer.isBuffer(body)) {
    return {
      type: contentType || 'application/octet-stream',
      bytes: body.length
    };
  }

  return body;
};

const logPayload = ({ label, payload }) => {
  if (payload === undefined) {
    return;
  }

  console.log(label + ' ' + JSON.stringify(payload, null, 2));
};

const createClient = ({ baseUrl, verbose = false }) => {
  const request = async ({ method = 'GET', path, query, body, headers }) => {
    const url = new URL(path, baseUrl);

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    const requestHeaders = { ...(headers ?? {}) };
    const options = {
      method,
      headers: requestHeaders
    };

    if (body !== undefined) {
      if (body instanceof FormData) {
        options.body = body;
      } else {
        requestHeaders['content-type'] = 'application/json';
        options.body = JSON.stringify(body);
      }
    }

    if (verbose) {
      console.log('[e2e:request] ' + method + ' ' + url.pathname + url.search);
      logPayload({
        label: '[e2e:request:body]',
        payload: describeBody({ body })
      });
    }

    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type') ?? '';
    const responseBody = contentType.includes('application/json')
      ? await response.json()
      : Buffer.from(await response.arrayBuffer());

    if (verbose) {
      console.log('[e2e:response] ' + response.status + ' ' + method + ' ' + url.pathname + url.search);
      logPayload({
        label: '[e2e:response:body]',
        payload: describeResponseBody({ body: responseBody, contentType })
      });
    }

    return {
      status: response.status,
      headers: response.headers,
      body: responseBody
    };
  };

  const expectJson = async ({ method = 'GET', path, query, body, status = 200 }) => {
    const response = await request({ method, path, query, body });

    assert.equal(response.status, status, method + ' ' + path + ' status');
    return response.body;
  };

  return {
    expectJson,
    request
  };
};

module.exports = {
  createClient
};
