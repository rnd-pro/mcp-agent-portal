const TASK_TERMINAL_STATUSES = new Set(['done', 'error', 'cancelled', 'lost']);
const TOOL_EVENT_LIMIT = 8;
const TASK_LIMIT = 40;
const SUBAGENT_LIMIT = 40;

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

function compactDetail(args = {}) {
  let detail = args.file_path ?? args.path ?? args.file ?? args.query ?? args.symbol ?? args.command ?? args.url ?? '';
  if (typeof detail !== 'string' || !detail) return '';
  if (detail.startsWith('/') && detail.length > 48) return `...${detail.slice(-45)}`;
  return detail.length > 96 ? `${detail.slice(0, 93)}...` : detail;
}

function compactPrompt(prompt = '', limit = 160) {
  let text = String(prompt || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
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
    sessionId: task.sessionId || null,
    prompt: compactPrompt(task.prompt),
    pid: task.pid || null,
    startedAt: task.startedAt || null,
    completedAt: task.completedAt || null,
    elapsedMs,
    eventCount: task.eventCount ?? events.length,
    lastEventAt: task.lastEventAt || lastEvent?.ts || lastEvent?.timestamp || null,
    trackedChildren: task.trackedChildren || [],
    error: task.error || null,
  };
}

function normalizeToolEvents(tasks, runtimeEvents = []) {
  let events = [];
  for (let task of tasks) {
    for (let event of task.events || []) {
      events.push({ ...event, taskId: task.id, chatId: task.chatId || null });
    }
  }
  for (let event of runtimeEvents) events.push({ ...event });

  let toolUses = [];
  let resultsById = new Map();
  for (let event of events) {
    if (event.type === 'tool_result' && (event.tool_id || event.id)) {
      resultsById.set(event.tool_id || event.id, event);
    }
  }

  for (let event of events) {
    if (event.type !== 'tool_use' && event.type !== 'tool_call') continue;
    let name = toolName(event);
    let args = toolArguments(event);
    let result = (event.tool_id || event.id) ? resultsById.get(event.tool_id || event.id) : null;
    let startedAt = eventTimestamp(event);
    let completedAt = result ? eventTimestamp(result) : null;
    toolUses.push({
      taskId: event.taskId || null,
      chatId: event.chatId || null,
      name,
      detail: compactDetail(args),
      status: result?.status || (result ? 'done' : 'running'),
      startedAt: event.ts || event.timestamp || null,
      durationMs: startedAt && completedAt ? completedAt - startedAt : null,
    });
  }

  return toolUses
    .filter((event) => event.name)
    .slice(-TOOL_EVENT_LIMIT)
    .reverse();
}

function extractRuntimeHint(text = '') {
  let match = text.match(/\[INFO\]\s+\*\*([\s\S]*?)\*\*/);
  if (!match) return null;
  return match[1]
    .replace(/`get_task_result`/g, '`get_chat_task_result`')
    .replace(/\bget_task_result\b/g, 'get_chat_task_result')
    .trim();
}

function buildPromptHints({ chatId, taskId, runtimeText, runningCount }) {
  let hints = [];
  let runtimeHint = extractRuntimeHint(runtimeText);
  if (runtimeHint) hints.push(runtimeHint);
  if (taskId) {
    hints.push(`Poll through get_chat_task_result({ chatId: "${chatId || ''}", taskId: "${taskId}" }) no more than once every 2 minutes.`);
  }
  if (chatId) {
    hints.push(`Continue orchestration through resume_chat({ chatId: "${chatId}", prompt, files, context_mode: "auto" }).`);
    hints.push(`Create child subagent chats with parentChatId: "${chatId}" so the development map stays connected.`);
  }
  if (runningCount > 0) {
    hints.push('Keep doing independent local work while portal agents run; avoid idle polling.');
  }
  return [...new Set(hints)].slice(0, 6);
}

function summarizeUsage(tasks, runtimeResult, now = Date.now()) {
  let running = tasks.filter((task) => !TASK_TERMINAL_STATUSES.has(task.status || ''));
  let elapsedMs = tasks
    .map((task) => Number(task.elapsedMs))
    .filter(Number.isFinite);
  let stats = runtimeResult?.result?.stats || null;
  return {
    runningTasks: running.length,
    totalTasks: tasks.length,
    longestElapsedMs: elapsedMs.length ? Math.max(...elapsedMs) : null,
    latestActivityAt: tasks
      .map((task) => normalizeTimestamp(task.lastEventAt || task.completedAt || task.startedAt))
      .filter(Boolean)
      .sort((a, b) => b - a)[0] || null,
    tokens: stats?.total_tokens ?? stats?.tokens?.total ?? null,
    cost: stats?.cost ?? null,
    generatedAt: now,
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
  let scopedChatIds = descendantChatIds(chats, chatId);
  let runtime = extractRuntimeResult(taskResult || {});
  let allTasks = mergeTaskSnapshots(sg, taskState);
  let taskDescendants = collectTaskDescendants(allTasks, taskId);

  let rawScopedTasks = allTasks
    .filter((task) => taskBelongsToScope(task, scopedChatIds, taskId) || taskDescendants.has(task.id));

  let scopedTasks = rawScopedTasks
    .map((task) => summarizeTask(task, now))
    .sort((a, b) => (normalizeTimestamp(b.startedAt) || 0) - (normalizeTimestamp(a.startedAt) || 0))
    .slice(0, TASK_LIMIT);

  let subagents = chats
    .filter((chat) => chat?.id && scopedChatIds.has(chat.id) && (!chatId || chat.id !== chatId))
    .map((chat) => ({
      chatId: chat.id,
      parentChatId: chat.parentChatId || null,
      name: chat.name || '',
      agent: chat.agent || null,
      adapter: chat.adapter || null,
      resourceGroup: chat.resource_group || null,
      approvalMode: chat.approval_mode || null,
      pendingTaskId: chat.pendingTaskId || null,
      activeGoalId: chat.activeGoalId || null,
      sessionId: chat.sessionId || null,
      updatedAt: chat.updatedAt || null,
    }))
    .slice(0, SUBAGENT_LIMIT);

  let latestTools = normalizeToolEvents(rawScopedTasks, runtime.events);
  let runningCount = scopedTasks.filter((task) => !TASK_TERMINAL_STATUSES.has(task.status || '')).length;

  return {
    rootChatId: chatId,
    primaryTaskId: taskId,
    subagents,
    tasks: scopedTasks,
    latestTools,
    usage: summarizeUsage(scopedTasks, runtime, now),
    promptHints: buildPromptHints({
      chatId,
      taskId,
      runtimeText: runtime.text,
      runningCount,
    }),
    runtime: {
      isError: runtime.isError,
      content: runtime.content,
      parsedResult: runtime.result,
      eventCount: runtime.events.length,
    },
  };
}

export function parseTaskStateResult(result = {}) {
  let parsed = parseJson(resultText(result));
  if (!parsed || typeof parsed !== 'object') return { tasks: [], staleProcesses: [] };
  return {
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    staleProcesses: Array.isArray(parsed.staleProcesses) ? parsed.staleProcesses : [],
  };
}
