// @ctx backend-lifecycle.ctx
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCAL_GATEWAY_DIR = join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.local-gateway', 'backends');

function _getVersion() {
  try {
    return JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')).version;
  } catch {
    return '0.0.0';
  }
}

function getPortFilePath(rootPath) {
  const absPath = resolve(rootPath);
  const hash = createHash('md5').update(absPath).digest('hex').slice(0, 8);
  return join(LOCAL_GATEWAY_DIR, `portal-${hash}.json`);
}

function readPortFile(rootPath) {
  const file = getPortFilePath(rootPath);
  if (!existsSync(file)) return null;
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    try {
      process.kill(data.pid, 0);
    } catch {
      try { unlinkSync(file); } catch {}
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function writePortFile(rootPath, port) {
  mkdirSync(LOCAL_GATEWAY_DIR, { recursive: true });
  const absPath = resolve(rootPath);
  const data = {
    port,
    pid: process.pid,
    project: absPath,
    name: 'mcp-agent-portal',
    version: _getVersion(),
    startedAt: Date.now()
  };
  writeFileSync(getPortFilePath(rootPath), JSON.stringify(data, null, 2));
}

export function removePortFile(rootPath) {
  try { unlinkSync(getPortFilePath(rootPath)); } catch {}
}

export function listBackends() {
  if (!existsSync(LOCAL_GATEWAY_DIR)) return [];
  const files = readdirSync(LOCAL_GATEWAY_DIR).filter(f => f.endsWith('.json') && f.startsWith('portal-'));
  const active = [];
  for (const f of files) {
    try {
      const data = JSON.parse(readFileSync(join(LOCAL_GATEWAY_DIR, f), 'utf8'));
      try {
        process.kill(data.pid, 0);
        active.push(data);
      } catch {
        try { unlinkSync(join(LOCAL_GATEWAY_DIR, f)); } catch {}
      }
    } catch {}
  }
  return active;
}

function _srcChanged(startedAt) {
  try {
    const dir = join(__dirname, '..'); // point to src/
    const { statSync, readdirSync } = require('fs');
    function check(d) {
      const files = readdirSync(d, { withFileTypes: true });
      for (const f of files) {
        const p = join(d, f.name);
        if (f.isDirectory()) {
          if (check(p)) return true;
        } else if (f.isFile() && f.name.endsWith('.js')) {
          if (statSync(p).mtimeMs > startedAt) return true;
        }
      }
      return false;
    }
    return check(dir);
  } catch {
    return false;
  }
}

export async function ensureBackend(rootPath, { force } = {}) {
  const absPath = resolve(rootPath);
  const existing = readPortFile(absPath);
  
  if (existing) {
    const currentVersion = _getVersion();
    const needRestart = force || (existing.version && existing.version !== currentVersion) || _srcChanged(existing.startedAt);
    
    if (needRestart) {
      if (existing.version !== currentVersion) {
        console.error(`[portal] Version mismatch: running ${existing.version}, installed ${currentVersion}`);
      } else if (_srcChanged(existing.startedAt)) {
        console.error('[portal] Source files changed, restarting...');
      }
      console.error('[portal] Restarting backend...');
      try { process.kill(existing.pid, 'SIGTERM'); } catch {}
      try { unlinkSync(getPortFilePath(absPath)); } catch {}
      await new Promise(r => setTimeout(r, 500));
    } else {
      return existing.port;
    }
  }

  const backendScript = join(__dirname, 'backend.js');
  spawn(process.execPath, [backendScript, absPath], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, PORTAL_BACKEND: '1' }
  }).unref();

  const portFile = getPortFilePath(absPath);
  const start = Date.now();
  
  while (Date.now() - start < 10000) {
    await new Promise(r => setTimeout(r, 200));
    if (existsSync(portFile)) {
      const b = readPortFile(absPath);
      if (b) return b.port;
    }
  }
  
  throw new Error('Backend failed to start within 10s');
}

export function startStdioProxy(port, buffered = []) {
  const key = randomBytes(16).toString('base64');
  const ws = createConnection({ host: '127.0.0.1', port }, () => {
    ws.write(`GET /mcp-ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
  });

  let connected = false;
  let buffer = Buffer.alloc(0);
  let queue = [...buffered];
  const rl = createInterface({ input: process.stdin, terminal: false });

  function maskAndFrame(str) {
    const data = Buffer.from(str, 'utf8');
    const mask = randomBytes(4);
    const masked = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i++) {
      masked[i] = data[i] ^ mask[i % 4];
    }
    let header;
    if (data.length < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x81; // text, fin
      header[1] = 0x80 | data.length; // masked
    } else if (data.length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 0xfe;
      header.writeUInt16BE(data.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 0xff;
      header.writeBigUInt64BE(BigInt(data.length), 2);
    }
    return Buffer.concat([header, mask, masked]);
  }

  function parseFrame(buf) {
    if (buf.length < 2) return null;
    const opcode = buf[0] & 0x0f;
    let payloadLen = buf[1] & 0x7f;
    let offset = 2;
    if (payloadLen === 126) {
      if (buf.length < 4) return null;
      payloadLen = buf.readUInt16BE(2);
      offset = 4;
    } else if (payloadLen === 127) {
      if (buf.length < 10) return null;
      payloadLen = Number(buf.readBigUInt64BE(2));
      offset = 10;
    }
    if (buf.length < offset + payloadLen) return null;
    return {
      opcode,
      data: buf.slice(offset, offset + payloadLen).toString('utf8'),
      totalLen: offset + payloadLen
    };
  }

  rl.on('line', line => {
    if (connected) {
      try { ws.write(maskAndFrame(line)); } catch {}
    } else {
      queue.push(line);
    }
  });

  rl.on('close', () => {
    ws.end();
    process.exit(0);
  });

  ws.on('data', chunk => {
    if (!connected) {
      const combined = Buffer.concat([buffer, chunk]);
      const idx = combined.indexOf('\r\n\r\n');
      if (idx === -1) {
        buffer = combined;
        return;
      }
      if (!combined.slice(0, idx).toString().includes('101')) {
        console.error('[portal] WebSocket handshake failed');
        process.exit(1);
      }
      connected = true;
      buffer = combined.slice(idx + 4);
      for (const line of queue) {
        try { ws.write(maskAndFrame(line)); } catch {}
      }
      queue = [];
    } else {
      buffer = Buffer.concat([buffer, chunk]);
    }

    while (buffer.length >= 2) {
      const frame = parseFrame(buffer);
      if (!frame) break;
      buffer = buffer.slice(frame.totalLen);
      
      if (frame.opcode === 1) { // text
        process.stdout.write(frame.data + '\n');
      } else if (frame.opcode === 8) { // close
        process.exit(0);
      } else if (frame.opcode === 9) { // ping
        const pong = Buffer.alloc(2);
        pong[0] = 0x8a;
        pong[1] = 0x00;
        ws.write(pong);
      }
    }
  });

  ws.on('close', () => process.exit(0));
  ws.on('error', err => {
    console.error(`[portal] Proxy connection error: ${err.message}`);
    process.exit(1);
  });
}
