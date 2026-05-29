import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

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

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function withPublicSources(fn) {
  let root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-portal-public-sources-'));
  try {
    let projectRoot = path.join(root, 'agent-pool');
    fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'README.md'), '# Agent Pool MCP\n');
    fs.writeFileSync(path.join(projectRoot, 'package.json'), '{"name":"agent-pool-mcp"}\n');
    fs.writeFileSync(path.join(projectRoot, 'src/index.js'), 'import { describeSource } from "./util.js";\nexport const source = describeSource("github snapshot");\n');
    fs.writeFileSync(path.join(projectRoot, 'src/util.js'), 'export function describeSource(value) {\n  return value;\n}\n');
    fs.writeFileSync(path.join(projectRoot, '.public-source.json'), JSON.stringify({
      projectId: 'agent-pool',
      name: 'Agent Pool',
      repo: 'https://github.com/rnd-pro/agent-pool-mcp.git',
      ref: 'main',
      syncedAt: '2026-05-25T00:00:00.000Z',
    }));
    fs.writeFileSync(path.join(root, 'sources.json'), JSON.stringify({
      version: 1,
      sources: [{
        projectId: 'agent-pool',
        name: 'Agent Pool',
        repo: 'https://github.com/rnd-pro/agent-pool-mcp.git',
        ref: 'main',
      }],
    }));
    return await fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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
    for (let rootChat of chats.filter((chat) => !chat.parentChatId)) {
      let children = chats.filter((chat) => chat.parentChatId === rootChat.id);
      assert.ok(children.length >= 2, `${rootChat.id} should expose demo sub-agent chats`);
    }
  });

  it('stores REST chat messages without generating a duplicate demo reply', async () => {
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
    assert.equal(chat.messages.at(-1).role, 'user');
    assert.equal(chat.messages.at(-1).text, 'Need a WebXR demo');
    assert.equal(chat.messages.filter((message) => message.role === 'agent').length, 1);
  });

  it('adds exactly one websocket demo reply after the persisted user message', async () => {
    let demo = createServerDemoMode({
      projectRoot: process.cwd(),
      env: { AGENT_PORTAL_DEMO_MODE: '1' },
    });
    let server = createServer();
    server.on('upgrade', (req, socket, head) => {
      if (!demo.handleUpgrade(req, socket, head)) socket.destroy();
    });
    let port = await listen(server);
    try {
      let createRes = makeRes();
      await demo.routes['POST /api/chats'](makeReq('POST', '/api/chats', {}), createRes);
      let { id } = createRes.json();

      let prompt = 'Need a public WebXR demo';
      let messageRes = makeRes();
      await demo.routes['POST /api/chats/message'](
        makeReq('POST', '/api/chats/message', { chatId: id, role: 'user', text: prompt }),
        messageRes,
      );

      let ws = new WebSocket(`ws://127.0.0.1:${port}/ws/chat`);
      await new Promise((resolve, reject) => {
        let timer = setTimeout(() => reject(new Error('Timeout waiting for demo chat.done')), 2000);
        ws.on('open', () => {
          ws.send(JSON.stringify({ method: 'chat.send', params: { chatId: id, prompt } }));
        });
        ws.on('message', (buffer) => {
          let msg = JSON.parse(String(buffer));
          if (msg.method === 'chat.done') {
            clearTimeout(timer);
            resolve();
          }
        });
        ws.on('error', reject);
      });
      ws.close();

      let chatRes = makeRes();
      await demo.routes['POST /api/chats/get'](makeReq('POST', '/api/chats/get', { id }), chatRes);
      let chat = chatRes.json();
      assert.equal(chat.messages.filter((message) => message.role === 'user' && message.text === prompt).length, 1);
      assert.equal(chat.messages.filter((message) => message.role === 'agent' && message.text?.includes(prompt)).length, 1);
    } finally {
      server.close();
    }
  });

  it('accepts prefixed public demo monitor websocket routes', async () => {
    let demo = createServerDemoMode({
      projectRoot: process.cwd(),
      env: { AGENT_PORTAL_DEMO_MODE: '1' },
    });
    let server = createServer();
    server.on('upgrade', (req, socket, head) => {
      if (!demo.handleUpgrade(req, socket, head)) socket.destroy();
    });
    let port = await listen(server);
    try {
      let ws = new WebSocket(`ws://127.0.0.1:${port}/pg/ws/monitor`);
      let snapshot = await new Promise((resolve, reject) => {
        let timer = setTimeout(() => reject(new Error('Timeout waiting for demo monitor snapshot')), 2000);
        ws.on('message', (buffer) => {
          let msg = JSON.parse(String(buffer));
          if (msg.method === 'snapshot') {
            clearTimeout(timer);
            resolve(msg);
          }
        });
        ws.on('error', reject);
      });
      ws.close();

      assert.equal(snapshot.params.state.project.path, '/workspace/agent-portal');
      assert.equal(snapshot.params.state.project.name, 'mcp-agent-portal');
    } finally {
      server.close();
    }
  });

  it('recovers stale public demo chat ids instead of surfacing a 404 in the UI', async () => {
    let demo = createServerDemoMode({
      projectRoot: process.cwd(),
      env: { AGENT_PORTAL_DEMO_MODE: '1' },
    });

    let chatRes = makeRes();
    await demo.routes['POST /api/chats/get'](
      makeReq('POST', '/api/chats/get', { id: 'demo-chat-stale' }),
      chatRes,
    );
    let chat = chatRes.json();
    assert.equal(chatRes.status, 200);
    assert.equal(chat.id, 'demo-chat-stale');
    assert.equal(chat.messages[0].role, 'agent');
    assert.ok(chat.subChats.length >= 2);
    assert.ok(chat.subChats.every((subChat) => subChat.parentChatId === chat.id));
  });

  it('recovers stale fixture-like chat ids with nested public demo sub-agents', async () => {
    let demo = createServerDemoMode({
      projectRoot: process.cwd(),
      env: { AGENT_PORTAL_DEMO_MODE: '1' },
    });

    let chatRes = makeRes();
    await demo.routes['POST /api/chats/get'](
      makeReq('POST', '/api/chats/get', { id: 'chat-public-stale' }),
      chatRes,
    );
    let chat = chatRes.json();
    assert.equal(chatRes.status, 200);
    assert.equal(chat.id, 'chat-public-stale');
    assert.ok(chat.subChats.length >= 2);
  });

  it('covers public demo UI endpoints with safe mock data', async () => {
    let demo = createServerDemoMode({
      projectRoot: process.cwd(),
      env: { AGENT_PORTAL_DEMO_MODE: '1' },
    });

    let infoRes = makeRes();
    demo.routes['GET /api/project-info'](makeReq('GET', '/api/project-info'), infoRes);
    assert.equal(infoRes.json().networkAccess.demoMode, true);

    let modelsRes = makeRes();
    demo.routes['GET /api/settings/models'](makeReq('GET', '/api/settings/models'), modelsRes);
    assert.ok(modelsRes.json().cliModels.length > 0);

    let metadataRes = makeRes();
    demo.routes['GET /api/project-graph-metadata'](makeReq('GET', '/api/project-graph-metadata'), metadataRes);
    assert.ok(metadataRes.json().metadata.stories.length > 0);

    let treeRes = makeRes();
    demo.routes['GET /api/agent-portal/tree'](makeReq('GET', '/api/agent-portal/tree?project=agent-portal'), treeRes);
    assert.equal(treeRes.json().configured, true);

    let libraryRes = makeRes();
    demo.routes['GET /api/agent-portal/open-library/tree'](makeReq('GET', '/api/agent-portal/open-library/tree'), libraryRes);
    assert.equal(libraryRes.json().configured, true);

    let approvalsRes = makeRes();
    demo.routes['GET /api/network-auth/pending'](makeReq('GET', '/api/network-auth/pending'), approvalsRes);
    assert.deepEqual(approvalsRes.json().pending, []);

    let marketplaceRes = makeRes();
    demo.routes['GET /api/marketplace'](makeReq('GET', '/api/marketplace'), marketplaceRes);
    let marketplace = marketplaceRes.json();
    assert.equal(typeof marketplace.installed, 'object');
    assert.equal(Array.isArray(marketplace.available), true);
    assert.equal(Array.isArray(marketplace.categories['rnd-pro']), true);
    assert.ok(marketplace.categories['rnd-pro'].every((item) => item.name && item.command));
  });

  it('records XR diagnostics in public demo mode', async () => {
    let demo = createServerDemoMode({
      projectRoot: process.cwd(),
      env: {
        AGENT_PORTAL_DEMO_MODE: '1',
        AGENT_PORTAL_RUNTIME_DIR: path.join(os.tmpdir(), 'agent-portal-demo-mode-test-runtime'),
      },
    });
    let req = makeReq('POST', '/api/xr-diagnostics/log', {
      clientId: 'quest-demo-client',
      event: 'spatial-session-frame-check',
      pageUrl: 'https://playground.rnd-pro.com/demos/agent-portal-vr/#spatial',
      secureContext: true,
      navigatorXr: true,
      modes: { inline: true, immersiveVr: true, immersiveAr: false },
      launch: { canLaunch: true, mode: 'immersive-vr', reason: 'ready' },
      session: { status: 'running', mode: 'immersive-vr', active: true, frames: 1 },
      details: {
        controller: { status: 'running', scene: { panelCount: 4 }, frameCount: 0 },
        secret: 'must-not-leak',
      },
    });
    req.headers = {
      host: 'playground.rnd-pro.com',
      'user-agent': 'Quest Browser',
    };
    req.socket = { remoteAddress: '192.168.100.55' };
    let infoCalls = 0;
    let oldInfo = console.info;
    console.info = () => {
      infoCalls += 1;
    };
    let postRes = makeRes();
    try {
      await demo.routes['POST /api/xr-diagnostics/log'](req, postRes);
    } finally {
      console.info = oldInfo;
    }

    let logsRes = makeRes();
    demo.routes['GET /api/xr-diagnostics/logs'](makeReq('GET', '/api/xr-diagnostics/logs'), logsRes);
    let entry = logsRes.json().logs.at(-1);
    let summaryRes = makeRes();
    demo.routes['GET /api/xr-diagnostics/summary'](makeReq('GET', '/api/xr-diagnostics/summary'), summaryRes);
    let summary = summaryRes.json();

    assert.equal(postRes.status, 200);
    assert.equal(postRes.json().demoMode, true);
    assert.equal(infoCalls, 0);
    assert.equal(entry.demoMode, true);
    assert.equal(entry.event, 'spatial-session-frame-check');
    assert.equal(entry.details.controller.scene.panelCount, 4);
    assert.equal('secret' in entry.details, false);
    assert.equal(summary.demoMode, true);
    assert.equal(summary.version, 'xr-diagnostics-summary-v1');
    assert.equal(summary.count, 1);
    assert.equal(summary.clientCount, 1);
    assert.equal(summary.latest.clientId, 'quest-demo-client');
    assert.equal(summary.latestClient.clientId, 'quest-demo-client');
    assert.equal(typeof summary.generatedAt, 'string');
    assert.equal(summary.staleAfterMs, 15000);
    assert.equal(typeof summary.latestClient.ageMs, 'number');
    assert.equal(summary.latestClient.stale, false);
    assert.equal(summary.latestClient.phase, 'running');
    assert.deepEqual(summary.latestClient.recentEvents.map((item) => item.event), ['spatial-session-frame-check']);
    assert.equal(summary.latestClient.recentEvents[0].mode, 'immersive-vr');
    assert.equal(summary.immersiveClientCount, 1);
    assert.equal(summary.latestImmersiveClient.clientId, 'quest-demo-client');
    assert.equal(summary.latest.event, 'spatial-session-frame-check');
    assert.equal(summary.launch.mode, 'immersive-vr');
    assert.equal(summary.eventCounts['spatial-session-frame-check'], 1);
    assert.equal(summary.troubleshooting.version, 'xr-three-troubleshooting-summary-v1');
    assert.equal(typeof summary.troubleshooting.status, 'string');
  });

  it('blocks server lifecycle actions in public demo mode', async () => {
    let demo = createServerDemoMode({
      projectRoot: process.cwd(),
      env: { AGENT_PORTAL_DEMO_MODE: '1' },
    });

    for (let route of ['POST /api/restart', 'POST /api/stop']) {
      let res = makeRes();
      await demo.routes[route](makeReq('POST', route.split(' ')[1]), res);
      let body = res.json();
      assert.equal(res.status, 403);
      assert.equal(body.ok, false);
      assert.equal(body.demoMode, true);
      assert.match(body.error, /disabled/i);
    }
  });

  it('serves selected project files from public GitHub snapshots', async () => {
    await withPublicSources(async (publicRoot) => {
      let demo = createServerDemoMode({
        projectRoot: process.cwd(),
        env: { AGENT_PORTAL_DEMO_MODE: '1', AGENT_PORTAL_PUBLIC_PROJECTS_ROOT: publicRoot },
      });

      let historyRes = makeRes();
      demo.routes['GET /api/projects/history'](makeReq('GET', '/api/projects/history'), historyRes);
      let poolProject = historyRes.json().projects.find((project) => project.id === 'agent-pool');
      assert.equal(poolProject.path, '/workspace/public-projects/agent-pool');
      assert.equal(poolProject.publicSource.repo, 'https://github.com/rnd-pro/agent-pool-mcp.git');

      let skeletonRes = makeRes();
      await demo.routes['POST /api/mcp-call'](
        makeReq('POST', '/api/mcp-call', {
          method: 'tools/call',
          params: { name: 'get_skeleton', arguments: { path: '/workspace/public-projects/agent-pool' } },
        }),
        skeletonRes,
      );
      let skeletonPayload = JSON.parse(skeletonRes.json().result.content[0].text);
      assert.equal(skeletonPayload.f['./'].includes('README.md'), true);
      assert.equal(skeletonPayload.f['src/'].includes('index.js'), true);
      assert.equal(skeletonPayload.f['src/'].includes('util.js'), true);
      assert.equal(skeletonPayload.publicSource.projectId, 'agent-pool');
      assert.deepEqual(skeletonPayload.n, {});
      assert.deepEqual(skeletonPayload.I['src/index.js'], ['./util.js']);
      assert.deepEqual(skeletonPayload.X['src/index.js'], ['source']);
      assert.deepEqual(skeletonPayload.X['src/util.js'], ['describeSource']);
      assert.equal(typeof skeletonPayload.L['src/index.js'], 'number');
      assert.equal(skeletonPayload.s.publicDemo, true);
      assert.equal(Object.keys(skeletonPayload.f).some((key) => key.startsWith('web/')), false);

      let fileRes = makeRes();
      await demo.routes['POST /api/file'](
        makeReq('POST', '/api/file', { path: '/workspace/public-projects/agent-pool/src/index.js' }),
        fileRes,
      );
      let file = fileRes.json();
      assert.equal(file.publicSource.projectId, 'agent-pool');
      assert.match(file.content, /github snapshot/);
    });
  });

  it('returns demo MCP data for workflow, pipeline, group, and task panels', async () => {
    let demo = createServerDemoMode({
      projectRoot: process.cwd(),
      env: { AGENT_PORTAL_DEMO_MODE: '1' },
    });

    for (let toolName of ['list_workflows', 'list_pipelines', 'list_groups', 'list_tasks', 'get_tracked_files']) {
      let res = makeRes();
      await demo.routes['POST /api/mcp-call'](
        makeReq('POST', '/api/mcp-call', {
          serverName: 'agent-pool',
          method: 'tools/call',
          params: { name: toolName, arguments: { json: true } },
        }),
        res,
      );
      let parsed = JSON.parse(res.json().result.content[0].text);
      assert.equal(Array.isArray(parsed), true, `${toolName} should return an array`);
      assert.ok(parsed.length > 0, `${toolName} should have demo rows`);
      if (toolName === 'list_groups') {
        assert.ok(parsed.length >= 5, 'list_groups should expose enough lanes for the public resource-groups board');
        assert.ok(
          parsed.every(group => Array.isArray(group.profiles) && group.profiles.length >= 2),
          'list_groups should expose kanban groups with multiple model profile cells'
        );
        assert.equal(
          parsed.some(group => group.name === 'test-group' || group.name === 'profile-group'),
          false,
          'list_groups must not expose local test resource groups'
        );
      }
    }
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

  it('reads browser-resolved public file paths without exposing blocked paths', async () => {
    let demo = createServerDemoMode({
      projectRoot: process.cwd(),
      env: { AGENT_PORTAL_DEMO_MODE: '1' },
    });

    let fileRes = makeRes();
    await demo.routes['POST /api/mcp-call'](
      makeReq('POST', '/api/mcp-call', {
        method: 'tools/call',
        params: { name: 'compact', arguments: { path: '/workspace/agent-portal/test/unit/server-demo-mode.test.js' } },
      }),
      fileRes,
    );
    let file = JSON.parse(fileRes.json().result.content[0].text);
    assert.equal(file.path, 'test/unit/server-demo-mode.test.js');
    assert.match(file.code, /server demo mode/);
    assert.equal(file.unavailable, undefined);

    let directRes = makeRes();
    await demo.routes['POST /api/file'](
      makeReq('POST', '/api/file', { path: '/workspace/agent-portal/src/node/server/demo-mode.js' }),
      directRes,
    );
    assert.match(directRes.json().content, /AGENT_PORTAL_DEMO_MODE/);

    let blockedRes = makeRes();
    await demo.routes['POST /api/file'](
      makeReq('POST', '/api/file', { path: '/workspace/agent-portal/tmp/private-note.md' }),
      blockedRes,
    );
    assert.equal(blockedRes.json().unavailable, true);
    assert.equal(blockedRes.json().raw, '');
  });

  it('builds the public demo skeleton from files that exist in the repository allowlist', async () => {
    let demo = createServerDemoMode({
      projectRoot: process.cwd(),
      env: { AGENT_PORTAL_DEMO_MODE: '1' },
    });

    let skeletonRes = makeRes();
    await demo.routes['POST /api/mcp-call'](
      makeReq('POST', '/api/mcp-call', {
        method: 'tools/call',
        params: { name: 'get_skeleton', arguments: {} },
      }),
      skeletonRes,
    );

    let parsed = JSON.parse(skeletonRes.json().result.content[0].text);
    assert.equal(parsed.f['scripts/diagnostics/'].includes('opencode-e2e.js'), true);
    assert.equal(parsed.f['test/integration/'].includes('api.test.js'), true);
    assert.equal(parsed.f['test/integration/'].includes('opencode-e2e.js'), false);
    assert.ok(Object.keys(parsed.I).length > 0);
    assert.ok(Object.keys(parsed.L).length > 0);
    assert.equal(Object.keys(parsed.f).some((key) => key.startsWith('tmp/')), false);
  });
});
