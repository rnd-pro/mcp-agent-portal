import { html } from '@symbiotejs/symbiote';

export default html`
<div class="chat-nav" ${{ onclick: 'onChatClick' }}>
  <div class="chat-nav-header">
    <button class="nav-btn nav-btn-add" ${{ onclick: 'onNewChat' }} title="New chat">
      <span class="material-symbols-outlined">add</span>
    </button>
    <span class="nav-title">Chats</span>
    <div class="nav-spacer"></div>
    <button class="nav-btn" ${{ onclick: 'onToggleNav' }}>
      <span class="material-symbols-outlined chat-nav-collapse-icon">chevron_left</span>
    </button>
  </div>
  <div class="chat-items"></div>
</div>
`;
