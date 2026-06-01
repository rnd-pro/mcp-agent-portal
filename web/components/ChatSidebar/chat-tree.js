import { tPortal } from '../../common/localization.js';

function getCleanName(name) {
  return (name || '').replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*/u, '').trim();
}

function getStatusMeta(chat) {
  if (chat.pendingTaskId) {
    return { statusKind: 'running', statusIcon: 'hourglass_empty', statusTitle: tPortal('text.runningTask') };
  }
  if (chat.lastTaskStatus === 'done') {
    return { statusKind: 'done', statusIcon: 'check_circle', statusTitle: tPortal('text.completed') };
  }
  if (chat.lastTaskStatus === 'error') {
    return { statusKind: 'error', statusIcon: 'error', statusTitle: tPortal('text.error') };
  }
  return { statusKind: '', statusIcon: '', statusTitle: '' };
}

function getProjectMeta(projectId, projectHistory) {
  let project = (projectHistory || []).find((item) => item.id === projectId);
  return {
    id: projectId || 'global',
    name: project?.name || (projectId ? getCleanName(projectId) : tPortal('text.general')),
    color: project?.color || '',
  };
}

function hasActiveOrPending(chat, activeChatId) {
  return chat.id === activeChatId
    || Boolean(chat.pendingTaskId)
    || (chat.subChats || []).some((child) => hasActiveOrPending(child, activeChatId));
}

function getChatMetaLabel(chat) {
  if (chat.origin === 'mcp') return 'MCP';
  if (chat.parentChatId) return 'Agent';
  return '';
}

function toChatTreeItem(chat, children, activeChatId, defaultIcon) {
  return {
    ...chat,
    cleanName: getCleanName(chat.name),
    icon: chat.agentIcon || defaultIcon,
    agentColor: chat.agentColor || '',
    ...getStatusMeta(chat),
    adapter: '',
    metaLabel: getChatMetaLabel(chat),
    isActive: chat.id === activeChatId,
    isExpanded: chat.id === activeChatId
      || children.some((child) => hasActiveOrPending(child, activeChatId)),
    subChats: children,
  };
}

export function buildChatNavTree({
  chats = [],
  projectId = null,
  projectHistory = [],
  activeChatId = null,
  activeGroupId = null,
  expandedGroupIds = new Set(),
} = {}) {
  let scopedChats = projectId
    ? chats.filter((chat) => chat.projectId === projectId)
    : [...chats];
  let chatIds = new Set(scopedChats.map((chat) => chat.id));
  let childMap = new Map();
  let rootChats = [];

  for (let chat of scopedChats) {
    if (chat.parentChatId && chatIds.has(chat.parentChatId)) {
      if (!childMap.has(chat.parentChatId)) childMap.set(chat.parentChatId, []);
      childMap.get(chat.parentChatId).push(chat);
    } else {
      rootChats.push(chat);
    }
  }

  let buildItem = (chat, defaultIcon = 'chat') => {
    let children = (childMap.get(chat.id) || []).map((child) => (
      buildItem(child, 'subdirectory_arrow_right')
    ));
    return toChatTreeItem(chat, children, activeChatId, defaultIcon);
  };

  let processedChats = rootChats.map((chat) => buildItem(chat));

  if (!projectId) {
    let projectGroups = new Map();
    for (let chat of processedChats) {
      let meta = getProjectMeta(chat.projectId, projectHistory);
      if (!projectGroups.has(meta.id)) {
        projectGroups.set(meta.id, {
          id: `project-group:${meta.id}`,
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
      projectGroups.get(meta.id).subChats.push(chat);
    }
    processedChats = [...projectGroups.values()].map((group) => {
      let isExpanded = expandedGroupIds.has(group.id) || group.subChats.some((chat) => hasActiveOrPending(chat, activeChatId));
      return {
        ...group,
        isActive: group.id === activeGroupId,
        isExpanded,
      };
    });
  }

  return processedChats;
}
