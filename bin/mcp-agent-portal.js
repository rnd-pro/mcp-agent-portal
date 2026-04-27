#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { spawn, execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import os from 'os';

let __filename = fileURLToPath(import.meta.url);
let __dirname = dirname(__filename);
let pkgPath = resolve(__dirname, '../package.json');
let pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
let scriptPath = resolve(__dirname, '../index.js');

let [,, command, ...args] = process.argv;

// ── CLI commands ────────────────────────────────────────────────

let CLI = {
  config: {
    desc: 'Generate MCP config for your IDE',
    handler() {
      let npxPath;
      try { npxPath = execSync('which npx', { encoding: 'utf-8' }).trim(); }
      catch { npxPath = 'npx'; }

      let nodePath;
      try { nodePath = execSync('which node', { encoding: 'utf-8' }).trim(); }
      catch { nodePath = ''; }

      let config = {
        mcpServers: {
          'agent-portal': {
            command: npxPath,
            args: ['-y', 'mcp-agent-portal'],
            env: nodePath
              ? { PATH: `${dirname(nodePath)}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin` }
              : {},
          },
        },
      };

      console.log('Add this to your MCP config:\n');
      console.log(JSON.stringify(config, null, 2));
    },
  },

  status: {
    desc: 'Show installed servers and config',
    handler() {
      let configPath = resolve(os.homedir(), '.gemini', 'agent-portal.json');
      let hasConfig = existsSync(configPath);

      console.log(`\n  ⬡ mcp-agent-portal v${pkg.version}\n`);
      console.log(`  Config: ${hasConfig ? configPath : '(not found — using defaults)'}`);

      if (hasConfig) {
        try {
          let config = JSON.parse(readFileSync(configPath, 'utf8'));
          let servers = Object.keys(config.mcpServers || {});
          let adapters = Object.entries(config.adapters || {})
            .filter(([, v]) => v.enabled)
            .map(([k]) => k);

          console.log(`  Mode:   ${config.mode || 'standalone'}`);
          console.log(`  Servers: ${servers.length ? servers.join(', ') : '(none)'}`);
          console.log(`  Adapters: ${adapters.length ? adapters.join(', ') : '(none enabled)'}`);
        } catch (e) {
          console.log(`  ⚠ Config parse error: ${e.message}`);
        }
      }
      console.log();
    },
  },

  version: {
    desc: 'Print version',
    handler() {
      console.log(pkg.version);
    },
  },

  help: {
    desc: 'Show this help',
    handler() {
      printHelp();
    },
  },
};

function printHelp() {
  console.log(`
mcp-agent-portal v${pkg.version} — Unified MCP aggregator + AI agent runtime

Usage:
  npx mcp-agent-portal                  Start MCP stdio server (IDE mode)
  npx mcp-agent-portal <command>        Run CLI command

Commands:`);

  for (let [name, cmd] of Object.entries(CLI)) {
    console.log(`  ${name.padEnd(22)} ${cmd.desc}`);
  }

  console.log(`
Options:
  --master               Start in master mode (distributed topology)
  --connect <url>        Start in client mode, connect to master

Quick Start:
  npx mcp-agent-portal config           # Get MCP config for your IDE

Examples:
  npx mcp-agent-portal config
  npx mcp-agent-portal status
  npx mcp-agent-portal --master
`);
}

// ── Dispatch ────────────────────────────────────────────────────

if (command === '--help' || command === '-h') {
  printHelp();
} else if (command === '--version' || command === '-v') {
  console.log(pkg.version);
} else if (command && CLI[command]) {
  CLI[command].handler(args);
} else {
  // No command or unknown command → start MCP server with restart wrapper
  let child;

  function startServer() {
    let fwdArgs = process.argv.slice(2);
    child = spawn('node', [scriptPath, ...fwdArgs], { stdio: 'inherit' });

    child.on('error', (err) => {
      console.error('🔴 Failed to start mcp-agent-portal:', err);
      process.exit(1);
    });

    child.on('exit', (code) => {
      if (code === 2) {
        console.log('🔄 Restarting mcp-agent-portal...');
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
}
