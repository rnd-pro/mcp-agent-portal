// @ctx mcp-multiplexer.ctx
import { createInterface } from 'node:readline';
import { ToolIndex } from './tool-index.js';
import {
  GOAL_META_TOOLS,
  handlePortalGoalTool,
  isPortalGoalTool,
} from './portal-goal-tools.js';
import {
  ORCHESTRATOR_META_TOOLS,
  handlePortalOrchestratorTool,
  isPortalOrchestratorTool,
} from './portal-orchestrator-tools.js';
import {
  isDelegateTool,
  prepareDelegateTaskCall,
  resolveChatCreationAgent,
} from './chat-delegate-routing.js';
import {
  internalMcpToolBlockedResult,
  isInternalMcpToolName,
  isPublicMcpToolServer,
  splitMcpHealthStatus,
} from './mcp-tool-visibility.js';
import {
  buildDevelopmentMap,
  parseTaskStateResult,
} from './orchestration-development-map.js';

/**
 * Smart Tool Gateway — exposes portal-level meta-tools instead of proxying all child tools.
 * 
 * Meta-tools:
 *   discover_tools  — search public child tools by keyword, tag, or server
 *   call_tool        — proxy a call to a public child tool by name
 *   get_portal_status — health, server list, tool counts
 */

export let META_TOOLS = [
  {
    name: 'discover_tools',
    description: 'Search available public MCP tools across connected servers. Agent Pool tools are internal to Agent Portal and are not exposed here. Use Agent Portal chat tools for orchestration. Returns tool names, descriptions, and which public server provides them. Call with no arguments to see all available public tools, or filter by query/tag/server.\n\n💡 HINT: Public tools may include code analysis helpers such as get_skeleton and get_ai_context.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword search across tool names and descriptions. Example: "skeleton", "code analysis", "delegate"' },
        tag: { type: 'string', description: 'Filter by tag (pre-configured categories). Use get_portal_status to see available tags.' },
        server: { type: 'string', description: 'Filter by public server name. Example: "project-graph".' },
      },
    },
  },
  {
    name: 'call_tool',
    description: 'Call a public tool from a connected MCP server by name. First use discover_tools to find the tool name, then call it here with its arguments. Agent Pool tools are internal to Agent Portal and are not callable through this meta-tool.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tool name (as returned by discover_tools). Example: "get_skeleton".' },
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
    description: 'Create a new Agent Chat session in the portal UI. The UI will instantly display the new chat. Returns structured chat metadata, chatId, and a development map with subagentMap/taskMap/toolMap telemetry, legacy promptHints, and structured promptHintMap suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name or title for the new chat.' },
        adapter: { type: 'string', description: 'Agent adapter to use (e.g. "pool", "antigravity"). Optional.' },
        agent: { type: 'string', description: 'Agent role slug. Root Agent Pool chats use orchestrator; specialist slugs apply only to child chats with parentChatId.' },
        agent_slug: { type: 'string', description: 'Alias for agent. Root Agent Pool chats use orchestrator; specialist slugs apply only to child chats with parentChatId.' },
        provider: { type: 'string', description: 'CLI provider for pool chats (e.g. "codex", "antigravity", "opencode", "claude"). Optional.' },
        model: { type: 'string', description: 'Model to preselect for this chat. Optional.' },
        approval_mode: { type: 'string', enum: ['yolo', 'auto_edit', 'plan'], description: 'Access mode: yolo, auto_edit, or plan. Optional.' },
        resource_group: { type: 'string', description: 'Resource group for pool orchestration. Optional.' },
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
    description: 'Send a message to an existing Agent Chat session in the portal UI. The message will appear instantly in the UI. Returns structured chat metadata and the current development map with subagentMap/taskMap/toolMap telemetry.',
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
    description: 'Continue an existing Agent Chat by sending a new user prompt and starting a delegated agent task bound to the same chat. Reuses saved provider, model, approval mode, agent role, and provider session ID when available. Returns bounded delegateSummary, task routing metadata, runtime content, and a development map with subagentMap nodes/tree/edges, taskMap, toolMap, latest tool usage, usage totals, legacy promptHints, and structured promptHintMap suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        chatId: { type: 'string', description: 'Existing Agent Chat ID to continue.' },
        prompt: { type: 'string', description: 'New user prompt to send into the chat.' },
        provider: { type: 'string', description: 'Override CLI provider for this turn. Defaults to saved chat provider.' },
        model: { type: 'string', description: 'Override model for this turn. Defaults to saved chat model.' },
        resource_group: { type: 'string', description: 'Override resource group for this turn. Defaults to saved chat resource group.' },
        session_id: { type: 'string', description: 'Override provider session/thread ID. Defaults to saved chat sessionId.' },
        approval_mode: { type: 'string', enum: ['yolo', 'auto_edit', 'plan'], description: 'Override access mode. Defaults to saved chat approval mode.' },
        agent: { type: 'string', description: 'Override agent role slug for child/subagent chats. Root chats route through orchestrator.' },
        agent_slug: { type: 'string', description: 'Override agent role slug for child/subagent chats. Root chats route through orchestrator.' },
        cwd: { type: 'string', description: 'Override working directory. Defaults to the chat project path or portal project root.' },
        context_mode: { type: 'string', enum: ['auto', 'off'], description: 'Context package mode passed to delegate_task. Default: auto.' },
        files: { type: 'array', items: { type: 'string' }, description: 'Known relevant file paths passed to delegate_task as structured context hints.' },
        goalMessageIds: { type: 'array', items: { type: 'string' }, description: 'Queued goal message IDs to mark applied and inject into this run.' },
        goal_message_ids: { type: 'array', items: { type: 'string' }, description: 'Alias for goalMessageIds.' },
        timeout: { type: 'number', description: 'Timeout in seconds. Default: 600.' },
      },
      required: ['chatId', 'prompt'],
    },
  },
  ...ORCHESTRATOR_META_TOOLS,
  ...GOAL_META_TOOLS,
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

export function extractTaskIdFromDelegateResult(result) {
  let text = result?.content?.map(c => c.text || '').join('\n') || '';
  return text.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/)?.[1] || null;
}

function jsonTextResult(value, extra = {}) {
  return {
    ...extra,
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  };
}

function normalizeIdList(value) {
  if (!value) return [];
  let list = Array.isArray(value) ? value : [value];
  return [...new Set(list.map(id => String(id || '').trim()).filter(Boolean))];
}

function compactText(text = '', limit = 180) {
  let value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

export function summarizeDelegateArgs(args = {}) {
  let files = Array.isArray(args.files)
    ? args.files.map(file => String(file || '').trim()).filter(Boolean)
    : [];
  return {
    timeout: args.timeout || null,
    chatId: args.chat_id || args.chatId || null,
    agentSlug: args.agent_slug || null,
    resourceGroup: args.resource_group || null,
    approvalMode: args.approval_mode || null,
    provider: args.provider || null,
    model: args.model || null,
    contextMode: args.context_mode || null,
    hasSession: Boolean(args.session_id || args.sessionId),
    hasCwd: Boolean(args.cwd),
    fileCount: files.length,
    filesPreview: files.slice(0, 5),
    promptPreview: compactText(args.prompt),
    goalQueueMessageCount: Array.isArray(args.goalQueueMessages)
      ? args.goalQueueMessages.length
      : 0,
    limits: {
      filesPreview: 5,
      promptPreview: 180,
    },
  };
}

function broadcastGoalUpdate(proxyManager, goal) {
  if (!goal?.id) return;
  proxyManager.broadcastMonitor?.({
    jsonrpc: '2.0',
    method: 'patch',
    params: { path: 'goals.updated', value: goal },
  });
  if (goal.chatId) {
    proxyManager.broadcastMonitor?.({
      jsonrpc: '2.0',
      method: 'patch',
      params: { path: 'chats.updated', value: goal.chatId },
    });
  }
}

async function readInternalTaskState(proxyManager) {
  if (!proxyManager?.requestFromChild) return { tasks: [], staleProcesses: [] };
  try {
    let result = await proxyManager.requestFromChild('agent-pool', 'tools/call', {
      name: 'list_tasks',
      arguments: {},
    }, 600_000);
    return parseTaskStateResult(result);
  } catch (error) {
    return { tasks: [], staleProcesses: [], error: error.message };
  }
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
    return jsonTextResult({ ok: false, error: 'Missing required chatId or prompt.' }, { isError: true });
  }

  let { getStateGraph } = await import('../state-graph.js');
  let sg = getStateGraph();
  let chat = sg.getChat(chatId);
  if (!chat) {
    return jsonTextResult({ ok: false, chatId, error: `Chat not found: ${chatId}` }, { isError: true });
  }

  let cwd = args.cwd;
  if (!cwd && chat.projectId) {
    let project = sg.get(`projects/${chat.projectId}`);
    if (project?.path) cwd = project.path;
  }
  if (!cwd) cwd = proxyManager.projectRoot !== '/' ? proxyManager.projectRoot : process.env.HOME;

  let goalQueueMessages = [];
  let goalMessageIds = normalizeIdList(args.goalMessageIds || args.goal_message_ids);
  let activeGoalId = chat.activeGoalId || sg.get(`chats/${chatId}`)?.activeGoalId || null;
  if (activeGoalId && goalMessageIds.length) {
    let updatedGoal = null;
    for (let messageId of goalMessageIds) {
      let result = sg.updateChatGoalQueueMessage(activeGoalId, messageId, { status: 'applied' }, 'mcp');
      if (!result) continue;
      goalQueueMessages.push(result.item);
      updatedGoal = result.goal;
    }
    if (updatedGoal) broadcastGoalUpdate(proxyManager, updatedGoal);
  }

  sg.appendChatMessage(chatId, { role: 'user', text: prompt });
  proxyManager.broadcastMonitor?.({ jsonrpc: '2.0', method: 'patch', params: { path: 'chats.updated', value: chatId } });

  let delegateArgs = {
    prompt,
    timeout: args.timeout || 600,
    cwd,
    chat_id: chatId,
  };
  if (args.provider) delegateArgs.provider = args.provider;
  if (args.model) delegateArgs.model = args.model;
  if (args.resource_group) delegateArgs.resource_group = args.resource_group;
  if (args.session_id || args.sessionId) delegateArgs.session_id = args.session_id || args.sessionId;
  if (args.approval_mode) delegateArgs.approval_mode = args.approval_mode;
  if (args.agent || args.agent_slug) delegateArgs.agent_slug = args.agent || args.agent_slug;
  if (args.context_mode === 'auto' || args.context_mode === 'off') delegateArgs.context_mode = args.context_mode;
  if (goalQueueMessages.length) delegateArgs.goalQueueMessages = goalQueueMessages;
  if (Array.isArray(args.files)) {
    let files = [...new Set(args.files.map(file => String(file || '').trim()).filter(Boolean))];
    if (files.length) delegateArgs.files = files;
  }

  let prepared = await prepareDelegateTaskCall(proxyManager, 'delegate_task', delegateArgs, { source: 'mcp' });
  delegateArgs = prepared.args;

  let result = await proxyManager.requestFromChild('agent-pool', 'tools/call', {
    name: 'delegate_task',
    arguments: delegateArgs,
  }, 600_000);
  if (result?.isError) {
    let taskState = await readInternalTaskState(proxyManager);
    return jsonTextResult({
      ok: false,
      chatId,
      taskId: null,
      error: result?.content?.[0]?.text || 'Delegation failed.',
      delegateSummary: summarizeDelegateArgs(delegateArgs),
      routing: {
        chatId: prepared.chatId || chatId,
        parentChatId: prepared.parentChatId || null,
        createdChat: prepared.createdChat || null,
      },
      developmentMap: buildDevelopmentMap({ sg, chatId, taskResult: result, taskState }),
    }, { isError: true });
  }

  let taskId = extractTaskIdFromDelegateResult(result);
  if (taskId) {
    sg.updateChatTask(chatId, taskId);
    if (proxyManager.chatWsServer) {
      proxyManager.chatWsServer.taskChatMap.set(taskId, chatId);
    }
  }

  let taskState = await readInternalTaskState(proxyManager);
  return jsonTextResult({
    ok: Boolean(taskId),
    chatId,
    taskId,
    provider: delegateArgs.provider || null,
    model: delegateArgs.model || null,
    resource_group: delegateArgs.resource_group || null,
    approval_mode: delegateArgs.approval_mode || null,
    has_session: Boolean(delegateArgs.session_id),
    delegateSummary: summarizeDelegateArgs(delegateArgs),
    routing: {
      chatId: prepared.chatId || chatId,
      parentChatId: prepared.parentChatId || null,
      createdChat: prepared.createdChat || null,
    },
    developmentMap: buildDevelopmentMap({
      sg,
      chatId,
      taskId,
      taskResult: result,
      taskState,
    }),
  }, taskId ? {} : { isError: true });
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
        let health = this.proxyManager.getHealthStatus();
        let { publicHealth, internalHealth } = splitMcpHealthStatus(health);
        let sg = this.proxyManager.stateGraph;
        if (!sg) {
          let { getStateGraph } = await import('../state-graph.js');
          sg = getStateGraph();
        }
        let taskState = await readInternalTaskState(this.proxyManager);
        let status = {
          servers: this.toolIndex.getServers(),
          health: publicHealth,
          internalHealth,
          totalTools: this.toolIndex.getPublicToolCount(),
          tags: this.toolIndex.getAvailableTags(),
          mode: process.env.PORTAL_MODE || 'standalone',
          developmentMap: buildDevelopmentMap({ sg, taskState }),
          staleProcesses: taskState.staleProcesses || [],
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
        
        let resourceGroup = args.resource_group || null;
        let chat = sg.createChat({
          name: args.name,
          adapter: args.adapter || 'pool',
          agent: resolveChatCreationAgent(args),
          provider: resourceGroup && resourceGroup !== 'none' ? null : (args.provider || null),
          model: resourceGroup && resourceGroup !== 'none' ? null : (args.model || null),
          approval_mode: args.approval_mode || null,
          resource_group: resourceGroup,
          chatType: args.chatType || null,
          parentChatId: args.parentChatId || null,
          projectId,
          agentIcon: args.agentIcon || null,
          agentColor: args.agentColor || null,
        }, 'mcp');
        // Broadcast event so UI reactive tabs open automatically
        this.proxyManager.broadcastMonitor({ jsonrpc: '2.0', method: 'patch', params: { path: 'chats.created', value: chat } });
        let fullChat = sg.getChat(chat.id) || { id: chat.id };
        this.sendToIde({
          jsonrpc: '2.0',
          id: msg.id,
          result: jsonTextResult({
            ok: true,
            chatId: chat.id,
            chat: fullChat,
            developmentMap: buildDevelopmentMap({ sg, chatId: chat.id }),
          }),
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
        let chat = sg.getChat(args.chatId) || { id: args.chatId };
        // Broadcast event for UI reactive updates
        this.proxyManager.broadcastMonitor({ jsonrpc: '2.0', method: 'patch', params: { path: 'chats.updated', value: args.chatId } });
        this.sendToIde({
          jsonrpc: '2.0',
          id: msg.id,
          result: jsonTextResult({
            ok: true,
            chatId: args.chatId,
            messageCount: Array.isArray(chat.messages) ? chat.messages.length : chat.messageCount || null,
            chat,
            developmentMap: buildDevelopmentMap({ sg, chatId: args.chatId }),
          }),
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

      if (isPortalOrchestratorTool(toolName)) {
        let result = await handlePortalOrchestratorTool(this.proxyManager, toolName, args, 'mcp');
        this.sendToIde({
          jsonrpc: '2.0',
          id: msg.id,
          result,
        });
        return;
      }

      if (isPortalGoalTool(toolName)) {
        let result = await handlePortalGoalTool(this.proxyManager, toolName, args, 'mcp');
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

        if (isInternalMcpToolName(realToolName)) {
          this.sendToIde({
            jsonrpc: '2.0',
            id: msg.id,
            result: internalMcpToolBlockedResult(realToolName),
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
      
      if (isDelegateTool(req.toolName) && msg.result && msg.result.content) {
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
      if (!isPublicMcpToolServer(serverName)) return;
      this.sendToIde(msg);
      return;
    }
  }
}

export default MCPMultiplexer;
