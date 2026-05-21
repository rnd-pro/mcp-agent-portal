import {
  ChatSidebarShell,
  DEFAULT_NAV_WIDTH,
  clampChatSidebarWidth,
  setGlobalParam,
} from 'symbiote-node/ui';
import { state as dashState, events as dashEvents, emit as dashEmit } from '../../dashboard-state.js';
import { stateSync } from '../../state-sync.js';
import { persistUiValue, readUiValue } from '../../common/ui-state.js';

const STORAGE_COLLAPSED_PATH = 'ui/preferences/chatNavCollapsed';
const STORAGE_COLLAPSED_KEY = 'pg-chat-sidebar-collapsed';
const STORAGE_WIDTH_PATH = 'ui/preferences/chatNavWidth';
const STORAGE_WIDTH_KEY = 'pg-chat-sidebar-width';

function getCleanName(name) {
  return (name || '').replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*/u, '').trim();
}

function getStatusHtml(chat) {
  if (chat.pendingTaskId) {
    return '<span class="material-symbols-outlined spin-icon" style="font-size:12px;color:var(--accent-color);margin-left:4px;" title="Running task...">hourglass_empty</span>';
  }
  if (chat.lastTaskStatus === 'done') {
    return '<span class="material-symbols-outlined" style="font-size:12px;color:hsl(140,50%,45%);margin-left:4px;" title="Completed">check_circle</span>';
  }
  if (chat.lastTaskStatus === 'error') {
    return '<span class="material-symbols-outlined" style="font-size:12px;color:hsl(0,60%,50%);margin-left:4px;" title="Error">error</span>';
  }
  return '';
}

export class ChatSidebar extends ChatSidebarShell {
  initCallback() {
    this.$.navWidth = clampChatSidebarWidth(Number(readUiValue(STORAGE_WIDTH_PATH, STORAGE_WIDTH_KEY, DEFAULT_NAV_WIDTH)) || DEFAULT_NAV_WIDTH);
    this.$.navCollapsed = readUiValue(STORAGE_COLLAPSED_PATH, STORAGE_COLLAPSED_KEY, false) === true;
    this.$.onNewChat = () => this._createChat();

    super.initCallback();

    this.addEventListener('chat-sidebar-select', (event) => {
      this._selectChat(event.detail?.id);
    });
    this.addEventListener('chat-sidebar-delete', (event) => {
      this._deleteChat(event.detail?.id);
    });
    this.addEventListener('chat-sidebar-collapse-change', (event) => {
      if (!event.detail?.auto) {
        persistUiValue(STORAGE_COLLAPSED_PATH, Boolean(event.detail?.collapsed), STORAGE_COLLAPSED_KEY);
      }
    });
    this.addEventListener('chat-sidebar-width-change', (event) => {
      if (!this.$.navCollapsed) {
        persistUiValue(STORAGE_WIDTH_PATH, clampChatSidebarWidth(event.detail?.width || DEFAULT_NAV_WIDTH), STORAGE_WIDTH_KEY);
      }
    });

    if (dashState.chats?.length) {
      this._renderNavItems();
    }
    this._fetchChats();
    dashEvents.addEventListener('chats-updated', () => this._fetchChats());
    dashEvents.addEventListener('active-project-changed', () => this._renderNavItems());
    dashEvents.addEventListener('active-chat-changed', () => this._renderNavItems());

    this._unsubUi = stateSync.on('ui', (ui) => {
      let collapsed = ui?.preferences?.chatNavCollapsed;
      if (collapsed !== undefined && collapsed !== this.$.navCollapsed) {
        this.setCollapsed(Boolean(collapsed));
      }
      let width = ui?.preferences?.chatNavWidth;
      if (width !== undefined) {
        let nextWidth = clampChatSidebarWidth(Number(width) || DEFAULT_NAV_WIDTH);
        if (nextWidth !== this.$.navWidth) this.setWidth(nextWidth);
      }
    });

    this._unsubChats = stateSync.on('chats', (chatsObj) => {
      if (!chatsObj) return;
      dashState.chats = Object.entries(chatsObj)
        .map(([id, chat]) => ({ id, ...chat }))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      this._renderNavItems();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubChats?.();
    this._unsubUi?.();
  }

  async _createChat() {
    let adapter = dashState.globalCli?.defaultAdapter || 'pool';
    let projectId = dashState.activeProjectId || null;
    let projectName = null;

    if (projectId) {
      let project = (dashState.projectHistory || []).find((item) => item.id === projectId);
      projectName = project?.name;
    }

    let name = projectName ? `${projectName} — Chat` : 'New Chat';

    try {
      let res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, name, adapter }),
      });
      let data = await res.json();
      if (data.ok) {
        dashState.activeChatId = data.id;
        setGlobalParam('chat', data.id);
        dashEmit('active-chat-changed', { id: data.id });
        await this._fetchChats();
      }
    } catch (err) {
      console.error('[ChatSidebar] create chat error:', err);
    }
  }

  async _fetchChats() {
    try {
      let res = await fetch('/api/chats');
      let data = await res.json();
      dashState.chats = data.chats || [];
      this._renderNavItems();
    } catch (err) {
      console.error('[ChatSidebar] fetch chats error:', err);
    }
  }

  async _deleteChat(chatId) {
    if (!chatId) return;
    await fetch('/api/chats/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: chatId }),
    });
    if (dashState.activeChatId === chatId) {
      dashState.activeChatId = null;
      setGlobalParam('chat', null);
      dashEmit('active-chat-changed', { id: null });
    }
    this._fetchChats();
  }

  _selectChat(chatId) {
    if (!chatId || dashState.activeChatId === chatId) return;
    dashState.activeChatId = chatId;
    setGlobalParam('chat', chatId);
    dashEmit('active-chat-changed', { id: chatId });
    this._fetchChats();
  }

  _renderNavItems() {
    let chats = dashState.chats || [];

    let projectId = dashState.activeProjectId;
    if (projectId) {
      chats = chats.filter((chat) => chat.projectId === projectId);
    }

    let childMap = new Map();
    let rootChats = [];

    for (let chat of chats) {
      if (chat.parentChatId) {
        if (!childMap.has(chat.parentChatId)) childMap.set(chat.parentChatId, []);
        childMap.get(chat.parentChatId).push({
          ...chat,
          cleanName: getCleanName(chat.name),
          icon: chat.agentIcon || 'subdirectory_arrow_right',
          iconStyle: chat.agentColor ? `color:${chat.agentColor}` : '',
          statusHtml: getStatusHtml(chat),
          agentType: chat.adapter,
          isActive: chat.id === dashState.activeChatId,
        });
      } else {
        rootChats.push(chat);
      }
    }

    let processedChats = [];
    for (let chat of rootChats) {
      let children = childMap.get(chat.id) || [];
      let shouldExpand = chat.id === dashState.activeChatId
        || children.some((child) => child.id === dashState.activeChatId)
        || children.some((child) => child.pendingTaskId);
      processedChats.push({
        ...chat,
        cleanName: getCleanName(chat.name),
        icon: chat.agentIcon || 'chat',
        iconStyle: chat.agentColor ? `color:${chat.agentColor}` : '',
        statusHtml: getStatusHtml(chat),
        isActive: chat.id === dashState.activeChatId,
        isExpanded: shouldExpand,
        subChats: children,
      });
    }

    for (let [parentId, children] of childMap) {
      if (rootChats.some((chat) => chat.id === parentId)) continue;
      for (let child of children) {
        processedChats.push({
          ...child,
          icon: child.agentIcon || 'chat',
          subChats: [],
        });
      }
    }

    this.setChats(processedChats);
  }
}

ChatSidebar.template = ChatSidebarShell.template;
ChatSidebar.reg('chat-sidebar');
