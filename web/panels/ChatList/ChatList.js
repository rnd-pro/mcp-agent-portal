import { Symbiote } from '@symbiotejs/symbiote';
import { state as dashState, events as dashEvents, emit as dashEmit } from '../../dashboard-state.js';
import { setGlobalParam } from 'symbiote-node';
import cssLocal from './ChatList.css.js';
import cssShared from '../../common/ui-shared.css.js';
import tpl from './ChatList.tpl.js';
import { uiConfirm } from '../../common/ui-dialogs.js';
import './ChatItem.js';

export class ChatList extends Symbiote {
  init$ = {
    filter: 'all',
    chatItems: [],
    onChatSelect: (e) => {
      if (e.target.closest?.('.chat-delete')) return;
      let host = this._getChatHost(e);
      if (!host?.$.id || dashState.activeChatId === host.$.id) return;
      dashState.activeChatId = host.$.id;
      setGlobalParam('chat', host.$.id);
      dashEmit('active-chat-changed', { id: host.$.id });
    },
    onChatDelete: async (e) => {
      e.stopPropagation();
      let host = this._getChatHost(e);
      if (!host?.$.id) return;
      if (!(await uiConfirm(`Delete "${host.$.name}"?`))) return;
      await fetch('/api/chats/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: host.$.id }),
      });
      if (dashState.activeChatId === host.$.id) {
        dashState.activeChatId = null;
        setGlobalParam('chat', null);
        dashEmit('active-chat-changed', { id: null });
      }
      this._fetchChats();
    },
  };

  renderCallback() {
    this._fetchChats();

    // Filter buttons
    this.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.querySelectorAll('.filter-btn').forEach(b => b.removeAttribute('active'));
        btn.setAttribute('active', '');
        this.$.filter = btn.dataset.filter;
        this._renderItems();
      });
    });

    // New chat button
    this.ref.newChatBtn.addEventListener('click', () => this._createChat());

    // Listen for chat updates
    dashEvents.addEventListener('chats-updated', () => this._renderItems());
    dashEvents.addEventListener('active-chat-changed', () => this._renderItems());
    dashEvents.addEventListener('active-project-changed', () => this._renderItems());
  }

  async _fetchChats() {
    try {
      let res = await fetch('/api/chats');
      let data = await res.json();
      dashState.chats = data.chats || [];
      this._renderItems();
    } catch (err) {
      console.error('[ChatList] fetch error:', err);
    }
  }

  async _createChat() {
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
      console.error('[ChatList] create error:', err);
    }
  }

  _getFilteredChats() {
    let chats = dashState.chats || [];
    let filter = this.$.filter;
    let activeProjectId = dashState.activeProjectId;

    if (filter === 'project' && activeProjectId) {
      return chats.filter(c => c.projectId === activeProjectId);
    }
    if (filter === 'active') {
      return chats.filter(c => c.messageCount > 0);
    }
    return chats;
  }

  _formatTime(ts) {
    if (!ts) return '';
    let d = new Date(ts);
    let now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  _getChatHost(e) {
    return e.composedPath?.().find(el => el?.tagName?.toLowerCase() === 'cl-chat-item')
      || e.target?.closest?.('cl-chat-item')
      || e.target?.getRootNode?.().host;
  }

  _renderItems() {
    let container = this.ref.chatItems;

    let chats = this._getFilteredChats();

    if (chats.length === 0) {
      this.$.chatItems = [];
      container.innerHTML = `
        <div class="ui-empty-state">
          <span class="material-symbols-outlined" style="font-size:32px;display:block;margin-bottom:8px;opacity:0.3">chat_bubble_outline</span>
          No chats yet. Click "New" to start.
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    let items = [];
    let chatsById = new Map();
    let childrenByParentId = new Map();
    for (let chat of chats) {
      chatsById.set(chat.id, chat);
      let pid = chat.parentChatId;
      if (pid) {
        if (!childrenByParentId.has(pid)) childrenByParentId.set(pid, []);
        childrenByParentId.get(pid).push(chat);
      }
    }

    let renderChatNode = (chat, depth) => {
      let projectName = '';
      if (chat.projectId) {
        let proj = (dashState.projectHistory || []).find(p => p.id === chat.projectId);
        projectName = proj?.name || '';
      }

      items.push({
        id: chat.id,
        name: chat.name,
        project: projectName && depth === 0 ? projectName : '',
        adapter: chat.adapter,
        status: `${chat.messageCount || 0} msgs`,
        time: this._formatTime(chat.updatedAt),
        lastMessage: chat.lastMessage || '',
        depth,
        isActive: chat.id === dashState.activeChatId,
      });

      let children = childrenByParentId.get(chat.id) || [];
      // Children are already sorted by updatedAt from _getFilteredChats, but we can ensure stability
      children.sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));
      for (let child of children) {
        renderChatNode(child, depth + 1);
      }
    };

    // Render roots (chats with no parent, or parent isn't in the filtered list)
    for (let chat of chats) {
      if (!chat.parentChatId || !chatsById.has(chat.parentChatId)) {
        renderChatNode(chat, 0);
      }
    }

    this.$.chatItems = items;
  }
}

ChatList.template = tpl;
ChatList.rootStyles = cssShared + cssLocal;
ChatList.reg('pg-chat-list');
