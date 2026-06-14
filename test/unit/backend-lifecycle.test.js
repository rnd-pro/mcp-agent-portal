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

function createProxyHarness(mod) {
  let stdin = new FakeStream();
  let stdout = new FakeStream();
  let sockets = [];
  let timers = [];
  let exits = [];
  let proxy = mod.startStdioProxy(12345, [], {
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

  it('queues stdin messages while disconnected and flushes after reconnect', async () => {
    let mod = await import(`../../src/node/server/backend-lifecycle.js?test=${Date.now()}-queue`);
    let harness = createProxyHarness(mod);

    await Promise.resolve();
    harness.sockets[0].emit('data', Buffer.from('HTTP/1.1 101 Switching Protocols\r\n\r\n'));
    harness.sockets[0].emit('close');
    harness.stdin.emit('data', Buffer.from('{"jsonrpc":"2.0","method":"tools/list","id":1}\n'));

    assert.equal(harness.timers.length, 1);
    harness.timers.shift()();
    await Promise.resolve();
    harness.sockets[1].emit('data', Buffer.from('HTTP/1.1 101 Switching Protocols\r\n\r\n'));

    assert.equal(harness.sockets[1].writes.length, 2);
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
