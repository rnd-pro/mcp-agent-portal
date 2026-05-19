import Symbiote, { html } from '@symbiotejs/symbiote';
import { state as dashState, emit as dashEmit } from "../../dashboard-state.js";
import { setGlobalParam } from 'symbiote-node';

export class ChatSidebarItem extends Symbiote {
  init$ = {
    id: '',
    name: '',
    cleanName: '',
    adapter: '',
    icon: 'chat',
    iconStyle: '',
    statusHtml: '',
    hasChildren: false,
    isExpanded: false,
    isActive: false,
    subChats: [],

    onItemClick: (e) => {
      // Ignore if clicking delete or expand
      if (e.target.closest('.chat-item-delete') || e.target.closest('.chat-expand-icon')) return;
      
      let chatId = this.$.id;
      if (chatId && dashState.activeChatId !== chatId) {
        dashState.activeChatId = chatId;
        setGlobalParam('chat', chatId);
        dashEmit('active-chat-changed', { id: chatId });
      }
    },

    onExpandToggle: (e) => {
      e.stopPropagation();
      if (!this.$.hasChildren) return;
      this.$.isExpanded = !this.$.isExpanded;
    },

    onDelete: async (e) => {
      e.stopPropagation();
      let chatId = this.$.id;
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
      // Emit an event to parent to refresh chats
      this.dispatchEvent(new CustomEvent('chats-updated', { bubbles: true, composed: true }));
    }
  };

  renderCallback() {
    this.sub('isActive', (val) => {
      this.toggleAttribute('data-active', val);
    });

    this.sub('isExpanded', (val) => {
      this.toggleAttribute('data-expanded', val);
    });

    this.sub('hasChildren', (val) => {
      this.toggleAttribute('data-has-sub', val);
      if (!val) this.$.isExpanded = false;
    });

    this.sub('subChats', (chats) => {
      let has = chats && chats.length > 0;
      this.$.hasChildren = has;
    });
  }
}

ChatSidebarItem.template = html`
<div class="chat-item" ${{ onclick: 'onItemClick' }}>
  <span class="chat-item-icon-slot">
    <span class="material-symbols-outlined chat-icon chat-item-icon" ${{ textContent: 'icon', style: 'iconStyle' }}></span>
    <button class="chat-item-delete" title="Delete" ${{ onclick: 'onDelete' }}>
      <span class="material-symbols-outlined">delete</span>
    </button>
  </span>
  <span class="chat-item-label" ${{ textContent: 'cleanName' }}></span>
  <span class="chat-status-container" ${{ innerHTML: 'statusHtml' }}></span>
  <span class="chat-item-adapter" ${{ textContent: 'adapter' }}></span>
  <span class="material-symbols-outlined chat-expand-icon" ${{ onclick: 'onExpandToggle' }}>chevron_right</span>
</div>
<div class="chat-sub-items" itemize="subChats" item-tag="chat-sidebar-sub-item"></div>
`;



export class ChatSidebarSubItem extends Symbiote {
  init$ = {
    id: '',
    name: '',
    cleanName: '',
    adapter: '',
    icon: 'subdirectory_arrow_right',
    iconStyle: '',
    statusHtml: '',
    agentType: '',
    isActive: false,

    onItemClick: (e) => {
      if (e.target.closest('.chat-item-delete')) return;
      
      let chatId = this.$.id;
      if (chatId && dashState.activeChatId !== chatId) {
        dashState.activeChatId = chatId;
        setGlobalParam('chat', chatId);
        dashEmit('active-chat-changed', { id: chatId });
      }
    },

    onDelete: async (e) => {
      e.stopPropagation();
      let chatId = this.$.id;
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
      this.dispatchEvent(new CustomEvent('chats-updated', { bubbles: true, composed: true }));
    }
  };

  renderCallback() {
    this.sub('isActive', (val) => {
      this.toggleAttribute('data-active', val);
    });
  }
}

ChatSidebarSubItem.template = html`
<div class="chat-item-child" ${{ onclick: 'onItemClick' }}>
  <span class="chat-item-icon-slot">
    <span class="material-symbols-outlined chat-icon chat-item-icon" ${{ textContent: 'icon', style: 'iconStyle' }}></span>
    <button class="chat-item-delete" title="Delete" ${{ onclick: 'onDelete' }}>
      <span class="material-symbols-outlined">delete</span>
    </button>
  </span>
  <span class="chat-item-label" ${{ textContent: 'cleanName' }}></span>
  <span class="chat-item-type" ${{ textContent: 'agentType' }}></span>
  <span class="chat-status-container" ${{ innerHTML: 'statusHtml' }}></span>
</div>
`;

ChatSidebarSubItem.reg('chat-sidebar-sub-item');
ChatSidebarItem.reg('chat-sidebar-item');
