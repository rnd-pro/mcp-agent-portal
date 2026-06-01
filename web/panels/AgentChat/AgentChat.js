import { Symbiote } from '@symbiotejs/symbiote';
import { state as dashState, events as dashEvents, emit as dashEmit } from '../../dashboard-state.js';
import {
  buildChatMessageItems,
  buildSessionMetaHtml,
  escapeHtml,
  getRoute,
  parseQuery,
  updateParams,
} from 'symbiote-node/ui';
import template from './AgentChat.tpl.js';
import css from './AgentChat.css.js';
import { ICONS } from '../../common/icons.js';
import { ChatWsClient } from '../../services/chat-ws-client.js';
import { AudioRecorder } from '../../services/audio-recorder.js';
import { ChatAutocomplete } from '../../services/chat-autocomplete.js';
import {
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
import { getLocalization } from 'symbiote-node/locale';
import { sanitizeVoiceResponseText } from './voice-response-text.js';
import '../../components/ChatSidebar/ChatSidebar.js';

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
  _audioRecorder = new AudioRecorder();
  _voiceCommandMode = false;
  _voiceCommandTriggered = false;
  _voiceCommandTextOverride = '';
  _voiceCommandPhrases = null;
  _wakeCommandPhrases = null;
  _wakeModeEnabled = false;
  _wakePausedForRecording = false;
  _wakeRecognition = null;
  _wakeTriggering = false;
  _voiceResponseEnabled = false;
  _voiceResponseLastAgentKey = '';
  _speakingVoiceResponse = false;
  init$ = {
    messages: [],
    messageItems: [],
    inputVal: '',
    chatName: tPortal('text.selectChat'),
    chatAdapter: '',
    adapterMeta: {},
    adapterOptionsHtml: '',
    composerFooterHtml: '',
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

    this._ac = new ChatAutocomplete({
      popupEl: this.ref.composer?.getAutocompleteElement?.(),
      textareaEl: this.ref.composer?.getInputElement?.(),
      onAttachFile: (newVal, path) => {
        this.$.inputVal = newVal;
        this.ref.composer?.setValue?.(newVal);
        this._attachContext({ type: 'file', path, source: 'autocomplete' });
      },
      onInsertWorkflow: (newVal) => {
        this.$.inputVal = newVal;
        this.ref.composer?.setValue?.(newVal);
      }
    });

    this.ref.chatTranscript?.addEventListener('status-card-open', (event) => {
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
      onBackgroundToggle: (isActive) => this.ref.cellBg?.toggle(isActive),
      onMetaHtml: (html) => { this.$.sessionMetaHtml = html; },
      onMeta: (meta) => this._renderLiveStatus(meta),
      onProjectTransaction: (detail) => this._applyProjectTransactionEvent(detail),
      onDone: () => {
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
      this._syncVoiceResponseButton();
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
    this.sub('composerFooterHtml', () => this._syncComposerComponent());

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

  _bindComposer() {
    let composer = this.ref.composer;
    if (!composer || this._composerBound) return;
    this._composerBound = true;

    composer.addEventListener('chat-composer-input', (event) => {
      let value = event.detail?.value || '';
      this.$.inputVal = value;
      this._ac?.check(value, event.detail?.selectionStart);
    });

    composer.addEventListener('chat-composer-key', (event) => {
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

    composer.addEventListener('chat-composer-submit', () => this._sendMessage());
    composer.addEventListener('chat-composer-send', () => this._handleComposerSend());
    composer.addEventListener('chat-composer-voice-approve', () => this._stopRecording({ autoSend: true }));
    composer.addEventListener('chat-composer-voice-cancel', () => this._cancelVoiceResult());
    composer.addEventListener('chat-composer-voice-send', () => this._confirmVoiceResult());
    composer.addEventListener('chat-composer-voice-command-toggle', () => this._toggleVoiceCommandMode());
    composer.addEventListener('chat-composer-param-change', (event) => this._handleComposerParamChange(event.detail));
    composer.addEventListener('chat-composer-context-remove', (event) => {
      this.$.attachedContext = removeAttachedContext(this.$.attachedContext, event.detail?.key);
    });
    composer.addEventListener('chat-composer-context-drop', (event) => {
      let path = event.detail?.path;
      if (path) this._attachContext({ type: 'file', path, source: 'drop' });
    });

    this._syncComposerComponent();
    this._setupMicButton();
  }

  _syncComposerComponent() {
    let composer = this.ref.composer;
    if (!composer) return;
    composer.setValue?.(this.$.inputVal || '');
    composer.setAttachedContext?.(this.$.attachedContext || []);
    composer.setDisabled?.(this.$.isInputDisabled);
    composer.setPlaceholder?.(this.$.inputPlaceholder || '');
    composer.setFooterHtml?.(this.$.composerFooterHtml || '');
    composer.setSending?.(this._isSending);
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

  /** Toggle empty attribute on chat-view based on message count */
  _updateEmptyState() {
    let view = this.ref.chatView;
    if (view) {
      let hasMessages = this.$.messages && this.$.messages.length > 0;
      view.toggleAttribute('empty', !hasMessages);
    }
  }

  /** Toggle send button between arrow_upward and stop */
  _setupMicButton() {
    let composer = this.ref.composer;
    if (!composer || !this._audioRecorder.isAvailable) return;
    let body = composer.querySelector('.composer-body:not(.voice-preview)');
    let sendBtn = body?.querySelector('.btn-send');
    if (!body || !sendBtn || body.querySelector('.btn-mic')) return;

    let micBtn = document.createElement('button');
    micBtn.className = 'btn-mic';
    micBtn.type = 'button';
    micBtn.title = 'Voice input';
    micBtn.innerHTML = '<span class="material-symbols-outlined">mic</span>';
    body.insertBefore(micBtn, sendBtn);
    this._micBtn = micBtn;

    let wakeBtn = document.createElement('button');
    wakeBtn.className = 'btn-wake-listen';
    wakeBtn.type = 'button';
    wakeBtn.title = tPortal('settings.voice.listenButton');
    wakeBtn.setAttribute('aria-pressed', 'false');
    wakeBtn.innerHTML = '<span class="material-symbols-outlined">hearing</span>';
    if (!this._audioRecorder.hasSpeechRecognition) {
      wakeBtn.disabled = true;
      wakeBtn.title = tPortal('settings.voice.listenUnavailable');
    }
    body.insertBefore(wakeBtn, micBtn);
    this._wakeBtn = wakeBtn;

    let responseBtn = document.createElement('button');
    responseBtn.className = 'btn-voice-response';
    responseBtn.type = 'button';
    responseBtn.title = tPortal('settings.voice.speakResponse');
    responseBtn.hidden = true;
    responseBtn.innerHTML = '<span class="material-symbols-outlined">record_voice_over</span>';
    body.insertBefore(responseBtn, micBtn);
    this._voiceResponseBtn = responseBtn;

    micBtn.onclick = () => this._toggleRecording();
    wakeBtn.onclick = () => this._toggleWakeMode();
    responseBtn.onclick = () => this._toggleVoiceResponseMode();

    // Live interim results callback
    this._audioRecorder.onInterim = (text, elapsed) => {
      this._updateVoicePreview(text, elapsed);
    };
  }

  _toggleVoiceCommandMode() {
    this._voiceCommandMode = !this._voiceCommandMode;
    this._saveVoiceInputModeSettings();
    this._updateVoicePreview(null, this._audioRecorder.elapsed);
  }

  async _saveVoiceInputModeSettings() {
    try {
      let settings = await fetch('/api/settings').then((res) => res.json());
      let voiceInput = {
        ...(settings?.voiceInput || {}),
        sendByCommandEnabled: this._voiceCommandMode,
        voiceResponseEnabled: this._voiceResponseEnabled,
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
    return {
      en: 'send',
      ru: 'отправить',
      es: 'enviar',
    };
  }

  _defaultWakeCommandPhrases() {
    return {
      en: 'voice input',
      ru: 'голосовой ввод',
      es: 'entrada de voz',
    };
  }

  _getVoiceCommandPhrase() {
    let locale = getLocalization().locale;
    let phrases = this._voiceCommandPhrases || this._defaultVoiceCommandPhrases();
    return phrases[locale] || this._defaultVoiceCommandPhrases()[locale] || this._defaultVoiceCommandPhrases().en;
  }

  _getWakeCommandPhrase() {
    let locale = getLocalization().locale;
    let phrases = this._wakeCommandPhrases || this._defaultWakeCommandPhrases();
    return phrases[locale] || this._defaultWakeCommandPhrases()[locale] || this._defaultWakeCommandPhrases().en;
  }

  async _loadVoiceInputSettings() {
    try {
      let settings = await fetch('/api/settings').then((res) => res.json());
      let sendDefaults = this._defaultVoiceCommandPhrases();
      let wakeDefaults = this._defaultWakeCommandPhrases();
      let savedSend = settings?.voiceInput?.sendCommands || {};
      let savedWake = settings?.voiceInput?.wakeCommands || {};
      let legacy = String(settings?.voiceInput?.sendCommand || '').trim();
      this._voiceCommandMode = Boolean(settings?.voiceInput?.sendByCommandEnabled);
      this._voiceResponseEnabled = Boolean(settings?.voiceInput?.voiceResponseEnabled);
      this._voiceCommandPhrases = {
        en: String(savedSend.en || legacy || sendDefaults.en).trim() || sendDefaults.en,
        ru: String(savedSend.ru || sendDefaults.ru).trim() || sendDefaults.ru,
        es: String(savedSend.es || sendDefaults.es).trim() || sendDefaults.es,
      };
      this._wakeCommandPhrases = {
        en: String(savedWake.en || wakeDefaults.en).trim() || wakeDefaults.en,
        ru: String(savedWake.ru || wakeDefaults.ru).trim() || wakeDefaults.ru,
        es: String(savedWake.es || wakeDefaults.es).trim() || wakeDefaults.es,
      };
    } catch {
      this._voiceCommandPhrases = this._defaultVoiceCommandPhrases();
      this._wakeCommandPhrases = this._defaultWakeCommandPhrases();
    }
  }

  _escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  _extractVoiceCommandText(text = '') {
    let value = String(text || '').trim();
    if (!value) return { matched: false, text: '' };
    let command = this._escapeRegExp(this._getVoiceCommandPhrase());
    let commandPattern = new RegExp(`(?:[\\s,.;:!?]+|^)(${command})[\\s,.;:!?]*$`, 'iu');
    if (!commandPattern.test(value)) return { matched: false, text: value };
    let cleaned = value.replace(commandPattern, '').trim();
    return { matched: Boolean(cleaned), text: cleaned };
  }

  _matchesWakeCommand(text = '') {
    let value = String(text || '').trim();
    if (!value) return false;
    let command = this._escapeRegExp(this._getWakeCommandPhrase());
    let commandPattern = new RegExp(`(?:[\\s,.;:!?]+|^)(${command})(?:[\\s,.;:!?]+|$)`, 'iu');
    return commandPattern.test(value);
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
    if (!this._wakeBtn) return;
    this._wakeBtn.classList.toggle('listening', this._wakeModeEnabled);
    this._wakeBtn.setAttribute('aria-pressed', this._wakeModeEnabled ? 'true' : 'false');
    this._wakeBtn.title = this._wakeModeEnabled
      ? tPortal('settings.voice.listeningFor', { command: this._getWakeCommandPhrase() })
      : tPortal('settings.voice.listenButton');
    if (this._micBtn) this._micBtn.hidden = this._wakeModeEnabled;
    this._syncVoiceResponseButton();
  }

  _syncVoiceResponseButton() {
    if (!this._voiceResponseBtn) return;
    let available = Boolean(globalThis.speechSynthesis && globalThis.SpeechSynthesisUtterance);
    this._voiceResponseBtn.hidden = !this._wakeModeEnabled;
    this._voiceResponseBtn.disabled = !this._wakeModeEnabled || !available;
    this._voiceResponseBtn.classList.toggle('enabled', this._voiceResponseEnabled);
    this._voiceResponseBtn.classList.toggle('speaking', this._speakingVoiceResponse);
    this._voiceResponseBtn.title = !available
      ? tPortal('settings.voice.speakUnavailable')
      : tPortal('settings.voice.speakResponse');
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

  _speechLocale() {
    let locale = getLocalization().locale;
    if (locale === 'ru') return 'ru-RU';
    if (locale === 'es') return 'es-ES';
    return 'en-US';
  }

  _speakPendingAgentResponse() {
    if (!this._voiceResponseEnabled || this._isSending) return;
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
    recognition.lang = navigator.language || 'en-US';
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
        await this._toggleRecording();
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
      let command = this._voiceCommandMode ? this._extractVoiceCommandText(text) : { matched: false, text };
      this._voiceInterimText = command.text;
      if (command.matched && !this._voiceCommandTriggered) {
        this._voiceCommandTriggered = true;
        this._voiceCommandTextOverride = command.text;
        this._stopRecording({ autoSend: true, textOverride: command.text });
        return;
      }
    }
    let seconds = typeof elapsed === 'number' ? elapsed : this._audioRecorder.elapsed;
    this.ref.composer?.setVoicePreview?.({
      mode: 'recording',
      status: this._formatVoiceElapsed(seconds),
      text: this._voiceInterimText || '',
      elapsed: true,
      commandMode: this._voiceCommandMode,
      commandPhrase: this._getVoiceCommandPhrase(),
    });
    this._voicePreview = this.ref.composer?.getVoicePreviewElement?.() || this._voicePreview;
  }

  _formatVoiceElapsed(elapsed = 0) {
    let m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    let s = String(elapsed % 60).padStart(2, '0');
    return `● Recording ${m}:${s}`;
  }

  _ensureVoicePreview(mode = 'recording') {
    let composer = this.ref.composer;
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
    let composer = this.ref.composer;
    if (!composer) return;
    let recording = mode === 'recording';
    composer.setVoicePreview?.({
      mode,
      status: recording ? this._formatVoiceElapsed(this._audioRecorder.elapsed) : '',
      text: recording ? this._voiceInterimText || '' : '',
      elapsed: recording,
      commandMode: this._voiceCommandMode,
      commandPhrase: this._getVoiceCommandPhrase(),
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
    this.ref.composer?.setVoicePreview?.({ mode: 'error', text: message });
    this._voicePreview = this.ref.composer?.getVoicePreviewElement?.() || null;
    this._voiceInterimText = '';
    this._voiceResultText = '';
    this._voiceAudioUrl = null;
    this._voiceCommandTriggered = false;
    this._voiceCommandTextOverride = '';
    this._micBtn?.classList.remove('recording', 'processing');
    let icon = this._micBtn?.querySelector('.material-symbols-outlined');
    if (icon) icon.textContent = 'mic';
  }

  _removeVoicePreview() {
    this.ref.composer?.clearVoicePreview?.();
    this._voicePreview = null;
    this._voiceCommandTriggered = false;
    this._voiceCommandTextOverride = '';
  }

  async _toggleRecording() {
    if (this._audioRecorder.state === 'recording') {
      this._stopRecording();
    } else if (this._audioRecorder.state === 'idle') {
      try {
        await this._loadVoiceInputSettings();
        this._pauseWakeListeningForRecording();
        this._voiceInterimText = '';
        this._voiceCommandTriggered = false;
        this._voiceCommandTextOverride = '';
        this._showVoicePreview('recording');
        this._startVoiceUiTimer();
        await this._audioRecorder.start();
        this._micBtn?.classList.add('recording');
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
            this._micBtn?.classList.add('recording');
          } catch (err2) {
            console.error('[AgentChat] Mic fallback also failed:', err2);
            this._showVoiceError('Microphone access denied. Check browser microphone permissions.');
            this._resumeWakeListeningAfterRecording();
          }
        } else {
          this._showVoiceError('Microphone access denied. Check browser microphone permissions.');
          this._resumeWakeListeningAfterRecording();
        }
      }
    }
  }

  async _stopRecording({ autoSend = false, textOverride = '' } = {}) {
    this._stopVoiceUiTimer();
    this._micBtn?.classList.remove('recording');
    this._micBtn?.classList.add('processing');
    let icon = this._micBtn?.querySelector('.material-symbols-outlined');
    if (icon) icon.textContent = 'progress_activity';

    try {
      let result = await this._audioRecorder.stop();
      let text = textOverride || this._voiceCommandTextOverride || result.text || '';

      // If no text from Speech API, try server transcription
      if (!text && result.audioBase64) {
        this.ref.composer?.setVoicePreview?.({ mode: 'processing', status: 'Transcribing...', text: '', elapsed: true });
        this._voicePreview = this.ref.composer?.getVoicePreviewElement?.() || null;

        let res = await fetch('/api/audio/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: result.audioBase64, mimeType: result.mimeType }),
        });
        let data = await res.json();
        text = data.text || '';

        // Store audio for potential playback
        if (result.audioBase64 && result.mimeType) {
          this._voiceAudioUrl = `data:${result.mimeType};base64,${result.audioBase64}`;
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
          this.ref.composer?.setValue?.(text);
          this.$.inputVal = text;
          this._sendMessage({ voiceTranscribed: true });
        } else {
          this.ref.composer?.setVoicePreview?.({ mode: 'result', text, editable: true });
          this._voicePreview = this.ref.composer?.getVoicePreviewElement?.() || null;
        }
      } else {
        this._showVoiceError('No speech detected. Try again.');
      }
    } catch (err) {
      console.error('[AgentChat] Transcription error:', err);
      this._showVoiceError('Transcription failed. Try again.');
    } finally {
      this._micBtn?.classList.remove('processing');
      let icon = this._micBtn?.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = 'mic';
      this._resumeWakeListeningAfterRecording();
    }
  }

  _confirmVoiceResult() {
    let body = this.ref.composer?.getVoicePreviewBody?.() || this._voicePreview?.querySelector('.voice-preview-body');
    let text = body?.textContent?.trim() || this._voiceResultText || '';
    this._removeVoicePreview();
    this._voiceInterimText = '';
    this._voiceResultText = '';
    this._voiceAudioUrl = null;
    this._voiceCommandTriggered = false;
    this._voiceCommandTextOverride = '';
    if (!text) return;
    this.ref.composer?.setValue?.(text);
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
    this._voiceCommandTextOverride = '';
    this._audioRecorder.cancel();
    this._micBtn?.classList.remove('recording', 'processing');
    let icon = this._micBtn?.querySelector('.material-symbols-outlined');
    if (icon) icon.textContent = 'mic';
    this._resumeWakeListeningAfterRecording();
  }


  _setSending(active, { speak = true } = {}) {
    this._isSending = active;
    this.ref.composer?.setSending?.(active);
    this._renderMessages();
    if (!active && speak) this._speakPendingAgentResponse();
  }

  _focusInput() {
    requestAnimationFrame(() => {
      let input = this.ref.composer?.getInputElement?.();
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

    if (adapter === 'pool') {
      // Pool params first (agent, chatType)
      if (meta.pool?.parameters) {
        paramsToMap.push(...meta.pool.parameters);
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
      let paramsChanged = false;
      let htmlStr = paramsToMap.map(p => {
        let priorityClass = this._composerParamPriorityClass(p.id);
        if (p.type === 'select' && Array.isArray(p.options)) {
          let paramValue = currentParams[p.id];
          if (!paramValue && p.options.length > 0) {
            if (p.id === 'agent') {
              let orch = p.options.find(o => (typeof o === 'string' ? o : o.val) === 'orchestrator');
              paramValue = orch ? (typeof orch === 'string' ? orch : orch.val) : (typeof p.options[0] === 'string' ? p.options[0] : p.options[0].val);
            } else if (p.id === 'resource_group') {
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
          
          let optionsHtml = '';
          if (p.id === 'model' && !paramValue) {
            optionsHtml += `<option value="" disabled selected>-- Model --</option>`;
          }
          
          optionsHtml += p.options.map(opt => {
            let val = typeof opt === 'string' ? opt : opt.val;
            let text = typeof opt === 'string' ? opt : opt.text;
            // Show group metadata in option text for resource_group
            if (p.id === 'resource_group' && typeof opt === 'object' && opt.subtitle) {
              text += ` — ${opt.subtitle}`;
            }
            let sel = val === paramValue ? 'selected' : '';
            return `<option value="${escapeHtml(val)}" ${sel}>${escapeHtml(text)}</option>`;
          }).join('');
          
          let disabledAttr = '';
          let activeGroup = currentParams.resource_group;
          let groupIsActive = activeGroup && activeGroup !== 'none';
          if ((p.id === 'provider' || p.id === 'agent') && this.$.messages && this.$.messages.length > 0) {
            disabledAttr = `disabled title="${escapeHtml(tPortal('text.locked'))}"`;
          }
          // Disable provider+model when a resource group is active
          if ((p.id === 'provider' || p.id === 'model') && groupIsActive) {
            disabledAttr = `disabled title="Managed by resource group: ${escapeHtml(activeGroup)}"`;
          }

          let iconName = p.id === 'agent' ? 'smart_toy' : p.id === 'resource_group' ? 'view_kanban' : p.id === 'provider' ? 'dns' : p.id === 'model' ? 'neurology' : 'tune';
          let currentOption = p.options.find(opt => (typeof opt === 'string' ? opt : opt.val) === paramValue);
          let currentLabel = typeof currentOption === 'string' ? currentOption : currentOption?.text || p.label;
          // Show subtitle (group metadata) as tooltip
          let titleText = `${p.label}: ${currentLabel}`;
          if (p.id === 'resource_group' && typeof currentOption === 'object' && currentOption?.subtitle) {
            titleText += ` (${currentOption.subtitle})`;
          }
          
          return `<span class="composer-footer-btn composer-param composer-param-${escapeHtml(p.id)} ${priorityClass}" title="${escapeHtml(titleText)}"><span class="material-symbols-outlined">${iconName}</span><select class="composer-footer-select" data-param="${escapeHtml(p.id)}" aria-label="${escapeHtml(p.label)}" ${disabledAttr}>${optionsHtml}</select></span>`;
        } else if (p.type === 'boolean') {
          let paramValue = currentParams[p.id];
          if (paramValue === undefined) {
            paramValue = true; // Default to true as requested
            currentParams[p.id] = paramValue;
            paramsChanged = true;
          }
          let checked = paramValue ? 'checked' : '';
          
          return `<label class="composer-footer-btn composer-param composer-param-${escapeHtml(p.id)} ${priorityClass}" title="${escapeHtml(p.label)}">
            <input type="checkbox" class="composer-footer-checkbox" data-param="${escapeHtml(p.id)}" ${checked} hidden>
            <span class="material-symbols-outlined composer-toggle-icon">${paramValue ? 'toggle_on' : 'toggle_off'}</span>
            <span class="composer-footer-label">${escapeHtml(p.label)}</span>
          </label>`;
        }
        return '';
      }).join('');
      // Append settings button at the end of all selectors
      htmlStr += `<a href="/#resource-groups" class="composer-footer-btn composer-settings-btn" title="Configure Resource Groups" style="color:inherit;text-decoration:none;display:inline-flex;align-items:center;cursor:pointer"><span class="material-symbols-outlined" style="font-size:16px;opacity:0.5">settings</span></a>`;
      this.$.composerFooterHtml = htmlStr;
      // Batch-persist all defaults in a single reactive update
      if (paramsChanged) {
        this.$.chatParams = { ...currentParams };
        let chatId = this._loadedChatId || dashState.activeChatId;
        if (chatId) {
          fetch('/api/chats/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: chatId, ...this._getPersistedChatParams(currentParams) }),
          });
        }
      }
    } else {
      this.$.composerFooterHtml = '';
    }
    this._updatingOptions = false;
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
    let transcript = this.ref.chatTranscript;
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
    let locale = getLocalization().locale;
    if (locale === 'ru') {
      return '[Примечание: следующее сообщение получено через голосовую транскрибацию. В нем возможны ошибки распознавания; учитывай контекст и уточняй, если смысл неоднозначен.]';
    }
    if (locale === 'es') {
      return '[Nota: el siguiente mensaje proviene de una transcripcion de voz. Puede contener errores de reconocimiento; usa el contexto y pide aclaracion si el sentido no es claro.]';
    }
    return '[Note: the following message was produced by voice transcription. It may contain recognition errors; use context and ask for clarification if the intent is ambiguous.]';
  }

  _buildAgentPrompt(prompt, { voiceTranscribed = false } = {}) {
    if (!voiceTranscribed) return prompt;
    return `${this._voiceTranscriptionPromptNote()}\n\n${prompt}`;
  }

  async _sendMessage({ voiceTranscribed = false } = {}) {
    this._syncComposerParamsFromDom();
    if (this.$.isInputDisabled) return;
    let chatId = this._loadedChatId || dashState.activeChatId;
    let prompt = this.$.inputVal.trim();
    if (!prompt) return;
    let sendParams = this._getChatSendParams();
    let persistedParams = this._getPersistedChatParams(sendParams);

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

    let contextText = formatAttachedContextBlock(this.$.attachedContext || []);
    if (contextText) {
      prompt = contextText + prompt;
    }
    let agentPrompt = this._buildAgentPrompt(prompt, { voiceTranscribed });

    this._snapshotVoiceResponseBaseline();
    this.$.messages = [...this.$.messages, { role: 'user', text: prompt }];
    this.$.inputVal = '';
    this.$.attachedContext = []; // Clear context after send
    this.ref.composer?.setValue?.('');
    this.ref.composer?.resetInputHeight?.();
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
        if (this.ref.cellBg) this.ref.cellBg.toggle(true);

        reply = await this._wsClient.send(chatId, agentPrompt, sendParams, this._sessionId);

        // _sendViaWs handles thinking block, final messages, and persistence
      } else {
        this.$.messages = [...this.$.messages, { role: 'system', text: tPortal('text.processing') }];
        if (this.ref.cellBg) this.ref.cellBg.toggle(true);

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
    if (this.ref.cellBg) this.ref.cellBg.toggle(false);
  }

  _syncComposerParamsFromDom() {
    if (!this.ref.composer) return false;
    let selects = this.ref.composer.getParamControls?.() || [];
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

  async _loadChat(chatId) {
    this._loadedChatId = chatId;
    // Clean up any active voice recording
    this._removeVoicePreview();
    this._audioRecorder.cancel();
    if (this._micBtn) {
      this._micBtn.classList.remove('recording', 'processing');
      let icon = this._micBtn.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = 'mic';
    }
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
      // Filter out stale transient status messages (process artifacts, not conversation content)
      let msgs = (chat.messages || []).filter(m => {
        if (m.role !== 'system') return true;
        let t = m.text || '';
        return !t.startsWith(ICONS.WAIT) && !t.startsWith(ICONS.OK) && !t.startsWith(ICONS.WARN) && t !== tPortal('text.processing');
      });
      this.$.messages = msgs;
      this._applyProjectTransactionEvent({
        projectId: chat.projectId || null,
        transactions: chat.projectTransactions || [],
      });
      this._sessionId = chat.sessionId || null;
      
      // Load saved params — collect all non-base keys that have values
      let params = {};
      let baseProps = ['id', 'projectId', 'parentChatId', 'name', 'adapter', 'origin', 'messages', 'projectTransactions', 'sessionId', 'pendingTaskId', 'createdAt', 'updatedAt'];
      for (let key in chat) {
        if (!baseProps.includes(key) && chat[key] != null) {
          params[key] = chat[key];
        }
      }
      this.$.chatParams = params;
      
      // Force update options once state is fully set
      this._updateComposerFooter();
      
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
    this.ref.chatTranscript?.renderLiveStatus(meta);
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

          this.ref.chatTranscript?.updateStatusCard?.(taskId, {
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
