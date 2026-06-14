const TASK_TERMINAL_STATUSES = new Set(['done', 'error', 'cancelled', 'lost']);
const TOOL_EVENT_LIMIT = 8;
const TOOL_BUCKET_LIMIT = 5;
const TASK_LIMIT = 40;
const SUBAGENT_LIMIT = 40;
const PROMPT_HINT_LIMIT = 8;
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
    hasSession: Boolean(task.sessionId),
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

function collectToolUses(tasks, runtimeEvents = [], runtimeContext = {}, now = Date.now()) {
  let events = [];
  for (let task of tasks) {
    for (let event of task.events || []) {
      events.push({
        ...event,
        taskId: task.id,
        chatId: task.chatId || null,
        taskStatus: task.status || task.type || null,
      });
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
    let durationMs = startedAt && completedAt ? completedAt - startedAt : null;
    let taskTerminal = TASK_TERMINAL_STATUSES.has(event.taskStatus || '');
    toolUses.push({
      taskId: event.taskId || null,
      chatId: event.chatId || null,
      name,
      detail: compactDetail(args),
      status: result?.status || (result ? 'done' : taskTerminal ? event.taskStatus : 'running'),
      startedAt: usedAt,
      usedAt,
      completedAt: result?.ts || result?.timestamp || null,
      durationMs,
      elapsedMs: startedAt ? (durationMs ?? (taskTerminal ? null : now - startedAt)) : null,
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

function addPromptHint(hints, hint) {
  if (!hint?.id || hints.some((item) => item.id === hint.id)) return;
  hints.push({
    id: hint.id,
    category: hint.category || 'orchestration',
    label: hint.label || hint.id,
    prompt: compactPrompt(hint.prompt || '', 360),
    tool: hint.tool || null,
    arguments: hint.arguments || null,
    reason: compactPrompt(hint.reason || '', 220),
    chatId: hint.chatId || null,
    taskId: hint.taskId || null,
    agentSlug: hint.agentSlug || null,
    resourceGroup: hint.resourceGroup || null,
    priority: hint.priority || 'normal',
    source: hint.source || 'agent-portal',
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
      label: 'Agent Pool runtime hint',
      prompt: runtimeHint,
      reason: 'Forwarded from the internal Agent Pool running-task result.',
      chatId,
      taskId,
      agentSlug: latestTask?.agentSlug || null,
      resourceGroup: latestTask?.resourceGroup || null,
      source: 'agent-pool',
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
      reason: 'Refresh this chain without exposing raw Agent Pool tools.',
      chatId,
      taskId,
      agentSlug: latestTask?.agentSlug || null,
      resourceGroup: latestTask?.resourceGroup || null,
      priority: runningCount > 0 ? 'high' : 'normal',
    });
  }
  if (chatId) {
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
      prompt: `Inspect the latest tool activity (${latestTool.name}${latestTool.detail ? `: ${latestTool.detail}` : ''}) before deciding the next orchestration step.`,
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

function buildPromptHints(args) {
  return buildStructuredPromptHints(args).map(formatPromptHint).slice(0, 6);
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
    status: tool.status || 'unknown',
    usedAt: tool.usedAt || null,
    completedAt: tool.completedAt || null,
    durationMs: tool.durationMs ?? null,
    elapsedMs: tool.elapsedMs ?? null,
  };
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
    runningTaskCount: tasks.filter((task) => !TASK_TERMINAL_STATUSES.has(task.status || '')).length,
    totalTaskCount: tasks.length,
    totalElapsedMs: elapsedValues.reduce((sum, value) => sum + value, 0),
    toolCount: tools.length,
    runningToolCount: countRunningTools(tools),
    toolUsageMs: sumFinite(tools, 'durationMs'),
    latestTool,
    latestTools: summarizeTools(tools),
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
  let toolsByChat = mapByChat(toolUses);
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
      toolCount: tools.length,
      runningToolCount: countRunningTools(tools),
      toolUsageMs: sumFinite(tools, 'durationMs'),
      latestTool: latestToolFrom(tools),
      lastToolUsedAt: lastToolUseAt(tools),
      lastActivityAt: taskActivityTime(task),
    };
  }
  return {
    schemaVersion: 1,
    byId,
    runningIds: tasks
      .filter((task) => task?.id && !TASK_TERMINAL_STATUSES.has(task.status || ''))
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

  let toolUses = collectToolUses(rawScopedTasks, runtime.events, { taskId, chatId }, now);
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
  let runningCount = scopedTasks.filter((task) => !TASK_TERMINAL_STATUSES.has(task.status || '')).length;
  let taskMap = buildTaskMap({ tasks: scopedTasks, toolUses, now });
  let toolMap = buildToolMap({
    tasks: scopedTasks,
    subagentMap,
    toolUses,
    latestTools,
    now,
  });

  return {
    schemaVersion: 1,
    rootChatId: chatId,
    primaryTaskId: taskId,
    subagents,
    subagentMap,
    tasks: scopedTasks,
    taskMap,
    latestTools,
    toolMap,
    usage: summarizeUsage(scopedTasks, runtime, now, subagents.length, toolUses),
    promptHintMap: buildPromptHintMap({
      chatId,
      taskId,
      runtimeText: runtime.text,
      runningCount,
      latestTools,
      subagents,
      tasks: scopedTasks,
      now,
    }),
    promptHints: buildPromptHints({
      chatId,
      taskId,
      runtimeText: runtime.text,
      runningCount,
      latestTools,
      subagents,
      tasks: scopedTasks,
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
