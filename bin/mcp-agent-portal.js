#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { spawn, execSync } from 'child_process';
import { readFileSync, existsSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import os from 'os';
import http from 'http';
import WebSocket from 'ws';
import { randomBytes } from 'crypto';
import {
  getAnthropicGatewayConfig,
  updateAnthropicGatewayConfig,
} from '../src/node/config-store.js';

let __filename = fileURLToPath(import.meta.url);
let __dirname = dirname(__filename);
let pkgPath = resolve(__dirname, '../package.json');
let pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
let scriptPath = resolve(__dirname, '../index.js');

let [, , command, ...args] = process.argv;

const LOCAL_GATEWAY_ROOT = resolve(os.homedir() || os.tmpdir(), '.local-gateway');
const SERVICES_PATH = resolve(LOCAL_GATEWAY_ROOT, 'services.json');
const BACKENDS_DIR = resolve(LOCAL_GATEWAY_ROOT, 'backends');
const GATEWAY_PID_PATH = resolve(LOCAL_GATEWAY_ROOT, 'gateway.pid');

const ESC = '\x1b[';
const c = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  cyan: `${ESC}36m`,
  cyanBright: `${ESC}96m`,
  white: `${ESC}37m`,
  gray: `${ESC}90m`,
};

function printLogo() {
  console.log(`
${c.cyanBright}${c.bold}   ___                     __     ___           __        __${c.reset}
${c.cyanBright}${c.bold}  / _ | ___ ____ ___  ___ / /_   / _ \\___  ____/ /____ _  / /${c.reset}
${c.white}${c.bold} / __ |/ _ \`/ -_) _ \\/ -_) __/  / ___/ _ \\/ __/ __/ _ \`/ / / ${c.reset}
${c.white}${c.bold}/_/ |_|\\_, /\\__/_//_/\\__/\\__/  /_/   \\___/_/  \\__/\\_,_/ /_/  ${c.reset}
${c.gray}      /___/  Unified MCP aggregator + AI agent runtime${c.reset}
`);
}

// ── Port Discovery ──────────────────────────────────────────────────

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readJsonFile(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function livePort(entry) {
  if (entry?.port && isAlive(entry.pid)) return entry.port;
  return null;
}

function readServices() {
  return readJsonFile(SERVICES_PATH) || {};
}

function listBackendEntries() {
  try {
    if (!existsSync(BACKENDS_DIR)) return [];
    return readdirSync(BACKENDS_DIR)
      .filter(file => file.startsWith('portal-') && file.endsWith('.json'))
      .map(file => {
        let entry = readJsonFile(resolve(BACKENDS_DIR, file));
        return entry ? { ...entry, file, path: resolve(BACKENDS_DIR, file), alive: isAlive(entry.pid) } : null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function listRouteEntries() {
  let portal = readServices()['portal.local'] || {};
  return Object.entries(portal.routes || {}).map(([route, entry]) => ({
    route,
    ...entry,
    alive: isAlive(entry?.pid),
  }));
}

function resolveProjectRef(projectRef = process.cwd()) {
  if (!projectRef || projectRef === '.') return resolve(process.cwd());
  try {
    return resolve(projectRef);
  } catch {
    return projectRef;
  }
}

function findWorkspaceBackend(projectRef = process.cwd(), { fallbackLatest = true } = {}) {
  let ref = resolveProjectRef(projectRef);
  let backends = listBackendEntries().filter(entry => entry.alive && entry.port);
  let exact = backends.find(entry => resolve(entry.project || '') === ref);
  if (exact) return exact;

  let byName = backends.find(entry => entry.name === projectRef || entry.project?.endsWith(`/${projectRef}`));
  if (byName) return byName;

  let routes = listRouteEntries().filter(entry => entry.alive && entry.port);
  let routeExact = routes.find(entry => resolve(entry.projectPath || '') === ref);
  if (routeExact) {
    return {
      ...routeExact,
      project: routeExact.projectPath,
      name: routeExact.projectName,
      mcpDirect: `http://127.0.0.1:${routeExact.port}/mcp`,
    };
  }

  return fallbackLatest ? backends.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0] || null : null;
}

function getBackendPort() {
  const cwd = resolve(process.cwd());

  try {
    if (existsSync(SERVICES_PATH)) {
      const services = readServices();
      const portal = services['portal.local'];
      const directPort = livePort(portal);
      if (directPort) return directPort;

      const routes = Object.values(portal?.routes || {});
      const currentRoute = routes.find(route => resolve(route.projectPath || '') === cwd);
      const routePort = livePort(currentRoute);
      if (routePort) return routePort;

      for (const route of routes) {
        const port = livePort(route);
        if (port) return port;
      }
    }
  } catch {
    // ignore parse errors
  }

  try {
    const backends = listBackendEntries()
      .filter(entry => livePort(entry));

    const currentBackend = backends.find(entry => resolve(entry.project || '') === cwd);
    if (currentBackend) return currentBackend.port;

    backends.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    return backends[0]?.port || null;
  } catch {
    // ignore discovery errors
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

const DEFAULT_DEEPSEEK_GATEWAY = {
  type: 'anthropic-compatible',
  baseUrl: 'https://api.deepseek.com/anthropic',
  apiKeyEnv: 'DEEPSEEK_API_KEY',
  models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
};

function buildGatewayConfigStatus(gateway = {}) {
  return {
    enabled: gateway.enabled === true,
    authTokenConfigured: Boolean(gateway.authToken || process.env.ANTHROPIC_GATEWAY_AUTH_TOKEN),
    defaultModel: gateway.defaultModel || 'deepseek-v4-flash',
    plannerModel: gateway.plannerModel || 'deepseek-v4-pro',
    providers: gateway.providers || {},
  };
}

function printGatewayStatus(gateway = getAnthropicGatewayConfig()) {
  let status = buildGatewayConfigStatus(gateway);
  console.log('Anthropic gateway config');
  console.log(`  Enabled:      ${status.enabled ? 'yes' : 'no'}`);
  console.log(`  Auth token:   ${status.authTokenConfigured ? 'configured' : 'missing'}`);
  console.log(`  Default:      ${status.defaultModel}`);
  console.log(`  Planner:      ${status.plannerModel}`);
  console.log('  Providers:');

  let entries = Object.entries(status.providers);
  if (entries.length === 0) {
    console.log('    none');
    return;
  }

  for (let [name, provider] of entries) {
    let apiKeyEnv = provider.apiKeyEnv || '(not configured)';
    let keyStatus = provider.apiKey
      ? 'configured inline'
      : provider.apiKeyEnv && process.env[provider.apiKeyEnv]
        ? 'env present'
        : 'missing';
    console.log(`    - ${name}`);
    console.log(`      type:       ${provider.type || 'openai-compatible'}`);
    console.log(`      baseUrl:    ${provider.baseUrl || '(missing)'}`);
    console.log(`      apiKeyEnv:  ${apiKeyEnv} (${keyStatus})`);
    console.log(`      models:     ${(provider.models || []).join(', ') || '(none)'}`);
  }
}

function makeGatewayAuthToken() {
  return `portal-${randomBytes(24).toString('base64url')}`;
}

function withoutInlineApiKey(provider = {}) {
  let { apiKey, ...safeProvider } = provider;
  return safeProvider;
}

function validateGatewayConfig(gateway = getAnthropicGatewayConfig()) {
  let issues = [];
  if (gateway.enabled !== true) issues.push('gateway is disabled');
  if (!gateway.authToken && !process.env.ANTHROPIC_GATEWAY_AUTH_TOKEN) issues.push('auth token is not configured');

  let providers = gateway.providers || {};
  if (Object.keys(providers).length === 0) issues.push('no providers configured');

  for (let [name, provider] of Object.entries(providers)) {
    if (!provider.baseUrl) issues.push(`${name}: baseUrl is missing`);
    if (provider.apiKey) {
      // Inline keys are allowed for local-only testing, but never printed.
    } else if (!provider.apiKeyEnv) {
      issues.push(`${name}: apiKeyEnv is missing`);
    } else if (!process.env[provider.apiKeyEnv]) {
      issues.push(`${name}: ${provider.apiKeyEnv} is not set`);
    }
    if (!Array.isArray(provider.models) || provider.models.length === 0) {
      issues.push(`${name}: models are missing`);
    }
  }

  return issues;
}

function httpJsonRequest(port, path, token = null) {
  return new Promise((resolvePromise, reject) => {
    let headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    let req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'GET', headers },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed = null;
          try { parsed = data ? JSON.parse(data) : null; }
          catch { /* keep raw body */ }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`${path} returned HTTP ${res.statusCode}: ${parsed?.error?.message || data}`));
            return;
          }

          resolvePromise(parsed);
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

function mcpDirectUrl(entry) {
  if (!entry?.port) return null;
  return entry.mcpDirect || `http://127.0.0.1:${entry.port}/mcp`;
}

function uiUrl(entry) {
  if (!entry?.port) return null;
  return entry.webDirect || `http://127.0.0.1:${entry.port}/`;
}

function cleanupHubState() {
  let removedBackends = 0;
  for (let entry of listBackendEntries()) {
    if (entry.alive) continue;
    try {
      unlinkSync(entry.path);
      removedBackends += 1;
    } catch {
      // ignore cleanup errors
    }
  }

  let services = readServices();
  let portal = services['portal.local'];
  let removedRoutes = 0;
  if (portal?.routes) {
    for (let [route, entry] of Object.entries(portal.routes)) {
      if (isAlive(entry?.pid)) continue;
      delete portal.routes[route];
      removedRoutes += 1;
    }
    if (removedRoutes > 0) {
      writeFileSync(SERVICES_PATH, JSON.stringify(services, null, 2));
    }
  }

  return { removedBackends, removedRoutes };
}

function printHubRoutes() {
  let routes = listRouteEntries();
  if (routes.length === 0) {
    console.log('No portal.local routes registered.');
    return;
  }

  for (let route of routes) {
    console.log(`${route.route.padEnd(24)} ${route.alive ? 'alive' : 'dead '} pid=${route.pid || '-'} port=${route.port || '-'} ${route.projectPath || ''}`);
  }
}

function printHubStatus(projectRef = process.cwd(), { fallbackLatest = true } = {}) {
  let gatewayPid = 0;
  try {
    let raw = readFileSync(GATEWAY_PID_PATH, 'utf8').trim();
    gatewayPid = raw.startsWith('{') ? Number(JSON.parse(raw).pid || 0) : Number(raw);
  } catch {
    gatewayPid = 0;
  }
  let backends = listBackendEntries();
  let liveBackends = backends.filter(entry => entry.alive);
  let current = findWorkspaceBackend(projectRef, { fallbackLatest });

  console.log('Portal Hub');
  console.log(`  Gateway:       ${gatewayPid && isAlive(gatewayPid) ? `alive pid=${gatewayPid}` : 'not detected'}`);
  console.log(`  State dir:     ${LOCAL_GATEWAY_ROOT}`);
  console.log(`  Backends:      ${liveBackends.length} live / ${backends.length} registered`);
  console.log(`  Current UI:    ${current ? uiUrl(current) : '(no live backend)'}`);
  console.log(`  Current MCP:   ${current ? mcpDirectUrl(current) : '(no live backend)'}`);
  console.log('');
  printHubRoutes();
}

function probeMcpEndpoint(endpoint) {
  let url = new URL(endpoint);
  let payload = JSON.stringify({
    jsonrpc: '2.0',
    id: 'portal-cli-doctor',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mcp-agent-portal-cli', version: pkg.version },
    },
  });

  return new Promise((resolvePromise, reject) => {
    let req = http.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            return;
          }
          try {
            resolvePromise(JSON.parse(data));
          } catch {
            resolvePromise({ raw: data });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function printHubDoctor(projectRef = process.cwd(), { fallbackLatest = true } = {}) {
  let current = findWorkspaceBackend(projectRef, { fallbackLatest });
  let deadBackends = listBackendEntries().filter(entry => !entry.alive);
  let deadRoutes = listRouteEntries().filter(entry => !entry.alive);

  console.log('Portal Hub doctor');
  console.log(`  Dead backend files: ${deadBackends.length}`);
  console.log(`  Dead routes:        ${deadRoutes.length}`);

  if (!current) {
    console.log('  MCP probe:          skipped, no live backend');
    process.exitCode = 1;
    return;
  }

  let endpoint = mcpDirectUrl(current);
  try {
    let res = await probeMcpEndpoint(endpoint);
    console.log(`  MCP endpoint:       ${endpoint}`);
    console.log(`  MCP initialize:     ${res?.result?.serverInfo?.name || 'ok'}`);
  } catch (err) {
    console.log(`  MCP endpoint:       ${endpoint}`);
    console.log(`  MCP initialize:     failed: ${err.message}`);
    process.exitCode = 1;
  }
}

function parseRunArgs(argsArr) {
  let flags = {};
  let promptParts = [];
  let promptStarted = false;
  let knownValueFlags = new Set(['model', 'provider', 'cwd', 'timeout']);

  for (let i = 0; i < argsArr.length; i++) {
    let arg = argsArr[i];

    if (arg === '--' && !promptStarted) {
      promptParts = argsArr.slice(i + 1);
      break;
    }

    let isKnownFlag = arg.startsWith('--') && (arg === '--sync' || knownValueFlags.has(arg.slice(2)));
    if (isKnownFlag && (!promptStarted || i === argsArr.length - 1 || argsArr[i + 1]?.startsWith('--'))) {
      let key = arg.slice(2);
      if (knownValueFlags.has(key) && i + 1 < argsArr.length && !argsArr[i + 1].startsWith('--')) {
        flags[key] = argsArr[++i];
      } else {
        flags[key] = true;
      }
      continue;
    }

    if (isKnownFlag && promptStarted) {
      let key = arg.slice(2);
      if (knownValueFlags.has(key)) {
        flags[key] = argsArr[++i];
      } else {
        flags[key] = true;
      }
      continue;
    }

    promptStarted = true;
    promptParts.push(arg);
  }

  return { flags, prompt: promptParts.join(' ') };
}

function extractTextResult(res) {
  let text = res?.content
    ?.find((item) => item.type === 'text' && item.text && !item.text.startsWith('__EVENTS__:') && !item.text.startsWith('__RESULT_JSON__:'))
    ?.text;
  return text || '';
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

    let settled = false;
    let fallbackTimer = null;

    function cleanup() {
      clearTimeout(timeout);
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
    }

    function finish(fn, value) {
      if (settled) return;
      settled = true;
      cleanup();
      ws.close();
      fn(value);
    }

    // Auto-timeout after 30s
    let timeout = setTimeout(() => {
      finish(reject, new Error('MCP Call Timeout'));
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
          fallbackTimer = setTimeout(sendToolCall, 3500);

        } else if (msg.method === 'notifications/tools/list_changed') {
          // Got the rebuilt index notification, safe to send tool call now!
          if (fallbackTimer) {
            clearTimeout(fallbackTimer);
            fallbackTimer = null;
          }
          sendToolCall();
        } else if (msg.id === callId) {
          // 4. Handle result
          if (msg.error) {
            finish(reject, new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            finish(resolve, msg.result);
          }
        }
      } catch {
        // ignore parse errors or notifications
      }
    });

    ws.on('error', (err) => {
      finish(reject, err);
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

        printLogo();
        console.log(`  ${c.bold}mcp-agent-portal${c.reset} ${c.dim}v${pkg.version}${c.reset}`);
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

  gateway: {
    desc: 'Configure Anthropic/Claude gateway (usage: gateway status|enable|disable|test)',
    async handler() {
      let { flags, positional } = parseFlags(args);
      let subcmd = positional[0] || 'status';

      if (subcmd === 'status') {
        printGatewayStatus();
        return;
      }

      if (subcmd === 'enable') {
        let provider = flags.provider || positional[1] || 'deepseek';
        if (provider !== 'deepseek') {
          console.error(`Unsupported gateway provider: ${provider}`);
          console.error('Supported providers: deepseek');
          process.exit(1);
        }

        let next = updateAnthropicGatewayConfig((current) => ({
          ...current,
          enabled: true,
          authToken: current.authToken || process.env.ANTHROPIC_GATEWAY_AUTH_TOKEN || makeGatewayAuthToken(),
          defaultModel: current.defaultModel || 'deepseek-v4-flash',
          plannerModel: current.plannerModel || 'deepseek-v4-pro',
          providers: {
            ...(current.providers || {}),
            deepseek: {
              ...DEFAULT_DEEPSEEK_GATEWAY,
              ...withoutInlineApiKey(current.providers?.deepseek),
            },
          },
        }));

        console.log('Anthropic gateway enabled.');
        console.log('Set DEEPSEEK_API_KEY in the backend environment before sending model requests.');
        printGatewayStatus(next);
        return;
      }

      if (subcmd === 'disable') {
        let next = updateAnthropicGatewayConfig({ enabled: false });
        console.log('Anthropic gateway disabled.');
        printGatewayStatus(next);
        return;
      }

      if (subcmd === 'test') {
        let gateway = getAnthropicGatewayConfig();
        let port = getBackendPort();
        if (!port) {
          console.log('Backend not running; checked config and environment only.');
          let issues = validateGatewayConfig(gateway);
          if (issues.length) {
            console.log('Issues:');
            for (let issue of issues) console.log(`  - ${issue}`);
            process.exit(1);
          }
          console.log('Config looks valid. Start the portal backend to test /anthropic endpoints.');
          return;
        }

        try {
          let token = gateway.authToken || process.env.ANTHROPIC_GATEWAY_AUTH_TOKEN || null;
          let health = await httpJsonRequest(port, '/anthropic/health', token);
          let models = await httpJsonRequest(port, '/anthropic/v1/models', token);
          console.log(`Gateway backend: http://127.0.0.1:${port}`);
          console.log(`Health: ${health?.ok ? 'ok' : 'unknown'}`);
          console.log(`Providers: ${(health?.providers || []).join(', ') || '(none)'}`);
          console.log(`Models: ${(models?.data || []).map(model => model.id).join(', ') || '(none)'}`);
        } catch (err) {
          console.error('Gateway test failed:', err.message);
          process.exit(1);
        }
        return;
      }

      console.error(`Unknown gateway command: ${subcmd}`);
      console.error('Usage: mcp-agent-portal gateway status|enable|disable|test');
      process.exit(1);
    },
  },

  hub: {
    desc: 'Inspect local hub state (usage: hub status|routes|mcp-url|doctor|cleanup)',
    async handler() {
      let { flags, positional } = parseFlags(args);
      let subcmd = positional[0] || 'status';
      let projectRef = flags.project || process.cwd();
      let fallbackLatest = !flags.project;

      if (subcmd === 'status') {
        printHubStatus(projectRef, { fallbackLatest });
        return;
      }

      if (subcmd === 'routes') {
        printHubRoutes();
        return;
      }

      if (subcmd === 'mcp-url') {
        let current = findWorkspaceBackend(projectRef, { fallbackLatest });
        if (!current) {
          console.error('No live portal backend found for this project.');
          process.exit(1);
        }
        console.log(mcpDirectUrl(current));
        return;
      }

      if (subcmd === 'ui-url') {
        let current = findWorkspaceBackend(projectRef, { fallbackLatest });
        if (!current) {
          console.error('No live portal backend found for this project.');
          process.exit(1);
        }
        console.log(uiUrl(current));
        return;
      }

      if (subcmd === 'doctor') {
        await printHubDoctor(projectRef, { fallbackLatest });
        return;
      }

      if (subcmd === 'cleanup') {
        let res = cleanupHubState();
        console.log(`Removed ${res.removedBackends} dead backend file(s) and ${res.removedRoutes} dead route(s).`);
        return;
      }

      console.error(`Unknown hub command: ${subcmd}`);
      console.error('Usage: mcp-agent-portal hub status|routes|mcp-url|ui-url|doctor|cleanup');
      process.exit(1);
    },
  },

  restart: {
    desc: 'Restart the running portal backend',
    async handler() {
      try {
        let res = await apiRequest('/api/restart', 'POST', {});
        console.log(res.message || 'Restarting portal backend...');
      } catch (err) {
        console.error(err.message);
        process.exit(1);
      }
    },
  },

  stop: {
    desc: 'Stop the running portal backend',
    async handler() {
      try {
        await apiRequest('/api/stop', 'POST', {});
        console.log('Stopping portal backend...');
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
      let { flags, prompt } = parseRunArgs(args);

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

      ws.on('message', async (data) => {
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
            let text = msg.params.text || '';
            if (!text && currentTask) {
              let result = await mcpCall('get_task_result', { taskId: currentTask });
              text = extractTextResult(result);
            }
            console.log(`\n[Task Completed: ${currentTask}]\nResult: ${text}`);
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
  printLogo();
  console.log(`${c.bold}mcp-agent-portal${c.reset} ${c.dim}v${pkg.version}${c.reset}

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
  --provider <name>      Provider to use (gemini, codex, opencode)
  --cwd <path>           Working directory (default: current)

Options for 'gateway':
  status                 Show gateway config without secrets
  enable --provider deepseek
                         Enable DeepSeek gateway defaults
  disable                Disable the gateway
  test                   Probe running /anthropic endpoints or validate config

Options for 'hub':
  status                 Show local gateway, route, and backend state
  routes                 List portal.local routes
  mcp-url [--project <path|name>]
                         Print direct Streamable HTTP MCP URL
  ui-url [--project <path|name>]
                         Print direct web UI URL
  doctor                 Probe the current MCP endpoint
  cleanup                Remove dead backend files and stale routes

Web Dashboard:
  http://portal.local/   Available while the server is running

Examples:
  npx mcp-agent-portal run "scan directory" --sync
  npx mcp-agent-portal hub mcp-url
  npx mcp-agent-portal hub doctor
  npx mcp-agent-portal gateway enable --provider deepseek
  npx mcp-agent-portal gateway test
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
