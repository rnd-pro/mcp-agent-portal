import { html } from '@symbiotejs/symbiote';

export default html`
<div class="chat-shell">
  <div class="chat-nav">
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

  <div class="chat-view">
    <div class="chat-header">
      <span class="material-symbols-outlined" style="font-size:18px">smart_toy</span>
      <span>{{chatName}}</span>
      <span class="chat-adapter-badge">{{chatAdapter}}</span>
    </div>

    <div class="chat-messages"></div>

    <div class="chat-input-bar">
      <input type="text" ref="chatInput" ${{ oninput: 'onInput', onkeydown: 'onKeyDown' }} placeholder="Type a message...">
      <button ${{ onclick: 'onSend' }}>
        <span class="material-symbols-outlined" style="font-size:18px">send</span>
      </button>
    </div>
  </div>
</div>
`;
