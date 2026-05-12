'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const fixtureRoot = process.env.FIXTURE_ROOT ?? path.join(__dirname, '..', 'fixtures', 'images');

const fixtureResponses = [
  {
    name: 'front-door',
    file: 'front-door.svg',
    response: {
      items: [
        {
          name: 'delivery package',
          loc: 'bottom-center',
          conf: 'high',
          box: { x: 52, y: 35, w: 32, h: 16 },
          text: [{ v: 'UPS 42', conf: 'medium' }]
        },
        {
          name: 'porch light',
          loc: 'top-right',
          conf: 'medium',
          box: { x: 71, y: 11, w: 14, h: 14 }
        }
      ]
    }
  },
  {
    name: 'driveway',
    file: 'driveway.png.base64',
    encoding: 'base64',
    response: {
      items: [
        {
          name: 'blue car',
          loc: 'center',
          conf: 'high',
          box: { x: 10, y: 10, w: 50, h: 30 }
        },
        {
          name: 'license plate',
          loc: 'bottom-center',
          conf: 'medium',
          box: { x: 22, y: 36, w: 16, h: 6 },
          text: [{ v: 'E2E-2048', conf: 'high' }]
        }
      ]
    }
  },
  {
    name: 'yard-sequence-01',
    file: 'sequence/yard-01.svg',
    response: {
      items: [
        {
          name: 'courier',
          loc: 'center-left',
          conf: 'high',
          box: { x: 8, y: 18, w: 16, h: 34 }
        },
        {
          name: 'rolling cart',
          loc: 'center-right',
          conf: 'medium',
          box: { x: 66, y: 30, w: 20, h: 18 }
        },
        {
          name: 'gate sign',
          loc: 'top-center',
          conf: 'low',
          box: { x: 38, y: 8, w: 20, h: 10 },
          text: [{ v: 'G12', conf: 'low' }]
        }
      ]
    }
  },
  {
    name: 'yard-sequence-02',
    file: 'sequence/yard-02.svg',
    response: {
      items: [
        {
          name: 'courier',
          loc: 'center',
          conf: 'high',
          box: { x: 34, y: 18, w: 16, h: 34 }
        },
        {
          name: 'delivery package',
          loc: 'bottom-left',
          conf: 'medium',
          box: { x: 14, y: 48, w: 18, h: 12 }
        },
        {
          name: 'gate sign',
          loc: 'top-center',
          conf: 'medium',
          box: { x: 38, y: 8, w: 20, h: 10 },
          text: [{ v: 'Gate 1?', conf: 'medium' }]
        }
      ]
    }
  },
  {
    name: 'yard-sequence-03',
    file: 'sequence/yard-03.svg',
    response: {
      items: [
        {
          name: 'courier',
          loc: 'center-right',
          conf: 'high',
          box: { x: 62, y: 18, w: 16, h: 34 }
        },
        {
          name: 'gate sign',
          loc: 'top-center',
          conf: 'high',
          box: { x: 38, y: 8, w: 20, h: 10 },
          text: [{ v: 'Gate 12', conf: 'high' }]
        }
      ]
    }
  },
  {
    name: 'yard-sequence-04',
    file: 'sequence/yard-04.svg',
    response: {
      items: [
        {
          name: 'delivery package',
          loc: 'bottom-right',
          conf: 'high',
          box: { x: 62, y: 48, w: 18, h: 12 }
        },
        {
          name: 'gate sign',
          loc: 'top-center',
          conf: 'high',
          box: { x: 38, y: 8, w: 20, h: 10 },
          text: [{ v: 'Gate 12', conf: 'high' }]
        }
      ]
    }
  },
  {
    name: 'yard-sequence-05',
    file: 'sequence/yard-05.svg',
    response: {
      items: [
        {
          name: 'rolling cart',
          loc: 'bottom-center',
          conf: 'low',
          box: { x: 42, y: 44, w: 20, h: 18 }
        }
      ]
    }
  },
  {
    name: 'empty-scene',
    file: 'sequence/empty-scene.svg',
    response: {
      items: []
    }
  },
  {
    name: 'ollama-invalid-json',
    file: 'errors/invalid-json.svg',
    content: '{"items": ['
  },
  {
    name: 'ollama-missing-content',
    file: 'errors/missing-content.svg',
    omitContent: true
  },
  {
    name: 'ollama-invalid-observation',
    file: 'errors/invalid-observation.svg',
    response: {
      items: [
        {
          name: '',
          loc: 'center',
          conf: 'high',
          box: { x: 1, y: 1, w: 10, h: 10 }
        }
      ]
    }
  },
  {
    name: 'ollama-http-fail',
    file: 'errors/http-fail.svg',
    status: 503,
    body: {
      error: 'upstream fixture failure'
    }
  }
];

const sha256 = ({ buffer }) => {
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

const readFixture = ({ fixture }) => {
  const contents = fs.readFileSync(path.join(fixtureRoot, fixture.file));

  if (fixture.encoding === 'base64') {
    return Buffer.from(contents.toString('utf8').trim(), 'base64');
  }

  return contents;
};

const loadResponsesByHash = () => {
  const responsesByHash = new Map();

  for (const fixture of fixtureResponses) {
    const buffer = readFixture({ fixture });
    responsesByHash.set(sha256({ buffer }), {
      name: fixture.name,
      response: fixture.response,
      content: fixture.content,
      omitContent: fixture.omitContent,
      status: fixture.status,
      body: fixture.body
    });
  }

  return responsesByHash;
};

module.exports = {
  loadResponsesByHash,
  sha256
};
