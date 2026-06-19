import { parseResourceGroupDiagnostics } from './chat-delegate-routing.js';
import { DEFAULT_WORKFLOW_BOARD_ID } from '../../iso/workflow-board.js';

const TASK_TERMINAL_STATUSES = new Set(['done', 'error', 'cancelled', 'lost']);
const TASK_RUNNING_STATUSES = new Set(['running', 'pending', 'queued', 'starting', 'active', 'in_progress']);
const TOOL_EVENT_LIMIT = 8;
const TOOL_BUCKET_LIMIT = 5;
const TASK_LIMIT = 40;
const SUBAGENT_LIMIT = 40;
const PROMPT_HINT_LIMIT = 8;
const STALE_PROCESS_TASK_ID_LIMIT = 20;
const COLD_START_GRACE_MS = 15000;
const QUIET_TASK_MS = 60000;
const LOCAL_PATH_RE = /\/Users\/[^\s`'")\]}]+/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const SECRET_FIELD_RE = /\b(authorization|cookie|password|secret|session[_ -]?id|token|api[_ -]?key)\b\s*[:=]\s*([^\s,;)}\]]+)/gi;
const SECRET_WORD_RE = /\b(?:secret|session|token|api[_-]?key)[A-Za-z0-9_-]*\b/gi;

export function isRunningTaskStatus(status) {
  return TASK_RUNNING_STATUSES.has(String(status || ''));
}

function parseJson(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    let objectText = extractLeadingJsonObject(value);
    if (!objectText) return null;
    try {
      return JSON.parse(objectText);
    } catch {
      return null;
    }
  }
}

function extractLeadingJsonObject(value) {
  let text = String(value || '').trimStart();
  if (!text.startsWith('{')) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    let char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) return text.slice(0, i + 1);
    }
  }
  return null;
}

function parsePrefixedContent(result, prefix) {
  let item = result?.content?.find((entry) => entry?.text?.startsWith(prefix));
  if (!item) return null;
  return parseJson(item.text.slice(prefix.length));
}

function resultText(result) {
  return result?.content?.[0]?.text || '';
}

export function extractRuntimeResult(result = {}) {
  let events = parsePrefixedContent(result, '__EVENTS__:') || [];
  let json = parsePrefixedContent(result, '__RESULT_JSON__:');
  return {
    isError: Boolean(result?.isError),
    content: Array.isArray(result?.content) ? result.content : [],
    text: resultText(result),
    events: Array.isArray(events) ? events : [],
    result: json,
  };
}

function normalizeTimestamp(value) {
  if (!value) return null;
  if (typeof value === 'number') return value;
  let ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function eventTimestamp(event = {}) {
  return normalizeTimestamp(event.ts || event.timestamp || event.time || event.createdAt);
}

function eventDuration(event = {}) {
  if (!event) return null;
  let value = event.durationMs ?? event.elapsedMs ?? event.duration_ms ?? event.elapsed_ms;
  let duration = Number(value);
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function toolEventId(event = {}) {
  return event.tool_id
    || event.tool_use_id
    || event.id
    || event.call_id
    || event.toolCall?.id
    || event.tool_call?.id
    || event.part?.id
    || null;
}

function toolName(event = {}) {
  return event.name
    || event.tool_name
    || event.tool
    || event.toolCall?.name
    || event.tool_call?.name
    || event.function?.name
    || event.part?.name
    || event.part?.tool
    || null;
}

function toolArguments(event = {}) {
  return event.arguments
    || event.parameters
    || event.input
    || event.toolCall?.arguments
    || event.tool_call?.arguments
    || event.part?.parameters
    || event.part?.state?.input
    || {};
}

function resultToolCalls(result = null) {
  return Array.isArray(result?.toolCalls) ? result.toolCalls : [];
}

function resultToolResults(result = null) {
  return Array.isArray(result?.toolResults) ? result.toolResults : [];
}

function compactPrompt(prompt = '', limit = 160) {
  let text = String(prompt || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function basenameLabel(value = '') {
  let parts = String(value || '').split(/[\\/]/).filter(Boolean);
  return compactPrompt(parts.at(-1) || '', 96);
}

function urlHostLabel(value = '') {
  try {
    return compactPrompt(new URL(String(value)).hostname, 96);
  } catch {
    return '[url]';
  }
}

function summarizeToolDetail(args = {}) {
  let filePath = args.file_path ?? args.path ?? args.file;
  if (typeof filePath === 'string' && filePath) {
    return { kind: 'path', label: basenameLabel(filePath) };
  }
  if (typeof args.url === 'string' && args.url) {
    return { kind: 'url', label: urlHostLabel(args.url) };
  }
  if (typeof args.symbol === 'string' && args.symbol) {
    return { kind: 'symbol', label: compactPrompt(args.symbol, 96) };
  }
  if (typeof args.query === 'string' && args.query) {
    return { kind: 'query', label: '[query]' };
  }
  if (typeof args.command === 'string' && args.command) {
    return { kind: 'command', label: '[command]' };
  }
  return { kind: null, label: '' };
}

function compactResultSummary(value, limit = 220) {
  let text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  text = String(text || '')
    .replace(LOCAL_PATH_RE, '[local-path]')
    .replace(BEARER_RE, 'Bearer [redacted]')
    .replace(SECRET_FIELD_RE, '$1: [redacted]')
    .replace(SECRET_WORD_RE, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function toolResultValue(result = null) {
  if (!result) return null;
  return result.output ?? result.result ?? result.status ?? null;
}

function toolResultSummary(result = null) {
  let value = toolResultValue(result);
  return value === null || value === undefined ? null : compactResultSummary(value);
}

function toolResultUnavailableReason(result = null, terminal = false, superseded = false) {
  if (!result) {
    if (superseded) return 'superseded_by_later_event';
    return terminal ? 'not_reported_by_runner' : 'running';
  }
  let value = toolResultValue(result);
  return String(value ?? '').trim() ? null : 'empty_result';
}

function safeErrorKind(error) {
  if (!error) return null;
  if (typeof error === 'object') return error.code || error.name || error.type || 'error';
  return 'error';
}

function mergeTaskSnapshots(sg, taskState = null) {
  let tasks = new Map();
  for (let [id, task] of Object.entries(sg?.get?.('tasks') || {})) {
    tasks.set(id, { id, ...task, source: 'stateGraph' });
  }
  for (let task of taskState?.tasks || []) {
    if (!task?.id) continue;
    let existing = tasks.get(task.id) || {};
    tasks.set(task.id, {
      ...existing,
      ...task,
      events: existing.events || task.events || [],
      source: existing.source ? `${existing.source}+runtime` : 'runtime',
    });
  }
  return [...tasks.values()];
}

function applyRuntimeEventCounters(tasks = [], runtimeEvents = [], taskId = null) {
  if (!taskId || !runtimeEvents.length) return tasks;
  let lastEventAt = runtimeEvents
    .map(eventTimestamp)
    .filter(Boolean)
    .sort((a, b) => b - a)[0] || null;
  return tasks.map((task) => {
    if (task?.id !== taskId) return task;
    return {
      ...task,
      eventCount: Math.max(Number(task.eventCount) || 0, runtimeEvents.length),
      lastEventAt: task.lastEventAt || lastEventAt,
    };
  });
}

function descendantChatIds(chats, rootChatId) {
  if (!rootChatId) return new Set(chats.map((chat) => chat.id).filter(Boolean));
  let ids = new Set([rootChatId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (let chat of chats) {
      if (chat?.id && chat.parentChatId && ids.has(chat.parentChatId) && !ids.has(chat.id)) {
        ids.add(chat.id);
        changed = true;
      }
    }
  }
  return ids;
}

function taskBelongsToScope(task, scopedChatIds, primaryTaskId) {
  if (!task) return false;
  if (!scopedChatIds || scopedChatIds.size === 0) return true;
  if (primaryTaskId && (task.id === primaryTaskId || task.parentId === primaryTaskId || task.parentTaskId === primaryTaskId)) return true;
  return Boolean(task.chatId && scopedChatIds.has(task.chatId));
}

function collectTaskDescendants(tasks, primaryTaskId) {
  if (!primaryTaskId) return new Set();
  let ids = new Set([primaryTaskId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (let task of tasks) {
      let parentId = task.parentId || task.parentTaskId;
      if (task.id && parentId && ids.has(parentId) && !ids.has(task.id)) {
        ids.add(task.id);
        changed = true;
      }
    }
  }
  return ids;
}

function summarizeTask(task = {}, now = Date.now()) {
  let events = Array.isArray(task.events) ? task.events : [];
  let lastEvent = events.at(-1) || null;
  let startedAt = normalizeTimestamp(task.startedAt);
  let completedAt = normalizeTimestamp(task.completedAt);
  let elapsedMs = Number.isFinite(task.elapsedMs)
    ? task.elapsedMs
    : startedAt ? (completedAt || now) - startedAt : null;
  return {
    id: task.id,
    status: task.status || task.type || 'unknown',
    chatId: task.chatId || null,
    parentTaskId: task.parentId || task.parentTaskId || null,
    agentSlug: task.agentSlug || task.agent || null,
    resourceGroup: task.resourceGroup || null,
    provider: task.provider || null,
    model: task.model || null,
    approvalMode: task.approvalMode || null,
    hasSession: Boolean(task.sessionId),
    hasPrompt: Boolean(task.prompt),
    startedAt: task.startedAt || null,
    completedAt: task.completedAt || null,
    elapsedMs,
    eventCount: task.eventCount ?? events.length,
    lastEventAt: task.lastEventAt || lastEvent?.ts || lastEvent?.timestamp || null,
    liveness: summarizeTaskLiveness({
      status: task.status || task.type || 'unknown',
      startedAt,
      completedAt,
      elapsedMs,
      eventCount: task.eventCount ?? events.length,
      lastEventAt: task.lastEventAt || lastEvent?.ts || lastEvent?.timestamp || null,
    }, now),
    trackedChildCount: Array.isArray(task.trackedChildren) ? task.trackedChildren.length : 0,
    hasError: Boolean(task.error),
    errorKind: safeErrorKind(task.error),
  };
}

function summarizeTaskLiveness(task = {}, now = Date.now()) {
  let status = task.status || 'unknown';
  let terminal = TASK_TERMINAL_STATUSES.has(status);
  let eventCount = Number.isFinite(Number(task.eventCount)) ? Number(task.eventCount) : 0;
  let startedAt = normalizeTimestamp(task.startedAt);
  let lastEventAt = normalizeTimestamp(task.lastEventAt);
  let elapsedMs = Number.isFinite(Number(task.elapsedMs))
    ? Number(task.elapsedMs)
    : startedAt ? Math.max(0, now - startedAt) : null;
  let quietSince = lastEventAt || startedAt || null;
  let quietMs = quietSince ? Math.max(0, now - quietSince) : null;

  if (status === 'unknown') {
    return {
      state: 'unknown',
      severity: 'warning',
      reason: 'Task status is unknown — task row may be missing, stale, or TTL-cleared.',
      eventCount,
      quietMs,
      thresholdMs: null,
      lastEventAt: null,
    };
  }

  if (terminal) {
    return {
      state: 'terminal',
      severity: 'normal',
      reason: null,
      eventCount,
      quietMs,
      thresholdMs: null,
      lastEventAt: task.lastEventAt || null,
    };
  }

  if (eventCount === 0) {
    let coldStart = Number.isFinite(quietMs) && quietMs <= COLD_START_GRACE_MS;
    return {
      state: coldStart ? 'cold_start' : 'no_events',
      severity: coldStart ? 'info' : 'warning',
      reason: coldStart
        ? 'Running task has not emitted events yet.'
        : 'Running task has no recorded events after the cold-start grace period.',
      eventCount,
      quietMs,
      thresholdMs: COLD_START_GRACE_MS,
      lastEventAt: null,
    };
  }

  if (Number.isFinite(quietMs) && quietMs > QUIET_TASK_MS) {
    return {
      state: 'quiet',
      severity: 'warning',
      reason: 'Running task has been quiet longer than the safe liveness threshold.',
      eventCount,
      quietMs,
      thresholdMs: QUIET_TASK_MS,
      lastEventAt: task.lastEventAt || null,
    };
  }

  return {
    state: 'active',
    severity: 'normal',
    reason: null,
    eventCount,
    quietMs,
    thresholdMs: QUIET_TASK_MS,
    lastEventAt: task.lastEventAt || null,
  };
}

function collectToolUses(
  tasks,
  runtimeEvents = [],
  runtimeContext = {},
  now = Date.now(),
  runtimeResult = null,
) {
  let events = [];
  let sequence = 0;
  for (let task of tasks) {
    let taskEvents = Array.isArray(task.events) ? task.events : [];
    let lastTaskEvent = taskEvents.at(-1) || null;
    for (let event of task.events || []) {
      events.push({
        ...event,
        taskId: task.id,
        chatId: task.chatId || null,
        taskStatus: task.status || task.type || null,
        taskCompletedAt: task.completedAt || null,
        taskLastEventAt: task.lastEventAt || lastTaskEvent?.ts || lastTaskEvent?.timestamp || null,
        sequence: sequence++,
      });
    }
  }
  for (let event of runtimeEvents) {
    events.push({
      taskId: event.taskId || runtimeContext.taskId || null,
      chatId: event.chatId || runtimeContext.chatId || null,
      taskStatus: event.taskStatus || runtimeContext.taskStatus || null,
      taskCompletedAt: event.taskCompletedAt || runtimeContext.taskCompletedAt || null,
      taskLastEventAt: event.taskLastEventAt || runtimeContext.taskLastEventAt || null,
      ...event,
      sequence: sequence++,
    });
  }

  let toolUses = [];
  let resultsById = new Map();
  let unkeyedResults = [];
  for (let event of events) {
    if (event.type !== 'tool_result') continue;
    let id = toolEventId(event);
    if (id) {
      resultsById.set(id, event);
    } else {
      unkeyedResults.push(event);
    }
  }

  let usedUnkeyedResults = new Set();
  for (let event of events) {
    if (event.type !== 'tool_use' && event.type !== 'tool_call') continue;
    let name = toolName(event);
    let args = toolArguments(event);
    let detail = summarizeToolDetail(args);
    let result = findToolResult(event, resultsById, unkeyedResults, usedUnkeyedResults);
    let startedAt = eventTimestamp(event);
    let completedAt = result ? eventTimestamp(result) : null;
    let usedAt = event.ts || event.timestamp || null;
    let explicitDuration = eventDuration(result) ?? eventDuration(event);
    let durationMs = startedAt && completedAt
      ? Math.max(0, completedAt - startedAt)
      : explicitDuration;
    let taskTerminal = TASK_TERMINAL_STATUSES.has(event.taskStatus || '');
    let supersededCompletedAt = !completedAt && !taskTerminal
      ? estimateSupersededToolCompletedAt(event, events, startedAt)
      : null;
    let estimatedCompletedAt = !completedAt
      ? taskTerminal ? estimateToolCompletedAt(event, startedAt) : supersededCompletedAt
      : null;
    let estimatedElapsedMs = startedAt && estimatedCompletedAt
      ? Math.max(0, estimatedCompletedAt - startedAt)
      : null;
    let runningElapsedMs = startedAt && !taskTerminal && !estimatedCompletedAt ? Math.max(0, now - startedAt) : null;
    let elapsedMs = durationMs ?? estimatedElapsedMs ?? runningElapsedMs;
    let timingSource = timingSourceForTool({
      durationMs,
      completedAt,
      estimatedCompletedAt,
      supersededCompletedAt,
      runningElapsedMs,
    });
    toolUses.push({
      taskId: event.taskId || null,
      chatId: event.chatId || null,
      name,
      detail: detail.label,
      detailKind: detail.kind,
      detailLabel: detail.label,
      status: result?.status || (result ? 'done' : estimatedCompletedAt ? 'done' : taskTerminal ? event.taskStatus : 'running'),
      startedAt: usedAt,
      usedAt,
      completedAt: result?.ts || result?.timestamp || null,
      estimatedCompletedAt,
      durationMs,
      elapsedMs,
      usageMs: elapsedMs,
      timingSource,
      timingEstimated: timingSource !== 'tool_result' && timingSource !== 'unknown',
      resultSummary: toolResultSummary(result),
      resultUnavailableReason: toolResultUnavailableReason(result, taskTerminal, Boolean(supersededCompletedAt)),
    });
  }

  addRuntimeResultTools(toolUses, runtimeResult, runtimeContext);
  return toolUses.filter((event) => event.name);
}

function runtimeToolName(call = {}) {
  return call.name
    || call.tool_name
    || call.tool
    || call.function?.name
    || call.part?.name
    || call.part?.tool
    || null;
}

function runtimeToolArguments(call = {}) {
  return call.arguments
    || call.parameters
    || call.input
    || call.args
    || call.function?.arguments
    || call.part?.parameters
    || call.part?.state?.input
    || {};
}

function addRuntimeResultTools(toolUses, runtimeResult, runtimeContext) {
  let calls = resultToolCalls(runtimeResult);
  if (!calls.length) return;
  let results = resultToolResults(runtimeResult);
  for (let index = 0; index < calls.length; index++) {
    let call = calls[index];
    let name = runtimeToolName(call);
    if (!name) continue;
    let args = runtimeToolArguments(call);
    let detail = summarizeToolDetail(args);
    let duplicate = toolUses.some((tool) => {
      return tool.name === name
        && tool.taskId === (runtimeContext.taskId || null)
        && tool.chatId === (runtimeContext.chatId || null)
        && (!detail.label || tool.detail === detail.label);
    });
    if (duplicate) continue;
    let result = results[index] || {};
    let hasResult = index < results.length;
    toolUses.push({
      taskId: runtimeContext.taskId || null,
      chatId: runtimeContext.chatId || null,
      name,
      detail: detail.label,
      detailKind: detail.kind,
      detailLabel: detail.label,
      status: result.status || call.status || 'done',
      startedAt: null,
      usedAt: null,
      completedAt: null,
      estimatedCompletedAt: null,
      durationMs: null,
      elapsedMs: null,
      usageMs: null,
      timingSource: 'runtime_result',
      timingEstimated: false,
      resultSummary: toolResultSummary(result),
      resultUnavailableReason: toolResultUnavailableReason(hasResult ? result : null, true),
    });
  }
}

function sameToolScope(event, result) {
  if (event.taskId && result.taskId && event.taskId !== result.taskId) return false;
  if (event.chatId && result.chatId && event.chatId !== result.chatId) return false;
  return true;
}

function findToolResult(event, resultsById, unkeyedResults, usedUnkeyedResults) {
  let id = toolEventId(event);
  if (id && resultsById.has(id)) return resultsById.get(id);
  for (let result of unkeyedResults) {
    if (usedUnkeyedResults.has(result)) continue;
    if ((result.sequence ?? -1) <= (event.sequence ?? -1)) continue;
    if (!sameToolScope(event, result)) continue;
    usedUnkeyedResults.add(result);
    return result;
  }
  return null;
}

function estimateToolCompletedAt(event, startedAt) {
  if (!startedAt) return null;
  let completedAt = normalizeTimestamp(event.taskCompletedAt);
  if (completedAt && completedAt >= startedAt) return completedAt;
  let lastEventAt = normalizeTimestamp(event.taskLastEventAt);
  if (lastEventAt && lastEventAt >= startedAt) return lastEventAt;
  return null;
}

function estimateSupersededToolCompletedAt(event, events, startedAt) {
  if (!startedAt) return null;
  let eventSequence = event.sequence ?? -1;
  for (let nextEvent of events) {
    if ((nextEvent.sequence ?? -1) <= eventSequence) continue;
    if (!sameToolScope(event, nextEvent)) continue;
    let nextAt = eventTimestamp(nextEvent);
    if (nextAt && nextAt >= startedAt) return nextAt;
  }
  return null;
}

function timingSourceForTool({ durationMs, completedAt, estimatedCompletedAt, supersededCompletedAt, runningElapsedMs }) {
  if (Number.isFinite(durationMs) || completedAt) return 'tool_result';
  if (supersededCompletedAt) return 'event_superseded';
  if (estimatedCompletedAt) return 'task_completed';
  if (Number.isFinite(runningElapsedMs)) return 'running_elapsed';
  return 'unknown';
}

function extractRuntimeHint(text = '') {
  let match = text.match(/\[INFO\]\s+\*\*([\s\S]*?)\*\*/);
  if (!match) return null;
  return match[1]
    .replace(/`get_task_result`/g, '`get_chat_task_result`')
    .replace(/\bget_task_result\b/g, 'get_chat_task_result')
    .trim();
}

function publicPromptHintText(value = '') {
  return String(value || '')
    .replace(/\bAgent Pool runtime hint\b/g, 'Agent Portal runtime hint')
    .replace(/\bAgent Pool\b/g, 'Agent Portal')
    .replace(/\bagent-pool\b/g, 'agent-portal');
}

function publicPromptHintSource(value = '') {
  return value === 'agent-pool' ? 'agent-portal' : value || 'agent-portal';
}

function addPromptHint(hints, hint) {
  if (!hint?.id || hints.some((item) => item.id === hint.id)) return;
  hints.push({
    id: hint.id,
    category: hint.category || 'orchestration',
    label: publicPromptHintText(hint.label || hint.id),
    prompt: compactPrompt(publicPromptHintText(hint.prompt || ''), 360),
    tool: hint.tool || null,
    arguments: hint.arguments || null,
    reason: compactPrompt(publicPromptHintText(hint.reason || ''), 220),
    chatId: hint.chatId || null,
    taskId: hint.taskId || null,
    agentSlug: hint.agentSlug || null,
    resourceGroup: hint.resourceGroup || null,
    priority: hint.priority || 'normal',
    source: publicPromptHintSource(hint.source),
  });
}

function formatPromptHint(hint = {}) {
  if (hint.tool) {
    let args = hint.arguments ? JSON.stringify(hint.arguments) : '{}';
    return `${hint.label}: ${hint.tool}(${args}) - ${hint.reason || hint.prompt}`;
  }
  return `${hint.label}: ${hint.prompt}`;
}

function buildStructuredPromptHints({
  chatId,
  taskId,
  runtimeText,
  runningCount,
  latestTools = [],
  subagents = [],
  tasks = [],
  workflowContext = {},
}) {
  let hints = [];
  let runtimeHint = extractRuntimeHint(runtimeText);
  let primaryTask = taskId ? tasks.find((task) => task.id === taskId) : null;
  let latestTask = primaryTask || tasks[0] || null;
  let failedTask = tasks.find((task) => ['error', 'lost'].includes(task.status));
  let latestTool = latestTools[0] || null;

  if (runtimeHint) {
    addPromptHint(hints, {
      id: 'runtime-coaching',
      category: 'runtime',
      label: 'Agent Portal runtime hint',
      prompt: runtimeHint,
      reason: 'Derived from the Agent Portal running-task result.',
      chatId,
      taskId,
      agentSlug: latestTask?.agentSlug || null,
      resourceGroup: latestTask?.resourceGroup || null,
      source: 'agent-portal',
    });
  }
  if (taskId) {
    addPromptHint(hints, {
      id: 'poll-current-task',
      category: 'monitoring',
      label: 'Poll current task',
      prompt: 'Summarize task status from developmentMap: running/completed tasks, latest tool, elapsed time, blockers, and next local work. Do not poll again for at least 2 minutes unless the user asks.',
      tool: 'get_chat_task_result',
      arguments: { chatId: chatId || '', taskId },
      reason: 'Refresh this chain without exposing internal execution tools.',
      chatId,
      taskId,
      agentSlug: latestTask?.agentSlug || null,
      resourceGroup: latestTask?.resourceGroup || null,
      priority: runningCount > 0 ? 'high' : 'normal',
    });
  }
  if (chatId && workflowContext.required) {
    addPromptHint(hints, {
      id: 'create-workflow-item',
      category: 'workflow',
      label: 'Create workflow work item',
      prompt: 'Create a workflow board card for the next scoped task. Include owner, files, constraints, acceptance criteria, and verification before orchestration starts.',
      tool: 'workflow_board',
      arguments: cleanUndefined({
        action: 'create_item',
        boardId: DEFAULT_WORKFLOW_BOARD_ID,
        projectId: workflowContext.projectId || undefined,
        title: '<scoped work item title>',
        body: '<scope, constraints, verification, files[], expected output>',
        owner: 'orchestrator',
        acceptanceCriteria: ['Scope is explicit', 'Verification command is defined'],
        entityRefs: workflowEntityRefs(workflowContext, chatId),
      }),
      reason: 'Active goal work must be represented as a workflow board card before a delegated task starts.',
      chatId,
      priority: 'high',
    });
    addPromptHint(hints, {
      id: 'start-ready-workflow-item',
      category: 'workflow',
      label: 'Start ready workflow item',
      prompt: 'Move the scoped card to ready so the workflow board automation can lease it, start the run, and attach subagent task metadata.',
      tool: 'workflow_board',
      arguments: {
        action: 'transition',
        boardId: DEFAULT_WORKFLOW_BOARD_ID,
        cardId: '<card-id>',
        toColumnId: 'ready',
        actor: 'orchestrator',
        reason: 'Ready for board-governed orchestration.',
      },
      reason: 'The ready transition is the board-owned handoff from planning to orchestration.',
      chatId,
      priority: 'high',
    });
  } else if (chatId) {
    addPromptHint(hints, {
      id: 'continue-chat',
      category: 'delegation',
      label: 'Continue this orchestration chat',
      prompt: 'Continue from the current developmentMap. Include scope, constraints, verification, expected output, and relevant files. Verify delegated findings against code before implementation.',
      tool: 'resume_chat',
      arguments: { chatId, prompt: '<next scoped prompt>', files: [], context_mode: 'auto' },
      reason: 'Keeps provider session, resource group, and chat-bound development map together.',
      chatId,
      agentSlug: latestTask?.agentSlug || null,
      resourceGroup: latestTask?.resourceGroup || null,
      priority: 'high',
    });
    addPromptHint(hints, {
      id: 'create-child-subagent',
      category: 'delegation',
      label: 'Create connected subagent',
      prompt: 'Create a child chat for an independent scope, then resume it with a precise prompt and files[] so the subagent appears in subagentMap/tree.',
      tool: 'create_chat',
      arguments: {
        name: '<chain name>',
        parentChatId: chatId,
        agent: 'orchestrator',
        approval_mode: 'plan',
        resource_group: 'orchestration-readonly',
      },
      reason: 'Use parentChatId to keep the development map connected.',
      chatId,
    });
  }
  if (runningCount > 0) {
    addPromptHint(hints, {
      id: 'parallel-local-work',
      category: 'workflow',
      label: 'Do independent local work',
      prompt: 'Use subagentMap, task ownership, and latestTools to choose non-overlapping local work while agents run. Avoid idle polling.',
      reason: 'Preserves parallel development throughput while respecting the two-minute polling rule.',
      chatId,
      taskId,
      priority: 'high',
    });
  }
  if (latestTool) {
    addPromptHint(hints, {
      id: 'review-latest-tool',
      category: 'tooling',
      label: 'Review latest tool activity',
      prompt: `Inspect the latest tool activity (${latestTool.name}${latestTool.detailLabel ? `: ${latestTool.detailLabel}` : ''}) before deciding the next orchestration step.`,
      reason: 'Latest tool timing and status show what the active agent is doing now.',
      chatId: latestTool.chatId || chatId,
      taskId: latestTool.taskId || taskId,
      priority: latestTool.status === 'running' ? 'high' : 'normal',
    });
  }
  if (subagents.length > 0) {
    addPromptHint(hints, {
      id: 'aggregate-subagents',
      category: 'review',
      label: 'Aggregate subagent outputs',
      prompt: `Aggregate ${subagents.length} subagent node(s) from subagentMap/tree, verify findings against code, and update durable checklist ownership before merging changes.`,
      tool: 'get_orchestrator_status',
      arguments: {},
      reason: 'Subagent results should be synthesized through Agent Portal, not from raw process state.',
      chatId,
    });
  }
  if (failedTask) {
    addPromptHint(hints, {
      id: 'recover-failed-task',
      category: 'recovery',
      label: 'Recover failed task',
      prompt: `Diagnose failed task ${failedTask.id}, narrow the scope, and retry only after recording the failure mode.`,
      tool: 'get_chat_task_result',
      arguments: { chatId: failedTask.chatId || chatId || '', taskId: failedTask.id },
      reason: failedTask.error || 'Task is in a failed terminal state.',
      chatId: failedTask.chatId || chatId,
      taskId: failedTask.id,
      priority: 'high',
    });
  }
  if (tasks.length > 0 && runningCount === 0) {
    addPromptHint(hints, {
      id: 'close-stage',
      category: 'workflow',
      label: 'Close verified stage',
      prompt: 'If all scoped tasks are terminal, run focused verification, update the durable checklist, clean up temporary artifacts, and commit/push the owning repository changes.',
      reason: 'Development map shows no running scoped tasks.',
      chatId,
      taskId,
    });
  }
  return hints.slice(0, PROMPT_HINT_LIMIT);
}

function buildPromptHintMap(args) {
  let hints = buildStructuredPromptHints(args);
  return {
    schemaVersion: 1,
    hints,
    generatedAt: args.now || Date.now(),
    limits: {
      hints: PROMPT_HINT_LIMIT,
    },
  };
}

function taskActivityTime(task = {}) {
  return normalizeTimestamp(task.lastEventAt || task.completedAt || task.startedAt);
}

function toolUseTime(tool = {}) {
  if (!tool) return null;
  return normalizeTimestamp(tool.usedAt || tool.startedAt);
}

function summarizeLatestTool(tool = null) {
  if (!tool) return null;
  return {
    name: tool.name,
    taskId: tool.taskId || null,
    chatId: tool.chatId || null,
    detail: tool.detail || '',
    detailKind: tool.detailKind || null,
    detailLabel: tool.detailLabel || tool.detail || '',
    status: tool.status || 'unknown',
    usedAt: tool.usedAt || null,
    completedAt: tool.completedAt || null,
    estimatedCompletedAt: tool.estimatedCompletedAt ?? null,
    durationMs: tool.durationMs ?? null,
    elapsedMs: tool.elapsedMs ?? null,
    usageMs: tool.usageMs ?? null,
    timingSource: tool.timingSource || 'unknown',
    timingEstimated: Boolean(tool.timingEstimated),
    resultSummary: tool.resultSummary || null,
    resultUnavailableReason: tool.resultUnavailableReason || null,
  };
}

function cleanUndefined(input = {}) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

function workflowContextForChat(chat = null) {
  return {
    required: Boolean(chat?.activeGoalId || chat?.goalIntentActive),
    chatId: chat?.id || null,
    projectId: chat?.projectId || null,
    activeGoalId: chat?.activeGoalId || null,
  };
}

function workflowEntityRefs(workflowContext = {}, chatId = null) {
  return cleanUndefined({
    chatId: chatId || workflowContext.chatId || undefined,
    goalId: workflowContext.activeGoalId || undefined,
  });
}

function sortToolsByActivity(toolUses = []) {
  return [...toolUses].sort((a, b) => (toolUseTime(b) || 0) - (toolUseTime(a) || 0));
}

function summarizeTools(toolUses = [], limit = TOOL_BUCKET_LIMIT) {
  return sortToolsByActivity(toolUses)
    .slice(0, limit)
    .map(summarizeLatestTool);
}

function latestToolFrom(toolUses = []) {
  return summarizeLatestTool(sortToolsByActivity(toolUses)[0] || null);
}

function sumFinite(items = [], field) {
  return items
    .map((item) => Number(item?.[field]))
    .filter(Number.isFinite)
    .reduce((sum, value) => sum + value, 0);
}

function lastToolUseAt(toolUses = []) {
  let latest = sortToolsByActivity(toolUses)[0] || null;
  return latest?.usedAt || latest?.startedAt || null;
}

function countRunningTools(toolUses = []) {
  return toolUses.filter((tool) => tool?.status === 'running').length;
}

function mapByChat(items = [], field = 'chatId') {
  let map = new Map();
  for (let item of items) {
    let chatId = item?.[field];
    if (!chatId) continue;
    let list = map.get(chatId) || [];
    list.push(item);
    map.set(chatId, list);
  }
  return map;
}

function summarizeChatNode(chat, tasksByChat, toolsByChat, rootChatId, now) {
  let tasks = tasksByChat.get(chat.id) || [];
  let tools = toolsByChat.get(chat.id) || [];
  let latestTool = latestToolFrom(tools);
  let activityTimes = [
    normalizeTimestamp(chat.updatedAt),
    ...tasks.map(taskActivityTime),
    normalizeTimestamp(latestTool?.usedAt),
  ].filter(Boolean);
  let elapsedValues = tasks
    .map((task) => Number(task.elapsedMs))
    .filter(Number.isFinite);
  return {
    chatId: chat.id,
    parentChatId: chat.parentChatId || null,
    root: rootChatId ? chat.id === rootChatId : !chat.parentChatId,
    name: chat.name || '',
    agent: chat.agent || null,
    adapter: chat.adapter || null,
    resourceGroup: chat.resource_group || null,
    approvalMode: chat.approval_mode || null,
    pendingTaskId: chat.pendingTaskId || null,
    activeGoalId: chat.activeGoalId || null,
    hasSession: Boolean(chat.sessionId),
    taskIds: tasks.map((task) => task.id).filter(Boolean),
    runningTaskCount: tasks.filter((task) => isRunningTaskStatus(task.status)).length,
    totalTaskCount: tasks.length,
    totalElapsedMs: elapsedValues.reduce((sum, value) => sum + value, 0),
    toolCount: tools.length,
    runningToolCount: countRunningTools(tools),
    toolDurationMs: sumFinite(tools, 'durationMs'),
    toolUsageMs: sumFinite(tools, 'usageMs'),
    latestTool,
    latestTools: summarizeTools(tools),
    liveness: summarizeNodeLiveness(tasks),
    lastActivityAt: activityTimes.length ? Math.max(...activityTimes) : null,
    updatedAt: chat.updatedAt || null,
    generatedAt: now,
  };
}

function summarizeNodeLiveness(tasks = []) {
  let liveTasks = tasks.filter((task) => isRunningTaskStatus(task.status));
  let unknownTasks = tasks.filter((task) => task.liveness?.state === 'unknown');
  let warningTasks = liveTasks.filter((task) => task.liveness?.severity === 'warning');
  let zeroEventTasks = liveTasks.filter((task) => {
    return task.liveness?.state === 'no_events' || task.liveness?.state === 'cold_start';
  });
  let quietTasks = liveTasks.filter((task) => task.liveness?.state === 'quiet');
  let highest = warningTasks[0]?.liveness
    || zeroEventTasks[0]?.liveness
    || liveTasks[0]?.liveness
    || unknownTasks[0]?.liveness
    || null;
  return {
    state: highest?.state || (tasks.length ? 'terminal' : 'idle'),
    severity: highest?.severity || 'normal',
    warningTaskCount: warningTasks.length + unknownTasks.length,
    unknownTaskCount: unknownTasks.length,
    zeroEventTaskCount: zeroEventTasks.length,
    quietTaskCount: quietTasks.length,
    runningTaskCount: liveTasks.length,
  };
}

function shouldIncludeDevelopmentChat(chat, tasksByChat, toolsByChat, rootChatId) {
  if (!chat?.id) return false;
  if (rootChatId) return true;
  if (chat.parentChatId) return true;
  if ((tasksByChat.get(chat.id) || []).length) return true;
  if ((toolsByChat.get(chat.id) || []).length) return true;
  if (chat.pendingTaskId || chat.activeGoalId || chat.goalIntentActive) return true;
  if (chat.sessionId || chat.lastTaskStatus) return true;
  if (chat.projectId) return true;
  return false;
}

function buildTree(nodes) {
  let byId = new Map(nodes.map((node) => [node.chatId, { ...node, children: [] }]));
  let roots = [];
  for (let node of byId.values()) {
    let parent = node.parentChatId ? byId.get(node.parentChatId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function buildSubagentMap({ chats, scopedChatIds, rootChatId, tasks, toolUses, now }) {
  let tasksByChat = mapByChat(tasks);
  let toolsByChat = mapByChat(toolUses);
  let nodes = chats
    .filter((chat) => chat?.id && scopedChatIds.has(chat.id))
    .filter((chat) => shouldIncludeDevelopmentChat(chat, tasksByChat, toolsByChat, rootChatId))
    .map((chat) => summarizeChatNode(chat, tasksByChat, toolsByChat, rootChatId, now))
    .sort((a, b) => {
      if (rootChatId && a.chatId === rootChatId) return -1;
      if (rootChatId && b.chatId === rootChatId) return 1;
      return (b.lastActivityAt || 0) - (a.lastActivityAt || 0);
    })
    .slice(0, SUBAGENT_LIMIT);
  let nodeIds = new Set(nodes.map((node) => node.chatId));
  let edges = nodes
    .filter((node) => node.parentChatId && nodeIds.has(node.parentChatId))
    .map((node) => ({
      from: node.parentChatId,
      to: node.chatId,
      kind: 'agent.delegates',
    }));

  return {
    schemaVersion: 1,
    rootChatId,
    nodes,
    edges,
    tree: buildTree(nodes),
    generatedAt: now,
    limits: {
      nodes: SUBAGENT_LIMIT,
      tasks: TASK_LIMIT,
      latestTools: TOOL_EVENT_LIMIT,
      toolsPerNode: TOOL_BUCKET_LIMIT,
    },
  };
}

function buildTaskMap({ tasks, toolUses, now }) {
  let toolsByTask = mapByChat(toolUses, 'taskId');
  let byId = {};
  for (let task of tasks) {
    if (!task?.id) continue;
    let tools = toolsByTask.get(task.id) || [];
    byId[task.id] = {
      id: task.id,
      chatId: task.chatId || null,
      parentTaskId: task.parentTaskId || null,
      status: task.status || 'unknown',
      agentSlug: task.agentSlug || null,
      resourceGroup: task.resourceGroup || null,
      provider: task.provider || null,
      model: task.model || null,
      startedAt: task.startedAt || null,
      completedAt: task.completedAt || null,
      elapsedMs: task.elapsedMs ?? null,
      eventCount: task.eventCount ?? 0,
      lastEventAt: task.lastEventAt || null,
      liveness: task.liveness || null,
      toolCount: tools.length,
      runningToolCount: countRunningTools(tools),
      toolDurationMs: sumFinite(tools, 'durationMs'),
      toolUsageMs: sumFinite(tools, 'usageMs'),
      latestTool: latestToolFrom(tools),
      lastToolUsedAt: lastToolUseAt(tools),
      lastActivityAt: taskActivityTime(task),
    };
  }
  return {
    schemaVersion: 1,
    byId,
    runningIds: tasks
      .filter((task) => task?.id && isRunningTaskStatus(task.status))
      .map((task) => task.id),
    terminalIds: tasks
      .filter((task) => task?.id && TASK_TERMINAL_STATUSES.has(task.status || ''))
      .map((task) => task.id),
    edges: tasks
      .filter((task) => task?.id && task.parentTaskId && byId[task.parentTaskId])
      .map((task) => ({
        from: task.parentTaskId,
        to: task.id,
        kind: 'task.delegates',
      })),
    generatedAt: now,
    limits: {
      tasks: TASK_LIMIT,
      toolsPerTask: TOOL_BUCKET_LIMIT,
    },
  };
}

function buildToolBucket({ id, fieldName, tools }) {
  return {
    [fieldName]: id,
    toolCount: tools.length,
    runningToolCount: countRunningTools(tools),
    totalDurationMs: sumFinite(tools, 'durationMs'),
    totalUsageMs: sumFinite(tools, 'usageMs'),
    totalElapsedMs: sumFinite(tools, 'elapsedMs'),
    latestTool: latestToolFrom(tools),
    lastUsedAt: lastToolUseAt(tools),
    tools: summarizeTools(tools),
  };
}

function buildToolMap({ tasks, subagentMap, toolUses, latestTools, now }) {
  let toolsByTask = mapByChat(toolUses, 'taskId');
  let toolsByChat = mapByChat(toolUses, 'chatId');
  let byTaskId = {};
  for (let task of tasks) {
    if (!task?.id) continue;
    let tools = toolsByTask.get(task.id) || [];
    byTaskId[task.id] = {
      ...buildToolBucket({ id: task.id, fieldName: 'taskId', tools }),
      chatId: task.chatId || null,
      agentSlug: task.agentSlug || null,
      resourceGroup: task.resourceGroup || null,
      status: task.status || 'unknown',
    };
  }

  let byChatId = {};
  for (let node of subagentMap.nodes || []) {
    if (!node?.chatId) continue;
    let tools = toolsByChat.get(node.chatId) || [];
    byChatId[node.chatId] = {
      ...buildToolBucket({ id: node.chatId, fieldName: 'chatId', tools }),
      name: node.name || '',
      agent: node.agent || null,
      taskIds: node.taskIds || [],
    };
  }

  return {
    schemaVersion: 1,
    recent: latestTools.map(summarizeLatestTool),
    byTaskId,
    byChatId,
    generatedAt: now,
    limits: {
      recent: TOOL_EVENT_LIMIT,
      tasks: TASK_LIMIT,
      chats: SUBAGENT_LIMIT,
      toolsPerTask: TOOL_BUCKET_LIMIT,
      toolsPerChat: TOOL_BUCKET_LIMIT,
    },
  };
}

function summarizeActivityTask(task = null) {
  if (!task) return null;
  return {
    id: task.id,
    chatId: task.chatId || null,
    status: task.status || 'unknown',
    agentSlug: task.agentSlug || null,
    resourceGroup: task.resourceGroup || null,
    elapsedMs: task.elapsedMs ?? null,
    toolCount: task.toolCount || 0,
    runningToolCount: task.runningToolCount || 0,
    latestTool: task.latestTool || null,
    lastActivityAt: task.lastActivityAt || null,
    liveness: task.liveness || null,
  };
}

function latestTaskForNode(node = {}, taskMap = {}) {
  let tasks = (node.taskIds || [])
    .map((id) => taskMap.byId?.[id])
    .filter(Boolean)
    .sort((a, b) => (normalizeTimestamp(b.lastActivityAt) || 0) - (normalizeTimestamp(a.lastActivityAt) || 0));
  return tasks[0] || null;
}

function activityStatus(node = {}) {
  if (node.runningTaskCount > 0 || node.runningToolCount > 0) return 'running';
  if (node.totalTaskCount > 0) return 'idle';
  return 'ready';
}

function summarizeActivityNode(node = {}, taskMap = {}) {
  let latestTask = latestTaskForNode(node, taskMap);
  return {
    chatId: node.chatId,
    parentChatId: node.parentChatId || null,
    root: Boolean(node.root),
    name: node.name || '',
    agent: node.agent || null,
    resourceGroup: node.resourceGroup || null,
    approvalMode: node.approvalMode || null,
    status: activityStatus(node),
    pendingTaskId: node.pendingTaskId || null,
    taskIds: node.taskIds || [],
    runningTaskCount: node.runningTaskCount || 0,
    totalTaskCount: node.totalTaskCount || 0,
    totalElapsedMs: node.totalElapsedMs || 0,
    toolCount: node.toolCount || 0,
    runningToolCount: node.runningToolCount || 0,
    toolDurationMs: node.toolDurationMs || 0,
    toolUsageMs: node.toolUsageMs || 0,
    latestTool: node.latestTool || null,
    latestTools: node.latestTools || [],
    latestTask: summarizeActivityTask(latestTask),
    liveness: node.liveness || null,
    lastActivityAt: node.lastActivityAt || null,
  };
}

function summarizeActivityHint(hint = {}) {
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

function buildActivityMap({
  rootChatId,
  primaryTaskId,
  subagentMap,
  taskMap,
  latestTools,
  usage,
  promptHintMap,
  stateError,
  system,
  now,
}) {
  let nodes = (subagentMap.nodes || []).map((node) => summarizeActivityNode(node, taskMap));
  return {
    schemaVersion: 1,
    rootChatId,
    primaryTaskId,
    generatedAt: now,
    stateError: stateError || null,
    summary: {
      runningTasks: usage.runningTasks || 0,
      totalTasks: usage.totalTasks || 0,
      completedTasks: usage.completedTasks || 0,
      subagents: usage.subagents || 0,
      toolUses: usage.toolUses || 0,
      totalTaskElapsedMs: usage.totalTaskElapsedMs || 0,
      toolDurationMs: usage.toolDurationMs || 0,
      toolUsageMs: usage.toolUsageMs || 0,
      longestElapsedMs: usage.longestElapsedMs ?? null,
      latestActivityAt: usage.latestActivityAt || null,
      liveness: usage.liveness || null,
      capacity: usage.capacity || null,
      tokens: usage.tokens ?? null,
      cost: usage.cost ?? null,
    },
    nodes,
    subagents: nodes.filter((node) => !rootChatId || node.chatId !== rootChatId),
    edges: subagentMap.edges || [],
    latestTools: latestTools.map(summarizeLatestTool),
    promptHints: (promptHintMap.hints || []).map(summarizeActivityHint),
    system,
    limits: {
      nodes: SUBAGENT_LIMIT,
      latestTools: TOOL_EVENT_LIMIT,
      promptHints: PROMPT_HINT_LIMIT,
      toolsPerNode: TOOL_BUCKET_LIMIT,
    },
  };
}

function summarizeUsage(tasks, runtimeResult, now = Date.now(), subagentCount = 0, toolUses = [], system = null) {
  let running = tasks.filter((task) => isRunningTaskStatus(task.status));
  let elapsedMs = tasks
    .map((task) => Number(task.elapsedMs))
    .filter(Number.isFinite);
  let toolDurations = toolUses
    .map((tool) => Number(tool.durationMs))
    .filter(Number.isFinite);
  let toolUsages = toolUses
    .map((tool) => Number(tool.usageMs))
    .filter(Number.isFinite);
  let stats = runtimeResult?.result?.stats || null;
  return {
    runningTasks: running.length,
    totalTasks: tasks.length,
    completedTasks: tasks.filter((task) => TASK_TERMINAL_STATUSES.has(task.status || '')).length,
    subagents: subagentCount,
    toolUses: toolUses.length,
    totalTaskElapsedMs: elapsedMs.reduce((sum, value) => sum + value, 0),
    toolDurationMs: toolDurations.reduce((sum, value) => sum + value, 0),
    toolUsageMs: toolUsages.reduce((sum, value) => sum + value, 0),
    longestElapsedMs: elapsedMs.length ? Math.max(...elapsedMs) : null,
    latestActivityAt: tasks
      .map(taskActivityTime)
      .filter(Boolean)
      .sort((a, b) => b - a)[0] || null,
    liveness: summarizeUsageLiveness(running),
    capacity: system?.capacity || null,
    tokens: stats?.total_tokens ?? stats?.tokens?.total ?? null,
    cost: stats?.cost ?? null,
    generatedAt: now,
  };
}

function summarizeUsageLiveness(runningTasks = []) {
  let warnings = runningTasks.filter((task) => task.liveness?.severity === 'warning');
  let noEvents = runningTasks.filter((task) => task.liveness?.state === 'no_events');
  let coldStarts = runningTasks.filter((task) => task.liveness?.state === 'cold_start');
  let quiet = runningTasks.filter((task) => task.liveness?.state === 'quiet');
  let highest = warnings[0]?.liveness || coldStarts[0]?.liveness || runningTasks[0]?.liveness || null;
  return {
    state: highest?.state || (runningTasks.length ? 'active' : 'idle'),
    severity: highest?.severity || 'normal',
    warningTaskCount: warnings.length,
    zeroEventTaskCount: noEvents.length + coldStarts.length,
    noEventTaskCount: noEvents.length,
    coldStartTaskCount: coldStarts.length,
    quietTaskCount: quiet.length,
  };
}

function finiteNumber(value) {
  let number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function summarizeSystemLoad(systemLoad = null, tasks = [], now = Date.now()) {
  if (!systemLoad || typeof systemLoad !== 'object') {
    return {
      schemaVersion: 1,
      available: false,
      generatedAt: now,
      capacity: {
        state: 'unknown',
        reason: 'task_state_missing_system_load',
        runningTaskCount: tasks.filter((task) => isRunningTaskStatus(task.status)).length,
      },
    };
  }

  let cpu = systemLoad.cpu || {};
  let memory = systemLoad.memory || {};
  let capacity = systemLoad.capacity || {};
  let runningTaskCount = finiteNumber(capacity.runningTaskCount)
    ?? tasks.filter((task) => isRunningTaskStatus(task.status)).length;
  return {
    schemaVersion: 1,
    available: true,
    generatedAt: now,
    agents: {
      total: finiteNumber(systemLoad.total) ?? 0,
      ours: finiteNumber(systemLoad.ours) ?? 0,
      external: finiteNumber(systemLoad.external) ?? 0,
    },
    cpu: {
      count: finiteNumber(cpu.count),
      loadAvg1m: finiteNumber(cpu.loadAvg1m),
      loadAvg5m: finiteNumber(cpu.loadAvg5m),
      loadAvg15m: finiteNumber(cpu.loadAvg15m),
      loadRatio1m: finiteNumber(cpu.loadRatio1m),
    },
    memory: {
      totalBytes: finiteNumber(memory.totalBytes),
      freeBytes: finiteNumber(memory.freeBytes),
      usedRatio: finiteNumber(memory.usedRatio),
    },
    process: {
      trackedChildren: finiteNumber(systemLoad.process?.trackedChildren) ?? finiteNumber(systemLoad.ours) ?? 0,
      staleProcessCount: finiteNumber(capacity.staleProcessCount) ?? 0,
    },
    capacity: {
      state: capacity.state || 'unknown',
      reason: capacity.reason || null,
      recommendedMaxParallelTasks: finiteNumber(capacity.recommendedMaxParallelTasks),
      runningTaskCount,
      trackedChildCount: finiteNumber(capacity.trackedChildCount) ?? finiteNumber(systemLoad.ours) ?? 0,
    },
    warning: typeof systemLoad.warning === 'string' ? compactResultSummary(systemLoad.warning) : null,
  };
}

function maxTimestamp(values = []) {
  let timestamps = values.map(normalizeTimestamp).filter(Boolean);
  return timestamps.length ? Math.max(...timestamps) : null;
}

function buildDelegationGraph({ subagentMap, taskMap, now }) {
  let nodes = (subagentMap.nodes || []).map((node) => ({
    id: node.chatId,
    type: 'chat',
    parentId: node.parentChatId || null,
    agent: node.agent || null,
    taskIds: node.taskIds || [],
    runningTaskCount: node.runningTaskCount || 0,
    totalTaskCount: node.totalTaskCount || 0,
    lastAnyEventAt: maxTimestamp([
      node.lastActivityAt,
      node.latestTool?.usedAt,
      node.latestTool?.completedAt,
      node.updatedAt,
    ]),
    liveness: node.liveness || null,
  }));

  let taskNodes = Object.values(taskMap.byId || {}).map((task) => ({
    id: task.id,
    type: 'task',
    parentId: task.parentTaskId || task.chatId || null,
    chatId: task.chatId || null,
    agent: task.agentSlug || null,
    status: task.status || 'unknown',
    lastAnyEventAt: maxTimestamp([
      task.lastActivityAt,
      task.lastEventAt,
      task.lastToolUsedAt,
      task.completedAt,
      task.startedAt,
    ]),
    liveness: task.liveness || null,
  }));

  return {
    schemaVersion: 1,
    generatedAt: now,
    nodes: [...nodes, ...taskNodes],
    edges: [
      ...(subagentMap.edges || []),
      ...(taskMap.edges || []),
    ],
    limits: {
      nodes: SUBAGENT_LIMIT + TASK_LIMIT,
    },
  };
}

function buildActivityTimeline({ tasks, latestTools, now }) {
  let taskEvents = tasks.map((task) => ({
    type: 'task.activity',
    at: taskActivityTime(task),
    taskId: task.id,
    chatId: task.chatId || null,
    status: task.status || 'unknown',
    agentSlug: task.agentSlug || null,
    liveness: task.liveness || null,
  }));
  let toolEvents = latestTools.map((tool) => ({
    type: tool.status === 'running' ? 'tool.started' : 'tool.completed',
    at: normalizeTimestamp(tool.completedAt || tool.estimatedCompletedAt || tool.usedAt),
    tool: summarizeLatestTool(tool),
    taskId: tool.taskId || null,
    chatId: tool.chatId || null,
  }));
  return {
    schemaVersion: 1,
    generatedAt: now,
    events: [...taskEvents, ...toolEvents]
      .filter((event) => event.at)
      .sort((a, b) => (b.at || 0) - (a.at || 0))
      .slice(0, TOOL_EVENT_LIMIT * 2),
    limits: {
      events: TOOL_EVENT_LIMIT * 2,
    },
  };
}

function summarizeParsedRuntimeResult(result = null) {
  if (!result || typeof result !== 'object') return null;
  let stats = result.stats || null;
  return {
    exitCode: result.exitCode ?? null,
    toolCallCount: Array.isArray(result.toolCalls) ? result.toolCalls.length : 0,
    toolResultCount: Array.isArray(result.toolResults) ? result.toolResults.length : 0,
    tokens: stats?.total_tokens ?? stats?.tokens?.total ?? null,
    cost: stats?.cost ?? null,
  };
}

function summarizeRuntime(runtime) {
  return {
    isError: runtime.isError,
    contentCount: runtime.content.length,
    parsedResultSummary: summarizeParsedRuntimeResult(runtime.result),
    eventCount: runtime.events.length,
  };
}

function promptHintTexts(promptHintMap = {}) {
  return (promptHintMap.hints || []).map(formatPromptHint).slice(0, 6);
}

function extractResourceGroupStatus(result = {}) {
  return parseResourceGroupDiagnostics(result?.content?.[0]?.text || '');
}

function summarizeStaleProcesses(staleProcesses = []) {
  let list = Array.isArray(staleProcesses) ? staleProcesses : [];
  return {
    count: list.length,
    taskIds: list.map((p) => p?.taskId).filter(Boolean).slice(0, STALE_PROCESS_TASK_ID_LIMIT),
  };
}

function buildRequestedTask({ taskId, runtimeTask, scopedTasks, now }) {
  if (!taskId) return null;
  let found = Boolean(runtimeTask);
  if (!found) {
    return {
      found: false,
      id: taskId,
      status: null,
      terminalStatus: null,
      liveness: null,
      unavailableReason: 'not_found',
      resultUnavailableReason: 'no_task_row',
    };
  }
  let taskStatus = runtimeTask.status || runtimeTask.type || 'unknown';
  let terminal = TASK_TERMINAL_STATUSES.has(taskStatus);
  let liveness = summarizeTaskLiveness({
    status: taskStatus,
    startedAt: runtimeTask.startedAt,
    completedAt: runtimeTask.completedAt,
    elapsedMs: runtimeTask.elapsedMs,
    eventCount: runtimeTask.eventCount ?? (Array.isArray(runtimeTask.events) ? runtimeTask.events.length : 0),
    lastEventAt: runtimeTask.lastEventAt,
  }, now);
  return {
    found: true,
    id: taskId,
    status: taskStatus,
    terminalStatus: terminal,
    liveness,
    unavailableReason: null,
    resultUnavailableReason: terminal ? 'task_terminal' : null,
  };
}

export function buildDevelopmentMap({
  sg,
  chatId = null,
  taskId = null,
  taskResult = null,
  taskState = null,
} = {}) {
  let now = Date.now();
  let chats = sg?.listChats?.() || [];
  let rootChat = chatId ? chats.find((chat) => chat?.id === chatId) || sg?.getChat?.(chatId) || null : null;
  let scopedChatIds = descendantChatIds(chats, chatId);
  let runtime = extractRuntimeResult(taskResult || {});
  let allTasks = applyRuntimeEventCounters(mergeTaskSnapshots(sg, taskState), runtime.events, taskId);
  let taskDescendants = collectTaskDescendants(allTasks, taskId);

  let rawScopedTasks = allTasks
    .filter((task) => taskBelongsToScope(task, scopedChatIds, taskId) || taskDescendants.has(task.id));
  let runtimeTask = taskId
    ? rawScopedTasks.find((task) => task.id === taskId) || allTasks.find((task) => task.id === taskId)
    : null;

  let scopedTasks = rawScopedTasks
    .map((task) => summarizeTask(task, now))
    .sort((a, b) => (normalizeTimestamp(b.startedAt) || 0) - (normalizeTimestamp(a.startedAt) || 0))
    .slice(0, TASK_LIMIT);

  let toolUses = collectToolUses(rawScopedTasks, runtime.events, {
    taskId,
    chatId,
    taskStatus: runtimeTask?.status || runtimeTask?.type || null,
    taskCompletedAt: runtimeTask?.completedAt || null,
    taskLastEventAt: runtimeTask?.lastEventAt || null,
  }, now, runtime.result);
  let latestTools = sortToolsByActivity(toolUses).slice(0, TOOL_EVENT_LIMIT);
  let subagentMap = buildSubagentMap({
    chats,
    scopedChatIds,
    rootChatId: chatId,
    tasks: scopedTasks,
    toolUses,
    now,
  });
  let subagents = subagentMap.nodes
    .filter((node) => !chatId || node.chatId !== chatId);
  let runningCount = scopedTasks.filter((task) => isRunningTaskStatus(task.status)).length;
  let taskMap = buildTaskMap({ tasks: scopedTasks, toolUses, now });
  let toolMap = buildToolMap({
    tasks: scopedTasks,
    subagentMap,
    toolUses,
    latestTools,
    now,
  });
  let system = summarizeSystemLoad(taskState?.systemLoad || null, scopedTasks, now);
  let usage = summarizeUsage(scopedTasks, runtime, now, subagents.length, toolUses, system);
  let promptHintArgs = {
    chatId,
    taskId,
    runtimeText: runtime.text,
    runningCount,
    latestTools,
    subagents,
    tasks: scopedTasks,
    workflowContext: workflowContextForChat(rootChat),
    now,
  };
  let promptHintMap = buildPromptHintMap(promptHintArgs);
  let stateError = taskState?.error || null;
  let activityMap = buildActivityMap({
    rootChatId: chatId,
    primaryTaskId: taskId,
    subagentMap,
    taskMap,
    latestTools,
    usage,
    promptHintMap,
    stateError,
    system,
    now,
  });
  let delegationGraph = buildDelegationGraph({ subagentMap, taskMap, now });
  let activityTimeline = buildActivityTimeline({ tasks: scopedTasks, latestTools, now });
  let staleProcesses = taskState?.staleProcesses || [];
  let requestedTask = buildRequestedTask({ taskId, runtimeTask, scopedTasks, now });

  return {
    schemaVersion: 1,
    stateError,
    rootChatId: chatId,
    primaryTaskId: taskId,
    requestedTask,
    subagents,
    subagentMap,
    tasks: scopedTasks,
    taskMap,
    latestTools,
    toolMap,
    delegationGraph,
    activityTimeline,
    system,
    usage,
    activityMap,
    staleProcesses: summarizeStaleProcesses(staleProcesses),
    promptHintMap,
    promptHints: promptHintTexts(promptHintMap),
    runtime: summarizeRuntime(runtime),
    resourceGroups: extractResourceGroupStatus(taskResult || {}),
  };
}

export function parseTaskStateResult(result = {}) {
  let parsed = parseJson(resultText(result));
  if (!parsed || typeof parsed !== 'object') return { tasks: [], staleProcesses: [] };
  return {
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    staleProcesses: Array.isArray(parsed.staleProcesses) ? parsed.staleProcesses : [],
    systemLoad: parsed.systemLoad && typeof parsed.systemLoad === 'object' ? parsed.systemLoad : null,
  };
}
