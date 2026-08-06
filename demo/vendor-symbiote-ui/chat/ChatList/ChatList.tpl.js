import { html } from '@symbiotejs/symbiote';

export default html`
<div class="chat-list-shell chat-list">
  <div class="chat-list-header">
    <span class="material-symbols-outlined chat-list-icon">forum</span>
    <span class="chat-list-title" ${{ textContent: 'title' }}></span>
    <sn-button class="chat-list-new-btn" ${{ onclick: 'onNewChat' }}>
      <span class="material-symbols-outlined chat-list-new-btn-icon">add</span>
      <span ${{ textContent: 'newLabel' }}></span>
    </sn-button>
  </div>
  <div class="chat-list-filter-bar">
    <sn-button class="chat-list-filter-btn" data-filter="all" ${{ onclick: 'onFilterClick', textContent: 'filterAllLabel', '@active': 'filterAllActive' }}></sn-button>
    <sn-button class="chat-list-filter-btn" data-filter="project" ${{ onclick: 'onFilterClick', textContent: 'filterProjectLabel', '@active': 'filterProjectActive' }}></sn-button>
    <sn-button class="chat-list-filter-btn" data-filter="active" ${{ onclick: 'onFilterClick', textContent: 'filterActiveLabel', '@active': 'filterActiveActive' }}></sn-button>
  </div>
  <div class="chat-list-content chat-list-items" ref="items" ${{ itemize: 'chatItems', 'item-tag': 'chat-list-item' }}></div>
  <sn-empty-state ${{ '@hidden': '!isEmpty' }}>
    <span class="material-symbols-outlined chat-list-empty-icon">chat_bubble_outline</span>
    <span ${{ textContent: 'emptyMessage' }}></span>
  </sn-empty-state>
</div>
`;
