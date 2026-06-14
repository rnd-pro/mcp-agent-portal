const TASK_TERMINAL_STATUSES = new Set(['done', 'error', 'cancelled', 'lost']);
const TOOL_EVENT_LIMIT = 8;
const TASK_LIMIT = 40;
const SUBAGENT_LIMIT = 40;
const RUNTIME_TEXT_LIMIT = 1200;

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

function compactRuntimeText(text = '', limit = RUNTIME_TEXT_LIMIT) {
  return compactPrompt(text, limit);
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

function collectToolUses(tasks, runtimeEvents = [], runtimeContext = {}) {
  let events = [];
  for (let task of tasks) {
    for (let event of task.events || []) {
      events.push({ ...event, taskId: task.id, chatId: task.chatId || null });
    }
  }
  for (let event of runtimeEvents) {
    events.push({
      taskId: event.taskId || runtimeContext.taskId || null,
      chatId: event.chatId || runtimeContext.chatId || null,
      ...event,
    });
  }

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
    let usedAt = event.ts || event.timestamp || null;
    toolUses.push({
      taskId: event.taskId || null,
      chatId: event.chatId || null,
      name,
      detail: compactDetail(args),
      status: result?.status || (result ? 'done' : 'running'),
      startedAt: usedAt,
      usedAt,
      completedAt: result?.ts || result?.timestamp || null,
      durationMs: startedAt && completedAt ? completedAt - startedAt : null,
    });
  }

  return toolUses.filter((event) => event.name);
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
    detail: tool.detail || '',
    status: tool.status || 'unknown',
    usedAt: tool.usedAt || null,
    durationMs: tool.durationMs ?? null,
  };
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

function latestToolByChat(toolUses = []) {
  let latest = new Map();
  for (let tool of toolUses) {
    if (!tool.chatId) continue;
    let current = latest.get(tool.chatId);
    if (!current || (toolUseTime(tool) || 0) >= (toolUseTime(current) || 0)) {
      latest.set(tool.chatId, tool);
    }
  }
  return latest;
}

function summarizeChatNode(chat, tasksByChat, toolsByChat, rootChatId, now) {
  let tasks = tasksByChat.get(chat.id) || [];
  let latestTool = toolsByChat.get(chat.id) || null;
  let activityTimes = [
    normalizeTimestamp(chat.updatedAt),
    ...tasks.map(taskActivityTime),
    toolUseTime(latestTool),
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
    sessionId: chat.sessionId || null,
    taskIds: tasks.map((task) => task.id).filter(Boolean),
    runningTaskCount: tasks.filter((task) => !TASK_TERMINAL_STATUSES.has(task.status || '')).length,
    totalTaskCount: tasks.length,
    totalElapsedMs: elapsedValues.reduce((sum, value) => sum + value, 0),
    latestTool: summarizeLatestTool(latestTool),
    lastActivityAt: activityTimes.length ? Math.max(...activityTimes) : null,
    updatedAt: chat.updatedAt || null,
    generatedAt: now,
  };
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
  let toolsByChat = latestToolByChat(toolUses);
  let nodes = chats
    .filter((chat) => chat?.id && scopedChatIds.has(chat.id))
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
    rootChatId,
    nodes,
    edges,
    tree: buildTree(nodes),
    generatedAt: now,
    limits: {
      nodes: SUBAGENT_LIMIT,
      tasks: TASK_LIMIT,
      latestTools: TOOL_EVENT_LIMIT,
    },
  };
}

function summarizeUsage(tasks, runtimeResult, now = Date.now(), subagentCount = 0, toolUses = []) {
  let running = tasks.filter((task) => !TASK_TERMINAL_STATUSES.has(task.status || ''));
  let elapsedMs = tasks
    .map((task) => Number(task.elapsedMs))
    .filter(Number.isFinite);
  let toolDurations = toolUses
    .map((tool) => Number(tool.durationMs))
    .filter(Number.isFinite);
  let stats = runtimeResult?.result?.stats || null;
  return {
    runningTasks: running.length,
    totalTasks: tasks.length,
    completedTasks: tasks.filter((task) => TASK_TERMINAL_STATUSES.has(task.status || '')).length,
    subagents: subagentCount,
    toolUses: toolUses.length,
    totalTaskElapsedMs: elapsedMs.reduce((sum, value) => sum + value, 0),
    toolUsageMs: toolDurations.reduce((sum, value) => sum + value, 0),
    longestElapsedMs: elapsedMs.length ? Math.max(...elapsedMs) : null,
    latestActivityAt: tasks
      .map(taskActivityTime)
      .filter(Boolean)
      .sort((a, b) => b - a)[0] || null,
    tokens: stats?.total_tokens ?? stats?.tokens?.total ?? null,
    cost: stats?.cost ?? null,
    generatedAt: now,
  };
}

function summarizeParsedRuntimeResult(result = null) {
  if (!result || typeof result !== 'object') return null;
  let stats = result.stats || null;
  return {
    exitCode: result.exitCode ?? null,
    responsePreview: compactRuntimeText(result.response || ''),
    toolCallCount: Array.isArray(result.toolCalls) ? result.toolCalls.length : 0,
    toolResultCount: Array.isArray(result.toolResults) ? result.toolResults.length : 0,
    tokens: stats?.total_tokens ?? stats?.tokens?.total ?? null,
    cost: stats?.cost ?? null,
  };
}

function summarizeRuntime(runtime) {
  return {
    isError: runtime.isError,
    textPreview: compactRuntimeText(runtime.text),
    contentCount: runtime.content.length,
    parsedResultSummary: summarizeParsedRuntimeResult(runtime.result),
    eventCount: runtime.events.length,
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

  let toolUses = collectToolUses(rawScopedTasks, runtime.events, { taskId, chatId });
  let latestTools = toolUses.slice(-TOOL_EVENT_LIMIT).reverse();
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
  let runningCount = scopedTasks.filter((task) => !TASK_TERMINAL_STATUSES.has(task.status || '')).length;

  return {
    rootChatId: chatId,
    primaryTaskId: taskId,
    subagents,
    subagentMap,
    tasks: scopedTasks,
    latestTools,
    usage: summarizeUsage(scopedTasks, runtime, now, subagents.length, toolUses),
    promptHints: buildPromptHints({
      chatId,
      taskId,
      runtimeText: runtime.text,
      runningCount,
    }),
    runtime: summarizeRuntime(runtime),
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
