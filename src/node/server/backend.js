#!/usr/bin/env node
// @ctx backend.ctx
import { resolve } from 'node:path';
import { startWebServer } from './web-server.js';
import { writePortFile, removePortFile } from './backend-lifecycle.js';

const projectRoot = resolve(process.argv[2] || '.');

function cleanup() {
  removePortFile(projectRoot);
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(); });
process.on('SIGTERM', () => { cleanup(); process.exit(); });

// Start the web server and MCP Proxy Manager
const { server } = startWebServer(projectRoot);

// Wait for port to be assigned, then write port file
const checkInterval = setInterval(() => {
  const addr = server.address();
  if (addr) {
    clearInterval(checkInterval);
    writePortFile(projectRoot, addr.port);
    console.log(`[portal] Backend started on port ${addr.port}`);
  }
}, 50);
