#!/usr/bin/env node

let isIDEMode = !process.stdin.isTTY;

if (isIDEMode) {
  console.log = function (...args) {
    console.error(...args);
  };
}

import process from 'node:process';
import { ensureBackend, startStdioProxy, writePortFile, removePortFile } from './src/node/server/backend-lifecycle.js';

let isMaster = process.argv.includes('--master');
let connectArgIndex = process.argv.indexOf('--connect');
let connectUrl = connectArgIndex > -1 ? process.argv[connectArgIndex + 1] : null;

function normalizeRootUri(uri) {
  if (!uri || typeof uri !== 'string') return null;
  let root = uri.startsWith('file://') ? uri.slice(7) : uri;
  try {
    root = decodeURIComponent(root);
  } catch {
    // Keep the raw path if decoding fails.
  }
  return root && root !== '/' ? root : null;
}

function readInitializeRoot(chunks) {
  let buf = Buffer.concat(chunks);
  let text = buf.toString('utf8');
  let messages = [];

  if (/^Content-Length:/i.test(text)) {
    let offset = 0;
    while (offset < buf.length) {
      let rest = buf.slice(offset).toString('utf8');
      let headerEnd = rest.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;
      let header = rest.slice(0, headerEnd);
      let match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) break;
      let length = Number(match[1]);
      let bodyStart = offset + Buffer.byteLength(rest.slice(0, headerEnd + 4), 'utf8');
      if (buf.length < bodyStart + length) break;
      messages.push(buf.slice(bodyStart, bodyStart + length).toString('utf8'));
      offset = bodyStart + length;
    }
  } else {
    messages = text.split('\n').map(line => line.trim()).filter(Boolean);
  }

  for (let raw of messages) {
    try {
      let msg = JSON.parse(raw);
      if (msg.method !== 'initialize') continue;
      let roots = msg.params?.roots || msg.params?.capabilities?.roots;
      let root = Array.isArray(roots) ? normalizeRootUri(roots[0]?.uri) : null;
      if (root) return root;
    } catch {
      // Ignore partial frames and non-JSON lines.
    }
  }
  return null;
}

async function waitForInitializeRoot(chunks, timeoutMs = 750) {
  let start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let root = readInitializeRoot(chunks);
    if (root) return root;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return readInitializeRoot(chunks);
}

async function fallbackProjectRoot() {
  const { fileURLToPath } = await import('node:url');
  const { dirname } = await import('node:path');
  return dirname(fileURLToPath(import.meta.url));
}

async function main() {
  let projectRoot = process.cwd();

  if (isIDEMode) {
    let earlyChunks = [];
    let bufferEarlyChunk = chunk => earlyChunks.push(Buffer.from(chunk));
    process.stdin.on('data', bufferEarlyChunk);

    try {
      let rootFromInitialize = await waitForInitializeRoot(earlyChunks);
      if (rootFromInitialize) {
        projectRoot = rootFromInitialize;
        console.error(`[portal] Workspace root from MCP initialize: ${projectRoot}`);
      } else if (projectRoot === '/') {
        // Guard: never use '/' as project root — filesystem is read-only on macOS
        // and child processes (agent-pool) will fail writing temp files there.
        projectRoot = await fallbackProjectRoot();
        console.error(`[portal] CWD is / and no MCP roots arrived, using package dir: ${projectRoot}`);
      }

      // 1. Ensure backend is running (singleton pattern)
      let port = await ensureBackend(projectRoot);
      
      // 2. Start thin proxy connecting to the backend's /mcp-ws
      console.error(`✅ [portal] Connected to singleton backend on port ${port}`);
      console.error('✅ mcp-agent-portal aggregator started. Web UI available at http://portal.local/');
      process.stdin.off('data', bufferEarlyChunk);
      startStdioProxy(port, earlyChunks, { persistentStartupRetry: true });
    } catch (err) {
      process.stdin.off('data', bufferEarlyChunk);
      console.error(`🔴 [portal] Failed to connect to backend:`, err.message);
      process.exit(1);
    }
  } else {
    // Guard: never use '/' as project root — filesystem is read-only on macOS
    // and child processes (agent-pool) will fail writing temp files there.
    if (projectRoot === '/') {
      projectRoot = await fallbackProjectRoot();
      console.error(`[portal] CWD is /, using package dir: ${projectRoot}`);
    }

    // Terminal mode: run the backend directly (attached)
    console.log('🌐 Running in web-only mode (no IDE detected)');
    const { startWebServer } = await import('./src/node/server/web-server.js');
    
    if (isMaster) {
      process.env.PORTAL_MODE = 'master';
      console.log('🌐 Starting in MASTER mode');
    } else if (connectUrl) {
      process.env.PORTAL_MODE = 'client';
      console.log(`🌐 Starting in CLIENT mode, connecting to: ${connectUrl}`);
    } else {
      process.env.PORTAL_MODE = 'standalone';
    }

    let { server, proxyManager } = startWebServer(projectRoot);
    
    if (connectUrl) {
      const { startWSClient } = await import('./src/node/discovery/ws-client.js');
      startWSClient(connectUrl, proxyManager);
    } else {
      proxyManager.startAllServers();
    }

    const checkInterval = setInterval(() => {
      const addr = server.address();
      if (addr) {
        clearInterval(checkInterval);
        writePortFile(projectRoot, addr.port);
        console.log(`✅ mcp-agent-portal started. Web UI: http://portal.local/`);
      }
    }, 50);

    let shuttingDown = false;
    function cleanup() {
      if (shuttingDown) return;
      shuttingDown = true;
      console.error('\n🛑 Shutting down...');
      removePortFile(projectRoot);
      proxyManager.stopAll();
      setTimeout(() => process.exit(0), 500);
    }
    
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
