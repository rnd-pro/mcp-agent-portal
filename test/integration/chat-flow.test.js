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

let server;
let port;
let proxyManager;
let passed = 0;
let failed = 0;

async function setup() {
  let { startWebServer } = await import('../../src/node/server/web-server.js');
  let result = startWebServer(path.join(process.cwd(), 'tmp'));
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
  proxyManager.stopAll();
  server.close();
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
        provider: 'gemini',
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

  // Test 2: Success workflow propagation (streaming)
  await test('valid workflow triggers chat.delegated, streams metadata, and completes with chat.done', async () => {
    let ws = await connectChatClient();
    
    // Create a dummy workflow that runs very quickly
    const testDir = path.join(process.cwd(), '.agent-portal', 'workflows');
    const testFile = path.join(testDir, 'test-integration-workflow.md');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(testFile, `---
name: test-integration-workflow
description: Fast workflow for integration testing
tags: [integration-test]
entryPoint: test-step-1
---
# Step 1
This is a test.
\`\`\`bash
echo "Integration Test Success"
\`\`\`
`);

    try {
      let events = [];
      let receivedDone = new Promise((resolve, reject) => {
        let timer = setTimeout(() => reject(new Error('Timeout waiting for chat.done')), 15000);
        ws.on('message', (data) => {
          let msg = JSON.parse(data.toString());
          events.push(msg.method);
          if (msg.method === 'chat.done') {
            clearTimeout(timer);
            resolve(msg);
          }
        });
      });

      ws.send(JSON.stringify({
        method: 'chat.send',
        params: {
          chatId: 'test-chat-2',
          prompt: '/test-integration-workflow ',
          provider: 'mock'
        }
      }));

      let doneMsg = await receivedDone;
      
      assert.ok(events.includes('chat.delegated'), 'Should receive chat.delegated');
      assert.ok(events.includes('chat.meta'), 'Should receive streaming chat.meta');
      assert.ok(events.includes('chat.done'), 'Should complete with chat.done');
      assert.ok(doneMsg.params.taskId, 'Done message should include taskId');
    } finally {
      if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
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

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
