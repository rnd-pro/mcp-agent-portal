import Symbiote, { html } from '@symbiotejs/symbiote';
import '../../control/Button/Button.js';
import { translate } from '../../locale/index.js';
import { VoiceRuntime } from '../voice-runtime.js';
import {
  defaultWakeCommandPhrases,
  defaultSendCommandPhrases,
  defaultVoiceActionCommandPhrases,
  wakeCommandCandidates,
  matchVoiceCommandAtEnd,
} from '../voice-input-defaults.js';
import css from './ChatComposer.css.js';

function emit(el, type, detail = {}) {
  el.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
}

function emitCancelable(el, type, detail = {}) {
  let event = new CustomEvent(type, { bubbles: true, composed: true, cancelable: true, detail });
  el.dispatchEvent(event);
  return event;
}

function normalizeVoiceInputState(state) {
  return state === 'recording' ? 'listening' : state === 'processing' ? 'transcribing' : state || 'idle';
}

function clampNumber(value, min = 0, max = 1, fallback = 0) {
  let number = Number(value);
  if (!Number.isFinite(number)) number = fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeProgress(value) {
  let number = clampNumber(value, 0, 1, 0);
  return number > 1 ? 1 : number;
}

function progressStyle(value) {
  return `--composer-meter-progress: ${(normalizeProgress(value) * 100).toFixed(2)}%;`;
}

function normalizeDetailSegments(segments = []) {
  return (Array.isArray(segments) ? segments : [])
    .map((segment, index) => {
      let value = normalizeProgress(segment?.value ?? segment?.progress ?? 0);
      let tone = String(segment?.tone || segment?.kind || `tone-${index + 1}`).replace(/[^a-z0-9_-]/gi, '');
      return {
        tone,
        label: String(segment?.label || ''),
        segmentClass: ['composer-footer-detail-segment', `tone-${tone}`].filter(Boolean).join(' '),
        segmentStyle: `--composer-detail-segment-size: ${(value * 100).toFixed(2)}%;`,
      };
    })
    .filter((segment) => segment.segmentStyle);
}

function normalizeDetailRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row = {}) => {
    let tone = String(row.tone || row.kind || '').replace(/[^a-z0-9_-]/gi, '');
    let depth = Math.min(2, Math.max(0, Number(row.depth || row.level || 0) || 0));
    return {
      label: String(row.label || ''),
      value: String(row.value ?? ''),
      meta: String(row.meta ?? row.percent ?? ''),
      prefix: String(row.prefix || ''),
      rowClass: [
        'composer-footer-detail-row',
        tone ? `tone-${tone}` : '',
        depth ? `depth-${depth}` : '',
        row.muted ? 'is-muted' : '',
      ].filter(Boolean).join(' '),
      hasMeta: row.meta != null || row.percent != null,
      hasPrefix: Boolean(row.prefix),
      hasSwatch: Boolean(tone),
    };
  });
}

function normalizeUsageRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row = {}) => {
    let progress = normalizeProgress(row.progress ?? row.valueProgress ?? 0);
    let tone = String(row.tone || row.kind || '').replace(/[^a-z0-9_-]/gi, '');
    return {
      label: String(row.label || ''),
      value: String(row.value ?? ''),
      meta: String(row.meta ?? ''),
      rowClass: ['composer-footer-usage-row', tone ? `tone-${tone}` : ''].filter(Boolean).join(' '),
      progressStyle: progressStyle(progress),
      hasMeta: row.meta != null,
    };
  });
}

function normalizeFooterDetails(details = null) {
  if (!details || typeof details !== 'object') return null;
  let progress = normalizeProgress(details.progress ?? details.value ?? 0);
  let segments = normalizeDetailSegments(details.segments);
  let rows = normalizeDetailRows(details.rows);
  let usageRows = normalizeUsageRows(details.usageRows || details.planRows);
  return {
    title: String(details.title || ''),
    summary: String(details.summary || ''),
    progress,
    progressLabel: String(details.progressLabel || ''),
    progressStyle: progressStyle(progress),
    segments,
    rowsExpanded: details.rowsExpanded === true,
    rows,
    usageTitle: String(details.usageTitle || ''),
    usageAction: String(details.usageAction || ''),
    usageExpanded: details.usageExpanded === true,
    usageCollapsible: details.usageCollapsible === true,
    usageRows,
    hasTitle: Boolean(details.title),
    hasSummary: Boolean(details.summary),
    hasProgressLabel: Boolean(details.progressLabel),
    hasSegments: segments.length > 0,
    hasRows: rows.length > 0,
    hasUsage: Boolean(details.usageTitle || usageRows.length),
    hasUsageRows: usageRows.length > 0,
    hasUsageAction: Boolean(details.usageAction),
    hasUsageToggle: Boolean(details.usageCollapsible && usageRows.length),
  };
}

function normalizeFooterControl(control, index) {
  let id = String(control?.id || control?.name || `control-${index + 1}`);
  let kind = String(control?.kind || control?.type || 'button');
  let priority = Math.min(Math.max(Number(control?.priority || index + 1), 1), 5);
  let item = {
    ...control,
    id,
    kind,
    priority,
    label: Object.prototype.hasOwnProperty.call(control || {}, 'label') ? control.label : id,
    title: control?.title || control?.label || id,
    value: control?.value ?? '',
  };
  return decorateFooterControl(item);
}

function normalizeLeadingControl(control, index) {
  let id = String(control?.id || control?.name || `control-${index + 1}`);
  let kind = String(control?.kind || control?.type || 'button');
  let priority = Math.min(Math.max(Number(control?.priority || index + 1), 1), 5);
  let item = {
    ...control,
    id,
    kind,
    priority,
    label: Object.prototype.hasOwnProperty.call(control || {}, 'label') ? control.label : id,
    title: control?.title || control?.label || id,
    value: control?.value ?? '',
  };
  return decorateLeadingControl(item);
}

function decorateFooterControl(item) {
  let isSelect = item.kind === 'select';
  let isCheckbox = item.kind === 'checkbox';
  let isButton = !isSelect && !isCheckbox;
  let labelText = String(item.label || '');
  let valueText = item.value ? String(item.value) : '';
  let suffixText = String(item.suffix || item.meta || '');
  let details = normalizeFooterDetails(item.details);
  let meterSource = item.meter && typeof item.meter === 'object' ? item.meter : {};
  let meterValue = normalizeProgress(meterSource.value ?? meterSource.progress ?? details?.progress ?? item.progress ?? 0);
  let meterLabel = String(meterSource.label || '');
  let meterTitle = String(meterSource.title || details?.title || item.title || item.label || item.id || '');
  let accessibleName = String(item.title || item.label || item.id || '');
  let hasMeter = Boolean(item.meter || details);
  let baseClass = [
    'composer-footer-btn',
    'composer-footer-control',
    `composer-priority-${item.priority}`,
    item.active ? 'active' : '',
    item.compact ? 'composer-param-collapsed' : '',
    item.className || '',
  ].filter(Boolean);
  let wrapClass = [...baseClass];
  if (isSelect) wrapClass.push('composer-footer-select-control');
  if (isCheckbox) wrapClass.push('composer-footer-checkbox-control');
  let options = (isSelect && Array.isArray(item.options) ? item.options : []).map((option) => {
    let value = option?.value ?? option?.id ?? option?.label ?? '';
    return {
      value: String(value),
      label: String(option?.label ?? value),
      selected: String(value) === String(item.value),
    };
  });
  return {
    ...item,
    isSelect,
    isCheckbox,
    isButton,
    icon: item.icon ? String(item.icon) : '',
    hasIcon: Boolean(item.icon),
    label: labelText,
    hasLabel: Boolean(labelText),
    value: valueText,
    hasValue: Boolean(valueText),
    suffix: suffixText,
    hasSuffix: Boolean(suffixText),
    disabled: Boolean(item.disabled),
    checked: Boolean(item.checked || item.value === true),
    selectClass: isSelect ? wrapClass.join(' ') : '',
    checkboxClass: isCheckbox ? wrapClass.join(' ') : '',
    buttonClass: isButton ? baseClass.join(' ') : '',
    itemClass: [
      'composer-footer-item',
      `composer-priority-${item.priority}`,
      hasMeter ? 'has-meter' : '',
      item.detailsOpen ? 'details-open' : '',
    ].filter(Boolean).join(' '),
    details,
    hasDetails: Boolean(details),
    detailsExpanded: String(Boolean(item.detailsOpen)),
    meterTitle,
    meterLabel,
    hasMeter,
    hasMeterLabel: Boolean(meterLabel),
    meterStyle: progressStyle(meterValue),
    accessibleName,
    options,
  };
}

function decorateLeadingControl(item) {
  let labelText = String(item.label || '').trim();
  let itemClass = [
    'composer-leading-btn',
    'composer-leading-control',
    labelText ? 'has-label' : 'icon-only',
    item.compact ? 'composer-leading-collapsed' : '',
    item.active ? 'active' : '',
    item.className || '',
  ].filter(Boolean).join(' ');
  return {
    ...item,
    icon: item.icon ? String(item.icon) : '',
    hasIcon: Boolean(item.icon),
    label: labelText,
    hasLabel: Boolean(labelText),
    disabled: Boolean(item.disabled),
    itemClass,
  };
}

function toAnchorRect(el) {
  let rect = el?.getBoundingClientRect?.();
  if (!rect) return null;
  return {
    x: rect.x,
    y: rect.y,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

export class ChatComposer extends Symbiote {
  init$ = {
    value: '',
    disabled: false,
    placeholder: translate('chat.composer.placeholder'),
    attachedContext: [],
    leadingControls: [],
    footerControls: [],
    footerHtml: '',
    footerDetailsOpen: false,
    footerDetailsTitle: '',
    footerDetailsSummary: '',
    footerDetailsProgressLabel: '',
    footerDetailsProgressStyle: progressStyle(0),
    footerDetailsSegments: [],
    footerDetailsRowsExpanded: 'false',
    footerDetailsRowsToggleIcon: 'keyboard_arrow_right',
    footerDetailsRowsCollapsed: true,
    footerDetailsRows: [],
    footerDetailsUsageTitle: '',
    footerDetailsUsageAction: '',
    footerDetailsUsageExpanded: 'false',
    footerDetailsUsageToggleIcon: 'keyboard_arrow_right',
    footerDetailsUsageCollapsed: true,
    footerDetailsUsageRows: [],
    footerDetailsHasTitle: false,
    footerDetailsHasSummary: false,
    footerDetailsHasProgressLabel: false,
    footerDetailsHasSegments: false,
    footerDetailsHasRows: false,
    footerDetailsHasUsage: false,
    footerDetailsHasUsageRows: false,
    footerDetailsHasUsageAction: false,
    footerDetailsHasUsageToggle: false,
    isSending: false,

    onInput: (event) => {
      let input = event.target;
      this.$.value = input.value;
      this.resizeInput();
      emit(this, 'chat-composer-input', {
        value: input.value,
        selectionStart: input.selectionStart,
      });
    },

    onKeyDown: (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        emit(this, 'chat-composer-submit');
        return;
      }
      if (event.key === 'Escape' || event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Tab') {
        emit(this, 'chat-composer-key', { key: event.key, event });
      }
    },

    onSend: () => {
      if (this.$.isSending) {
        emit(this, 'chat-composer-stop', { sending: true });
        return;
      }
      emit(this, 'chat-composer-send');
    },

    onVoiceInput: () => {
      let currentState = this._getVoiceInputState();
      let action = currentState === 'listening'
        ? 'stop'
        : currentState === 'transcribing'
          ? 'cancel'
          : 'start';
      if (action === 'start') this._captureLocalVoiceVisibilitySnapshot();
      let detail = {
        action,
        currentState,
        mode: 'voice-input',
        permission: 'microphone',
        source: 'voice-input',
      };

      let event = emitCancelable(this, 'chat-composer-voice-input', detail);
      if (event.defaultPrevented) {
        this._releaseLocalVoiceVisibilitySnapshot();
        return;
      }
      if (!this._emitVoiceCaptureIntents(action, detail, 'voice-input')) {
        this._releaseLocalVoiceVisibilitySnapshot();
        return;
      }
      this._handleDefaultVoiceInput(action);
    },

    onWakeListen: () => {
      let active = Boolean(this._voiceControls?.wakeListen?.active);
      let action = active ? 'stop' : 'start';
      if (action === 'start') this._captureLocalVoiceVisibilitySnapshot();
      let detail = {
        action,
        currentState: active ? 'listening' : 'idle',
        mode: 'wake-listen',
        permission: 'microphone',
        source: 'wake-listen',
      };

      let event = emitCancelable(this, 'chat-composer-wake-listen', detail);
      if (event.defaultPrevented) {
        this._releaseLocalVoiceVisibilitySnapshot();
        return;
      }
      if (!this._emitVoiceCaptureIntents(action, detail, 'wake-listening')) {
        this._releaseLocalVoiceVisibilitySnapshot();
        return;
      }
      this._handleDefaultWakeListen(action);
    },

    onVoiceResponse: () => {
      emitCancelable(this, 'chat-composer-voice-response-toggle');
    },

    onVoicePresent: () => {
      emitCancelable(this, 'chat-composer-voice-present');
    },

    onVoiceCommand: () => {
      let event = emitCancelable(this, 'chat-composer-voice-command-toggle');
      if (!event.defaultPrevented) {
        this._voiceCommandMode = !this._voiceCommandMode;
        this._syncLocalVoiceControls();
      }
    },

    onVoiceLanguageClick: (event) => {
      let option = event.target?.closest?.('[data-voice-language]');
      if (!option) return;
      let mode = option.dataset.voiceLanguage;
      let cevent = emitCancelable(this, 'chat-composer-voice-language-change', { mode });
      if (!cevent.defaultPrevented) {
        this.setVoiceLanguageState({ mode });
        this._handleDefaultVoiceLanguageChange(mode);
        this._syncLocalVoiceControls();
      }
    },

    onVoiceApprove: () => {
      let detail = this._getVoicePreviewIntentDetail('approve');
      let event = emitCancelable(this, 'chat-composer-voice-approve', detail);
      if (event.defaultPrevented) return;
      let intent = emitCancelable(this, 'chat-composer-transcription-intent', detail);
      if (intent.defaultPrevented) return;
      this._handleDefaultVoiceApprove();
    },

    onVoiceCancel: () => {
      let detail = this._getVoicePreviewIntentDetail('cancel');
      let event = emitCancelable(this, 'chat-composer-voice-cancel', detail);
      if (event.defaultPrevented) return;
      let intent = emitCancelable(this, 'chat-composer-transcription-intent', detail);
      if (intent.defaultPrevented) return;
      this._handleDefaultVoiceInput('cancel');
    },

    onVoiceSend: () => {
      let detail = this._getVoicePreviewIntentDetail('send');
      let event = emitCancelable(this, 'chat-composer-voice-send', detail);
      if (event.defaultPrevented) return;
      let intent = emitCancelable(this, 'chat-composer-transcription-intent', detail);
      if (intent.defaultPrevented) return;
      let text = this.getVoicePreviewText();
      this._sendVoicePreviewText(text);
    },

    onParamChange: (event) => {
      let el = event.target;
      if (!el || (!el.classList.contains('composer-footer-select') && !el.classList.contains('composer-footer-checkbox'))) return;
      let id = el.dataset.footerControlId || el.dataset.param;
      let detail = {
        id,
        kind: el.dataset.footerControlKind || el.type,
        value: el.type === 'checkbox' ? el.checked : el.value,
        inputType: el.type,
      };
      if (el.dataset.footerControlId) {
        emit(this, 'chat-composer-footer-control-change', detail);
      }
      emit(this, 'chat-composer-param-change', {
        id,
        value: detail.value,
        inputType: detail.inputType,
      });
    },

    onFooterClick: (event) => {
      let meter = event.target?.closest?.('button[data-footer-details-id]');
      if (meter) {
        event.preventDefault();
        event.stopPropagation();
        this.toggleFooterDetails(meter.dataset.footerDetailsId);
        return;
      }
      let btn = event.target?.closest?.('button[data-footer-control-id]');
      if (!btn || btn.disabled) return;
      let id = btn.dataset.footerControlId;
      let control = (this.$.footerControls || []).find((item) => String(item.id || item.name) === id) || null;
      emit(this, 'chat-composer-footer-control', {
        id,
        kind: btn.dataset.footerControlKind || control?.kind || control?.type || 'button',
        value: control?.value ?? '',
        control,
      });
    },

    onLeadingClick: (event) => {
      let btn = event.target?.closest?.('button[data-leading-control-id]');
      if (!btn || btn.disabled) return;
      let id = btn.dataset.leadingControlId;
      let control = (this.$.leadingControls || []).find((item) => String(item.id || item.name) === id) || null;
      emit(this, 'chat-composer-leading-control', {
        id,
        kind: btn.dataset.leadingControlKind || control?.kind || control?.type || 'button',
        value: control?.value ?? '',
        anchorRect: toAnchorRect(btn),
        control,
      });
    },

    onRemoveContext: (event) => {
      emit(this, 'chat-composer-context-remove', {
        key: event.currentTarget?.dataset?.key,
      });
    },

    onFooterDetailsRowsToggle: () => {
      this._footerDetailsRowsExpanded = !this._footerDetailsRowsExpanded;
      this._syncFooterDetailsState(this._activeFooterDetails);
    },
    onFooterDetailsUsageToggle: () => {
      this._footerDetailsUsageExpanded = !this._footerDetailsUsageExpanded;
      this._syncFooterDetailsState(this._activeFooterDetails);
    },

    onDragOver: (event) => {
      event.preventDefault();
      this.classList.add('drag-over');
    },

    onDragLeave: () => {
      this.classList.remove('drag-over');
    },

    onDrop: (event) => {
      event.preventDefault();
      this.classList.remove('drag-over');
      let path = event.dataTransfer?.getData('text/plain');
      if (path && path.trim()) {
        emit(this, 'chat-composer-context-drop', { path: path.trim() });
      }
    },
  };

  renderCallback() {
    this.sub('value', (value) => {
      let input = this.getInputElement();
      if (input) {
        if (this._isProgrammaticUpdate) {
          input.value = value || '';
          this.resizeInput();
          queueMicrotask(() => {
            let currentInput = this.getInputElement();
            if (currentInput) {
              let len = currentInput.value.length;
              currentInput.setSelectionRange(len, len);
              currentInput.scrollTop = currentInput.scrollHeight;
            }
          });
        } else if (input.value !== value) {
          input.value = value || '';
          this.resizeInput();
        }
      }
    });
    this.sub('isSending', () => this._syncSendingState());
    this.sub('disabled', () => this._syncDisabledState());
    queueMicrotask(() => {
      this._syncSendingState();
      this._syncDisabledState();
      this._syncVoiceControls();
    });
  }

  disconnectedCallback() {
    this._unbindFooterDetailsDismiss();
    this._stopLocalWakeRecognition();
    if (this._voiceRuntime) {
      this._voiceRuntime.destroy();
      this._voiceRuntime = null;
    }
    super.disconnectedCallback?.();
  }

  suspendLayout() {
    this._resumeLocalWakeAfterSuspend = this._localVoiceActiveMode === 'wake';
    this._stopLocalWakeRecognition();
    this._voiceRuntime?.cancel?.();
    this._localVoiceState = this._resumeLocalWakeAfterSuspend ? 'listening' : 'idle';
    this._localVoiceActiveMode = this._resumeLocalWakeAfterSuspend ? 'wake' : 'idle';
    this._localVoiceWakeMatched = false;
    this._localWakeTriggering = false;
    this.clearVoicePreview();
    this._syncLocalVoiceControls();
  }

  resumeLayout() {
    if (!this._resumeLocalWakeAfterSuspend) return;
    this._resumeLocalWakeAfterSuspend = false;
    this._localVoiceActiveMode = 'wake';
    this._localVoiceState = 'listening';
    this._localVoiceWakeMatched = false;
    this._localWakeTriggering = false;
    this._syncLocalVoiceControls();
    this._startLocalWakeRecognition();
  }

  _voiceCommandLocale() {
    let locale = this._voiceControls?.language?.mode || 'en';
    return ['ru', 'es', 'en'].includes(locale) ? locale : 'en';
  }

  _getVoiceActionPhrases(action) {
    let locale = this._voiceCommandLocale();
    let phrases = defaultVoiceActionCommandPhrases();
    if (action === 'send') {
      let sendPhrases = defaultSendCommandPhrases();
      return [sendPhrases[locale] || sendPhrases.en];
    }
    return phrases[action]?.[locale] || phrases[action]?.en || [];
  }

  _getWakeCommandPhrase() {
    let configured = String(this._voiceControls?.wakeListen?.commandText || '').trim();
    if (configured) return configured;
    return wakeCommandCandidates(defaultWakeCommandPhrases(), this._voiceCommandLocale())[0] || 'Okay Agent';
  }

  _voiceRecognitionLanguage(locale = this._voiceCommandLocale()) {
    return {
      ru: 'ru-RU',
      es: 'es-ES',
      en: 'en-US',
    }[locale] || 'en-US';
  }

  _voiceLanguageOptions() {
    return [
      { mode: 'ru', label: 'RU', title: 'Russian' },
      { mode: 'es', label: 'ES', title: 'Spanish' },
      { mode: 'en', label: 'EN', title: 'English' },
    ];
  }

  _formatVoiceElapsed(elapsed = 0) {
    let value = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
    let m = String(Math.floor(value / 60)).padStart(2, '0');
    let s = String(value % 60).padStart(2, '0');
    return `● Recording ${m}:${s}`;
  }

  _getVoiceCommandHints() {
    let list = (action) => this._getVoiceActionPhrases(action).join(', ');
    return [
      `send: ${list('send')}`,
      `cancel: ${list('cancel')}`,
      `delete: ${list('delete')}`,
      `off: ${list('off')}`,
    ];
  }

  _extractVoiceCommandAction(text = '') {
    let value = String(text || '').trim();
    if (!value) return { matched: false, action: '', text: '' };
    let candidates = ['send', 'cancel', 'delete', 'off'].flatMap((action) => (
      this._getVoiceActionPhrases(action).map((phrase) => ({ action, phrase }))
    ));
    let command = matchVoiceCommandAtEnd(value, candidates);
    if (!command.matched) return { matched: false, action: '', text: value };
    if (command.action === 'send' && !command.text) return { matched: false, action: '', text: value };
    return command;
  }

  _executeVoiceCommand(command) {
    let runtime = this._getVoiceRuntime();
    let keepWakeMode = this._localVoiceActiveMode === 'wake';

    if (command.action === 'send') {
      runtime.cancel();
      this.setValue(command.text);
      this.clearVoicePreview();
      emit(this, 'chat-composer-submit');
    } else if (command.action === 'delete') {
      this.setValue('');
      this.clearVoicePreview();
      this._localVoiceText = '';
      if (runtime.state === 'recording' && runtime.mode === 'speech') {
        runtime.restartSpeechRecognition?.(this._voiceRecognitionLanguage(), { initialText: '' })
          .catch((err) => this._onVoiceRuntimeError(err));
      }
    } else if (command.action === 'cancel') {
      runtime.cancel();
      this.clearVoicePreview();
    } else if (command.action === 'off') {
      runtime.cancel();
      this._voiceCommandMode = false;
      keepWakeMode = false;
      this.clearVoicePreview();
    }

    this._localVoiceState = keepWakeMode ? 'listening' : 'idle';
    this._localVoiceActiveMode = keepWakeMode ? 'wake' : 'idle';
    this._localVoiceWakeMatched = false;
    this._syncLocalVoiceControls();
    if (keepWakeMode) this._startLocalWakeRecognition();
  }

  _getVoiceRuntime() {
    if (!this._voiceRuntime) {
      this._voiceRuntime = new VoiceRuntime();
      this._voiceRuntime.addEventListener('statechange', (e) => {
        this._onVoiceRuntimeStateChange(e.detail.state);
      });
      this._voiceRuntime.addEventListener('speechresult', (e) => {
        this._onVoiceRuntimeSpeechResult(e.detail.text, e.detail.isFinal);
      });
      this._voiceRuntime.addEventListener('audioblob', (e) => {
        this._onVoiceRuntimeAudioBlob(e.detail.blob, e.detail.mimeType);
      });
      this._voiceRuntime.addEventListener('elapsedchange', (e) => {
        this._onVoiceRuntimeElapsedChange(e.detail.elapsed);
      });
      this._voiceRuntime.addEventListener('error', (e) => {
        this._onVoiceRuntimeError(e.detail.error);
      });
      this._voiceCommandMode = true;
    }
    return this._voiceRuntime;
  }

  _emitVoiceCaptureIntents(action, detail, reason) {
    if (action === 'start') {
      let permissionEvent = emitCancelable(this, 'chat-composer-permission-intent', {
        action: 'request',
        permission: 'microphone',
        reason,
        source: detail.source,
      });
      if (permissionEvent.defaultPrevented) return false;
    }

    let recorderEvent = emitCancelable(this, 'chat-composer-recorder-intent', detail);
    return !recorderEvent.defaultPrevented;
  }

  _captureLocalVoiceVisibilitySnapshot() {
    if (this._localVoiceVisibility) return;
    this._localVoiceVisibility = {
      input: this._voiceControls?.input?.visible,
      response: this._voiceControls?.response?.visible,
      command: this._voiceControls?.command?.visible,
      language: this._voiceControls?.language?.visible,
    };
  }

  _releaseLocalVoiceVisibilitySnapshot() {
    if (!this._localVoiceControlsManaged) this._localVoiceVisibility = null;
  }

  async _handleDefaultVoiceInput(action) {
    try {
      if (
        this._localVoiceActiveMode === 'wake' &&
        action === 'start' &&
        !this._localVoiceWakeMatched
      ) {
        await this._startDefaultWakeDictation();
        return;
      }
      let runtime = this._getVoiceRuntime();
      if (action === 'start') {
        let permission = await runtime.checkPermission();
        if (permission === 'prompt') {
          permission = await runtime.requestPermission();
        }
        if (permission !== 'granted') {
          this._releaseLocalVoiceVisibilitySnapshot();
          this.setVoicePreview({
            mode: 'result',
            status: 'Permission denied',
            text: 'Microphone permission is required for voice input.',
          });
          return;
        }

        this._localVoiceActiveMode = 'manual';
        this._localVoiceState = 'listening';
        this._localVoiceElapsed = 0;
        this._localVoiceText = '';
        this._localVoiceWakeMatched = false;
        this._syncLocalVoiceControls();
        this._showLocalRecordingPreview('');

        let mode = VoiceRuntime.hasSpeechRecognition ? 'speech' : 'audio';
        await runtime.start({ language: this._voiceRecognitionLanguage(), mode });
      } else if (action === 'stop') {
        this._localVoiceState = 'transcribing';
        this._syncLocalVoiceControls();
        let result = await runtime.stop();
        this._handleVoiceResult(result);
      } else if (action === 'cancel') {
        runtime.cancel();
        let keepWakeMode = this._localVoiceActiveMode === 'wake';
        this._localVoiceState = keepWakeMode ? 'listening' : 'idle';
        this._localVoiceActiveMode = keepWakeMode ? 'wake' : 'idle';
        this._localVoiceWakeMatched = false;
        this._syncLocalVoiceControls();
        this.clearVoicePreview();
        if (keepWakeMode) this._startLocalWakeRecognition();
      }
    } catch (err) {
      this._onVoiceRuntimeError(err);
    }
  }

  async _handleDefaultWakeListen(action) {
    try {
      let runtime = this._getVoiceRuntime();
      if (action === 'start') {
        this._voiceCommandMode = true;
        this._localVoiceActiveMode = 'wake';
        this._localVoiceState = 'listening';
        this._localVoiceElapsed = 0;
        this._localVoiceText = '';
        this._localVoiceWakeMatched = false;
        this._localWakeTriggering = false;
        this._syncLocalVoiceControls();
        this.clearVoicePreview();

        this._startLocalWakeRecognition();
      } else {
        this._stopLocalWakeRecognition();
        runtime.cancel();
        this._localVoiceState = 'idle';
        this._localVoiceActiveMode = 'idle';
        this._localVoiceWakeMatched = false;
        this._localWakeTriggering = false;
        this._syncLocalVoiceControls();
        this.clearVoicePreview();
      }
    } catch (err) {
      this._onVoiceRuntimeError(err);
    }
  }

  _onVoiceRuntimeStateChange(state) {
    if (state === 'idle' && this._localVoiceState === 'listening') {
      if (
        this._localWakeTriggering &&
        this._localVoiceActiveMode === 'wake' &&
        this._localVoiceWakeMatched
      ) {
        this._syncLocalVoiceControls();
        return;
      }
      if (this._localVoiceActiveMode === 'wake' && this._localVoiceWakeMatched) {
        this._localVoiceState = 'listening';
        this._localVoiceWakeMatched = false;
        this._startLocalWakeRecognition();
        this.clearVoicePreview();
      } else {
        this._localVoiceState = 'idle';
        this._localVoiceActiveMode = 'idle';
      }
      this._syncLocalVoiceControls();
    }
  }

  _onVoiceRuntimeSpeechResult(text, isFinal) {
    this._localVoiceText = text;
    if (this._localVoiceActiveMode === 'wake' && !this._localVoiceWakeMatched) {
      let wakePhrases = this._voiceControls?.wakeListen?.commandText || this._getWakeCommandPhrase();
      let locale = this._voiceCommandLocale();
      let candidates = wakeCommandCandidates({ [locale]: wakePhrases }, locale);
      let matchedWake = false;
      for (let cand of candidates) {
        if (text.toLowerCase().includes(cand.toLowerCase())) {
          matchedWake = true;
          break;
        }
      }
      if (matchedWake) {
        this._triggerDefaultVoiceInputFromWake();
      }
      return;
    } else {
      this._showLocalRecordingPreview(text);
    }

    if (this._voiceCommandMode) {
      let command = this._extractVoiceCommandAction(text);
      if (command.matched) {
        this._executeVoiceCommand(command);
      }
    }
  }

  _onVoiceRuntimeAudioBlob(blob, mimeType) {
    let event = new CustomEvent('chat-composer-audio-captured', {
      bubbles: true,
      composed: true,
      detail: { blob, mimeType },
    });
    this.dispatchEvent(event);
    this.setVoicePreview({
      mode: 'result',
      status: 'audio captured',
      text: `Captured ${Math.round(blob.size / 1024)} KB audio blob (${mimeType}).`,
      editable: false,
    });
  }

  _onVoiceRuntimeElapsedChange(elapsed) {
    this._localVoiceElapsed = elapsed;
    let statusText = this._localVoiceState === 'listening'
      ? this._localVoiceActiveMode === 'wake'
        ? (this._localVoiceWakeMatched ? 'wake matched' : `Listening for "${this._getWakeCommandPhrase()}"`)
        : this._formatVoiceElapsed(elapsed)
      : this._localVoiceState;
    let preview = this.getVoicePreviewElement();
    if (preview && !preview.hidden) {
      let statusEl = this.ref.voicePreviewStatus;
      if (statusEl) {
        statusEl.textContent = statusText;
      }
    }
  }

  _onVoiceRuntimeError(err) {
    this._stopLocalWakeRecognition();
    this._localVoiceState = 'idle';
    this._localVoiceActiveMode = 'idle';
    this._localVoiceWakeMatched = false;
    this._syncLocalVoiceControls();
    this.setVoicePreview({
      mode: 'result',
      status: 'Error',
      text: err.message || String(err),
    });
  }

  _handleVoiceResult(result) {
    let wasWakeMode = this._localVoiceActiveMode === 'wake';
    this._localVoiceState = wasWakeMode ? 'listening' : 'idle';
    this._localVoiceActiveMode = wasWakeMode ? 'wake' : 'idle';
    this._localVoiceWakeMatched = false;
    this._syncLocalVoiceControls();

    if (result.cancelled) {
      if (wasWakeMode) {
        this._startLocalWakeRecognition();
        this.clearVoicePreview();
      } else {
        this.clearVoicePreview();
      }
      return;
    }

    let text = result.text || this._localVoiceText || '';
    if (text) {
      this.setVoicePreview({
        mode: 'result',
        status: 'transcribed',
        text: text,
        editable: true,
      });
    } else if (result.blob) {
      // Audio blob already handled by audioblob event listener
    } else {
      this.setVoicePreview({
        mode: 'result',
        status: 'no speech detected',
        text: '',
      });
    }
  }

  async _handleDefaultVoiceApprove() {
    try {
      let runtime = this._voiceRuntime;
      let result = runtime && (runtime.state === 'recording' || runtime.state === 'starting')
        ? await runtime.stop()
        : null;
      let text = result?.text || this._localVoiceText || this.getVoicePreviewText();
      if (text && text.trim()) {
        this._sendVoicePreviewText(text);
        return;
      }
      if (result) this._handleVoiceResult(result);
    } catch (err) {
      this._onVoiceRuntimeError(err);
    }
  }

  _sendVoicePreviewText(text = '') {
    let value = String(text || '').trim();
    let keepWakeMode = this._localVoiceActiveMode === 'wake';
    this._localVoiceText = '';
    this._localVoiceState = keepWakeMode ? 'listening' : 'idle';
    this._localVoiceActiveMode = keepWakeMode ? 'wake' : 'idle';
    this._localVoiceWakeMatched = false;
    this._syncLocalVoiceControls();
    this.clearVoicePreview();
    if (keepWakeMode) this._startLocalWakeRecognition();
    if (!value) return;
    this.setValue(value);
    emit(this, 'chat-composer-submit');
  }

  _showLocalRecordingPreview(text = '') {
    this.setVoicePreview({
      mode: 'recording',
      status: this._formatVoiceElapsed(this._localVoiceElapsed || 0),
      text,
      elapsed: true,
      commandHints: this._voiceCommandMode ? this._getVoiceCommandHints() : [],
    });
  }

  _showLocalWakePreview() {
    this.clearVoicePreview();
  }

  _getSpeechRecognitionConstructor() {
    if (typeof window === 'undefined') return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  _startLocalWakeRecognition() {
    if (
      this._localVoiceActiveMode !== 'wake' ||
      this._localVoiceWakeMatched ||
      this._localWakeRecognition ||
      this._localVoiceState !== 'listening'
    ) {
      return;
    }
    let SpeechRecognition = this._getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      this._onVoiceRuntimeError(new Error('SpeechRecognition API not supported'));
      return;
    }
    let recognition = new SpeechRecognition();
    recognition.lang = this._voiceRecognitionLanguage();
    recognition.interimResults = true;
    recognition.continuous = true;
    this._localWakeRecognition = recognition;

    recognition.onresult = (event) => {
      let transcript = '';
      let start = Number.isFinite(event.resultIndex) ? event.resultIndex : 0;
      for (let i = start; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      this._handleLocalWakeRecognitionText(transcript);
    };

    recognition.onerror = (event) => {
      this._localWakeRecognition = null;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this._localVoiceState = 'idle';
        this._localVoiceActiveMode = 'idle';
        this._localVoiceWakeMatched = false;
        this._localWakeTriggering = false;
        this._syncLocalVoiceControls();
        this.clearVoicePreview();
        return;
      }
      if (this._localVoiceActiveMode === 'wake' && !this._localVoiceWakeMatched) {
        this._syncLocalVoiceControls();
      }
    };

    recognition.onend = () => {
      this._localWakeRecognition = null;
      if (this._localVoiceActiveMode === 'wake' && !this._localVoiceWakeMatched) {
        setTimeout(() => this._startLocalWakeRecognition(), 250);
      }
    };

    try {
      recognition.start();
    } catch (err) {
      this._localWakeRecognition = null;
      this._onVoiceRuntimeError(err);
    }
  }

  _stopLocalWakeRecognition() {
    let recognition = this._localWakeRecognition;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try { recognition.abort(); } catch (_) {}
    this._localWakeRecognition = null;
  }

  _handleLocalWakeRecognitionText(text = '') {
    let value = String(text || '').trim();
    this._localVoiceText = value;
    let locale = this._voiceCommandLocale();
    let candidates = wakeCommandCandidates(defaultWakeCommandPhrases(), locale);
    if (this._voiceControls?.wakeListen?.commandText) {
      candidates = wakeCommandCandidates({ [locale]: this._voiceControls.wakeListen.commandText }, locale);
    }
    let matchedWake = candidates.some((phrase) => value.toLowerCase().includes(String(phrase).toLowerCase()));
    if (matchedWake) this._triggerDefaultVoiceInputFromWake();
  }

  _triggerDefaultVoiceInputFromWake() {
    if (this._localWakeTriggering || this._localVoiceActiveMode !== 'wake' || this._localVoiceWakeMatched) return;
    this._localWakeTriggering = true;
    this._stopLocalWakeRecognition();
    this._localVoiceWakeMatched = true;
    this._localVoiceText = '';
    this._syncLocalVoiceControls();
    this.clearVoicePreview();
    setTimeout(() => {
      this._startDefaultWakeDictation().finally(() => {
        this._localWakeTriggering = false;
      });
    }, 200);
  }

  async _startDefaultWakeDictation() {
    let runtime = this._getVoiceRuntime();
    if (runtime.state !== 'idle') return;
    this._stopLocalWakeRecognition();
    this._localVoiceActiveMode = 'wake';
    this._localVoiceState = 'listening';
    this._localVoiceElapsed = 0;
    this._localVoiceText = '';
    this._localVoiceWakeMatched = true;
    this._syncLocalVoiceControls();
    this._showLocalRecordingPreview('');
    let mode = VoiceRuntime.hasSpeechRecognition ? 'speech' : 'audio';
    await runtime.start({ language: this._voiceRecognitionLanguage(), mode });
  }

  _handleDefaultVoiceLanguageChange(mode) {
    let locale = ['ru', 'es', 'en'].includes(mode) ? mode : this._voiceCommandLocale();
    let runtime = this._voiceRuntime;
    if (!runtime) {
      if (this._localVoiceActiveMode === 'wake' && !this._localVoiceWakeMatched) {
        this._stopLocalWakeRecognition();
        this._startLocalWakeRecognition();
      }
      return;
    }
    runtime.setLanguage(this._voiceRecognitionLanguage(locale));
    if (runtime.state === 'recording' && runtime.mode === 'speech') {
      runtime.restartSpeechRecognition?.(this._voiceRecognitionLanguage(locale), { initialText: this._localVoiceText || '' })
        .catch((err) => this._onVoiceRuntimeError(err));
    } else if (this._localVoiceActiveMode === 'wake' && !this._localVoiceWakeMatched) {
      this._stopLocalWakeRecognition();
      this._startLocalWakeRecognition();
    }
  }

  _syncLocalVoiceControls() {
    let state = this._localVoiceState || 'idle';
    let activeMode = this._localVoiceActiveMode || 'idle';
    let isManualVoice = activeMode === 'manual' && ['listening', 'transcribing'].includes(state);
    let isWakeVoice = activeMode === 'wake' && ['listening', 'transcribing', 'speaking'].includes(state);
    let isWakeDictation = isWakeVoice && this._localVoiceWakeMatched;
    let isActive = isManualVoice || isWakeVoice;

    if (isActive && !this._localVoiceControlsManaged) {
      this._captureLocalVoiceVisibilitySnapshot();
      this._localVoiceControlsManaged = true;
    }

    if (!this._voiceControls) this._voiceControls = {};

    this._voiceControls.input = {
      ...(this._voiceControls.input || {}),
      state: isManualVoice ? state : isWakeDictation ? state : 'idle',
      enabled: this._voiceControls.input?.enabled !== false,
    };
    this._voiceControls.wakeListen = {
      ...(this._voiceControls.wakeListen || {}),
      active: isWakeVoice,
      commandText: isWakeVoice
        ? (this._voiceControls.wakeListen?.commandText || this._getWakeCommandPhrase())
        : '',
    };

    if (isActive) {
      if (isWakeVoice) this._voiceControls.input.visible = true;
      this._voiceControls.response = {
        ...(this._voiceControls.response || {}),
        visible: isWakeVoice,
        enabled: typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined',
        speaking: state === 'speaking',
      };
      this._voiceControls.command = {
        ...(this._voiceControls.command || {}),
        visible: true,
        enabled: true,
        active: this._voiceCommandMode,
        text: this._voiceControls.command?.text || 'Commands',
      };
      this._voiceControls.language = {
        ...(this._voiceControls.language || {}),
        visible: VoiceRuntime.hasSpeechRecognition,
        enabled: VoiceRuntime.hasSpeechRecognition,
        mode: this._voiceCommandLocale(),
        options: this._voiceControls.language?.options || this._voiceLanguageOptions(),
      };
    } else if (this._localVoiceControlsManaged || this._localVoiceVisibility) {
      let previous = this._localVoiceVisibility || {};
      for (let key of ['input', 'response', 'command', 'language']) {
        if (!this._voiceControls[key]) continue;
        if (previous[key] === undefined) {
          delete this._voiceControls[key].visible;
        } else {
          this._voiceControls[key].visible = previous[key];
        }
      }
      this._localVoiceControlsManaged = false;
      this._localVoiceVisibility = null;
    }

    this._syncVoiceControls();
  }

  getInputElement() {
    return this.ref.chatInput || null;
  }

  getAutocompleteElement() {
    return this.ref.autocompletePopup || null;
  }

  getParamControls() {
    return [...(this.ref.footer?.querySelectorAll('.composer-footer-select, .composer-footer-checkbox') || [])];
  }

  getVoicePreviewElement() {
    return this.ref.voicePreview || null;
  }

  getVoicePreviewBody() {
    return this.ref.voicePreviewBody || null;
  }

  getVoicePreviewText() {
    return this.getVoicePreviewBody()?.textContent || '';
  }

  getVoiceControlElements() {
    return {
      input: this.ref.voiceInputBtn || null,
      wakeListen: this.ref.wakeListenBtn || null,
      response: this.ref.voiceResponseBtn || null,
      present: this.ref.voicePresentBtn || null,
      command: this.ref.voiceCommandBtn || null,
      language: this.ref.voiceLanguageBtn || null,
    };
  }

  _getVoiceInputState() {
    return normalizeVoiceInputState(this._voiceControls?.input?.state || 'idle');
  }

  _getVoicePreviewIntentDetail(action) {
    let preview = this.getVoicePreviewElement();
    return {
      action,
      source: 'voice-preview',
      mode: preview?.hidden ? 'hidden' : Array.from(preview?.classList || [])
        .find((item) => item !== 'composer-body' && item !== 'voice-preview') || 'preview',
      text: this.getVoicePreviewText(),
    };
  }

  setValue(value) {
    this._isProgrammaticUpdate = true;
    this.$.value = value || '';
    this._isProgrammaticUpdate = false;
  }

  setAttachedContext(items) {
    this.$.attachedContext = Array.isArray(items) ? items : [];
  }

  setLeadingControls(controls = []) {
    let normalized = Array.isArray(controls) ? controls.map((control, index) => normalizeLeadingControl(control, index)) : [];
    this.$.leadingControls = normalized;
    this.toggleAttribute('leading-controls', normalized.length > 0);
    queueMicrotask(() => this._syncDisabledState());
  }

  setFooterHtml(htmlStr) {
    this.closeFooterDetails();
    this.$.footerControls = [];
    this.$.footerHtml = htmlStr || '';
    queueMicrotask(() => this._applyFooterHtml());
  }

  setFooterControls(controls = []) {
    let normalized = Array.isArray(controls) ? controls.map((control, index) => normalizeFooterControl(control, index)) : [];
    this.$.footerHtml = '';
    this._clearFooterHtml();
    if (this._activeFooterDetailsId && !normalized.some((control) => control.id === this._activeFooterDetailsId && control.hasDetails)) {
      this.closeFooterDetails();
    } else if (this._activeFooterDetailsId) {
      let active = normalized.find((control) => control.id === this._activeFooterDetailsId);
      if (active) {
        active.detailsOpen = true;
        active.detailsExpanded = 'true';
        this._activeFooterDetails = active.details;
        this._syncFooterDetailsState(active.details);
      }
    }
    this.$.footerControls = normalized;
  }

  toggleFooterDetails(id) {
    let control = (this.$.footerControls || []).find((item) => item.id === id);
    if (!control?.hasDetails) return;
    if (this._activeFooterDetailsId === id && this.$.footerDetailsOpen) {
      this.closeFooterDetails();
      return;
    }
    this._activeFooterDetailsId = id;
    this._activeFooterDetails = control.details;
    this._footerDetailsRowsExpanded = Boolean(control.details.rowsExpanded);
    this._footerDetailsUsageExpanded = Boolean(control.details.usageExpanded);
    this._syncFooterDetailsState(control.details);
    this.$.footerControls = (this.$.footerControls || []).map((item) => ({
      ...item,
      detailsOpen: item.id === id,
      detailsExpanded: String(item.id === id),
    }));
    this._bindFooterDetailsDismiss();
    emit(this, 'chat-composer-footer-details-toggle', {
      id,
      open: true,
      control,
      details: control.details,
    });
  }

  closeFooterDetails() {
    if (!this._activeFooterDetailsId && !this.$.footerDetailsOpen) return;
    let id = this._activeFooterDetailsId;
    this._activeFooterDetailsId = '';
    this._activeFooterDetails = null;
    this._footerDetailsRowsExpanded = false;
    this._footerDetailsUsageExpanded = false;
    this._syncFooterDetailsState(null);
    this.$.footerControls = (this.$.footerControls || []).map((item) => ({
      ...item,
      detailsOpen: false,
      detailsExpanded: 'false',
    }));
    this._unbindFooterDetailsDismiss();
    emit(this, 'chat-composer-footer-details-toggle', {
      id,
      open: false,
    });
  }

  _syncFooterDetailsState(details = null) {
    let next = details || null;
    let rowsExpanded = Boolean(next?.hasRows && this._footerDetailsRowsExpanded);
    let usageExpanded = Boolean(next?.hasUsageRows && this._footerDetailsUsageExpanded);
    this.$.footerDetailsOpen = Boolean(next);
    this.$.footerDetailsTitle = next?.title || '';
    this.$.footerDetailsSummary = next?.summary || '';
    this.$.footerDetailsProgressLabel = next?.progressLabel || '';
    this.$.footerDetailsProgressStyle = next?.progressStyle || progressStyle(0);
    this.$.footerDetailsSegments = next?.segments || [];
    this.$.footerDetailsRowsExpanded = String(rowsExpanded);
    this.$.footerDetailsRowsToggleIcon = rowsExpanded ? 'keyboard_arrow_down' : 'keyboard_arrow_right';
    this.$.footerDetailsRowsCollapsed = !rowsExpanded;
    this.$.footerDetailsRows = next?.rows || [];
    this.$.footerDetailsUsageTitle = next?.usageTitle || '';
    this.$.footerDetailsUsageAction = next?.usageAction || '';
    this.$.footerDetailsUsageExpanded = String(usageExpanded);
    this.$.footerDetailsUsageToggleIcon = usageExpanded ? 'keyboard_arrow_down' : 'keyboard_arrow_right';
    this.$.footerDetailsUsageCollapsed = !usageExpanded;
    this.$.footerDetailsUsageRows = next?.usageRows || [];
    this.$.footerDetailsHasTitle = Boolean(next?.hasTitle);
    this.$.footerDetailsHasSummary = Boolean(next?.hasSummary);
    this.$.footerDetailsHasProgressLabel = Boolean(next?.hasProgressLabel);
    this.$.footerDetailsHasSegments = Boolean(next?.hasSegments);
    this.$.footerDetailsHasRows = Boolean(next?.hasRows);
    this.$.footerDetailsHasUsage = Boolean(next?.hasUsage);
    this.$.footerDetailsHasUsageRows = Boolean(next?.hasUsageRows);
    this.$.footerDetailsHasUsageAction = Boolean(next?.hasUsageAction);
    this.$.footerDetailsHasUsageToggle = Boolean(next?.hasUsageToggle);
  }

  _bindFooterDetailsDismiss() {
    if (this._footerDetailsDismissBound) return;
    this._footerDetailsDismissBound = true;
    let doc = this.ownerDocument || document;
    this._footerDetailsOutsideHandler = (event) => {
      let path = event.composedPath?.() || [];
      if (path.includes(this.ref.footerDetails) || path.some((node) => node?.classList?.contains?.('composer-footer-meter'))) return;
      this.closeFooterDetails();
    };
    this._footerDetailsKeyHandler = (event) => {
      if (event.key === 'Escape') this.closeFooterDetails();
    };
    doc.addEventListener('click', this._footerDetailsOutsideHandler, true);
    doc.addEventListener('keydown', this._footerDetailsKeyHandler, true);
  }

  _unbindFooterDetailsDismiss() {
    if (!this._footerDetailsDismissBound) return;
    this._footerDetailsDismissBound = false;
    let doc = this.ownerDocument || document;
    if (this._footerDetailsOutsideHandler) doc.removeEventListener('click', this._footerDetailsOutsideHandler, true);
    if (this._footerDetailsKeyHandler) doc.removeEventListener('keydown', this._footerDetailsKeyHandler, true);
    this._footerDetailsOutsideHandler = null;
    this._footerDetailsKeyHandler = null;
  }

  _applyFooterHtml() {
    let footer = this.ref.footer;
    if (!footer) return;
    this._footerHtmlNode?.remove();
    let html = this.$.footerHtml;
    if (!html) {
      this._footerHtmlNode = null;
      return;
    }
    let node = document.createElement('div');
    node.className = 'composer-footer-html';
    node.style.display = 'contents';
    node.innerHTML = html;
    this._footerHtmlNode = node;
    footer.appendChild(node);
  }

  _clearFooterHtml() {
    this._footerHtmlNode?.remove();
    this._footerHtmlNode = null;
  }

  setDisabled(disabled) {
    this.$.disabled = Boolean(disabled);
  }

  setPlaceholder(placeholder) {
    this.$.placeholder = placeholder || '';
  }

  setSending(active) {
    this.$.isSending = Boolean(active);
  }

  setVoiceControls(config = {}) {
    let current = this._voiceControls || {};
    this._voiceControls = {
      input: { ...(current.input || {}), ...(config.input || {}) },
      wakeListen: { ...(current.wakeListen || {}), ...(config.wakeListen || {}) },
      response: { ...(current.response || {}), ...(config.response || {}) },
      present: { ...(current.present || {}), ...(config.present || {}) },
      command: { ...(current.command || {}), ...(config.command || {}) },
      language: { ...(current.language || {}), ...(config.language || {}) },
    };
    this._syncVoiceControls();
  }

  setVoiceInputState(state = 'idle', options = {}) {
    this.setVoiceControls({ input: { ...(this._voiceControls?.input || {}), ...options, state } });
  }

  setWakeListenState(options = {}) {
    this.setVoiceControls({ wakeListen: { ...(this._voiceControls?.wakeListen || {}), ...options } });
  }

  setVoiceResponseState(options = {}) {
    this.setVoiceControls({ response: { ...(this._voiceControls?.response || {}), ...options } });
  }

  setPresentState(options = {}) {
    this.setVoiceControls({ present: { ...(this._voiceControls?.present || {}), ...options } });
  }

  setVoiceCommandState(options = {}) {
    this.setVoiceControls({ command: { ...(this._voiceControls?.command || {}), ...options } });
  }

  setVoiceLanguageState(options = {}) {
    this.setVoiceControls({ language: { ...(this._voiceControls?.language || {}), ...options } });
  }

  setVoicePreview({ mode = 'recording', text = '', status = '', elapsed = false, editable = false, commandHints = [] } = {}) {
    let preview = this.ref.voicePreview;
    let statusEl = this.ref.voicePreviewStatus;
    let body = this.ref.voicePreviewBody;
    if (!preview || !body || !statusEl) return;

    preview.hidden = false;
    preview.className = `composer-body voice-preview ${mode}`;
    statusEl.textContent = status || '';
    statusEl.hidden = !status;
    statusEl.classList.toggle('voice-preview-elapsed', Boolean(elapsed));
    body.textContent = text || '';
    body.hidden = !text && mode === 'recording';
    if (editable) {
      body.contentEditable = 'true';
      body.spellcheck = false;
    } else {
      body.removeAttribute('contenteditable');
      body.removeAttribute('spellcheck');
    }
    if (this.ref.voiceCommandHints) {
      let hints = Array.isArray(commandHints) ? commandHints.filter(Boolean) : [];
      this.ref.voiceCommandHints.hidden = hints.length === 0 || mode !== 'recording';
      this.ref.voiceCommandHints.replaceChildren(...hints.map((hint) => {
        let item = document.createElement('span');
        item.className = 'voice-command-hint';
        item.textContent = hint;
        return item;
      }));
    }

    if (this.ref.voiceApproveBtn) this.ref.voiceApproveBtn.hidden = mode !== 'recording';
    if (this.ref.voiceCancelBtn) this.ref.voiceCancelBtn.hidden = false;
    if (this.ref.voiceSendBtn) this.ref.voiceSendBtn.hidden = mode !== 'result';
  }

  clearVoicePreview() {
    let preview = this.ref.voicePreview;
    let statusEl = this.ref.voicePreviewStatus;
    let body = this.ref.voicePreviewBody;
    if (!preview || !body || !statusEl) return;
    preview.hidden = true;
    preview.className = 'composer-body voice-preview';
    statusEl.textContent = '';
    statusEl.hidden = true;
    statusEl.classList.remove('voice-preview-elapsed');
    body.textContent = '';
    body.hidden = false;
    body.removeAttribute('contenteditable');
    body.removeAttribute('spellcheck');
    if (this.ref.voiceCommandHints) {
      this.ref.voiceCommandHints.hidden = true;
      this.ref.voiceCommandHints.replaceChildren();
    }
  }

  resizeInput() {
    let input = this.getInputElement();
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
  }

  resetInputHeight() {
    let input = this.getInputElement();
    if (input) input.style.height = 'auto';
  }

  _syncSendingState() {
    let btn = this.ref.btnSend;
    let icon = this.ref.sendIcon;
    if (!btn || !icon) return;
    if (this.$.isSending) {
      btn.classList.add('btn-stop');
      icon.textContent = 'stop';
    } else {
      btn.classList.remove('btn-stop');
      icon.textContent = 'arrow_upward';
    }
  }

  _syncDisabledState() {
    let input = this.getInputElement();
    if (input) input.disabled = Boolean(this.$.disabled);
    if (this.ref.btnSend) this.ref.btnSend.disabled = Boolean(this.$.disabled);
    let leadingControls = new Map((this.$.leadingControls || []).map((item) => [String(item.id || item.name), item]));
    for (let btn of this.ref.leadingControls?.querySelectorAll?.('button[data-leading-control-id]') || []) {
      let control = leadingControls.get(btn.dataset.leadingControlId);
      btn.disabled = Boolean(this.$.disabled) || Boolean(control?.disabled);
    }
    for (let btn of Object.values(this.getVoiceControlElements())) {
      if (btn) btn.disabled = Boolean(this.$.disabled);
    }
    let voice = this._voiceControls || {};
    if (this.ref.voiceInputBtn && (voice.input?.enabled === false || voice.input?.state === 'disabled')) {
      this.ref.voiceInputBtn.disabled = true;
    }
    if (this.ref.wakeListenBtn && voice.wakeListen?.enabled === false) {
      this.ref.wakeListenBtn.disabled = true;
    }
    if (this.ref.voiceResponseBtn && this._voiceControls?.response?.enabled === false) {
      this.ref.voiceResponseBtn.disabled = true;
    }
    if (this.ref.voicePresentBtn && this._voiceControls?.present?.enabled === false) {
      this.ref.voicePresentBtn.disabled = true;
    }
    if (this.ref.voiceCommandBtn && voice.command?.enabled === false) {
      this.ref.voiceCommandBtn.disabled = true;
    }
    if (this.ref.voiceLanguageBtn && voice.language?.enabled === false) {
      this.ref.voiceLanguageBtn.disabled = true;
    }
  }

  _syncVoiceControls() {
    this._syncVoiceInput(this._voiceControls?.input || {});
    this._syncWakeListen(this._voiceControls?.wakeListen || {});
    this._syncVoiceResponse(this._voiceControls?.response || {});
    this._syncVoicePresent(this._voiceControls?.present || {});
    this._syncVoiceCommand(this._voiceControls?.command || {});
    this._syncVoiceLanguage(this._voiceControls?.language || {});
    this._syncDisabledState();
  }

  _syncVoiceInput({ visible = false, state = 'idle', enabled = true } = {}) {
    let btn = this.ref.voiceInputBtn;
    let icon = this.ref.voiceInputIcon;
    if (!btn) return;
    let normalizedState = normalizeVoiceInputState(state);
    btn.hidden = !visible;
    btn.disabled = Boolean(this.$.disabled) || enabled === false || normalizedState === 'disabled';
    btn.classList.toggle('recording', normalizedState === 'listening');
    btn.classList.toggle('listening', normalizedState === 'listening');
    btn.classList.toggle('processing', normalizedState === 'transcribing');
    btn.classList.toggle('transcribing', normalizedState === 'transcribing');
    btn.classList.toggle('disabled-state', normalizedState === 'disabled');
    btn.dataset.voiceState = normalizedState;
    if (icon) {
      icon.textContent = normalizedState === 'transcribing'
        ? 'hourglass_top'
        : normalizedState === 'listening'
          ? 'stop_circle'
          : normalizedState === 'disabled'
            ? 'mic_off'
            : 'mic';
    }
  }

  _syncWakeListen({ visible = false, enabled = true, active = false, commandText = '' } = {}) {
    let btn = this.ref.wakeListenBtn;
    let text = this.ref.wakeCommandText;
    if (!btn) return;
    btn.hidden = !visible;
    btn.disabled = Boolean(this.$.disabled) || !enabled;
    btn.classList.toggle('listening', Boolean(active));
    btn.classList.toggle('has-command', Boolean(commandText));
    if (text) text.textContent = commandText || '';
  }

  _syncVoiceResponse({ visible = false, enabled = true, active = false, speaking = false } = {}) {
    let btn = this.ref.voiceResponseBtn;
    if (!btn) return;
    btn.hidden = !visible;
    btn.disabled = Boolean(this.$.disabled) || !enabled;
    btn.classList.toggle('active', Boolean(active));
    btn.classList.toggle('enabled', Boolean(enabled));
    btn.classList.toggle('speaking', Boolean(speaking));
  }

  _syncVoicePresent({ visible = false, enabled = true, active = false, title = '' } = {}) {
    let btn = this.ref.voicePresentBtn;
    if (!btn) return;
    btn.hidden = !visible;
    btn.disabled = Boolean(this.$.disabled) || !enabled;
    btn.classList.toggle('active', Boolean(active));
    btn.classList.toggle('enabled', Boolean(enabled));
    if (title) {
      btn.title = title;
      btn.setAttribute('aria-label', title);
    }
  }

  _syncVoiceCommand({ visible = false, enabled = true, active = false, text = '' } = {}) {
    let btn = this.ref.voiceCommandBtn;
    let label = this.ref.voiceCommandText;
    if (!btn) return;
    btn.hidden = !visible;
    btn.disabled = Boolean(this.$.disabled) || !enabled;
    btn.classList.toggle('active', Boolean(active));
    if (label) label.textContent = text || '';
  }

  _syncVoiceLanguage({ visible = false, enabled = true, mode = 'auto', options } = {}) {
    let btn = this.ref.voiceLanguageBtn;
    if (!btn) return;
    btn.hidden = !visible;
    btn.disabled = Boolean(this.$.disabled) || !enabled;
    let normalized = Array.isArray(options) && options.length
      ? options
      : [
        { mode: 'auto', label: 'auto' },
        { mode: 'ru', label: 'RU' },
        { mode: 'en', label: 'EN' },
      ];
    btn.replaceChildren(...normalized.map((option) => {
      let item = document.createElement('span');
      item.className = 'voice-language-option';
      item.dataset.voiceLanguage = option.mode;
      item.textContent = option.label || option.mode;
      item.classList.toggle('active', option.mode === mode);
      return item;
    }));
  }
}

ChatComposer.template = html`
<div ${{ ondragover: 'onDragOver', ondragleave: 'onDragLeave', ondrop: 'onDrop' }}>
  <div class="chat-context-bar" itemize="attachedContext">
    <div class="context-chip" ${{ '@title': 'title' }}>
      <span class="material-symbols-outlined icon-sm">{{icon}}</span>
      <span class="context-path">{{name}}</span>
      <sn-button class="context-remove" variant="icon" ${{ '@data-key': 'key', onclick: '^onRemoveContext' }}>
        <span class="material-symbols-outlined">close</span>
      </sn-button>
    </div>
  </div>
  <div class="composer-body voice-preview" ref="voicePreview" hidden>
    <div class="voice-preview-content">
      <div class="voice-preview-status voice-preview-elapsed" ref="voicePreviewStatus" hidden></div>
      <div class="voice-preview-body" ref="voicePreviewBody"></div>
      <div class="voice-command-hints" ref="voiceCommandHints" hidden></div>
    </div>
    <div class="voice-preview-actions">
      <sn-button class="voice-preview-btn cancel" ref="voiceCancelBtn" variant="danger" title="Cancel" ${{ onclick: 'onVoiceCancel' }}>
        <span class="material-symbols-outlined">close</span>
      </sn-button>
      <sn-button class="voice-preview-btn approve" ref="voiceApproveBtn" variant="success" title="Approve and send" ${{ onclick: 'onVoiceApprove' }}>
        <span class="material-symbols-outlined">check</span>
      </sn-button>
      <sn-button class="voice-preview-btn send" ref="voiceSendBtn" variant="success" title="Send" ${{ onclick: 'onVoiceSend' }}>
        <span class="material-symbols-outlined">send</span>
      </sn-button>
    </div>
  </div>
  <div class="composer-body">
    <div class="composer-leading-controls" ref="leadingControls" itemize="leadingControls" ${{ onclick: 'onLeadingClick' }}>
      <template>
        <button type="button" ${{ '@class': 'itemClass', '@data-leading-control-id': 'id', '@data-leading-control-kind': 'kind', '@title': 'title', '@aria-label': 'title', '@disabled': 'disabled' }}>
          <span class="material-symbols-outlined" ${{ '@hidden': '!hasIcon' }}>{{icon}}</span>
          <span class="composer-leading-label" ${{ '@hidden': '!hasLabel' }}>{{label}}</span>
        </button>
      </template>
    </div>
    <textarea ref="chatInput" rows="1"
      ${{ value: 'value', disabled: 'disabled', placeholder: 'placeholder',
          oninput: 'onInput', onkeydown: 'onKeyDown' }}></textarea>
    <div class="composer-footer" ref="footer" itemize="footerControls" ${{ onchange: 'onParamChange', onclick: 'onFooterClick' }}>
      <template>
        <span ${{ '@class': 'itemClass' }}>
          <label ${{ '@class': 'selectClass', '@data-footer-control-id': 'id', '@data-footer-control-kind': 'kind', '@title': 'title', '@hidden': '!isSelect' }}>
            <span class="material-symbols-outlined" ${{ '@hidden': '!hasIcon' }}>{{icon}}</span>
            <span class="composer-footer-label" ${{ '@hidden': '!hasLabel' }}>{{label}}</span>
            <select class="composer-footer-select" ${{ '@data-footer-control-id': 'id', '@data-footer-control-kind': 'kind', '@disabled': 'disabled', '@aria-label': 'accessibleName' }} itemize="options">
              <template>
                <option ${{ '@value': 'value', '@selected': 'selected' }}>{{label}}</option>
              </template>
            </select>
            <span class="composer-footer-suffix" ${{ '@hidden': '!hasSuffix' }}>{{suffix}}</span>
          </label>
          <label ${{ '@class': 'checkboxClass', '@data-footer-control-id': 'id', '@data-footer-control-kind': 'kind', '@title': 'title', '@hidden': '!isCheckbox' }}>
            <span class="material-symbols-outlined" ${{ '@hidden': '!hasIcon' }}>{{icon}}</span>
            <input class="composer-footer-checkbox" type="checkbox" ${{ '@data-footer-control-id': 'id', '@data-footer-control-kind': 'kind', checked: 'checked', '@disabled': 'disabled', '@aria-label': 'accessibleName' }}>
            <span class="composer-footer-label" ${{ '@hidden': '!hasLabel' }}>{{label}}</span>
          </label>
          <button type="button" ${{ '@class': 'buttonClass', '@data-footer-control-id': 'id', '@data-footer-control-kind': 'kind', '@title': 'title', '@disabled': 'disabled', '@hidden': '!isButton' }}>
            <span class="material-symbols-outlined" ${{ '@hidden': '!hasIcon' }}>{{icon}}</span>
            <span class="composer-footer-label" ${{ '@hidden': '!hasLabel' }}>{{label}}</span>
            <span class="composer-footer-value" ${{ '@hidden': '!hasValue' }}>{{value}}</span>
          </button>
          <button type="button" class="composer-footer-meter" aria-controls="composer-footer-details-popover" ${{ '@data-footer-details-id': 'id', '@title': 'meterTitle', '@aria-label': 'meterTitle', '@aria-expanded': 'detailsExpanded', '@hidden': '!hasMeter' }}>
            <span class="composer-footer-meter-ring" aria-hidden="true" ${{ '@style': 'meterStyle' }}></span>
            <span class="composer-footer-meter-label" ${{ '@hidden': '!hasMeterLabel' }}>{{meterLabel}}</span>
          </button>
        </span>
      </template>
    </div>
    <section id="composer-footer-details-popover" class="composer-footer-details-popover" ref="footerDetails" role="dialog" aria-live="polite" ${{ '@hidden': '!footerDetailsOpen' }}>
      <button type="button" class="composer-footer-details-head" aria-controls="composer-footer-detail-rows" ${{ '@aria-expanded': 'footerDetailsRowsExpanded', onclick: 'onFooterDetailsRowsToggle' }}>
        <span class="composer-footer-details-title" ${{ '@hidden': '!footerDetailsHasTitle' }}>{{footerDetailsTitle}}</span>
        <span class="composer-footer-details-summary" ${{ '@hidden': '!footerDetailsHasSummary' }}>{{footerDetailsSummary}}</span>
        <span class="material-symbols-outlined" aria-hidden="true">{{footerDetailsRowsToggleIcon}}</span>
      </button>
      <div class="composer-footer-details-track" ${{ '@style': 'footerDetailsProgressStyle' }}>
        <div class="composer-footer-details-fill"></div>
        <div class="composer-footer-detail-segments" itemize="footerDetailsSegments" ${{ '@hidden': '!footerDetailsHasSegments' }}>
          <template>
            <span ${{ '@class': 'segmentClass', '@style': 'segmentStyle', '@title': 'label' }}></span>
          </template>
        </div>
      </div>
      <div class="composer-footer-details-progress-label" ${{ '@hidden': '!footerDetailsHasProgressLabel' }}>{{footerDetailsProgressLabel}}</div>
      <div id="composer-footer-detail-rows" class="composer-footer-details-rows" itemize="footerDetailsRows" ${{ '@hidden': 'footerDetailsRowsCollapsed' }}>
        <template>
          <div ${{ '@class': 'rowClass' }}>
            <span class="composer-footer-detail-prefix" ${{ '@hidden': '!hasPrefix' }}>{{prefix}}</span>
            <span class="composer-footer-detail-swatch" ${{ '@hidden': '!hasSwatch' }}></span>
            <span class="composer-footer-detail-label">{{label}}</span>
            <span class="composer-footer-detail-value">{{value}}</span>
            <span class="composer-footer-detail-meta" ${{ '@hidden': '!hasMeta' }}>{{meta}}</span>
          </div>
        </template>
      </div>
      <div class="composer-footer-usage" ${{ '@hidden': '!footerDetailsHasUsage' }}>
        <button type="button" class="composer-footer-details-toggle composer-footer-usage-head" aria-controls="composer-footer-usage-rows" ${{ '@aria-expanded': 'footerDetailsUsageExpanded', '@hidden': '!footerDetailsHasUsageToggle', onclick: 'onFooterDetailsUsageToggle' }}>
          <span class="material-symbols-outlined" aria-hidden="true">{{footerDetailsUsageToggleIcon}}</span>
          <span>{{footerDetailsUsageTitle}}</span>
          <span class="material-symbols-outlined composer-footer-details-action" ${{ '@hidden': '!footerDetailsHasUsageAction' }}>{{footerDetailsUsageAction}}</span>
        </button>
        <div class="composer-footer-usage-head" ${{ '@hidden': 'footerDetailsHasUsageToggle' }}>
          <span>{{footerDetailsUsageTitle}}</span>
          <span class="material-symbols-outlined composer-footer-details-action" ${{ '@hidden': '!footerDetailsHasUsageAction' }}>{{footerDetailsUsageAction}}</span>
        </div>
        <div id="composer-footer-usage-rows" class="composer-footer-usage-rows" itemize="footerDetailsUsageRows" ${{ '@hidden': 'footerDetailsUsageCollapsed' }}>
          <template>
            <div ${{ '@class': 'rowClass' }}>
              <div class="composer-footer-usage-line">
                <span class="composer-footer-usage-label">{{label}}</span>
                <span class="composer-footer-usage-value">{{value}}</span>
                <span class="composer-footer-usage-meta" ${{ '@hidden': '!hasMeta' }}>{{meta}}</span>
              </div>
              <div class="composer-footer-usage-track" ${{ '@style': 'progressStyle' }}><span></span></div>
            </div>
          </template>
        </div>
      </div>
    </section>
    <div class="composer-actions">
      <button class="btn-wake-listen" ref="wakeListenBtn" type="button" title="Wake listening" hidden ${{ onclick: 'onWakeListen' }}>
        <span class="material-symbols-outlined">hearing</span>
        <span class="wake-command-text" ref="wakeCommandText"></span>
      </button>
      <button class="btn-voice-response" ref="voiceResponseBtn" type="button" title="Voice response" hidden ${{ onclick: 'onVoiceResponse' }}>
        <span class="material-symbols-outlined">record_voice_over</span>
      </button>
      <button class="btn-voice-present" ref="voicePresentBtn" type="button" title="Present" hidden ${{ onclick: 'onVoicePresent' }}>
        <span class="material-symbols-outlined">co_present</span>
      </button>
      <button class="btn-voice-command" ref="voiceCommandBtn" type="button" title="Voice command mode" hidden ${{ onclick: 'onVoiceCommand' }}>
        <span class="material-symbols-outlined">rule</span>
        <span class="voice-command-button-text" ref="voiceCommandText"></span>
      </button>
      <button class="btn-voice-language" ref="voiceLanguageBtn" type="button" title="Voice language" hidden ${{ onclick: 'onVoiceLanguageClick' }}></button>
    </div>
    <button class="btn-mic" ref="voiceInputBtn" type="button" title="Voice input" hidden ${{ onclick: 'onVoiceInput' }}>
      <span class="material-symbols-outlined" ref="voiceInputIcon">mic</span>
    </button>
    <sn-button class="btn-send" ref="btnSend" variant="icon" ${{ onclick: 'onSend' }}>
      <span class="material-symbols-outlined" ref="sendIcon">arrow_upward</span>
    </sn-button>
  </div>
  <div class="autocomplete-popup" ref="autocompletePopup"></div>
</div>
`;

ChatComposer.rootStyles = css;
ChatComposer.reg('chat-composer');
