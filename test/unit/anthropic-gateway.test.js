import { describe, it, beforeEach, afterEach } from 'node:test';
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

describe('anthropic gateway', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anthropic-gateway-test-'));
    oldConfigPath = process.env.PORTAL_CONFIG_PATH;
    oldDeepSeekKey = process.env.DEEPSEEK_API_KEY;
    oldFetch = global.fetch;
    process.env.PORTAL_CONFIG_PATH = path.join(tmpDir, 'agent-portal.json');
    process.env.DEEPSEEK_API_KEY = 'test-key';
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

  it('returns Anthropic-shaped SSE when stream is requested', async () => {
    global.fetch = async () => ({
      ok: true,
      text: async () => JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: 'hello' } }],
        usage: { prompt_tokens: 1, completion_tokens: 2 },
      }),
    });

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
    assert.match(res.headers['Content-Type'], /text\/event-stream/);
    assert.match(res.body, /event: message_start/);
    assert.match(res.body, /event: content_block_delta/);
    assert.match(res.body, /"text":"hello"/);
    assert.match(res.body, /event: message_stop/);
  });
});
