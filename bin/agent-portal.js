#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { spawn } from 'child_process';

let __filename = fileURLToPath(import.meta.url);
let __dirname = dirname(__filename);
let scriptPath = resolve(__dirname, '../index.js');

let child;

function startServer() {
  child = spawn('node', [scriptPath], { stdio: 'inherit' });

  child.on('error', (err) => {
    console.error('🔴 Failed to start agent-portal:', err);
    process.exit(1);
  });

  child.on('exit', (code) => {
    if (code === 2) {
      console.log('🔄 Restarting agent-portal...');
      startServer();
    } else if (code !== 0 && code !== null) {
      process.exit(code);
    } else {
      process.exit(0);
    }
  });
}

startServer();

process.on('SIGINT', () => {
  if (child) child.kill('SIGINT');
  process.exit(0);
});
