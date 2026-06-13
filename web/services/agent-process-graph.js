import { graphModelToCanvasGraphModel } from 'symbiote-ui/graph';

const NODE_COLORS = {
  goal: '#7E57C2',
  agent: '#20A4F3',
  childAgent: '#1AA187',
  prompt: '#5C6BC0',
  response: '#26A69A',
  tool: '#F9A825',
  file: '#8EA4B8',
  fallback: '#EF6C00',
};

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

function compactLabel(value, fallback = '') {
  let text = normalizeText(value);
  if (!text) return fallback;
  if (text.length <= 44) return text;
  return `${text.slice(0, 18)}...${text.slice(-20)}`;
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

function makeNode({ id, kind, label, type, color, width = 156, height = 42, state = {}, params = {}, metadata = {} }) {
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
      canvas: {
        description: metadata.description,
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
  for (let index = 0; index < messages.length; index += 1) {
    let message = messages[index] || {};
    let role = normalizeMessageRole(message.role);
    let text = messageText(message);

    if (role && text) {
      events.push({
        type: 'message',
        id: `${scopeKey}:message:${index}:${role}`,
        ownerNodeId,
        role,
        text,
        index,
      });
    }

    for (let tool of collectMessageTools(message, index)) {
      events.push({
        type: 'tool',
        id: `${scopeKey}:${tool.key}`,
        ownerNodeId,
        name: tool.name,
        input: tool.input,
        result: tool.result,
        streaming: tool.streaming,
        index,
      });
    }

    let fallback = parseFallbackMessage(message);
    if (fallback) {
      events.push({
        type: 'fallback',
        id: `${scopeKey}:fallback:${index}`,
        ownerNodeId,
        ...fallback,
      });
    }
  }
  return events;
}

function getChatAgentLabel(chat = {}, fallback = 'orchestrator') {
  return chat.agent || chat.agent_slug || chat.name || fallback;
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

export function buildAgentProcessGraphModel({ chat = null, chats = [], childChats = [] } = {}) {
  let nodes = [];
  let edges = [];
  let seenNodes = new Set();
  let seenEdges = new Set();
  let rootChat = asObject(chat);
  let rootChatId = normalizeId(rootChat.id, 'active');
  let rootAgentId = `agent:${rootChatId}:${normalizeId(getChatAgentLabel(rootChat), 'orchestrator')}`;

  const addNode = (node) => addUnique(nodes, node, seenNodes, node.id);
  const addEdge = (edge) => addUnique(edges, edge, seenEdges, edge.id);

  addNode(makeNode({
    id: rootAgentId,
    kind: 'agent.process.agent',
    label: compactLabel(getChatAgentLabel(rootChat), 'orchestrator'),
    type: 'agent',
    color: rootChat.agentColor || NODE_COLORS.agent,
    state: { status: rootChat.pendingTaskId ? 'running' : 'ready' },
    params: {
      chatId: rootChat.id || null,
      agent: rootChat.agent || null,
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
      state: { status: goal.status || 'active' },
      params: { goalId },
    }));
    addEdge(makeEdge({ from: rootAgentId, to: goalNodeId, kind: 'agent.process.goal', label: 'goal' }));
  }

  let childList = buildChildChats(rootChat, chats, childChats);
  for (let child of childList) {
    let childAgent = getChatAgentLabel(child, 'agent');
    let childNodeId = `agent:${normalizeId(child.id)}:${normalizeId(childAgent, 'agent')}`;
    addNode(makeNode({
      id: childNodeId,
      kind: 'agent.process.childAgent',
      label: compactLabel(childAgent, child.name || 'Agent'),
      type: 'child-agent',
      color: child.agentColor || NODE_COLORS.childAgent,
      state: { status: child.pendingTaskId ? 'running' : child.lastTaskStatus || 'delegated' },
      params: {
        chatId: child.id,
        parentChatId: child.parentChatId,
        agent: child.agent || null,
        resource_group: child.resource_group || null,
      },
    }));
    addEdge(makeEdge({ from: rootAgentId, to: childNodeId, kind: 'agent.process.delegate', label: 'delegate' }));
  }

  let allEvents = [
    ...collectChatProcessEvents(rootChat, rootAgentId, rootChatId),
    ...childList.flatMap((child) => collectChatProcessEvents(child, `agent:${normalizeId(child.id)}:${normalizeId(getChatAgentLabel(child, 'agent'))}`, normalizeId(child.id))),
  ];

  let fileNodeIds = new Map();
  const ensureFileNode = (file) => {
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
      width: 150,
      height: 36,
      params: { path },
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
        width: 168,
        height: 38,
        state: { status: isPrompt ? 'prompt' : 'response' },
        params: { role: event.role, preview },
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
        state: { status },
        params: {
          name: event.name,
          input: event.input,
          result: event.result,
        },
      }));
      addEdge(makeEdge({ from: event.ownerNodeId, to: toolId, kind: 'agent.process.toolCall', label: event.name }));

      let access = classifyFileAccess(event.name, event.input);
      for (let file of collectFileRefs({ input: event.input, result: event.result })) {
        let fileNodeId = ensureFileNode(file);
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
        state: { status: 'fallback' },
        params: { from: event.from, to: event.to, reason: event.reason },
        metadata: { description: event.reason },
      }));
      addEdge(makeEdge({ from: event.ownerNodeId, to: fallbackId, kind: 'agent.process.providerFallback', label: 'fallback' }));
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
