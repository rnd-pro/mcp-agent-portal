import { isPublicMcpToolServer } from './mcp-tool-visibility.js';
import {
  buildDevelopmentMap,
  isRunningTaskStatus,
  parseTaskStateResult,
} from './orchestration-development-map.js';
import { extractFinalAgentResponse } from './task-router.js';
import {
  WORKFLOW_BOARD_TOOLS,
  handleWorkflowBoardTool,
  isWorkflowBoardTool,
} from './workflow-board-tools.js';

const FINAL_AGENT_MESSAGE_TEXT_LIMIT = 4000;
const INTERNAL_TASK_TOOL_TIMEOUT_MS = 600_000;
const INTERNAL_TASK_STATE_TIMEOUT_MS = 5_000;
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
        active_only: { type: 'boolean', description: 'Only return chats with an active task.' },
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
    description: 'Get Agent Portal orchestrator state, public MCP surface, internal runtime health, active chat counts, systemLoad capacity summary, MCP client/proxy telemetry, and the current development map with activityMap, subagentMap, taskMap, toolMap timing telemetry, task liveness classification, and structured promptHintMap suggestions.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  ...WORKFLOW_BOARD_TOOLS,
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
  let lines = safe.split('\n').map(line => line.trim()).filter(Boolean);
  let tail = safe.slice(-1000);
  let lastLine = lines.at(-1) || '';
  if (safe.length <= FINAL_AGENT_MESSAGE_TEXT_LIMIT) {
    return { text: safe, tail, lastLine, truncated: false };
  }
  return {
    text: safe.slice(0, FINAL_AGENT_MESSAGE_TEXT_LIMIT - 3).trimEnd() + '...',
    tail,
    lastLine,
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
    /^now i have all (?:the )?evidence\.? let me (?:compile|prepare|produce|write) (?:the )?.+\.?$/,
    /^now i have sufficient (?:data|evidence|information)(?: for (?:the )?.+?)?\.? let me (?:compile|prepare|produce|write) (?:the )?.+\.?$/,
    /^i now have (?:a )?(?:complete|full) picture\.? here is (?:my|the) .+\.?$/,
    /^here is (?:my|the) .+\.?$/,
  ].some((pattern) => pattern.test(normalized));
}

function isProgressLogFinalAgentText(text = '') {
  let lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 3) return false;
  let normalized = lines.join(' ').toLowerCase();
  let progressLineCount = lines.filter((line) => {
    let lower = line.toLowerCase();
    return /\bi(?:'|\u2019)ll\b|\bi will\b|\bi(?:'|\u2019)m\b|\bi am\b/.test(lower);
  }).length;
  let hasPendingWork = [
    /\bi(?:'|\u2019)ll\s+(?:collect|classify|stop|use|verify|check|finalize)\b/,
    /\bi will\s+(?:collect|classify|stop|use|verify|check|finalize)\b/,
    /\bi(?:'|\u2019)m\s+(?:now\s+)?(?:reading|checking|switching|giving|collecting)\b/,
    /\bone more interval\b/,
    /\bstill\s+(?:running|slow|not yielding|hung)\b/,
    /\bif (?:it|they) (?:does|do) not\b/,
  ].some((pattern) => pattern.test(normalized));
  return progressLineCount >= 2 && hasPendingWork;
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

function isMarkerOnlyFinalAgentText(text = '') {
  let lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0 || lines.length > 4) return false;
  let passMarker = /^#{0,3}\s*[A-Z][A-Z0-9_]+:PASS(?:\s+-\s+.+)?$/;
  let outcome = /^#{0,3}\s*(?:workflow\s+outcome|outcome|status)\s*:\s*[\w -]+$/i;
  let separator = /^-{3,}$/;
  return lines.some((line) => passMarker.test(line))
    && lines.every((line) => passMarker.test(line) || outcome.test(line) || separator.test(line));
}

function parseMaybeJson(value) {
  if (!value || typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeRequiredFinalMarkers(markers = []) {
  return (Array.isArray(markers) ? markers : [])
    .map(marker => String(marker || '').trim().replace(/:?\*?$/, ''))
    .filter(Boolean);
}

function finalMarkerState(text = '', marker = '') {
  let lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  let safeMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let pattern = new RegExp(`^${safeMarker}:[A-Z_][A-Z0-9_-]*(?:\\s+-\\s+.+)?$`);
  let index = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (pattern.test(lines[i])) {
      index = i;
      break;
    }
  }
  return {
    found: index >= 0,
    final: index >= 0 && index === lines.length - 1,
    line: index >= 0 ? lines[index] : null,
  };
}

function latestTodoWriteState(parsedResult = null) {
  let calls = Array.isArray(parsedResult?.toolCalls) ? parsedResult.toolCalls : [];
  for (let i = calls.length - 1; i >= 0; i--) {
    let call = calls[i] || {};
    let name = String(call.name || call.tool || call.toolName || '').toLowerCase();
    if (name !== 'todowrite' && name !== 'todo_write') continue;
    let input = parseMaybeJson(call.arguments ?? call.input ?? call.parameters ?? {});
    let todos = Array.isArray(input?.todos) ? input.todos : [];
    if (!todos.length) continue;
    let incomplete = todos.filter(todo => String(todo?.status || '').toLowerCase() !== 'completed');
    return {
      total: todos.length,
      incompleteCount: incomplete.length,
      incompleteStatuses: [...new Set(incomplete.map(todo => String(todo?.status || 'unknown')))].slice(0, 8),
    };
  }
  return null;
}

function requiredFinalMarkersSatisfied(text = '', markers = []) {
  let normalized = normalizeRequiredFinalMarkers(markers);
  if (!normalized.length) return false;
  for (let marker of normalized) {
    let markerState = finalMarkerState(text, marker);
    if (!markerState.found || !markerState.final) return false;
  }
  return true;
}

function finalAgentMessageQuality(text = '', parsedResult = null, options = {}) {
  if (!text) return { state: 'missing', reason: 'no-final-agent-text' };
  let toolCallCount = Array.isArray(parsedResult?.toolCalls) ? parsedResult.toolCalls.length : 0;
  let totalEvents = Number.isFinite(parsedResult?.totalEvents) ? parsedResult.totalEvents : 0;
  let requiredFinalMarkers = normalizeRequiredFinalMarkers(options.requiredFinalMarkers);
  let allMarkersSatisfied = requiredFinalMarkers.length > 0;
  for (let marker of requiredFinalMarkers) {
    let markerState = finalMarkerState(text, marker);
    let markerReasonPrefix = marker.toLowerCase().replace(/_/g, '-');
    if (!markerState.found) {
      return {
        state: 'weak-missing-marker',
        reason: `${markerReasonPrefix}-marker-missing`,
        requiredMarker: marker,
        toolCallCount,
        totalEvents,
      };
    }
    if (!markerState.final) {
      return {
        state: 'weak-missing-marker',
        reason: `${markerReasonPrefix}-marker-not-final`,
        requiredMarker: marker,
        markerLine: markerState.line,
        toolCallCount,
        totalEvents,
      };
    }
    if (markerState.line === `${marker}:PASS`) {
      let todoState = latestTodoWriteState(parsedResult);
      if (todoState?.incompleteCount > 0) {
        return {
          state: 'weak-todo-inconsistent',
          reason: 'completion-proof-pass-with-incomplete-todos',
          requiredMarker: marker,
          incompleteTodoCount: todoState.incompleteCount,
          incompleteTodoStatuses: todoState.incompleteStatuses,
          toolCallCount,
          totalEvents,
        };
      }
    }
  }
  if (isMarkerOnlyFinalAgentText(text)) {
    return {
      state: 'weak-marker-only',
      reason: 'marker-only-final',
      toolCallCount,
      totalEvents,
    };
  }
  if (allMarkersSatisfied && options.match !== 'taskId-exit-plan') {
    return { state: 'ok' };
  }
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
  if (isProgressLogFinalAgentText(text)) {
    return {
      state: 'weak-progress-log',
      reason: toolCallCount > 0 || totalEvents > 0
        ? 'progress-log-final-with-runtime-activity'
        : 'progress-log-final',
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
  let foundSatisfiesMarkers = found?.match === 'taskId'
    && requiredFinalMarkersSatisfied(found.message?.text, options.requiredFinalMarkers);
  if (exitPlan && (!found || (isPlanModeSummary(found.message?.text) && !foundSatisfiesMarkers))) {
    found = exitPlan;
  }
  let fullText = sanitizeFinalAgentText(found?.message?.text || '');
  let clipped = clipFinalAgentText(found?.message?.text || '');
  let quality = finalAgentMessageQuality(fullText, options.parsedResult, {
    match: found?.match || null,
    requiredFinalMarkers: options.requiredFinalMarkers,
  });
  return {
    hasText: Boolean(clipped.text),
    text: clipped.text,
    tail: clipped.tail,
    lastLine: clipped.lastLine,
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

function isFinalAgentMessageReady(finalAgentMessage = null) {
  return finalAgentMessage?.hasText === true && finalAgentMessage?.quality?.state === 'ok';
}

function isRequestedTaskTerminal(developmentMap = {}) {
  let requestedTask = developmentMap.requestedTask || {};
  if (requestedTask.terminalStatus === true) return true;
  let status = String(requestedTask.status || '').trim().toLowerCase();
  return ['done', 'finished', 'complete', 'completed', 'success', 'failed', 'error', 'cancelled', 'stopped'].includes(status);
}

function isTaskTerminalForFinalAnswer(developmentMap = {}, taskResult = null, taskState = null, taskId = null) {
  if (isRequestedTaskTerminal(developmentMap)) return true;
  let runtimeTask = runtimeTaskForId(taskState, taskId);
  if (runtimeTask && isRunningTaskStatus(runtimeTask.status)) return false;
  return isTerminalTaskResult(taskResult);
}

function compactHintText(text = '', limit = 360) {
  let value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length <= limit ? value : `${value.slice(0, limit - 3).trimEnd()}...`;
}

function formatLocalPromptHint(hint = {}) {
  if (hint.tool) {
    let args = hint.arguments ? JSON.stringify(hint.arguments) : '{}';
    return `${hint.label}: ${hint.tool}(${args}) - ${hint.reason || hint.prompt}`;
  }
  return `${hint.label}: ${hint.prompt}`;
}

function summarizeLocalActivityHint(hint = {}) {
  return {
    id: hint.id,
    category: hint.category || 'orchestration',
    label: hint.label || hint.id,
    prompt: hint.prompt || '',
    tool: hint.tool || null,
    arguments: hint.arguments || null,
    reason: hint.reason || '',
    chatId: hint.chatId || null,
    taskId: hint.taskId || null,
    priority: hint.priority || 'normal',
    source: hint.source || 'agent-portal',
  };
}

function finalAnswerRepairHint(chatId, taskId, finalAgentMessage = {}) {
  let quality = finalAgentMessage.quality || {};
  return {
    id: 'repair-final-answer',
    category: 'recovery',
    label: 'Repair final answer',
    prompt: compactHintText(
      'Ask the task owner to replace the terminal response with a concrete PASS/FAIL closure, ' +
      'blocking issues, verification evidence, and next action before closing the stage.',
    ),
    tool: 'resume_chat',
    arguments: { chatId: chatId || '', prompt: '<request concrete final closure>' },
    reason: compactHintText(
      `Terminal task final answer is not closure-ready: ${quality.state || 'unknown'} ` +
      `(${quality.reason || 'no reason'}).`,
      220,
    ),
    chatId,
    taskId,
    priority: 'high',
    source: 'agent-portal',
  };
}

function withFinalAnswerReadiness(
  developmentMap = {},
  chatId = null,
  taskId = null,
  finalAgentMessage = null,
  options = {},
) {
  let taskTerminal = isTaskTerminalForFinalAnswer(
    developmentMap,
    options.taskResult,
    options.taskState,
    taskId,
  );
  let ready = taskTerminal && isFinalAgentMessageReady(finalAgentMessage);
  if (ready) return { finalAnswerReady: true, developmentMap };

  let baseHints = developmentMap.promptHintMap?.hints || [];
  let repairHint = taskTerminal ? finalAnswerRepairHint(chatId, taskId, finalAgentMessage) : null;
  let hints = taskTerminal
    ? [
        repairHint,
        ...baseHints.filter((hint) => hint?.id !== 'close-stage' && hint?.id !== repairHint.id),
      ]
    : baseHints.filter((hint) => hint?.id !== 'close-stage' && hint?.id !== 'repair-final-answer');
  let promptHintMap = {
    ...(developmentMap.promptHintMap || {}),
    hints,
  };
  let activityMap = developmentMap.activityMap
    ? {
        ...developmentMap.activityMap,
        promptHints: hints.map(summarizeLocalActivityHint),
      }
    : developmentMap.activityMap;

  return {
    finalAnswerReady: false,
    developmentMap: {
      ...developmentMap,
      promptHintMap,
      promptHints: hints.map(formatLocalPromptHint).slice(0, 6),
      activityMap,
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

function requiredFinalMarkersForText(text = '') {
  return /\bCOMPLETION_PROOF\b/.test(String(text || '')) ? ['COMPLETION_PROOF'] : [];
}

function mergeRequiredFinalMarkers(...markerLists) {
  return [...new Set(markerLists.flat().filter(Boolean))];
}

function requiredFinalMarkersForTask(task = null) {
  return requiredFinalMarkersForText(`${task?.prompt || ''}\n${task?.input || ''}`);
}

function requiredFinalMarkersForChatTask(chat = null, taskId = null) {
  if (!chat || !taskId || !Array.isArray(chat.messages)) return [];
  let firstTaskMessageIndex = chat.messages.findIndex((message) => message?.taskId === taskId);
  if (firstTaskMessageIndex < 0) return [];
  for (let i = firstTaskMessageIndex - 1; i >= 0; i--) {
    let message = chat.messages[i];
    if (message?.role !== 'user') continue;
    return requiredFinalMarkersForText(message.text);
  }
  return [];
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

function runtimeTaskId(task = {}) {
  return task.id || task.taskId || task.task_id || null;
}

function taskStateHasFreshRuntime(taskState = null) {
  return taskState && !taskState.error;
}

function runtimeTaskForId(taskState = null, taskId = null) {
  if (!taskId) return null;
  return (taskState?.tasks || []).find(task => runtimeTaskId(task) === taskId) || null;
}

function isActiveChatTask(sg, taskState, chat = null) {
  let taskId = chat?.pendingTaskId;
  if (!taskId) return false;
  let runtimeTask = runtimeTaskForId(taskState, taskId);
  if (runtimeTask) return isRunningTaskStatus(runtimeTask.status);
  if (taskStateHasFreshRuntime(taskState)) return false;
  return isRunningTaskStatus(sg?.get?.(`tasks/${taskId}`)?.status);
}

function activeChatCount(chats = [], sg, taskState = null) {
  return chats.filter(chat => isActiveChatTask(sg, taskState, chat)).length;
}

function filterChatList(chats, args = {}, options = {}) {
  let activeOnly = Boolean(args.active_only || args.activeOnly);
  let limit = Number(args.limit);
  let { sg = null, taskState = null } = options;
  let result = chats
    .filter(chat => !args.projectId || chat.projectId === args.projectId)
    .filter(chat => !args.parentChatId || chat.parentChatId === args.parentChatId)
    .filter(chat => !args.origin || chat.origin === args.origin)
    .filter(chat => !activeOnly || isActiveChatTask(sg, taskState, chat));

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

async function callInternalTaskTool(proxyManager, name, args, timeoutMs = INTERNAL_TASK_TOOL_TIMEOUT_MS) {
  if (!proxyManager?.requestFromChild) {
    throw new Error('Agent Portal internal runtime is unavailable.');
  }
  return proxyManager.requestFromChild('agent-pool', 'tools/call', {
    name,
    arguments: args,
  }, timeoutMs);
}

async function readInternalTaskState(proxyManager) {
  try {
    let result = await callInternalTaskTool(proxyManager, 'list_tasks', {}, INTERNAL_TASK_STATE_TIMEOUT_MS);
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

  if (isWorkflowBoardTool(toolName)) {
    return handleWorkflowBoardTool(proxyManager, toolName, args, source, {
      ...options,
      stateGraph: sg,
    });
  }

  if (toolName === 'list_chats') {
    let activeOnly = Boolean(args.active_only || args.activeOnly);
    let taskState = activeOnly ? await readInternalTaskState(proxyManager) : null;
    return textResult({
      chats: filterChatList(sg.listChats(), args, { sg, taskState }),
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
    let stateTask = sg.get(`tasks/${taskId}`);
    let runtimeTask = runtimeTaskForId(taskState, taskId);
    let markerPrompt = [stateTask?.prompt, runtimeTask?.prompt].filter(Boolean).join('\n');
    let markerInput = [stateTask?.input, runtimeTask?.input].filter(Boolean).join('\n');
    let taskForMarkers = {
      ...(runtimeTask || {}),
      ...(stateTask || {}),
      prompt: markerPrompt || undefined,
      input: markerInput || undefined,
    };
    let finalAgentMessage = summarizeFinalAgentMessage(chat, taskId, {
      allowLatestFallback,
      parsedResult,
      requiredFinalMarkers: mergeRequiredFinalMarkers(
        requiredFinalMarkersForTask(taskForMarkers),
        requiredFinalMarkersForChatTask(chat, taskId),
      ),
    });
    let readiness = withFinalAnswerReadiness(developmentMap, chatId, taskId, finalAgentMessage, {
      taskResult,
      taskState,
    });
    return textResult({
      ok: !taskResult?.isError || finalAgentMessage.hasText,
      chatId,
      taskId,
      finalAnswerReady: readiness.finalAnswerReady,
      finalAgentMessage,
      runtime: developmentMap.runtime,
      developmentMap: readiness.developmentMap,
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
    let developmentMap = buildDevelopmentMap({ sg, taskState });
    return textResult({
      mode: process.env.PORTAL_MODE || 'standalone',
      publicServers,
      internalServers,
      chats: {
        total: chats.length,
        active: activeChatCount(chats, sg, taskState),
      },
      goals: {
        total: goals.length,
        active: goals.filter(goal => goal.status === 'active').length,
        blocked: goals.filter(goal => goal.status === 'blocked').length,
      },
      tasks: {
        total: tasks.length,
        active: tasks.filter(task => isRunningTaskStatus(task.status)).length,
      },
      systemLoad: developmentMap.system,
      mcpClients: proxyManager.getMcpClientSummary?.() || null,
      developmentMap,
      staleProcesses: summarizeStaleProcesses(taskState.staleProcesses),
    });
  }

  return errorResult(`Unknown Agent Portal orchestrator tool: ${toolName}`);
}
