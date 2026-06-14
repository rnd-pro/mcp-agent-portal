/**
 * Integration test: Agent Chat Delegation Flow
 * 
 * Verifies that the WebSockets handle the full chat flow, including error propagation
 * and streaming events from the agent pool.
 */
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

let server;
let port;
let proxyManager;
let passed = 0;
let failed = 0;
let stateDir;
let projectRoot;
let originalEnv;
let stateGraphModule;

const TEST_ENV_KEYS = [
  'PORTAL_LOCAL_GATEWAY_DIR',
  'PORTAL_CONFIG_PATH',
  'PORTAL_CHATS_DIR',
  'PORTAL_STATE_DIR',
  'PORTAL_STATE_PATH',
  'PORTAL_WAL_PATH',
];

async function setup() {
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-portal-chat-flow-'));
  originalEnv = Object.fromEntries(TEST_ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.PORTAL_LOCAL_GATEWAY_DIR = path.join(stateDir, 'local-gateway');
  process.env.PORTAL_CONFIG_PATH = path.join(stateDir, 'agent-portal.json');
  process.env.PORTAL_CHATS_DIR = path.join(stateDir, 'agent-portal-chats');
  process.env.PORTAL_STATE_DIR = stateDir;
  process.env.PORTAL_STATE_PATH = path.join(stateDir, 'agent-portal-state.json');
  process.env.PORTAL_WAL_PATH = path.join(stateDir, 'agent-portal.wal');
  projectRoot = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(projectRoot, { recursive: true });

  let { startWebServer } = await import('../../src/node/server/web-server.js');
  stateGraphModule = await import('../../src/node/state-graph.js');
  let result = startWebServer(projectRoot);
  server = result.server;
  proxyManager = result.proxyManager;
  proxyManager.startAllServers();

  await new Promise((resolve) => {
    if (server.listening) {
      port = server.address().port;
      resolve();
    } else {
      server.on('listening', () => {
        port = server.address().port;
        resolve();
      });
    }
  });
}

function connectChatClient() {
  return new Promise((resolve, reject) => {
    let ws = new WebSocket(`ws://127.0.0.1:${port}/ws/chat`);
    let timer = setTimeout(() => { ws.close(); reject(new Error('Connection timeout')); }, 3000);
    ws.on('open', () => { clearTimeout(timer); resolve(ws); });
    ws.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

async function teardown() {
  proxyManager?.stopAll();
  if (server?.listening) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (stateGraphModule) {
    let sg = stateGraphModule.getStateGraph();
    await sg.flushChatWrites();
    sg.flush();
  }
  if (originalEnv) {
    for (let key of TEST_ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  }
  if (stateDir) fs.rmSync(stateDir, { recursive: true, force: true });
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✖ ${name}`);
    console.log(`    ${err.message}`);
  }
}

async function run() {
  await setup();
  console.log('▶ Agent Chat Integration Flow');
  
  // Give child MCP servers time to spin up
  console.log('  Waiting 3s for agent-pool child process to start...');
  await new Promise(r => setTimeout(r, 3000));

  await test('uses isolated state and config paths', async () => {
    let sg = stateGraphModule.getStateGraph();
    assert.ok(sg._snapshotPath.startsWith(stateDir), 'snapshot path should be under the test state dir');
    assert.ok(sg._walPath.startsWith(stateDir), 'wal path should be under the test state dir');
    assert.ok(sg._chatsDir.startsWith(stateDir), 'chat path should be under the test state dir');
    assert.ok(process.env.PORTAL_CONFIG_PATH.startsWith(stateDir), 'config path should be under the test state dir');
    assert.ok(process.env.PORTAL_LOCAL_GATEWAY_DIR.startsWith(stateDir), 'local-gateway path should be under the test state dir');
  });

  // Test 1: Error propagation
  await test('synchronous error triggers chat.error instead of hanging', async () => {
    let ws = await connectChatClient();
    
    // Mock the proxy manager to simulate a synchronous error from the agent-pool
    let originalRequest = proxyManager.requestFromChild;
    proxyManager.requestFromChild = async () => {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Simulated synchronous error' }]
      };
    };
    
    let receivedError = new Promise((resolve, reject) => {
      let timer = setTimeout(() => reject(new Error('Timeout waiting for chat.error')), 10000);
      ws.on('message', (data) => {
        let msg = JSON.parse(data.toString());
        if (msg.method === 'chat.error') {
          clearTimeout(timer);
          resolve(msg);
        } else if (msg.method === 'chat.delegated' && !msg.params.taskId) {
          clearTimeout(timer);
          reject(new Error('Received empty chat.delegated instead of chat.error'));
        }
      });
    });

    ws.send(JSON.stringify({
      method: 'chat.send',
      params: {
        chatId: 'test-chat-1',
        prompt: 'test error propagation',
      }
    }));

    let errorMsg = await receivedError;
    proxyManager.requestFromChild = originalRequest; // Restore
    
    assert.ok(errorMsg.params.error.includes('Simulated'), 'Should contain error text');
    ws.close();
  });

  await test('resource group routing does not leak manual provider/model overrides', async () => {
    let ws = await connectChatClient();
    let originalRequest = proxyManager.requestFromChild;
    let capturedArgs = null;
    proxyManager.requestFromChild = async (_server, _method, payload) => {
      capturedArgs = payload.arguments;
      return {
        isError: false,
        content: [{ type: 'text', text: 'Delegated task 11111111-2222-4333-8444-555555555555' }]
      };
    };

    let receivedDelegated = new Promise((resolve, reject) => {
      let timer = setTimeout(() => reject(new Error('Timeout waiting for chat.delegated')), 10000);
      ws.on('message', (data) => {
        let msg = JSON.parse(data.toString());
        if (msg.method === 'chat.delegated') {
          clearTimeout(timer);
          resolve(msg);
        }
      });
    });

    ws.send(JSON.stringify({
      method: 'chat.send',
      params: {
        chatId: 'resource-group-chat',
        prompt: 'test resource group routing',
        agent: 'orchestrator',
        resource_group: 'reasoning-heavy',
        provider: 'antigravity',
        model: 'default',
      }
    }));

    await receivedDelegated;
    proxyManager.requestFromChild = originalRequest;

    assert.equal(capturedArgs.resource_group, 'reasoning-heavy');
    assert.equal(capturedArgs.agent_slug, 'orchestrator');
    assert.equal(capturedArgs.provider, undefined);
    assert.equal(capturedArgs.model, undefined);
    ws.close();
  });

  await test('chat.send routes root chats through orchestrator even with stale specialist metadata', async () => {
    let ws = await connectChatClient();
    let { getStateGraph } = await import('../../src/node/state-graph.js');
    let sg = getStateGraph();
    let project = sg.addProject({ path: process.cwd(), name: 'agent-portal' });
    let chat = sg.createChat({
      name: 'Persisted agent chat',
      projectId: project.id,
      agent: 'qa-engineer',
      resource_group: 'verification',
      provider: 'antigravity',
      model: 'default',
    }, 'test');
    let originalRequest = proxyManager.requestFromChild;
    let capturedArgs = null;
    proxyManager.requestFromChild = async (_server, _method, payload) => {
      capturedArgs = payload.arguments;
      return {
        isError: false,
        content: [{ type: 'text', text: 'Delegated task 11111111-2222-4333-8444-555555555555' }]
      };
    };

    try {
      let receivedDelegated = new Promise((resolve, reject) => {
        let timer = setTimeout(() => reject(new Error('Timeout waiting for chat.delegated')), 10000);
        ws.on('message', (data) => {
          let msg = JSON.parse(data.toString());
          if (msg.method === 'chat.delegated') {
            clearTimeout(timer);
            resolve(msg);
          }
        });
      });

      ws.send(JSON.stringify({
        method: 'chat.send',
        params: {
          chatId: chat.id,
          prompt: 'use persisted agent',
        }
      }));

      await receivedDelegated;

      assert.equal(capturedArgs.agent_slug, 'orchestrator');
      assert.equal(capturedArgs.resource_group, 'verification');
      assert.equal(capturedArgs.provider, undefined);
      assert.equal(capturedArgs.model, undefined);
    } finally {
      proxyManager.requestFromChild = originalRequest;
      sg.deleteChat(chat.id, 'test');
      ws.close();
    }
  });

  await test('chat.send forwards structured files and context mode to delegate_task', async () => {
    let ws = await connectChatClient();
    let originalRequest = proxyManager.requestFromChild;
    let capturedArgs = null;
    proxyManager.requestFromChild = async (_server, _method, payload) => {
      capturedArgs = payload.arguments;
      return {
        isError: false,
        content: [{ type: 'text', text: 'Delegated task 11111111-2222-4333-8444-555555555555' }]
      };
    };

    try {
      let receivedDelegated = new Promise((resolve, reject) => {
        let timer = setTimeout(() => reject(new Error('Timeout waiting for chat.delegated')), 10000);
        ws.on('message', (data) => {
          let msg = JSON.parse(data.toString());
          if (msg.method === 'chat.delegated') {
            clearTimeout(timer);
            resolve(msg);
          }
        });
      });

      ws.send(JSON.stringify({
        method: 'chat.send',
        params: {
          chatId: 'context-files-chat',
          prompt: 'test context files',
          files: ['web/app.js', 'web/app.js', 'src/node/server.js'],
          context_mode: 'off',
        }
      }));

      await receivedDelegated;

      assert.deepEqual(capturedArgs.files, ['web/app.js', 'src/node/server.js']);
      assert.equal(capturedArgs.context_mode, 'off');
      assert.equal(capturedArgs.agent_slug, 'orchestrator');
    } finally {
      proxyManager.requestFromChild = originalRequest;
      ws.close();
    }
  });

  // Test 2: Success task propagation (streaming)
  await test('valid delegated task triggers chat.delegated, streams metadata, and completes with chat.done', async () => {
    let ws = await connectChatClient();
    let originalRequest = proxyManager.requestFromChild;
    let taskId = '11111111-2222-4333-8444-555555555555';

    try {
      proxyManager.requestFromChild = async (_server, _method, payload) => {
        if (payload?.arguments?.name === 'delegate_task' || payload?.name === 'delegate_task') {
          return { content: [{ type: 'text', text: `Delegated task: ${taskId}` }] };
        }
        if (payload?.arguments?.name === 'get_task_result' || payload?.name === 'get_task_result') {
          return {
            content: [{
              type: 'text',
              text: [
                '## Agent Response',
                'Integration Test Success',
              ].join('\n'),
            }],
          };
        }
        return originalRequest.call(proxyManager, _server, _method, payload);
      };

      let events = [];
      let receivedDone = new Promise((resolve, reject) => {
        let timer = setTimeout(() => reject(new Error(`Timeout waiting for chat.done; events: ${events.join(', ')}`)), 15000);
        ws.on('message', (data) => {
          let msg = JSON.parse(data.toString());
          events.push(msg.method);
          if (msg.method === 'chat.delegated') {
            proxyManager.taskRouter.route({
              params: {
                taskId,
                type: 'event',
                data: {
                  type: 'message',
                  role: 'assistant',
                  content: 'Integration Test Success',
                },
              },
            });
            proxyManager.taskRouter.route({
              params: {
                taskId,
                type: 'done',
                data: { meta: { startedAt: Date.now(), chatId: msg.params.chatId } },
              },
            });
          }
          if (msg.method === 'chat.done') {
            clearTimeout(timer);
            resolve(msg);
          }
        });
      });

      ws.send(JSON.stringify({
        method: 'chat.send',
        params: {
          prompt: 'stream integration task',
          provider: 'mock',
        }
      }));

      let doneMsg = await receivedDone;
      
      assert.ok(events.includes('chat.delegated'), 'Should receive chat.delegated');
      assert.ok(events.includes('chat.meta'), 'Should receive streaming chat.meta');
      assert.ok(events.includes('chat.done'), 'Should complete with chat.done');
      assert.ok(doneMsg.params.taskId, 'Done message should include taskId');
    } finally {
      proxyManager.requestFromChild = originalRequest;
      ws.close();
    }
  });

  await test('project transaction event is delivered before chat.done and persisted', async () => {
    let ws = await connectChatClient();
    let originalRequest = proxyManager.requestFromChild;
    let taskId = '11111111-2222-4333-8444-555555555555';
    let delegatedChatId = null;
    let projectTransactionEvent = null;
    let doneEvent = null;
    let events = [];

    proxyManager.requestFromChild = async (_server, _method, payload) => {
      if (payload?.arguments?.name === 'delegate_task' || payload?.name === 'delegate_task') {
        return { content: [{ type: 'text', text: `Delegated task: ${taskId}` }] };
      }
      if (payload?.arguments?.name === 'get_task_result' || payload?.name === 'get_task_result') {
        return {
          content: [{
            type: 'text',
            text: [
              '## Agent Response',
              'Added runtime panel.',
              '```project-transaction-v1',
              '{"version":"project-transaction-v1","id":"tx:integration-panel","operations":[{"type":"layout.addPanel","layout":"graph","panel":{"id":"integration-panel","component":"sn-list-item"}}]}',
              '```',
            ].join('\n'),
          }],
        };
      }
      return originalRequest.call(proxyManager, _server, _method, payload);
    };

    try {
      let receivedDone = new Promise((resolve, reject) => {
        let timer = setTimeout(() => reject(new Error('Timeout waiting for chat.done')), 10000);
        ws.on('message', (data) => {
          let msg = JSON.parse(data.toString());
          events.push(msg.method);
          if (msg.method === 'chat.delegated') {
            delegatedChatId = msg.params.chatId;
            proxyManager.taskRouter.route({
              params: {
                taskId,
                type: 'done',
                data: { meta: { startedAt: Date.now(), chatId: delegatedChatId } },
              },
            });
          }
          if (msg.method === 'chat.projectTransaction') {
            projectTransactionEvent = msg;
          }
          if (msg.method === 'chat.done') {
            doneEvent = msg;
            clearTimeout(timer);
            resolve(msg);
          }
        });
      });

      ws.send(JSON.stringify({
        method: 'chat.send',
        params: {
          prompt: 'emit project transaction',
          cwd: process.cwd(),
        }
      }));

      await receivedDone;

      assert.ok(projectTransactionEvent, 'Should receive chat.projectTransaction');
      assert.equal(projectTransactionEvent.params.transaction.id, 'tx:integration-panel');
      assert.equal(projectTransactionEvent.params.transaction.targetProject, `agent-portal:${projectTransactionEvent.params.projectId}`);
      assert.ok(doneEvent.params.taskId, 'Done message should include taskId');
      assert.ok(
        events.indexOf('chat.projectTransaction') < events.indexOf('chat.done'),
        'chat.projectTransaction must arrive before chat.done',
      );

      let res = await fetch(`http://127.0.0.1:${port}/api/chats/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: delegatedChatId }),
      });
      let chat = await res.json();
      assert.equal(chat.projectTransactions?.[0]?.id, 'tx:integration-panel');
    } finally {
      proxyManager.requestFromChild = originalRequest;
      ws.close();
    }
  });

  await teardown();
  console.log(`\n${passed + failed} tests: ${passed} pass, ${failed} fail`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(async (err) => {
  console.error('Fatal:', err);
  try {
    await teardown();
  } catch (teardownError) {
    console.error('Teardown failed:', teardownError);
  }
  process.exit(1);
});
