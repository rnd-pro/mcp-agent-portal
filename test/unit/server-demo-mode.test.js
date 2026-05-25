import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { createServerDemoMode, isServerDemoMode } from '../../src/node/server/demo-mode.js';

function makeReq(method, url, body) {
  let req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { 'content-type': 'application/json' };
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
    body: '',
    writeHead(status, headers = {}) {
      this.status = status;
      this.headers = headers;
    },
    end(body = '') {
      this.body = body;
    },
    json() {
      return JSON.parse(this.body);
    },
  };
}

describe('server demo mode', () => {
  it('is controlled by AGENT_PORTAL_DEMO_MODE', () => {
    assert.equal(isServerDemoMode({ AGENT_PORTAL_DEMO_MODE: '1' }), true);
    assert.equal(isServerDemoMode({ AGENT_PORTAL_DEMO_MODE: '0' }), false);
  });

  it('serves mock project info and public chats without real backend access', async () => {
    let demo = createServerDemoMode({
      projectRoot: process.cwd(),
      env: { AGENT_PORTAL_DEMO_MODE: '1' },
    });
    assert.equal(demo.enabled, true);

    let infoRes = makeRes();
    demo.routes['GET /api/project-info'](makeReq('GET', '/api/project-info'), infoRes);
    assert.equal(infoRes.json().demoMode, true);

    let chatsRes = makeRes();
    demo.routes['GET /api/chats'](makeReq('GET', '/api/chats'), chatsRes);
    let chats = chatsRes.json().chats;
    assert.equal(chats[0].id, 'rnd-pro-services');
    assert.equal('messages' in chats[0], false);
  });

  it('returns RND PRO service copy when a demo chat receives a message', async () => {
    let demo = createServerDemoMode({
      projectRoot: process.cwd(),
      env: { AGENT_PORTAL_DEMO_MODE: '1' },
    });
    let createRes = makeRes();
    await demo.routes['POST /api/chats'](makeReq('POST', '/api/chats', {}), createRes);
    let { id } = createRes.json();

    let messageRes = makeRes();
    await demo.routes['POST /api/chats/message'](
      makeReq('POST', '/api/chats/message', { chatId: id, role: 'user', text: 'Need a WebXR demo' }),
      messageRes,
    );
    assert.equal(messageRes.json().ok, true);

    let chatRes = makeRes();
    await demo.routes['POST /api/chats/get'](makeReq('POST', '/api/chats/get', { id }), chatRes);
    let chat = chatRes.json();
    assert.match(chat.messages.at(-1).text, /https:\/\/rnd-pro\.com\//);
    assert.match(chat.messages.at(-1).text, /WebXR/);
  });

  it('reads only public repository files through mocked MCP compact calls', async () => {
    let demo = createServerDemoMode({
      projectRoot: process.cwd(),
      env: { AGENT_PORTAL_DEMO_MODE: '1' },
    });
    let okRes = makeRes();
    await demo.routes['POST /api/mcp-call'](
      makeReq('POST', '/api/mcp-call', {
        method: 'tools/call',
        params: { name: 'compact', arguments: { path: 'README.md' } },
      }),
      okRes,
    );
    assert.match(okRes.json().result.content[0].text, /Agent Portal|MCP|agent/i);

    let blockedRes = makeRes();
    await demo.routes['POST /api/mcp-call'](
      makeReq('POST', '/api/mcp-call', {
        method: 'tools/call',
        params: { name: 'compact', arguments: { path: '.env' } },
      }),
      blockedRes,
    );
    assert.match(blockedRes.json().result.content[0].text, /unavailable/);
  });
});
