import { Symbiote } from '@symbiotejs/symbiote';
import { state as dashState, events as dashEvents, emit as dashEmit } from "../../dashboard-state.js";
import { setGlobalParam } from 'symbiote-node';
import template from './ChatSidebar.tpl.js';

const STORAGE_KEY_CHAT_NAV = 'sn-chat-nav-collapsed';

export class ChatSidebar extends Symbiote {
  static isoMode = true;

  init$ = {
    navCollapsed: false,
    
    onToggleNav: () => {
      this.$.navCollapsed = !this.$.navCollapsed;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_CHAT_NAV, this.$.navCollapsed ? 'true' : 'false');
      }
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
        if (this.$.navCollapsed) this.$.onToggleNav();
      }
    }
  }

  initCallback() {
    if (typeof localStorage !== 'undefined') {
      let stored = localStorage.getItem(STORAGE_KEY_CHAT_NAV);
      if (stored === 'true') {
        this.$.navCollapsed = true;
      }
    }

    this._fetchChats();
    dashEvents.addEventListener('chats-updated', () => this._fetchChats());
    dashEvents.addEventListener('active-project-changed', () => this._renderNavItems());
    dashEvents.addEventListener('active-chat-changed', () => this._renderNavItems());
    
    this.sub('navCollapsed', (val) => {
      let nav = this.querySelector('.chat-nav');
      if (nav) nav.toggleAttribute('collapsed', val);
    });
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
    let container = this.querySelector('.chat-items');
    if (!container) return;
    container.innerHTML = '';

    let chats = dashState.chats || [];

    let projectId = dashState.activeProjectId;
    if (projectId) {
      // Project scope: show ONLY chats bound to this project
      chats = chats.filter(c => c.projectId === projectId);
    }

    // Build parent-child map
    let childMap = new Map();
    let rootChats = [];

    for (let chat of chats) {
      if (chat.parentChatId) {
        if (!childMap.has(chat.parentChatId)) {
          childMap.set(chat.parentChatId, []);
        }
        childMap.get(chat.parentChatId).push(chat);
      } else {
        rootChats.push(chat);
      }
    }

    for (let chat of rootChats) {
      let children = childMap.get(chat.id) || [];
      let hasChildren = children.length > 0;

      this._renderChatItem(container, chat, hasChildren, false);

      if (hasChildren) {
        let subContainer = document.createElement('div');
        subContainer.className = 'chat-sub-items';
        subContainer.dataset.parent = chat.id;

        for (let child of children) {
          this._renderChatItem(subContainer, child, false, true);
        }
        container.appendChild(subContainer);
      }
    }

    // Orphan children
    for (let [parentId, children] of childMap) {
      if (rootChats.some(c => c.id === parentId)) continue;
      for (let child of children) {
        this._renderChatItem(container, child, false, false);
      }
    }
  }

  _renderChatItem(container, chat, hasChildren, isChild) {
    let div = document.createElement('div');
    div.className = 'chat-item';
    div.dataset.id = chat.id;
    if (isChild) div.classList.add('chat-item-child');
    if (chat.id === dashState.activeChatId) div.setAttribute('active', '');

    let expandHtml = '';
    if (hasChildren) {
      expandHtml = `<span class="material-symbols-outlined chat-expand-icon">chevron_right</span>`;
    }

    let icon = isChild ? 'subdirectory_arrow_right' : 'chat';

    div.innerHTML = `
      ${expandHtml}
      <span class="material-symbols-outlined">${icon}</span>
      <span class="chat-item-label">${chat.name}</span>
      <span class="chat-item-adapter">${chat.adapter}</span>
      <button class="chat-item-delete" title="Delete">×</button>
    `;

    container.appendChild(div);
  }
}
ChatSidebar.template = template;
ChatSidebar.reg('chat-sidebar');
