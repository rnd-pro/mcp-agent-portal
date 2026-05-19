import { html } from '@symbiotejs/symbiote';

export default html`
<div class="ui-sidebar cl-sidebar">
  <div class="ui-sidebar-header">
    <span class="material-symbols-outlined cl-sidebar-icon">forum</span>
    <span class="ui-title cl-title">Chats</span>
    <button class="ui-btn cl-new-btn" ref="newChatBtn">
      <span class="material-symbols-outlined cl-new-btn-icon">add</span>
      New
    </button>
  </div>
  <div class="filter-bar">
    <button class="filter-btn" active data-filter="all">All</button>
    <button class="filter-btn" data-filter="project">By Project</button>
    <button class="filter-btn" data-filter="active">Active</button>
  </div>
  <div class="ui-sidebar-content cl-items" ref="chatItems" ${{ itemize: 'chatItems', 'item-tag': 'cl-chat-item' }}></div>
</div>
`;
