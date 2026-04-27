#!/usr/bin/env node

// Override console.log to prevent corrupting stdio MCP communication
let originalConsoleLog = console.log;
console.log = function (...args) {
  console.error(...args);
};

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

// If client mode, connect to master instead of starting stdio multiplexer
if (connectUrl) {
  startWSClient(connectUrl, proxyManager);
} else {
  // Start the multiplexer on stdio
  let multiplexer = new MCPMultiplexer(proxyManager);
  multiplexer.listen();
}

console.error('✅ mcp-agent-portal aggregator started. Web UI available at http://portal.local/');
