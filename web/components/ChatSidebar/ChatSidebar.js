import { Symbiote } from '@symbiotejs/symbiote';
import { state as dashState, events as dashEvents, emit as dashEmit } from "../../dashboard-state.js";
import { setGlobalParam } from 'symbiote-node';
import template from './ChatSidebar.tpl.js';
import { stateSync } from '../../state-sync.js';
import './ChatSidebarItem.js';

export class ChatSidebar extends Symbiote {
  static isoMode = true;

  init$ = {
    navCollapsed: true,
    chats: [],
    
    onToggleNav: () => {
      this.$.navCollapsed = !this.$.navCollapsed;
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
    let saved = localStorage.getItem('pg-chat-sidebar-collapsed');
    if (saved !== null) {
      this.$.navCollapsed = saved === 'true';
    } else {
      this.$.navCollapsed = false;
    }

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
      localStorage.setItem('pg-chat-sidebar-collapsed', String(val));
      let nav = this.querySelector('.chat-nav');
      if (nav) nav.toggleAttribute('collapsed', val);
    });

    this._unsubChats = stateSync.on('chats', (chatsObj) => {
      if (!chatsObj) return;
      dashState.chats = Object.entries(chatsObj)
        .map(([id, c]) => ({ id, ...c }))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      this._renderNavItems();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._unsubChats) this._unsubChats();
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
