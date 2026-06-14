// @ctx backend-lifecycle.ctx
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCAL_GATEWAY_ROOT = process.env.PORTAL_LOCAL_GATEWAY_DIR
  || join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.local-gateway');
const LOCAL_GATEWAY_DIR = join(LOCAL_GATEWAY_ROOT, 'backends');

function _getVersion() {
  try {
    return JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'package.json'), 'utf8')).version;
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
      try { unlinkSync(file); } catch (e) { /* ignore cleanup error */ }
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function writePortFile(rootPath, port, networkAccess = {}) {
  mkdirSync(LOCAL_GATEWAY_DIR, { recursive: true });
  const absPath = resolve(rootPath);
  const projectName = basename(absPath) || 'root';
  const localUrl = networkAccess.localUrl || `http://127.0.0.1:${port}/`;
  const mcpDirect = `${localUrl.replace(/\/$/, '')}/mcp`;
  const data = {
    port,
    host: networkAccess.bindHost || '127.0.0.1',
    lanEnabled: networkAccess.lanEnabled === true,
    localUrl,
    lanUrls: networkAccess.lanUrls || [],
    pid: process.pid,
    project: absPath,
    name: projectName,
    projectName,
    version: _getVersion(),
    startedAt: Date.now(),
    mcpUrl: `http://portal.local/mcp`,
    mcpDirect,
    webDirect: localUrl,
  };
  writeFileSync(getPortFilePath(rootPath), JSON.stringify(data, null, 2));
}

export function removePortFile(rootPath) {
  try { unlinkSync(getPortFilePath(rootPath)); } catch (e) { /* ignore cleanup error */ }
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
      } catch (err) {
        try { unlinkSync(join(LOCAL_GATEWAY_DIR, f)); } catch (e) { console.debug('[portal] Cleanup error:', e.message); }
      }
    } catch (e) { console.warn('[portal] Failed to read backend file:', f, e.message); }
  }
  return active;
}
export async function ensureBackend(rootPath, { force } = {}) {
  const absPath = resolve(rootPath);
  
  const existing = readPortFile(absPath);
  
  if (existing) {
    const currentVersion = _getVersion();
    // ONLY restart on explicit force or real version mismatch (npm update).
    // NEVER restart on source changes — this is a shared singleton backend
    // serving multiple IDE instances. Killing it disconnects ALL of them.
    // Use `npx agent-portal --restart` for manual restarts after code changes.
    const needRestart = force || (existing.version && existing.version !== currentVersion && currentVersion !== '0.0.0');
    
    if (needRestart) {
      console.error(`[portal] Version mismatch: running ${existing.version}, installed ${currentVersion}. Restarting...`);
      try { process.kill(existing.pid, 'SIGTERM'); } catch (e) { console.warn('[portal] Failed to kill old backend:', e.message); }
      try { unlinkSync(getPortFilePath(absPath)); } catch (e) { /* ignore cleanup error */ }
      // Wait for old process to actually die (up to 3s)
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 200));
        try { process.kill(existing.pid, 0); } catch { break; } // process is gone
      }
    } else {
      // Verify the existing backend is actually accepting connections
      // Use multiple attempts with generous timeout — the backend may be under load
      // from another IDE or running heavy tool calls (AST parsing, delegation, etc.)
      let alive = false;
      for (let attempt = 0; attempt < 2 && !alive; attempt++) {
        alive = await new Promise(resolve => {
          const sock = createConnection({ host: '127.0.0.1', port: existing.port }, () => {
            sock.destroy();
            resolve(true);
          });
          sock.on('error', () => resolve(false));
          sock.setTimeout(5000, () => { sock.destroy(); resolve(false); });
        });
      }
      if (alive) return existing.port;
      // Port file exists but backend isn't accepting connections — clean up and respawn
      console.error(`[portal] Backend PID ${existing.pid} alive but port ${existing.port} not responding, respawning...`);
      try { process.kill(existing.pid, 'SIGTERM'); } catch (e) { console.warn('[portal] Failed to kill unresponsive backend:', e.message); }
      try { unlinkSync(getPortFilePath(absPath)); } catch (e) { /* ignore cleanup error */ }
      await new Promise(r => setTimeout(r, 1000));
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
      if (b) {
        // Verify the port is actually accepting TCP connections
        const alive = await new Promise(resolve => {
          const sock = createConnection({ host: '127.0.0.1', port: b.port }, () => {
            sock.destroy();
            resolve(true);
          });
          sock.on('error', () => resolve(false));
          sock.setTimeout(500, () => { sock.destroy(); resolve(false); });
        });
        if (alive) return b.port;
      }
    }
  }
  
  throw new Error('Backend failed to start within 10s');
}

export function startStdioProxy(port, buffered = [], options = {}) {
  const MAX_RETRIES = options.maxRetries ?? 5;
  const retryBaseMs = options.retryBaseMs ?? 500;
  const retryMaxMs = options.retryMaxMs ?? 8000;
  const stdin = options.stdin || process.stdin;
  const stdout = options.stdout || process.stdout;
  const exit = options.exit || ((code) => process.exit(code));
  const openConnection = options.createConnection || createConnection;
  const randomBytesFn = options.randomBytes || randomBytes;
  const setTimer = options.setTimeout || setTimeout;
  const clearTimer = options.clearTimeout || clearTimeout;
  const logger = options.logger || console;
  let retries = 0;
  let connected = false;
  let queue = [];
  let ws = null;
  let wsBuffer = Buffer.alloc(0);
  let stdinBuffer = Buffer.concat(buffered.map(chunk => Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
  let outputMode = null;
  let everConnected = false;
  let shuttingDown = false;
  let retryTimer = null;
  let reconnectCurrent = null;

  function maskAndFrame(str) {
    const data = Buffer.from(str, 'utf8');
    const mask = randomBytesFn(4);
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

  function writeToClient(data) {
    if (outputMode === 'line') {
      stdout.write(data.endsWith('\n') ? data : `${data}\n`);
      return;
    }
    const body = Buffer.from(data, 'utf8');
    stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
    stdout.write(body);
  }

  function handleClientMessage(message) {
    if (connected && ws) {
      try {
        ws.write(maskAndFrame(message));
      } catch (e) {
        logger.warn('[portal] Proxy write failed:', e.message);
        queue.push(message);
        connected = false;
        if (reconnectCurrent) reconnectCurrent('write-failed');
        else scheduleRetry('write-failed');
      }
    } else {
      queue.push(message);
    }
  }

  function parseStdinBuffer() {
    while (stdinBuffer.length > 0) {
      const asText = stdinBuffer.toString('utf8');
      if (/^Content-Length:/i.test(asText)) {
        const headerEnd = asText.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const header = asText.slice(0, headerEnd);
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          logger.error('[portal] Invalid MCP frame header');
          shutdown(1);
          return;
        }
        const length = Number(match[1]);
        const bodyStart = Buffer.byteLength(asText.slice(0, headerEnd + 4), 'utf8');
        if (stdinBuffer.length < bodyStart + length) return;
        outputMode = 'framed';
        const message = stdinBuffer.slice(bodyStart, bodyStart + length).toString('utf8');
        stdinBuffer = stdinBuffer.slice(bodyStart + length);
        if (message.trim()) handleClientMessage(message);
        continue;
      }

      const newline = stdinBuffer.indexOf('\n');
      if (newline === -1) {
        if ('Content-Length:'.toLowerCase().startsWith(asText.toLowerCase())) return;
        return;
      }
      outputMode ||= 'line';
      const line = stdinBuffer.slice(0, newline).toString('utf8').replace(/\r$/, '');
      stdinBuffer = stdinBuffer.slice(newline + 1);
      if (line.trim()) handleClientMessage(line);
    }
  }

  stdin.on('data', chunk => {
    stdinBuffer = Buffer.concat([stdinBuffer, chunk]);
    parseStdinBuffer();
  });

  parseStdinBuffer();

  stdin.on('end', () => {
    shutdown(0);
  });

  function shutdown(code) {
    shuttingDown = true;
    if (retryTimer) {
      try { clearTimer(retryTimer); } catch {}
      retryTimer = null;
    }
    if (ws) {
      try { ws.end(); } catch {}
    }
    exit(code);
  }

  function connect() {
    if (shuttingDown) return;
    connected = false;
    wsBuffer = Buffer.alloc(0);
    let retryScheduled = false; // Guard: prevent double-retry from error+close
    const key = randomBytesFn(16).toString('base64');

    const socket = openConnection({ host: '127.0.0.1', port }, () => {
      if (shuttingDown) return;
      socket.write(`GET /mcp-ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    ws = socket;

    function scheduleOnce(reason) {
      if (retryScheduled || shuttingDown) return;
      retryScheduled = true;
      connected = false;
      if (ws === socket) ws = null;
      try { socket.destroy(); } catch {}
      scheduleRetry(reason);
    }

    reconnectCurrent = scheduleOnce;

    socket.on('data', chunk => {
      if (!connected) {
        const combined = Buffer.concat([wsBuffer, chunk]);
        const idx = combined.indexOf('\r\n\r\n');
        if (idx === -1) {
          wsBuffer = combined;
          return;
        }
        if (!combined.slice(0, idx).toString().includes('101')) {
          logger.error('[portal] WebSocket handshake failed');
          scheduleOnce('handshake-failed');
          return;
        }
        connected = true;
        everConnected = true;
        retries = 0; // Reset retries on successful connection
        wsBuffer = combined.slice(idx + 4);
        // Flush queued stdin messages
        while (queue.length) {
          const line = queue.shift();
          try {
            socket.write(maskAndFrame(line));
          } catch (e) {
            logger.warn('[portal] Proxy queued write failed:', e.message);
            queue.unshift(line);
            scheduleOnce('queued-write-failed');
            break;
          }
        }
      } else {
        wsBuffer = Buffer.concat([wsBuffer, chunk]);
      }

      while (wsBuffer.length >= 2) {
        const frame = parseFrame(wsBuffer);
        if (!frame) break;
        wsBuffer = wsBuffer.slice(frame.totalLen);
        
        if (frame.opcode === 1) { // text
          writeToClient(frame.data);
        } else if (frame.opcode === 8) { // close
          scheduleOnce('close-frame');
          break;
        } else if (frame.opcode === 9) { // ping
          const mask = randomBytesFn(4);
          const pong = Buffer.alloc(6);
          pong[0] = 0x8a;
          pong[1] = 0x80; // masked, 0-length payload
          mask.copy(pong, 2);
          try { socket.write(pong); } catch { scheduleOnce('pong-failed'); }
        }
      }
    });

    socket.on('close', () => {
      scheduleOnce(everConnected ? 'socket-closed-after-connect' : 'socket-closed-before-connect');
    });

    socket.on('error', err => {
      logger.error(`[portal] Proxy connection error: ${err.message}`);
      scheduleOnce('socket-error');
    });
  }

  function scheduleRetry(reason = 'connection-lost') {
    if (shuttingDown) return;
    retries++;
    if (retries > MAX_RETRIES) {
      logger.error(`[portal] Proxy failed after ${MAX_RETRIES} retries — giving up`);
      shutdown(1);
      return;
    }
    const delay = Math.min(retryBaseMs * Math.pow(2, retries - 1), retryMaxMs);
    logger.error(`[portal] Retrying WS connection in ${delay}ms (attempt ${retries}/${MAX_RETRIES}, reason: ${reason})...`);
    retryTimer = setTimer(() => {
      retryTimer = null;
      connect();
    }, delay);
  }

  // Start first connection attempt
  connect();

  return {
    stop: () => shutdown(0),
  };
}
