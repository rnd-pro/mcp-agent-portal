// @ctx mcp-multiplexer.ctx
import { createInterface } from 'node:readline';

export class MCPMultiplexer {
  constructor(proxyManager) {
    this.proxyManager = proxyManager;
    /** @type {Map<number, { serverName: string, originalId: number }>} */
    this.requestMap = new Map();
    this.nextInternalId = 1;
    /** @type {Map<string, string>} */
    this.toolsMap = new Map();
  }

  listen() {
    this.proxyManager.startAllServers((serverName, msg) => {
      this.handleChildMessage(serverName, msg);
    });

    let rl = createInterface({
      input: process.stdin,
      terminal: false,
    });

    rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        let msg = JSON.parse(line);
        this.handleIdeMessage(msg);
      } catch (err) {
        console.error('🔴 [multiplexer] Failed to parse IDE msg:', err);
      }
    });
  }

  sendToIde(msg) {
    process.stdout.write(JSON.stringify(msg) + '\n');
    // Broadcast events to the dashboard
    this.proxyManager.broadcastMonitor({
      jsonrpc: '2.0',
      method: 'event',
      params: msg,
    });
  }

  handleIdeMessage(msg) {
    this.proxyManager.broadcastMonitor({
      jsonrpc: '2.0',
      method: 'event',
      params: { direction: 'in', ...msg },
    });

    if (msg.method === 'initialize') {
      this.sendToIde({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: 'agent-portal', version: '2.0.0' },
        },
      });
      // Broadcast initialize to all children
      for (let serverName of this.proxyManager.servers.keys()) {
        this.proxyManager.sendToChild(serverName, msg);
      }
      return;
    }

    if (msg.method === 'initialized' || msg.method === 'notifications/initialized') {
      for (let serverName of this.proxyManager.servers.keys()) {
        this.proxyManager.sendToChild(serverName, msg);
      }
      return;
    }

    if (msg.method === 'tools/list') {
      this.aggregateList(msg.id, 'tools/list', 'tools');
      return;
    }

    if (msg.method === 'prompts/list') {
      this.aggregateList(msg.id, 'prompts/list', 'prompts');
      return;
    }

    if (msg.method === 'resources/list') {
      this.aggregateList(msg.id, 'resources/list', 'resources');
      return;
    }

    if (msg.method === 'tools/call') {
      let toolName = msg.params?.name;
      let targetServer = this.toolsMap.get(toolName);
      if (!targetServer) {
        this.sendToIde({
          jsonrpc: '2.0',
          id: msg.id,
          error: { code: -32601, message: `Unknown tool: ${toolName}` },
        });
        return;
      }

      let internalId = this.nextInternalId++;
      this.requestMap.set(internalId, { serverName: targetServer, originalId: msg.id });
      this.proxyManager.sendToChild(targetServer, { ...msg, id: internalId });
      return;
    }

    // Default: unknown method — silently drop
  }

  /**
   * Aggregate list responses from all child servers.
   * @param {number} ideRequestId
   * @param {string} method
   * @param {string} key
   */
  async aggregateList(ideRequestId, method, key) {
    let allItems = [];

    for (let serverName of this.proxyManager.servers.keys()) {
      try {
        let response = await this.proxyManager.requestFromChild(serverName, method, {});
        if (response && response[key]) {
          for (let item of response[key]) {
            allItems.push(item);
            if (key === 'tools') {
              this.toolsMap.set(item.name, serverName);
            }
          }
        }
      } catch (err) {
        console.error(`🟡 [multiplexer] Failed to get ${key} from ${serverName}:`, err.message);
      }
    }

    this.sendToIde({
      jsonrpc: '2.0',
      id: ideRequestId,
      result: { [key]: allItems },
    });
  }

  handleChildMessage(serverName, msg) {
    // If it's a response to a proxied request
    if (msg.id !== undefined && this.requestMap.has(msg.id)) {
      let req = this.requestMap.get(msg.id);
      this.requestMap.delete(msg.id);
      this.sendToIde({ ...msg, id: req.originalId });
      return;
    }

    // If it's a notification from a child (e.g. logging)
    if (!msg.id && msg.method) {
      this.sendToIde(msg);
      return;
    }
  }
}

export default MCPMultiplexer;
