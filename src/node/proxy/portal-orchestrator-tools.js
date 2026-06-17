import { isPublicMcpToolServer } from './mcp-tool-visibility.js';
import {
  buildDevelopmentMap,
  parseTaskStateResult,
} from './orchestration-development-map.js';
import { extractFinalAgentResponse } from './task-router.js';

const FINAL_AGENT_MESSAGE_TEXT_LIMIT = 4000;
const LOCAL_PATH_RE = /\/Users\/[^\s`'")\]}]+/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const SECRET_FIELD_RE = /\b(authorization|cookie|password|secret|session[_ -]?id|token|api[_ -]?key)\b\s*[:=]\s*([^\s,;)}\]]+)/gi;

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
    description: 'Get the result for a chat task through Agent Portal orchestration control. Returns a safe chat-scoped or task-inferred finalAgentMessage projection when available, a safe runtime summary, and a development map with activityMap, subagentMap nodes/tree/edges, taskMap, toolMap, task timings, liveness classification, latest tool usage with durationMs/usageMs/timingSource, usage totals, compatibility promptHints strings, and structured promptHintMap suggestions.',
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
    name: 'get_development_map',
    description: 'Get the Agent Portal development map for orchestrator control. Returns subagentMap nodes/tree/edges, activityMap, taskMap, toolMap, latest tool usage with durationMs/usageMs/timingSource, usage totals, liveness, compatibility promptHints strings, and structured promptHintMap suggestions. Agent Pool remains internal and is not exposed as public MCP tools.',
    inputSchema: {
      type: 'object',
      properties: {
        chatId: { type: 'string', description: 'Optional root chat ID to scope the map.' },
        id: { type: 'string', description: 'Alias for chatId.' },
        taskId: { type: 'string', description: 'Optional primary task ID to scope task descendants.' },
        task_id: { type: 'string', description: 'Alias for taskId.' },
        includeTaskResult: { type: 'boolean', description: 'Also read the primary task result for freshest runtime events. Defaults to false to avoid unnecessary polling.' },
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
    description: 'Get Agent Portal orchestrator state, public MCP surface, internal runtime health, active chat counts, and the current development map with activityMap, subagentMap, taskMap, toolMap timing telemetry, task liveness classification, and structured promptHintMap suggestions.',
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

function getTaskChatId(sg, taskId = null) {
  if (!taskId) return null;
  let task = sg?.get?.(`tasks/${taskId}`);
  return task?.chatId || null;
}

function sanitizeFinalAgentText(text = '') {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(LOCAL_PATH_RE, '[local-path]')
    .replace(BEARER_RE, 'Bearer [redacted]')
    .replace(SECRET_FIELD_RE, '$1: [redacted]')
    .trim();
}

function clipFinalAgentText(text = '') {
  let safe = sanitizeFinalAgentText(text);
  if (safe.length <= FINAL_AGENT_MESSAGE_TEXT_LIMIT) {
    return { text: safe, truncated: false };
  }
  return {
    text: safe.slice(0, FINAL_AGENT_MESSAGE_TEXT_LIMIT - 3).trimEnd() + '...',
    truncated: true,
  };
}

function findFinalAgentMessage(chat = null, taskId = null, options = {}) {
  let messages = Array.isArray(chat?.messages) ? chat.messages : [];
  let allowLatestFallback = options.allowLatestFallback !== false;
  let fallback = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    let message = messages[i];
    if (message?.role !== 'agent') continue;
    let text = String(message.text || '').trim();
    if (!text) continue;
    if (taskId && message.taskId === taskId) {
      return { message, index: i, match: 'taskId' };
    }
    if (allowLatestFallback && !fallback) fallback = { message, index: i, match: 'latest-agent' };
  }
  return fallback;
}

function isPlanModeSummary(text = '') {
  let normalized = String(text || '').trim().toLowerCase();
  if (!normalized) return false;
  return /\bplan\b/.test(normalized) && (
    /\babove\b/.test(normalized) ||
    /\bready\b/.test(normalized) ||
    /\bapproval\b/.test(normalized) ||
    /\bproceed\b/.test(normalized)
  );
}

function findExitPlanMessage(chat = null, taskId = null) {
  if (!taskId) return null;
  let messages = Array.isArray(chat?.messages) ? chat.messages : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    let message = messages[i];
    if (message?.role !== 'tool' || message?.name !== 'ExitPlanMode') continue;
    if (message.taskId !== taskId) continue;
    let text = String(message.input?.plan || '').trim();
    if (!text) continue;
    return { message: { ...message, text }, index: i, match: 'taskId-exit-plan' };
  }
  return null;
}

function isGenericFinalAgentText(text = '') {
  let normalized = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/g, '');
  return [
    'done',
    'completed',
    'complete',
    'finished',
    'ok',
    'all done',
  ].includes(normalized);
}

function isIntroOnlyFinalAgentText(text = '') {
  let normalized = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return [
    /^now i have all (?:the )?evidence\.? here is (?:the )?.+\.?$/,
    /^i now have (?:a )?(?:complete|full) picture\.? here is (?:my|the) .+\.?$/,
    /^here is (?:my|the) .+\.?$/,
  ].some((pattern) => pattern.test(normalized));
}

function isHeadingOnlyFinalAgentText(text = '') {
  let lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0 || lines.length > 3) return false;
  let heading = lines[0].toLowerCase();
  if (!/^#{1,3}\s+.*\b(?:final|closure|completion)\b.*\b(?:audit|report|review)\b/.test(heading)) {
    return false;
  }
  return lines.length === 1 || lines.slice(1).every((line) => {
    let normalized = line.toLowerCase();
    return normalized.startsWith('**scope:**') || normalized.startsWith('scope:');
  });
}

function finalAgentMessageQuality(text = '', parsedResult = null, options = {}) {
  if (!text) return { state: 'missing', reason: 'no-final-agent-text' };
  let toolCallCount = Array.isArray(parsedResult?.toolCalls) ? parsedResult.toolCalls.length : 0;
  let totalEvents = Number.isFinite(parsedResult?.totalEvents) ? parsedResult.totalEvents : 0;
  if (options.match === 'taskId-exit-plan') {
    return {
      state: 'weak-exit-plan',
      reason: 'exit-plan-mode-final',
      toolCallCount,
      totalEvents,
    };
  }
  if (isGenericFinalAgentText(text) && (toolCallCount > 0 || totalEvents > 0)) {
    return {
      state: 'weak-generic',
      reason: 'generic-final-with-runtime-activity',
      toolCallCount,
      totalEvents,
    };
  }
  if (isIntroOnlyFinalAgentText(text)) {
    return {
      state: 'weak-intro-only',
      reason: toolCallCount > 0 || totalEvents > 0
        ? 'intro-only-final-with-runtime-activity'
        : 'intro-only-final',
      toolCallCount,
      totalEvents,
    };
  }
  if (isHeadingOnlyFinalAgentText(text)) {
    return {
      state: 'weak-heading-only',
      reason: 'heading-only-final',
      toolCallCount,
      totalEvents,
    };
  }
  return { state: 'ok' };
}

function summarizeFinalAgentMessage(chat = null, taskId = null, options = {}) {
  let found = chat?.id ? findFinalAgentMessage(chat, taskId, options) : null;
  let exitPlan = chat?.id && taskId ? findExitPlanMessage(chat, taskId) : null;
  if (exitPlan && (!found || isPlanModeSummary(found.message?.text))) {
    found = exitPlan;
  }
  let clipped = clipFinalAgentText(found?.message?.text || '');
  let quality = finalAgentMessageQuality(clipped.text, options.parsedResult, {
    match: found?.match || null,
  });
  return {
    hasText: Boolean(clipped.text),
    text: clipped.text,
    chatId: chat?.id || null,
    taskId: found?.message?.taskId || taskId || null,
    messageIndex: Number.isInteger(found?.index) ? found.index : null,
    ts: found?.message?.ts || null,
    source: found ? 'chat' : null,
    match: found?.match || null,
    truncated: clipped.truncated,
    quality,
    limits: {
      text: FINAL_AGENT_MESSAGE_TEXT_LIMIT,
    },
  };
}

function taskResultText(taskResult = null) {
  return taskResult?.content?.find?.((item) => item?.type === 'text' && !item.text?.startsWith('__RESULT_JSON__:'))?.text
    ?? taskResult?.content?.[0]?.text
    ?? '';
}

function isRunningTaskResult(taskResult = null) {
  return /\[RUN\]\s*Task is still running/i.test(taskResultText(taskResult));
}

function parseTaskResultJson(taskResult = null) {
  let jsonText = taskResult?.content?.find?.((item) => item?.text?.startsWith('__RESULT_JSON__:'))?.text;
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText.substring('__RESULT_JSON__:'.length));
  } catch {
    return null;
  }
}

function isTerminalTaskResult(taskResult = null) {
  if (!taskResult || taskResult.isError) return false;
  let text = taskResultText(taskResult);
  if (!text.trim()) return false;
  if (/\[RUN\]\s*Task is still running/i.test(text)) return false;
  if (/Task [`'"]?[A-Za-z0-9-]+[`'"]? not found/i.test(text) || /Task not found/i.test(text)) return false;
  return /# Task Result|## Agent Response|## (?:\[ERR\]|⚠️)?\s*Agent Failed/i.test(text)
    || Boolean(parseTaskResultJson(taskResult));
}

function terminalStatusFromTaskResult(taskResult = null) {
  let text = taskResultText(taskResult);
  if (/## (?:\[ERR\]|⚠️)?\s*Agent Failed/i.test(text)) return 'error';
  let exitMatch = text.match(/- Exit code:\s*(\d+)/i);
  if (exitMatch && Number(exitMatch[1]) !== 0) return 'error';
  return 'done';
}

function reconcileCompletedChatTask(proxyManager, sg, chatId, taskId, taskResult) {
  if (!chatId || !taskId || !isTerminalTaskResult(taskResult)) return false;
  let chat = sg.getChat(chatId);
  if (!chat || chat.pendingTaskId !== taskId) return false;
  let text = taskResultText(taskResult);
  let existing = findFinalAgentMessage(chat, taskId);
  let body = extractFinalAgentResponse(text);
  if (existing?.match === 'taskId' && (!body || String(existing.message?.text || '').trim() === body.trim())) {
    return false;
  }
  let parsedResult = parseTaskResultJson(taskResult);
  let task = sg.get(`tasks/${taskId}`);
  let status = terminalStatusFromTaskResult(taskResult);
  proxyManager?.taskRouter?.persistFinalTaskResult?.(
    chatId,
    taskId,
    text,
    task?.startedAt,
    parsedResult,
  );
  sg.merge(`tasks/${taskId}`, {
    status,
    type: status,
    completedAt: Date.now(),
    updatedAt: Date.now(),
  }, 'task-result-reconcile');
  return true;
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

function summarizeStaleProcesses(staleProcesses = []) {
  let items = Array.isArray(staleProcesses) ? staleProcesses : [];
  return {
    count: items.length,
    taskIds: items.map((item) => item?.taskId).filter(Boolean).slice(0, 20),
  };
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
    return textResult({ ok: true, chatId, hasSession: true });
  }

  if (toolName === 'get_chat_task_result') {
    let chatId = getChatId(args);
    let chat = chatId ? sg.getChat(chatId) : null;
    let hasExplicitTaskId = Boolean(args.taskId || args.task_id);
    let taskId = getTaskId(args, chat);
    if (!taskId) return errorResult('Missing taskId and no pending task is attached to the chat.');
    if (!chatId) {
      chatId = getTaskChatId(sg, taskId);
      chat = chatId ? sg.getChat(chatId) : null;
    }
    let taskResult = await callInternalTaskTool(proxyManager, 'get_task_result', { task_id: taskId });
    if (reconcileCompletedChatTask(proxyManager, sg, chatId, taskId, taskResult)) {
      chat = sg.getChat(chatId);
    }
    let taskState = await readInternalTaskState(proxyManager);
    let developmentMap = buildDevelopmentMap({
      sg,
      chatId,
      taskId,
      taskResult,
      taskState,
    });
    let parsedResult = parseTaskResultJson(taskResult);
    let allowLatestFallback = !isRunningTaskResult(taskResult) && (!hasExplicitTaskId || taskResult?.isError);
    let finalAgentMessage = summarizeFinalAgentMessage(chat, taskId, {
      allowLatestFallback,
      parsedResult,
    });
    return textResult({
      ok: !taskResult?.isError || finalAgentMessage.hasText,
      chatId,
      taskId,
      finalAgentMessage,
      runtime: developmentMap.runtime,
      developmentMap,
    });
  }

  if (toolName === 'get_development_map') {
    let chatId = getChatId(args);
    let taskId = args.taskId || args.task_id || null;
    let chat = chatId ? sg.getChat(chatId) : null;
    if (!taskId && chat?.pendingTaskId) taskId = chat.pendingTaskId;
    if (!chatId && taskId) {
      chatId = getTaskChatId(sg, taskId);
    }
    let taskState = await readInternalTaskState(proxyManager);
    let taskResult = null;
    if (args.includeTaskResult && taskId) {
      taskResult = await callInternalTaskTool(proxyManager, 'get_task_result', { task_id: taskId });
    }
    return textResult({
      ok: !taskState.error,
      chatId,
      taskId,
      developmentMap: buildDevelopmentMap({
        sg,
        chatId,
        taskId,
        taskResult,
        taskState,
      }),
      runtimeIncluded: Boolean(taskResult),
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
      staleProcesses: summarizeStaleProcesses(taskState.staleProcesses),
    });
  }

  return errorResult(`Unknown Agent Portal orchestrator tool: ${toolName}`);
}
