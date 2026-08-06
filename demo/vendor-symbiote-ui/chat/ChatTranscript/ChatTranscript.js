import Symbiote, { html } from '@symbiotejs/symbiote';
import '../ChatMessageItem/ChatMessageItem.js';
import { translate } from '../../locale/index.js';
import css from './ChatTranscript.css.js';

function emit(el, type, detail = {}) {
  el.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
}

function emitCancelable(el, type, detail = {}) {
  let event = new CustomEvent(type, { bubbles: true, composed: true, cancelable: true, detail });
  el.dispatchEvent(event);
  return event;
}

export class ChatTranscript extends Symbiote {
  static isoMode = true;

  init$ = {
    messageItems: [],
    messageWindow: {
      startIndex: 0,
      count: 0,
      totalItems: 0,
      hasOlder: false,
      hasNewer: false,
    },
    liveStatusActive: false,
    liveStatusIcon: 'pending',
    liveStatusText: '',
    liveStatusIconClass: 'material-symbols-outlined spin-icon',
    onScroll: () => {
      this.updateScrollBottomButton();
      emit(this, 'chat-transcript-scroll', this.getScrollState());
    },
    onScrollToBottom: () => {
      this.scrollToBottom({ smooth: true });
      emit(this, 'chat-transcript-scroll-bottom');
    },
    onMessageItemClick: (event) => {
      this._handleMessageItemClick(event);
    },
  };

  renderCallback() {
    if (!this._messageItemsSubscriptionReady) {
      this._messageItemsSubscriptionReady = true;
      this.sub('messageItems', (items) => {
        this._scheduleEmbedsReady();
        if (items?.length > 0) {
          let wasAtBottom = this._messageItemsWasAtBottom ?? this.isAtBottom(32);
          this._messageItemsWasAtBottom = undefined;
          if (!wasAtBottom) return;
          requestAnimationFrame(() => {
            this.scrollToBottom({ smooth: false });
          });
        }
      });
    }
    this._setupTopSentinelObserver();
  }

  _scheduleEmbedsReady() {
    queueMicrotask(() => {
      requestAnimationFrame(() => this._emitEmbedsReady());
    });
  }

  _emitEmbedsReady() {
    let container = this.getScrollContainer();
    if (!container) return;
    let slots = container.querySelectorAll('[data-embed-key]');
    let embeds = [];
    for (let slot of slots) {
      embeds.push({ key: slot.dataset.embedKey || '', slot });
    }
    emit(this, 'chat-transcript-embeds-ready', { embeds });
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    this._topSentinelObserver?.disconnect?.();
    this._topSentinelObserver = null;
  }

  setMessageItems(items = []) {
    this._messageItemsWasAtBottom = this.isAtBottom(32);
    let next = Array.isArray(items) ? items : [];
    this.$.messageItems = next;
    this._setMessageWindow({
      startIndex: 0,
      count: next.length,
      totalItems: next.length,
      hasOlder: false,
      hasNewer: false,
    });
  }

  replaceMessageWindow(items = [], window = {}) {
    let next = Array.isArray(items) ? items : [];
    this._messageItemsWasAtBottom = this.isAtBottom(32);
    this.$.messageItems = next;
    this._setMessageWindowFromOptions(next, window);
    this._setupTopSentinelObserver();
    this.updateScrollBottomButton();
    return this.getMessageWindow();
  }

  prependMessageItems(items = [], window = {}) {
    let next = Array.isArray(items) ? items : [];
    if (next.length === 0) return this.getMessageWindow();

    let container = this.getScrollContainer();
    let previousScrollHeight = container?.scrollHeight || 0;
    let previousScrollTop = container?.scrollTop || 0;

    this._messageItemsWasAtBottom = false;
    this.$.messageItems = [...next, ...this.$.messageItems];

    let current = this.getMessageWindow();
    this._setMessageWindow({
      startIndex: Number.isFinite(window.startIndex) ? window.startIndex : Math.max(0, current.startIndex - next.length),
      count: Number.isFinite(window.count) ? window.count : current.count + next.length,
      totalItems: Number.isFinite(window.totalItems) ? window.totalItems : Math.max(current.totalItems, current.count + next.length),
      hasOlder: Boolean(window.hasOlder ?? (Number.isFinite(window.startIndex) ? window.startIndex > 0 : current.startIndex > next.length)),
      hasNewer: Boolean(window.hasNewer ?? current.hasNewer),
    });

    if (container) {
      let heightAdded = Math.max(0, (container.scrollHeight || 0) - previousScrollHeight);
      container.scrollTop = previousScrollTop + heightAdded;
      requestAnimationFrame(() => {
        let settledHeightAdded = Math.max(0, (container.scrollHeight || 0) - previousScrollHeight);
        container.scrollTop = previousScrollTop + settledHeightAdded;
        this.updateScrollBottomButton();
      });
    }
    this._setupTopSentinelObserver();
    return this.getMessageWindow();
  }

  getMessageWindow() {
    let win = this.$.messageWindow || {};
    return {
      startIndex: Number.isFinite(win.startIndex) ? win.startIndex : 0,
      count: Number.isFinite(win.count) ? win.count : 0,
      totalItems: Number.isFinite(win.totalItems) ? win.totalItems : 0,
      hasOlder: Boolean(win.hasOlder),
      hasNewer: Boolean(win.hasNewer),
    };
  }

  getScrollContainer() {
    return this.ref.chatMessages || this.querySelector('.chat-messages');
  }

  isAtBottom(tolerance = 10) {
    let container = this.getScrollContainer();
    if (!container) return true;
    return container.scrollHeight - container.scrollTop <= container.clientHeight + tolerance;
  }

  getScrollState() {
    let container = this.getScrollContainer();
    if (!container) return { hasOverflow: false, isAtBottom: true };
    let distanceFromBottom = Math.max(0, container.scrollHeight - container.scrollTop - container.clientHeight);
    let revealThreshold = Math.max(96, Math.round(container.clientHeight * 0.18));
    return {
      hasOverflow: container.scrollHeight > container.clientHeight + 12,
      isAtBottom: distanceFromBottom <= 32,
      distanceFromBottom,
      showScrollBottomButton: distanceFromBottom > revealThreshold,
    };
  }

  scrollToBottom({ smooth = false } = {}) {
    let container = this.getScrollContainer();
    if (!container) return;
    if (smooth && typeof container.scrollTo === 'function') {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    } else {
      container.scrollTop = container.scrollHeight;
    }
    this.updateScrollBottomButton();
  }

  updateScrollBottomButton() {
    let btn = this.ref.scrollBottomBtn;
    if (!btn) return;
    let state = this.getScrollState();
    btn.classList.toggle('visible', state.hasOverflow && state.showScrollBottomButton);
  }

  findStatusBoard(cardIds = []) {
    let container = this.getScrollContainer();
    if (!container || !cardIds?.length) return null;
    let firstCard = container.querySelector(`[data-card-id="${this._cssEscape(cardIds[0])}"]`);
    return firstCard?.closest('.status-board') || null;
  }

  updateStatusCard(cardId, cardData = {}, options = {}) {
    let root = options.board || this.getScrollContainer();
    if (!root || !cardId) return null;
    let card = root.querySelector(`[data-card-id="${this._cssEscape(cardId)}"]`);
    if (!card) return null;

    let status = cardData.status || 'running';
    let isDone = status === 'done' || status === 'error' || status === 'cancelled' || status === 'lost';
    card.dataset.status = isDone ? status : 'running';

    let iconEl = card.querySelector('.status-card-header .material-symbols-outlined');
    if (iconEl) {
      iconEl.className = `material-symbols-outlined ${isDone ? '' : 'spin-icon'}`.trim();
      iconEl.textContent = isDone ? (status === 'done' ? 'check_circle' : 'error') : 'pending';
      iconEl.dataset.status = isDone ? status : 'running';
    }

    let statusEl = card.querySelector('.status-card-status');
    if (statusEl) {
      if (isDone) {
        statusEl.textContent = status === 'done'
          ? translate('chat.message.completed')
          : status === 'error'
            ? translate('chat.message.failed')
            : translate('chat.message.cancelled');
      } else {
        let elapsed = this._formatElapsed(cardData.startedAt || cardData.updatedAt);
        statusEl.textContent = `${translate('chat.message.running')}${elapsed ? ' - ' + elapsed : ''}`;
      }
    }

    if (cardData.linkId && !card.dataset.linkId) {
      card.dataset.linkId = cardData.linkId;
      card.classList.add('status-card-linked');
    }

    let titleEl = card.querySelector('.card-title');
    if (titleEl && cardData.title) {
      titleEl.textContent = cardData.title;
    }

    return card;
  }

  renderLiveStatus(meta) {
    if (!meta) {
      this.$.liveStatusActive = false;
      this.$.liveStatusText = '';
      return;
    }

    let icon = 'pending';
    let text = translate('chat.message.processing');
    let spinClass = 'spin-icon';

    if (meta.phase === 'thinking') {
      text = meta.thinkingStatus || translate('chat.message.thinkingStatus');
    } else if (meta.phase === 'tool') {
      icon = 'build_circle';
      text = translate('chat.message.runningTool', { tool: meta.lastToolName || 'tool' });
    } else if (meta.phase === 'responding') {
      icon = 'edit_note';
      text = translate('chat.message.writingResponse');
      spinClass = '';
    }

    this.set$({
      liveStatusIcon: icon,
      liveStatusText: text,
      liveStatusIconClass: `material-symbols-outlined ${spinClass}`.trim(),
      liveStatusActive: true,
    });
    requestAnimationFrame(() => this.scrollToBottom());
  }

  _setMessageWindowFromOptions(items = [], window = {}) {
    let startIndex = Number.isFinite(window.startIndex) ? window.startIndex : 0;
    let totalItems = Number.isFinite(window.totalItems) ? window.totalItems : items.length;
    this._setMessageWindow({
      startIndex,
      count: Number.isFinite(window.count) ? window.count : items.length,
      totalItems,
      hasOlder: Boolean(window.hasOlder ?? startIndex > 0),
      hasNewer: Boolean(window.hasNewer ?? (startIndex + items.length < totalItems)),
    });
  }

  _setMessageWindow(window = {}) {
    this.$.messageWindow = {
      startIndex: Number.isFinite(window.startIndex) ? window.startIndex : 0,
      count: Number.isFinite(window.count) ? window.count : 0,
      totalItems: Number.isFinite(window.totalItems) ? window.totalItems : 0,
      hasOlder: Boolean(window.hasOlder),
      hasNewer: Boolean(window.hasNewer),
    };
  }

  _setupTopSentinelObserver() {
    if (this._topSentinelObserver || typeof IntersectionObserver === 'undefined') return;
    let sentinel = this.ref.topSentinel;
    let container = this.getScrollContainer();
    if (!sentinel || !container) return;
    this._topSentinelObserver = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      let window = this.getMessageWindow();
      if (!window.hasOlder) return;
      emit(this, 'chat-transcript-load-older', {
        fromIndex: window.startIndex,
        window,
      });
    }, { root: container, threshold: 0 });
    this._topSentinelObserver.observe(sentinel);
  }

  _handleMessageItemClick(event) {
    let copyBtn = event.target.closest('.work-copy-btn');
    if (copyBtn) {
      event.preventDefault();
      event.stopPropagation();
      this._copyMessageText(copyBtn.dataset.copyText || '', copyBtn);
      return;
    }

    let approvalBtn = event.target.closest('.approval-btn');
    if (approvalBtn) {
      event.preventDefault();
      event.stopPropagation();
      let id = approvalBtn.dataset.id || '';
      let action = approvalBtn.dataset.action || '';
      emitCancelable(this, 'chat-approval', { id, action, button: approvalBtn });
      return;
    }

    let actionBtn = event.target.closest('.action-btn');
    if (actionBtn) {
      event.preventDefault();
      event.stopPropagation();
      let id = actionBtn.dataset.id || '';
      let action = actionBtn.dataset.action || '';
      emitCancelable(this, 'chat-action', { id, action, button: actionBtn });
      return;
    }

    let card = event.target.closest('.status-card');
    if (card) {
      emit(this, 'status-card-open', {
        id: card.dataset.cardId || '',
        linkId: card.dataset.linkId || '',
        card,
      });
    }
  }

  _cssEscape(value) {
    let str = String(value || '');
    return globalThis.CSS?.escape ? CSS.escape(str) : str.replace(/["\\]/g, '\\$&');
  }

  _formatElapsed(timestamp) {
    if (!timestamp) return '';
    let seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
    if (seconds < 60) return `${seconds}s`;
    let minutes = Math.floor(seconds / 60);
    let remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    let hours = Math.floor(minutes / 60);
    let remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  async _copyMessageText(text, btn) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        this._copyTextFallback(text);
      }
      this._flashCopyButton(btn, 'check');
      emit(this, 'message-copy', { text, ok: true });
    } catch {
      if (this._copyTextFallback(text)) {
        this._flashCopyButton(btn, 'check');
        emit(this, 'message-copy', { text, ok: true });
      } else {
        this._flashCopyButton(btn, 'error');
        emit(this, 'message-copy', { text, ok: false });
      }
    }
  }

  _copyTextFallback(text) {
    let ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }

  _flashCopyButton(btn, iconName) {
    if (!btn) return;
    let icon = btn.querySelector('.material-symbols-outlined');
    let original = icon?.textContent || 'content_copy';
    btn.classList.add(iconName === 'check' ? 'copied' : 'copy-error');
    if (icon) icon.textContent = iconName;
    setTimeout(() => {
      btn.classList.remove('copied', 'copy-error');
      if (icon) icon.textContent = original;
    }, 1200);
  }
}

ChatTranscript.template = html`
<div class="chat-background" aria-hidden="true">
  <slot name="background"></slot>
</div>
<div ref="chatMessages" class="chat-messages" ${{ onscroll: 'onScroll' }}>
  <div ref="topSentinel" class="chat-top-sentinel" aria-hidden="true"></div>
  <div class="chat-message-list" ${{ itemize: 'messageItems', 'item-tag': 'chat-message-item' }}></div>
  <div class="live-status-indicator" ${{ '@hidden': '!liveStatusActive' }}>
    <span ${{ className: 'liveStatusIconClass' }}>{{liveStatusIcon}}</span>
    <span>{{liveStatusText}}</span>
  </div>
</div>
<button class="scroll-bottom-btn" ref="scrollBottomBtn" title="Scroll to bottom" ${{ onclick: 'onScrollToBottom' }}>
  <span class="material-symbols-outlined">arrow_downward</span>
</button>
`;

ChatTranscript.rootStyles = css;
ChatTranscript.reg('chat-transcript');
