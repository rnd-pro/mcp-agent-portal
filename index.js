#!/usr/bin/env node

// Detect if stdin is piped from IDE (MCP stdio) or interactive terminal
let isIDEMode = !process.stdin.isTTY;

// Override console.log only in IDE mode to prevent corrupting stdio MCP communication
if (isIDEMode) {
  console.log = function (...args) {
    console.error(...args);
  };
}

import { startWebServer } from './src/node/server/web-server.js';
import { MCPMultiplexer } from './src/node/proxy/mcp-multiplexer.js';
import { startWSClient } from './src/node/discovery/ws-client.js';

let isMaster = process.argv.includes('--master');
let connectArgIndex = process.argv.indexOf('--connect');
let connectUrl = connectArgIndex > -1 ? process.argv[connectArgIndex + 1] : null;

if (isMaster) {
  process.env.PORTAL_MODE = 'master';
  console.log('🌐 Starting in MASTER mode');
} else if (connectUrl) {
  process.env.PORTAL_MODE = 'client';
  console.log(`🌐 Starting in CLIENT mode, connecting to: ${connectUrl}`);
} else {
  process.env.PORTAL_MODE = 'standalone';
}

// Start the web server (dashboard) in the background
let projectRoot = process.cwd();
let { server, proxyManager } = startWebServer(projectRoot);

if (connectUrl) {
  // Client mode — connect to master
  startWSClient(connectUrl, proxyManager);
} else if (isIDEMode) {
  // IDE mode (stdin is piped) — start stdio MCP multiplexer
  let multiplexer = new MCPMultiplexer(proxyManager);
  multiplexer.listen();
} else {
  // Terminal mode (interactive TTY) — web-only, no stdio
  console.log('🌐 Running in web-only mode (no IDE detected)');
  console.log('✅ mcp-agent-portal started. Web UI: http://portal.local/');
}

if (isIDEMode) {
  console.error('✅ mcp-agent-portal aggregator started. Web UI available at http://portal.local/');
}
