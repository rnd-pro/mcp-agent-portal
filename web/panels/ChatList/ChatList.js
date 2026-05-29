import { state as dashState, events as dashEvents, emit as dashEmit } from '../../dashboard-state.js';
import { ChatList as BaseChatList, updateParams } from 'symbiote-node/ui';
import { uiConfirm } from 'symbiote-node/ui';

export class ChatList extends BaseChatList {
  renderCallback() {
    super.renderCallback();
    if (!this._portalEventsBound) {
      this.addEventListener('chat-list-filter', (event) => {
        this.$.filter = event.detail?.filter || 'all';
        this._renderItems();
      });
      this.addEventListener('chat-list-new', () => this._createChat());
      this.addEventListener('chat-list-select', (event) => this._selectChat(event.detail?.item));
      this.addEventListener('chat-list-delete', (event) => this._deleteChat(event.detail?.item));
      dashEvents.addEventListener('chats-updated', () => this._renderItems());
      dashEvents.addEventListener('active-chat-changed', () => this._renderItems());
      dashEvents.addEventListener('active-project-changed', () => this._renderItems());
      this._portalEventsBound = true;
    }
    this._fetchChats();
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
        updateParams({ chat: data.id });
        dashEmit('active-chat-changed', { id: data.id });
        await this._fetchChats();
      }
    } catch (err) {
      console.error('[ChatList] create error:', err);
    }
  }

  _selectChat(host) {
    if (!host?.$.id || dashState.activeChatId === host.$.id) return;
    dashState.activeChatId = host.$.id;
    updateParams({ chat: host.$.id });
    dashEmit('active-chat-changed', { id: host.$.id });
  }

  async _deleteChat(host) {
    if (!host?.$.id) return;
    if (!(await uiConfirm(`Delete "${host.$.name}"?`))) return;
    await fetch('/api/chats/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: host.$.id }),
    });
    if (dashState.activeChatId === host.$.id) {
      dashState.activeChatId = null;
      updateParams({ chat: null });
      dashEmit('active-chat-changed', { id: null });
    }
    this._fetchChats();
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

  _renderItems() {
    let chats = this._getFilteredChats();

    if (chats.length === 0) {
      this.setEmptyMessage('No chats yet. Click "New" to start.');
      this.setItems([]);
      return;
    }

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

    this.setItems(items);
  }
}

ChatList.template = BaseChatList.template;
ChatList.rootStyles = BaseChatList.rootStyles;
ChatList.reg('pg-chat-list');
