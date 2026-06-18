import path from 'node:path';
import {
  formatChatGoalIntentPromptBlock,
  formatChatGoalPromptBlock,
  formatChatGoalQueuePromptBlock,
} from '../../iso/chat-goals.js';
import {
  DEFAULT_CHAT_AGENT,
  resolveChatCreationAgent,
  resolveChatDelegationAgent,
} from '../../iso/chat-orchestration.js';

export { DEFAULT_CHAT_AGENT, resolveChatCreationAgent };
const FOCUS_GRAPH_SYMBOL_LIMIT = 8;

export function isDelegateTool(toolName = '') {
  return toolName === 'delegate_task'
    || toolName === 'delegate_task_readonly'
    || toolName === 'mcp_agent-portal_delegate_task'
    || toolName === 'mcp_agent-portal_delegate_task_readonly';
}

function normalizeFiles(files) {
  if (!Array.isArray(files)) return [];
  return [...new Set(files.map(file => String(file || '').trim()).filter(Boolean))];
}

export function normalizeResourceGroup(value) {
  let normalized = String(value ?? '').trim();
  return normalized && normalized !== 'none' ? normalized : null;
}

function normalizeRelFile(cwd, file) {
  let rel = path.isAbsolute(file) ? path.relative(cwd, file) : file;
  return rel.replaceAll(path.sep, '/');
}

function chatTitleFromPrompt(prompt = '') {
  let text = String(prompt || '').trim();
  return text.substring(0, 40) + (text.length > 40 ? '...' : '') || 'Delegated task';
}

function projectPathFromChat(sg, chat) {
  if (!chat?.projectId) return null;
  let project = sg.get(`projects/${chat.projectId}`);
  return project?.path || null;
}

function normalizeGoalMessageList(value) {
  if (!value) return [];
  let list = Array.isArray(value) ? value : [value];
  return list
    .filter((item) => item && typeof item === 'object')
    .filter((item) => item.id && (item.text || item.prompt || item.message));
}

function normalizeGoalMessageIds(value) {
  if (!value) return [];
  let list = Array.isArray(value) ? value : [value];
  return [...new Set(list.map(id => String(id || '').trim()).filter(Boolean))];
}

function extractGoalQueueArgs(args = {}) {
  let messages = [
    ...normalizeGoalMessageList(args.goalQueueMessages),
    ...normalizeGoalMessageList(args.goal_queue_messages),
    ...normalizeGoalMessageList(args.queuedGoalMessages),
    ...normalizeGoalMessageList(args.queued_goal_messages),
  ];
  let messageIds = normalizeGoalMessageIds(
    args.goalMessageIds
      || args.goal_message_ids
      || args.goalQueueMessageIds
      || args.goal_queue_message_ids,
  );
  delete args.goalQueueMessages;
  delete args.goal_queue_messages;
  delete args.queuedGoalMessages;
  delete args.queued_goal_messages;
  delete args.goalMessageIds;
  delete args.goal_message_ids;
  delete args.goalQueueMessageIds;
  delete args.goal_queue_message_ids;
  return { messages, messageIds };
}

function resolveGoalQueueMessages(goal, queueArgs = {}) {
  let selected = [...(queueArgs.messages || [])];
  let ids = new Set(queueArgs.messageIds || []);
  if (ids.size && Array.isArray(goal?.queue)) {
    for (let item of goal.queue) {
      if (ids.has(item?.id)) selected.push(item);
    }
  }
  let seen = new Set();
  return selected.filter((item) => {
    let key = item.id || `${item.delivery || ''}:${item.text || item.prompt || item.message}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseToolJson(result) {
  let text = result?.content?.find?.(item => item?.type === 'text')?.text
    || result?.content?.[0]?.text
    || null;
  if (!text || typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function callProjectGraphTool(proxyManager, name, args = {}) {
  if (typeof proxyManager?.requestFromChild !== 'function') return null;
  let result = await proxyManager.requestFromChild('project-graph', 'tools/call', {
    name,
    arguments: args,
  });
  return parseToolJson(result);
}

function collectFocusSymbols(skeleton = {}, files = []) {
  let focusFiles = new Set(files);
  let symbols = [];
  let seen = new Set();
  for (let [id, node] of Object.entries(skeleton.n || {})) {
    if (!focusFiles.has(node?.f)) continue;
    seen.add(id);
    symbols.push({
      id,
      name: skeleton.L?.[id] || id,
      type: 'C',
      file: node.f,
      line: node.l || null,
      methods: node.m || [],
      properties: node.$ || 0,
    });
  }
  for (let [id, web] of Object.entries(skeleton.W || {})) {
    if (seen.has(id)) continue;
    let webFiles = [web.file, web.template, web.style].filter(Boolean);
    if (!webFiles.some(file => focusFiles.has(file))) continue;
    let node = skeleton.n?.[id] || {};
    seen.add(id);
    symbols.push({
      id,
      name: skeleton.L?.[id] || id,
      type: 'C',
      file: node.f || web.file || null,
      line: node.l || null,
      methods: node.m || [],
      properties: node.$ || 0,
      web: true,
    });
  }
  for (let [file, ids] of Object.entries(skeleton.X || {})) {
    if (!focusFiles.has(file)) continue;
    for (let id of ids || []) {
      if (seen.has(id)) continue;
      seen.add(id);
      symbols.push({
        id,
        name: skeleton.L?.[id] || id,
        type: 'F',
        file,
      });
    }
  }
  return symbols.slice(0, FOCUS_GRAPH_SYMBOL_LIMIT);
}

function collectFocusWeb(skeleton = {}, files = [], symbols = []) {
  let focusFiles = new Set(files);
  let symbolIds = new Set(symbols.map(symbol => symbol.id));
  let web = [];
  for (let [id, item] of Object.entries(skeleton.W || {})) {
    let webFiles = [item.file, item.template, item.style].filter(Boolean);
    if (!symbolIds.has(id) && !webFiles.some(file => focusFiles.has(file))) continue;
    web.push({
      symbol: id,
      name: skeleton.L?.[id] || id,
      ...item,
    });
  }
  return web.slice(0, FOCUS_GRAPH_SYMBOL_LIMIT);
}

function collectFocusImports(skeleton = {}, files = []) {
  let imports = skeleton.I || {};
  return files
    .filter(file => Array.isArray(imports[file]))
    .map(file => ({
      file,
      sources: imports[file].map(item => item?.s || item).filter(Boolean),
    }));
}

function inferDelegationPolicy(args = {}, context = {}) {
  let approvalMode = args.approval_mode || null;
  let resourceGroup = normalizeResourceGroup(args.resource_group);
  let source = 'agent_pool_default';
  if (context.explicitApprovalMode) source = 'explicit';
  else if (context.chatApprovalMode && approvalMode === context.chatApprovalMode) source = 'chat';
  else if (resourceGroup && !approvalMode) source = 'agent_pool_resource_group';

  let resourceGroupHintsReadOnly = Boolean(resourceGroup && /(?:read.?only|review|audit)/i.test(resourceGroup));
  let readOnly = approvalMode === 'plan'
    ? true
    : approvalMode
      ? false
      : resourceGroupHintsReadOnly ? true : null;

  return {
    accessMode: approvalMode,
    accessModeSource: source,
    readOnly,
    resourceGroup,
    routingOverride: Boolean(context.hasRoutingOverride),
    sessionInherited: Boolean(args.session_id && !context.hasRoutingOverride),
  };
}

async function buildProjectGraphFocus(proxyManager, cwd, files = []) {
  if (!files.length || !cwd) return null;
  let skeleton = await callProjectGraphTool(proxyManager, 'get_skeleton', { path: cwd });
  if (!skeleton || typeof skeleton !== 'object') return null;

  let relFiles = files.map(file => normalizeRelFile(cwd, file));
  let symbols = collectFocusSymbols(skeleton, relFiles);
  let web = collectFocusWeb(skeleton, relFiles, symbols);
  let dependencies = [];
  for (let symbol of symbols) {
    let deps = await callProjectGraphTool(proxyManager, 'navigate', {
      action: 'deps',
      symbol: symbol.id,
      path: cwd,
    });
    if (!deps || deps.error) continue;
    dependencies.push({
      symbol: symbol.id,
      imports: deps.imports || [],
      usedBy: deps.usedBy || [],
      calls: deps.calls || [],
      files: deps.files || [],
      elements: deps.elements || [],
      web: deps.web || null,
    });
  }

  return {
    files: relFiles,
    symbols,
    imports: collectFocusImports(skeleton, relFiles),
    web,
    dependencies,
  };
}

function promptWithChatGoal(prompt, chat, sg, chatId, queueArgs = {}) {
  let body = String(prompt || '');
  let activeGoal = chat?.activeGoalId ? sg.getChatGoal(chat.activeGoalId) : null;
  if (activeGoal) {
    let parts = [];
    if (!body.includes('[Active Goal]')) parts.push(formatChatGoalPromptBlock(activeGoal));
    let queueBlock = formatChatGoalQueuePromptBlock(
      activeGoal,
      resolveGoalQueueMessages(activeGoal, queueArgs),
    );
    if (queueBlock && !body.includes('[Goal Queue]')) parts.push(queueBlock);
    parts.push(body);
    return parts.filter(Boolean).join('\n\n');
  }
  if (!chat?.goalIntentActive || body.includes('[Goal Intent]')) return body;
  let goalIntentBlock = formatChatGoalIntentPromptBlock({
    chatId,
    projectId: chat.projectId || '',
  });
  return `${goalIntentBlock}\n\n${body}`;
}

/**
 * Prepare delegate_task arguments so every chat-bound entry point follows the
 * same orchestration defaults.
 *
 * @param {object} proxyManager
 * @param {string} toolName
 * @param {object} args
 * @param {object} [options]
 * @param {import('../state-graph.js').StateGraph} [options.stateGraph]
 * @param {string} [options.source]
 * @returns {Promise<{ args: object, chatId: string|null, parentChatId: string|null, createdChat: object|null }>}
 */
export async function prepareDelegateTaskCall(proxyManager, toolName, args = {}, options = {}) {
  let next = { ...(args || {}) };
  if (!isDelegateTool(toolName)) {
    return { args: next, chatId: next.chat_id || next.chatId || null, parentChatId: next.parent_chat_id || next.parentChatId || null, createdChat: null };
  }
  let queueArgs = extractGoalQueueArgs(next);

  let sg = options.stateGraph;
  if (!sg) {
    let mod = await import('../state-graph.js');
    sg = mod.getStateGraph();
  }

  let source = options.source || 'mcp';
  let explicitChatId = next.chat_id || next.chatId || null;
  let parentChatId = next.parent_chat_id || next.parentChatId || null;
  let explicitAgent = next.agent_slug || next.agent || null;
  let explicitApprovalMode = next.approval_mode || null;
  let explicitResourceGroupValue = next.resource_group ?? next.resourceGroup;
  let hasResourceGroupOverride = explicitResourceGroupValue !== undefined
    && explicitResourceGroupValue !== null
    && String(explicitResourceGroupValue).trim() !== '';
  next.resource_group = normalizeResourceGroup(explicitResourceGroupValue);
  delete next.resourceGroup;
  let createdChat = null;
  let contextChatId = explicitChatId;
  let contextChat = explicitChatId ? sg.getChat(explicitChatId) : null;
  let isChildDelegation = Boolean(parentChatId && !explicitChatId);

  if (isChildDelegation) {
    let parentChat = sg.getChat(parentChatId) || sg.get(`chats/${parentChatId}`) || null;
    let inheritedForDefaultAgent = !explicitAgent;
    let childAgent = explicitAgent || DEFAULT_CHAT_AGENT;
    let childResourceGroup = next.resource_group
      || (inheritedForDefaultAgent && !hasResourceGroupOverride ? normalizeResourceGroup(parentChat?.resource_group) : null);
    let childApprovalMode = next.approval_mode || (inheritedForDefaultAgent ? parentChat?.approval_mode : null) || null;
    let child = sg.createChat({
      name: chatTitleFromPrompt(next.prompt),
      adapter: 'pool',
      agent: childAgent,
      provider: childResourceGroup ? null : (next.provider || null),
      model: childResourceGroup ? null : (next.model || null),
      approval_mode: childApprovalMode,
      resource_group: childResourceGroup,
      parentChatId,
      projectId: parentChat?.projectId || null,
      activeGoalId: parentChat?.activeGoalId || null,
      goalIntentActive: Boolean(parentChat?.goalIntentActive),
      goalQueueMode: parentChat?.goalQueueMode || null,
    }, source);
    createdChat = sg.getChat(child.id) || { id: child.id };
    next.chat_id = child.id;
    contextChatId = child.id;
    contextChat = createdChat;
  }

  if (!contextChat && parentChatId) {
    contextChat = sg.getChat(parentChatId) || sg.get(`chats/${parentChatId}`) || null;
    contextChatId = parentChatId;
  }

  next.agent_slug = resolveChatDelegationAgent({ explicitAgent, contextChat });
  delete next.agent;

  let hasRoutingOverride = Boolean(next.provider || next.model || hasResourceGroupOverride);
  if (!next.approval_mode && contextChat?.approval_mode) next.approval_mode = contextChat.approval_mode;
  if (!hasResourceGroupOverride && !next.resource_group && contextChat?.resource_group) {
    next.resource_group = normalizeResourceGroup(contextChat.resource_group);
  }
  if (!next.session_id && !next.sessionId && contextChat?.sessionId && !hasRoutingOverride) {
    next.session_id = contextChat.sessionId;
  }
  if (!next.cwd) {
    next.cwd = projectPathFromChat(sg, contextChat)
      || (proxyManager?.projectRoot && proxyManager.projectRoot !== '/' ? proxyManager.projectRoot : process.env.HOME);
  }

  if (next.resource_group) {
    delete next.provider;
    delete next.model;
  } else {
    if (!next.provider && contextChat?.provider) next.provider = contextChat.provider;
    if (!next.model && contextChat?.model) next.model = contextChat.model;
  }

  if (contextChat) {
    next.prompt = promptWithChatGoal(next.prompt, contextChat, sg, contextChatId, queueArgs);
  }

  let files = normalizeFiles(next.files);
  if (files.length) {
    next.files = files;
    if (next.context_mode !== 'off' && !next.focus_graph && !next.focusGraph) {
      try {
        let focusGraph = await buildProjectGraphFocus(proxyManager, next.cwd, files);
        if (focusGraph) next.focus_graph = focusGraph;
      } catch {
        delete next.focus_graph;
      }
    }
  } else {
    delete next.files;
  }

  delete next.chatId;
  delete next.parentChatId;
  if (!next.resource_group) delete next.resource_group;
  let delegationPolicy = inferDelegationPolicy(next, {
    explicitApprovalMode,
    chatApprovalMode: contextChat?.approval_mode || null,
    hasRoutingOverride,
  });
  return { args: next, chatId: next.chat_id || contextChatId || null, parentChatId, createdChat, delegationPolicy };
}

const RG_NOT_FOUND_RE = /❌\s+Resource group\s+`([^`]+)`\s+not found\./;
const RG_AT_CAPACITY_RE = /⚠️\s+Resource group\s+`([^`]+)`\s+is at capacity\s+\((\d+)\/(\d+)\s+active tasks?\)/;
const RG_AVAILABLE_HEADER_RE = /Available resource groups\s*\(\d+\):/;
const RG_ALT_LINE_RE = /^\s*-\s*`([^`]+)`\s*(?:\((.+)\))?/;

function parseAvailableGroupLines(text) {
  let section = text.split(RG_AVAILABLE_HEADER_RE)[1];
  if (!section) return [];
  let results = [];
  let lines = section.trim().split('\n');
  for (let line of lines) {
    let match = line.match(RG_ALT_LINE_RE);
    if (!match) continue;
    let entry = { name: match[1] };
    let details = match[2] || '';

    let providerMatch = details.match(/provider:\s*([^,)]+)/);
    if (providerMatch) entry.provider = providerMatch[1].trim();

    let modelMatch = details.match(/model:\s*([^,)]+)/);
    if (modelMatch) entry.model = modelMatch[1].trim();

    let capMatch = details.match(/capacity:\s*(\d+)\/(\d+)/);
    if (capMatch) {
      entry.capacity = {
        active: parseInt(capMatch[1], 10),
        max: parseInt(capMatch[2], 10),
      };
    }

    let fallbackMatch = details.match(/fallback:\s*(.+)/);
    if (fallbackMatch) {
      entry.fallbackProfiles = fallbackMatch[1]
        .split(' -> ')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    results.push(entry);
  }
  return results;
}

/**
 * Parse resource group failure diagnostics from an Agent Pool delegate_task
 * error response. Returns structured data that can be surfaced safely through
 * public Agent Portal tools without exposing raw Agent Pool internals.
 *
 * @param {string} errorText
 * @returns {object|null}
 */
export function parseResourceGroupDiagnostics(errorText = '') {
  let text = String(errorText || '');
  let notFoundMatch = text.match(RG_NOT_FOUND_RE);
  if (notFoundMatch) {
    let availableGroups = parseAvailableGroupLines(text);
    return {
      errorKind: 'not_found',
      groupName: notFoundMatch[1],
      reason: `The requested resource group is not configured in this workspace.`,
      availableGroups,
      availableCount: availableGroups.length,
    };
  }

  let capacityMatch = text.match(RG_AT_CAPACITY_RE);
  if (capacityMatch) {
    let availableGroups = parseAvailableGroupLines(text);
    return {
      errorKind: 'at_capacity',
      groupName: capacityMatch[1],
      capacity: {
        active: parseInt(capacityMatch[2], 10),
        max: parseInt(capacityMatch[3], 10),
      },
      reason: `The requested resource group has no available capacity.`,
      availableGroups,
      availableCount: availableGroups.length,
    };
  }

  return null;
}

export function extractResourceGroupDiagnostics(result = {}) {
  let text = result?.content?.[0]?.text || '';
  return parseResourceGroupDiagnostics(text);
}

export default {
  DEFAULT_CHAT_AGENT,
  isDelegateTool,
  prepareDelegateTaskCall,
  resolveChatCreationAgent,
};
