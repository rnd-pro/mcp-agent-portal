import { graphModelToCanvasGraphModel } from 'symbiote-ui/graph';

const NODE_COLORS = {
  goal: '#7E57C2',
  agent: '#20A4F3',
  childAgent: '#1AA187',
  parallel: '#00ACC1',
  merge: '#26A69A',
  prompt: '#5C6BC0',
  response: '#26A69A',
  task: '#EC407A',
  tool: '#F9A825',
  hint: '#8E8D3A',
  file: '#8EA4B8',
  error: '#D64545',
  fallback: '#EF6C00',
};
const DEVELOPMENT_TASK_LIMIT = 24;
const DEVELOPMENT_TOOL_LIMIT = 12;
const DEVELOPMENT_HINT_LIMIT = 6;

const FILE_EXT_RE = /\.(?:[cm]?js|jsx|ts|tsx|css|scss|html|json|md|mdx|ya?ml|toml|txt|csv|py|sh|go|rs|java|kt|swift|rb|php|sql|svg|png|jpe?g|gif|webp)(?::\d+)?$/i;
const FILE_FIELD_RE = /(?:^|_)(?:file|files|path|paths|filepath|filepaths|target|targets)(?:_|$)/i;
const TEXT_FILE_RE = /(?:^|[\s"'`(])((?:\.{1,2}\/|\/|[A-Za-z0-9_.-]+\/)[A-Za-z0-9_./@-]+\.(?:[cm]?js|jsx|ts|tsx|css|scss|html|json|md|mdx|ya?ml|toml|txt|csv|py|sh|go|rs|java|kt|swift|rb|php|sql|svg|png|jpe?g|gif|webp)(?::\d+)?)/gi;

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeId(value, fallback = 'item') {
  let text = normalizeText(value) || fallback;
  return text.replace(/\s+/g, ' ').slice(0, 180);
}

function normalizeAgentSlug(value) {
  return normalizeText(value).toLowerCase();
}

function safeHexColor(value) {
  let text = normalizeText(value);
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(text) ? text : '';
}

function buildAgentIndex(agents = []) {
  let index = new Map();
  for (let agent of asArray(agents)) {
    let key = normalizeAgentSlug(agent.slug || agent.name || agent.agent);
    if (key) index.set(key, agent);
  }
  return index;
}

function resolveAgentMeta(chat = {}, agentIndex = new Map()) {
  let key = normalizeAgentSlug(chat.agent || chat.agent_slug || chat.agentSlug || chat.name);
  return key ? agentIndex.get(key) || null : null;
}

function resolveAgentColor(chat = {}, agentIndex, fallback) {
  let meta = resolveAgentMeta(chat, agentIndex);
  return safeHexColor(chat.agentColor || chat.agent_color)
    || safeHexColor(meta?.color)
    || fallback;
}

function resolveAgentIcon(chat = {}, agentIndex, fallback = 'hub') {
  let meta = resolveAgentMeta(chat, agentIndex);
  return normalizeText(chat.agentIcon || chat.agent_icon || meta?.icon) || fallback;
}

function resolveToolIcon(toolName = '') {
  let name = normalizeText(toolName).toLowerCase();
  if (/(shell|terminal|exec|command|zsh|bash|sh\b)/.test(name)) return 'terminal';
  if (/(test|verify|check|audit|lint)/.test(name)) return 'checklist';
  if (/(delegate|resume|goal|mcp)/.test(name)) return 'sync';
  if (/(skeleton|graph|dependency|context|search|find|rg|grep|read|open|get|list)/.test(name)) return 'account_tree';
  if (/(apply_patch|write|edit|save|create|delete|update|build)/.test(name)) return 'build';
  return 'build';
}

function compactLabel(value, fallback = '') {
  let text = normalizeText(value);
  if (!text) return fallback;
  if (text.length <= 44) return text;
  return `${text.slice(0, 18)}...${text.slice(-20)}`;
}

function formatDurationMs(value) {
  let ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  let seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds >= 10 ? 0 : 1)}s`;
  let minutes = Math.floor(seconds / 60);
  let rest = Math.round(seconds % 60);
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

function formatProfile(profile = {}) {
  let provider = profile.provider || 'provider';
  let model = profile.model || 'default';
  return `${provider}/${model}`;
}

function fileLooksUseful(value) {
  let text = normalizeText(value);
  if (!text || text.length > 260) return false;
  if (/^(?:https?:|data:|blob:)/i.test(text)) return false;
  if (text.includes('\n')) return false;
  return FILE_EXT_RE.test(text) || text.startsWith('.agent-portal/') || text.startsWith('web/') || text.startsWith('src/') || text.startsWith('test/');
}

function normalizeFilePath(value) {
  let text = normalizeText(value)
    .replace(/^["'`]+|["'`,.;)]+$/g, '')
    .replace(/:\d+$/, '');
  return fileLooksUseful(text) ? text : '';
}

function addTextFileRefs(text, refs) {
  let input = normalizeText(text);
  if (!input) return;
  for (let match of input.matchAll(TEXT_FILE_RE)) {
    let file = normalizeFilePath(match[1]);
    if (file) refs.add(file);
  }
}

function collectFileRefs(value, refs = new Set(), keyHint = '') {
  if (value == null) return refs;

  if (typeof value === 'string') {
    let file = FILE_FIELD_RE.test(keyHint) ? normalizeFilePath(value) : '';
    if (file) refs.add(file);
    addTextFileRefs(value, refs);
    return refs;
  }

  if (Array.isArray(value)) {
    for (let item of value) collectFileRefs(item, refs, keyHint);
    return refs;
  }

  if (typeof value !== 'object') return refs;

  for (let [key, child] of Object.entries(value)) {
    collectFileRefs(child, refs, key);
  }
  return refs;
}

function classifyFileAccess(toolName, input = {}) {
  let text = `${toolName} ${JSON.stringify(input)}`.toLowerCase();
  if (/(apply_patch|write|edit|save|create|delete|rm |mv |touch|mkdir|update)/.test(text)) return 'write';
  if (/(read|cat |sed |rg |grep|open|get|list|inspect|test|node --test)/.test(text)) return 'read';
  return 'touch';
}

function detectToolStatus(tool = {}) {
  if (tool.streaming) return 'running';
  let resultText = normalizeText(tool.result ?? tool.output ?? '');
  if (!resultText && tool.result == null) return 'pending';
  if (/error|failed|exception|traceback|isError/i.test(resultText)) return 'error';
  return 'done';
}

function addUnique(list, item, seen, key) {
  if (seen.has(key)) return;
  seen.add(key);
  list.push(item);
}

function makeNode({ id, kind, label, type, color, icon = '', width = 156, height = 42, state = {}, params = {}, metadata = {} }) {
  return {
    id,
    kind,
    label,
    state,
    params,
    metadata,
    children: [],
    design: {
      component: 'graph-node',
      variant: type,
      width,
      height,
      color,
      ...(icon ? { icon } : {}),
      canvas: {
        description: metadata.description,
        ...(icon ? { icon } : {}),
      },
    },
  };
}

function makeEdge({ from, to, kind, label, params = {} }) {
  return {
    id: `${from}:out->${to}:in:${kind}:${label || ''}`,
    kind,
    label,
    source: { nodeId: from, port: 'out' },
    target: { nodeId: to, port: 'in' },
    params,
  };
}

function parseFallbackMessage(message = {}) {
  let text = normalizeText(message.text || message.content);
  let match = text.match(/^Provider fallback:\s*(.+?)\s*->\s*(.+?)(?:\.\s*Reason:\s*(.+))?$/i);
  if (!match) return null;
  return {
    from: match[1],
    to: match[2],
    reason: match[3] || '',
  };
}

function messageText(message = {}) {
  let direct = normalizeText(message.text ?? message.content ?? message.message);
  if (direct) return direct;
  let parts = asArray(message.parts)
    .map((part) => {
      if (typeof part === 'string') return part;
      if (/tool/i.test(normalizeText(part?.type))) return '';
      return part?.text ?? part?.content ?? '';
    })
    .filter(Boolean);
  return normalizeText(parts.join(' '));
}

function normalizeMessageRole(role) {
  let text = normalizeText(role).toLowerCase();
  if (text === 'assistant') return 'agent';
  if (text === 'user' || text === 'agent') return text;
  return '';
}

function messageWindowStart(chat = {}) {
  let value = chat?.messageWindow?.startIndex ?? chat?.messageWindow?.start ?? chat?.messageStart ?? 0;
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function collectMessageTools(message = {}, index = 0) {
  let tools = [];
  if (message.role === 'tool') {
    tools.push({
      key: `tool:${index}`,
      name: message.name || message.tool || message.toolName || 'tool',
      input: message.input ?? message.arguments ?? message.args ?? {},
      result: message.result ?? message.output ?? null,
      streaming: Boolean(message.streaming),
    });
  }

  for (let partIndex = 0; partIndex < asArray(message.parts).length; partIndex += 1) {
    let part = message.parts[partIndex];
    let type = normalizeText(part?.type);
    if (!/tool/i.test(type)) continue;
    if (/result|output/i.test(type)) continue;
    tools.push({
      key: `part:${index}:${partIndex}:${part.id || part.tool_call_id || part.name || 'tool'}`,
      name: part.name || part.tool || part.tool_name || part.function?.name || 'tool',
      input: part.input ?? part.arguments ?? part.args ?? part.parameters ?? part.function?.arguments ?? {},
      result: part.result ?? part.output ?? null,
      streaming: Boolean(part.streaming),
    });
  }
  return tools;
}

function collectChatProcessEvents(chat = {}, ownerNodeId, scopeKey = 'root') {
  let events = [];
  let messages = asArray(chat.messages);
  let chatId = chat?.id || null;
  let startIndex = messageWindowStart(chat);
  for (let index = 0; index < messages.length; index += 1) {
    let messageIndex = startIndex + index;
    let message = messages[index] || {};
    let role = normalizeMessageRole(message.role);
    let text = messageText(message);

    if (role && text) {
      events.push({
        type: 'message',
        id: `${scopeKey}:message:${messageIndex}:${role}`,
        ownerNodeId,
        chatId,
        role,
        text,
        index: messageIndex,
        windowIndex: index,
      });
    }

    for (let tool of collectMessageTools(message, messageIndex)) {
      events.push({
        type: 'tool',
        id: `${scopeKey}:${tool.key}`,
        ownerNodeId,
        chatId,
        name: tool.name,
        input: tool.input,
        result: tool.result,
        streaming: tool.streaming,
        index: messageIndex,
        windowIndex: index,
      });
    }

    let fallback = parseFallbackMessage(message);
    if (fallback) {
      events.push({
        type: 'fallback',
        id: `${scopeKey}:fallback:${messageIndex}`,
        ownerNodeId,
        chatId,
        index: messageIndex,
        windowIndex: index,
        ...fallback,
      });
    }
  }
  return events;
}

function getChatAgentLabel(chat = {}, fallback = 'orchestrator') {
  return chat.agent || chat.agent_slug || chat.name || fallback;
}

function agentNodeId(chatId, agent = 'agent') {
  return `agent:${normalizeId(chatId)}:${normalizeId(agent, 'agent')}`;
}

function normalizeDevelopmentMap(map = null) {
  return map && typeof map === 'object' && !Array.isArray(map) && map.schemaVersion === 1
    ? map
    : null;
}

function developmentMapAgentLabel(node = {}, fallback = 'agent') {
  return node.agent || node.name || fallback;
}

function developmentMapChats(rootChat = {}, developmentMap = null) {
  let map = normalizeDevelopmentMap(developmentMap);
  if (!map) return [];
  let rootId = rootChat.id || map.rootChatId || '';
  return asArray(map.subagentMap?.nodes)
    .filter(node => node?.chatId && node.chatId !== rootId)
    .map((node) => ({
      id: node.chatId,
      parentChatId: node.parentChatId || rootId || null,
      name: node.name || developmentMapAgentLabel(node, 'Agent'),
      agent: node.agent || node.name || null,
      resource_group: node.resourceGroup || null,
      pendingTaskId: node.pendingTaskId || null,
      lastTaskStatus: node.runningTaskCount > 0 ? 'running' : (node.totalTaskCount > 0 ? 'done' : 'ready'),
      updatedAt: node.updatedAt || node.lastActivityAt || null,
      developmentMapNode: node,
    }));
}

function buildChildChats(rootChat = {}, chats = [], childChats = []) {
  let rootId = rootChat?.id || '';
  let byId = new Map();
  for (let chat of [...asArray(chats), ...asArray(childChats)]) {
    if (!chat?.id || chat.id === rootId) continue;
    byId.set(chat.id, { ...(byId.get(chat.id) || {}), ...chat });
  }
  return [...byId.values()]
    .filter(chat => chat.parentChatId === rootId)
    .sort((a, b) => (a.createdAt || a.updatedAt || 0) - (b.createdAt || b.updatedAt || 0));
}

function toolTimingSummary(tool = {}) {
  let duration = formatDurationMs(tool.usageMs ?? tool.elapsedMs ?? tool.durationMs);
  return [tool.status, duration, tool.timingSource].filter(Boolean).join(' / ');
}

export function buildAgentProcessGraphModel({ chat = null, chats = [], childChats = [], agents = [], developmentMap = null } = {}) {
  let nodes = [];
  let edges = [];
  let seenNodes = new Set();
  let seenEdges = new Set();
  let map = normalizeDevelopmentMap(developmentMap);
  let rootChat = asObject(chat);
  if (!rootChat.id && map?.rootChatId) rootChat = { id: map.rootChatId, ...rootChat };
  let agentIndex = buildAgentIndex(agents);
  let rootChatId = normalizeId(rootChat.id, 'active');
  let rootAgentId = agentNodeId(rootChatId, getChatAgentLabel(rootChat, 'orchestrator'));
  let rootAgentIcon = resolveAgentIcon(rootChat, agentIndex, 'hub');
  let mapChats = developmentMapChats(rootChat, map);
  let mapNodeByChatId = new Map(asArray(map?.subagentMap?.nodes).map(node => [node.chatId, node]));

  const addNode = (node) => addUnique(nodes, node, seenNodes, node.id);
  const addEdge = (edge) => addUnique(edges, edge, seenEdges, edge.id);
  const agentIdForChat = (chatId, fallback = 'agent') => {
    if (!chatId) return rootAgentId;
    let mapNode = mapNodeByChatId.get(chatId);
    if (mapNode) return agentNodeId(chatId, developmentMapAgentLabel(mapNode, fallback));
    let knownChat = [rootChat, ...asArray(chats), ...asArray(childChats), ...mapChats]
      .find(item => item?.id === chatId);
    return agentNodeId(chatId, getChatAgentLabel(knownChat || {}, fallback));
  };

  addNode(makeNode({
    id: rootAgentId,
    kind: 'agent.process.agent',
    label: compactLabel(getChatAgentLabel(rootChat), 'orchestrator'),
    type: 'agent',
    color: resolveAgentColor(rootChat, agentIndex, NODE_COLORS.agent),
    icon: rootAgentIcon,
    state: { status: rootChat.pendingTaskId || map?.usage?.runningTasks ? 'running' : 'ready' },
    params: {
      chatId: rootChat.id || null,
      agent: rootChat.agent || null,
      agentIcon: rootAgentIcon,
      resource_group: rootChat.resource_group || null,
      provider: rootChat.provider || null,
      model: rootChat.model || null,
    },
  }));

  if (rootChat.activeGoal || rootChat.activeGoalId) {
    let goal = rootChat.activeGoal || {};
    let goalId = goal.id || rootChat.activeGoalId;
    let goalNodeId = `goal:${normalizeId(goalId, 'active-goal')}`;
    addNode(makeNode({
      id: goalNodeId,
      kind: 'agent.process.goal',
      label: compactLabel(goal.title || goalId, 'Goal'),
      type: 'goal',
      color: NODE_COLORS.goal,
      icon: 'track_changes',
      state: { status: goal.status || 'active' },
      params: { goalId },
    }));
    addEdge(makeEdge({ from: rootAgentId, to: goalNodeId, kind: 'agent.process.goal', label: 'goal' }));
  }

  let childList = buildChildChats(rootChat, [...asArray(chats), ...mapChats], [...asArray(childChats), ...mapChats]);
  let parallelNodeId = null;
  let mergeNodeId = null;
  if (childList.length > 1) {
    parallelNodeId = `parallel:${rootChatId}:subagents`;
    mergeNodeId = `merge:${rootChatId}:subagents`;
    addNode(makeNode({
      id: parallelNodeId,
      kind: 'agent.process.parallelBatch',
      label: `${childList.length} parallel agents`,
      type: 'parallel',
      color: NODE_COLORS.parallel,
      icon: 'sync',
      width: 164,
      height: 40,
      state: { status: childList.some(child => child.pendingTaskId) ? 'running' : 'active' },
      params: { childChatCount: childList.length },
    }));
    addNode(makeNode({
      id: mergeNodeId,
      kind: 'agent.process.merge',
      label: 'Merge sub-agent results',
      type: 'merge',
      color: NODE_COLORS.merge,
      icon: 'merge',
      width: 164,
      height: 40,
      state: { status: childList.every(child => child.lastTaskStatus === 'done') ? 'done' : 'waiting' },
      params: { childChatCount: childList.length },
    }));
    addEdge(makeEdge({ from: rootAgentId, to: parallelNodeId, kind: 'agent.process.parallelStart', label: 'parallel' }));
    addEdge(makeEdge({ from: mergeNodeId, to: rootAgentId, kind: 'agent.process.parallelMerge', label: 'merge' }));
  }
  for (let child of childList) {
    let childAgent = getChatAgentLabel(child, 'agent');
    let childNodeId = agentNodeId(child.id, childAgent);
    let childAgentIcon = resolveAgentIcon(child, agentIndex, 'smart_toy');
    addNode(makeNode({
      id: childNodeId,
      kind: 'agent.process.childAgent',
      label: compactLabel(childAgent, child.name || 'Agent'),
      type: 'child-agent',
      color: resolveAgentColor(child, agentIndex, NODE_COLORS.childAgent),
      icon: childAgentIcon,
      state: { status: child.pendingTaskId ? 'running' : child.lastTaskStatus || 'delegated' },
      params: {
        chatId: child.id,
        parentChatId: child.parentChatId,
        agent: child.agent || null,
        agentIcon: childAgentIcon,
        resource_group: child.resource_group || null,
      },
    }));
    addEdge(makeEdge({
      from: parallelNodeId || rootAgentId,
      to: childNodeId,
      kind: 'agent.process.delegate',
      label: parallelNodeId ? 'parallel delegate' : 'delegate',
    }));
    if (mergeNodeId) {
      addEdge(makeEdge({ from: childNodeId, to: mergeNodeId, kind: 'agent.process.parallelResult', label: child.lastTaskStatus || 'result' }));
    }
  }

  if (map) {
    for (let node of asArray(map.subagentMap?.nodes)) {
      if (!node?.chatId || node.chatId === rootChat.id) continue;
      let nodeId = agentIdForChat(node.chatId, 'agent');
      addNode(makeNode({
        id: nodeId,
        kind: 'agent.process.childAgent',
        label: compactLabel(developmentMapAgentLabel(node, 'Agent'), node.name || 'Agent'),
        type: 'child-agent',
        color: NODE_COLORS.childAgent,
        icon: 'smart_toy',
        state: { status: node.runningTaskCount > 0 ? 'running' : 'ready' },
        params: {
          chatId: node.chatId,
          parentChatId: node.parentChatId || null,
          agent: node.agent || null,
          resource_group: node.resourceGroup || null,
          taskIds: asArray(node.taskIds),
          toolCount: node.toolCount || 0,
          toolUsageMs: node.toolUsageMs || 0,
          source: 'developmentMap',
        },
      }));
    }
    for (let edge of asArray(map.subagentMap?.edges)) {
      if (!edge?.from || !edge.to) continue;
      addEdge(makeEdge({
        from: agentIdForChat(edge.from, 'orchestrator'),
        to: agentIdForChat(edge.to, 'agent'),
        kind: 'agent.process.developmentMapDelegate',
        label: 'delegate',
      }));
    }
  }

  let allEvents = [
    ...collectChatProcessEvents(rootChat, rootAgentId, rootChatId),
    ...childList.flatMap((child) => collectChatProcessEvents(child, agentNodeId(child.id, getChatAgentLabel(child, 'agent')), normalizeId(child.id))),
  ];

  let fileNodeIds = new Map();
  const ensureFileNode = (file, sourceEvent = null) => {
    let path = normalizeFilePath(file);
    if (!path) return '';
    if (fileNodeIds.has(path)) return fileNodeIds.get(path);
    let nodeId = `file:${path}`;
    fileNodeIds.set(path, nodeId);
    addNode(makeNode({
      id: nodeId,
      kind: 'agent.process.file',
      label: compactLabel(path.split('/').pop() || path, path),
      type: 'file',
      color: NODE_COLORS.file,
      icon: 'description',
      width: 150,
      height: 36,
      params: {
        path,
        sourceChatId: sourceEvent?.chatId || null,
        sourceMessageIndex: sourceEvent?.index ?? null,
        sourceEventType: sourceEvent?.type || null,
      },
      metadata: { description: path },
    }));
    return nodeId;
  };

  for (let event of allEvents) {
    if (event.type === 'message') {
      let messageId = `message:${normalizeId(event.id)}`;
      let isPrompt = event.role === 'user';
      let preview = normalizeText(event.text).slice(0, 280);
      addNode(makeNode({
        id: messageId,
        kind: 'agent.process.message',
        label: compactLabel(preview, isPrompt ? 'prompt' : 'response'),
        type: isPrompt ? 'prompt' : 'response',
        color: isPrompt ? NODE_COLORS.prompt : NODE_COLORS.response,
        icon: 'chat',
        width: 168,
        height: 38,
        state: { status: isPrompt ? 'prompt' : 'response' },
        params: {
          role: event.role,
          preview,
          chatId: event.chatId || null,
          messageIndex: event.index,
          eventType: event.type,
        },
        metadata: { description: preview },
      }));
      addEdge(makeEdge({
        from: event.ownerNodeId,
        to: messageId,
        kind: isPrompt ? 'agent.process.prompt' : 'agent.process.response',
        label: isPrompt ? 'prompt' : 'response',
      }));
    } else if (event.type === 'tool') {
      let toolId = `tool:${normalizeId(event.id)}`;
      let status = detectToolStatus(event);
      addNode(makeNode({
        id: toolId,
        kind: 'agent.process.tool',
        label: compactLabel(event.name, 'tool'),
        type: 'tool',
        color: NODE_COLORS.tool,
        icon: resolveToolIcon(event.name),
        state: { status },
        params: {
          name: event.name,
          input: event.input,
          result: event.result,
          chatId: event.chatId || null,
          messageIndex: event.index,
          eventType: event.type,
        },
      }));
      addEdge(makeEdge({ from: event.ownerNodeId, to: toolId, kind: 'agent.process.toolCall', label: event.name }));

      let access = classifyFileAccess(event.name, event.input);
      for (let file of collectFileRefs({ input: event.input, result: event.result })) {
        let fileNodeId = ensureFileNode(file, event);
        if (!fileNodeId) continue;
        addEdge(makeEdge({ from: toolId, to: fileNodeId, kind: `agent.process.file.${access}`, label: access }));
      }
    } else if (event.type === 'fallback') {
      let fallbackId = `fallback:${normalizeId(event.id)}`;
      addNode(makeNode({
        id: fallbackId,
        kind: 'agent.process.providerFallback',
        label: compactLabel(`${event.from} -> ${event.to}`, 'fallback'),
        type: 'fallback',
        color: NODE_COLORS.fallback,
        icon: 'sync_problem',
        state: { status: 'fallback' },
        params: {
          from: event.from,
          to: event.to,
          reason: event.reason,
          chatId: event.chatId || null,
          messageIndex: event.index,
          eventType: event.type,
        },
        metadata: { description: event.reason },
      }));
      addEdge(makeEdge({ from: event.ownerNodeId, to: fallbackId, kind: 'agent.process.providerFallback', label: 'fallback' }));
    }
  }

  if (map) {
    let taskNodeIds = new Map();
    for (let task of Object.values(asObject(map.taskMap?.byId)).slice(0, DEVELOPMENT_TASK_LIMIT)) {
      if (!task?.id) continue;
      let taskNodeId = `task:${normalizeId(task.id)}`;
      taskNodeIds.set(task.id, taskNodeId);
      let elapsed = formatDurationMs(task.elapsedMs);
      let toolUsage = formatDurationMs(task.toolUsageMs);
      addNode(makeNode({
        id: taskNodeId,
        kind: 'agent.process.task',
        label: compactLabel(`${String(task.id).slice(0, 8)} ${task.status || ''}`, 'task'),
        type: 'task',
        color: NODE_COLORS.task,
        icon: 'timer',
        width: 156,
        height: 38,
        state: { status: task.status || 'unknown' },
        params: {
          taskId: task.id,
          chatId: task.chatId || null,
          status: task.status || 'unknown',
          elapsedMs: task.elapsedMs ?? null,
          toolCount: task.toolCount || 0,
          toolUsageMs: task.toolUsageMs || 0,
          latestTool: task.latestTool?.name || null,
          source: 'developmentMap',
        },
        metadata: { description: [elapsed, toolUsage ? `${toolUsage} tools` : ''].filter(Boolean).join(' / ') },
      }));
      addEdge(makeEdge({
        from: agentIdForChat(task.chatId, 'orchestrator'),
        to: taskNodeId,
        kind: 'agent.process.task',
        label: task.status || 'task',
      }));
    }

    for (let [index, tool] of asArray(map.latestTools).slice(0, DEVELOPMENT_TOOL_LIMIT).entries()) {
      if (!tool?.name) continue;
      let toolNodeId = `latest-tool:${normalizeId(tool.taskId || tool.chatId || 'development')}:${index}:${normalizeId(tool.name, 'tool')}`;
      let ownerNodeId = taskNodeIds.get(tool.taskId) || agentIdForChat(tool.chatId, 'orchestrator');
      addNode(makeNode({
        id: toolNodeId,
        kind: 'agent.process.latestTool',
        label: compactLabel(tool.name, 'tool'),
        type: 'tool',
        color: NODE_COLORS.tool,
        icon: resolveToolIcon(tool.name),
        width: 156,
        height: 38,
        state: { status: tool.status || 'unknown' },
        params: {
          name: tool.name,
          detail: tool.detail || '',
          status: tool.status || 'unknown',
          chatId: tool.chatId || null,
          taskId: tool.taskId || null,
          durationMs: tool.durationMs ?? null,
          elapsedMs: tool.elapsedMs ?? null,
          usageMs: tool.usageMs ?? null,
          timingSource: tool.timingSource || 'unknown',
          timingEstimated: Boolean(tool.timingEstimated),
          source: 'developmentMap',
        },
        metadata: { description: toolTimingSummary(tool) },
      }));
      addEdge(makeEdge({
        from: ownerNodeId,
        to: toolNodeId,
        kind: 'agent.process.latestTool',
        label: toolTimingSummary(tool) || 'tool',
      }));
    }

    for (let hint of asArray(map.promptHintMap?.hints).slice(0, DEVELOPMENT_HINT_LIMIT)) {
      if (!hint?.id) continue;
      let hintNodeId = `prompt-hint:${normalizeId(hint.id)}`;
      addNode(makeNode({
        id: hintNodeId,
        kind: 'agent.process.promptHint',
        label: compactLabel(hint.label || hint.id, 'hint'),
        type: 'hint',
        color: NODE_COLORS.hint,
        icon: 'tips_and_updates',
        width: 162,
        height: 38,
        state: { status: hint.priority || 'normal' },
        params: {
          id: hint.id,
          category: hint.category || null,
          tool: hint.tool || null,
          priority: hint.priority || 'normal',
          chatId: hint.chatId || null,
          taskId: hint.taskId || null,
          source: 'developmentMap',
        },
        metadata: { description: hint.reason || '' },
      }));
      addEdge(makeEdge({
        from: agentIdForChat(hint.chatId, 'orchestrator'),
        to: hintNodeId,
        kind: 'agent.process.promptHint',
        label: hint.tool || hint.category || 'hint',
      }));
    }

    if (map.stateError) {
      let errorNodeId = `development-map-error:${normalizeId(map.stateError, 'state-error')}`;
      addNode(makeNode({
        id: errorNodeId,
        kind: 'agent.process.stateError',
        label: compactLabel(map.stateError, 'state error'),
        type: 'fallback',
        color: NODE_COLORS.error,
        icon: 'report_problem',
        width: 174,
        height: 40,
        state: { status: 'error' },
        params: { source: 'developmentMap' },
        metadata: { description: map.stateError },
      }));
      addEdge(makeEdge({
        from: rootAgentId,
        to: errorNodeId,
        kind: 'agent.process.stateError',
        label: 'state error',
      }));
    }
  }

  return {
    version: 'graph-model-v1',
    metadata: {
      kind: 'agent-process-graph',
      chatId: rootChat.id || null,
      rootNodeId: rootAgentId,
      childChatCount: childList.length,
      messageCount: allEvents.filter(event => event.type === 'message').length,
      toolCount: allEvents.filter(event => event.type === 'tool').length,
      fileCount: fileNodeIds.size,
      developmentMap: map ? {
        runningTasks: map.usage?.runningTasks || 0,
        totalTasks: map.usage?.totalTasks || 0,
        subagents: map.usage?.subagents || 0,
        toolUses: map.usage?.toolUses || 0,
        toolUsageMs: map.usage?.toolUsageMs || 0,
        latestToolCount: asArray(map.latestTools).length,
        promptHintCount: asArray(map.promptHintMap?.hints).length,
        stateError: map.stateError || null,
      } : null,
    },
    nodes,
    edges,
    views: {
      canvas: {
        kind: 'canvas-graph',
        roots: nodes.map(node => node.id),
      },
    },
  };
}

export function buildAgentProcessCanvasGraphModel(input = {}) {
  return graphModelToCanvasGraphModel(buildAgentProcessGraphModel(input), { view: 'canvas' });
}

export function summarizeAgentProcessGraphModel(model = {}) {
  let nodes = asArray(model.nodes);
  let edges = asArray(model.edges);
  let counts = {};
  for (let node of nodes) {
    let key = String(node.kind || 'unknown');
    counts[key] = (counts[key] || 0) + 1;
  }
  return {
    nodes: nodes.length,
    edges: edges.length,
    counts,
    metadata: asObject(model.metadata),
  };
}
