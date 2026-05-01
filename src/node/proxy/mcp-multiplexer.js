// @ctx mcp-multiplexer.ctx
import { createInterface } from 'node:readline';
import { ToolIndex } from './tool-index.js';

/**
 * Smart Tool Gateway — exposes 3 meta-tools instead of proxying all child tools.
 * 
 * Meta-tools:
 *   discover_tools  — search child tools by keyword, tag, or server
 *   call_tool        — proxy a call to any child tool by name
 *   get_portal_status — health, server list, tool counts
 */

let META_TOOLS = [
  {
    name: 'discover_tools',
    description: 'Search available MCP tools across all connected servers. Use this to find the right tool before calling it. Returns tool names, descriptions, and which server provides them. Call with no arguments to see all available tools, or filter by query/tag/server.\n\n💡 HINT: There are many tools available for code analysis (e.g., get_skeleton, get_ai_context), task delegation (e.g., delegate_task), and infrastructure (e.g., list_skills, create_group). Use this tool to find their exact names and arguments.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword search across tool names and descriptions. Example: "skeleton", "code analysis", "delegate"' },
        tag: { type: 'string', description: 'Filter by tag (pre-configured categories). Use get_portal_status to see available tags.' },
        server: { type: 'string', description: 'Filter by server name. Example: "project-graph", "agent-pool"' },
      },
    },
  },
  {
    name: 'call_tool',
    description: 'Call any tool from any connected MCP server by name. First use discover_tools to find the tool name, then call it here with its arguments. The call is transparently proxied to the correct server.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tool name (as returned by discover_tools). Example: "get_skeleton", "delegate_task"' },
        arguments: { type: 'object', description: 'Arguments to pass to the tool (matches the tool\'s inputSchema)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_portal_status',
    description: 'Get the status of the mcp-agent-portal: connected MCP servers, their health, total tool count, and available tags for discover_tools filtering.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'create_chat',
    description: 'Create a new Agent Chat session in the portal UI. The UI will instantly display the new chat. Returns the newly created chat ID.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name or title for the new chat.' },
        adapter: { type: 'string', description: 'Agent adapter to use (e.g. "pool", "gemini"). Optional.' },
        parentChatId: { type: 'string', description: 'Parent chat ID for delegation hierarchy. Set this when an orchestrator creates a sub-chat for a delegated task. Optional.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'send_chat_message',
    description: 'Send a message to an existing Agent Chat session in the portal UI. The message will appear instantly in the UI.',
    inputSchema: {
      type: 'object',
      properties: {
        chatId: { type: 'string', description: 'ID of the chat session (returned from create_chat).' },
        text: { type: 'string', description: 'Text content of the message.' },
        role: { type: 'string', description: 'Role of the sender (e.g. "agent", "user"). Defaults to "agent".' },
      },
      required: ['chatId', 'text'],
    },
  },
];

export class MCPMultiplexer {
  constructor(proxyManager, ws = null) {
    this.proxyManager = proxyManager;
    this.ws = ws;
    /** @type {Map<number, { serverName: string, originalId: number }>} */
    this.requestMap = new Map();
    this.nextInternalId = 1;
    this.toolIndex = new ToolIndex();
    
    this.childMessageHandler = (serverName, msg) => {
      this.handleChildMessage(serverName, msg);
    };
  }

  listen() {
    this.proxyManager.multiplexerCallbacks.add(this.childMessageHandler);

    // Rebuild tool index and notify IDE when servers change
    this.proxyManager.onServerChange = async (action, serverName) => {
      console.error(`🔄 [multiplexer] Server ${action}: "${serverName}" — rebuilding tool index`);
      // Wait for new server to initialize before indexing
      setTimeout(async () => {
        await this._rebuildIndex();
        this.notifyToolsChanged();
      }, action === 'add' ? 3000 : 100);
    };

    // Build tool index after servers are initialized, then notify IDE so it gets the dynamic hints
    setTimeout(async () => {
      await this._rebuildIndex();
      this.notifyToolsChanged();
    }, 3000);

    if (this.ws) {
      this.ws.on('message', (data) => {
        try {
          let msg = JSON.parse(data.toString());
          this.handleIdeMessage(msg);
        } catch (err) {
          console.error('🔴 [multiplexer] Failed to parse WS msg:', err);
        }
      });
      this.ws.on('close', () => {
        this.proxyManager.multiplexerCallbacks.delete(this.childMessageHandler);
      });
    } else {
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
  }

  async _rebuildIndex() {
    await this.toolIndex.rebuild(this.proxyManager);
    // Load tags from config if available
    try {
      let { readConfig } = await import('../config-store.js');
      let config = readConfig();
      if (config.toolTags) {
        this.toolIndex.setTags(config.toolTags);
      }
    } catch {}
  }

  sendToIde(msg) {
    let str = JSON.stringify(msg) + '\n';
    if (this.ws) {
      this.ws.send(str);
    } else {
      process.stdout.write(str);
    }
    // Broadcast events to the dashboard
    this.proxyManager.broadcastMonitor({
      jsonrpc: '2.0',
      method: 'event',
      params: msg,
    });
  }

  /** Notify IDE that tools list has changed (after hot install/remove). */
  notifyToolsChanged() {
    this.sendToIde({
      jsonrpc: '2.0',
      method: 'notifications/tools/list_changed',
    });
  }

  handleIdeMessage(msg) {
    this.proxyManager.broadcastMonitor({
      jsonrpc: '2.0',
      method: 'event',
      params: { direction: 'in', ...msg },
    });

    if (msg.method === 'initialize') {
      // Register IDE workspaces as projects from MCP roots
      let roots = msg.params?.roots || [];
      if (roots.length > 0) {
        import('../config-store.js').then(({ addProject, getActiveProjectIds, setActiveProjectIds }) => {
          for (let root of roots) {
            let rootPath = root.uri?.replace(/^file:\/\//, '') || root.uri;
            if (!rootPath) continue;
            let proj = addProject({ path: rootPath });
            let active = getActiveProjectIds();
            if (!active.includes(proj.id)) {
              active.push(proj.id);
              setActiveProjectIds(active);
            }
            this.proxyManager.broadcastMonitor({
              jsonrpc: '2.0',
              method: 'patch',
              params: { path: 'projects.opened', value: proj.id },
            });
          }
        }).catch(err => {
          console.error('🔴 [multiplexer] Failed to register project from roots:', err.message);
        });
      }

      this.sendToIde({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: { listChanged: true }, resources: {} },
          serverInfo: { name: 'mcp-agent-portal', version: '2.0.0' },
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
      // Return our 3 meta-tools, with dynamic hints injected
      this.sendToIde({
        jsonrpc: '2.0',
        id: msg.id,
        result: { tools: this._getDynamicMetaTools() },
      });
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
      this._handleToolCall(msg);
      return;
    }

    // Default: unknown method — silently drop
  }

  /**
   * Generates the 3 meta-tools with dynamic hints about currently available tools.
   */
  _getDynamicMetaTools() {
    let discoverDesc = META_TOOLS[0].description;
    
    if (this.toolIndex.isReady) {
      let servers = this.toolIndex.getServers();
      let hints = [];
      for (let s of servers) {
        // Find top 3-4 tools for this server to act as hints
        let serverTools = [...this.toolIndex.tools.values()]
          .filter(t => t.server === s.name)
          .slice(0, 4)
          .map(t => t.tool.name);
        if (serverTools.length > 0) {
          hints.push(`- [${s.name}]: ${serverTools.join(', ')}...`);
        }
      }
      if (hints.length > 0) {
        discoverDesc += '\n\n💡 HINTS - Available tools include:\n' + hints.join('\n');
      }
    }

    return [
      { ...META_TOOLS[0], description: discoverDesc },
      META_TOOLS[1],
      META_TOOLS[2],
      META_TOOLS[3],
      META_TOOLS[4]
    ];
  }

  /**
   * Handle tools/call — dispatch to meta-tool handlers or proxy to child.
   * @param {object} msg
   */
  async _handleToolCall(msg) {
    let toolName = msg.params?.name;
    let args = msg.params?.arguments || {};

    try {
      if (toolName === 'discover_tools') {
        let result = this.toolIndex.search(args);
        this.sendToIde({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          },
        });
        return;
      }

      if (toolName === 'get_portal_status') {
        let status = {
          servers: this.toolIndex.getServers(),
          health: this.proxyManager.getHealthStatus(),
          totalTools: this.toolIndex.tools.size,
          tags: this.toolIndex.getAvailableTags(),
          mode: process.env.PORTAL_MODE || 'standalone',
        };
        this.sendToIde({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
          },
        });
        return;
      }

      if (toolName === 'create_chat') {
        let { createChat } = await import('../config-store.js');
        let chat = createChat({
          name: args.name,
          adapter: args.adapter || 'pool',
          parentChatId: args.parentChatId || null,
        });
        // Broadcast event so UI reactive tabs open automatically
        this.proxyManager.broadcastMonitor({ jsonrpc: '2.0', method: 'patch', params: { path: 'chats.created', value: chat } });
        this.sendToIde({
          jsonrpc: '2.0',
          id: msg.id,
          result: { content: [{ type: 'text', text: `Chat created. ID: ${chat.id}` }] }
        });
        return;
      }

      if (toolName === 'send_chat_message') {
        let { appendChatMessage } = await import('../config-store.js');
        appendChatMessage(args.chatId, {
          role: args.role || 'agent',
          text: args.text
        });
        // Broadcast event for UI reactive updates
        this.proxyManager.broadcastMonitor({ jsonrpc: '2.0', method: 'patch', params: { path: 'chats.updated', value: args.chatId } });
        this.sendToIde({
          jsonrpc: '2.0',
          id: msg.id,
          result: { content: [{ type: 'text', text: 'Message sent successfully.' }] }
        });
        return;
      }

      if (toolName === 'call_tool') {
        let realToolName = args.name;
        let realArgs = args.arguments || {};

        if (!realToolName) {
          this.sendToIde({
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32602, message: 'Missing "name" argument — specify which tool to call' },
          });
          return;
        }

        let entry = this.toolIndex.get(realToolName);
        if (!entry) {
          // Try rebuild and check again
          await this._rebuildIndex();
          entry = this.toolIndex.get(realToolName);
        }

        if (!entry) {
          this.sendToIde({
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32601, message: `Unknown tool: "${realToolName}". Use discover_tools to find available tools.` },
          });
          return;
        }

        // Proxy the call to the child server
        let internalId = this.nextInternalId++;
        this.requestMap.set(internalId, { serverName: entry.server, originalId: msg.id });
        this.proxyManager.sendToChild(entry.server, {
          jsonrpc: '2.0',
          id: internalId,
          method: 'tools/call',
          params: { name: realToolName, arguments: realArgs },
        });
        return;
      }

      // Unknown meta-tool
      this.sendToIde({
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32601, message: `Unknown tool: ${toolName}` },
      });
    } catch (err) {
      this.sendToIde({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        },
      });
    }
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
