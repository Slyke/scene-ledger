'use strict';

const fs = require('fs/promises');

const { wrapError } = require('../errors');
const { buildPrompt } = require('./prompt');
const { ollamaSceneSchema } = require('./schema');

const parseOllamaContent = ({ content }) => {
  if (typeof content !== 'string') {
    throw wrapError({
      caller: 'ollama::analyseImage::parseOllamaContent',
      reason: 'Ollama response did not include message content',
      errorKey: 'OLLAMA_CONTENT_MISSING',
      context: { contentType: typeof content }
    });
  }

  try {
    return JSON.parse(content);
  } catch (err) {
    throw wrapError({
      caller: 'ollama::analyseImage::parseOllamaContent',
      reason: 'Ollama returned invalid JSON',
      errorKey: 'OLLAMA_JSON_INVALID',
      err,
      context: { contentPreview: content.slice(0, 500) }
    });
  }
};

const analyseImageWithOllama = async ({ config, imagePath, previousItems, model }) => {
  const selectedModel = model ?? config.ollama.model;
  const imageBase64 = await fs.readFile(imagePath, { encoding: 'base64' });
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, config.ollama.timeoutMs);
  const startedAt = Date.now();

  const requestBody = {
    model: selectedModel,
    stream: false,
    format: ollamaSceneSchema,
    options: {
      temperature: config.ollama.temperature,
      num_predict: config.ollama.numPredict
    },
    messages: [
      {
        role: 'user',
        content: buildPrompt({ previousItems }),
        images: [imageBase64]
      }
    ]
  };

  try {
    const response = await fetch(config.ollama.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      const body = await response.text();

      throw wrapError({
        caller: 'ollama::analyseImage::analyseImageWithOllama',
        reason: 'Ollama HTTP request failed',
        errorKey: 'OLLAMA_HTTP_FAILED',
        context: {
          status: response.status,
          bodyPreview: body.slice(0, 500)
        }
      });
    }

    const rawResponse = await response.json();
    const parsed = parseOllamaContent({ content: rawResponse?.message?.content });

    return {
      durationMs,
      model: selectedModel,
      parsed,
      rawResponse
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw wrapError({
        caller: 'ollama::analyseImage::analyseImageWithOllama',
        reason: 'Ollama timeout',
        errorKey: 'OLLAMA_TIMEOUT',
        err,
        context: {
          timeoutMs: config.ollama.timeoutMs,
          model: selectedModel
        }
      });
    }

    if (err.errorKey) {
      throw err;
    }

    throw wrapError({
      caller: 'ollama::analyseImage::analyseImageWithOllama',
      reason: 'Ollama HTTP request failed',
      errorKey: 'OLLAMA_HTTP_FAILED',
      err,
      context: {
        url: config.ollama.url,
        model: selectedModel
      }
    });
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = {
  analyseImageWithOllama
};
