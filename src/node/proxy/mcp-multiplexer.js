// @ctx mcp-multiplexer.ctx
import { createInterface } from 'node:readline';
import { ToolIndex } from './tool-index.js';

const DEFAULT_CHAT_AGENT = 'orchestrator';

/**
 * Smart Tool Gateway — exposes 3 meta-tools instead of proxying all child tools.
 * 
 * Meta-tools:
 *   discover_tools  — search child tools by keyword, tag, or server
 *   call_tool        — proxy a call to any child tool by name
 *   get_portal_status — health, server list, tool counts
 */

export let META_TOOLS = [
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
        agent: { type: 'string', description: 'Agent role slug for Agent Pool chats (e.g. "orchestrator", "backend-engineer"). Optional.' },
        agent_slug: { type: 'string', description: 'Alias for agent. Agent role slug for Agent Pool chats. Optional.' },
        provider: { type: 'string', description: 'CLI provider for pool chats (e.g. "codex", "gemini", "opencode", "claude"). Optional.' },
        model: { type: 'string', description: 'Model to preselect for this chat. Optional.' },
        approval_mode: { type: 'string', enum: ['yolo', 'auto_edit', 'plan'], description: 'Access mode: yolo, auto_edit, or plan. Optional.' },
        chatType: { type: 'string', description: 'Chat type preset (e.g. "standard", "planning", "review"). Optional.' },
        parentChatId: { type: 'string', description: 'Parent chat ID for delegation hierarchy. Set this when an orchestrator creates a sub-chat for a delegated task. Optional.' },
        projectId: { type: 'string', description: 'Project ID to scope this chat to. Optional — inherits from parent chat if not specified.' },
        agentIcon: { type: 'string', description: 'Material Symbols icon name for the agent. Optional.' },
        agentColor: { type: 'string', description: 'CSS color for the agent badge. Optional.' },
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
  {
    name: 'resume_chat',
    description: 'Continue an existing Agent Chat by sending a new user prompt and starting a delegated agent task bound to the same chat. Reuses saved provider, model, approval mode, agent role, and provider session ID when available.',
    inputSchema: {
      type: 'object',
      properties: {
        chatId: { type: 'string', description: 'Existing Agent Chat ID to continue.' },
        prompt: { type: 'string', description: 'New user prompt to send into the chat.' },
        provider: { type: 'string', description: 'Override CLI provider for this turn. Defaults to saved chat provider.' },
        model: { type: 'string', description: 'Override model for this turn. Defaults to saved chat model.' },
        session_id: { type: 'string', description: 'Override provider session/thread ID. Defaults to saved chat sessionId.' },
        approval_mode: { type: 'string', enum: ['yolo', 'auto_edit', 'plan'], description: 'Override access mode. Defaults to saved chat approval mode.' },
        agent: { type: 'string', description: 'Override agent role slug. Alias for agent_slug.' },
        agent_slug: { type: 'string', description: 'Override agent role slug.' },
        cwd: { type: 'string', description: 'Override working directory. Defaults to the chat project path or portal project root.' },
        context_mode: { type: 'string', enum: ['auto', 'off'], description: 'Context package mode passed to delegate_task. Default: auto.' },
        files: { type: 'array', items: { type: 'string' }, description: 'Known relevant file paths passed to delegate_task as structured context hints.' },
        timeout: { type: 'number', description: 'Timeout in seconds. Default: 600.' },
      },
      required: ['chatId', 'prompt'],
    },
  },
  {
    name: 'remember',
    description: 'Save a key-value pair in the global persistent memory. Use this to remember user preferences, environment specifics, or cross-workflow insights.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Unique identifier for the memory.' },
        value: { type: 'string', description: 'The value or context to remember. Can be a complex stringified JSON object.' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'recall',
    description: 'Recall values from the global persistent memory by a query string. Returns all memories where the key contains the query.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Substring to search for in memory keys.' },
      },
      required: ['query'],
    },
  },
];

function _extractTaskId(result) {
  let text = result?.content?.map(c => c.text || '').join('\n') || '';
  return text.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/)?.[1] || null;
}

/**
 * Continue an existing Agent Chat by appending a user prompt and launching
 * a delegated task that is bound back to the same chat.
 *
 * @param {object} proxyManager
 * @param {object} args
 * @returns {Promise<object>}
 */
export async function resumeChatTool(proxyManager, args = {}) {
  let chatId = args.chatId || args.chat_id;
  let prompt = args.prompt || args.text;
  if (!chatId || !prompt) {
    return { content: [{ type: 'text', text: 'Missing required chatId or prompt.' }], isError: true };
  }

  let { getStateGraph } = await import('../state-graph.js');
  let sg = getStateGraph();
  let chat = sg.getChat(chatId);
  if (!chat) {
    return { content: [{ type: 'text', text: `Chat not found: ${chatId}` }], isError: true };
  }

  let cwd = args.cwd;
  if (!cwd && chat.projectId) {
    let project = sg.get(`projects/${chat.projectId}`);
    if (project?.path) cwd = project.path;
  }
  if (!cwd) cwd = proxyManager.projectRoot !== '/' ? proxyManager.projectRoot : process.env.HOME;

  let provider = args.provider || chat.provider || undefined;
  let model = args.model || chat.model || undefined;
  let sessionId = args.session_id || args.sessionId || chat.sessionId || undefined;
  let approvalMode = args.approval_mode || chat.approval_mode || undefined;
  let agentSlug = args.agent || args.agent_slug || chat.agent || DEFAULT_CHAT_AGENT;

  sg.appendChatMessage(chatId, { role: 'user', text: prompt });
  proxyManager.broadcastMonitor?.({ jsonrpc: '2.0', method: 'patch', params: { path: 'chats.updated', value: chatId } });

  let delegateArgs = {
    prompt,
    timeout: args.timeout || 600,
    cwd,
    chat_id: chatId,
  };
  if (provider) delegateArgs.provider = provider;
  if (model) delegateArgs.model = model;
  if (sessionId) delegateArgs.session_id = sessionId;
  if (approvalMode) delegateArgs.approval_mode = approvalMode;
  if (agentSlug && agentSlug !== 'none') delegateArgs.agent_slug = agentSlug;
  if (args.context_mode === 'auto' || args.context_mode === 'off') delegateArgs.context_mode = args.context_mode;
  if (Array.isArray(args.files)) {
    let files = [...new Set(args.files.map(file => String(file || '').trim()).filter(Boolean))];
    if (files.length) delegateArgs.files = files;
  }

  let result = await proxyManager.requestFromChild('agent-pool', 'tools/call', {
    name: 'delegate_task',
    arguments: delegateArgs,
  }, 600_000);
  if (result?.isError) return result;

  let taskId = _extractTaskId(result);
  if (taskId) {
    sg.updateChatTask(chatId, taskId);
    if (proxyManager.chatWsServer) {
      proxyManager.chatWsServer.taskChatMap.set(taskId, chatId);
    }
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        ok: true,
        chatId,
        taskId,
        provider: provider || null,
        model: model || null,
        approval_mode: approvalMode || null,
        session_id: sessionId || null,
        delegate: result?.content?.[0]?.text || '',
      }, null, 2),
    }],
  };
}

/** Multiplexes IDE WebSocket connections to multiple child MCP servers. */
export class MCPMultiplexer {
  constructor(proxyManager, ws = null) {
    this.proxyManager = proxyManager;
    this.ws = ws;
    /** @type {Map<number, { serverName: string, originalId: number }>} */
    this.requestMap = new Map();
    this.nextInternalId = 1;
    this.toolIndex = new ToolIndex();
    this._indexPromise = null;
    
    this.childMessageHandler = (serverName, msg) => {
      this.handleChildMessage(serverName, msg);
    };
  }

  listen() {
    this.proxyManager.multiplexerCallbacks.add(this.childMessageHandler);

    // Rebuild tool index and notify IDE when servers change
    this.proxyManager.onServerChange = async (action, serverName) => {
      // Wait for new server to initialize before indexing
      setTimeout(async () => {
        await this._ensureIndex(true);
        this.notifyToolsChanged();
      }, action === 'add' ? 3000 : 100);
    };

    // Build tool index after servers are initialized, then notify IDE so it gets the dynamic hints
    setTimeout(async () => {
      await this._ensureIndex(true);
      this.notifyToolsChanged();
    }, 3000);

    if (this.ws) {
      this.ws.on('message', (data) => {
        try {
          let msg = JSON.parse(data.toString());
          this.handleIdeMessage(msg);
        } catch (err) {
          console.error('[multiplexer] Failed to parse WS msg:', err);
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
          console.error('[multiplexer] Failed to parse IDE msg:', err);
        }
      });
    }
  }

  async _rebuildIndex() {
    await this.toolIndex.rebuild(this.proxyManager);
    // Load tags from config if available
    try {
      let { getStateGraph } = await import('../state-graph.js');
      let sg = getStateGraph();
      let toolTags = sg.get('settings/toolTags');
      if (toolTags) {
        this.toolIndex.setTags(toolTags);
      }
    } catch {}
  }

  async _ensureIndex(force = false) {
    if (!force && this.toolIndex.isReady) return;
    if (!this._indexPromise) {
      this._indexPromise = this._rebuildIndex().finally(() => {
        this._indexPromise = null;
      });
    }
    await this._indexPromise;
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
        import('../state-graph.js').then(({ getStateGraph }) => {
          let sg = getStateGraph();
          for (let root of roots) {
            let rootPath = root.uri?.replace(/^file:\/\//, '') || root.uri;
            if (!rootPath) continue;
            let proj = sg.addProject({ path: rootPath }, 'ide');
            sg.setProjectOpen(proj.id, true, 'ide');
            this.proxyManager.broadcastMonitor({
              jsonrpc: '2.0',
              method: 'patch',
              params: { path: 'projects.opened', value: proj.id },
            });
          }
        }).catch(err => {
          console.error('[multiplexer] Failed to register project from roots:', err.message);
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
   * @returns {Array<object>}
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
      ...META_TOOLS.slice(1),
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
        await this._ensureIndex();
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
        await this._ensureIndex();
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
        let { getStateGraph } = await import('../state-graph.js');
        let sg = getStateGraph();
        
        // Auto-inherit projectId from parent chat
        let projectId = args.projectId || null;
        if (!projectId && args.parentChatId) {
          let parentMeta = sg.get(`chats/${args.parentChatId}`);
          if (parentMeta) projectId = parentMeta.projectId || null;
        }
        
        let chat = sg.createChat({
          name: args.name,
          adapter: args.adapter || 'pool',
          agent: args.agent || args.agent_slug || ((args.adapter || 'pool') === 'pool' ? DEFAULT_CHAT_AGENT : null),
          provider: args.provider || null,
          model: args.model || null,
          approval_mode: args.approval_mode || null,
          chatType: args.chatType || null,
          parentChatId: args.parentChatId || null,
          projectId,
          agentIcon: args.agentIcon || null,
          agentColor: args.agentColor || null,
        }, 'mcp');
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
        let { getStateGraph } = await import('../state-graph.js');
        let sg = getStateGraph();
        sg.appendChatMessage(args.chatId, {
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

      if (toolName === 'resume_chat') {
        let result = await resumeChatTool(this.proxyManager, args);
        this.sendToIde({
          jsonrpc: '2.0',
          id: msg.id,
          result,
        });
        return;
      }

      if (toolName === 'remember') {
        let { remember } = await import('../memory-store.js');
        let res = remember(args.key, args.value);
        this.sendToIde({
          jsonrpc: '2.0',
          id: msg.id,
          result: { content: [{ type: 'text', text: res }] }
        });
        return;
      }

      if (toolName === 'recall') {
        let { recall } = await import('../memory-store.js');
        let res = recall(args.query);
        this.sendToIde({
          jsonrpc: '2.0',
          id: msg.id,
          result: { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] }
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
          await this._ensureIndex();
          entry = this.toolIndex.get(realToolName);
        }
        if (!entry) {
          // Try rebuild and check again
          await this._ensureIndex(true);
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

        if (['delegate_task', 'delegate_task_readonly'].includes(realToolName) && realArgs.parent_chat_id && !realArgs.chat_id) {
          try {
            let { getStateGraph } = await import('../state-graph.js');
            let sg = getStateGraph();
            let parentMeta = sg.get(`chats/${realArgs.parent_chat_id}`);
            let chat = sg.createChat({
              name: (realArgs.prompt || '').substring(0, 40) + ((realArgs.prompt || '').length > 40 ? '...' : ''),
              adapter: 'pool',
              agent: realArgs.agent_slug || null,
              provider: realArgs.provider || null,
              model: realArgs.model || null,
              approval_mode: realArgs.approval_mode || null,
              parentChatId: realArgs.parent_chat_id,
              projectId: parentMeta ? parentMeta.projectId : null
            }, 'mcp');
            realArgs.chat_id = chat.id;
            this.proxyManager.broadcastMonitor({ jsonrpc: '2.0', method: 'patch', params: { path: 'chats.created', value: chat } });
          } catch (e) {
            console.error('[MCP Multiplexer] failed to auto-create chat for delegate_task:', e.message);
          }
        }

        // Proxy the call to the child server
        let internalId = this.nextInternalId++;
        this.requestMap.set(internalId, { 
          serverName: entry.server, 
          originalId: msg.id,
          toolName: realToolName,
          toolArgs: realArgs 
        });
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
      } catch {}
    }

    this.sendToIde({
      jsonrpc: '2.0',
      id: ideRequestId,
      result: { [key]: allItems },
    });
  }

  handleChildMessage(serverName, msg) {
    if (msg.id !== undefined && this.requestMap.has(msg.id)) {
      let req = this.requestMap.get(msg.id);
      this.requestMap.delete(msg.id);
      
      if (req.toolName === 'delegate_task' && msg.result && msg.result.content) {
        let delegateText = msg.result.content[0]?.text || '';
        let taskIdMatch = delegateText.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
        let taskId = taskIdMatch?.[1];
        let chatId = req.toolArgs.parent_chat_id || req.toolArgs.chat_id;
        if (taskId && chatId && this.proxyManager.chatWsServer) {
          // Find the main task ID for this chat to broadcast to
          let mainTaskId = null;
          for (let [t, c] of this.proxyManager.chatWsServer.taskChatMap.entries()) {
            if (c === chatId) {
              mainTaskId = t;
              break;
            }
          }
          if (mainTaskId) {
            this.proxyManager.chatWsServer.broadcastTaskEvent(mainTaskId, 'chat.delegated', { 
              taskId, text: delegateText, chatId 
            });
          }
        }
      }

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
