import { Symbiote, html } from '@symbiotejs/symbiote';
import cssLocal from './ChatList.css.js';

const css = `
:host {
  display: block;
}

.ui-item {
  padding: 10px 14px;
  background: transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-bottom: 1px solid var(--sn-node-hover);
  transition: background 0.15s;
}

.ui-item:hover {
  background: var(--sn-node-hover);
}

.ui-item.active {
  background: var(--sn-node-bg);
  border-left: 3px solid var(--sn-node-selected);
  padding-left: 11px;
}
`;

export class ChatItem extends Symbiote {
  init$ = {
    id: '',
    name: '',
    project: '',
    adapter: '',
    status: '',
    time: '',
    lastMessage: '',
    depth: 0,
    isActive: false,
  };

  renderCallback() {
    this.sub('isActive', (isActive) => {
      this.ref.item.classList.toggle('active', isActive);
    });
    this.sub('depth', (depth) => {
      this.ref.item.classList.toggle('chat-item-nested', Number(depth) > 0);
    });
  }
}

ChatItem.template = html`
<div class="ui-item" ref="item" ${{ onclick: '^onChatSelect' }}>
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

ChatItem.rootStyles = css + cssLocal;
ChatItem.reg('cl-chat-item');

export default ChatItem;
