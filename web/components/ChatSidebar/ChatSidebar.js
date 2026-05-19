import { Symbiote } from '@symbiotejs/symbiote';
import { state as dashState, events as dashEvents, emit as dashEmit } from "../../dashboard-state.js";
import { setGlobalParam } from 'symbiote-node';
import template from './ChatSidebar.tpl.js';
import { stateSync } from '../../state-sync.js';
import { persistUiValue, readUiValue } from '../../common/ui-state.js';
import './ChatSidebarItem.js';

const STORAGE_COLLAPSED_PATH = 'ui/preferences/chatNavCollapsed';
const STORAGE_COLLAPSED_KEY = 'pg-chat-sidebar-collapsed';
const STORAGE_WIDTH_PATH = 'ui/preferences/chatNavWidth';
const STORAGE_WIDTH_KEY = 'pg-chat-sidebar-width';
const DEFAULT_NAV_WIDTH = 200;
const MIN_NAV_WIDTH = 120;
const MAX_NAV_WIDTH = 420;
const COLLAPSED_NAV_WIDTH = 48;
const COLLAPSE_DRAG_THRESHOLD = 72;
const AUTO_COLLAPSE_WIDTH = 560;
const AUTO_UNCOLLAPSE_WIDTH = 660;

function clampWidth(width) {
  return Math.max(MIN_NAV_WIDTH, Math.min(MAX_NAV_WIDTH, Math.round(width)));
}

export class ChatSidebar extends Symbiote {
  static isoMode = true;

  init$ = {
    navCollapsed: true,
    navWidth: DEFAULT_NAV_WIDTH,
    chats: [],
    
    onToggleNav: () => {
      this._autoCollapsed = false;
      this.$.navCollapsed = !this.$.navCollapsed;
      if (!this.$.navCollapsed) this._applyNavWidth();
    },

    onResizeStart: (e) => {
      this._startResize(e);
    },
    
    onNewChat: async () => {
      console.log('[ChatSidebar] _createChat called!');
      let adapter = dashState.globalCli?.defaultAdapter || 'pool';
      let projectId = dashState.activeProjectId || null;
      let projectName = null;

      if (projectId) {
        let proj = (dashState.projectHistory || []).find(p => p.id === projectId);
        projectName = proj?.name;
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
    },
    
    onChatClick: async (e) => {
      let btnDelete = e.target.closest('.chat-item-delete');
      let item = e.target.closest('.chat-item');
      if (!item) return;

      let chatId = item.dataset.id;
      
      if (btnDelete) {
        e.stopPropagation();
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
        return;
      }
      
      let expandIcon = e.target.closest('.chat-expand-icon');
      if (expandIcon) {
        e.stopPropagation();
        let subContainer = this.querySelector(`.chat-sub-items[data-parent="${chatId}"]`);
        if (!subContainer) return;
        let isExpanded = subContainer.hasAttribute('expanded');
        subContainer.toggleAttribute('expanded', !isExpanded);
        item.classList.toggle('chat-item-expanded', !isExpanded);
        return;
      }
      
      if (chatId && dashState.activeChatId !== chatId) {
        dashState.activeChatId = chatId;
        setGlobalParam('chat', chatId);
        dashEmit('active-chat-changed', { id: chatId });
        this._fetchChats(); // Update active class
      }
    }
  }

  initCallback() {
    this.$.navWidth = clampWidth(Number(readUiValue(STORAGE_WIDTH_PATH, STORAGE_WIDTH_KEY, DEFAULT_NAV_WIDTH)) || DEFAULT_NAV_WIDTH);
    this.$.navCollapsed = readUiValue(STORAGE_COLLAPSED_PATH, STORAGE_COLLAPSED_KEY, false) === true;

    // On cold load, dashState.chats may already be populated by app.js init.
    // Render immediately if available, then also async-fetch as backup.
    if (dashState.chats?.length) {
      this._renderNavItems();
    }
    this._fetchChats();
    dashEvents.addEventListener('chats-updated', () => this._fetchChats());
    dashEvents.addEventListener('active-project-changed', () => this._renderNavItems());
    dashEvents.addEventListener('active-chat-changed', () => this._renderNavItems());
    
    this.sub('navCollapsed', (val) => {
      let nav = this.querySelector('.chat-nav');
      if (nav) nav.toggleAttribute('collapsed', val);
      this.toggleAttribute('collapsed', val);
      if (!this._skipPersistCollapsed) {
        persistUiValue(STORAGE_COLLAPSED_PATH, Boolean(val), STORAGE_COLLAPSED_KEY);
      }
      this._applyNavWidth();
    });

    this.sub('navWidth', (val) => {
      this._applyNavWidth();
      if (!this._skipPersistWidth) {
        persistUiValue(STORAGE_WIDTH_PATH, clampWidth(Number(val) || DEFAULT_NAV_WIDTH), STORAGE_WIDTH_KEY);
      }
    });

    this._unsubUi = stateSync.on('ui', (ui) => {
      let collapsed = ui?.preferences?.chatNavCollapsed;
      if (collapsed !== undefined && collapsed !== this.$.navCollapsed) {
        this.$.navCollapsed = Boolean(collapsed);
      }
      let width = ui?.preferences?.chatNavWidth;
      if (width !== undefined) {
        let nextWidth = clampWidth(Number(width) || DEFAULT_NAV_WIDTH);
        if (nextWidth !== this.$.navWidth) this.$.navWidth = nextWidth;
      }
    });

    this._unsubChats = stateSync.on('chats', (chatsObj) => {
      if (!chatsObj) return;
      dashState.chats = Object.entries(chatsObj)
        .map(([id, c]) => ({ id, ...c }))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      this._renderNavItems();
    });

    this._resizeObserver = new ResizeObserver(() => this._syncCollapseForAvailableWidth());
    let shell = this.closest('.chat-shell') || this.parentElement;
    if (shell) this._resizeObserver.observe(shell);
    queueMicrotask(() => {
      this._applyNavWidth();
      this._syncCollapseForAvailableWidth();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._unsubChats) this._unsubChats();
    if (this._unsubUi) this._unsubUi();
    this._resizeObserver?.disconnect();
  }

  _setCollapsed(collapsed, { persist = true, auto = false } = {}) {
    this._skipPersistCollapsed = !persist;
    this._autoCollapsed = auto;
    this.$.navCollapsed = Boolean(collapsed);
    this._skipPersistCollapsed = false;
  }

  _setWidth(width, { persist = true } = {}) {
    this._skipPersistWidth = !persist;
    this.$.navWidth = clampWidth(width);
    this._skipPersistWidth = false;
  }

  _applyNavWidth() {
    let width = this.$.navCollapsed ? COLLAPSED_NAV_WIDTH : clampWidth(this.$.navWidth);
    this.style.setProperty('--chat-nav-width', `${width}px`);
    let nav = this.querySelector('.chat-nav');
    if (nav) nav.toggleAttribute('collapsed', this.$.navCollapsed);
    this.toggleAttribute('collapsed', this.$.navCollapsed);
  }

  _syncCollapseForAvailableWidth() {
    if (this._isResizing) return;
    let shell = this.closest('.chat-shell') || this.parentElement;
    if (!shell) return;
    let width = shell.getBoundingClientRect().width;
    if (width <= AUTO_COLLAPSE_WIDTH && !this.$.navCollapsed) {
      this._setCollapsed(true, { persist: false, auto: true });
    } else if (width >= AUTO_UNCOLLAPSE_WIDTH && this.$.navCollapsed && this._autoCollapsed) {
      this._setCollapsed(false, { persist: false, auto: false });
    }
  }

  _startResize(e) {
    e.preventDefault();
    e.stopPropagation();

    let nav = this.querySelector('.chat-nav');
    let handle = this.querySelector('.chat-nav-resize-handle');
    if (!nav) return;

    let startX = e.clientX;
    let startWidth = this.$.navCollapsed ? COLLAPSED_NAV_WIDTH : nav.getBoundingClientRect().width;
    let wasCollapsed = this.$.navCollapsed;
    this._isResizing = true;
    this.setAttribute('resizing', '');
    handle?.classList.add('dragging');
    nav.setAttribute('resizing', '');

    let onMove = (moveEvent) => {
      let rawWidth = startWidth + (moveEvent.clientX - startX);
      if (wasCollapsed && rawWidth > COLLAPSE_DRAG_THRESHOLD) {
        this._setCollapsed(false, { persist: false, auto: false });
        wasCollapsed = false;
        startX = moveEvent.clientX;
        startWidth = MIN_NAV_WIDTH;
        this._setWidth(startWidth, { persist: false });
        return;
      }

      if (!wasCollapsed && rawWidth < COLLAPSE_DRAG_THRESHOLD) {
        this._setCollapsed(true, { persist: false, auto: false });
        return;
      }

      if (!this.$.navCollapsed) {
        this._setWidth(rawWidth, { persist: false });
      }
    };

    let onUp = () => {
      handle?.classList.remove('dragging');
      nav.removeAttribute('resizing');
      this.removeAttribute('resizing');
      this._isResizing = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      this._autoCollapsed = false;
      persistUiValue(STORAGE_COLLAPSED_PATH, Boolean(this.$.navCollapsed), STORAGE_COLLAPSED_KEY);
      if (!this.$.navCollapsed) {
        persistUiValue(STORAGE_WIDTH_PATH, clampWidth(this.$.navWidth), STORAGE_WIDTH_KEY);
      }
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
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

  _renderNavItems() {
    let chats = dashState.chats || [];

    let projectId = dashState.activeProjectId;
    if (projectId) {
      chats = chats.filter(c => c.projectId === projectId);
    }

    let childMap = new Map();
    let rootChats = [];

    // Formatter helpers
    const getCleanName = (name) => (name || '').replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*/u, '').trim();
    const getStatusHtml = (c) => {
      if (c.pendingTaskId) return `<span class="material-symbols-outlined spin-icon" style="font-size:12px;color:var(--accent-color);margin-left:4px;" title="Running task...">hourglass_empty</span>`;
      if (c.lastTaskStatus === 'done') return `<span class="material-symbols-outlined" style="font-size:12px;color:hsl(140,50%,45%);margin-left:4px;" title="Completed">check_circle</span>`;
      if (c.lastTaskStatus === 'error') return `<span class="material-symbols-outlined" style="font-size:12px;color:hsl(0,60%,50%);margin-left:4px;" title="Error">error</span>`;
      return '';
    };

    for (let chat of chats) {
      if (chat.parentChatId) {
        if (!childMap.has(chat.parentChatId)) {
          childMap.set(chat.parentChatId, []);
        }
        childMap.get(chat.parentChatId).push({
          ...chat,
          cleanName: getCleanName(chat.name),
          icon: chat.agentIcon || 'subdirectory_arrow_right',
          iconStyle: chat.agentColor ? `color:${chat.agentColor}` : '',
          statusHtml: getStatusHtml(chat),
          agentType: chat.adapter, // Classify by adapter type
          isActive: chat.id === dashState.activeChatId
        });
      } else {
        rootChats.push(chat);
      }
    }

    let processedChats = [];
    for (let chat of rootChats) {
      let children = childMap.get(chat.id) || [];
      processedChats.push({
        ...chat,
        cleanName: getCleanName(chat.name),
        icon: chat.agentIcon || 'chat',
        iconStyle: chat.agentColor ? `color:${chat.agentColor}` : '',
        statusHtml: getStatusHtml(chat),
        isActive: chat.id === dashState.activeChatId,
        subChats: children
      });
    }

    // Orphan children
    for (let [parentId, children] of childMap) {
      if (rootChats.some(c => c.id === parentId)) continue;
      for (let child of children) {
        processedChats.push({
          ...child,
          icon: child.agentIcon || 'chat',
          subChats: []
        });
      }
    }

    this.$.chats = processedChats;
  }
}
ChatSidebar.template = template;
ChatSidebar.reg('chat-sidebar');
