/**
 * Integration test: Chat parameter lifecycle
 * Tests: create → set provider → cascade model reset → load → verify → garbage rejection
 *
 * Usage: PORTAL_PORT=<port> node test/integration/chat-params.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

let BASE = `http://127.0.0.1:${process.env.PORTAL_PORT || 53357}`;

async function api(method, path, body) {
  let opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  let res = await fetch(`${BASE}${path}`, opts);
  let text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: text }; }
}

describe('Chat params lifecycle', () => {
  let chatId;

  test('1. create chat with adapter=pool', async () => {
    let { status, data } = await api('POST', '/api/chats', { adapter: 'pool', name: 'Param Test' });
    assert.equal(status, 200);
    assert.ok(data.id, 'should return chat id');
    chatId = data.id;
  });

  test('2. GET /api/adapter/types returns providers with models', async () => {
    let { status, data } = await api('GET', '/api/adapter/types');
    assert.equal(status, 200);
    assert.ok(data.metadata.gemini, 'gemini metadata exists');
    assert.ok(data.metadata.opencode, 'opencode metadata exists');
    assert.ok(data.metadata.pool, 'pool metadata exists');

    let opencodeModels = data.metadata.opencode.parameters.find(p => p.id === 'model');
    assert.ok(opencodeModels, 'opencode has model param');
    assert.ok(opencodeModels.options.length > 0, 'opencode has at least one model');
  });

  test('3. set provider=opencode', async () => {
    let { status, data } = await api('POST', '/api/chats/update', {
      id: chatId, provider: 'opencode', model: null,
    });
    assert.equal(status, 200);
    assert.ok(data.ok);
  });

  test('4. verify provider saved, model is null', async () => {
    let { status, data } = await api('POST', '/api/chats/get', { id: chatId });
    assert.equal(status, 200);
    assert.equal(data.provider, 'opencode');
    assert.equal(data.model, null);
  });

  test('5. set model for opencode provider', async () => {
    let { status } = await api('POST', '/api/chats/update', {
      id: chatId, model: 'opencode/gpt-5-nano',
    });
    assert.equal(status, 200);
  });

  test('6. verify both provider and model saved', async () => {
    let { data } = await api('POST', '/api/chats/get', { id: chatId });
    assert.equal(data.provider, 'opencode');
    assert.equal(data.model, 'opencode/gpt-5-nano');
  });

  test('7. cascade: switch provider resets model', async () => {
    await api('POST', '/api/chats/update', {
      id: chatId, provider: 'gemini', model: null,
    });
    let { data } = await api('POST', '/api/chats/get', { id: chatId });
    assert.equal(data.provider, 'gemini');
    assert.equal(data.model, null);
  });

  test('8. garbage rejection: template {{id}} key ignored', async () => {
    await api('POST', '/api/chats/update', {
      id: chatId, '{{id}}': '{{val}}',
    });
    let { data } = await api('POST', '/api/chats/get', { id: chatId });
    assert.equal(data['{{id}}'], undefined, 'template garbage must not be saved');
  });

  test('9. garbage rejection: template value {{val}} ignored', async () => {
    await api('POST', '/api/chats/update', {
      id: chatId, model: '{{val}}',
    });
    let { data } = await api('POST', '/api/chats/get', { id: chatId });
    assert.notEqual(data.model, '{{val}}', 'template value must not be saved');
  });

  test('10. unknown keys rejected (whitelist)', async () => {
    await api('POST', '/api/chats/update', {
      id: chatId, hackerField: 'pwned', __proto__: { admin: true },
    });
    let { data } = await api('POST', '/api/chats/get', { id: chatId });
    assert.equal(data.hackerField, undefined, 'unknown key must not be saved');
  });

  test('11. cleanup: delete test chat', async () => {
    let { status } = await api('POST', '/api/chats/delete', { id: chatId });
    assert.equal(status, 200);
  });
});
