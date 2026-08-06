import { html } from '@symbiotejs/symbiote';

export default html`
<div class="chat-nav" ${{ '@collapsed': 'navCollapsed', '@data-group-dividers': 'groupDividers' }}>
  <div class="chat-nav-header">
    <button class="nav-btn nav-btn-add" ${{ onclick: 'onNewChat', title: 'newChatTitle' }}>
      <span class="material-symbols-outlined">add</span>
    </button>
    <span class="nav-title" ${{ textContent: 'title' }}></span>
    <div class="nav-spacer"></div>
    <button class="nav-btn" ${{ onclick: 'onToggleNav' }}>
      <span class="material-symbols-outlined chat-nav-collapse-icon">chevron_left</span>
    </button>
  </div>
  <div class="chat-items" itemize="chats" item-tag="chat-sidebar-item"></div>
  <div class="chat-nav-resize-handle" ${{ onpointerdown: 'onResizeStart' }}></div>
</div>
`;
