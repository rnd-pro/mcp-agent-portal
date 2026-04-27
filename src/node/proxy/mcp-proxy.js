// @ctx mcp-proxy.ctx
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AdapterPool } from '../adapters/pool.js';
import { PluginLoader } from '../plugins/plugin-loader.js';

const CONFIG_PATH = path.join(os.homedir(), '.gemini', 'agent-portal.json');

export class MCPProxyManager {
  constructor() {
    /** @type {Map<string, object>} */
    this.servers = new Map();
    /** @type {Set<import('ws').WebSocket>} */
    this.monitors = new Set();
    this.multiplexerCallback = null;
    this.nextRequestId = 1;
    /** @type {Map<string, { resolve: Function, reject: Function }>} */
    this.pendingRequests = new Map();
    this.adapterPool = new AdapterPool({});
    this.pluginLoader = new PluginLoader({}, { adapterPool: this.adapterPool, mcpProxy: this, broadcast: (msg) => this.broadcastMonitor(msg) });
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

  startAllServers(callback) {
    this.multiplexerCallback = callback;
    for (let serverName of this.servers.keys()) {
      this.spawnServer(serverName);
    }
    this.pluginLoader.initAll().catch(err => console.error('🔴 [MCPProxy] Plugin init error:', err));
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
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    settings.process = child;
    settings.pid = child.pid;

    child.stderr.on('data', (data) => {
      console.error(`🟡 [${serverName}]`, data.toString().trim());
    });

    child.on('error', (err) => {
      console.error(`🔴 [${serverName}] Spawn error:`, err);
    });

    child.on('exit', (code, signal) => {
      settings.process = null;
      settings.pid = null;

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
        params: { type: 'crash', server: serverName, code, attempt: settings.crashes, delay },
      });

      settings.respawnTimer = setTimeout(() => {
        this.spawnServer(serverName);
        // Reset crash counter after 10s stable uptime
        setTimeout(() => {
          if (settings.process) settings.crashes = 0;
        }, 10000);
      }, delay);
    });

    let outBuffer = '';
    child.stdout.on('data', (data) => {
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
              this.pendingRequests.delete(`${serverName}:${msg.id}`);
              req.resolve(msg.result || msg);
              continue;
            }

            if (this.multiplexerCallback) {
              this.multiplexerCallback(serverName, msg);
            }
          } catch (e) {}
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
  requestFromChild(serverName, method, params) {
    return new Promise((resolve, reject) => {
      let s = this.servers.get(serverName);
      if (!s || !s.process) {
        return reject(new Error('Server not running'));
      }
      let id = this.nextRequestId++;
      this.pendingRequests.set(`${serverName}:${id}`, { resolve, reject });

      this.sendToChild(serverName, {
        jsonrpc: '2.0',
        id,
        method,
        params,
      });

      setTimeout(() => {
        if (this.pendingRequests.has(`${serverName}:${id}`)) {
          this.pendingRequests.delete(`${serverName}:${id}`);
          reject(new Error('Timeout'));
        }
      }, 5000);
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

  handleUpgrade(req, socket, head) {
    let url = new URL(req.url, 'http://localhost');
    let parts = url.pathname.split('/').filter(Boolean);
    
    if (parts[0] === 'ws' && parts[1] === 'client') {
      this.handleRemoteClient(req, socket, head);
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
          if (this.multiplexerCallback) {
            this.multiplexerCallback(remoteId, msg);
          }
        } catch (e) {}
      });

      ws.on('close', () => {
        console.log(`🟡 [Master] Remote client disconnected: ${remoteId}`);
        this.servers.delete(remoteId);
      });
    });
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

  /** Stop all servers and adapters. */
  stopAll() {
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
