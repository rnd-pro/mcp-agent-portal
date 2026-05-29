import {
  ChatSidebarShell,
  DEFAULT_NAV_WIDTH,
  clampChatSidebarWidth,
  updateParams,
} from 'symbiote-node/ui';
import { state as dashState, events as dashEvents, emit as dashEmit } from '../../dashboard-state.js';
import { stateSync } from '../../state-sync.js';
import { persistUiValue, readUiValue } from '../../common/ui-state.js';
import { buildChatNavTree } from './chat-tree.js';

const STORAGE_COLLAPSED_PATH = 'ui/preferences/chatNavCollapsed';
const STORAGE_COLLAPSED_KEY = 'pg-chat-sidebar-collapsed';
const STORAGE_WIDTH_PATH = 'ui/preferences/chatNavWidth';
const STORAGE_WIDTH_KEY = 'pg-chat-sidebar-width';

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
        updateParams({ chat: data.id });
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
      updateParams({ chat: null });
      dashEmit('active-chat-changed', { id: null });
    }
    this._fetchChats();
  }

  _selectChat(chatId) {
    if (!chatId) return;
    if (dashState.activeChatId !== chatId) dashState.activeChatId = chatId;
    updateParams({ chat: chatId });
    dashEmit('active-chat-changed', { id: chatId });
    this._fetchChats();
  }

  _renderNavItems() {
    this.setChats(buildChatNavTree({
      chats: dashState.chats || [],
      projectId: dashState.activeProjectId,
      projectHistory: dashState.projectHistory || [],
      activeChatId: dashState.activeChatId,
    }));
  }
}

ChatSidebar.template = ChatSidebarShell.template;
ChatSidebar.reg('chat-sidebar');
