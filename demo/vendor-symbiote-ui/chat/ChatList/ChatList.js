import Symbiote from '@symbiotejs/symbiote';
import '../ChatListItem/ChatListItem.js';
import '../../control/Button/Button.js';
import '../../display/EmptyState/EmptyState.js';
import template from './ChatList.tpl.js';
import css from './ChatList.css.js';
import { translate } from '../../locale/index.js';

export class ChatList extends Symbiote {
  init$ = {
    filter: 'all',
    chatItems: [],
    title: translate('chat.list.title'),
    newLabel: translate('chat.list.new'),
    emptyMessage: translate('chat.list.empty'),
    filterAllLabel: translate('chat.list.filter.all'),
    filterProjectLabel: translate('chat.list.filter.project'),
    filterActiveLabel: translate('chat.list.filter.active'),
    filterAllActive: true,
    filterProjectActive: false,
    filterActiveActive: false,
    isEmpty: true,
    onFilterClick: (event) => {
      this.setFilter(event.currentTarget?.dataset?.filter || 'all');
    },
    onNewChat: () => {
      this.dispatchEvent(new CustomEvent('chat-list-new', { bubbles: true, composed: true }));
    },
    onChatSelect: (event) => {
      let item = this.getChatItemHost(event);
      if (!item?.$.id) return;
      this.dispatchEvent(new CustomEvent('chat-list-select', {
        bubbles: true,
        composed: true,
        detail: { id: item.$.id, item },
      }));
    },
    onChatDelete: (event) => {
      event.stopPropagation();
      let item = this.getChatItemHost(event);
      if (!item?.$.id) return;
      this.dispatchEvent(new CustomEvent('chat-list-delete', {
        bubbles: true,
        composed: true,
        detail: { id: item.$.id, item },
      }));
    },
  };

  renderCallback() {
    this.syncFilterButtons();
  }

  setItems(items = []) {
    this.$.chatItems = Array.isArray(items) ? items : [];
    this.$.isEmpty = this.$.chatItems.length === 0;
  }

  setEmptyMessage(message) {
    this.$.emptyMessage = message || '';
  }

  setFilter(filter = 'all') {
    this.$.filter = filter || 'all';
    this.syncFilterButtons();
    this.dispatchEvent(new CustomEvent('chat-list-filter', {
      bubbles: true,
      composed: true,
      detail: { filter: this.$.filter },
    }));
  }

  getChatItemHost(event) {
    return event.composedPath?.().find((el) => el?.tagName?.toLowerCase() === 'chat-list-item')
      || event.target?.closest?.('chat-list-item')
      || event.target?.getRootNode?.().host;
  }

  syncFilterButtons() {
    this.$.filterAllActive = this.$.filter === 'all';
    this.$.filterProjectActive = this.$.filter === 'project';
    this.$.filterActiveActive = this.$.filter === 'active';
  }
}

ChatList.template = template;
ChatList.rootStyles = css;
ChatList.reg('chat-list');

export default ChatList;
