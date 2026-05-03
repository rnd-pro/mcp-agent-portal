#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { spawn, execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import os from 'os';
import http from 'http';
import WebSocket from 'ws';

let __filename = fileURLToPath(import.meta.url);
let __dirname = dirname(__filename);
let pkgPath = resolve(__dirname, '../package.json');
let pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
let scriptPath = resolve(__dirname, '../index.js');

let [, , command, ...args] = process.argv;

// ── Port Discovery ──────────────────────────────────────────────────

function getBackendPort() {
  const servicesPath = resolve(os.homedir() || os.tmpdir(), '.local-gateway', 'services.json');
  if (!existsSync(servicesPath)) return null;
  try {
    const services = JSON.parse(readFileSync(servicesPath, 'utf8'));
    const portal = services['portal.local'];
    if (portal && portal.port) {
      try {
        process.kill(portal.pid, 0);
        return portal.port;
      } catch {
        return null;
      }
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

// ── HTTP/WS Helpers ─────────────────────────────────────────────────

function parseFlags(argsArr) {
  let flags = {};
  let positional = [];
  for (let i = 0; i < argsArr.length; i++) {
    if (argsArr[i].startsWith('--')) {
      let key = argsArr[i].slice(2);
      if (i + 1 < argsArr.length && !argsArr[i + 1].startsWith('--')) {
        flags[key] = argsArr[++i];
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(argsArr[i]);
    }
  }
  return { flags, positional };
}

async function apiRequest(path, method = 'GET', body = null) {
  let port = getBackendPort();
  if (!port) {
    console.error('🔴 Backend not running. Start it with: npx mcp-agent-portal');
    process.exit(1);
  }

  return new Promise((resolve, reject) => {
    let req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Invalid JSON response: ${data}`));
          }
        });
      }
    );

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

const META_TOOLS = new Set([
  'discover_tools',
  'get_portal_status',
  'create_chat',
  'send_chat_message',
  'remember',
  'recall',
  'call_tool'
]);

// Emulates an MCP Client connecting to the Multiplexer
async function mcpCall(toolName, argsObj = {}) {
  let port = getBackendPort();
  if (!port) {
    console.error('🔴 Backend not running. Start it with: npx mcp-agent-portal');
    process.exit(1);
  }

  // Auto-wrap non-meta tools in call_tool
  if (!META_TOOLS.has(toolName)) {
    argsObj = { name: toolName, arguments: argsObj };
    toolName = 'call_tool';
  }

  return new Promise((resolve, reject) => {
    let ws = new WebSocket(`ws://127.0.0.1:${port}/mcp-ws`);
    
    // Auto-timeout after 30s
    let timeout = setTimeout(() => {
      ws.close();
      reject(new Error('MCP Call Timeout'));
    }, 30000);

    let initId = 'init-' + Math.random().toString(36).slice(2);
    let callId = 'call-' + Math.random().toString(36).slice(2);
    let toolSent = false;

    function sendToolCall() {
      if (toolSent) return;
      toolSent = true;
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: callId,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: argsObj
        }
      }));
    }

    ws.on('open', () => {
      // 1. Send initialize
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: initId,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'mcp-agent-portal-cli', version: pkg.version }
        }
      }));
    });

    ws.on('message', (data) => {
      try {
        let msg = JSON.parse(data.toString());
        
        if (msg.id === initId) {
          // 2. Send initialized notification
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'notifications/initialized'
          }));

          // 3. Wait for multiplexer to rebuild index (it emits tools/list_changed after ~3s)
          // If we don't receive it in 3.5s, send anyway
          setTimeout(sendToolCall, 3500);

        } else if (msg.method === 'notifications/tools/list_changed') {
          // Got the rebuilt index notification, safe to send tool call now!
          sendToolCall();
        } else if (msg.id === callId) {
          // 4. Handle result
          clearTimeout(timeout);
          ws.close();
          if (msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            resolve(msg.result);
          }
        }
      } catch (err) {
        // ignore parse errors or notifications
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// ── CLI Commands ────────────────────────────────────────────────────

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
    desc: 'Show platform status and running servers',
    async handler() {
      try {
        let status = await apiRequest('/api/server-status');
        let instances = await apiRequest('/api/instances');

        console.log(`\n  ⬡ mcp-agent-portal v${pkg.version}`);
        console.log(`  Uptime:   ${status.uptime}s`);
        console.log(`  Agents:   ${status.agents}`);
        console.log(`  Servers:`);
        for (let inst of instances) {
          console.log(`    - ${inst.name.padEnd(20)} [pid: ${inst.pid}, port: ${inst.port}]`);
        }
        console.log(`\n  Web UI:   http://portal.local/\n`);
      } catch (err) {
        console.error(err.message);
        process.exit(1);
      }
    },
  },

  tools: {
    desc: 'List all available MCP tools',
    async handler() {
      let { positional } = parseFlags(args);
      let query = positional[0] || '';
      try {
        let res = await mcpCall('discover_tools', query ? { query } : {});
        console.log(res.content?.[0]?.text || JSON.stringify(res, null, 2));
      } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
      }
    }
  },

  tasks: {
    desc: 'List all active tasks',
    async handler() {
      try {
        let res = await mcpCall('list_tasks');
        let content = res.content?.[0]?.text;
        if (content) {
          console.log(content);
        } else {
          console.log('No active tasks');
        }
      } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
      }
    }
  },

  task: {
    desc: 'Get task result (usage: task <id>)',
    async handler() {
      let { positional } = parseFlags(args);
      let taskId = positional[0];
      if (!taskId) {
        console.error('Usage: mcp-agent-portal task <taskId>');
        process.exit(1);
      }
      try {
        let res = await mcpCall('get_task_result', { taskId });
        console.log(JSON.stringify(res, null, 2));
      } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
      }
    }
  },

  cancel: {
    desc: 'Cancel a task (usage: cancel <id>)',
    async handler() {
      let { positional } = parseFlags(args);
      let taskId = positional[0];
      if (!taskId) {
        console.error('Usage: mcp-agent-portal cancel <taskId>');
        process.exit(1);
      }
      try {
        let res = await mcpCall('cancel_task', { taskId });
        console.log(res.content?.[0]?.text || 'Cancelled');
      } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
      }
    }
  },

  call: {
    desc: 'Call any MCP tool (usage: call <tool> [json_args])',
    async handler() {
      let { positional } = parseFlags(args);
      let toolName = positional[0];
      let jsonArgs = positional[1] || '{}';
      if (!toolName) {
        console.error('Usage: mcp-agent-portal call <toolName> [json_args]');
        process.exit(1);
      }
      let parsedArgs;
      try {
        parsedArgs = JSON.parse(jsonArgs);
      } catch {
        console.error('Invalid JSON arguments');
        process.exit(1);
      }
      try {
        let res = await mcpCall(toolName, parsedArgs);
        // Special case for tools returning markdown text like discover_tools
        if (res.content?.[0]?.type === 'text' && res.content.length === 1) {
          console.log(res.content[0].text);
        } else {
          console.log(JSON.stringify(res, null, 2));
        }
      } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
      }
    }
  },

  memory: {
    desc: 'Persistent memory (usage: memory get <q> | memory set <k> <v>)',
    async handler() {
      let { positional } = parseFlags(args);
      let subcmd = positional[0];
      try {
        if (subcmd === 'get') {
          let res = await mcpCall('recall', { query: positional[1] || '' });
          console.log(res.content?.[0]?.text);
        } else if (subcmd === 'set') {
          let res = await mcpCall('remember', { key: positional[1], value: positional[2] });
          console.log(res.content?.[0]?.text);
        } else {
          console.error('Usage: mcp-agent-portal memory get <q> | memory set <k> <v>');
          process.exit(1);
        }
      } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
      }
    }
  },

  run: {
    desc: 'Run a task and stream output (usage: run "prompt" [--sync] [--model <m>] [--provider <p>] [--cwd <path>])',
    async handler() {
      let { flags, positional } = parseFlags(args);
      let prompt = positional.join(' ');
      
      if (!prompt) {
        console.error('Usage: mcp-agent-portal run "prompt text"');
        process.exit(1);
      }

      let port = getBackendPort();
      if (!port) {
        console.error('🔴 Backend not running. Start it with: npx mcp-agent-portal');
        process.exit(1);
      }

      let wsUrl = `ws://127.0.0.1:${port}/ws/chat`;
      let ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        let payload = {
          jsonrpc: '2.0',
          method: 'chat.send',
          params: {
            prompt: prompt,
            model: flags.model,
            provider: flags.provider,
            cwd: flags.cwd || process.cwd()
          }
        };
        ws.send(JSON.stringify(payload));
      });

      let currentTask = null;

      ws.on('message', (data) => {
        try {
          let msg = JSON.parse(data.toString());
          if (msg.method === 'chat.delegated') {
            currentTask = msg.params.taskId;
            console.log(`[Task Started: ${currentTask}]`);
            if (!flags.sync) {
              // Background mode
              console.log(`Task is running in background. Use 'tasks' or 'task ${currentTask}' to check.`);
              ws.close();
              process.exit(0);
            }
          } else if (msg.method === 'chat.event') {
            let p = msg.params;
            if (p.event === 'stdout' && p.data) {
              process.stdout.write(p.data);
            } else if (p.event === 'tool_call') {
              console.log(`\n> 🛠️  ${p.data.tool}(${JSON.stringify(p.data.args)})`);
            } else if (p.event === 'error') {
              console.error(`\n> ❌  Error: ${p.data.message}`);
            }
          } else if (msg.method === 'chat.done') {
            console.log(`\n[Task Completed: ${currentTask}]\nResult: ${msg.params.text || ""}`);
            process.exit(0);
          } else if (msg.method === 'chat.error') {
            console.error(`\n[Task Failed: ${msg.params.error}]`);
            process.exit(1);
          }
        } catch (e) {
          console.error('Failed to parse WS message', e);
        }
      });

      ws.on('error', (err) => {
        console.error('WebSocket error:', err.message);
        process.exit(1);
      });

      ws.on('close', () => {
        if (flags.sync) {
          console.log('\n[Connection closed]');
          process.exit(1);
        }
      });
    }
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
  npx mcp-agent-portal                  Start MCP server and UI (daemon spawner)
  npx mcp-agent-portal <command>        Run CLI command against running portal

Commands:`);

  for (let [name, cmd] of Object.entries(CLI)) {
    console.log(`  ${name.padEnd(22)} ${cmd.desc}`);
  }

  console.log(`
Options for 'run':
  --sync                 Wait for task completion (stream output)
  --model <name>         Model to use
  --provider <name>      Provider to use (gemini, opencode, pool, mock)
  --cwd <path>           Working directory (default: current)

Web Dashboard:
  http://portal.local/   Available while the server is running

Examples:
  npx mcp-agent-portal run "scan directory" --sync
  npx mcp-agent-portal tasks
  npx mcp-agent-portal call list_skills
`);
}

// ── Dispatch ────────────────────────────────────────────────────

if (command === '--help' || command === '-h') {
  printHelp();
} else if (command === '--version' || command === '-v') {
  console.log(pkg.version);
} else if (command && CLI[command]) {
  CLI[command].handler();
} else if (command && !command.startsWith('--')) {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
} else {
  // No command or `--master`/`--connect` → start MCP server with restart wrapper
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
