import Symbiote from '@symbiotejs/symbiote';
import '../ChatSidebarItem/ChatSidebarItem.js';
import template from './ChatSidebar.tpl.js';
import css from './ChatSidebar.css.js';
import { translate } from '../../locale/index.js';
import {
  AUTO_COLLAPSE_WIDTH,
  AUTO_UNCOLLAPSE_WIDTH,
  COLLAPSE_DRAG_THRESHOLD,
  COLLAPSED_NAV_WIDTH,
  DEFAULT_NAV_WIDTH,
  MAX_NAV_WIDTH,
  MIN_NAV_WIDTH,
  clampChatSidebarWidth,
} from './constants.js';

export {
  AUTO_COLLAPSE_WIDTH,
  AUTO_UNCOLLAPSE_WIDTH,
  COLLAPSE_DRAG_THRESHOLD,
  COLLAPSED_NAV_WIDTH,
  DEFAULT_NAV_WIDTH,
  MAX_NAV_WIDTH,
  MIN_NAV_WIDTH,
  clampChatSidebarWidth,
} from './constants.js';

function emit(el, type, detail = {}) {
  el.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
}

const COLLAPSED_NAV_WIDTH_TOKEN = [
  'var(--sn-chat-sidebar-collapsed-width,',
  'var(--sn-layout-header-block-size, calc(var(--sn-layout-header-min-height, 28px) + 3px)))',
].join(' ');

function readCssPixelValue(element, name, fallback) {
  if (typeof getComputedStyle !== 'function') return fallback;
  let raw = getComputedStyle(element).getPropertyValue(name).trim();
  let calcMatch = raw.match(/(-?\d+(?:\.\d+)?)px(?:\s*\*\s*(-?\d+(?:\.\d+)?))?/);
  let value = calcMatch
    ? Number(calcMatch[1]) * Number(calcMatch[2] || 1)
    : Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

export class ChatSidebarShell extends Symbiote {
  static isoMode = true;

  static get observedAttributes() {
    return ['auto-collapse'];
  }

  init$ = {
    navCollapsed: true,
    navWidth: DEFAULT_NAV_WIDTH,
    groupDividers: true,
    autoCollapse: true,
    chats: [],
    title: translate('chat.sidebar.title'),
    newChatTitle: translate('chat.sidebar.new'),
    onToggleNav: () => {
      this._autoCollapsed = false;
      this.setCollapsed(!this.$.navCollapsed);
    },
    onResizeStart: (event) => {
      this._startResize(event);
    },
    onNewChat: () => {
      emit(this, 'chat-sidebar-new');
    },
  };

  initCallback() {
    this.$.autoCollapse = this._readAutoCollapseAttribute();

    this.sub('navCollapsed', (value) => {
      this._applyNavWidth();
      emit(this, 'chat-sidebar-collapse-change', {
        collapsed: Boolean(value),
        auto: Boolean(this._autoCollapsed),
      });
    });

    this.sub('navWidth', (value) => {
      this._applyNavWidth();
      emit(this, 'chat-sidebar-width-change', {
        width: clampChatSidebarWidth(Number(value) || DEFAULT_NAV_WIDTH),
      });
    });

    if (typeof ResizeObserver === 'function') {
      this._resizeObserver = new ResizeObserver(() => this._syncCollapseForAvailableWidth());
      let shell = this.closest('.chat-shell') || this.parentElement;
      if (shell) this._resizeObserver.observe(shell);
    }

    queueMicrotask(() => {
      this._applyNavWidth();
      this._syncCollapseForAvailableWidth();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._resizeObserver?.disconnect();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    super.attributeChangedCallback?.(name, oldValue, newValue);
    if (oldValue === newValue || name !== 'auto-collapse') return;
    this.setAutoCollapse(this._readAutoCollapseAttribute());
  }

  setChats(chats = []) {
    this.$.chats = Array.isArray(chats) ? chats : [];
  }

  setCollapsed(collapsed, { auto = false } = {}) {
    this._autoCollapsed = auto;
    this.$.navCollapsed = Boolean(collapsed);
  }

  setAutoCollapse(enabled) {
    this.$.autoCollapse = Boolean(enabled);
    if (!this.$.autoCollapse && this._autoCollapsed) {
      this.setCollapsed(false, { auto: false });
      return;
    }
    this._syncCollapseForAvailableWidth();
  }

  setWidth(width) {
    this._hasExplicitNavWidth = true;
    this.$.navWidth = clampChatSidebarWidth(Number(width) || DEFAULT_NAV_WIDTH);
  }

  setGroupDividers(enabled) {
    this.$.groupDividers = Boolean(enabled);
  }

  _applyNavWidth() {
    if (this.$.navCollapsed) {
      this.style.setProperty('--chat-nav-width', COLLAPSED_NAV_WIDTH_TOKEN);
    } else if (this._hasExplicitNavWidth) {
      this.style.setProperty('--chat-nav-width', `${clampChatSidebarWidth(this.$.navWidth)}px`);
    } else {
      this.style.setProperty('--chat-nav-width', 'var(--sn-chat-sidebar-width, 200px)');
    }
    this.toggleAttribute('collapsed', this.$.navCollapsed);
  }

  _syncCollapseForAvailableWidth() {
    if (!this.$.autoCollapse) return;
    if (this._isResizing) return;
    let shell = this.closest('.chat-shell') || this.parentElement;
    if (!shell) return;
    let width = shell.getBoundingClientRect().width;
    if (width <= AUTO_COLLAPSE_WIDTH && !this.$.navCollapsed) {
      this.setCollapsed(true, { auto: true });
    } else if (width >= AUTO_UNCOLLAPSE_WIDTH && this.$.navCollapsed && this._autoCollapsed) {
      this.setCollapsed(false, { auto: false });
    }
  }

  _readAutoCollapseAttribute() {
    let value = this.getAttribute('auto-collapse');
    return value === null || (value !== 'false' && value !== 'never');
  }

  _startResize(event) {
    event.preventDefault();
    event.stopPropagation();

    let nav = this.querySelector('.chat-nav');
    let handle = this.querySelector('.chat-nav-resize-handle');
    if (!nav) return;

    let startX = event.clientX;
    let navWidth = nav.getBoundingClientRect().width;
    let startWidth = this.$.navCollapsed
      ? (navWidth > 0 ? navWidth : readCssPixelValue(this, '--sn-chat-sidebar-collapsed-width', COLLAPSED_NAV_WIDTH))
      : navWidth;
    let wasCollapsed = this.$.navCollapsed;
    this._isResizing = true;
    this.setAttribute('resizing', '');
    handle?.classList.add('dragging');
    nav.setAttribute('resizing', '');

    let onMove = (moveEvent) => {
      let rawWidth = startWidth + (moveEvent.clientX - startX);
      if (wasCollapsed && rawWidth > COLLAPSE_DRAG_THRESHOLD) {
        this.setCollapsed(false);
        wasCollapsed = false;
        startX = moveEvent.clientX;
        startWidth = MIN_NAV_WIDTH;
        this.setWidth(startWidth);
        return;
      }

      if (!wasCollapsed && rawWidth < COLLAPSE_DRAG_THRESHOLD) {
        this.setCollapsed(true);
        return;
      }

      if (!this.$.navCollapsed) {
        this.setWidth(rawWidth);
      }
    };

    let onUp = () => {
      handle?.classList.remove('dragging');
      nav.removeAttribute('resizing');
      this.removeAttribute('resizing');
      this._isResizing = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      this._autoCollapsed = false;
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

}

ChatSidebarShell.template = template;
ChatSidebarShell.rootStyles = css;
ChatSidebarShell.reg('chat-sidebar-shell');
