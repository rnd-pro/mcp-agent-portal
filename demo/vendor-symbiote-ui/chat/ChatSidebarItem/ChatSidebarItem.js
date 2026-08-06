import Symbiote, { html } from '@symbiotejs/symbiote';
import css from './ChatSidebarItem.css.js';
import { translate } from '../../locale/index.js';

const COMPACT_LABEL_MIN_CH = 6;
const COMPACT_LABEL_MAX_CH = 32;
const COMPACT_LABEL_MIN_PX = 72;
const COMPACT_LABEL_MAX_PX = 320;
const COMPACT_LABEL_EXTRA_PX = 20;
const COMPACT_LABEL_FONT_SIZE_PX = 11;
let compactLabelMeasureContext;

function emit(el, type, detail = {}) {
  el.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
}

export function getCompactChatLabelCh(value = '') {
  let length = [...String(value || '').trim()].length;
  return Math.min(COMPACT_LABEL_MAX_CH, Math.max(COMPACT_LABEL_MIN_CH, length));
}

function readCssPixelValue(element, name, fallback) {
  if (!element || typeof getComputedStyle !== 'function') return fallback;
  let raw = getComputedStyle(element).getPropertyValue(name).trim();
  let calcMatch = raw.match(/(-?\d+(?:\.\d+)?)px(?:\s*\*\s*(-?\d+(?:\.\d+)?))?/);
  let value = calcMatch
    ? Number(calcMatch[1]) * Number(calcMatch[2] || 1)
    : Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function getCompactChatLabelWidthPx(value = '', element = null) {
  let label = String(value || '').trim();
  if (!label || typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  try {
    compactLabelMeasureContext ||= document.createElement('canvas').getContext('2d');
    if (!compactLabelMeasureContext) return null;
    let styles = element && typeof getComputedStyle === 'function' ? getComputedStyle(element) : null;
    let fontSize = readCssPixelValue(element, '--sn-chat-sidebar-title-size', COMPACT_LABEL_FONT_SIZE_PX);
    let fontFamily = styles?.fontFamily || 'Inter, -apple-system, system-ui, sans-serif';
    let minWidth = readCssPixelValue(element, '--sn-chat-sidebar-compact-label-min', COMPACT_LABEL_MIN_PX);
    let maxWidth = readCssPixelValue(element, '--sn-chat-sidebar-compact-label-max', COMPACT_LABEL_MAX_PX);
    let extra = readCssPixelValue(element, '--sn-chat-sidebar-compact-label-extra', COMPACT_LABEL_EXTRA_PX);
    compactLabelMeasureContext.font = `${fontSize}px ${fontFamily}`;
    let measured = Math.ceil(compactLabelMeasureContext.measureText(label).width + extra);
    return Math.min(maxWidth, Math.max(minWidth, measured));
  } catch {
    return null;
  }
}

function syncCompactLabelWidth(element, value) {
  element.style.setProperty('--sn-chat-compact-label-ch', String(getCompactChatLabelCh(value)));
  let width = getCompactChatLabelWidthPx(value, element);
  if (width) {
    element.style.setProperty('--sn-chat-compact-label-width', `${width}px`);
  } else {
    element.style.removeProperty('--sn-chat-compact-label-width');
  }
}

function isRunningChatItem(chat = {}) {
  return Boolean(chat.isRunning || chat.statusKind === 'running');
}

export class ChatSidebarItem extends Symbiote {
  init$ = {
    id: '',
    name: '',
    cleanName: '',
    adapter: '',
    icon: 'chat',
    agentColor: '',
    metaLabel: '',
    statusKind: '',
    statusIcon: '',
    statusTitle: '',
    isGroup: false,
    isExpanded: false,
    isActive: false,
    isRunning: false,
    subChats: [],
    deleteTitle: translate('chat.sidebar.delete'),
    deleteChatLabel: translate('chat.sidebar.deleteChat'),
    toggleChildrenLabel: translate('chat.sidebar.toggleChildren'),

    '+hasChildren': () => this.$.subChats?.length > 0,
    '+hasStatus': () => Boolean(this.$.statusKind && this.$.statusIcon),

    onItemClick: (event) => {
      if (event.target.closest('.chat-item-delete') || event.target.closest('.chat-expand-icon')) return;
      event.stopPropagation();
      if (this.$.isGroup) {
        this.$.isExpanded = !this.$.isExpanded;
        emit(this, 'chat-sidebar-toggle', {
          id: this.$.id,
          expanded: this.$.isExpanded,
          item: this.$,
        });
        return;
      }
      if (this.$.id) emit(this, 'chat-sidebar-select', { id: this.$.id, item: this.$ });
    },

    onExpandToggle: (event) => {
      event.stopPropagation();
      if (!this.$.hasChildren) return;
      this.$.isExpanded = !this.$.isExpanded;
      emit(this, 'chat-sidebar-toggle', {
        id: this.$.id,
        expanded: this.$.isExpanded,
        item: this.$,
      });
    },

    onDelete: (event) => {
      event.stopPropagation();
      if (this.$.id) emit(this, 'chat-sidebar-delete', { id: this.$.id, item: this.$ });
    },
  };

  renderCallback() {
    this.sub('isActive', (value) => {
      this.toggleAttribute('data-active', value);
      this._syncAutoExpanded();
    });
    this.sub('isRunning', () => this._syncAutoExpanded());

    this.sub('isExpanded', (value) => {
      this.toggleAttribute('data-expanded', value);
    });

    this.sub('hasChildren', (value) => {
      this.toggleAttribute('data-has-sub', value);
      if (!value) this.$.isExpanded = false;
    });
    this.sub('isGroup', (value) => {
      this.toggleAttribute('data-group', value);
    });
    this.sub('hasStatus', (value) => this.toggleAttribute('data-has-status', value));
    this.sub('agentColor', (value) => this._syncAgentColor(value));
    this.sub('cleanName', (value) => this._syncCompactLabelWidth(value));
    this._syncAgentColor(this.$.agentColor);
    this._syncCompactLabelWidth(this.$.cleanName || this.$.name);
    this.toggleAttribute('data-group', this.$.isGroup);

    this.sub('subChats', () => this._syncAutoExpanded());
  }

  _syncAutoExpanded() {
    let chats = this.$.subChats || [];
    let hasActiveChild = chats.some((chat) => chat.isActive);
    let hasRunningChild = chats.some(isRunningChatItem);
    if (chats.length && (this.$.isActive || this.$.isRunning || this.$.statusKind === 'running' || hasActiveChild || hasRunningChild)) {
      this.$.isExpanded = true;
    }
  }

  _syncAgentColor(value) {
    if (value) {
      this.style.setProperty('--sn-chat-item-icon-color', value);
    } else {
      this.style.removeProperty('--sn-chat-item-icon-color');
    }
  }

  _syncCompactLabelWidth(value) {
    syncCompactLabelWidth(this, value);
  }

}

ChatSidebarItem.template = html`
<div class="chat-item" ref="row" ${{ '@data-id': 'id', onclick: 'onItemClick' }}>
  <span class="chat-item-icon-slot">
    <span class="material-symbols-outlined chat-icon chat-item-icon" ${{ textContent: 'icon' }}></span>
    <button class="chat-item-delete" ${{ title: 'deleteTitle', '@aria-label': 'deleteChatLabel', onclick: 'onDelete' }}>
      <span class="material-symbols-outlined">delete</span>
    </button>
  </span>
  <span class="chat-item-label" ${{ textContent: 'cleanName' }}></span>
  <span class="material-symbols-outlined chat-status-icon" ${{ textContent: 'statusIcon', title: 'statusTitle', '@data-status': 'statusKind', '@hidden': '!hasStatus' }}></span>
  <span class="chat-item-adapter" ${{ textContent: 'metaLabel' }}></span>
  <span class="material-symbols-outlined chat-expand-icon" role="button" tabindex="0" ${{ title: 'toggleChildrenLabel', '@aria-label': 'toggleChildrenLabel', onclick: 'onExpandToggle' }}>chevron_right</span>
</div>
<div class="chat-sub-items" itemize="subChats" item-tag="chat-sidebar-sub-item" ${{ '@data-parent': 'id' }}></div>
`;

export class ChatSidebarSubItem extends Symbiote {
  init$ = {
    id: '',
    name: '',
    cleanName: '',
    adapter: '',
    icon: 'subdirectory_arrow_right',
    agentColor: '',
    statusKind: '',
    statusIcon: '',
    statusTitle: '',
    metaLabel: '',
    isExpanded: false,
    isActive: false,
    isRunning: false,
    subChats: [],
    deleteTitle: translate('chat.sidebar.delete'),
    deleteChatLabel: translate('chat.sidebar.deleteChat'),

    '+hasChildren': () => this.$.subChats?.length > 0,
    '+hasStatus': () => Boolean(this.$.statusKind && this.$.statusIcon),

    onItemClick: (event) => {
      if (event.target.closest('.chat-item-delete') || event.target.closest('.chat-expand-icon')) return;
      event.stopPropagation();
      if (this.$.id) emit(this, 'chat-sidebar-select', { id: this.$.id, item: this.$ });
    },

    onExpandToggle: (event) => {
      event.stopPropagation();
      if (!this.$.hasChildren) return;
      this.$.isExpanded = !this.$.isExpanded;
      emit(this, 'chat-sidebar-toggle', {
        id: this.$.id,
        expanded: this.$.isExpanded,
        item: this.$,
      });
    },

    onDelete: (event) => {
      event.stopPropagation();
      if (this.$.id) emit(this, 'chat-sidebar-delete', { id: this.$.id, item: this.$ });
    },
  };

  renderCallback() {
    this.sub('isActive', (value) => {
      this.toggleAttribute('data-active', value);
      this._syncAutoExpanded();
    });
    this.sub('isRunning', () => this._syncAutoExpanded());
    this.sub('isExpanded', (value) => {
      this.toggleAttribute('data-expanded', value);
    });
    this.sub('hasChildren', (value) => {
      this.toggleAttribute('data-has-sub', value);
      if (!value) this.$.isExpanded = false;
    });
    this.sub('hasStatus', (value) => this.toggleAttribute('data-has-status', value));
    this.sub('agentColor', (value) => this._syncAgentColor(value));
    this.sub('cleanName', (value) => this._syncCompactLabelWidth(value));
    this._syncAgentColor(this.$.agentColor);
    this._syncCompactLabelWidth(this.$.cleanName || this.$.name);
    this.sub('subChats', () => this._syncAutoExpanded());
  }

  _syncAutoExpanded() {
    let chats = this.$.subChats || [];
    let hasActiveChild = chats.some((chat) => chat.isActive);
    let hasRunningChild = chats.some(isRunningChatItem);
    if (chats.length && (this.$.isActive || this.$.isRunning || this.$.statusKind === 'running' || hasActiveChild || hasRunningChild)) {
      this.$.isExpanded = true;
    }
  }

  _syncAgentColor(value) {
    if (value) {
      this.style.setProperty('--sn-chat-item-icon-color', value);
    } else {
      this.style.removeProperty('--sn-chat-item-icon-color');
    }
  }

  _syncCompactLabelWidth(value) {
    syncCompactLabelWidth(this, value);
  }

}

ChatSidebarSubItem.template = html`
<div class="chat-item-child" ref="row" ${{ '@data-id': 'id', onclick: 'onItemClick' }}>
  <span class="chat-item-icon-slot">
    <span class="material-symbols-outlined chat-icon chat-item-icon" ${{ textContent: 'icon' }}></span>
    <button class="chat-item-delete" ${{ title: 'deleteTitle', '@aria-label': 'deleteChatLabel', onclick: 'onDelete' }}>
      <span class="material-symbols-outlined">delete</span>
    </button>
  </span>
  <span class="chat-item-label" ${{ textContent: 'cleanName' }}></span>
  <span class="chat-item-type" ${{ textContent: 'metaLabel' }}></span>
  <span class="material-symbols-outlined chat-status-icon" ${{ textContent: 'statusIcon', title: 'statusTitle', '@data-status': 'statusKind', '@hidden': '!hasStatus' }}></span>
  <span class="material-symbols-outlined chat-expand-icon" role="button" tabindex="0" ${{ title: 'toggleChildrenLabel', '@aria-label': 'toggleChildrenLabel', onclick: 'onExpandToggle' }}>chevron_right</span>
</div>
<div class="chat-sub-items" itemize="subChats" item-tag="chat-sidebar-sub-item" ${{ '@data-parent': 'id' }}></div>
`;

ChatSidebarItem.rootStyles = css;
ChatSidebarSubItem.rootStyles = css;
ChatSidebarSubItem.reg('chat-sidebar-sub-item');
ChatSidebarItem.reg('chat-sidebar-item');
