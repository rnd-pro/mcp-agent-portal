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

  // Test 2: Success workflow propagation (streaming)
  await test('valid workflow triggers chat.delegated, streams events, and completes with chat.done', async () => {
    let ws = await connectChatClient();
    
    // Create a dummy workflow that runs very quickly
    const testDir = path.join(process.cwd(), 'packages', 'context-x-mcp', 'workflows');
    const testFile = path.join(testDir, 'test-integration-workflow.md');
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
    assert.ok(events.includes('chat.event'), 'Should receive streaming chat.event');
    assert.ok(events.includes('chat.done'), 'Should complete with chat.done');
    
    console.log('[Test 2] doneMsg.params.text:', doneMsg.params.text);
    assert.ok(doneMsg.params.text.includes('Mock final response'), 'Done message should contain execution result');

    // Cleanup test workflow
    fs.unlinkSync(testFile);
    ws.close();
  });

  await teardown();
  console.log(`\n${passed + failed} tests: ${passed} pass, ${failed} fail`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
