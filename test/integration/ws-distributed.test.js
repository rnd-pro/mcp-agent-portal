/**
 * Integration test: WebSocket distributed mode (Master ↔ Client)
 * 
 * Run directly: node test/integration/ws-distributed.test.js
 * 
 * Tests:
 * 1. Master accepts WS client connections on /ws/client
 * 2. Multiple clients can connect simultaneously
 * 3. Messages flow through virtual server pipes
 * 4. Client disconnect cleans up virtual server entry
 * 5. Handles rapid connect/disconnect cycles
 */
import assert from 'node:assert/strict';
import WebSocket from 'ws';

let server;
let port;
let proxyManager;
let passed = 0;
let failed = 0;

async function setup() {
  let { startWebServer } = await import('../../src/node/server/web-server.js');
  let result = startWebServer('/tmp');
  server = result.server;
  proxyManager = result.proxyManager;

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

function connectClient() {
  return new Promise((resolve, reject) => {
    let ws = new WebSocket(`ws://127.0.0.1:${port}/ws/client`);
    let timer = setTimeout(() => { ws.close(); reject(new Error('Connection timeout')); }, 3000);
    ws.on('open', () => { clearTimeout(timer); resolve(ws); });
    ws.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

async function teardown() {
  proxyManager.stopAll();
  server.close();
}

async function run() {
  await setup();
  console.log('▶ distributed WS topology');

  // Test 1: Basic connection
  await test('master accepts WS client connection on /ws/client', async () => {
    let ws = await connectClient();
    let hasRemote = [...proxyManager.servers.keys()].some(k => k.startsWith('remote-'));
    assert.ok(hasRemote, 'should have registered a virtual remote server');
    ws.close();
    await new Promise(r => setTimeout(r, 100));
  });

  // Test 2: Multiple concurrent clients
  await test('multiple clients connect simultaneously (5)', async () => {
    let clients = [];
    for (let i = 0; i < 5; i++) {
      clients.push(await connectClient());
    }
    let remoteCount = [...proxyManager.servers.keys()].filter(k => k.startsWith('remote-')).length;
    assert.ok(remoteCount >= 5, `expected >= 5 remote servers, got ${remoteCount}`);
    for (let ws of clients) ws.close();
    await new Promise(r => setTimeout(r, 200));
  });

  // Test 3: Message flow master → client
  await test('master sends message to client via virtual server', async () => {
    let ws = await connectClient();
    let remoteKey = [...proxyManager.servers.keys()].find(k => k.startsWith('remote-'));
    assert.ok(remoteKey, 'remote server should exist');

    let received = new Promise((resolve, reject) => {
      let timer = setTimeout(() => reject(new Error('No message received')), 2000);
      ws.on('message', (data) => { clearTimeout(timer); resolve(data.toString()); });
    });

    let virtualServer = proxyManager.servers.get(remoteKey);
    let testMsg = JSON.stringify({ jsonrpc: '2.0', method: 'test', id: 1 });
    virtualServer.process.stdin.write(testMsg);

    let result = await received;
    assert.equal(result.trim(), testMsg.trim(), 'client should receive the message');
    ws.close();
    await new Promise(r => setTimeout(r, 100));
  });

  // Test 4: Client → master message flow
  await test('client message reaches multiplexerCallback', async () => {
    let ws = await connectClient();
    let receivedMsg = null;
    let receivedServer = null;
    proxyManager.multiplexerCallback = (serverName, msg) => {
      receivedServer = serverName;
      receivedMsg = msg;
    };

    ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 42 }));
    await new Promise(r => setTimeout(r, 200));

    assert.ok(receivedServer?.startsWith('remote-'), 'server name should be remote-*');
    assert.equal(receivedMsg.method, 'tools/list');
    assert.equal(receivedMsg.id, 42);

    proxyManager.multiplexerCallback = null;
    ws.close();
    await new Promise(r => setTimeout(r, 100));
  });

  // Test 5: Disconnect cleanup
  await test('client disconnect removes virtual server from registry', async () => {
    let ws = await connectClient();
    let remoteKey = [...proxyManager.servers.keys()].find(k => k.startsWith('remote-'));
    assert.ok(remoteKey, 'should have remote server');

    ws.close();
    await new Promise(r => setTimeout(r, 300));

    assert.equal(proxyManager.servers.has(remoteKey), false, 'should be removed after disconnect');
  });

  // Test 6: Rapid cycles
  await test('handles 10 rapid connect/disconnect cycles', async () => {
    for (let i = 0; i < 10; i++) {
      let ws = await connectClient();
      ws.close();
      await new Promise(r => setTimeout(r, 50));
    }
    await new Promise(r => setTimeout(r, 500));
    let stale = [...proxyManager.servers.keys()].filter(k => k.startsWith('remote-'));
    assert.equal(stale.length, 0, 'no stale remote servers should remain');
  });

  // Test 7: Throughput
  await test('handles 100 messages in burst', async () => {
    let ws = await connectClient();
    let count = 0;
    proxyManager.multiplexerCallback = () => { count++; };

    for (let i = 0; i < 100; i++) {
      ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: i }));
    }
    await new Promise(r => setTimeout(r, 500));

    assert.ok(count >= 95, `expected >= 95 messages received, got ${count}`);
    proxyManager.multiplexerCallback = null;
    ws.close();
    await new Promise(r => setTimeout(r, 100));
  });

  await teardown();

  console.log(`\n${passed + failed} tests: ${passed} pass, ${failed} fail`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
