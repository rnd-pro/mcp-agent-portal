import { html } from '@symbiotejs/symbiote';

export default html`
<div class="chat-list-item" ref="item" ${{ onclick: '^onChatSelect' }}>
  <div class="chat-item-top">
    <span class="chat-project-badge" ${{ textContent: 'project', hidden: '!project' }}></span>
    <span class="chat-name" ${{ textContent: 'name' }}></span>
    <span class="chat-adapter" ${{ textContent: 'adapter' }}></span>
    <button class="chat-delete" title="Delete" ${{ onclick: '^onChatDelete' }}>×</button>
  </div>
  <div class="chat-preview" ${{ textContent: 'lastMessage', hidden: '!lastMessage' }}></div>
  <div class="chat-meta">
    <span ${{ textContent: 'status' }}></span>
    <span ${{ textContent: 'time' }}></span>
  </div>
</div>
`;
