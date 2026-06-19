import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.writes = [];
    this.destroyed = false;
    this.ended = false;
  }

  write(data) {
    this.writes.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
  }

  destroy() {
    this.destroyed = true;
  }

  end() {
    this.ended = true;
  }
}

class FakeStream extends EventEmitter {
  constructor() {
    super();
    this.writes = [];
  }

  write(data) {
    this.writes.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
  }
}

function closeFrame() {
  return Buffer.from([0x88, 0x00]);
}

function textFrame(data) {
  let payload = Buffer.from(data, 'utf8');
  if (payload.length >= 126) {
    throw new Error('test textFrame only supports short payloads');
  }
  return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
}

function framedMessage(message) {
  let payload = Buffer.from(JSON.stringify(message), 'utf8');
  return Buffer.concat([
    Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`),
    payload,
  ]);
}

function parseClientTextFrame(frame) {
  let payloadLength = frame[1] & 0x7f;
  let offset = 2;
  if (payloadLength === 126) {
    payloadLength = frame.readUInt16BE(2);
    offset = 4;
  } else if (payloadLength === 127) {
    payloadLength = Number(frame.readBigUInt64BE(2));
    offset = 10;
  }
  let mask = frame.slice(offset, offset + 4);
  let payload = frame.slice(offset + 4, offset + 4 + payloadLength);
  let unmasked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) {
    unmasked[i] = payload[i] ^ mask[i % 4];
  }
  return JSON.parse(unmasked.toString('utf8'));
}

function parseFramedStdout(writes) {
  let output = Buffer.concat(writes).toString('utf8');
  let headerEnd = output.indexOf('\r\n\r\n');
  assert.notEqual(headerEnd, -1);
  let header = output.slice(0, headerEnd);
  let length = Number(header.match(/Content-Length:\s*(\d+)/i)?.[1]);
  let body = output.slice(headerEnd + 4, headerEnd + 4 + length);
  return JSON.parse(body);
}

function createProxyHarness(mod, options = {}) {
  let { buffered = [], ...proxyOptions } = options;
  let stdin = new FakeStream();
  let stdout = new FakeStream();
  let sockets = [];
  let timers = [];
  let exits = [];
  let proxy = mod.startStdioProxy(12345, buffered, {
    stdin,
    stdout,
    exit: code => exits.push(code),
    createConnection: (_options, onConnect) => {
      let socket = new FakeSocket();
      sockets.push(socket);
      queueMicrotask(onConnect);
      return socket;
    },
    randomBytes: size => Buffer.alloc(size, 1),
    setTimeout: fn => {
      timers.push(fn);
      return fn;
    },
    clearTimeout: fn => {
      timers = timers.filter(timer => timer !== fn);
    },
    logger: { error() {}, warn() {} },
    retryBaseMs: 1,
    retryMaxMs: 1,
    ...proxyOptions,
  });
  return { stdin, stdout, sockets, timers, exits, proxy };
}

describe('backend lifecycle', () => {
  it('writes the installed package version to backend port files', async () => {
    let tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-backend-home-'));
    let tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-backend-project-'));
    let originalHome = process.env.HOME;
    process.env.HOME = tmpHome;

    try {
      let mod = await import(`../../src/node/server/backend-lifecycle.js?test=${Date.now()}`);
      mod.writePortFile(tmpProject, 12345);

      let hash = createHash('md5').update(path.resolve(tmpProject)).digest('hex').slice(0, 8);
      let portFile = path.join(tmpHome, '.local-gateway', 'backends', `portal-${hash}.json`);
      let data = JSON.parse(fs.readFileSync(portFile, 'utf8'));
      let pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
      let projectName = path.basename(tmpProject);

      assert.equal(data.version, pkg.version);
      assert.notEqual(data.version, '0.0.0');
      assert.equal(data.name, projectName);
      assert.equal(data.projectName, projectName);
      mod.removePortFile(tmpProject);
    } finally {
      process.env.HOME = originalHome;
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  it('keeps backend port files when pid probes return EPERM', async () => {
    let tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-backend-eperm-home-'));
    let tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-backend-eperm-project-'));
    let originalHome = process.env.HOME;
    let originalKill = process.kill;
    process.env.HOME = tmpHome;
    process.kill = () => {
      let error = new Error('operation not permitted');
      error.code = 'EPERM';
      throw error;
    };

    try {
      let mod = await import(`../../src/node/server/backend-lifecycle.js?test=${Date.now()}-eperm`);
      mod.writePortFile(tmpProject, 12345);

      let backends = mod.listBackends();

      assert.equal(backends.length, 1);
      assert.equal(backends[0].port, 12345);
      assert.equal(backends[0].project, path.resolve(tmpProject));
    } finally {
      process.kill = originalKill;
      process.env.HOME = originalHome;
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  it('serializes backend startup with a per-project lock', async () => {
    let tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-backend-lock-home-'));
    let tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-backend-lock-project-'));
    let originalHome = process.env.HOME;
    process.env.HOME = tmpHome;

    try {
      let mod = await import(`../../src/node/server/backend-lifecycle.js?test=${Date.now()}-lock`);
      let releaseFirst = await mod.acquireBackendLock(tmpProject, {
        timeoutMs: 500,
        staleMs: 10000,
        retryMs: 10,
      });
      let secondResolved = false;
      let second = mod.acquireBackendLock(tmpProject, {
        timeoutMs: 1000,
        staleMs: 10000,
        retryMs: 10,
      }).then((releaseSecond) => {
        secondResolved = true;
        return releaseSecond;
      });

      await new Promise(resolve => setTimeout(resolve, 50));
      assert.equal(secondResolved, false);

      releaseFirst();
      let releaseSecond = await second;
      assert.equal(secondResolved, true);
      releaseSecond();
    } finally {
      process.env.HOME = originalHome;
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  it('does not steal a fresh backend lock before the owner file is written', async () => {
    let tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-backend-fresh-lock-home-'));
    let tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-backend-fresh-lock-project-'));
    let originalHome = process.env.HOME;
    process.env.HOME = tmpHome;

    try {
      let hash = createHash('md5').update(path.resolve(tmpProject)).digest('hex').slice(0, 8);
      let lockDir = path.join(tmpHome, '.local-gateway', 'backends', `portal-${hash}.lock`);
      fs.mkdirSync(lockDir, { recursive: true });
      let mod = await import(`../../src/node/server/backend-lifecycle.js?test=${Date.now()}-fresh-lock`);
      let secondResolved = false;
      let second = mod.acquireBackendLock(tmpProject, {
        timeoutMs: 1000,
        staleMs: 10000,
        retryMs: 10,
      }).then((releaseSecond) => {
        secondResolved = true;
        return releaseSecond;
      });

      await new Promise(resolve => setTimeout(resolve, 50));
      assert.equal(secondResolved, false);

      fs.rmSync(lockDir, { recursive: true, force: true });
      let releaseSecond = await second;
      assert.equal(secondResolved, true);
      releaseSecond();
    } finally {
      process.env.HOME = originalHome;
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  it('reconnects after a backend websocket closes after handshake', async () => {
    let mod = await import(`../../src/node/server/backend-lifecycle.js?test=${Date.now()}-reconnect`);
    let harness = createProxyHarness(mod);

    await Promise.resolve();
    assert.equal(harness.sockets.length, 1);
    harness.sockets[0].emit('data', Buffer.from('HTTP/1.1 101 Switching Protocols\r\n\r\n'));
    harness.sockets[0].emit('close');

    assert.deepEqual(harness.exits, []);
    assert.equal(harness.timers.length, 1);

    harness.timers.shift()();
    await Promise.resolve();
    assert.equal(harness.sockets.length, 2);
    assert.deepEqual(harness.exits, []);

    harness.proxy.stop();
  });

  it('reconnects on websocket close frames instead of exiting', async () => {
    let mod = await import(`../../src/node/server/backend-lifecycle.js?test=${Date.now()}-close-frame`);
    let harness = createProxyHarness(mod);

    await Promise.resolve();
    harness.sockets[0].emit('data', Buffer.concat([
      Buffer.from('HTTP/1.1 101 Switching Protocols\r\n\r\n'),
      closeFrame(),
    ]));

    assert.deepEqual(harness.exits, []);
    assert.equal(harness.timers.length, 1);

    harness.timers.shift()();
    await Promise.resolve();
    assert.equal(harness.sockets.length, 2);

    harness.proxy.stop();
  });

  it('exits after max retries before the first websocket handshake', async () => {
    let mod = await import(`../../src/node/server/backend-lifecycle.js?test=${Date.now()}-startup-retries`);
    let harness = createProxyHarness(mod, { maxRetries: 2 });

    await Promise.resolve();
    harness.sockets[0].emit('close');
    assert.equal(harness.timers.length, 1);

    harness.timers.shift()();
    await Promise.resolve();
    harness.sockets[1].emit('close');
    assert.equal(harness.timers.length, 1);

    harness.timers.shift()();
    await Promise.resolve();
    harness.sockets[2].emit('close');

    assert.deepEqual(harness.exits, [1]);
  });

  it('keeps retrying after max retries once a websocket handshake previously succeeded', async () => {
    let mod = await import(`../../src/node/server/backend-lifecycle.js?test=${Date.now()}-post-connect-retries`);
    let harness = createProxyHarness(mod, { maxRetries: 2 });

    await Promise.resolve();
    harness.sockets[0].emit(
      'data',
      Buffer.from('HTTP/1.1 101 Switching Protocols\r\n\r\n'),
    );

    for (let i = 0; i < 5; i++) {
      harness.sockets.at(-1).emit('close');
      assert.equal(harness.timers.length, 1);
      harness.timers.shift()();
      await Promise.resolve();
    }

    assert.equal(harness.sockets.length, 6);
    assert.deepEqual(harness.exits, []);

    harness.proxy.stop();
  });

  it('queues stdin messages while disconnected and flushes after reconnect', async () => {
    let mod = await import(`../../src/node/server/backend-lifecycle.js?test=${Date.now()}-queue`);
    let harness = createProxyHarness(mod);

    await Promise.resolve();
    harness.sockets[0].emit('data', Buffer.from('HTTP/1.1 101 Switching Protocols\r\n\r\n'));
    harness.sockets[0].emit('close');
    harness.stdin.emit('data', Buffer.from('{"jsonrpc":"2.0","method":"tools/list","id":1}\n'));

    assert.equal(harness.timers.length, 2);
    harness.timers.shift()();
    await Promise.resolve();
    harness.sockets[1].emit('data', Buffer.from('HTTP/1.1 101 Switching Protocols\r\n\r\n'));

    assert.equal(harness.sockets[1].writes.length, 2);
    assert.deepEqual(harness.exits, []);

    harness.proxy.stop();
  });

  it('forwards buffered framed initialize messages and keeps framed output', async () => {
    let mod = await import(
      `../../src/node/server/backend-lifecycle.js?test=${Date.now()}-framed-init`
    );
    let initialize = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        roots: [{ uri: 'file:///tmp/portal-framed-root' }],
        clientInfo: { name: 'codex-managed', version: 'test' },
      },
    };
    let harness = createProxyHarness(mod, {
      buffered: [framedMessage(initialize)],
    });

    await Promise.resolve();
    harness.sockets[0].emit('data', Buffer.from('HTTP/1.1 101 Switching Protocols\r\n\r\n'));

    assert.equal(harness.sockets[0].writes.length, 2);
    assert.deepEqual(parseClientTextFrame(harness.sockets[0].writes[1]), initialize);

    let response = {
      jsonrpc: '2.0',
      id: 1,
      result: { serverInfo: { name: 'mcp-agent-portal' } },
    };
    harness.sockets[0].emit('data', textFrame(JSON.stringify(response)));

    assert.deepEqual(parseFramedStdout(harness.stdout.writes), response);
    assert.deepEqual(harness.exits, []);

    harness.proxy.stop();
  });

  it('returns a JSON-RPC error when queued request waits too long disconnected', async () => {
    let mod = await import(`../../src/node/server/backend-lifecycle.js?test=${Date.now()}-queue-timeout`);
    let harness = createProxyHarness(mod, { queuedMessageTimeoutMs: 1 });

    await Promise.resolve();
    harness.sockets[0].emit('data', Buffer.from('HTTP/1.1 101 Switching Protocols\r\n\r\n'));
    harness.sockets[0].emit('close');
    harness.stdin.emit('data', Buffer.from('{"jsonrpc":"2.0","method":"tools/list","id":7}\n'));

    assert.equal(harness.timers.length, 2);
    harness.timers.at(-1)();

    let response = JSON.parse(Buffer.concat(harness.stdout.writes).toString('utf8').trim());
    assert.equal(response.id, 7);
    assert.equal(response.error.code, -32000);
    assert.match(response.error.message, /Agent Portal proxy is disconnected/);

    harness.proxy.stop();
  });

  it('preserves queued framed stdin messages across post-connect reconnect storms', async () => {
    let mod = await import(`../../src/node/server/backend-lifecycle.js?test=${Date.now()}-framed-queue`);
    let harness = createProxyHarness(mod, { maxRetries: 1 });

    await Promise.resolve();
    harness.sockets[0].emit('data', Buffer.from('HTTP/1.1 101 Switching Protocols\r\n\r\n'));
    harness.sockets[0].emit('close');
    harness.stdin.emit('data', Buffer.from('Content-Length: 39\r\n\r\n{"jsonrpc":"2.0","method":"tools/list"}'));

    harness.timers.shift()();
    await Promise.resolve();
    harness.sockets[1].emit('close');
    harness.timers.shift()();
    await Promise.resolve();
    harness.sockets[2].emit('data', Buffer.from('HTTP/1.1 101 Switching Protocols\r\n\r\n'));

    assert.equal(harness.sockets[2].writes.length, 2);
    assert.deepEqual(harness.exits, []);

    harness.proxy.stop();
  });

  it('still exits cleanly when stdin ends', async () => {
    let mod = await import(`../../src/node/server/backend-lifecycle.js?test=${Date.now()}-stdin-end`);
    let harness = createProxyHarness(mod);

    await Promise.resolve();
    harness.stdin.emit('end');

    assert.deepEqual(harness.exits, [0]);
    assert.equal(harness.sockets[0].ended, true);
  });
});
