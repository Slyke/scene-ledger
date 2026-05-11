'use strict';

const ollamaSceneSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string'
          },
          loc: {
            type: 'string',
            enum: [
              'top-left',
              'top-center',
              'top-right',
              'center-left',
              'center',
              'center-right',
              'bottom-left',
              'bottom-center',
              'bottom-right'
            ]
          },
          conf: {
            type: 'string',
            enum: ['high', 'medium', 'low']
          },
          box: {
            type: 'object',
            properties: {
              x: { type: 'integer', minimum: 0 },
              y: { type: 'integer', minimum: 0 },
              w: { type: 'integer', minimum: 0 },
              h: { type: 'integer', minimum: 0 }
            },
            required: ['x', 'y', 'w', 'h'],
            additionalProperties: false
          },
          text: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                v: {
                  type: 'string'
                },
                conf: {
                  type: 'string',
                  enum: ['high', 'medium', 'low']
                }
              },
              required: ['v', 'conf'],
              additionalProperties: false
            }
          }
        },
        required: ['name', 'loc', 'conf', 'box'],
        additionalProperties: false
      }
    }
  },
  required: ['items'],
  additionalProperties: false
};

module.exports = {
  ollamaSceneSchema
};
