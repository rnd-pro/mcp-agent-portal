import Symbiote from '@symbiotejs/symbiote';
import '../ChatSidebar/ChatSidebar.js';
import '../ChatTranscript/ChatTranscript.js';
import '../ChatComposer/ChatComposer.js';
import '../../effects/CellBg/CellBg.js';
import template from './ChatWorkspace.tpl.js';
import css from './ChatWorkspace.css.js';
import { normalizeChatNavItem } from './chat-nav-tree.js';

const BACKGROUND_ACTIVE_STATES = new Set([
  'active',
  'listening',
  'running',
  'speaking',
  'start',
  'streaming',
  'thinking',
  'tool',
  'responding',
]);
const BACKGROUND_PULSE_STATES = new Set(['activity', 'pulse', 'trigger']);
const BACKGROUND_STOP_STATES = new Set([
  'cancelled',
  'complete',
  'completed',
  'disabled',
  'done',
  'error',
  'idle',
  'stop',
]);

function emit(el, type, detail = {}) {
  el.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
}

function normalizeBackgroundInput(input = {}) {
  if (typeof input === 'string') return { state: input };
  return input && typeof input === 'object' ? input : {};
}

function normalizePixelValue(value = 0) {
  let number = Number.parseFloat(value);
  return Number.isFinite(number) && number > 0 ? Math.ceil(number) : 0;
}

export class ChatWorkspace extends Symbiote {
  static isoMode = true;

  static get observedAttributes() {
    return ['sidebar', 'empty'];
  }

  init$ = {
    sidebar: 'visible',
  };

  initCallback() {
    this._chats = [];
    this._activeChatId = '';
    this._bindWorkspaceEvents();
    queueMicrotask(() => this._syncSidebarAttribute());
  }

  attributeChangedCallback(name, oldValue, newValue) {
    super.attributeChangedCallback?.(name, oldValue, newValue);
    if (oldValue === newValue) return;
    if (name === 'sidebar') {
      this.$.sidebar = newValue || 'visible';
      this._syncSidebarAttribute();
    }
  }

  getSidebar() {
    return this.ref.sidebar || this.querySelector('chat-sidebar-shell');
  }

  getTranscript() {
    return this.ref.transcript || this.querySelector('chat-transcript');
  }

  getComposer() {
    return this.ref.composer || this.querySelector('chat-composer');
  }

  getBackground() {
    return this.ref.background || this.querySelector('cell-bg');
  }

  setWorkspaceState(state = {}) {
    if (!state || typeof state !== 'object') return;
    if ('sidebar' in state) this.setAttribute('sidebar', state.sidebar || 'visible');
    if ('chats' in state) this.setChats(state.chats, { activeId: state.activeChatId });
    if ('activeChatId' in state) this.setActiveChatId(state.activeChatId);
    if ('empty' in state) this.setEmpty(state.empty);
    if ('messages' in state || 'messageItems' in state) {
      let messageItems = state.messageItems || state.messages || [];
      if ('messageWindow' in state) {
        this.replaceMessageWindow(messageItems, state.messageWindow || {});
      } else {
        this.setMessages(messageItems, state.messagesOptions || {});
      }
    }
    if ('composer' in state) this.setComposerState(state.composer || {});
    if ('voiceControls' in state) this.setVoiceControls(state.voiceControls || {});
    if ('liveStatus' in state) this.setLiveStatus(state.liveStatus);
    if ('overlayStackReserve' in state || 'overlayReserve' in state) {
      this.setOverlayStackReserve(state.overlayStackReserve ?? state.overlayReserve);
    }
    if ('background' in state || 'backgroundState' in state) {
      this.setBackgroundState(state.backgroundState || state.background || {});
    }
  }

  setChats(chats = [], { activeId = this._activeChatId } = {}) {
    this._chats = Array.isArray(chats) ? chats : [];
    this._activeChatId = String(activeId || this._activeChatId || '');
    let normalize = (item = {}) => {
      let children = Array.isArray(item.subChats)
        ? item.subChats
        : Array.isArray(item.children)
          ? item.children
          : [];
      return normalizeChatNavItem(item, children.map(normalize), { activeChatId: this._activeChatId });
    };
    this.getSidebar()?.setChats(this._chats.map(normalize));
  }

  setActiveChatId(activeId = '') {
    this._activeChatId = String(activeId || '');
    this.setChats(this._chats, { activeId: this._activeChatId });
  }

  setEmpty(empty = true) {
    this.toggleAttribute('empty', Boolean(empty));
  }

  setMessages(items = [], { scrollToBottom = true, smooth = false } = {}) {
    let transcript = this.getTranscript();
    transcript?.setMessageItems(Array.isArray(items) ? items : []);
    if (scrollToBottom) {
      queueMicrotask(() => transcript?.scrollToBottom?.({ smooth }));
    }
  }

  replaceMessageWindow(items = [], window = {}) {
    return this.getTranscript()?.replaceMessageWindow?.(Array.isArray(items) ? items : [], window) || null;
  }

  prependMessages(items = [], window = {}) {
    return this.getTranscript()?.prependMessageItems?.(Array.isArray(items) ? items : [], window) || null;
  }

  getMessageWindow() {
    return this.getTranscript()?.getMessageWindow?.() || {
      startIndex: 0,
      count: 0,
      totalItems: 0,
      hasOlder: false,
      hasNewer: false,
    };
  }

  setComposerState(state = {}) {
    let composer = this.getComposer();
    if (!composer || !state || typeof state !== 'object') return;
    if ('value' in state) {
      let oldValue = composer.$.value;
      let newValue = state.value || '';
      composer.setValue(state.value);
      let isSendingNow = state.sending ?? state.isSending ?? composer.$.isSending;
      if (newValue !== oldValue && newValue && !isSendingNow) {
        this.triggerBackground();
      }
    }
    if ('attachedContext' in state) composer.setAttachedContext(state.attachedContext);
    if ('leadingControls' in state) composer.setLeadingControls(state.leadingControls);
    if ('footerControls' in state) composer.setFooterControls(state.footerControls);
    if ('footerHtml' in state) composer.setFooterHtml(state.footerHtml);
    if ('disabled' in state) composer.setDisabled(state.disabled);
    if ('placeholder' in state) composer.setPlaceholder(state.placeholder);
    if ('sending' in state || 'isSending' in state) composer.setSending(state.sending ?? state.isSending);
    if ('voiceControls' in state) composer.setVoiceControls(state.voiceControls || {});
    if ('voicePreview' in state) {
      if (state.voicePreview) composer.setVoicePreview(state.voicePreview);
      else composer.clearVoicePreview();
    }
  }

  setVoiceControls(config = {}) {
    this.getComposer()?.setVoiceControls(config);
  }

  setVoicePreview(config = {}) {
    this.getComposer()?.setVoicePreview(config);
  }

  clearVoicePreview() {
    this.getComposer()?.clearVoicePreview();
  }

  setOverlayStackReserve(value = 0) {
    let reserve = normalizePixelValue(value);
    this.style.setProperty('--sn-chat-overlay-stack-reserve', `${reserve}px`);
    this.dataset.overlayStackReserve = String(reserve);
    this.getTranscript()?.updateScrollBottomButton?.();
  }

  setLiveStatus(meta = null) {
    this.getTranscript()?.renderLiveStatus(meta);
    if (meta?.phase) {
      this.setBackgroundState({ state: meta.phase, reason: 'live-status' });
    }
  }

  setBackgroundState(input = {}) {
    let config = normalizeBackgroundInput(input);
    let state = String(config.state || config.mode || config.action || '').trim();
    let background = this.getBackground();
    if (!background) return;

    if (config.pulse || BACKGROUND_PULSE_STATES.has(state)) {
      background.trigger?.(config.duration);
    } else if (config.active === false || config.streaming === false || BACKGROUND_STOP_STATES.has(state)) {
      background.stop?.();
    } else if (config.active === true || config.streaming === true || BACKGROUND_ACTIVE_STATES.has(state)) {
      background.start?.();
    }

    let normalizedState = state || (config.active ? 'active' : config.streaming ? 'streaming' : 'idle');
    this.dataset.backgroundState = normalizedState;
    emit(this, 'chat-workspace-background-change', {
      ...config,
      state: normalizedState,
    });
  }

  triggerBackground(duration) {
    this.setBackgroundState({ state: 'trigger', duration });
  }

  startBackground() {
    this.setBackgroundState({ state: 'start', active: true });
  }

  stopBackground() {
    this.setBackgroundState({ state: 'stop', active: false });
  }

  suspendLayout() {
    this._layoutSuspendedBackgroundState = this.dataset.backgroundState || '';
    this.getBackground()?.stop?.();
  }

  resumeLayout() {
    let state = this._layoutSuspendedBackgroundState || this.dataset.backgroundState || '';
    this._layoutSuspendedBackgroundState = '';
    if (BACKGROUND_ACTIVE_STATES.has(state)) {
      this.setBackgroundState({ state, active: true, reason: 'layout-resume' });
    }
  }

  _bindWorkspaceEvents() {
    let route = (sourceEvent, eventName, detailFactory = (event) => event.detail || {}) => {
      this.addEventListener(sourceEvent, (event) => {
        let detail = {
          ...detailFactory(event),
          sourceEvent,
        };
        let forwardedEvent = new CustomEvent(eventName, {
          bubbles: true,
          composed: true,
          cancelable: event.cancelable,
          detail,
        });
        this.dispatchEvent(forwardedEvent);
        if (forwardedEvent.defaultPrevented) {
          event.preventDefault();
        }
      });
    };

    route('chat-sidebar-new', 'chat-workspace-chat-new');
    route('chat-sidebar-select', 'chat-workspace-chat-select', (event) => ({
      ...event.detail,
      chatId: event.detail?.chatId || event.detail?.id || '',
    }));
    route('chat-sidebar-delete', 'chat-workspace-chat-delete', (event) => ({
      ...event.detail,
      chatId: event.detail?.chatId || event.detail?.id || '',
    }));
    route('chat-composer-input', 'chat-workspace-input');
    this.addEventListener('chat-composer-input', (event) => {
      let value = event.detail?.value || '';
      if (value && !this.getComposer()?.$.isSending) {
        this.triggerBackground();
      }
    });
    route('chat-composer-key', 'chat-workspace-key');
    route('chat-composer-submit', 'chat-workspace-submit', () => ({ value: this.getComposer()?.$.value || '' }));
    route('chat-composer-send', 'chat-workspace-send', () => ({
      value: this.getComposer()?.$.value || '',
      sending: Boolean(this.getComposer()?.$.isSending),
    }));
    route('chat-composer-stop', 'chat-workspace-stop', () => ({
      value: this.getComposer()?.$.value || '',
      sending: Boolean(this.getComposer()?.$.isSending),
    }));
    route('chat-composer-leading-control', 'chat-workspace-leading-intent');
    route('chat-composer-footer-control', 'chat-workspace-footer-intent');
    route('chat-composer-footer-control-change', 'chat-workspace-footer-intent');
    route('chat-composer-param-change', 'chat-workspace-footer-intent');
    route('chat-composer-context-remove', 'chat-workspace-context-intent');
    route('chat-composer-context-drop', 'chat-workspace-context-intent');
    route('chat-transcript-load-older', 'chat-workspace-load-older');
    route('chat-message-action', 'chat-workspace-action');
    route('chat-transcript-embeds-ready', 'chat-workspace-embeds-ready');
    for (let name of [
      'chat-composer-voice-input',
      'chat-composer-wake-listen',
      'chat-composer-voice-response-toggle',
      'chat-composer-voice-command-toggle',
      'chat-composer-voice-language-change',
      'chat-composer-permission-intent',
      'chat-composer-recorder-intent',
      'chat-composer-transcription-intent',
      'chat-composer-audio-captured',
      'chat-composer-voice-approve',
      'chat-composer-voice-cancel',
      'chat-composer-voice-send',
    ]) {
      route(name, 'chat-workspace-voice-intent');
    }
    for (let name of ['cell-bg-animation-trigger', 'cell-bg-animation-start', 'cell-bg-animation-stop', 'cell-bg-animation-idle']) {
      route(name, 'chat-workspace-background-event');
    }
  }

  _syncSidebarAttribute() {
    let value = this.getAttribute('sidebar') || this.$.sidebar || 'visible';
    this.$.sidebar = value;
    this.toggleAttribute('sidebar-hidden', value === 'hidden');
  }
}

ChatWorkspace.template = template;
ChatWorkspace.rootStyles = css;
ChatWorkspace.reg('chat-workspace');
