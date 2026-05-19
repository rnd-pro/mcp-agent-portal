import { describe, it, before, beforeEach, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tmpDir;
let oldConfigPath;
let oldDeepSeekKey;
let oldFetch;

function makeReq(method, url, body, headers = {}) {
  let req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = headers;
  req.destroy = (err) => req.emit('error', err);
  process.nextTick(() => {
    if (body !== undefined) req.emit('data', JSON.stringify(body));
    req.emit('end');
  });
  return req;
}

function makeRes() {
  return {
    status: null,
    headers: null,
    chunks: [],
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    write(chunk) {
      this.chunks.push(chunk.toString());
    },
    end(chunk = '') {
      if (chunk) this.chunks.push(chunk.toString());
      this.body = this.chunks.join('');
      this.ended = true;
    },
  };
}

function sseResponse(lines) {
  let encoder = new TextEncoder();
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        for (let line of lines) controller.enqueue(encoder.encode(line));
        controller.close();
      },
    }),
  };
}

describe('anthropic gateway', () => {
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anthropic-gateway-test-'));
    oldConfigPath = process.env.PORTAL_CONFIG_PATH;
    oldDeepSeekKey = process.env.DEEPSEEK_API_KEY;
    oldFetch = global.fetch;
    process.env.PORTAL_CONFIG_PATH = path.join(tmpDir, 'agent-portal.json');
    process.env.DEEPSEEK_API_KEY = 'test-key';
  });

  beforeEach(() => {
    fs.writeFileSync(process.env.PORTAL_CONFIG_PATH, JSON.stringify({
      anthropicGateway: {
        enabled: true,
        authToken: 'local-token',
        defaultModel: 'deepseek-v4-flash',
        plannerModel: 'deepseek-v4-pro',
      },
    }));
  });

  afterEach(() => {
    global.fetch = oldFetch;
  });

  after(() => {
    if (oldConfigPath === undefined) delete process.env.PORTAL_CONFIG_PATH;
    else process.env.PORTAL_CONFIG_PATH = oldConfigPath;
    if (oldDeepSeekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = oldDeepSeekKey;
    global.fetch = oldFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('converts Anthropic messages/tools to OpenAI-compatible request and response', async () => {
    let seenRequest;
    global.fetch = async (url, opts) => {
      seenRequest = { url, body: JSON.parse(opts.body), headers: opts.headers };
      return {
        ok: true,
        text: async () => JSON.stringify({
          choices: [{
            finish_reason: 'tool_calls',
            message: {
              content: null,
              tool_calls: [{
                id: 'call_1',
                type: 'function',
                function: { name: 'Bash', arguments: '{"command":"pwd"}' },
              }],
            },
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      };
    };

    let { createAnthropicGatewayHandler } = await import('../../src/node/server/anthropic-gateway.js');
    let handler = createAnthropicGatewayHandler();
    let req = makeReq('POST', '/anthropic/v1/messages', {
      model: 'claude-3-opus-latest',
      max_tokens: 100,
      system: 'You are a coding agent.',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'run pwd' }] }],
      tools: [{ name: 'Bash', description: 'Run shell', input_schema: { type: 'object', properties: { command: { type: 'string' } } } }],
    }, { authorization: 'Bearer local-token' });
    let res = makeRes();

    await handler(req, res);

    assert.equal(res.status, 200);
    assert.equal(seenRequest.url, 'https://api.deepseek.com/chat/completions');
    assert.equal(seenRequest.headers.Authorization, 'Bearer test-key');
    assert.equal(seenRequest.body.model, 'deepseek-v4-pro');
    assert.equal(seenRequest.body.messages[0].role, 'system');
    assert.equal(seenRequest.body.tools[0].function.name, 'Bash');

    let payload = JSON.parse(res.body);
    assert.equal(payload.type, 'message');
    assert.equal(payload.stop_reason, 'tool_use');
    assert.deepEqual(payload.content, [{
      type: 'tool_use',
      id: 'call_1',
      name: 'Bash',
      input: { command: 'pwd' },
    }]);
  });

  it('translates upstream OpenAI-compatible streaming chunks to Anthropic SSE', async () => {
    let seenRequest;
    global.fetch = async (url, opts) => {
      seenRequest = { url, body: JSON.parse(opts.body), headers: opts.headers };
      return sseResponse([
        'data: {"choices":[{"delta":{"content":"hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":2}}\n\n',
        'data: [DONE]\n\n',
      ]);
    };

    let { createAnthropicGatewayHandler } = await import('../../src/node/server/anthropic-gateway.js');
    let handler = createAnthropicGatewayHandler();
    let req = makeReq('POST', '/anthropic/v1/messages', {
      model: 'deepseek-v4-flash',
      stream: true,
      messages: [{ role: 'user', content: 'hello' }],
    }, { authorization: 'Bearer local-token' });
    let res = makeRes();

    await handler(req, res);

    assert.equal(res.status, 200);
    assert.equal(seenRequest.url, 'https://api.deepseek.com/chat/completions');
    assert.equal(seenRequest.body.stream, true);
    assert.match(res.headers['Content-Type'], /text\/event-stream/);
    assert.match(res.body, /event: message_start/);
    assert.match(res.body, /event: content_block_delta/);
    assert.match(res.body, /"text":"hel"/);
    assert.match(res.body, /"text":"lo"/);
    assert.match(res.body, /event: message_stop/);
  });

  it('lists provider-prefixed models for multi-provider selection', async () => {
    let { createAnthropicGatewayHandler } = await import('../../src/node/server/anthropic-gateway.js');
    let handler = createAnthropicGatewayHandler();
    let req = makeReq('GET', '/anthropic/v1/models', null, { authorization: 'Bearer local-token' });
    let res = makeRes();

    await handler(req, res);

    assert.equal(res.status, 200);
    let ids = JSON.parse(res.body).data.map(model => model.id);
    assert.ok(ids.includes('deepseek-v4-flash'));
    assert.ok(ids.includes('deepseek/deepseek-v4-flash'));
    assert.ok(ids.includes('deepseek/deepseek-v4-pro'));
  });

  it('proxies Anthropic-compatible message requests to the configured provider', async () => {
    fs.writeFileSync(process.env.PORTAL_CONFIG_PATH, JSON.stringify({
      anthropicGateway: {
        enabled: true,
        authToken: 'local-token',
        providers: {
          deepseek: {
            type: 'anthropic-compatible',
            baseUrl: 'https://api.deepseek.com/anthropic',
            apiKeyEnv: 'DEEPSEEK_API_KEY',
            models: ['deepseek-chat'],
          },
        },
      },
    }));

    let seenRequest;
    global.fetch = async (url, opts) => {
      seenRequest = { url, body: JSON.parse(opts.body), headers: opts.headers };
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ type: 'message', content: [{ type: 'text', text: 'proxied' }] }),
      };
    };

    let { createAnthropicGatewayHandler } = await import('../../src/node/server/anthropic-gateway.js');
    let handler = createAnthropicGatewayHandler();
    let req = makeReq('POST', '/anthropic/v1/messages', {
      model: 'deepseek/deepseek-chat',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hello' }],
    }, { authorization: 'Bearer local-token', 'anthropic-version': '2023-06-01' });
    let res = makeRes();

    await handler(req, res);

    assert.equal(res.status, 200);
    assert.equal(seenRequest.url, 'https://api.deepseek.com/anthropic/v1/messages');
    assert.equal(seenRequest.headers['x-api-key'], 'test-key');
    assert.equal(seenRequest.headers['anthropic-version'], '2023-06-01');
    assert.equal(seenRequest.body.model, 'deepseek-chat');
    assert.deepEqual(JSON.parse(res.body), { type: 'message', content: [{ type: 'text', text: 'proxied' }] });
  });

  it('deduplicates Anthropic-compatible tools before proxying upstream', async () => {
    fs.writeFileSync(process.env.PORTAL_CONFIG_PATH, JSON.stringify({
      anthropicGateway: {
        enabled: true,
        authToken: 'local-token',
        providers: {
          deepseek: {
            type: 'anthropic-compatible',
            baseUrl: 'https://api.deepseek.com/anthropic',
            apiKeyEnv: 'DEEPSEEK_API_KEY',
            models: ['deepseek-chat'],
          },
        },
      },
    }));

    let seenRequest;
    global.fetch = async (url, opts) => {
      seenRequest = { url, body: JSON.parse(opts.body) };
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ type: 'message', content: [{ type: 'text', text: 'ok' }] }),
      };
    };

    let { createAnthropicGatewayHandler } = await import('../../src/node/server/anthropic-gateway.js');
    let handler = createAnthropicGatewayHandler();
    let req = makeReq('POST', '/anthropic/v1/messages', {
      model: 'deepseek-chat',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hello' }],
      tools: [
        { name: 'get_usage_guide', input_schema: { type: 'object', properties: { a: { type: 'string' } } } },
        { name: 'get_usage_guide', input_schema: { type: 'object', properties: { b: { type: 'string' } } } },
        { name: 'list_tasks', input_schema: { type: 'object', properties: {} } },
      ],
    }, { authorization: 'Bearer local-token' });
    let res = makeRes();

    await handler(req, res);

    assert.equal(res.status, 200);
    assert.deepEqual(seenRequest.body.tools.map(tool => tool.name), ['get_usage_guide', 'list_tasks']);
  });
});
