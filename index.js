#!/usr/bin/env node

// Override console.log to prevent corrupting stdio MCP communication
let originalConsoleLog = console.log;
console.log = function (...args) {
  console.error(...args);
};

import { startWebServer } from './src/node/server/web-server.js';
import { MCPMultiplexer } from './src/node/proxy/mcp-multiplexer.js';

// Start the web server (dashboard) in the background
let projectRoot = process.cwd();
let { server, proxyManager } = startWebServer(projectRoot);

// Start the multiplexer on stdio
let multiplexer = new MCPMultiplexer(proxyManager);
multiplexer.listen();

console.error('✅ agent-portal aggregator started. Web UI available at http://portal.local/');
