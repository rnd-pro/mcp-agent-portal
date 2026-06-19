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
  extractChatTitleFromAgentText,
  getRoute,
  isTerminalWakeError,
  layoutOverlayStack,
  loadVoiceSettings,
  matchVoiceCommandAtEnd,
  matchVoiceCommandInText,
  mergeServerVoiceSettings,
  normalizeVoiceCommandSettings,
  normalizeVoiceLanguageMode,
  parseQuery,
  saveVoiceSettings,
  updateParams,
  VoiceController,
  VoiceRuntime,
  voiceStartErrorMessage,
  voiceWakeStartErrorMessage,
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
  formatChatGoalIntentPromptBlock,
  formatChatGoalPromptBlock,
  formatChatGoalQueuePromptBlock,
  toChatGoalContextItem,
} from '../../../src/iso/chat-goals.js';
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
} from './chat-title.js';
import {
  buildGoalWorkflowBoardHash,
  fetchGoalWorkflowSummary,
  formatGoalWorkflowSummary,
} from './workflow-summary.js';
import '../../components/ChatSidebar/ChatSidebar.js';

const DEFAULT_POOL_AGENT = 'orchestrator';
const CHAT_MESSAGE_PAGE_LIMIT = 100;

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
  _voiceController = new VoiceController({
    getLanguage: () => this._voiceRecognitionLanguage(),
    getWakeCandidates: () => this._getWakeCommandCandidates(),
    onWakeTriggered: () => this._triggerVoiceInputFromWake(),
    onSpeechStart: () => {
      this._speakingVoiceResponse = true;
      this._syncVoiceResponseButton();
    },
    onSpeechEnd: () => {
      this._speakingVoiceResponse = false;
      this._resumeWakeListeningAfterRecording();
      this._syncVoiceResponseButton();
    },
    onWakeError: (err) => {
      let error = err?.error || '';
      if (isTerminalWakeError(error)) {
        this._showVoiceError(voiceWakeStartErrorMessage(error));
        this._stopWakeListening({ disableMode: true });
        return;
      }
      if (this._wakeModeEnabled && !this._wakePausedForRecording) {
        this._syncWakeButton();
      }
    }
  });
  _voiceCommandMode = false;
  _voiceCommandTriggered = false;
  _voiceCommandHandling = false;
  _voiceCommandTextOverride = '';
  _voiceCommandPhrases = null;
  _voiceActionCommandPhrases = null;
  _wakeCommandPhrases = null;
  _wakeModeEnabled = false;
  _wakePausedForRecording = false;
  _wakeTriggering = false;
  _voiceResponseEnabled = false;
  _voiceResponseLastAgentKey = '';
  _speakingVoiceResponse = false;
  _voiceLanguageMode = 'auto';
  _overlayLayoutBound = false;
  _overlayLayoutFrame = 0;
  _overlayLayoutResizeObserver = null;
  _overlayLayoutSyncHandler = null;
  _workflowGoalSummaryKey = '';
  _workflowGoalSummaryText = '';
  init$ = {
    messages: [],
    messageItems: [],
    messageWindow: null,
    inputVal: '',
    chatName: tPortal('text.selectChat'),
    chatAdapter: '',
    adapterMeta: {},
    adapterOptionsHtml: '',
    composerFooterControls: [],
    chatParams: {},
    attachedContext: [],
    isComposerActionMenuOpen: false,
    planningModeActive: false,
    goalModeActive: false,
    actionMenuOpenTitle: tPortal('chat.actions.open'),
    actionMenuPlanningTitle: tPortal('chat.actions.planningMode'),
    actionMenuGoalTitle: tPortal('chat.actions.goalMode'),
    activeGoal: null,
    goalCancelTitle: tPortal('chat.goal.cancelIntent'),
    goalPauseTitle: tPortal('chat.goal.pause'),
    goalResumeTitle: tPortal('chat.goal.resume'),
    goalStopTitle: tPortal('chat.goal.stop'),
    goalDeleteTitle: tPortal('chat.goal.delete'),
    goalQueueModeTitle: tPortal('chat.goal.queueMode'),
    goalQueueNowTitle: tPortal('chat.goal.queueNow'),
    goalQueueAfterTitle: tPortal('chat.goal.queueAfter'),
    goalQueueClearTitle: tPortal('chat.goal.queueClear'),
    goalWorkflowTitle: tPortal('chat.goal.openWorkflowBoard'),
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
      pullMessages: (chatId, detail) => this._pullVisibleMessageWindow(chatId, detail),
      onPulledChat: (chat, detail) => this._handlePulledChat(chat, detail),
      onTaskStarted: (detail = {}) => {
        this._activeTaskId = detail.taskId || this._activeTaskId || '';
        this._setSending(true);
      },
      onDone: (detail = {}) => {
        if (this._isStaleTaskEvent(detail)) return;
        this._activeTaskId = '';
        this._pendingAgentTitleChatId = '';
        this._setSending(false);
        this._renderLiveStatus(null);
        this._updateEmptyState();
        this._dispatchNextQueuedGoalMessage();
      },
      onError: (_errText, detail = {}) => {
        if (this._isStaleTaskEvent(detail)) return;
        this._activeTaskId = '';
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
      if (this._suppressMessageRender) return;
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
      this._syncActionMenuFlags();
      this._updateInputState();
    });
    this.sub('isSubagentChat', () => this._updateInputState());
    this.sub('inputVal', () => this._syncComposerComponent());
    this.sub('attachedContext', () => this._syncComposerComponent());
    this.sub('activeGoal', () => {
      this._syncActiveGoalContext();
      this._syncActionMenuFlags();
      this._updateComposerFooter();
    });
    this.sub('goalModeActive', () => {
      this._syncActionMenuDom();
      this._syncGoalStatusDom();
    });
    this.sub('isComposerActionMenuOpen', () => {
      if (this.ref.composerActionMenu) {
        this.ref.composerActionMenu.hidden = !this.$.isComposerActionMenuOpen;
      }
      this._queueOverlayStackSync();
      this._syncComposerComponent();
    });
    this.sub('isInputDisabled', () => this._syncComposerComponent());
    this.sub('inputPlaceholder', () => this._syncComposerComponent());
    this.sub('composerFooterControls', () => this._syncComposerComponent());

    // Sync state from router after all listeners are attached (fixes cold load bug)
    this._syncChatFromRouter();
    this._syncActionMenuDom();
    this._syncGoalStatusDom();
  }

  disconnectedCallback() {
    this._disposeOverlayStackLayout();
    this._stopWakeListening({ disableMode: true });
    this._stopVoiceUiTimer();
    this._audioRecorder.cancel();
    this._voiceController.destroy();
    this._removeVoicePreview();
    super.disconnectedCallback?.();
  }

  suspendLayout() {
    this._resumeWakeAfterLayoutSuspend = this._wakeModeEnabled;
    this._wakeTriggering = false;
    this._wakePausedForRecording = false;
    this._stopVoiceUiTimer();
    this._audioRecorder.cancel();
    this._voiceController.stopWake();
    this._voiceController.cancelSpeech();
    this._speakingVoiceResponse = false;
    this._removeVoicePreview();
    this._syncVoiceControls();
  }

  resumeLayout() {
    this._syncVoiceControls();
    if (this._resumeWakeAfterLayoutSuspend && this._wakeModeEnabled) {
      this._startWakeListening();
    }
    this._resumeWakeAfterLayoutSuspend = false;
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
    workspace.addEventListener('chat-workspace-leading-intent', (event) => this._handleWorkspaceLeadingIntent(event.detail || {}));
    workspace.addEventListener('chat-workspace-footer-intent', (event) => this._handleWorkspaceFooterIntent(event.detail || {}));
    workspace.addEventListener('chat-workspace-context-intent', (event) => this._handleWorkspaceContextIntent(event.detail || {}));
    workspace.addEventListener('chat-workspace-load-older', () => this._loadOlderMessageWindow());

    this._syncComposerComponent();
    this._setupVoiceControls();
    this._bindOverlayStackLayout();
  }

  _bindOverlayStackLayout() {
    if (this._overlayLayoutBound) return;
    this._overlayLayoutBound = true;
    this._overlayLayoutSyncHandler = () => this._queueOverlayStackSync();
    globalThis.addEventListener?.('resize', this._overlayLayoutSyncHandler);
    globalThis.addEventListener?.('scroll', this._overlayLayoutSyncHandler, { capture: true });
    if (typeof ResizeObserver === 'function') {
      this._overlayLayoutResizeObserver = new ResizeObserver(this._overlayLayoutSyncHandler);
      for (let element of [
        this._getWorkspace(),
        this._getComposer(),
        this.ref.goalStatus,
        this.ref.composerActionMenu,
      ]) {
        if (element) this._overlayLayoutResizeObserver.observe(element);
      }
    }
    this._queueOverlayStackSync();
  }

  _disposeOverlayStackLayout() {
    if (this._overlayLayoutFrame) {
      cancelAnimationFrame(this._overlayLayoutFrame);
      this._overlayLayoutFrame = 0;
    }
    if (this._overlayLayoutSyncHandler) {
      globalThis.removeEventListener?.('resize', this._overlayLayoutSyncHandler);
      globalThis.removeEventListener?.('scroll', this._overlayLayoutSyncHandler, { capture: true });
      this._overlayLayoutSyncHandler = null;
    }
    this._overlayLayoutResizeObserver?.disconnect?.();
    this._overlayLayoutResizeObserver = null;
    this._overlayLayoutBound = false;
  }

  _queueOverlayStackSync() {
    if (this._overlayLayoutFrame) return;
    this._overlayLayoutFrame = requestAnimationFrame(() => {
      this._overlayLayoutFrame = 0;
      this._syncOverlayStackLayout();
    });
  }

  _syncOverlayStackLayout() {
    let workspace = this._getWorkspace();
    let composer = this._getComposer();
    let statusEl = this.ref.goalStatus;
    if (!workspace || !composer) return;
    let container = workspace.querySelector?.('.chat-workspace-main') || workspace;
    let menu = this.ref.composerActionMenu;
    let menuAnchor = composer.querySelector?.('.composer-leading-btn')
      || composer.shadowRoot?.querySelector?.('.composer-leading-btn')
      || composer;
    let overlays = [];
    if (menu) {
      overlays.push({
        element: menu,
        anchor: menuAnchor,
        align: 'start',
        inlineOffset: -4,
        caretTarget: menuAnchor,
        caretProperty: '--composer-action-menu-caret-left',
      });
    }
    if (statusEl) overlays.push(statusEl);
    let result = layoutOverlayStack({
      anchor: composer,
      overlays,
      container,
      placement: 'block-start',
      align: 'center',
      reserveTarget: workspace,
    });
    workspace.setOverlayStackReserve?.(result.reserveBlockSize || 0);
  }

  _syncComposerComponent() {
    this._getWorkspace()?.setComposerState?.({
      value: this.$.inputVal || '',
      attachedContext: this._composerAttachedContext(),
      disabled: this.$.isInputDisabled,
      placeholder: this.$.inputPlaceholder || '',
      leadingControls: this._buildComposerLeadingControls(),
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

  _handleWorkspaceLeadingIntent(detail = {}) {
    if (detail.id === 'actions') this._toggleComposerActionMenu(detail.anchorRect || null);
  }

  _handleWorkspaceContextIntent(detail = {}) {
    if (detail.sourceEvent === 'chat-composer-context-remove') {
      if (String(detail.key || '').startsWith('goal:')) {
        this._clearActiveGoal();
        return;
      }
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
      if (this.$.activeGoal?.id && String(this.$.inputVal || '').trim()) {
        this._handleInFlightGoalMessage();
        return;
      }
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
      // Auto-select resource group from agent binding
      let agentGroup = this._getAgentResourceGroup(val);
      if (agentGroup) {
        updatedParams.resource_group = agentGroup;
      }
      updatedParams.approval_mode = this._getResourceGroupDefaultApprovalMode(updatedParams.resource_group)
        || this._getAgentDefaultApprovalMode(val);
    }
    if (id === 'resource_group') {
      // When switching groups, clear manual provider/model overrides
      if (val !== 'none') {
        delete updatedParams.provider;
        delete updatedParams.model;
      }
      updatedParams.approval_mode = this._getResourceGroupDefaultApprovalMode(val) || updatedParams.approval_mode;
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

  _composerAttachedContext() {
    let attachedContext = this.$.attachedContext || [];
    let goal = this.$.activeGoal || null;
    let goalItem = toChatGoalContextItem(goal);
    return goalItem ? mergeAttachedContext(attachedContext, goalItem) : attachedContext;
  }

  _isGoalIntentActive() {
    return this.$.chatParams?.goalIntentActive === true || this.$.chatParams?.goalIntentActive === 'true';
  }

  _goalQueueMode() {
    return this.$.chatParams?.goalQueueMode === 'goal' ? 'goal' : 'after';
  }

  _setGoalQueueMode(mode, { persist = true } = {}) {
    let goalQueueMode = mode === 'goal' ? 'goal' : 'after';
    let currentParams = this.$.chatParams || {};
    this.$.chatParams = { ...currentParams, goalQueueMode };
    this._syncGoalStatusDom();
    if (!persist) return;
    let chatId = this._loadedChatId || dashState.activeChatId;
    if (!chatId || this._loadingChatState) return;
    fetch('/api/chats/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: chatId, goalQueueMode }),
    }).catch((err) => {
      console.warn('[AgentChat] goal queue mode update failed:', err.message);
    });
  }

  _setGoalIntentActive(active, { persist = true } = {}) {
    let goalIntentActive = Boolean(active);
    let currentParams = this.$.chatParams || {};
    this.$.chatParams = { ...currentParams, goalIntentActive };
    this.$.goalModeActive = goalIntentActive;
    this._syncGoalStatusDom();
    if (!persist) return;
    let chatId = this._loadedChatId || dashState.activeChatId;
    if (!chatId || this._loadingChatState) return;
    fetch('/api/chats/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: chatId, goalIntentActive }),
    }).catch((err) => {
      console.warn('[AgentChat] goal intent update failed:', err.message);
    });
  }

  _handleGoalControl() {
    this.closeComposerActionMenu();
    this._setGoalIntentActive(!this._isGoalIntentActive());
  }

  _toggleComposerActionMenu(anchorRect = null) {
    if (this.$.isComposerActionMenuOpen) {
      this.closeComposerActionMenu();
      return;
    }
    this.openComposerActionMenu(anchorRect);
  }

  openComposerActionMenu(anchorRect = null) {
    this.$.isComposerActionMenuOpen = true;
    if (this.ref.composerActionMenu) {
      this.ref.composerActionMenu.hidden = false;
    }
    this._positionComposerActionMenu(anchorRect);
    requestAnimationFrame(() => this._positionComposerActionMenu(anchorRect));
    this._queueOverlayStackSync();
    this._syncActionMenuFlags();
  }

  closeComposerActionMenu() {
    this.$.isComposerActionMenuOpen = false;
    if (this.ref.composerActionMenu) {
      this.ref.composerActionMenu.hidden = true;
    }
    this._syncOverlayStackLayout();
    this._queueOverlayStackSync();
  }

  onComposerActionClick(event) {
    let action = event.currentTarget?.dataset?.action || '';
    if (action === 'planning') {
      this._togglePlanningMode();
      this.closeComposerActionMenu();
      return;
    }
    if (action === 'goal') {
      this._handleGoalControl();
    }
  }

  _togglePlanningMode() {
    let currentParams = this.$.chatParams || {};
    let currentIsPlan = currentParams.approval_mode === 'plan';
    let fallback = this._getAgentDefaultApprovalMode(currentParams.agent);
    let nextMode = currentIsPlan ? (fallback === 'plan' ? 'yolo' : fallback) : 'plan';
    this._handleComposerParamChange({ id: 'approval_mode', value: nextMode });
    this._syncActionMenuFlags();
  }

  _syncActionMenuFlags() {
    this.$.planningModeActive = this.$.chatParams?.approval_mode === 'plan';
    this.$.goalModeActive = this._isGoalIntentActive();
    this._syncActionMenuDom();
    this._syncGoalStatusDom();
  }

  _syncActionMenuDom() {
    let menu = this.ref.composerActionMenu;
    if (!menu) return;
    let states = {
      planning: Boolean(this.$.planningModeActive),
      goal: Boolean(this.$.goalModeActive),
    };
    for (let [action, active] of Object.entries(states)) {
      let item = menu.querySelector(`.composer-action-item[data-action="${action}"]`);
      if (!item) continue;
      item.setAttribute('aria-pressed', active ? 'true' : 'false');
      let switchEl = item.querySelector('.composer-action-switch');
      if (switchEl) switchEl.dataset.active = active ? 'true' : 'false';
    }
  }

  _positionComposerActionMenu(anchorRect = null) {
    let menu = this.ref.composerActionMenu;
    if (!menu) return;
    menu.dataset.placement = 'above';
    this._syncOverlayStackLayout();
    this._queueOverlayStackSync();
  }

  _goalStatusLabel(status = '') {
    let key = `chat.goal.status.${status || 'active'}`;
    let label = tPortal(key);
    return label === `portal.${key}` ? (status || 'active') : label;
  }

  _syncGoalStatusDom() {
    let statusEl = this.ref.goalStatus;
    if (!statusEl) return;
    let goal = this.$.activeGoal || null;
    let intentActive = this._isGoalIntentActive();
    let shouldShow = Boolean(goal?.id) || intentActive;
    statusEl.hidden = !shouldShow;
    if (!shouldShow) return;

    let status = goal?.status || 'intent';
    statusEl.dataset.status = status;
    if (this.ref.goalStatusIcon) {
      this.ref.goalStatusIcon.textContent = goal?.id ? 'flag' : 'track_changes';
    }
    if (this.ref.goalStatusTitle) {
      this.ref.goalStatusTitle.textContent = goal?.title || tPortal('chat.goal.awaitingTitle');
    }
    if (this.ref.goalStatusMeta) {
      this.ref.goalStatusMeta.textContent = goal?.id
        ? this._goalStatusLabel(status)
        : tPortal('chat.goal.awaitingMeta');
    }

    let isActive = status === 'active';
    let isPaused = status === 'paused';
    let queue = Array.isArray(goal?.queue) ? goal.queue.filter(item => item?.status === 'queued') : [];
    let queueMode = this._goalQueueMode();
    if (this.ref.goalCancelButton) this.ref.goalCancelButton.hidden = Boolean(goal?.id);
    if (this.ref.goalPauseButton) this.ref.goalPauseButton.hidden = !goal?.id || !isActive;
    if (this.ref.goalResumeButton) this.ref.goalResumeButton.hidden = !goal?.id || !isPaused;
    if (this.ref.goalStopButton) this.ref.goalStopButton.hidden = !goal?.id;
    if (this.ref.goalDeleteButton) this.ref.goalDeleteButton.hidden = !goal?.id;
    if (this.ref.goalQueuePanel) this.ref.goalQueuePanel.hidden = !goal?.id;
    if (this.ref.goalQueueLabel) {
      this.ref.goalQueueLabel.textContent = tPortal('chat.goal.queueCount', { count: queue.length });
    }
    if (this.ref.goalQueueNowButton) {
      this.ref.goalQueueNowButton.dataset.active = queueMode === 'goal' ? 'true' : 'false';
      this.ref.goalQueueNowButton.setAttribute('aria-pressed', queueMode === 'goal' ? 'true' : 'false');
    }
    if (this.ref.goalQueueAfterButton) {
      this.ref.goalQueueAfterButton.dataset.active = queueMode === 'after' ? 'true' : 'false';
      this.ref.goalQueueAfterButton.setAttribute('aria-pressed', queueMode === 'after' ? 'true' : 'false');
    }
    if (this.ref.goalQueueClearButton) this.ref.goalQueueClearButton.hidden = queue.length === 0;
    this._syncGoalWorkflowDom(goal);
    this._queueOverlayStackSync();
  }

  _syncGoalWorkflowDom(goal = null) {
    let meta = this.ref.goalWorkflowMeta;
    let button = this.ref.goalWorkflowButton;
    let hasGoal = Boolean(goal?.id);
    if (button) button.hidden = !hasGoal;
    if (!meta) return;
    if (!hasGoal) {
      meta.hidden = true;
      meta.textContent = '';
      this._workflowGoalSummaryKey = '';
      this._workflowGoalSummaryText = '';
      return;
    }
    let filters = this._goalWorkflowFilters(goal);
    let summaryKey = JSON.stringify(filters);
    if (this._workflowGoalSummaryKey === summaryKey && this._workflowGoalSummaryText) {
      meta.hidden = false;
      meta.textContent = tPortal('chat.goal.workflowSummary', {
        summary: this._workflowGoalSummaryText,
      });
      return;
    }
    meta.hidden = true;
    this._loadGoalWorkflowSummary(goal);
  }

  _goalWorkflowFilters(goal = null) {
    return {
      projectId: goal?.projectId || this.$.chatParams?.projectId || dashState.activeProjectId || '',
      goalId: goal?.id || '',
      chatId: this._loadedChatId || dashState.activeChatId || '',
    };
  }

  _goalWorkflowSummaryLabels() {
    return {
      cardSingular: tPortal('chat.goal.workflowCard'),
      cardPlural: tPortal('chat.goal.workflowCards'),
      active: tPortal('chat.goal.workflowActive'),
      blocked: tPortal('chat.goal.workflowBlocked'),
      recovery: tPortal('chat.goal.workflowRecovery'),
      done: tPortal('chat.goal.workflowDone'),
    };
  }

  async _loadGoalWorkflowSummary(goal = null) {
    let filters = this._goalWorkflowFilters(goal);
    let summaryKey = JSON.stringify(filters);
    if (!filters.goalId || (this._workflowGoalSummaryKey === summaryKey && this._workflowGoalSummaryText)) {
      return;
    }
    this._workflowGoalSummaryKey = summaryKey;
    this._workflowGoalSummaryText = '';
    try {
      let summary = await fetchGoalWorkflowSummary(filters);
      this._workflowGoalSummaryText = formatGoalWorkflowSummary(
        summary,
        this._goalWorkflowSummaryLabels(),
      );
      if (this.$.activeGoal?.id === filters.goalId) this._syncGoalWorkflowDom(this.$.activeGoal);
    } catch (err) {
      console.warn('[AgentChat] workflow summary lookup failed:', err.message);
    }
  }

  async onGoalLifecycleClick(event) {
    let action = event.currentTarget?.dataset?.goalAction || '';
    if (action === 'cancel-intent') {
      this._setGoalIntentActive(false);
      return;
    }
    if (action === 'queue-goal') {
      this._setGoalQueueMode('goal');
      return;
    }
    if (action === 'queue-after') {
      this._setGoalQueueMode('after');
      return;
    }
    if (action === 'clear-queue') {
      await this._clearGoalQueue();
      return;
    }
    if (action === 'open-workflow-board') {
      this._openWorkflowBoard();
      return;
    }
    await this._updateGoalLifecycle(action);
  }

  _openWorkflowBoard() {
    window.location.hash = buildGoalWorkflowBoardHash(
      this._goalWorkflowFilters(this.$.activeGoal || {}),
    );
  }

  async _recordGoalQueueMessage({ text, delivery = 'after', status = 'queued' } = {}) {
    let goalId = this.$.activeGoal?.id || '';
    if (!goalId || !String(text || '').trim()) return null;
    try {
      let res = await fetch('/api/goals/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId, text, delivery, status }),
      });
      let data = await res.json();
      if (!res.ok) return null;
      this.$.activeGoal = data.goal || this.$.activeGoal;
      return data.message || null;
    } catch (err) {
      console.warn('[AgentChat] goal queue update failed:', err.message);
      return null;
    }
  }

  async _clearGoalQueue() {
    let goalId = this.$.activeGoal?.id || '';
    if (!goalId) return;
    try {
      let res = await fetch('/api/goals/queue/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId }),
      });
      let data = await res.json();
      if (res.ok) this.$.activeGoal = data.goal || this.$.activeGoal;
    } catch (err) {
      console.warn('[AgentChat] goal queue clear failed:', err.message);
    }
  }

  async _handleInFlightGoalMessage({ voiceTranscribed = false } = {}) {
    if (!this.$.activeGoal?.id) return;
    if (this._goalQueueMode() === 'goal') {
      let taskId = this._activeTaskId || this.$.chatParams?.pendingTaskId || '';
      if (!taskId) {
        await this._queueComposerInputAfterGoal();
        return;
      }
      let queuedMessage = await this._recordGoalQueueMessage({
        text: this.$.inputVal,
        delivery: 'goal',
        status: 'applied',
      });
      await this._sendMessage({ voiceTranscribed, restartTaskId: taskId, queuedGoalMessages: queuedMessage ? [queuedMessage] : [] });
      return;
    }
    await this._queueComposerInputAfterGoal();
  }

  async _queueComposerInputAfterGoal() {
    let prompt = String(this.$.inputVal || '').trim();
    if (!prompt) return;
    let contextText = formatAttachedContextBlock(this.$.attachedContext || []);
    let text = contextText ? contextText + prompt : prompt;
    let message = await this._recordGoalQueueMessage({ text, delivery: 'after', status: 'queued' });
    if (!message) return;
    this.$.inputVal = '';
    this.$.attachedContext = [];
    this._getComposer()?.setValue?.('');
    this._getComposer()?.resetInputHeight?.();
  }

  async _dispatchNextQueuedGoalMessage() {
    if (this._dispatchingQueuedGoalMessage || !this.$.activeGoal?.id || !this._isGoalIntentActive()) return;
    let queue = Array.isArray(this.$.activeGoal.queue) ? this.$.activeGoal.queue : [];
    let item = queue.find(message => message?.status === 'queued' && message?.delivery === 'after' && message?.text);
    if (!item) return;
    this._dispatchingQueuedGoalMessage = true;
    try {
      let res = await fetch('/api/goals/queue/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId: this.$.activeGoal.id, messageId: item.id }),
      });
      let data = await res.json();
      if (!res.ok) return;
      this.$.activeGoal = data.goal || this.$.activeGoal;
      await this._sendMessage({
        promptOverride: item.text,
        queuedGoalMessages: [data.message || item],
      });
    } catch (err) {
      console.warn('[AgentChat] queued goal dispatch failed:', err.message);
    } finally {
      this._dispatchingQueuedGoalMessage = false;
    }
  }

  async _updateGoalLifecycle(action) {
    let goalId = this.$.activeGoal?.id || '';
    if (!goalId) return;
    let endpoints = {
      pause: '/api/goals/pause',
      resume: '/api/goals/resume',
      stop: '/api/goals/stop',
      delete: '/api/goals/delete',
    };
    let endpoint = endpoints[action];
    if (!endpoint) return;
    try {
      let res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId }),
      });
      let data = await res.json();
      if (!res.ok) return;
      if (action === 'pause') {
        this.$.activeGoal = data.goal || this.$.activeGoal;
        this._setGoalIntentActive(false);
        return;
      }
      if (action === 'resume') {
        this.$.activeGoal = data.goal || this.$.activeGoal;
        this._setGoalIntentActive(true);
        return;
      }
      this.$.activeGoal = null;
      this._setGoalIntentActive(false);
    } catch (err) {
      console.warn('[AgentChat] goal lifecycle update failed:', err.message);
    }
  }

  _clearActiveGoal() {
    let chatId = this._loadedChatId || dashState.activeChatId || null;
    this.$.activeGoal = null;
    this._setGoalIntentActive(false, { persist: false });
    if (!chatId) return;
    fetch('/api/chats/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: chatId, activeGoalId: null, goalIntentActive: false }),
    }).catch((err) => {
      console.warn('[AgentChat] goal clear failed:', err.message);
    });
  }

  _syncActiveGoalContext() {
    this._syncComposerComponent();
    this._syncGoalStatusDom();
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
      saveVoiceSettings({
        commandMode: this._voiceCommandMode,
        responseEnabled: this._voiceResponseEnabled,
        languageMode: this._voiceLanguageMode,
      });
    } catch (_) {}
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
    let fallbackLocale = this._autoVoiceLocale();
    this._voiceCommandPhrases = this._defaultVoiceCommandPhrases();
    this._voiceActionCommandPhrases = this._defaultVoiceActionPhrases();
    this._wakeCommandPhrases = this._defaultWakeCommandPhrases();

    let localSettings = loadVoiceSettings(undefined, fallbackLocale);
    this._voiceCommandMode = localSettings.commandMode;
    this._voiceResponseEnabled = localSettings.responseEnabled;
    this._voiceLanguageMode = localSettings.languageMode;

    try {
      let settings = await fetch('/api/settings').then((res) => res.json());

      let merged = mergeServerVoiceSettings(
        {
          commandMode: this._voiceCommandMode,
          responseEnabled: this._voiceResponseEnabled,
          languageMode: this._voiceLanguageMode,
        },
        settings?.voiceInput,
        fallbackLocale
      );
      this._voiceCommandMode = merged.commandMode;
      this._voiceResponseEnabled = merged.responseEnabled;
      this._voiceLanguageMode = merged.languageMode;

      let commandSettings = normalizeVoiceCommandSettings(settings?.voiceInput);
      this._voiceCommandPhrases = commandSettings.sendCommands;
      this._wakeCommandPhrases = commandSettings.wakeCommands;
      this._voiceActionCommandPhrases = commandSettings.actionCommands;
    } catch {
      // Network fetch error - keep what we have (either localStorage values or local defaults)
    } finally {
      this._syncVoiceCommandButton();
      this._syncVoiceLanguageButton();
    }
  }

  _normalizeVoiceLanguageMode(mode = 'auto') {
    return normalizeVoiceLanguageMode(mode, this._autoVoiceLocale());
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
    let speechAvailable = VoiceController.hasSpeechSynthesis;
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
    if (!this._wakeModeEnabled || !VoiceController.hasSpeechSynthesis) return;
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
    this._voiceController.cancelSpeech();
    this._speakingVoiceResponse = false;
    this._resumeWakeListeningAfterRecording();
  }

  _speakAgentResponseText(text) {
    if (!text || !VoiceController.hasSpeechSynthesis) return;
    this._pauseWakeListeningForRecording();
    this._voiceController.speak(text);
  }

  _startWakeListening() {
    if (!this._wakeModeEnabled || this._audioRecorder.state !== 'idle') return;
    this._voiceController.startWake();
  }

  _stopWakeListening({ disableMode = false } = {}) {
    if (disableMode) {
      this._wakeModeEnabled = false;
      this._voiceResponseLastAgentKey = '';
    }
    this._wakePausedForRecording = false;
    this._voiceController.stopWake({ disableMode });
    this._syncWakeButton();
  }

  _restartWakeListening() {
    this._voiceController.stopWake();
    this._startWakeListening();
  }

  _pauseWakeListeningForRecording() {
    if (!this._wakeModeEnabled) return;
    this._wakePausedForRecording = true;
    this._voiceController.pauseWake();
    this._syncWakeButton();
  }

  _resumeWakeListeningAfterRecording() {
    if (!this._wakeModeEnabled) return;
    this._wakePausedForRecording = false;
    this._syncWakeButton();
    this._voiceController.resumeWake();
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
    this._queueOverlayStackSync();
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
    this._queueOverlayStackSync();
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
    this._queueOverlayStackSync();
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
            let message = voiceStartErrorMessage({
              wasMicrophonePrompt,
              permissionRefreshMessage: this._voicePermissionRefreshMessage(),
            });
            this._showVoiceError(message);
            this._resumeWakeListeningAfterRecording();
          }
        } else {
          let message = voiceStartErrorMessage({
            wasMicrophonePrompt,
            permissionRefreshMessage: this._voicePermissionRefreshMessage(),
          });
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
      for (let p of paramsToMap) {
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
              paramValue = this._getResourceGroupDefaultApprovalMode(currentParams.resource_group)
                || this._getAgentDefaultApprovalMode(currentParams.agent);
            } else if (p.id === 'model') {
              // Use preferred models from resource groups instead of hardcoded defaults
              let currentCtx = adapter === 'pool' ? currentParams.provider : adapter;
              let rgDefaults = meta._resourceGroupDefaults || {};
              let preferred = (rgDefaults.byProvider?.[currentCtx] || p.preferred || []);

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
        } else if (p.type === 'boolean') {
          let paramValue = currentParams[p.id];
          if (paramValue === undefined) {
            paramValue = true; // Default to true as requested
            currentParams[p.id] = paramValue;
            paramsChanged = true;
          }
        }
      }
      // Adapter/resource defaults belong to the chat payload; the composer only keeps compact entry points.
      this.$.composerFooterControls = this._buildComposerFooterControls({ settings: true });
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
      this.$.composerFooterControls = this._buildComposerFooterControls({ settings: false });
    }
    this._updatingOptions = false;
  }

  _buildComposerFooterControls({ settings = true } = {}) {
    let controls = [];
    if (settings) {
      controls.push({
        id: 'settings',
        kind: 'button',
        icon: 'settings',
        label: ' ',
        title: tPortal('chat.configureResourceGroups'),
        priority: 1,
        compact: true,
        className: 'composer-settings-btn',
      });
    }
    return controls;
  }

  _buildComposerLeadingControls() {
    return [{
      id: 'actions',
      kind: 'button',
      icon: 'add',
      label: ' ',
      title: this.$.actionMenuOpenTitle,
      priority: 0,
      compact: true,
      active: Boolean(this.$.isComposerActionMenuOpen),
      className: 'composer-action-menu-btn',
    }];
  }

  _getAgentDefaultApprovalMode(agentSlug) {
    return this._getResourceGroupDefaultApprovalMode(this._getAgentResourceGroup(agentSlug)) || 'yolo';
  }

  _getResourceGroupDefaultApprovalMode(groupName) {
    if (!groupName || groupName === 'none') return null;
    let groups = this.$.adapterMeta?._resourceGroupDefaults?.groups || [];
    let group = groups.find(item => item?.name === groupName);
    return group?.approval_mode || group?.approvalMode || null;
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
    if (!this.$.isSubagentChat) {
      next.agent = DEFAULT_POOL_AGENT;
    } else if (!next.agent || next.agent === 'none') {
      next.agent = this._getDefaultPoolAgentSlug();
    }
    if (next.agent && next.agent !== 'none') {
      let agentGroup = this._getAgentResourceGroup(next.agent);
      if (agentGroup && (!next.resource_group || next.resource_group === 'none')) {
        next.resource_group = agentGroup;
      }
      if (!next.approval_mode) {
        next.approval_mode = this._getResourceGroupDefaultApprovalMode(next.resource_group)
          || this._getAgentDefaultApprovalMode(next.agent);
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

    let { items, streamingBoards } = this._buildTranscriptItems(this.$.messages || []);

    this.$.messageItems = items;
    let workspace = this._getWorkspace();
    let messageWindow = this.$.messageWindow || null;
    if (messageWindow && workspace?.replaceMessageWindow) {
      workspace.replaceMessageWindow(items, messageWindow);
    } else if (messageWindow && transcript.replaceMessageWindow) {
      transcript.replaceMessageWindow(items, messageWindow);
    } else {
      transcript.setMessageItems?.(items);
    }

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

  _buildTranscriptItems(messages = []) {
    let transcriptMessages = this._toTranscriptMessages(messages);
    let hasActiveStream = this._hasActiveChatTask();
    return buildChatMessageItems(transcriptMessages, { hasActiveStream });
  }

  _setMessagesWithoutRender(messages = []) {
    this._suppressMessageRender = true;
    try {
      this.$.messages = messages;
    } finally {
      this._suppressMessageRender = false;
    }
  }

  _extendMessageWindow(count = 0) {
    let windowState = this.$.messageWindow || null;
    if (!windowState || count <= 0) return;
    let end = Number.isFinite(windowState.end)
      ? windowState.end
      : (windowState.startIndex || 0) + (windowState.count || 0);
    let total = Number.isFinite(windowState.totalItems) ? windowState.totalItems : end;
    this.$.messageWindow = {
      ...windowState,
      count: (windowState.count || 0) + count,
      totalItems: total + count,
      end: end + count,
      hasNewer: false,
    };
  }

  _appendVisibleMessages(messages = [], { persisted = false } = {}) {
    let nextMessages = Array.isArray(messages) ? messages.filter(Boolean) : [];
    if (!nextMessages.length) return;
    if (persisted) this._extendMessageWindow(nextMessages.length);
    this.$.messages = [...(this.$.messages || []), ...nextMessages];
  }

  _messageWindowFromPage(page = {}) {
    let start = Number.isFinite(page.start) ? page.start : 0;
    let end = Number.isFinite(page.end) ? page.end : start + (Array.isArray(page.messages) ? page.messages.length : 0);
    let total = Number.isFinite(page.total) ? page.total : end;
    return {
      startIndex: start,
      count: Math.max(0, end - start),
      totalItems: total,
      hasOlder: Boolean(page.hasBefore),
      hasNewer: Boolean(page.hasAfter),
      start,
      end,
    };
  }

  async _fetchMessagePage(chatId, opts = {}) {
    let res = await fetch('/api/chats/messages/page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, limit: CHAT_MESSAGE_PAGE_LIMIT, ...opts }),
    });
    if (!res.ok) throw new Error(`Message page error: ${res.status}`);
    let page = await res.json();
    if (page.error) throw new Error(page.error);
    return page;
  }

  async _fetchChatMeta(chatId) {
    let res = await fetch('/api/chats/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: chatId, includeMessages: false }),
    });
    if (!res.ok) throw new Error(`Chat metadata error: ${res.status}`);
    let chat = await res.json();
    if (chat.error) throw new Error(chat.error);
    return chat;
  }

  async _fetchFullChat(chatId) {
    let res = await fetch('/api/chats/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: chatId }),
    });
    if (!res.ok) throw new Error(`Chat load error: ${res.status}`);
    let chat = await res.json();
    if (chat.error) throw new Error(chat.error);
    return chat;
  }

  _applyLoadedChatMeta(chat = {}) {
    this.$.chatName = chat.name || this.$.chatName || 'Chat';
    this.$.chatAdapter = chat.adapter || this.$.chatAdapter || 'pool';
    this.$.isSubagentChat = Boolean(chat.parentChatId);
    this.$.activeGoal = chat.activeGoal || null;
    this._applyProjectTransactionEvent({
      projectId: chat.projectId || null,
      transactions: chat.projectTransactions || [],
    });
    this._sessionId = chat.sessionId || null;
    this._activeTaskId = chat.pendingTaskId || '';
    this._setLoadedChatParams(chat);
  }

  _replaceVisibleMessageWindow(page = {}) {
    let messages = this._cleanLoadedMessages(page.messages || []);
    this.$.messageWindow = this._messageWindowFromPage({ ...page, messages });
    this.$.messages = messages;
  }

  _prependVisibleMessageWindow(page = {}) {
    let messages = this._cleanLoadedMessages(page.messages || []);
    if (!messages.length) return;
    let nextWindow = this._messageWindowFromPage({ ...page, messages });
    let nextMessages = [...messages, ...(this.$.messages || [])];
    this.$.messageWindow = nextWindow;
    this._setMessagesWithoutRender(nextMessages);
    this._applyProjectTransactions(messages);
    this._updateEmptyState();

    let { items, streamingBoards } = this._buildTranscriptItems(messages);
    this.$.messageItems = [...items, ...(this.$.messageItems || [])];
    let workspace = this._getWorkspace();
    if (workspace?.prependMessages) {
      workspace.prependMessages(items, nextWindow);
    } else {
      this._renderMessages();
    }

    requestAnimationFrame(() => {
      let transcript = this._getTranscript();
      if (!transcript) return;
      for (let taskIds of streamingBoards) {
        let board = transcript.findStatusBoard?.(taskIds);
        if (board) this._startDelegationPolling(taskIds, board);
      }
      transcript.updateScrollBottomButton?.();
    });
  }

  async _pullVisibleMessageWindow(chatId, detail = {}) {
    if (!chatId || chatId !== (this._loadedChatId || dashState.activeChatId)) return;
    let chat = await this._fetchChatMeta(chatId);
    if (chat.id && chat.id !== (this._loadedChatId || dashState.activeChatId)) return;
    this._applyLoadedChatMeta(chat);
    let page = await this._fetchMessagePage(chatId);
    if (detail.final) {
      page.messages = this._applyAgentGeneratedChatTitle(chatId, page.messages || []);
    }
    this._replaceVisibleMessageWindow(page);
  }

  async _loadOlderMessageWindow() {
    let chatId = this._loadedChatId || dashState.activeChatId;
    let windowState = this.$.messageWindow || null;
    if (!chatId || !windowState?.hasOlder || this._loadingOlderMessages) return;
    this._loadingOlderMessages = true;
    try {
      let before = Number.isFinite(windowState.startIndex) ? windowState.startIndex : windowState.start;
      let page = await this._fetchMessagePage(chatId, { before });
      this._prependVisibleMessageWindow(page);
    } catch (err) {
      console.warn('[AgentChat] older message load failed:', err.message);
    } finally {
      this._loadingOlderMessages = false;
    }
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

  _buildAgentPrompt(prompt, { voiceTranscribed = false, requestChatTitle = false, queuedGoalMessages = [] } = {}) {
    let parts = [];
    if (voiceTranscribed) parts.push(this._voiceTranscriptionPromptNote());
    let body = String(prompt || '');
    if (this._isGoalIntentActive()) {
      let goalBlock = formatChatGoalPromptBlock(this.$.activeGoal);
      if (goalBlock && !body.includes('[Active Goal]')) {
        parts.push(goalBlock);
        let queueBlock = formatChatGoalQueuePromptBlock(this.$.activeGoal, queuedGoalMessages);
        if (queueBlock && !body.includes('[Goal Queue]')) parts.push(queueBlock);
      } else if (!goalBlock && !body.includes('[Goal Intent]')) {
        let routeParams = parseQuery(getRoute().query || '');
        parts.push(formatChatGoalIntentPromptBlock({
          chatId: this._loadedChatId || dashState.activeChatId || '',
          projectId: dashState.activeProjectId || routeParams.project || '',
        }));
      }
    }
    parts.push(prompt);
    if (requestChatTitle) {
      parts.push(buildChatTitleRequestNote(getLocalization().locale));
    }
    return parts.join('\n\n');
  }

  async _sendMessage({ voiceTranscribed = false, restartTaskId = '', queuedGoalMessages = [], promptOverride = '' } = {}) {
    this._syncComposerParamsFromDom();
    if (this.$.isInputDisabled) return;
    if (this._isSending && !restartTaskId) {
      if (this.$.activeGoal?.id && String(this.$.inputVal || '').trim()) {
        await this._handleInFlightGoalMessage({ voiceTranscribed });
      }
      return;
    }
    let chatId = this._loadedChatId || dashState.activeChatId;
    let overridePrompt = String(promptOverride || '').trim();
    let prompt = overridePrompt || this.$.inputVal.trim();
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

    let attachedContext = overridePrompt ? [] : (this.$.attachedContext || []);
    let attachedFiles = extractAttachedFilePaths(attachedContext);
    if (attachedFiles.length) {
      let existingFiles = Array.isArray(sendParams.files) ? sendParams.files : [];
      sendParams = { ...sendParams, files: [...new Set([...existingFiles, ...attachedFiles])] };
    }

    let contextText = formatAttachedContextBlock(attachedContext);
    if (contextText) {
      prompt = contextText + prompt;
    }
    let agentPrompt = this._buildAgentPrompt(prompt, { voiceTranscribed, requestChatTitle, queuedGoalMessages });
    let sendRunId = (this._sendRunId || 0) + 1;
    this._sendRunId = sendRunId;

    this._snapshotVoiceResponseBaseline();
    this._appendVisibleMessages([{ role: 'user', text: prompt }], { persisted: true });
    if (!overridePrompt) {
      this.$.inputVal = '';
      this.$.attachedContext = []; // Clear context after send
      this._getComposer()?.setValue?.('');
      this._getComposer()?.resetInputHeight?.();
    }
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

        reply = restartTaskId
          ? await this._wsClient.restart(chatId, agentPrompt, sendParams, this._sessionId, restartTaskId)
          : await this._wsClient.send(chatId, agentPrompt, sendParams, this._sessionId);

        // _sendViaWs handles thinking block, final messages, and persistence
      } else {
        this._appendVisibleMessages([{ role: 'system', text: tPortal('text.processing') }]);
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
      let messagesToPersist = this.$.messages;
      if (adapter !== 'pool') {
        let generatedMessages = [];
        if (structuredEvents?.length) {
          for (let block of structuredEvents) {
            if (block.type === 'tool_use') {
              generatedMessages.push({ role: 'tool', name: block.name, input: block.input, result: block.result });
            }
          }
          let textBlocks = structuredEvents.filter(b => b.type === 'text').map(b => b.text).join('\n');
          let finalText = textBlocks || reply;
          if (finalText) {
            generatedMessages.push({ role: 'agent', text: finalText });
          }
        } else {
          generatedMessages.push({ role: 'agent', text: reply });
        }
        this._appendVisibleMessages(generatedMessages, { persisted: true });
        if (this.$.messageWindow?.hasOlder) {
          let fullChat = await this._fetchFullChat(chatId);
          let fullMessages = this._cleanLoadedMessages(fullChat.messages || []);
          messagesToPersist = this._applyAgentGeneratedChatTitle(chatId, [...fullMessages, ...generatedMessages]);
        } else {
          messagesToPersist = this._applyAgentGeneratedChatTitle(chatId, this.$.messages);
          this.$.messages = messagesToPersist;
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
          body: JSON.stringify({ chatId, messages: messagesToPersist }),
        });
        dashEmit('chats-updated');
      }
    } catch (err) {
      this._appendVisibleMessages([{ role: 'system', text: tPortal('text.errorWithMessage', { message: err.message }) }]);
    }
    if (this._sendRunId === sendRunId) {
      this._setSending(false);
      this._setBackgroundActive(false);
    }
  }

  _handlePulledChat(chat, detail = {}) {
    let messages = Array.isArray(chat?.messages) ? chat.messages : [];
    if ('activeGoal' in (chat || {}) || 'activeGoalId' in (chat || {})) {
      this.$.activeGoal = chat.activeGoal || null;
    }
    if (detail.final) this._setLoadedChatParams(chat || {});
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
    delete params.activeGoal;
    delete params.activeGoalId;
    delete params.goalIntentActive;
    delete params.goalQueueMode;
    delete params.prompt;
    delete params.type;
    if (params.resource_group && params.resource_group !== 'none') {
      delete params.provider;
      delete params.model;
    }
    return params;
  }

  _getPersistedChatParams(params = this.$.chatParams || {}) {
    let allowed = ['agent', 'provider', 'model', 'approval_mode', 'resource_group', 'chatType', 'goalIntentActive', 'goalQueueMode'];
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
      let chat = await this._fetchChatMeta(chatId);
      if (!chat || chat.error || chat.id !== (this._loadedChatId || dashState.activeChatId)) return;

      this._applyLoadedChatMeta(chat);
      let page = await this._fetchMessagePage(chatId);
      let msgs = this._cleanLoadedMessages(page.messages || []);
      if (!sameChatMessages(msgs, this.$.messages)) {
        this._replaceVisibleMessageWindow({ ...page, messages: msgs });
      }
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
      'messageCount',
      'projectTransactions',
      'sessionId',
      'pendingTaskId',
      'activeGoal',
      'activeGoalId',
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
      this.$.messageWindow = null;
      this.$.messages = [];
      this.$.chatName = tPortal('text.newChat');
      this.$.chatAdapter = 'pool';
      this.$.chatParams = {};
      this.$.activeGoal = null;
      this._activeTaskId = '';
      this.$.isSubagentChat = false;
      this._sessionId = null;
      this.$.sessionMetaHtml = '';
      this._updateComposerFooter();
      this._focusInput();
      return;
    }

    try {
      let chat = await this._fetchChatMeta(chatId);
      this._applyLoadedChatMeta(chat);
      let page = await this._fetchMessagePage(chatId);
      this._replaceVisibleMessageWindow(page);
      
      // Resume pending task if exists (e.g. browser was reloaded mid-chat)
      if (chat.pendingTaskId) {
        this._setSending(true);
        this._wsClient.resume(chatId, chat.pendingTaskId);
      } else {
        this._focusInput();
      }
      
    } catch (err) {
      console.error('[AgentChat] Catch error:', err);
      this.$.messageWindow = null;
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

  _isStaleTaskEvent(detail = {}) {
    let taskId = detail?.taskId || '';
    return Boolean(taskId && this._activeTaskId && taskId !== this._activeTaskId);
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
