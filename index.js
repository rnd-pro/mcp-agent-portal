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

async function main() {
  let projectRoot = process.cwd();

  if (isIDEMode) {
    try {
      // 1. Ensure backend is running (singleton pattern)
      let port = await ensureBackend(projectRoot);
      
      // 2. Start thin proxy connecting to the backend's /mcp-ws
      console.error(`✅ [portal] Connected to singleton backend on port ${port}`);
      console.error('✅ mcp-agent-portal aggregator started. Web UI available at http://portal.local/');
      startStdioProxy(port);
    } catch (err) {
      console.error(`🔴 [portal] Failed to connect to backend:`, err.message);
      process.exit(1);
    }
  } else {
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
