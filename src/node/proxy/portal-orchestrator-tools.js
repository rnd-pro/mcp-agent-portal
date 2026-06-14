import { isPublicMcpToolServer } from './mcp-tool-visibility.js';
import {
  buildDevelopmentMap,
  parseTaskStateResult,
} from './orchestration-development-map.js';

export const ORCHESTRATOR_META_TOOLS = [
  {
    name: 'list_chats',
    description: 'List Agent Portal chat metadata for orchestrator control.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Optional project filter.' },
        parentChatId: { type: 'string', description: 'Optional parent chat filter.' },
        origin: { type: 'string', description: 'Optional origin filter: portal, mcp, or agent.' },
        active_only: { type: 'boolean', description: 'Only return chats with a pending task.' },
        limit: { type: 'number', description: 'Maximum number of chats to return.' },
      },
    },
  },
  {
    name: 'get_chat',
    description: 'Get one Agent Portal chat, optionally without full message history.',
    inputSchema: {
      type: 'object',
      properties: {
        chatId: { type: 'string', description: 'Chat ID.' },
        id: { type: 'string', description: 'Alias for chatId.' },
        includeMessages: { type: 'boolean', description: 'Include full chat messages. Defaults to true.' },
      },
    },
  },
  {
    name: 'get_chat_messages',
    description: 'Get a bounded page of messages for an Agent Portal chat.',
    inputSchema: {
      type: 'object',
      properties: {
        chatId: { type: 'string', description: 'Chat ID.' },
        id: { type: 'string', description: 'Alias for chatId.' },
        offset: { type: 'number', description: 'Start offset.' },
        before: { type: 'number', description: 'Return messages before this index.' },
        limit: { type: 'number', description: 'Maximum messages to return.' },
      },
    },
  },
  {
    name: 'update_chat',
    description: 'Update Agent Portal chat routing metadata used by the orchestrator.',
    inputSchema: {
      type: 'object',
      properties: {
        chatId: { type: 'string', description: 'Chat ID.' },
        id: { type: 'string', description: 'Alias for chatId.' },
        name: { type: 'string', description: 'Chat name.' },
        adapter: { type: 'string', description: 'Chat adapter.' },
        agent: { type: 'string', description: 'Agent role slug.' },
        agent_slug: { type: 'string', description: 'Alias for agent.' },
        provider: { type: 'string', description: 'Provider override.' },
        model: { type: 'string', description: 'Model override.' },
        approval_mode: { type: 'string', enum: ['yolo', 'auto_edit', 'plan'], description: 'Approval mode.' },
        resource_group: { type: 'string', description: 'Resource group.' },
        projectId: { type: 'string', description: 'Project ID.' },
        parentChatId: { type: 'string', description: 'Parent chat ID.' },
        chatType: { type: 'string', description: 'Chat type.' },
        activeGoalId: { type: 'string', description: 'Active goal ID.' },
        goalIntentActive: { type: 'boolean', description: 'Whether goal intent mode is active.' },
        goalQueueMode: { type: 'string', description: 'Goal queue mode.' },
        pendingTaskId: { type: 'string', description: 'Pending task ID to attach to the chat. Pass an empty string to clear.' },
        pending_task_id: { type: 'string', description: 'Alias for pendingTaskId.' },
      },
    },
  },
  {
    name: 'delete_chat',
    description: 'Delete an Agent Portal chat. Optionally cancel its pending task first.',
    inputSchema: {
      type: 'object',
      properties: {
        chatId: { type: 'string', description: 'Chat ID.' },
        id: { type: 'string', description: 'Alias for chatId.' },
        cancel_task: { type: 'boolean', description: 'Cancel the pending task before deleting. Defaults to false.' },
      },
    },
  },
  {
    name: 'set_chat_session',
    description: 'Set the provider session ID associated with an Agent Portal chat.',
    inputSchema: {
      type: 'object',
      properties: {
        chatId: { type: 'string', description: 'Chat ID.' },
        id: { type: 'string', description: 'Alias for chatId.' },
        sessionId: { type: 'string', description: 'Provider session ID.' },
        session_id: { type: 'string', description: 'Alias for sessionId.' },
      },
    },
  },
  {
    name: 'get_chat_task_result',
    description: 'Get the result for a chat task through Agent Portal orchestration control. Returns a safe runtime summary plus a development map with subagentMap nodes/tree/edges, taskMap, toolMap, task timings, latest tool usage with durationMs/usageMs/timingSource, usage totals, legacy promptHints, and structured promptHintMap suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        chatId: { type: 'string', description: 'Chat ID.' },
        id: { type: 'string', description: 'Alias for chatId.' },
        taskId: { type: 'string', description: 'Task ID. Defaults to the chat pending task.' },
        task_id: { type: 'string', description: 'Alias for taskId.' },
      },
    },
  },
  {
    name: 'cancel_chat_task',
    description: 'Cancel the active task for a chat through Agent Portal orchestration control.',
    inputSchema: {
      type: 'object',
      properties: {
        chatId: { type: 'string', description: 'Chat ID.' },
        id: { type: 'string', description: 'Alias for chatId.' },
        taskId: { type: 'string', description: 'Task ID. Defaults to the chat pending task.' },
        task_id: { type: 'string', description: 'Alias for taskId.' },
      },
    },
  },
  {
    name: 'finish_chat_task',
    description: 'Finish and clean up the active task for a chat through Agent Portal orchestration control.',
    inputSchema: {
      type: 'object',
      properties: {
        chatId: { type: 'string', description: 'Chat ID.' },
        id: { type: 'string', description: 'Alias for chatId.' },
        taskId: { type: 'string', description: 'Task ID. Defaults to the chat pending task.' },
        task_id: { type: 'string', description: 'Alias for taskId.' },
        kill_process: { type: 'boolean', description: 'Kill tracked child processes. Defaults to true.' },
        recursive: { type: 'boolean', description: 'Finish child tasks too. Defaults to true.' },
        remove_from_memory: { type: 'boolean', description: 'Remove task results from runtime memory. Defaults to false.' },
      },
    },
  },
  {
    name: 'get_orchestrator_status',
    description: 'Get Agent Portal orchestrator state, public MCP surface, internal runtime health, active chat counts, and the current development map with subagentMap, taskMap, toolMap timing telemetry, and structured promptHintMap suggestions.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

const ORCHESTRATOR_TOOL_NAMES = new Set(
  ORCHESTRATOR_META_TOOLS.map(tool => tool.name),
);

export function isPortalOrchestratorTool(toolName = '') {
  return ORCHESTRATOR_TOOL_NAMES.has(String(toolName || ''));
}

function textResult(value) {
  let payload = typeof value === 'string' ? { ok: false, error: value } : value;
  let text = JSON.stringify(payload, null, 2);
  return { content: [{ type: 'text', text }] };
}

function errorResult(text) {
  return { ...textResult(text), isError: true };
}

function getChatId(args = {}) {
  return args.chatId || args.chat_id || args.id || null;
}

function getTaskId(args = {}, chat = null) {
  return args.taskId || args.task_id || chat?.pendingTaskId || null;
}

function broadcastChat(proxyManager, chatId) {
  if (!chatId) return;
  proxyManager?.broadcastMonitor?.({
    jsonrpc: '2.0',
    method: 'patch',
    params: { path: 'chats.updated', value: chatId },
  });
}

async function getStateGraph(options = {}) {
  if (options.stateGraph) return options.stateGraph;
  let mod = await import('../state-graph.js');
  return mod.getStateGraph();
}

function filterChatList(chats, args = {}) {
  let activeOnly = Boolean(args.active_only || args.activeOnly);
  let limit = Number(args.limit);
  let result = chats
    .filter(chat => !args.projectId || chat.projectId === args.projectId)
    .filter(chat => !args.parentChatId || chat.parentChatId === args.parentChatId)
    .filter(chat => !args.origin || chat.origin === args.origin)
    .filter(chat => !activeOnly || chat.pendingTaskId);

  if (Number.isFinite(limit) && limit > 0) {
    result = result.slice(0, Math.floor(limit));
  }
  return result;
}

function summarizeHealth(proxyManager) {
  let health = proxyManager?.getHealthStatus?.() || {};
  let publicServers = [];
  let internalServers = [];
  for (let [name, status] of Object.entries(health)) {
    let item = { name, ...status };
    if (isPublicMcpToolServer(name)) publicServers.push(item);
    else internalServers.push(item);
  }
  return { publicServers, internalServers };
}

async function callInternalTaskTool(proxyManager, name, args) {
  if (!proxyManager?.requestFromChild) {
    throw new Error('Agent Portal internal runtime is unavailable.');
  }
  return proxyManager.requestFromChild('agent-pool', 'tools/call', {
    name,
    arguments: args,
  }, 600_000);
}

async function readInternalTaskState(proxyManager) {
  try {
    let result = await callInternalTaskTool(proxyManager, 'list_tasks', {});
    return parseTaskStateResult(result);
  } catch (error) {
    return { tasks: [], staleProcesses: [], error: error.message };
  }
}

async function stopTask(proxyManager, sg, chatId, taskId, action, args = {}) {
  let toolName = action === 'finish' ? 'finish_task' : 'cancel_task';
  let toolArgs = action === 'finish'
    ? {
        task_id: taskId,
        kill_process: args.kill_process !== false,
        recursive: args.recursive !== false,
        remove_from_memory: Boolean(args.remove_from_memory),
      }
    : { task_id: taskId };

  let result = await callInternalTaskTool(proxyManager, toolName, toolArgs);
  if (!result?.isError && chatId) {
    sg.updateChatTask(chatId, null, { expectedTaskId: taskId });
    proxyManager?.chatWsServer?.taskChatMap?.delete?.(taskId);
    proxyManager?.chatWsServer?.unsubscribe?.(taskId);
    broadcastChat(proxyManager, chatId);
  }
  return result;
}

export async function handlePortalOrchestratorTool(
  proxyManager,
  toolName,
  args = {},
  source = 'mcp',
  options = {},
) {
  if (!isPortalOrchestratorTool(toolName)) {
    return errorResult(`Unknown Agent Portal orchestrator tool: ${toolName}`);
  }

  let sg = await getStateGraph(options);

  if (toolName === 'list_chats') {
    return textResult({
      chats: filterChatList(sg.listChats(), args),
    });
  }

  if (toolName === 'get_chat') {
    let chatId = getChatId(args);
    if (!chatId) return errorResult('Missing chatId.');
    let chat = sg.getChat(chatId);
    if (!chat) return errorResult(`Chat not found: ${chatId}`);
    if (chat.activeGoalId) chat.activeGoal = sg.getChatGoal(chat.activeGoalId);
    if (args.includeMessages === false) {
      let { messages = [], ...meta } = chat;
      return textResult({ ...meta, messageCount: messages.length });
    }
    return textResult(chat);
  }

  if (toolName === 'get_chat_messages') {
    let chatId = getChatId(args);
    if (!chatId) return errorResult('Missing chatId.');
    let page = sg.getChatMessagePage(chatId, {
      offset: args.offset,
      before: args.before,
      limit: args.limit,
    });
    if (!page) return errorResult(`Chat not found: ${chatId}`);
    return textResult(page);
  }

  if (toolName === 'update_chat') {
    let chatId = getChatId(args);
    if (!chatId) return errorResult('Missing chatId.');
    let { chatId: _chatId, chat_id: _chat_id, id: _id, agent_slug, pendingTaskId, pending_task_id, ...updates } = args;
    if (agent_slug && !updates.agent) updates.agent = agent_slug;
    if (Object.keys(updates).length) sg.updateChat(chatId, updates, source);
    if (pendingTaskId !== undefined || pending_task_id !== undefined) {
      let taskId = pendingTaskId ?? pending_task_id;
      sg.updateChatTask(chatId, taskId ? String(taskId) : null);
    }
    broadcastChat(proxyManager, chatId);
    return textResult({ ok: true, chat: sg.getChat(chatId) });
  }

  if (toolName === 'delete_chat') {
    let chatId = getChatId(args);
    if (!chatId) return errorResult('Missing chatId.');
    let chat = sg.getChat(chatId);
    if (!chat) return errorResult(`Chat not found: ${chatId}`);
    let taskId = chat.pendingTaskId;
    if (args.cancel_task && taskId) {
      let cancelResult = await stopTask(proxyManager, sg, chatId, taskId, 'cancel', args);
      if (cancelResult?.isError) return cancelResult;
    }
    sg.deleteChat(chatId, source);
    broadcastChat(proxyManager, chatId);
    return textResult({ ok: true, chatId });
  }

  if (toolName === 'set_chat_session') {
    let chatId = getChatId(args);
    let sessionId = args.sessionId || args.session_id;
    if (!chatId || !sessionId) return errorResult('Missing chatId or sessionId.');
    sg.updateChatSession(chatId, sessionId);
    broadcastChat(proxyManager, chatId);
    return textResult({ ok: true, chatId, sessionId });
  }

  if (toolName === 'get_chat_task_result') {
    let chatId = getChatId(args);
    let chat = chatId ? sg.getChat(chatId) : null;
    let taskId = getTaskId(args, chat);
    if (!taskId) return errorResult('Missing taskId and no pending task is attached to the chat.');
    let taskResult = await callInternalTaskTool(proxyManager, 'get_task_result', { task_id: taskId });
    let taskState = await readInternalTaskState(proxyManager);
    let developmentMap = buildDevelopmentMap({
      sg,
      chatId,
      taskId,
      taskResult,
      taskState,
    });
    return textResult({
      ok: !taskResult?.isError,
      chatId,
      taskId,
      runtime: developmentMap.runtime,
      developmentMap,
    });
  }

  if (toolName === 'cancel_chat_task' || toolName === 'finish_chat_task') {
    let chatId = getChatId(args);
    let chat = chatId ? sg.getChat(chatId) : null;
    let taskId = getTaskId(args, chat);
    if (!taskId) return errorResult('Missing taskId and no pending task is attached to the chat.');
    let result = await stopTask(
      proxyManager,
      sg,
      chatId,
      taskId,
      toolName === 'finish_chat_task' ? 'finish' : 'cancel',
      args,
    );
    return result;
  }

  if (toolName === 'get_orchestrator_status') {
    let chats = sg.listChats();
    let goals = sg.listChatGoals();
    let tasks = Object.entries(sg.get('tasks') || {}).map(([id, task]) => ({ id, ...task }));
    let { publicServers, internalServers } = summarizeHealth(proxyManager);
    let taskState = await readInternalTaskState(proxyManager);
    return textResult({
      mode: process.env.PORTAL_MODE || 'standalone',
      publicServers,
      internalServers,
      chats: {
        total: chats.length,
        active: chats.filter(chat => chat.pendingTaskId).length,
      },
      goals: {
        total: goals.length,
        active: goals.filter(goal => goal.status === 'active').length,
        blocked: goals.filter(goal => goal.status === 'blocked').length,
      },
      tasks: {
        total: tasks.length,
        active: tasks.filter(task => !['done', 'error', 'cancelled', 'lost'].includes(task.status)).length,
      },
      developmentMap: buildDevelopmentMap({ sg, taskState }),
      staleProcesses: taskState.staleProcesses || [],
    });
  }

  return errorResult(`Unknown Agent Portal orchestrator tool: ${toolName}`);
}
