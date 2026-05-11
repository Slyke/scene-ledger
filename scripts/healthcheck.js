'use strict';

const http = require('http');

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const headers = {};

if (process.env.API_KEY) {
  headers.Authorization = 'Bearer ' + process.env.API_KEY;
}

const req = http.request({
  hostname: '127.0.0.1',
  port,
  path: '/api/health',
  method: 'GET',
  headers,
  timeout: 2500
}, (res) => {
  res.resume();
  process.exit(res.statusCode === 200 ? 0 : 1);
});

req.on('timeout', () => {
  req.destroy(new Error('Healthcheck timed out'));
});

req.on('error', () => {
  process.exit(1);
});

req.end();
