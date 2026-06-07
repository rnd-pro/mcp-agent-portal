import { Symbiote } from '@symbiotejs/symbiote';
import { state as dashState, events as dashEvents, emit as dashEmit } from '../../dashboard-state.js';
import {
  blobToBase64,
  buildChatMessageItems,
  buildSessionMetaHtml,
  defaultSendCommandPhrases,
  defaultVoiceActionCommandPhrases,
  defaultWakeCommandPhrases,
  escapeHtml,
  getRoute,
  matchVoiceCommandAtEnd,
  matchVoiceCommandInText,
  normalizeWakeCommandPhrase,
  parseQuery,
  parseVoiceCommandList,
  updateParams,
  VoiceRuntime,
  wakeCommandCandidates,
} from 'symbiote-ui/ui';
import template from './AgentChat.tpl.js';
import css from './AgentChat.css.js';
import { ICONS } from '../../common/icons.js';
import { ChatWsClient } from '../../services/chat-ws-client.js';
import { ChatAutocomplete } from '../../services/chat-autocomplete.js';
import {
  extractAttachedFilePaths,
  formatAttachedContextBlock,
  mergeAttachedContext,
  removeAttachedContext,
} from '../../services/chat-context.js';
import {
  applyProjectTransactions,
  applyProjectTransactionsFromMessages,
} from '../../services/project-transaction-messages.js';
import { getAgentChatInputState } from './input-state.js';
import { tPortal } from '../../common/localization.js';
import { getLocalization } from 'symbiote-ui/locale';
import { sanitizeVoiceResponseText } from './voice-response-text.js';
import {
  buildChatTitleRequestNote,
  extractChatTitleFromAgentText,
} from './chat-title.js';
import '../../components/ChatSidebar/ChatSidebar.js';

const DEFAULT_POOL_AGENT = 'orchestrator';

function sameChatMessages(next = [], current = []) {
  if (next === current) return true;
  if (!Array.isArray(next) || !Array.isArray(current)) return false;
  if (next.length !== current.length) return false;
  return next.every((message, index) => JSON.stringify(message) === JSON.stringify(current[index]));
}

/**
 * AgentChat — portal adapter for chat state, transport, and routing.
 */
export class AgentChat extends Symbiote {
  static isoMode = true;
  _audioRecorder = new VoiceRuntime();
  _voiceCommandMode = false;
  _voiceCommandTriggered = false;
  _voiceCommandHandling = false;
  _voiceCommandTextOverride = '';
  _voiceCommandPhrases = null;
  _voiceActionCommandPhrases = null;
  _wakeCommandPhrases = null;
  _wakeModeEnabled = false;
  _wakePausedForRecording = false;
  _wakeRecognition = null;
  _wakeTriggering = false;
  _voiceResponseEnabled = false;
  _voiceResponseLastAgentKey = '';
  _speakingVoiceResponse = false;
  _voiceLanguageMode = 'auto';
  init$ = {
    messages: [],
    messageItems: [],
    inputVal: '',
    chatName: tPortal('text.selectChat'),
    chatAdapter: '',
    adapterMeta: {},
    adapterOptionsHtml: '',
    composerFooterControls: [],
    chatParams: {},
    attachedContext: [],
    isInputDisabled: true,
    isSubagentChat: false,
    inputPlaceholder: tPortal('chat.placeholder.ready'),
    sessionMetaHtml: '',
  };

  renderCallback() {

    // Initial empty state
    queueMicrotask(() => this._updateEmptyState());

    // Fetch adapter metadata
    this._fetchAdapterMeta();

    this._bindComposer();
    this._loadVoiceInputSettings();

    let composer = this._getComposer();
    this._ac = new ChatAutocomplete({
      popupEl: composer?.getAutocompleteElement?.(),
      textareaEl: composer?.getInputElement?.(),
      onAttachFile: (newVal, path) => {
        this.$.inputVal = newVal;
        this._getComposer()?.setValue?.(newVal);
        this._attachContext({ type: 'file', path, source: 'autocomplete' });
      },
      onInsertWorkflow: (newVal) => {
        this.$.inputVal = newVal;
        this._getComposer()?.setValue?.(newVal);
      }
    });

    this._getTranscript()?.addEventListener('status-card-open', (event) => {
      let chatId = event.detail?.linkId;
      if (!chatId) return;
      dashState.activeChatId = chatId;
      updateParams({ chat: chatId });
      dashEmit('active-chat-changed', { id: chatId });
    });

    this._wsClient = new ChatWsClient({
      getMessages: () => this.$.messages,
      setMessages: (msgs) => {
        if (sameChatMessages(msgs, this.$.messages)) return;
        this.$.messages = msgs;
      },
      onSessionId: (id) => {
        this._sessionId = id;
        let targetChatId = this._loadedChatId || dashState.activeChatId;
        if (targetChatId) {
          fetch('/api/chats/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: targetChatId, sessionId: id }),
          }).catch(() => {});
        }
      },
      onBackgroundToggle: (isActive) => this._setBackgroundActive(isActive),
      onMetaHtml: (html) => { this.$.sessionMetaHtml = html; },
      onMeta: (meta) => this._renderLiveStatus(meta),
      onProjectTransaction: (detail) => this._applyProjectTransactionEvent(detail),
      onPulledChat: (chat, detail) => this._handlePulledChat(chat, detail),
      onDone: () => {
        this._pendingAgentTitleChatId = '';
        this._setSending(false);
        this._renderLiveStatus(null);
        this._updateEmptyState();
      },
      onError: (_errText) => {
        this._setSending(false, { speak: false });
        this._renderLiveStatus(null);
        this._updateEmptyState();
      },
      buildSessionMetaHtml
    });
    dashEvents.addEventListener('active-chat-changed', (e) => {
      this._loadChat(e.detail?.id);
    });
    dashEvents.addEventListener('chat-updated', (e) => {
      this._handleExternalChatUpdate(e.detail);
    });
    dashEvents.addEventListener('graph-context-selected', (e) => {
      this._attachContext(e.detail);
    });

    // Self-register with router: react to ?chat= URL param changes
    this.sub('ROUTER/query', () => {
      this._syncChatFromRouter();
    });

    // Re-render messages when they change
    this.sub('messages', (_msgs) => {
      this._renderMessages();
      this._applyProjectTransactions(_msgs);
      this._updateEmptyState();
      this._syncVoiceControls();
      // Re-evaluate adapter options to lock provider when messages appear.
      queueMicrotask(() => this._updateComposerFooter());
    });

    // Update available options when adapter or metadata changes
    this.sub('chatAdapter', () => {
      this._updateComposerFooter();
      this._updateInputState();
    });
    this.sub('adapterMeta', () => this._updateComposerFooter());
    this.sub('chatParams', () => {
      if (!this._updatingOptions) this._updateComposerFooter();
      this._updateInputState();
    });
    this.sub('isSubagentChat', () => this._updateInputState());
    this.sub('inputVal', () => this._syncComposerComponent());
    this.sub('attachedContext', () => this._syncComposerComponent());
    this.sub('isInputDisabled', () => this._syncComposerComponent());
    this.sub('inputPlaceholder', () => this._syncComposerComponent());
    this.sub('composerFooterControls', () => this._syncComposerComponent());

    // Sync state from router after all listeners are attached (fixes cold load bug)
    this._syncChatFromRouter();
  }

  disconnectedCallback() {
    this._stopWakeListening({ disableMode: true });
    this._stopVoiceUiTimer();
    this._audioRecorder.cancel();
    this._removeVoicePreview();
    super.disconnectedCallback?.();
  }

  _getWorkspace() {
    return this.ref.workspace || this.querySelector('chat-workspace');
  }

  _getComposer() {
    return this._getWorkspace()?.getComposer?.() || null;
  }

  _getTranscript() {
    return this._getWorkspace()?.getTranscript?.() || null;
  }

  _setBackgroundActive(active) {
    this._getWorkspace()?.setBackgroundState?.({
      state: active ? 'streaming' : 'idle',
      active: Boolean(active),
    });
  }

  _bindComposer() {
    let workspace = this._getWorkspace();
    let composer = this._getComposer();
    if (!workspace || !composer || this._composerBound) return;
    this._composerBound = true;

    workspace.addEventListener('chat-workspace-input', (event) => {
      let value = event.detail?.value || '';
      this.$.inputVal = value;
      this._ac?.check(value, event.detail?.selectionStart);
    });

    workspace.addEventListener('chat-workspace-key', (event) => {
      let key = event.detail?.key;
      let originalEvent = event.detail?.event;
      if (key === 'Escape') this._ac?.hide();
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        if (this._ac?.isVisible) {
          originalEvent?.preventDefault?.();
          this._ac?.navigate(key === 'ArrowDown' ? 1 : -1);
        }
      }
      if (key === 'Tab' && this._ac?.isVisible) {
        originalEvent?.preventDefault?.();
        this._ac?.select();
      }
    });

    workspace.addEventListener('chat-workspace-submit', () => this._sendMessage());
    workspace.addEventListener('chat-workspace-send', () => this._handleComposerSend());
    workspace.addEventListener('chat-workspace-voice-intent', (event) => this._handleWorkspaceVoiceIntent(event.detail || {}));
    workspace.addEventListener('chat-workspace-footer-intent', (event) => this._handleWorkspaceFooterIntent(event.detail || {}));
    workspace.addEventListener('chat-workspace-context-intent', (event) => this._handleWorkspaceContextIntent(event.detail || {}));

    this._syncComposerComponent();
    this._setupVoiceControls();
  }

  _syncComposerComponent() {
    this._getWorkspace()?.setComposerState?.({
      value: this.$.inputVal || '',
      attachedContext: this.$.attachedContext || [],
      disabled: this.$.isInputDisabled,
      placeholder: this.$.inputPlaceholder || '',
      footerControls: this.$.composerFooterControls || [],
      sending: this._isSending,
      voiceControls: this._buildVoiceControlsConfig(),
    });
  }

  _handleWorkspaceVoiceIntent(detail = {}) {
    switch (detail.sourceEvent) {
      case 'chat-composer-voice-input':
        this._toggleRecording();
        break;
      case 'chat-composer-wake-listen':
        this._toggleWakeMode();
        break;
      case 'chat-composer-voice-response-toggle':
        this._toggleVoiceResponseMode();
        break;
      case 'chat-composer-voice-command-toggle':
        this._toggleVoiceCommandMode();
        break;
      case 'chat-composer-voice-language-change':
        this._setVoiceLanguageMode(detail.mode);
        break;
      case 'chat-composer-voice-approve':
        this._stopRecording({ autoSend: true });
        break;
      case 'chat-composer-voice-cancel':
        this._cancelVoiceResult();
        break;
      case 'chat-composer-voice-send':
        this._confirmVoiceResult();
        break;
    }
  }

  _handleWorkspaceFooterIntent(detail = {}) {
    if (detail.sourceEvent === 'chat-composer-footer-control-change') return;
    if (detail.id === 'settings') {
      globalThis.location.href = '/#resource-groups';
      return;
    }
    if (detail.id) this._handleComposerParamChange(detail);
  }

  _handleWorkspaceContextIntent(detail = {}) {
    if (detail.sourceEvent === 'chat-composer-context-remove') {
      this.$.attachedContext = removeAttachedContext(this.$.attachedContext, detail.key);
      return;
    }
    if (detail.sourceEvent === 'chat-composer-context-drop' && detail.path) {
      this._attachContext({ type: 'file', path: detail.path, source: 'drop' });
    }
  }

  _handleComposerSend() {
    let targetChatId = this._loadedChatId || dashState.activeChatId;
    if (this._isSending && targetChatId) {
      let chat = dashState.chats?.find(c => c.id === targetChatId);
      let taskId = chat?.pendingTaskId || this.$.chatParams?.pendingTaskId;
      this._wsClient?.stop(targetChatId, taskId);
      return;
    }
    this._sendMessage();
  }

  _handleComposerParamChange(detail = {}) {
    let id = detail.id;
    if (!id) return;
    let val = detail.value;

    let currentParams = this.$.chatParams || {};
    let updatedParams = { ...currentParams, [id]: val };

    if (id === 'provider') {
      delete updatedParams.model;
    }
    if (id === 'agent') {
      updatedParams.approval_mode = this._getAgentDefaultApprovalMode(val);
      // Auto-select resource group from agent binding
      let agentGroup = this._getAgentResourceGroup(val);
      if (agentGroup) {
        updatedParams.resource_group = agentGroup;
      }
    }
    if (id === 'resource_group') {
      // When switching groups, clear manual provider/model overrides
      if (val !== 'none') {
        delete updatedParams.provider;
        delete updatedParams.model;
      }
    }

    this.$.chatParams = updatedParams;

    let chatId = this._loadedChatId || dashState.activeChatId;
    if (chatId) {
      let saveData = { id: chatId, [id]: val };
      if (id === 'provider') saveData.model = null;
      if (id === 'agent') {
        saveData.approval_mode = updatedParams.approval_mode;
        if (updatedParams.resource_group) saveData.resource_group = updatedParams.resource_group;
      }
      if (id === 'resource_group') {
        saveData.provider = null;
        saveData.model = null;
      }
      fetch('/api/chats/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saveData)
      });
    }
  }

  _updateInputState() {
    let state = getAgentChatInputState({
      adapter: this.$.chatAdapter || 'pool',
      chatParams: this.$.chatParams || {},
      isSubagentChat: this.$.isSubagentChat,
      adapterMeta: this.$.adapterMeta || null,
    });
    this.$.isInputDisabled = state.disabled;
    this.$.inputPlaceholder = state.placeholder;
  }

  _attachContext(item) {
    this.$.attachedContext = mergeAttachedContext(this.$.attachedContext || [], item);
  }

  _updateEmptyState() {
    let hasMessages = this.$.messages && this.$.messages.length > 0;
    this._getWorkspace()?.setEmpty?.(!hasMessages);
  }

  _setupVoiceControls() {
    if (this._voiceControlsBound) return;
    this._voiceControlsBound = true;
    this._audioRecorder.onInterim = (text, elapsed) => {
      this._updateVoicePreview(text, elapsed);
    };
    this._audioRecorder.onStateChange = () => {
      this._syncVoiceControls();
    };
    this._syncVoiceControls();
  }

  _toggleVoiceCommandMode() {
    this._voiceCommandMode = !this._voiceCommandMode;
    this._saveVoiceInputModeSettings();
    this._syncVoiceCommandButton();
    this._updateVoicePreview(null, this._audioRecorder.elapsed);
  }

  async _saveVoiceInputModeSettings() {
    try {
      let settings = await fetch('/api/settings').then((res) => res.json());
      let voiceInput = {
        ...(settings?.voiceInput || {}),
        sendByCommandEnabled: this._voiceCommandMode,
        voiceResponseEnabled: this._voiceResponseEnabled,
        languageMode: this._voiceLanguageMode,
      };
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceInput }),
      });
    } catch {
      // Mode persistence is best-effort; the local toggle still applies immediately.
    }
  }

  _defaultVoiceCommandPhrases() {
    return defaultSendCommandPhrases();
  }

  _defaultVoiceActionPhrases() {
    return {
      send: {
        en: [this._defaultVoiceCommandPhrases().en],
        ru: [this._defaultVoiceCommandPhrases().ru],
        es: [this._defaultVoiceCommandPhrases().es],
      },
      ...defaultVoiceActionCommandPhrases(),
    };
  }

  _defaultWakeCommandPhrases() {
    return defaultWakeCommandPhrases();
  }

  _getVoiceCommandPhrase() {
    let locale = this._voiceCommandLocale();
    let phrases = this._voiceCommandPhrases || this._defaultVoiceCommandPhrases();
    return phrases[locale] || this._defaultVoiceCommandPhrases()[locale] || this._defaultVoiceCommandPhrases().en;
  }

  _getVoiceActionPhrases(action) {
    let locale = this._voiceCommandLocale();
    if (action === 'send') return [this._getVoiceCommandPhrase()];
    let defaults = this._defaultVoiceActionPhrases();
    let phrases = this._voiceActionCommandPhrases || defaults;
    return phrases[action]?.[locale] || phrases[action]?.en || defaults[action]?.[locale] || defaults[action]?.en || [];
  }

  _voiceCommandHints() {
    let commandList = (action) => this._getVoiceActionPhrases(action).join(', ');
    return [
      tPortal('settings.voice.commandHintSend', { command: commandList('send') }),
      tPortal('settings.voice.commandHintCancel', { command: commandList('cancel') }),
      tPortal('settings.voice.commandHintDelete', { command: commandList('delete') }),
      tPortal('settings.voice.commandHintOff', { command: commandList('off') }),
    ];
  }

  _getWakeCommandPhrase() {
    return this._getWakeCommandCandidates()[0] || this._defaultWakeCommandPhrases().en;
  }

  _getWakeCommandCandidates() {
    return wakeCommandCandidates(this._wakeCommandPhrases || this._defaultWakeCommandPhrases(), this._voiceCommandLocale());
  }

  async _loadVoiceInputSettings() {
    try {
      let settings = await fetch('/api/settings').then((res) => res.json());
      let sendDefaults = this._defaultVoiceCommandPhrases();
      let wakeDefaults = this._defaultWakeCommandPhrases();
      let actionDefaults = this._defaultVoiceActionPhrases();
      let savedSend = settings?.voiceInput?.sendCommands || {};
      let savedWake = settings?.voiceInput?.wakeCommands || {};
      let savedActions = settings?.voiceInput?.actionCommands || {};
      let legacy = String(settings?.voiceInput?.sendCommand || '').trim();
      this._voiceCommandMode = Boolean(settings?.voiceInput?.sendByCommandEnabled);
      this._voiceResponseEnabled = Boolean(settings?.voiceInput?.voiceResponseEnabled);
      this._voiceLanguageMode = this._normalizeVoiceLanguageMode(settings?.voiceInput?.languageMode);
      this._voiceCommandPhrases = {
        en: String(savedSend.en || legacy || sendDefaults.en).trim() || sendDefaults.en,
        ru: String(savedSend.ru || sendDefaults.ru).trim() || sendDefaults.ru,
        es: String(savedSend.es || sendDefaults.es).trim() || sendDefaults.es,
      };
      this._wakeCommandPhrases = {
        en: normalizeWakeCommandPhrase(savedWake.en || wakeDefaults.en, 'en'),
        ru: normalizeWakeCommandPhrase(savedWake.ru || wakeDefaults.ru, 'ru'),
        es: normalizeWakeCommandPhrase(savedWake.es || wakeDefaults.es, 'es'),
      };
      this._voiceActionCommandPhrases = {
        cancel: {
          en: parseVoiceCommandList(savedActions.cancel?.en, actionDefaults.cancel.en),
          ru: parseVoiceCommandList(savedActions.cancel?.ru, actionDefaults.cancel.ru),
          es: parseVoiceCommandList(savedActions.cancel?.es, actionDefaults.cancel.es),
        },
        delete: {
          en: parseVoiceCommandList(savedActions.delete?.en, actionDefaults.delete.en),
          ru: parseVoiceCommandList(savedActions.delete?.ru, actionDefaults.delete.ru),
          es: parseVoiceCommandList(savedActions.delete?.es, actionDefaults.delete.es),
        },
        off: {
          en: parseVoiceCommandList(savedActions.off?.en, actionDefaults.off.en),
          ru: parseVoiceCommandList(savedActions.off?.ru, actionDefaults.off.ru),
          es: parseVoiceCommandList(savedActions.off?.es, actionDefaults.off.es),
        },
      };
    } catch {
      this._voiceLanguageMode = this._autoVoiceLocale();
      this._voiceCommandPhrases = this._defaultVoiceCommandPhrases();
      this._voiceActionCommandPhrases = this._defaultVoiceActionPhrases();
      this._wakeCommandPhrases = this._defaultWakeCommandPhrases();
    } finally {
      this._syncVoiceCommandButton();
      this._syncVoiceLanguageButton();
    }
  }

  _normalizeVoiceLanguageMode(mode = 'auto') {
    let value = String(mode || 'auto').trim().toLowerCase();
    if (['ru', 'es', 'en'].includes(value)) return value;
    return this._autoVoiceLocale();
  }

  _voiceLanguageOptions() {
    return [
      { mode: 'ru', short: 'RU', label: tPortal('settings.voice.languageRu'), lang: 'ru-RU' },
      { mode: 'es', short: 'ES', label: tPortal('settings.voice.languageEs'), lang: 'es-ES' },
      { mode: 'en', short: 'EN', label: tPortal('settings.voice.languageEn'), lang: 'en-US' },
    ];
  }

  _voiceLanguageOption() {
    return this._voiceLanguageOptions().find((item) => item.mode === this._voiceLanguageMode) || this._voiceLanguageOptions()[0];
  }

  _voiceRecognitionLanguage() {
    return this._voiceLanguageTags()[this._voiceCommandLocale()] || 'en-US';
  }

  _voiceCommandLocale() {
    return this._normalizeVoiceLanguageMode(this._voiceLanguageMode);
  }

  _voiceLanguageTags() {
    return {
      ru: 'ru-RU',
      es: 'es-ES',
      en: 'en-US',
    };
  }

  _autoVoiceLocale() {
    let browserLocale = String(navigator.language || '').slice(0, 2).toLowerCase();
    if (['ru', 'es', 'en'].includes(browserLocale)) return browserLocale;
    let interfaceLocale = getLocalization().locale;
    return ['ru', 'es', 'en'].includes(interfaceLocale) ? interfaceLocale : 'en';
  }

  _extractVoiceCommandText(text = '') {
    let command = this._extractVoiceCommandAction(text);
    return {
      matched: command.matched && command.action === 'send' && Boolean(command.text),
      text: command.text,
    };
  }

  _extractVoiceCommandAction(text = '') {
    let value = String(text || '').trim();
    if (!value) return { matched: false, action: '', text: '' };
    let actions = ['send', 'cancel', 'delete', 'off'];
    let candidates = actions.flatMap((action) => this._getVoiceActionPhrases(action).map((phrase) => ({ action, phrase })));
    let command = matchVoiceCommandAtEnd(value, candidates);
    if (!command.matched) return { matched: false, action: '', text: value };
    if (command.action === 'send' && !command.text) return { matched: false, action: '', text: value };
    return command;
  }

  _matchesWakeCommand(text = '') {
    return matchVoiceCommandInText(text, this._getWakeCommandCandidates()).matched;
  }

  async _toggleWakeMode() {
    if (this._wakeModeEnabled) {
      this._stopWakeListening({ disableMode: true });
      return;
    }
    await this._loadVoiceInputSettings();
    this._wakeModeEnabled = true;
    this._wakePausedForRecording = false;
    this._syncWakeButton();
    this._startWakeListening();
  }

  _syncWakeButton() {
    this._syncVoiceControls();
  }

  _buildVoiceControlsConfig() {
    let command = this._getWakeCommandPhrase();
    let speechAvailable = Boolean(globalThis.speechSynthesis && globalThis.SpeechSynthesisUtterance);
    let recognitionAvailable = Boolean(this._audioRecorder.hasSpeechRecognition);
    let active = this._voiceControlActive();
    let languageOption = this._voiceLanguageOption();
    let voiceState = this._audioRecorder.state === 'recording'
      ? 'listening'
      : this._audioRecorder.state === 'starting'
        ? 'transcribing'
        : this._audioRecorder.state === 'processing'
          ? 'transcribing'
          : this._audioRecorder.isAvailable
            ? 'idle'
            : 'disabled';

    return {
      input: {
        visible: Boolean(this._audioRecorder.isAvailable) && !this._wakeModeEnabled,
        enabled: Boolean(this._audioRecorder.isAvailable),
        state: voiceState,
      },
      wakeListen: {
        visible: Boolean(this._audioRecorder.isAvailable),
        enabled: recognitionAvailable,
        active: this._wakeModeEnabled,
        commandText: this._wakeModeEnabled ? tPortal('settings.voice.sayCommand', { command }) : '',
        title: this._wakeModeEnabled
          ? tPortal('settings.voice.listeningFor', { command })
          : recognitionAvailable
            ? tPortal('settings.voice.listenButton')
            : tPortal('settings.voice.listenUnavailable'),
      },
      response: {
        visible: this._wakeModeEnabled,
        enabled: this._wakeModeEnabled && speechAvailable,
        active: this._voiceResponseEnabled,
        speaking: this._speakingVoiceResponse,
        title: speechAvailable ? tPortal('settings.voice.speakResponse') : tPortal('settings.voice.speakUnavailable'),
      },
      command: {
        visible: active,
        enabled: active,
        active: this._voiceCommandMode,
        text: tPortal('settings.voice.commandsButton'),
        title: this._voiceCommandMode
          ? tPortal('settings.voice.commandsEnabled')
          : tPortal('settings.voice.commandsDisabled'),
      },
      language: {
        visible: recognitionAvailable && active,
        enabled: recognitionAvailable && active,
        mode: languageOption.mode,
        title: tPortal('settings.voice.languageButton', { language: languageOption.label }),
        options: this._voiceLanguageOptions().map((item) => ({
          mode: item.mode,
          label: item.short,
          title: item.label,
        })),
      },
    };
  }

  _syncVoiceResponseButton() {
    this._syncVoiceControls();
  }

  _toggleVoiceResponseMode() {
    if (!this._wakeModeEnabled || !globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance) return;
    this._voiceResponseEnabled = !this._voiceResponseEnabled;
    if (this._voiceResponseEnabled) {
      let current = this._getLatestAgentSpeechMessage();
      this._voiceResponseLastAgentKey = current?.key || '';
    } else {
      this._cancelVoiceResponseSpeech();
    }
    this._saveVoiceInputModeSettings();
    this._syncVoiceResponseButton();
  }

  _voiceControlActive() {
    return this._wakeModeEnabled || ['starting', 'recording'].includes(this._audioRecorder.state);
  }

  _syncVoiceCommandButton() {
    this._syncVoiceControls();
  }

  _syncVoiceLanguageButton() {
    this._syncVoiceControls();
  }

  _syncVoiceControls() {
    this._getWorkspace()?.setVoiceControls?.(this._buildVoiceControlsConfig());
  }

  async _setVoiceLanguageMode(mode) {
    this._voiceLanguageMode = this._normalizeVoiceLanguageMode(mode);
    this._saveVoiceInputModeSettings();
    this._syncWakeButton();
    let language = this._voiceRecognitionLanguage();
    this._audioRecorder.setLanguage(language);
    if (this._audioRecorder.state === 'recording') {
      try {
        await this._audioRecorder.restartSpeechRecognition(language);
      } catch (err) {
        console.warn('[AgentChat] Voice language restart failed:', err.message);
      }
    }
    if (this._wakeModeEnabled && !this._wakePausedForRecording) {
      this._restartWakeListening();
    }
  }

  _getLatestAgentSpeechMessage() {
    let messages = this.$.messages || [];
    for (let i = messages.length - 1; i >= 0; i--) {
      let msg = messages[i];
      if (msg?.role !== 'agent' || !msg.text) continue;
      let text = this._cleanSpeechText(msg.text);
      if (!text) continue;
      return { key: `${i}:${text}`, text };
    }
    return null;
  }

  _cleanSpeechText(text) {
    return sanitizeVoiceResponseText(text);
  }

  _getLatestAgentSpeechText() {
    return this._getLatestAgentSpeechMessage()?.text || '';
  }

  _snapshotVoiceResponseBaseline() {
    this._voiceResponseLastAgentKey = this._getLatestAgentSpeechMessage()?.key || '';
  }

  _speechLocaleFromInterface() {
    let locale = getLocalization().locale;
    if (locale === 'ru') return 'ru-RU';
    if (locale === 'es') return 'es-ES';
    return 'en-US';
  }

  _speechLocale() {
    return this._voiceRecognitionLanguage() || this._speechLocaleFromInterface();
  }

  _speakPendingAgentResponse() {
    if (!this._wakeModeEnabled || !this._voiceResponseEnabled || this._isSending) return;
    let message = this._getLatestAgentSpeechMessage();
    if (!message || message.key === this._voiceResponseLastAgentKey) return;
    this._voiceResponseLastAgentKey = message.key;
    this._speakAgentResponseText(message.text);
  }

  _cancelVoiceResponseSpeech() {
    if (globalThis.speechSynthesis) globalThis.speechSynthesis.cancel();
    this._speakingVoiceResponse = false;
    this._resumeWakeListeningAfterRecording();
  }

  _speakAgentResponseText(text) {
    if (!text || !globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance) return;
    if (this._speakingVoiceResponse) {
      globalThis.speechSynthesis.cancel();
      this._speakingVoiceResponse = false;
    }

    this._pauseWakeListeningForRecording();
    let utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this._speechLocale();
    utterance.onend = () => {
      this._speakingVoiceResponse = false;
      this._syncVoiceResponseButton();
      this._resumeWakeListeningAfterRecording();
    };
    utterance.onerror = utterance.onend;
    this._speakingVoiceResponse = true;
    this._syncVoiceResponseButton();
    globalThis.speechSynthesis.cancel();
    globalThis.speechSynthesis.speak(utterance);
  }

  _startWakeListening() {
    if (!this._wakeModeEnabled || this._wakeRecognition || this._audioRecorder.state !== 'idle') return;
    let SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this._stopWakeListening({ disableMode: true });
      this._showVoiceError('Continuous listening requires browser speech recognition.');
      return;
    }

    let recognition = new SpeechRecognition();
    recognition.lang = this._voiceRecognitionLanguage();
    recognition.interimResults = true;
    recognition.continuous = true;
    this._wakeRecognition = recognition;

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (this._matchesWakeCommand(transcript)) {
        this._triggerVoiceInputFromWake();
      }
    };

    recognition.onerror = (event) => {
      this._wakeRecognition = null;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this._stopWakeListening({ disableMode: true });
        return;
      }
      if (this._wakeModeEnabled && !this._wakePausedForRecording) {
        this._syncWakeButton();
      }
    };

    recognition.onend = () => {
      this._wakeRecognition = null;
      if (this._wakeModeEnabled && !this._wakePausedForRecording) {
        setTimeout(() => this._startWakeListening(), 250);
      }
    };

    try {
      recognition.start();
    } catch {
      this._wakeRecognition = null;
      this._stopWakeListening({ disableMode: true });
    }
  }

  _stopWakeListening({ disableMode = false } = {}) {
    if (disableMode) {
      this._wakeModeEnabled = false;
      this._voiceResponseLastAgentKey = '';
    }
    this._wakePausedForRecording = false;
    if (disableMode && globalThis.speechSynthesis) {
      globalThis.speechSynthesis.cancel();
      this._speakingVoiceResponse = false;
    }
    if (this._wakeRecognition) {
      this._wakeRecognition.onresult = null;
      this._wakeRecognition.onerror = null;
      this._wakeRecognition.onend = null;
      try { this._wakeRecognition.abort(); } catch (_) { /* already stopped */ }
      this._wakeRecognition = null;
    }
    this._syncWakeButton();
  }

  _restartWakeListening() {
    if (this._wakeRecognition) {
      this._wakeRecognition.onresult = null;
      this._wakeRecognition.onerror = null;
      this._wakeRecognition.onend = null;
      try { this._wakeRecognition.abort(); } catch (_) { /* already stopped */ }
      this._wakeRecognition = null;
    }
    this._startWakeListening();
  }

  _pauseWakeListeningForRecording() {
    if (!this._wakeModeEnabled) return;
    this._wakePausedForRecording = true;
    if (this._wakeRecognition) {
      this._wakeRecognition.onresult = null;
      this._wakeRecognition.onerror = null;
      this._wakeRecognition.onend = null;
      try { this._wakeRecognition.abort(); } catch (_) { /* already stopped */ }
      this._wakeRecognition = null;
    }
    this._syncWakeButton();
  }

  _resumeWakeListeningAfterRecording() {
    if (!this._wakeModeEnabled) return;
    this._wakePausedForRecording = false;
    this._syncWakeButton();
    this._startWakeListening();
  }

  _triggerVoiceInputFromWake() {
    if (this._wakeTriggering || this._audioRecorder.state !== 'idle') return;
    this._wakeTriggering = true;
    this._pauseWakeListeningForRecording();
    setTimeout(async () => {
      try {
        await this._toggleRecording({ reloadSettings: false });
      } finally {
        this._wakeTriggering = false;
      }
    }, 200);
  }

  /** Show/update the live preview banner above the composer */
  _updateVoicePreview(text, elapsed) {
    if (this._audioRecorder.state === 'recording') {
      this._ensureVoicePreview('recording');
    }
    if (!this._voicePreview) return;
    if (text) {
      let command = this._voiceCommandMode ? this._extractVoiceCommandAction(text) : { matched: false, text };
      this._voiceInterimText = command.text;
      if (command.matched && !this._voiceCommandHandling && !this._voiceCommandTriggered) {
        this._voiceCommandHandling = true;
        this._handleVoiceCommandAction(command).finally(() => {
          this._voiceCommandHandling = false;
        });
        return;
      }
    }
    let seconds = typeof elapsed === 'number' ? elapsed : this._audioRecorder.elapsed;
    this._getComposer()?.setVoicePreview?.({
      mode: 'recording',
      status: this._formatVoiceElapsed(seconds),
      text: this._voiceInterimText || '',
      elapsed: true,
      commandHints: this._voiceCommandMode ? this._voiceCommandHints() : [],
    });
    this._voicePreview = this._getComposer()?.getVoicePreviewElement?.() || this._voicePreview;
  }

  async _handleVoiceCommandAction(command) {
    if (!command?.matched) return;
    if (command.action === 'send') {
      this._voiceCommandTriggered = true;
      this._voiceCommandTextOverride = command.text;
      await this._stopRecording({ autoSend: true, textOverride: command.text });
      return;
    }
    if (command.action === 'cancel') {
      this._cancelVoiceResult();
      return;
    }
    if (command.action === 'delete') {
      this._voiceInterimText = '';
      this._voiceCommandTextOverride = '';
      this._voiceCommandTriggered = false;
      if (this._audioRecorder.state === 'recording') {
        try {
          await this._audioRecorder.restartSpeechRecognition(this._voiceRecognitionLanguage(), { initialText: '' });
        } catch (err) {
          console.warn('[AgentChat] Voice delete restart failed:', err.message);
        }
      }
      this._updateVoicePreview('', this._audioRecorder.elapsed);
      return;
    }
    if (command.action === 'off') {
      this._stopVoiceUiTimer();
      this._stopWakeListening({ disableMode: true });
      this._audioRecorder.cancel();
      this._removeVoicePreview();
      this._syncVoiceControls();
    }
  }

  _formatVoiceElapsed(elapsed = 0) {
    let m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    let s = String(elapsed % 60).padStart(2, '0');
    return `● Recording ${m}:${s}`;
  }

  _ensureVoicePreview(mode = 'recording') {
    let composer = this._getComposer();
    if (!composer?.isConnected) return;

    let needsPreview = !this._voicePreview?.isConnected || this._voicePreview?.hidden;
    if (!needsPreview) {
      let composerRect = composer.getBoundingClientRect();
      let previewRect = this._voicePreview.getBoundingClientRect();
      let composerVisible = composerRect.width > 0 && composerRect.height > 0;
      needsPreview = composerVisible && (previewRect.width === 0 || previewRect.height === 0);
    }

    if (needsPreview) {
      this._showVoicePreview(mode);
    }
  }

  /** Show the composer-owned voice preview. */
  _showVoicePreview(mode = 'recording') {
    let composer = this._getComposer();
    if (!composer) return;
    let recording = mode === 'recording';
    composer.setVoicePreview?.({
      mode,
      status: recording ? this._formatVoiceElapsed(this._audioRecorder.elapsed) : '',
      text: recording ? this._voiceInterimText || '' : '',
      elapsed: recording,
      commandHints: recording && this._voiceCommandMode ? this._voiceCommandHints() : [],
    });
    this._voicePreview = composer.getVoicePreviewElement?.() || null;
  }

  _startVoiceUiTimer() {
    this._stopVoiceUiTimer();
    this._voiceUiTimer = setInterval(() => {
      if (this._audioRecorder.state === 'recording' || this._audioRecorder.state === 'starting') {
        this._updateVoicePreview(null, this._audioRecorder.elapsed);
      }
    }, 500);
  }

  _stopVoiceUiTimer() {
    if (this._voiceUiTimer) {
      clearInterval(this._voiceUiTimer);
      this._voiceUiTimer = null;
    }
  }

  _showVoiceError(message) {
    this._stopVoiceUiTimer();
    this._getComposer()?.setVoicePreview?.({ mode: 'error', text: message });
    this._voicePreview = this._getComposer()?.getVoicePreviewElement?.() || null;
    this._voiceInterimText = '';
    this._voiceResultText = '';
    this._voiceAudioUrl = null;
    this._voiceCommandTriggered = false;
    this._voiceCommandHandling = false;
    this._voiceCommandTextOverride = '';
    this._syncVoiceControls();
  }

  async _isMicrophonePermissionPrompt() {
    try {
      let status = await navigator.permissions?.query?.({ name: 'microphone' });
      return status?.state === 'prompt';
    } catch {
      return false;
    }
  }

  _voicePermissionRefreshMessage() {
    return tPortal('settings.voice.refreshAfterPermission');
  }

  _removeVoicePreview() {
    this._getComposer()?.clearVoicePreview?.();
    this._voicePreview = null;
    this._voiceCommandTriggered = false;
    this._voiceCommandHandling = false;
    this._voiceCommandTextOverride = '';
  }

  async _toggleRecording({ reloadSettings = true } = {}) {
    if (this._audioRecorder.state === 'recording') {
      this._stopRecording();
    } else if (this._audioRecorder.state === 'idle') {
      let wasMicrophonePrompt = false;
      try {
        if (reloadSettings) {
          await this._loadVoiceInputSettings();
        } else {
          this._syncVoiceLanguageButton();
        }
        wasMicrophonePrompt = await this._isMicrophonePermissionPrompt();
        this._voicePermissionPromptBeforeStart = wasMicrophonePrompt;
        this._pauseWakeListeningForRecording();
        this._voiceInterimText = '';
        this._voiceCommandTriggered = false;
        this._voiceCommandTextOverride = '';
        this._showVoicePreview('recording');
        this._startVoiceUiTimer();
        this._audioRecorder.setLanguage(this._voiceRecognitionLanguage());
        await this._audioRecorder.start();
        this._syncVoiceControls();
      } catch (err) {
        console.warn('[AgentChat] Primary mic start failed, trying fallback:', err.message);
        this._stopVoiceUiTimer();
        // If Speech Recognition failed, try MediaRecorder fallback
        if (this._audioRecorder.hasSpeechRecognition && this._audioRecorder.state === 'idle') {
          try {
            this._voiceInterimText = '';
            this._voiceCommandTriggered = false;
            this._voiceCommandTextOverride = '';
            this._pauseWakeListeningForRecording();
            await this._audioRecorder.startMediaRecorder();
            this._showVoicePreview('recording');
            this._startVoiceUiTimer();
            this._syncVoiceControls();
          } catch (err2) {
            console.error('[AgentChat] Mic fallback also failed:', err2);
            let message = wasMicrophonePrompt
              ? this._voicePermissionRefreshMessage()
              : 'Microphone access denied. Check browser microphone permissions.';
            this._showVoiceError(message);
            this._resumeWakeListeningAfterRecording();
          }
        } else {
          let message = wasMicrophonePrompt
            ? this._voicePermissionRefreshMessage()
            : 'Microphone access denied. Check browser microphone permissions.';
          this._showVoiceError(message);
          this._resumeWakeListeningAfterRecording();
        }
      }
    }
  }

  async _stopRecording({ autoSend = false, textOverride = '' } = {}) {
    this._stopVoiceUiTimer();
    this._getWorkspace()?.setVoiceControls?.({
      input: {
        visible: Boolean(this._audioRecorder.isAvailable) && !this._wakeModeEnabled,
        enabled: Boolean(this._audioRecorder.isAvailable),
        state: 'transcribing',
      },
    });

    try {
      let result = await this._audioRecorder.stop();
      let text = textOverride || this._voiceCommandTextOverride || result.text || '';

      let audioBase64 = result.audioBase64 || '';
      if (!audioBase64 && result.blob) {
        audioBase64 = await blobToBase64(result.blob);
      }

      // If no text from Speech API, try server transcription
      if (!text && audioBase64) {
        this._getComposer()?.setVoicePreview?.({ mode: 'processing', status: 'Transcribing...', text: '', elapsed: true });
        this._voicePreview = this._getComposer()?.getVoicePreviewElement?.() || null;

        let res = await fetch('/api/audio/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: audioBase64, mimeType: result.mimeType }),
        });
        let data = await res.json();
        text = data.text || '';

        // Store audio for potential playback
        if (audioBase64 && result.mimeType) {
          this._voiceAudioUrl = `data:${result.mimeType};base64,${audioBase64}`;
        }
      }

      if (this._voiceCommandMode && autoSend) {
        let command = this._extractVoiceCommandText(text);
        if (command.matched) text = command.text;
      }

      if (text) {
        this._voiceInterimText = '';
        this._voiceResultText = text;
        this._voiceCommandTextOverride = '';
        if (autoSend) {
          this._removeVoicePreview();
          this._getComposer()?.setValue?.(text);
          this.$.inputVal = text;
          this._sendMessage({ voiceTranscribed: true });
        } else {
          this._getComposer()?.setVoicePreview?.({ mode: 'result', text, editable: true });
          this._voicePreview = this._getComposer()?.getVoicePreviewElement?.() || null;
        }
      } else {
        let message = this._voicePermissionPromptBeforeStart
          ? this._voicePermissionRefreshMessage()
          : 'No speech detected. Try again.';
        this._showVoiceError(message);
      }
    } catch (err) {
      console.error('[AgentChat] Transcription error:', err);
      this._showVoiceError('Transcription failed. Try again.');
    } finally {
      this._voicePermissionPromptBeforeStart = false;
      this._syncVoiceControls();
      this._resumeWakeListeningAfterRecording();
    }
  }

  _confirmVoiceResult() {
    let body = this._getComposer()?.getVoicePreviewBody?.();
    let text = body?.textContent?.trim() || this._voiceResultText || '';
    this._removeVoicePreview();
    this._voiceInterimText = '';
    this._voiceResultText = '';
    this._voiceAudioUrl = null;
    this._voiceCommandTriggered = false;
    this._voiceCommandHandling = false;
    this._voiceCommandTextOverride = '';
    if (!text) return;
    this._getComposer()?.setValue?.(text);
    this.$.inputVal = text;
    this._sendMessage({ voiceTranscribed: true });
  }

  _cancelVoiceResult() {
    this._stopVoiceUiTimer();
    this._removeVoicePreview();
    this._voiceInterimText = '';
    this._voiceResultText = '';
    this._voiceAudioUrl = null;
    this._voiceCommandTriggered = false;
    this._voiceCommandHandling = false;
    this._voiceCommandTextOverride = '';
    this._audioRecorder.cancel();
    this._syncVoiceControls();
    this._resumeWakeListeningAfterRecording();
  }


  _setSending(active, { speak = true } = {}) {
    this._isSending = active;
    this._getComposer()?.setSending?.(active);
    this._renderMessages();
    if (!active && speak) this._speakPendingAgentResponse();
  }

  _focusInput() {
    requestAnimationFrame(() => {
      let input = this._getComposer()?.getInputElement?.();
      if (input && !input.disabled) input.focus();
    });
  }
  async _fetchAdapterMeta() {
    try {
      let res = await fetch('/api/adapter/types');
      let data = await res.json();
      this.$.adapterMeta = data.metadata || {};
    } catch (err) {
      console.error('[AgentChat] fetch adapter meta error:', err);
    }
  }

  _updateComposerFooter() {
    let adapter = this.$.chatAdapter || 'pool';
    let meta = this.$.adapterMeta || {};
    let currentParams = this.$.chatParams || {};
    let paramsToMap = [];
    let defaultParamsChanged = false;

    if (adapter === 'pool') {
      let normalizedParams = this._normalizePoolChatParams(currentParams);
      defaultParamsChanged = JSON.stringify(normalizedParams) !== JSON.stringify(currentParams);
      currentParams = normalizedParams;
      // Agent is selected by the orchestrator layer by default; users configure execution resources.
      if (meta.pool?.parameters) {
        paramsToMap.push(...meta.pool.parameters.filter(p => p.id !== 'agent'));
      }

      let providers = Object.keys(meta).filter(k => k !== 'pool' && !k.startsWith('_'));
      let currentProvider = currentParams.provider ?? providers[0];

      paramsToMap.push({
        id: 'provider', label: tPortal('text.provider'), type: 'select', options: providers
      });

      if (currentProvider && meta[currentProvider]?.parameters) {
        paramsToMap.push(...meta[currentProvider].parameters);
      }
    } else if (adapter && meta[adapter]?.parameters) {
      paramsToMap = [...meta[adapter].parameters];
    }

    this._updatingOptions = true;
    if (paramsToMap.length > 0) {
      let paramsChanged = defaultParamsChanged;
      let controls = paramsToMap.map(p => {
        let priority = this._composerParamPriorityValue(p.id);
        let priorityClass = this._composerParamPriorityClass(p.id);
        if (p.type === 'select' && Array.isArray(p.options)) {
          let paramValue = currentParams[p.id];
          if (!paramValue && p.options.length > 0) {
            if (p.id === 'resource_group') {
              // Auto-select group from current agent's binding
              let agentGroup = this._getAgentResourceGroup(currentParams.agent);
              if (agentGroup) {
                let found = p.options.find(o => (typeof o === 'string' ? o : o.val) === agentGroup);
                paramValue = found ? (typeof found === 'string' ? found : found.val) : (typeof p.options[0] === 'string' ? p.options[0] : p.options[0].val);
              } else {
                paramValue = typeof p.options[0] === 'string' ? p.options[0] : p.options[0].val;
              }
            } else if (p.id === 'approval_mode') {
              paramValue = this._getAgentDefaultApprovalMode(currentParams.agent);
            } else if (p.id === 'model') {
              // Use preferred models from resource groups instead of hardcoded defaults
              let currentCtx = adapter === 'pool' ? currentParams.provider : adapter;
              let rgDefaults = meta._resourceGroupDefaults || {};
              let preferred = (rgDefaults.byProvider?.[currentCtx] || p.preferred || []);

              // Sort preferred models to the top of options
              if (preferred.length > 0) {
                let prefSet = new Set(preferred);
                let prefOptions = [];
                let restOptions = [];
                for (let opt of p.options) {
                  let val = typeof opt === 'string' ? opt : opt.val;
                  if (prefSet.has(val)) {
                    prefOptions.push(opt);
                  } else {
                    restOptions.push(opt);
                  }
                }
                p.options = [...prefOptions, ...restOptions];
              }

              // Default to first preferred model, or first option
              if (preferred.length > 0) {
                let found = p.options.find(o => preferred.includes(typeof o === 'string' ? o : o.val));
                paramValue = found ? (typeof found === 'string' ? found : found.val) : null;
              }
              if (!paramValue) {
                let firstOpt = p.options[0];
                paramValue = typeof firstOpt === 'string' ? firstOpt : firstOpt.val;
              }
            } else {
              let firstOpt = p.options[0];
              paramValue = typeof firstOpt === 'string' ? firstOpt : firstOpt.val;
            }
            // Track default for batched update after loop
            if (paramValue) {
              currentParams[p.id] = paramValue;
              paramsChanged = true;
            }
          }
          
          let options = p.options.map(opt => {
            let val = typeof opt === 'string' ? opt : opt.val;
            let text = typeof opt === 'string' ? opt : opt.text;
            // Show group metadata in option text for resource_group
            if (p.id === 'resource_group' && typeof opt === 'object' && opt.subtitle) {
              text += ` — ${opt.subtitle}`;
            }
            return { value: val, label: text };
          });
          
          let disabled = false;
          let disabledTitle = '';
          let activeGroup = currentParams.resource_group;
          let groupIsActive = activeGroup && activeGroup !== 'none';
          if ((p.id === 'provider' || p.id === 'agent') && this.$.messages && this.$.messages.length > 0) {
            disabled = true;
            disabledTitle = tPortal('text.locked');
          }
          // Disable provider+model when a resource group is active
          if ((p.id === 'provider' || p.id === 'model') && groupIsActive) {
            disabled = true;
            disabledTitle = `Managed by resource group: ${activeGroup}`;
          }

          let iconName = p.id === 'agent' ? 'smart_toy' : p.id === 'resource_group' ? 'view_kanban' : p.id === 'provider' ? 'dns' : p.id === 'model' ? 'neurology' : 'tune';
          let currentOption = p.options.find(opt => (typeof opt === 'string' ? opt : opt.val) === paramValue);
          let currentLabel = typeof currentOption === 'string' ? currentOption : currentOption?.text || p.label;
          // Show subtitle (group metadata) as tooltip
          let titleText = `${p.label}: ${currentLabel}`;
          if (p.id === 'resource_group' && typeof currentOption === 'object' && currentOption?.subtitle) {
            titleText += ` (${currentOption.subtitle})`;
          }
          
          return {
            id: p.id,
            kind: 'select',
            icon: iconName,
            label: p.label,
            title: disabledTitle || titleText,
            value: paramValue || '',
            options,
            disabled,
            priority,
            className: `composer-param composer-param-${p.id} ${priorityClass}`,
          };
        } else if (p.type === 'boolean') {
          let paramValue = currentParams[p.id];
          if (paramValue === undefined) {
            paramValue = true; // Default to true as requested
            currentParams[p.id] = paramValue;
            paramsChanged = true;
          }
          
          return {
            id: p.id,
            kind: 'checkbox',
            icon: paramValue ? 'toggle_on' : 'toggle_off',
            label: p.label,
            title: p.label,
            checked: Boolean(paramValue),
            value: Boolean(paramValue),
            priority,
            className: `composer-param composer-param-${p.id} ${priorityClass}`,
          };
        }
        return null;
      }).filter(Boolean);
      controls.push({
        id: 'settings',
        kind: 'button',
        icon: 'settings',
        label: tPortal('text.settings'),
        title: 'Configure Resource Groups',
        priority: 1,
        compact: true,
        className: 'composer-settings-btn',
      });
      this.$.composerFooterControls = controls;
      // Batch-persist defaults only for local user/composer changes.
      if (paramsChanged) {
        this.$.chatParams = { ...currentParams };
        let chatId = this._loadedChatId || dashState.activeChatId;
        if (chatId && !this._loadingChatState) {
          fetch('/api/chats/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: chatId, ...this._getPersistedChatParams(currentParams) }),
          });
        }
      }
    } else {
      this.$.composerFooterControls = [];
    }
    this._updatingOptions = false;
  }

  _composerParamPriorityValue(paramId) {
    switch (paramId) {
      case 'agent': return 5;
      case 'resource_group': return 4;
      case 'model': return 3;
      case 'provider':
      case 'approval_mode': return 2;
      case 'chatType': return 1;
      default: return 1;
    }
  }

  _composerParamPriorityClass(paramId) {
    switch (paramId) {
      case 'agent': return 'composer-priority-5';
      case 'resource_group': return 'composer-priority-4';
      case 'model': return 'composer-priority-3';
      case 'provider': return 'composer-priority-2';
      case 'approval_mode': return 'composer-priority-2';
      case 'chatType': return 'composer-priority-1';
      default: return 'composer-priority-1';
    }
  }

  _getAgentDefaultApprovalMode(agentSlug) {
    if (!agentSlug || agentSlug === 'none') return 'yolo';
    let agentParam = this.$.adapterMeta?.pool?.parameters?.find(p => p.id === 'agent');
    let option = agentParam?.options?.find(opt => (typeof opt === 'string' ? opt : opt.val) === agentSlug);
    return typeof option === 'object' && option.approvalMode ? option.approvalMode : 'yolo';
  }

  _getAgentResourceGroup(agentSlug) {
    if (!agentSlug || agentSlug === 'none') return null;
    let agentParam = this.$.adapterMeta?.pool?.parameters?.find(p => p.id === 'agent');
    let option = agentParam?.options?.find(opt => (typeof opt === 'string' ? opt : opt.val) === agentSlug);
    return typeof option === 'object' && option.resourceGroup ? option.resourceGroup : null;
  }

  _getDefaultPoolAgentSlug() {
    let agentParam = this.$.adapterMeta?.pool?.parameters?.find(p => p.id === 'agent');
    let options = agentParam?.options || [];
    let orchestrator = options.find(opt => (typeof opt === 'string' ? opt : opt.val) === DEFAULT_POOL_AGENT);
    if (orchestrator) return DEFAULT_POOL_AGENT;
    let first = options[0];
    return first ? (typeof first === 'string' ? first : first.val) : DEFAULT_POOL_AGENT;
  }

  _normalizePoolChatParams(params = {}) {
    let next = { ...params };
    if (!next.agent || next.agent === 'none') {
      next.agent = this._getDefaultPoolAgentSlug();
    }
    if (next.agent && next.agent !== 'none') {
      if (!next.approval_mode) {
        next.approval_mode = this._getAgentDefaultApprovalMode(next.agent);
      }
      let agentGroup = this._getAgentResourceGroup(next.agent);
      if (agentGroup && (!next.resource_group || next.resource_group === 'none')) {
        next.resource_group = agentGroup;
      }
    }
    return next;
  }

  _syncChatFromRouter() {
    let route = getRoute();
    let globals = parseQuery(route.query || '');
    let chatId = globals.chat || null;
    if (!chatId) {
      if (dashState.activeChatId) {
        dashState.activeChatId = null;
        dashEmit('active-chat-changed', { id: null, fromRoute: true });
        return;
      }
      if (this._loadedChatId) this._loadChat(null);
      return;
    }
    if (chatId && chatId !== dashState.activeChatId) {
      dashState.activeChatId = chatId;
      dashEmit('active-chat-changed', { id: chatId, fromRoute: true });
    } else if (chatId !== this._loadedChatId) {
      this._loadChat(chatId);
    }
  }


  _renderMessages() {
    let transcript = this._getTranscript();
    if (!transcript) return;
    let isAtBottom = transcript.isAtBottom?.(10) ?? true;

    let messages = this._toTranscriptMessages(this.$.messages || []);
    let hasActiveStream = this._hasActiveChatTask();
    let { items, streamingBoards } = buildChatMessageItems(messages, { hasActiveStream });

    this.$.messageItems = items;
    transcript.setMessageItems?.(items);

    requestAnimationFrame(() => {
      for (let taskIds of streamingBoards) {
        let board = transcript.findStatusBoard?.(taskIds);
        if (board) this._startDelegationPolling(taskIds, board);
      }
      if (isAtBottom) {
        transcript.scrollToBottom?.();
      }
      transcript.updateScrollBottomButton?.();
    });
  }

  _toTranscriptMessages(messages) {
    return messages.map((msg) => {
      if (msg?.role !== 'board' || !Array.isArray(msg.taskIds)) return msg;
      return {
        ...msg,
        cardItems: msg.taskIds.map((taskId) => ({
          id: taskId,
          title: `${String(taskId).substring(0, 8)}...`,
          status: msg.streaming ? 'running' : 'idle',
          statusText: msg.streaming ? tPortal('text.runningTask') : tPortal('text.queued'),
        })),
      };
    });
  }

  _applyProjectTransactions(messages) {
    this._appliedProjectTransactions ??= new Set();
    let route = getRoute();
    let globals = parseQuery(route.query);
    let projectId = globals.project || dashState.activeProjectId || null;
    applyProjectTransactionsFromMessages({
      messages,
      projectId,
      applied: this._appliedProjectTransactions,
    });
  }

  _applyProjectTransactionEvent(detail = {}) {
    this._appliedProjectTransactions ??= new Set();
    let route = getRoute();
    let globals = parseQuery(route.query);
    let projectId = detail.projectId || globals.project || dashState.activeProjectId || null;
    applyProjectTransactions({
      transactions: detail.transaction ? [detail.transaction] : detail.transactions,
      projectId,
      applied: this._appliedProjectTransactions,
    });
  }

  _hasActiveChatTask() {
    let chatId = this._loadedChatId || dashState.activeChatId;
    let chat = dashState.chats?.find(c => c.id === chatId);
    return !!(this._isSending || chat?.pendingTaskId || this.$.chatParams?.pendingTaskId);
  }

  _voiceTranscriptionPromptNote() {
    return tPortal('settings.voice.transcriptionNote');
  }

  _buildAgentPrompt(prompt, { voiceTranscribed = false, requestChatTitle = false } = {}) {
    let parts = [];
    if (voiceTranscribed) parts.push(this._voiceTranscriptionPromptNote());
    parts.push(prompt);
    if (requestChatTitle) {
      parts.push(buildChatTitleRequestNote(getLocalization().locale));
    }
    return parts.join('\n\n');
  }

  async _sendMessage({ voiceTranscribed = false } = {}) {
    this._syncComposerParamsFromDom();
    if (this.$.isInputDisabled) return;
    if (this._isSending) return;
    let chatId = this._loadedChatId || dashState.activeChatId;
    let prompt = this.$.inputVal.trim();
    if (!prompt) return;
    let sendParams = this._getChatSendParams();
    let persistedParams = this._getPersistedChatParams(sendParams);
    let requestChatTitle = !chatId;

    // Auto-create chat on first message (quick-start flow)
    if (!chatId) {
      try {
        let adapter = this.$.chatAdapter || 'pool';
        let routeParams = parseQuery(getRoute().query || '');
        let projectId = dashState.activeProjectId || routeParams.project || null;
        let project = projectId ? (dashState.projectHistory || []).find(p => p.id === projectId) : null;
        let name = project?.name ? `${project.name} — Chat` : tPortal('text.newChat');
        // Include current chatParams (provider, model, etc.) in the new chat
        let createPayload = { ...persistedParams, adapter, projectId, name };
        let res = await fetch('/api/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createPayload),
        });
        let data = await res.json();
        if (data.ok) {
          chatId = data.id;
          this._pendingAgentTitleChatId = chatId;
          dashState.activeChatId = chatId;
          updateParams({ chat: chatId });
          dashEmit('active-chat-changed', { id: chatId });
        } else {
          return;
        }
      } catch {
        return;
      }
    }

    // Sync any default/unsaved params from the UI dropdowns
    let changedParams = this._syncComposerParamsFromDom();
    if (changedParams) {
      sendParams = this._getChatSendParams();
      persistedParams = this._getPersistedChatParams(sendParams);
    }
    if (changedParams && chatId) {
      fetch('/api/chats/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: chatId, ...persistedParams })
      });
    }

    let attachedContext = this.$.attachedContext || [];
    let attachedFiles = extractAttachedFilePaths(attachedContext);
    if (attachedFiles.length) {
      let existingFiles = Array.isArray(sendParams.files) ? sendParams.files : [];
      sendParams = { ...sendParams, files: [...new Set([...existingFiles, ...attachedFiles])] };
    }

    let contextText = formatAttachedContextBlock(attachedContext);
    if (contextText) {
      prompt = contextText + prompt;
    }
    let agentPrompt = this._buildAgentPrompt(prompt, { voiceTranscribed, requestChatTitle });

    this._snapshotVoiceResponseBaseline();
    this.$.messages = [...this.$.messages, { role: 'user', text: prompt }];
    this.$.inputVal = '';
    this.$.attachedContext = []; // Clear context after send
    this._getComposer()?.setValue?.('');
    this._getComposer()?.resetInputHeight?.();
    this._setSending(true);

    // Persist
    await fetch('/api/chats/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, role: 'user', text: prompt }),
    });

    try {
      let adapter = this.$.chatAdapter || 'pool';
      let reply = '';
      let structuredEvents = null;

      if (adapter === 'pool') {
        this._setBackgroundActive(true);

        reply = await this._wsClient.send(chatId, agentPrompt, sendParams, this._sessionId);

        // _sendViaWs handles thinking block, final messages, and persistence
      } else {
        this.$.messages = [...this.$.messages, { role: 'system', text: tPortal('text.processing') }];
        this._setBackgroundActive(true);

        let payload = { ...sendParams, type: adapter, prompt: agentPrompt };
        if (!payload.timeout) payload.timeout = 300;
        let res = await fetch('/api/adapter/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        let data = await res.json();
        this.$.messages = this.$.messages.filter(m => m.text !== tPortal('text.processing'));

        if (data.error) {
          reply = tPortal('text.errorWithMessage', { message: data.error });
        } else {
          reply = data.response;
          structuredEvents = data.events;
        }
        if (data.errors?.length) reply += `\n\n${tPortal('text.warningsLabel')}:\n${data.errors.join('\n')}`;
      }

      // If we got structured events from HTTP adapter, render them
      if (adapter !== 'pool') {
        if (structuredEvents?.length) {
          let newMessages = [];
          for (let block of structuredEvents) {
            if (block.type === 'tool_use') {
              newMessages.push({ role: 'tool', name: block.name, input: block.input, result: block.result });
            }
          }
          let textBlocks = structuredEvents.filter(b => b.type === 'text').map(b => b.text).join('\n');
          let finalText = textBlocks || reply;
          if (finalText) {
            newMessages.push({ role: 'agent', text: finalText });
          }
          this.$.messages = [...this.$.messages, ...newMessages];
        } else {
          this.$.messages = [...this.$.messages, { role: 'agent', text: reply }];
        }
        this.$.messages = this._applyAgentGeneratedChatTitle(chatId, this.$.messages);
      } else {
        // Pool adapter: Handler in _sendViaWs already merged the final result
        // into the last streamed agent message. Nothing to do here.
      }

      // Persist the full chat state (pool adapter persists inside _sendViaWs handler)
      if (adapter !== 'pool') {
        await fetch('/api/chats/messages', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, messages: this.$.messages }),
        });
        dashEmit('chats-updated');
      }
    } catch (err) {
      this.$.messages = [...this.$.messages, { role: 'system', text: tPortal('text.errorWithMessage', { message: err.message }) }];
    }
    this._setSending(false);
    this._setBackgroundActive(false);
  }

  _handlePulledChat(chat, detail = {}) {
    let messages = Array.isArray(chat?.messages) ? chat.messages : [];
    if (!detail.final) return messages;
    return this._applyAgentGeneratedChatTitle(chat?.id, messages);
  }

  _applyAgentGeneratedChatTitle(chatId, messages = []) {
    if (!chatId || this._pendingAgentTitleChatId !== chatId) return messages;
    let index = messages.findLastIndex(message => message?.role === 'agent' && message.text);
    if (index < 0) return messages;

    let parsed = extractChatTitleFromAgentText(messages[index].text);
    if (!parsed.title) return messages;

    this._pendingAgentTitleChatId = '';
    let nextMessages = [...messages];
    nextMessages[index] = { ...nextMessages[index], text: parsed.text };
    this._saveAgentGeneratedChatTitle(chatId, parsed.title, nextMessages);
    return nextMessages;
  }

  _saveAgentGeneratedChatTitle(chatId, title, messages) {
    this.$.chatName = title;
    let chat = dashState.chats?.find(item => item.id === chatId);
    if (chat) chat.name = title;
    dashEmit('chats-updated', { id: chatId, path: 'chats.updated' });

    fetch('/api/chats/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: chatId, name: title }),
    }).catch(() => {});

    fetch('/api/chats/messages', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, messages }),
    }).catch(() => {});
  }

  _syncComposerParamsFromDom() {
    if (!this._getComposer()) return false;
    let selects = this._getComposer().getParamControls?.() || [];
    let paramsObj = { ...this.$.chatParams };
    let hasChanges = false;
    for (let select of selects) {
      let id = select.dataset.param;
      if (select.value && select.value !== '' && paramsObj[id] !== select.value) {
        paramsObj[id] = select.value;
        hasChanges = true;
      }
    }
    if (hasChanges) {
      this.$.chatParams = paramsObj;
    }
    return hasChanges;
  }

  _getChatSendParams() {
    let params = { ...(this.$.chatParams || {}) };
    if ((this.$.chatAdapter || 'pool') === 'pool') {
      params = this._normalizePoolChatParams(params);
    }
    delete params.chatId;
    delete params.sessionId;
    delete params.prompt;
    delete params.type;
    if (params.resource_group && params.resource_group !== 'none') {
      delete params.provider;
      delete params.model;
    }
    return params;
  }

  _getPersistedChatParams(params = this.$.chatParams || {}) {
    let allowed = ['agent', 'provider', 'model', 'approval_mode', 'resource_group', 'chatType'];
    let result = {};
    let hasResourceGroup = params.resource_group && params.resource_group !== 'none';
    for (let key of allowed) {
      if (hasResourceGroup && (key === 'provider' || key === 'model')) continue;
      let value = params[key];
      if (value == null || value === '') continue;
      result[key] = value;
    }
    if (hasResourceGroup) {
      result.provider = null;
      result.model = null;
    }
    return result;
  }

  _handleExternalChatUpdate(detail = {}) {
    let chatId = detail?.id || null;
    let activeChatId = this._loadedChatId || dashState.activeChatId || null;
    if (!chatId || chatId !== activeChatId || this._isSending) return;
    clearTimeout(this._externalChatUpdateTimer);
    this._externalChatUpdateTimer = setTimeout(() => {
      this._refreshExternalChat(chatId);
    }, 150);
  }

  async _refreshExternalChat(chatId) {
    if (!chatId || chatId !== (this._loadedChatId || dashState.activeChatId)) return;
    try {
      let res = await fetch('/api/chats/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: chatId }),
      });
      if (!res.ok) return;
      let chat = await res.json();
      if (!chat || chat.error || chat.id !== (this._loadedChatId || dashState.activeChatId)) return;

      this.$.chatName = chat.name || this.$.chatName || 'Chat';
      this.$.chatAdapter = chat.adapter || this.$.chatAdapter || 'pool';
      this.$.isSubagentChat = Boolean(chat.parentChatId);
      let msgs = this._cleanLoadedMessages(chat.messages || []);
      if (!sameChatMessages(msgs, this.$.messages)) this.$.messages = msgs;
      this._applyProjectTransactionEvent({
        projectId: chat.projectId || null,
        transactions: chat.projectTransactions || [],
      });
      this._sessionId = chat.sessionId || this._sessionId || null;
      this._setLoadedChatParams(chat);
    } catch (err) {
      console.error('[AgentChat] external chat refresh error:', err);
    }
  }

  _cleanLoadedMessages(messages = []) {
    return messages.filter(m => {
      if (m.role !== 'system') return true;
      let t = m.text || '';
      return !t.startsWith(ICONS.WAIT)
        && !t.startsWith(ICONS.OK)
        && !t.startsWith(ICONS.WARN)
        && t !== tPortal('text.processing');
    });
  }

  _chatParamsFromLoadedChat(chat = {}) {
    let params = {};
    let baseProps = [
      'id',
      'projectId',
      'parentChatId',
      'name',
      'adapter',
      'origin',
      'messages',
      'projectTransactions',
      'sessionId',
      'pendingTaskId',
      'createdAt',
      'updatedAt',
    ];
    for (let key in chat) {
      if (!baseProps.includes(key) && chat[key] != null) {
        params[key] = chat[key];
      }
    }
    return params;
  }

  _setLoadedChatParams(chat) {
    this._loadingChatState = true;
    try {
      this.$.chatParams = this._chatParamsFromLoadedChat(chat);
      this._updateComposerFooter();
    } finally {
      this._loadingChatState = false;
    }
  }

  async _loadChat(chatId) {
    this._loadedChatId = chatId;
    // Clean up any active voice recording
    this._removeVoicePreview();
    this._audioRecorder.cancel();
    this._syncVoiceControls();
    // Reset sending state — each chat manages its own task lifecycle independently.
    // The correct state will be restored below if the chat has a pendingTaskId.
    this._setSending(false, { speak: false });
    if (!chatId) {
      this.$.messages = [];
      this.$.chatName = tPortal('text.newChat');
      this.$.chatAdapter = 'pool';
      this.$.chatParams = {};
      this.$.isSubagentChat = false;
      this._sessionId = null;
      this.$.sessionMetaHtml = '';
      this._updateComposerFooter();
      this._focusInput();
      return;
    }

    try {
      let res = await fetch('/api/chats/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: chatId }),
      });
      if (!res.ok) {
        console.error('[AgentChat] Server error:', res.status);
        this.$.messages = [{ role: 'system', text: `Server error: ${res.status}` }];
        return;
      }
      let chat = await res.json();
      if (chat.error) {
        console.error('[AgentChat] API error:', chat.error);
        this.$.messages = [{ role: 'system', text: chat.error }];
        return;
      }

      this.$.chatName = chat.name || 'Chat';
      this.$.chatAdapter = chat.adapter || 'pool';
      this.$.isSubagentChat = Boolean(chat.parentChatId);
      let msgs = this._cleanLoadedMessages(chat.messages || []);
      this.$.messages = msgs;
      this._applyProjectTransactionEvent({
        projectId: chat.projectId || null,
        transactions: chat.projectTransactions || [],
      });
      this._sessionId = chat.sessionId || null;
      
      this._setLoadedChatParams(chat);
      
      // Resume pending task if exists (e.g. browser was reloaded mid-chat)
      if (chat.pendingTaskId) {
        this._setSending(true);
        this._wsClient.resume(chatId, chat.pendingTaskId);
      } else {
        this._focusInput();
      }
      
    } catch (err) {
      console.error('[AgentChat] Catch error:', err);
      this.$.messages = [{ role: 'system', text: `Load error: ${err.message}` }];
    }
  }

  /**
   * Render a live status indicator below messages during streaming.
   * Shows lightweight phase info (thinking/tool/responding) without message content.
   * @param {object|null} meta - { phase, messageCount, lastToolName, thinkingStatus } or null to clear
   */
  _renderLiveStatus(meta) {
    this._getTranscript()?.renderLiveStatus(meta);
  }

  /**
   * Poll StateGraph for delegation task statuses and update cards.
   * Only fetches meta (status, eventCount) — no raw event data.
   * @param {string[]} taskIds
   * @param {HTMLElement} boardEl
   */
  _startDelegationPolling(taskIds, boardEl) {
    if (this._delegationPoller) clearInterval(this._delegationPoller);

    let allDone = new Set();

    this._delegationPoller = setInterval(async () => {
      try {
        let res = await fetch('/api/state/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskIds })
        });
        let data = await res.json();
        if (!data || !data.tasks) return;

        for (let taskId of taskIds) {
          let task = data.tasks[taskId];
          if (!task) continue;

          let status = task.status || 'running';
          let isDone = status === 'done' || status === 'error' || status === 'cancelled' || status === 'lost';

          this._getTranscript()?.updateStatusCard?.(taskId, {
            status,
            startedAt: task.startedAt,
            updatedAt: task.updatedAt,
            linkId: task.chatId || '',
            title: task.chatName || '',
          }, { board: boardEl });

          if (isDone) allDone.add(taskId);
        }

        // Stop polling when all tasks are done
        if (allDone.size === taskIds.length) {
          clearInterval(this._delegationPoller);
          this._delegationPoller = null;
          // Mark board message as no longer streaming
          let msgs = [...this.$.messages];
          let boardMsg = msgs.find(m => m.role === 'board');
          if (boardMsg) boardMsg.streaming = false;
        }
      } catch (err) {
        console.warn('[AgentChat] Delegation poll error:', err.message);
      }
    }, 3000); // Poll every 3s — status-only, lightweight
  }
}

AgentChat.template = template;
AgentChat.rootStyles = css;
AgentChat.reg('pg-agent-chat');
