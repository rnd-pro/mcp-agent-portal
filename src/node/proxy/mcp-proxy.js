// @ctx mcp-proxy.ctx
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { AdapterPool } from '../adapters/pool.js';
import { PluginLoader } from '../plugins/plugin-loader.js';
import { getStateGraph } from '../state-graph.js';
import { logTrajectory } from '../mlops/flywheel.js';
import { findInRegistry } from '../server/marketplace-registry.js';

let pkgJson;
try {
  let pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../package.json');
  pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
} catch (e) {
  console.error("Failed to load package.json for version:", e);
  pkgJson = { version: 'unknown' };
}
const SERVER_VERSION = `${pkgJson.version}+${Date.now()}`;

const CONFIG_PATH = path.join(os.homedir(), '.agent-portal', 'agent-portal.json');

const MAX_CRASHES = 10;

/**
 * Inactivity Watchdog
 * @param {() => void} onTimeout 
 * @param {number} inactivityMs 
 */
function createWatchdog(onTimeout, inactivityMs = 30000) {
  let timer = null;
  let watchdog = {
    kick() {
      clearTimeout(timer);
      timer = setTimeout(onTimeout, inactivityMs);
    },
    stop() {
      clearTimeout(timer);
      timer = null;
    },
  };
  watchdog.kick();
  return watchdog;
}

export class MCPProxyManager {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    /** @type {Map<string, object>} */
    this.servers = new Map();
    /** @type {Set<import('ws').WebSocket>} */
    this.monitors = new Set();
    /** @type {Map<string, Set<import('ws').WebSocket>>} taskId → chat WS clients */
    this.chatSubscriptions = new Map();
    /** @type {Map<string, string>} taskId → chatId */
    this.taskChatMap = new Map();
    /** @type {Map<string, object[]>} taskId → cached notifications before subscription */
    this.pendingNotifications = new Map();
    /** @type {Set<Function>} */
    this.multiplexerCallbacks = new Set();
    this.nextRequestId = 1;
    /** @type {Map<string, { resolve: Function, reject: Function, watchdog?: object }>} */
    this.pendingRequests = new Map();
    /** @type {Set<import('ws').WebSocket>} state sync WS clients */
    this._stateClients = new Set();
    this.adapterPool = new AdapterPool({});
    this.pluginLoader = new PluginLoader({}, { adapterPool: this.adapterPool, mcpProxy: this, broadcast: (msg) => this.broadcastMonitor(msg) });
    /** @type {Function|null} Called when servers are added/removed */
    this.onServerChange = null;
    this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        let config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        if (config.mcpServers) {
          for (let [name, settings] of Object.entries(config.mcpServers)) {
            let color = `hsl(${Math.floor(Math.random() * 360)}, 65%, 55%)`;
            this.servers.set(name, {
              ...settings,
              color,
              agents: 0,
              pid: null,
              process: null,
              crashes: 0,
              respawnTimer: null,
            });
          }
        }
        if (config.adapters) {
          this.adapterPool = new AdapterPool(config.adapters);
        }
        this.pluginLoader = new PluginLoader(config, {
          adapterPool: this.adapterPool,
          mcpProxy: this,
          broadcast: (msg) => this.broadcastMonitor(msg)
        });
      }
    } catch (err) {
      console.error('🔴 Failed to load MCP config:', err);
    }

    // Validate loaded entries
    for (let [name, settings] of this.servers) {
      if (!settings.command) {
        console.error(`🔴 [config] Server "${name}" missing "command" field — skipping`);
        this.servers.delete(name);
        continue;
      }
      if (!Array.isArray(settings.args)) {
        console.error(`🟡 [config] Server "${name}" has no "args" — defaulting to []`);
        settings.args = [];
      }
    }

    // Auto-install core servers if missing
    const CORE_SERVERS = ['project-graph', 'agent-pool', 'context-x'];
    let configUpdated = false;
    for (let coreName of CORE_SERVERS) {
      if (!this.servers.has(coreName)) {
        let def = findInRegistry(coreName);
        if (def) {
          this.servers.set(coreName, {
            command: def.command,
            args: def.args,
            color: `hsl(${Math.floor(Math.random() * 360)}, 65%, 55%)`,
            agents: 0,
            pid: null,
            process: null,
            crashes: 0,
            respawnTimer: null,
          });
          configUpdated = true;
          console.error(`🟢 [Auto-Install] Added core server: ${coreName}`);
        }
      }
    }
    
    if (configUpdated) {
      this._persistConfig();
    }
  }

  /**
   * Validate a config object without loading it.
   * @param {object} config
   * @returns {string[]} array of error messages (empty = valid)
   */
  static validateConfig(config) {
    let errors = [];
    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      errors.push('Missing "mcpServers" object');
      return errors;
    }
    for (let [name, s] of Object.entries(config.mcpServers)) {
      if (!s.command) errors.push(`"${name}": missing "command"`);
      if (s.args && !Array.isArray(s.args)) errors.push(`"${name}": "args" must be array`);
    }
    return errors;
  }

  startAllServers() {
    for (let serverName of this.servers.keys()) {
      this.spawnServer(serverName);
    }
    this.pluginLoader.initAll().catch(err => console.error('🔴 [MCPProxy] Plugin init error:', err));
    this.startHealthCheck();

    // Set up persistent roots/list handler for all child servers
    this._installRootsHandler();

    // Track which servers have been initialized
    this._initializedServers = new Set();
  }

  /**
   * Send initialize with roots from StateGraph to child server(s).
   * This is only needed in web-only mode where no IDE sends initialize.
   * @param {string} [serverName] - If provided, initialize only this server. Otherwise all.
   */
  _sendSyntheticInitialize(serverName) {
    let sg = getStateGraph();
    let projects = sg.getProjectHistory();
    let validProjects = projects.filter(p => p.path && p.path !== '/' && p.name);
    let roots;
    
    if (validProjects.length === 0) {
      // Fallback: use the portal's own project root
      roots = [{ uri: `file://${this.projectRoot}`, name: 'portal' }];
    } else {
      // First project becomes workspace root (project-graph uses first root as boundary).
      // All valid project paths are listed so roots/list responses are complete.
      roots = validProjects.map(p => ({ uri: `file://${p.path}`, name: p.prefix || p.path.split('/').pop() }));
    }

    let initMsg = {
      jsonrpc: '2.0',
      id: this.nextRequestId++,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: { roots: { listChanged: true } },
        clientInfo: { name: 'mcp-agent-portal', version: '2.0.0' },
        roots,
      },
    };

    let initId = initMsg.id;
    let targetServers = serverName ? [serverName] : [...this.servers.keys()];

    for (let sName of targetServers) {
      let s = this.servers.get(sName);
      if (s && s.process) {
        // Register a pending request so the initialize response doesn't error
        this.pendingRequests.set(`${sName}:${initId}`, {
          resolve: () => {
            // After initialize response, send initialized notification
            this.sendToChild(sName, {
              jsonrpc: '2.0',
              method: 'notifications/initialized',
            });
            console.error(`🟢 [${sName}] Synthetic initialize completed`);
          },
          reject: () => {},
        });
        this.sendToChild(sName, initMsg);

        // Set up timeout to clean up pending request
        setTimeout(() => {
          this.pendingRequests.delete(`${sName}:${initId}`);
        }, 5000);
      }
    }
  }

  /**
   * Install a persistent handler that responds to roots/list requests from child servers.
   * This is kept alive for the lifetime of the proxy (not just init).
   */
  _installRootsHandler() {
    let rootsHandler = (sName, msg) => {
      if (msg.method === 'roots/list' && msg.id !== undefined) {
        let sg = getStateGraph();
        let projects = sg.getProjectHistory();
        let validProjects = projects.filter(p => p.path && p.path !== '/' && p.name);
        let roots = validProjects.length > 0
          ? validProjects.map(p => ({ uri: `file://${p.path}`, name: p.prefix || p.path.split('/').pop() }))
          : [{ uri: `file://${this.projectRoot}`, name: 'portal' }];
        this.sendToChild(sName, {
          jsonrpc: '2.0',
          id: msg.id,
          result: { roots },
        });
      }
    };
    this.multiplexerCallbacks.add(rootsHandler);
  }

  spawnServer(serverName) {
    let settings = this.servers.get(serverName);
    if (settings.process) return;

    settings.agents = 1; // At least 1 agent (the IDE itself)
    this.broadcastMonitor({
      jsonrpc: '2.0',
      method: 'patch',
      params: { path: 'project.agents', value: settings.agents },
    });

    let env = { ...process.env, ...settings.env };
    let child = spawn(settings.command, settings.args, {
      cwd: settings.cwd || this.projectRoot,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    settings.process = child;
    settings.pid = child.pid;

    // Send synthetic initialize shortly after spawning
    setTimeout(() => {
      if (!this._initializedServers?.has(serverName)) {
        this._initializedServers?.add(serverName);
        this._sendSyntheticInitialize(serverName);
      }
    }, 500);

    child.stderr.on('data', (data) => {
      // Kick all watchdogs for this server
      for (let [key, req] of this.pendingRequests) {
        if (key.startsWith(`${serverName}:`) && req.watchdog) {
          req.watchdog.kick();
        }
      }

      let text = data.toString();
      // Parse task notifications from stderr side-channel
      for (let line of text.split('\n')) {
        if (line.startsWith('__TASK_NOTIFY__')) {
          try {
            let msg = JSON.parse(line.slice('__TASK_NOTIFY__'.length));
            this.routeTaskNotification(msg);
          } catch (err) {
            console.error(`🔴 [${serverName}] Failed to parse __TASK_NOTIFY__:`, err.message);
          }
          continue;
        }
        if (line.trim()) {
          console.error(`🟡 [${serverName}]`, line.trim());
        }
      }
    });

    child.on('error', (err) => {
      console.error(`🔴 [${serverName}] Spawn error:`, err);
    });

    child.on('exit', (code, signal) => {
      settings.process = null;
      settings.pid = null;

      // P1: Immediately reject all pending requests for this server
      for (let [key, req] of this.pendingRequests) {
        if (key.startsWith(`${serverName}:`)) {
          this.pendingRequests.delete(key);
          req.reject(new Error(`Server "${serverName}" crashed`));
        }
      }

      // Intentional shutdown (SIGTERM from stop/restart) — don't respawn
      if (signal === 'SIGTERM' || code === 0) {
        console.error(`🟡 [${serverName}] stopped (code=${code}, signal=${signal})`);
        return;
      }

      // Crash — respawn with exponential backoff
      settings.crashes = (settings.crashes || 0) + 1;
      let delay = Math.min(1000 * Math.pow(2, settings.crashes - 1), 30000);
      console.error(`🔴 [${serverName}] crashed (code=${code}). Respawning in ${delay}ms... (attempt ${settings.crashes})`);

      this.broadcastMonitor({
        jsonrpc: '2.0',
        method: 'event',
        params: { 
          type: 'crash', 
          tool: serverName, 
          ts: Date.now(),
          success: false,
          args: { code, attempt: settings.crashes, delay } 
        },
      });

      this.pluginLoader.dispatchAlert({
        type: 'crash',
        server: serverName,
        message: `Server "${serverName}" crashed (code=${code}). Respawning in ${delay}ms (attempt ${settings.crashes}).`,
        code,
        attempt: settings.crashes,
      });

      // P3: Stop respawning after MAX_CRASHES consecutive failures
      if (settings.crashes >= MAX_CRASHES) {
        console.error(`🔴 [${serverName}] Exceeded ${MAX_CRASHES} consecutive crashes — giving up. Restart manually.`);
        return;
      }

      settings.respawnTimer = setTimeout(() => {
        this.spawnServer(serverName);
        // P2: Reset crash counter after 60s stable uptime (was 10s)
        setTimeout(() => {
          if (settings.process) settings.crashes = 0;
        }, 60000);
      }, delay);
    });

    let outBuffer = '';
    child.stdout.on('data', (data) => {
      // Kick all watchdogs for this server
      for (let [key, req] of this.pendingRequests) {
        if (key.startsWith(`${serverName}:`) && req.watchdog) {
          req.watchdog.kick();
        }
      }

      outBuffer += data.toString();

      let nlIndex;
      while ((nlIndex = outBuffer.indexOf('\n')) !== -1) {
        let line = outBuffer.slice(0, nlIndex);
        outBuffer = outBuffer.slice(nlIndex + 1);
        if (line.trim()) {
          try {
            let msg = JSON.parse(line);

            // Intercept internal requests
            if (msg.id && this.pendingRequests.has(`${serverName}:${msg.id}`)) {
              let req = this.pendingRequests.get(`${serverName}:${msg.id}`);
              if (req.watchdog) req.watchdog.stop();
              this.pendingRequests.delete(`${serverName}:${msg.id}`);
              req.resolve(msg.result || msg);
              continue;
            }

            // Route task notifications to chat WebSocket clients
            if (msg.method === 'notifications/task/event') {
              console.error(`📡 [ChatWS] Task notification: ${msg.params?.type} for ${msg.params?.taskId?.substring(0, 8)}`);
              this.routeTaskNotification(msg);
            }

            for (let cb of this.multiplexerCallbacks) {
              cb(serverName, msg);
            }
          } catch (e) {
            console.error(`🔴 [${serverName}] Failed to broadcast event:`, e.message);
          }
        }
      }
    });
  }

  sendToChild(serverName, msg) {
    let s = this.servers.get(serverName);
    if (s && s.process && s.process.stdin.writable) {
      s.process.stdin.write(JSON.stringify(msg) + '\n');
    }
  }

  /**
   * Send a request to a child server and wait for the response.
   * @param {string} serverName
   * @param {string} method
   * @param {object} params
   * @returns {Promise<object>}
   */
  requestFromChild(serverName, method, params, timeout = 5000) {
    return new Promise((resolve, reject) => {
      let s = this.servers.get(serverName);
      if (!s || !s.process) {
        return reject(new Error('Server not running'));
      }
      let id = this.nextRequestId++;
      let startTime = Date.now();
      
      let wd = createWatchdog(() => {
        if (this.pendingRequests.has(`${serverName}:${id}`)) {
          this.pendingRequests.delete(`${serverName}:${id}`);
          reject(new Error('Timeout'));
        }
      }, timeout);

      this.pendingRequests.set(`${serverName}:${id}`, { 
        resolve: (result) => {
          if (method === 'tools/call') {
            logTrajectory(serverName, method, params, result, Date.now() - startTime);
          }
          resolve(result);
        }, 
        reject,
        watchdog: wd
      });

      this.sendToChild(serverName, {
        jsonrpc: '2.0',
        id,
        method,
        params,
      });
    });
  }

  getInstances() {
    let list = [];
    for (let [name, settings] of this.servers.entries()) {
      list.push({
        name,
        prefix: `/${name}`,
        command: settings.command,
        args: settings.args,
        color: settings.color,
        agents: settings.agents,
        pid: settings.pid,
        connected: false,
      });
    }
    return list;
  }

  /**
   * Hot-install a new MCP server without restarting the portal.
   * Registers, spawns, and persists to config.
   * @param {string} name
   * @param {{ command: string, args?: string[], env?: object }} def
   */
  addServer(name, def) {
    if (this.servers.has(name)) {
      throw new Error(`Server "${name}" already installed`);
    }
    if (!def.command) {
      throw new Error('Missing "command" in server definition');
    }
    let settings = {
      ...def,
      args: def.args || [],
      color: `hsl(${Math.floor(Math.random() * 360)}, 65%, 55%)`,
      agents: 0,
      pid: null,
      process: null,
      crashes: 0,
      respawnTimer: null,
    };
    this.servers.set(name, settings);
    this.spawnServer(name);
    this._persistConfig();
    if (this.onServerChange) this.onServerChange('add', name);
    console.error(`✅ [Marketplace] Installed and started "${name}"`);
  }

  /**
   * Hot-remove an MCP server — stop and unregister.
   * @param {string} name
   */
  removeServer(name) {
    if (this.servers.has(name)) {
      let s = this.servers.get(name);
      if (s.process) {
        try { process.kill(s.process.pid, 'SIGTERM'); } catch (e) {}
      }
      this.servers.delete(name);
      this._persistConfig();
      if (this.onServerChange) this.onServerChange('remove', name);
      this.broadcastMonitor({ jsonrpc: '2.0', method: 'event', params: { type: 'config_update', tool: name } });
    }
  }

  addMultiplexerCallback(cb) {
    this.multiplexerCallbacks.add(cb);
  }

  removeMultiplexerCallback(cb) {
    this.multiplexerCallbacks.delete(cb);
  }

  /** Persist current server list to config file. */
  _persistConfig() {
    try {
      let config = {};
      if (fs.existsSync(CONFIG_PATH)) {
        config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      }
      config.mcpServers = {};
      for (let [name, s] of this.servers) {
        if (s.isRemote) continue; // Don't persist remote WS clients
        config.mcpServers[name] = {
          command: s.command,
          args: s.args,
          ...(s.env ? { env: s.env } : {}),
        };
      }
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    } catch (err) {
      console.error('🔴 [Marketplace] Failed to persist config:', err.message);
    }
  }

  broadcastMonitor(msg) {
    let data = JSON.stringify(msg);
    for (let client of this.monitors) {
      try {
        if (client.readyState === 1) client.send(data);
      } catch (err) {
        this.monitors.delete(client);
      }
    }
  }

  handleStateWs(req, socket, head) {
    let wss = new WebSocketServer({ noServer: true });
    wss.handleUpgrade(req, socket, head, (ws) => {
      this._stateClients.add(ws);
      ws._pendingMessages = 0;

      let sg = getStateGraph();
      let url = new URL(req.url, 'http://localhost');
      let sinceParam = url.searchParams.get('since');
      let sinceVersion = sinceParam ? parseInt(sinceParam, 10) : 0;

      // Delta sync: send only missed patches if possible
      if (sinceVersion > 0) {
        let patches = sg.getPatches(sinceVersion);
        if (patches) {
          // Delta sync — send individual patches
          for (let p of patches) {
            ws.send(JSON.stringify({
              jsonrpc: '2.0', method: 'patch',
              params: { v: p.v, ops: p.ops, serverVersion: SERVER_VERSION },
            }));
          }
        } else {
          // Too old — full snapshot
          let snap = sg.getSnapshot();
          snap.serverVersion = SERVER_VERSION;
          ws.send(JSON.stringify({
            jsonrpc: '2.0', method: 'snapshot',
            params: snap,
          }));
        }
      } else {
        // First connect — full snapshot
        let snap = sg.getSnapshot();
        snap.serverVersion = SERVER_VERSION;
        ws.send(JSON.stringify({
          jsonrpc: '2.0', method: 'snapshot',
          params: snap,
        }));
      }

      ws.on('close', () => this._stateClients.delete(ws));
      ws.on('error', () => this._stateClients.delete(ws));

      // Handle incoming mutations from client
      ws.on('message', (raw) => {
        try {
          let msg = JSON.parse(raw.toString());
          if (msg.method === 'commit' && Array.isArray(msg.params?.ops)) {
            sg.commit(msg.params.ops, msg.params?.source || 'browser');
          }
        } catch (err) {
          console.error('[StateWS] message error:', err.message);
        }
      });
    });
  }

  /**
   * Initialize StateGraph commit listener for versioned WS broadcast.
   * Call once after constructor.
   */
  initStateSync() {
    let sg = getStateGraph();
    const { MAX_WS_QUEUE } = /** @type {any} */ (
      /** @type {typeof import('../state-graph.js')} */ ({MAX_WS_QUEUE: 500})
    );

    sg.on('commit', ({ v, ops }) => {
      let msg = JSON.stringify({
        jsonrpc: '2.0',
        method: 'patch',
        params: { v, ops, serverVersion: SERVER_VERSION },
      });
      for (let client of this._stateClients) {
        try {
          if (client.readyState !== 1) {
            this._stateClients.delete(client);
            continue;
          }
          // Backpressure: disconnect slow clients
          client._pendingMessages = (client._pendingMessages || 0) + 1;
          if (client._pendingMessages > MAX_WS_QUEUE) {
            console.warn('[StateWS] Backpressure: disconnecting slow client');
            client.close(4001, 'Too slow');
            this._stateClients.delete(client);
            continue;
          }
          client.send(msg, () => { client._pendingMessages--; });
        } catch {
          this._stateClients.delete(client);
        }
      }
    });
  }

  handleUpgrade(req, socket, head) {
    let url = new URL(req.url, 'http://localhost');
    let parts = url.pathname.split('/').filter(Boolean);
    
    if (parts[0] === 'mcp-ws') {
      this.handleIdeWs(req, socket, head);
      return true;
    }

    if (parts[0] === 'ws' && parts[1] === 'client') {
      this.handleRemoteClient(req, socket, head);
      return true;
    }

    if (parts[0] === 'ws' && parts[1] === 'chat') {
      this.handleChatWs(req, socket, head);
      return true;
    }

    if (parts[0] === 'ws' && parts[1] === 'state') {
      this.handleStateWs(req, socket, head);
      return true;
    }

    let serverName = parts[0];

    if (this.servers.has(serverName)) {
      if (parts[1] === 'ws' && parts[2] === 'monitor') {
        this.handleMonitor(serverName, req, socket, head);
        return true;
      }
    }
    return false;
  }

  handleIdeWs(req, socket, head) {
    let wss = new WebSocketServer({ noServer: true });
    wss.handleUpgrade(req, socket, head, async (ws) => {
      const { MCPMultiplexer } = await import('./mcp-multiplexer.js');
      let multiplexer = new MCPMultiplexer(this, ws);
      multiplexer.listen();
      // Project registration happens in multiplexer on initialize (from IDE roots)
    });
  }

  handleMonitor(serverName, req, socket, head) {
    let wss = new WebSocketServer({ noServer: true });
    wss.handleUpgrade(req, socket, head, (ws) => {
      this.monitors.add(ws);
      let s = this.servers.get(serverName);
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'snapshot',
        params: {
          state: {
            project: {
              name: serverName,
              path: s.args.join(' '),
              color: s.color,
              agents: s.agents,
              pid: s.pid,
            },
          },
        },
      }));
      ws.on('close', () => this.monitors.delete(ws));
    });
  }

  handleRemoteClient(req, socket, head) {
    let wss = new WebSocketServer({ noServer: true });
    wss.handleUpgrade(req, socket, head, (ws) => {
      let remoteId = `remote-${Math.random().toString(36).substr(2, 6)}`;
      
      let virtualServer = {
        command: 'remote-client',
        args: [req.socket.remoteAddress],
        color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`,
        agents: 1,
        pid: 'remote',
        isRemote: true,
        process: {
          stdin: {
            writable: true,
            write: (data) => {
              if (ws.readyState === 1) ws.send(data.trim());
            }
          },
          kill: () => ws.close()
        }
      };
      
      this.servers.set(remoteId, virtualServer);
      console.log(`✅ [Master] Remote client connected: ${remoteId}`);

      ws.on('message', (data) => {
        try {
          let msg = JSON.parse(data.toString());
          if (msg.id && this.pendingRequests.has(`${remoteId}:${msg.id}`)) {
            let reqPending = this.pendingRequests.get(`${remoteId}:${msg.id}`);
            this.pendingRequests.delete(`${remoteId}:${msg.id}`);
            reqPending.resolve(msg.result || msg);
            return;
          }
          for (let cb of this.multiplexerCallbacks) {
            cb(remoteId, msg);
          }
        } catch (e) {
          console.error(`🔴 [${serverName}] Multiplexer callback error:`, e.message);
        }
      });

      ws.on('close', () => {
        console.log(`🟡 [Master] Remote client disconnected: ${remoteId}`);
        this.servers.delete(remoteId);
      });
    });
  }

  /**
   * WebSocket chat handler — clients send prompts, receive streaming task events.
   * Replaces HTTP polling for AgentChat.
   */
  handleChatWs(req, socket, head) {
    let wss = new WebSocketServer({ noServer: true });
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on('message', async (data) => {
        try {
          let msg = JSON.parse(data.toString());
          if (msg.method === 'chat.send') {
            let { chatId, prompt, sessionId, timeout, model, provider } = msg.params || {};
            console.log(`💬 [Chat] Received chat.send for chatId=${chatId}, provider=${provider}, model=${model}`);
            if (!prompt) return;

            // If CLI sends a chat without a proper persisted chatId (or we want to ensure it exists in UI)
            let sg = getStateGraph();
            if (!chatId || !sg.getChat(chatId)) {
              let cwd = msg.params.cwd || this.projectRoot;
              let proj = sg.addProject({ path: cwd, name: path.basename(cwd) });

              let chat = sg.createChat({ 
                name: prompt.substring(0, 40) + (prompt.length > 40 ? '...' : ''),
                projectId: proj.id
              });
              chatId = chat.id;
              sg.appendChatMessage(chatId, { role: 'user', content: prompt });
              console.log(`💬 [Chat] Created new chat ${chatId} for CLI request in project ${proj.id}`);
            }

            // Resolve CWD from project path (prefer explicit, then chat's project, then projectRoot)
            let resolvedCwd = msg.params.cwd;
            if (!resolvedCwd) {
              let chat = sg.getChat(chatId);
              if (chat?.projectId) {
                let proj = sg.get(`projects/${chat.projectId}`);
                if (proj?.path) resolvedCwd = proj.path;
              }
            }
            if (!resolvedCwd) resolvedCwd = this.projectRoot !== '/' ? this.projectRoot : process.env.HOME;

            // Delegate to agent-pool
            if (!provider || !model || !sessionId) {
              let chatData = sg.getChat(chatId);
              if (chatData) {
                if (!provider && chatData.provider) provider = chatData.provider;
                if (!model && chatData.model) model = chatData.model;
                if (!sessionId && chatData.sessionId) sessionId = chatData.sessionId;
              }
            }
            
            let delegateArgs = { prompt, timeout: timeout || 600, cwd: resolvedCwd };
            if (sessionId) delegateArgs.session_id = sessionId;
            if (model) delegateArgs.model = model;
            if (provider) delegateArgs.provider = provider;

            try {
              console.log(`💬 [Chat] Calling delegate_task...`, delegateArgs);
              let result = await this.requestFromChild('agent-pool', 'tools/call', {
                name: 'delegate_task',
                arguments: delegateArgs,
              });
              
              console.log(`💬 [Chat] delegate_task returned`, result);

              let delegateText = result.content?.[0]?.text || '';
              
              // Propagate errors from the adapter directly
              if (result.isError) {
                console.error(`❌ [Chat] delegate_task returned an error state:`, delegateText);
                if (ws.readyState === 1) {
                  ws.send(JSON.stringify({
                    method: 'chat.error',
                    params: { chatId, error: delegateText },
                  }));
                }
                return;
              }

              let taskIdMatch = delegateText.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
              let taskId = taskIdMatch?.[1];

              // Subscribe this WS to task notifications
              if (taskId) {
                console.log(`💬 [Chat] Subscribing WS to taskId=${taskId}`);
                if (!this.chatSubscriptions.has(taskId)) {
                  this.chatSubscriptions.set(taskId, new Set());
                }
                this.chatSubscriptions.get(taskId).add(ws);
                // Persist taskId → chatId mapping for recovery
                this.taskChatMap.set(taskId, chatId);
                getStateGraph().updateChatTask(chatId, taskId);

                // Replay any notifications that arrived before we could subscribe
                let cached = this.pendingNotifications?.get(taskId);
                if (cached && cached.length > 0) {
                  console.log(`💬 [Chat] Replaying ${cached.length} cached notification(s) for taskId=${taskId}`);
                  for (let note of cached) {
                    this.routeTaskNotification(note);
                  }
                  this.pendingNotifications.delete(taskId);
                }
              }
              
              ws.send(JSON.stringify({
                method: 'chat.delegated',
                params: { chatId, taskId, text: delegateText },
              }));
            } catch (err) {
              console.error(`❌ [Chat] Error in delegate_task:`, err);
              if (ws.readyState === 1) {
                ws.send(JSON.stringify({
                  method: 'chat.error',
                  params: { chatId, error: err.message || 'Server error' },
                }));
              }
            }
          } else if (msg.method === 'chat.resume') {
            // Re-subscribe to an in-flight task (after browser reload)
            let { chatId, taskId } = msg.params || {};
            if (taskId) {
              console.log(`💬 [Chat] Resuming subscription for taskId=${taskId}, chatId=${chatId}`);
              if (!this.chatSubscriptions.has(taskId)) {
                this.chatSubscriptions.set(taskId, new Set());
              }
              this.chatSubscriptions.get(taskId).add(ws);
              this.taskChatMap.set(taskId, chatId);

              // Check if task already completed while we were away
              this.requestFromChild('agent-pool', 'tools/call', {
                name: 'get_task_result',
                arguments: { task_id: taskId },
              }).then(result => {
                let text = result.content?.[0]?.text || '';
                // If result contains actual content, the task is done
                if (text && !text.includes('still running')) {
                  if (text.includes('Task not found')) {
                    ws.send(JSON.stringify({ method: 'chat.error', params: { taskId, text: 'Task was lost (e.g. server restart). Please try again.' } }));
                  } else {
                    ws.send(JSON.stringify({ method: 'chat.done', params: { taskId, text } }));
                  }
                  this.chatSubscriptions.delete(taskId);
                  getStateGraph().updateChatTask(chatId, null);
                } else {
                  ws.send(JSON.stringify({ method: 'chat.resumed', params: { taskId, status: 'running' } }));
                }
              }).catch(() => {
                ws.send(JSON.stringify({ method: 'chat.resumed', params: { taskId, status: 'unknown' } }));
              });
            }
          } else if (msg.method === 'chat.cancel') {
              let { chatId, taskId } = msg.params || {};
              if (!taskId && chatId) {
                let chat = getStateGraph().getChat(chatId);
                taskId = chat?.pendingTaskId;
              }
              if (taskId) {
                console.log(`💬 [Chat] Canceling task: ${taskId} for chat ${chatId}`);
                try {
                  await this.requestFromChild('agent-pool', 'tools/call', {
                    name: 'cancel_task',
                    arguments: { task_id: taskId }
                  });
                } catch (e) { console.error('Failed to cancel task:', e); }
              }
            }
        } catch (e) {
          console.error('❌ [ChatWS] Message handler error:', e);
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ method: 'chat.error', params: { error: e.message || 'Internal error' } }));
          }
        }
      });

      ws.on('close', () => {
        // Cleanup subscriptions for this client
        for (let [taskId, clients] of this.chatSubscriptions) {
          clients.delete(ws);
          if (clients.size === 0) this.chatSubscriptions.delete(taskId);
        }
      });
    });
  }

  /**
   * Route a task notification from agent-pool to subscribed chat WS clients.
   * Called from the multiplexer when a 'notifications/task/event' message arrives.
   * @param {object} notification
   */
  routeTaskNotification(notification) {
    let { taskId, type, data } = notification.params || {};
    if (!taskId) return;

    console.log(`💬 [TaskNotify] taskId=${taskId} type=${type}`);

    // Mirror task state into StateGraph for UI visibility + persistence
    let sg = getStateGraph();
    let meta = data?.meta;
    if (meta && type !== 'event') {
      let ops = [{ op: 'set', path: `tasks/${taskId}`, value: {
        ...meta,
        type, // last notification type
        updatedAt: Date.now(),
      }}];
      // Remove completed tasks from graph after a delay (10 min TTL)
      if (type === 'done' || type === 'error' || type === 'cancelled') {
        // Schedule cleanup — keep in graph briefly for UI to display result
        createWatchdog(() => {
          try { sg.del(`tasks/${taskId}`, 'task-ttl'); } catch (e) { console.warn(`[TaskNotify] TTL cleanup failed for ${taskId}:`, e.message); }
        }, 10 * 60 * 1000);
      }
      try { sg.commit(ops, `agent-pool:${type}`); } catch (err) {
        console.error(`[TaskNotify] StateGraph commit failed for ${taskId}:`, err.message);
      }
    }

    let clients = this.chatSubscriptions.get(taskId);
    if (!clients || clients.size === 0) {
      console.log(`💬 [TaskNotify] No subscribers for taskId=${taskId}, type=${type} — caching for 5s`);
      
      // Cache notification in case subscription is still resolving
      if (!this.pendingNotifications.has(taskId)) {
        this.pendingNotifications.set(taskId, []);
        // Clean up after 5s to avoid memory leak if no client ever subscribes
        setTimeout(() => this.pendingNotifications.delete(taskId), 5000);
      }
      this.pendingNotifications.get(taskId).push(notification);

      // Even without subscribers, fetch and save final result to state-graph
      if (type === 'done' || type === 'error') {
        let chatId = this.taskChatMap.get(taskId) || this._findChatForTask(taskId);
        if (chatId) {
          this.taskChatMap.delete(taskId);
          this.requestFromChild('agent-pool', 'tools/call', {
            name: 'get_task_result',
            arguments: { task_id: taskId },
          }).then(result => {
            let text = result.content?.[0]?.text || '';
            this._persistFinalTaskResult(chatId, text, data?.meta?.startedAt);
            getStateGraph().updateChatTask(chatId, null);
          }).catch(() => {
            getStateGraph().updateChatTask(chatId, null);
          });
        }
      }
      return;
    }

    console.log(`💬 [TaskNotify] Routing to ${clients.size} client(s)`);

    let method = type === 'done' ? 'chat.done'
      : type === 'error' ? 'chat.error'
      : 'chat.event';

    // For 'done', fetch the full formatted result and persist it
    let payload;
    if (type === 'done' || type === 'error') {
      let chatId = this.taskChatMap.get(taskId) || this._findChatForTask(taskId);
      if (chatId) this.taskChatMap.delete(taskId);

      this.requestFromChild('agent-pool', 'tools/call', {
        name: 'get_task_result',
        arguments: { task_id: taskId },
      }).then(result => {
        let text = result.content?.[0]?.text || '';
        
        // Persist result into chat to ensure headless integrity
        if (chatId) {
          this._persistFinalTaskResult(chatId, text, data?.meta?.startedAt);
          getStateGraph().updateChatTask(chatId, null);
        }

        // Notify clients to refresh
        for (let client of clients) {
          if (client.readyState === 1) {
            client.send(JSON.stringify({ method, params: { taskId, text } }));
          }
        }
        this.chatSubscriptions.delete(taskId);
      }).catch(() => {
        this.chatSubscriptions.delete(taskId);
        if (chatId) getStateGraph().updateChatTask(chatId, null);
      });
    } else {
      // Stream event
      payload = JSON.stringify({ method, params: { taskId, event: data } });
      for (let client of clients) {
        if (client.readyState === 1) client.send(payload);
      }
    }
  }

  _findChatForTask(taskId) {
    let sg = getStateGraph();
    let state = sg.getState();
    if (!state.chats) return null;
    for (let chatId in state.chats) {
      if (state.chats[chatId].pendingTaskId === taskId) {
        return chatId;
      }
    }
    return null;
  }

  /**
   * Parse the final task result and persist it to StateGraph, ensuring headless integrity.
   */
  _persistFinalTaskResult(chatId, text, startedAt) {
    let sg = getStateGraph();
    let chat = sg.getChat(chatId);
    if (!chat) return;

    let msgs = [...(chat.messages || [])];
    
    // Filter out transient system thinking messages
    msgs = msgs.filter(m => 
      !(m.role === 'system' && (m.text.startsWith('⏳') || m.text.startsWith('✅')))
      && !(m.role === 'thinking' && !m.done)
      && !(m.role === 'tool') // Streamed tool messages are transient
    );

    let meta = {};
    if (text) {
      let lastAgent = [...msgs].reverse().find(m => m.role === 'agent');
      if (!lastAgent || !lastAgent.streaming) {
        let body = text;
        let startIdx = body.indexOf('## Agent Response');
        if (startIdx >= 0) {
          body = body.substring(startIdx + '## Agent Response'.length).trim();
        }
        let endIdx = body.search(/\n+(?:---|## Tools Used|## Errors|## Stats)/i);
        if (endIdx > 0) {
          body = body.substring(0, endIdx).trim();
        }
        msgs.push({ role: 'agent', text: body, streaming: false });
      } else {
        lastAgent.streaming = false;
      }

      let modeMatch = text.match(/- Mode:\s*(.+)/i);
      if (modeMatch) meta.mode = modeMatch[1].trim();
      let sidMatch = text.match(/- Session ID:\s*`([^`]+)`/i);
      if (sidMatch) {
        meta.sessionId = sidMatch[1];
        sg.updateChatSession(chatId, meta.sessionId);
      }
      let exitMatch = text.match(/- Exit code:\s*(\d+)/i);
      if (exitMatch) meta.exitCode = parseInt(exitMatch[1], 10);
      let toolsMatch = text.match(/## Tools Used \((\d+)\)/i);
      if (toolsMatch) meta.tools = parseInt(toolsMatch[1], 10);
      let tokensMatch = text.match(/- Tokens:\s*(\d+)/i);
      if (tokensMatch) meta.tokens = parseInt(tokensMatch[1], 10);
      let costMatch = text.match(/- Cost:\s*\$?([\d.]+)/i);
      if (costMatch) meta.cost = parseFloat(costMatch[1]);
      let errorsMatch = text.match(/## Errors\n+([\s\S]*?)(?=\n+##|$)/i);
      if (errorsMatch) meta.errors = errorsMatch[1].trim();
      let failMatch = text.match(/## \[ERR\] Agent Failed[\s\S]*?(?=\n+##|$)/i);
      if (failMatch) meta.errors = failMatch[0].trim();
    }

    let elapsedSec = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
    msgs.push({
      role: 'thinking',
      elapsed: elapsedSec,
      done: true,
      meta: Object.keys(meta).length > 0 ? meta : null
    });

    sg.replaceChatMessages(chatId, msgs);
    sg.updateChatTask(chatId, null);
    
    // Set lastTaskStatus based on exitCode
    let lastTaskStatus = 'done';
    if (meta.exitCode !== undefined && meta.exitCode !== 0) {
      lastTaskStatus = 'error';
    }
    sg.updateChat(chatId, { lastTaskStatus });

    // Broadcast chat update to all UI clients
    this.broadcastMonitor({ jsonrpc: '2.0', method: 'patch', params: { path: 'chats.updated', value: chatId } });
  }

  /**
   * Intentionally stop a server (no respawn).
   * @param {string} serverName
   */
  stopServer(serverName) {
    let s = this.servers.get(serverName);
    if (!s) return;
    if (s.respawnTimer) clearTimeout(s.respawnTimer);
    s.respawnTimer = null;
    s.crashes = 0;
    if (s.process) s.process.kill('SIGTERM');
  }

  // ── Health Check ────────────────────────────────────

  /**
   * Start periodic health checks for all running servers.
   * Pings every 30s, alerts after 3 consecutive failures.
   */
  startHealthCheck() {
    if (this._healthInterval) return;
    this._healthFailures = new Map();
    this._healthInterval = setInterval(() => this._runHealthCheck(), 30000);
    // First check after 10s (let servers initialize)
    createWatchdog(() => this._runHealthCheck(), 10000);
    console.error('💓 [HealthCheck] Started (30s interval)');
  }

  stopHealthCheck() {
    if (this._healthInterval) {
      clearInterval(this._healthInterval);
      this._healthInterval = null;
    }
  }

  async _runHealthCheck() {
    let results = {};

    for (let [name, s] of this.servers) {
      if (s.isRemote || !s.process) {
        results[name] = { status: s.isRemote ? 'remote' : 'stopped' };
        continue;
      }

      try {
        let start = Date.now();
        await this.requestFromChild(name, 'tools/list', {});
        let latency = Date.now() - start;
        this._healthFailures.set(name, 0);
        results[name] = { status: 'healthy', latency };
      } catch (err) {
        let fails = (this._healthFailures.get(name) || 0) + 1;
        this._healthFailures.set(name, fails);
        results[name] = { status: 'unhealthy', failures: fails, error: err.message };

        if (fails === 3) {
          console.error(`🔴 [HealthCheck] "${name}" unresponsive (3 consecutive failures)`);
          this.pluginLoader.dispatchAlert({
            type: 'health',
            server: name,
            message: `Server "${name}" failed 3 consecutive health checks. Last error: ${err.message}`,
            failures: fails,
          });
        }
      }
    }

    this.broadcastMonitor({
      jsonrpc: '2.0',
      method: 'health',
      params: results,
    });
  }

  /**
   * Get current health status snapshot.
   * @returns {Record<string, { status: string, latency?: number, failures?: number }>}
   */
  getHealthStatus() {
    let results = {};
    for (let [name, s] of this.servers) {
      if (s.isRemote) {
        results[name] = { status: 'remote' };
      } else if (!s.process) {
        results[name] = { status: 'stopped' };
      } else {
        let fails = this._healthFailures?.get(name) || 0;
        results[name] = { status: fails > 0 ? 'degraded' : 'healthy', failures: fails };
      }
    }
    return results;
  }

  /** Stop all servers and adapters. */
  stopAll() {
    this.stopHealthCheck();
    for (let name of this.servers.keys()) {
      this.stopServer(name);
    }
    if (this.adapterPool) {
      this.adapterPool.destroy();
    }
    if (this.pluginLoader) {
      this.pluginLoader.destroyAll().catch(err => console.error('🔴 [MCPProxy] Plugin destroy error:', err));
    }
  }
}

export default MCPProxyManager;

