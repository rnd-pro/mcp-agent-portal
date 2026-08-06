const DEFAULT_STATUS_META = Object.freeze({
  running: Object.freeze({ statusKind: 'running', statusIcon: 'hourglass_empty', statusTitle: 'Running' }),
  done: Object.freeze({ statusKind: 'done', statusIcon: 'check_circle', statusTitle: 'Completed' }),
  error: Object.freeze({ statusKind: 'error', statusIcon: 'error', statusTitle: 'Error' }),
});

function cleanChatName(name = '') {
  return String(name || '').replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*/u, '').trim();
}

function normalizeExpandedIds(expandedGroupIds = new Set()) {
  if (expandedGroupIds instanceof Set) return expandedGroupIds;
  if (Array.isArray(expandedGroupIds)) return new Set(expandedGroupIds);
  return new Set();
}

function statusMetaFor(chat = {}, statusMeta = DEFAULT_STATUS_META) {
  if (chat.pendingTaskId || chat.isRunning) return statusMeta.running || DEFAULT_STATUS_META.running;
  let status = chat.lastTaskStatus || chat.status || '';
  if (status === 'done' || status === 'completed') return statusMeta.done || DEFAULT_STATUS_META.done;
  if (status === 'error' || status === 'failed') return statusMeta.error || DEFAULT_STATUS_META.error;
  return { statusKind: '', statusIcon: '', statusTitle: '' };
}

function hasActiveOrPending(item = {}, activeChatId = '') {
  return item.id === activeChatId
    || Boolean(item.pendingTaskId || item.isRunning)
    || (item.subChats || []).some((child) => hasActiveOrPending(child, activeChatId));
}

function chatMetaLabel(chat = {}, labels = {}) {
  if ('metaLabel' in chat) return chat.metaLabel;
  if (chat.origin === 'mcp') return labels.mcp || 'MCP';
  if (chat.parentChatId) return labels.agent || 'Agent';
  return '';
}

function projectMeta(projectId = '', projectHistory = [], labels = {}) {
  let project = (projectHistory || []).find((item) => item.id === projectId);
  return {
    id: projectId || 'global',
    name: project?.name || (projectId ? cleanChatName(projectId) : labels.general || 'General'),
    color: project?.color || '',
  };
}

export function normalizeChatNavItem(chat = {}, children = [], {
  activeChatId = '',
  defaultIcon = 'chat',
  labels = {},
  statusMeta = DEFAULT_STATUS_META,
} = {}) {
  let id = String(chat.id ?? chat.chatId ?? '');
  return {
    ...chat,
    id,
    cleanName: chat.cleanName ?? cleanChatName(chat.name ?? chat.title ?? id),
    name: chat.name ?? chat.title ?? id,
    icon: chat.icon || chat.agentIcon || defaultIcon,
    agentColor: chat.agentColor || '',
    adapter: chat.adapter || '',
    metaLabel: chatMetaLabel(chat, labels),
    ...statusMetaFor(chat, statusMeta),
    isActive: Boolean(chat.isActive || (activeChatId && id === activeChatId)),
    isExpanded: Boolean(
      chat.isExpanded ||
      id === activeChatId ||
      children.some((child) => hasActiveOrPending(child, activeChatId))
    ),
    subChats: children,
  };
}

export function buildChatNavTree({
  chats = [],
  projectId = null,
  projectHistory = [],
  activeChatId = '',
  activeGroupId = '',
  expandedGroupIds = new Set(),
  labels = {},
  statusMeta = DEFAULT_STATUS_META,
} = {}) {
  let scopedChats = projectId
    ? chats.filter((chat) => chat.projectId === projectId)
    : [...chats];
  let chatIds = new Set(scopedChats.map((chat) => String(chat.id ?? chat.chatId ?? '')));
  let childMap = new Map();
  let roots = [];

  for (let chat of scopedChats) {
    let id = String(chat.id ?? chat.chatId ?? '');
    let parentId = String(chat.parentChatId || '');
    if (parentId && chatIds.has(parentId)) {
      if (!childMap.has(parentId)) childMap.set(parentId, []);
      childMap.get(parentId).push(chat);
    } else if (id) {
      roots.push(chat);
    }
  }

  let buildItem = (chat, defaultIcon = 'chat') => {
    let id = String(chat.id ?? chat.chatId ?? '');
    let children = (childMap.get(id) || []).map((child) => buildItem(child, 'subdirectory_arrow_right'));
    return normalizeChatNavItem(chat, children, {
      activeChatId,
      defaultIcon,
      labels,
      statusMeta,
    });
  };

  let processed = roots.map((chat) => buildItem(chat));
  if (projectId) return processed;

  let expanded = normalizeExpandedIds(expandedGroupIds);
  let groups = new Map();
  for (let chat of processed) {
    let meta = projectMeta(chat.projectId, projectHistory, labels);
    let groupId = `project-group:${meta.id}`;
    if (!groups.has(groupId)) {
      groups.set(groupId, {
        id: groupId,
        cleanName: meta.name,
        name: meta.name,
        icon: 'folder',
        agentColor: meta.color,
        adapter: '',
        metaLabel: '',
        isGroup: true,
        isExpanded: false,
        isActive: false,
        subChats: [],
      });
    }
    groups.get(groupId).subChats.push(chat);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    isActive: group.id === activeGroupId,
    isExpanded: expanded.has(group.id) || group.subChats.some((chat) => hasActiveOrPending(chat, activeChatId)),
  }));
}

export { cleanChatName };
