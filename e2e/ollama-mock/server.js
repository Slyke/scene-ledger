'use strict';

const http = require('http');

const { loadResponsesByHash, sha256 } = require('./responses');

const port = Number.parseInt(process.env.PORT ?? '11434', 10);
const responsesByHash = loadResponsesByHash();

const sendJson = ({ res, status, body }) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readJson = async ({ req }) => {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const handleChat = async ({ req, res }) => {
  if (req.method !== 'POST') {
    sendJson({ res, status: 405, body: { error: 'method not allowed' } });
    return;
  }

  const body = await readJson({ req });
  const imageBase64 = body?.messages?.[0]?.images?.[0];

  if (typeof imageBase64 !== 'string') {
    sendJson({ res, status: 400, body: { error: 'missing image' } });
    return;
  }

  const imageHash = sha256({ buffer: Buffer.from(imageBase64, 'base64') });
  const known = responsesByHash.get(imageHash);

  if (!known) {
    sendJson({
      res,
      status: 404,
      body: {
        error: 'unknown fixture image',
        image_hash: imageHash
      }
    });
    return;
  }

  if (known.status && known.status !== 200) {
    sendJson({
      res,
      status: known.status,
      body: known.body ?? { error: 'fixture failure' }
    });
    return;
  }

  const message = {
    role: 'assistant'
  };

  if (!known.omitContent) {
    message.content = known.content ?? JSON.stringify(known.response);
  }

  sendJson({
    res,
    status: 200,
    body: {
      model: body.model,
      created_at: '2025-01-01T00:00:00.000Z',
      message,
      done: true,
      total_duration: 1000,
      load_duration: 100,
      eval_count: 1,
      fixture: known.name
    }
  });
};

const server = http.createServer((req, res) => {
  Promise.resolve()
    .then(async () => {
      if (req.url === '/health') {
        sendJson({ res, status: 200, body: { ok: true } });
        return;
      }

      if (req.url === '/api/chat') {
        await handleChat({ req, res });
        return;
      }

      sendJson({ res, status: 404, body: { error: 'not found' } });
    })
    .catch((err) => {
      sendJson({
        res,
        status: 500,
        body: {
          error: err.message
        }
      });
    });
});

server.listen(port, () => {
  console.log('mock Ollama listening on :' + port);
});
