import { Symbiote, PubSub } from '@symbiotejs/symbiote';
import { state as dashState, events as dashEvents, emit as dashEmit } from '../../dashboard-state.js';
import { setGlobalParam, parseQuery, getRoute } from 'symbiote-node';
import template from './AgentChat.tpl.js';
import css from './AgentChat.css.js';
import '../../common/CellBg/CellBg.js';
import './ChatMessageItem.js';
import { uiPrompt } from '../../common/ui-dialogs.js';
import { replaceIconsWithHtml, ICONS } from '../../common/icons.js';
import { escapeHtml, formatElapsed } from '../../utils/markdown-formatter.js';
import { ChatWsClient } from '../../services/chat-ws-client.js';
import { ChatAutocomplete } from '../../services/chat-autocomplete.js';
import {
  formatAttachedContextBlock,
  mergeAttachedContext,
  removeAttachedContext,
} from '../../services/chat-context.js';
import { ChatSidebar } from '../../components/ChatSidebar/ChatSidebar.js';

/**
 * AgentChat — single layout panel with integrated chat-nav sidebar.
 *
 * Layout:
 *   [chat-nav] | [chat-view]
 *
 * chat-nav: sidebar-style list of chats (collapsed 48px / expanded 200px)
 * chat-view: header + messages + input
 *
 * Can be collapsed/fullscreened via standard layout panel controls.
 */
export class AgentChat extends Symbiote {
  static isoMode = true;
  init$ = {
    messages: [],
    messageItems: [],
    inputVal: '',
    chatName: 'Select a chat',
    chatAdapter: '',
    adapterMeta: {},
    adapterOptionsHtml: '',
    composerFooterHtml: '',
    chatParams: {},
    attachedContext: [],
    isInputDisabled: true,
    inputPlaceholder: 'Ask anything, @ to mention, / for workflows',
    sessionMetaHtml: '',

    onKeyDown: (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._sendMessage();
      }
      if (e.key === 'Escape') this._ac?.hide();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (this._ac?.isVisible) {
          e.preventDefault();
          this._ac?.navigate(e.key === 'ArrowDown' ? 1 : -1);
        }
      }
      if (e.key === 'Tab' && this._ac?.isVisible) {
        e.preventDefault();
        this._ac?.select();
      }
    },

    onInput: (e) => {
      let ta = e.target;
      this.$.inputVal = ta.value;
      // Auto-grow
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
      // Autocomplete trigger
      this._ac?.check(ta.value, ta.selectionStart);
    },

    onSend: () => {
      let targetChatId = this._loadedChatId || dashState.activeChatId;
      if (this._isSending && targetChatId) {
        let chat = dashState.chats?.find(c => c.id === targetChatId);
        let taskId = chat?.pendingTaskId || this.$.chatParams?.pendingTaskId;
        this._wsClient?.stop(targetChatId, taskId);
        return;
      }
      this._sendMessage();
    },

    onParamChangeDelegated: (e) => {
      let el = e.target;
      if (!el || (!el.classList.contains('composer-footer-select') && !el.classList.contains('composer-footer-checkbox'))) return;
      
      let id = el.dataset.param;
      let val = el.type === 'checkbox' ? el.checked : el.value;

      let currentParams = this.$.chatParams || {};
      let updatedParams = { ...currentParams, [id]: val };

      // Cascade: when provider changes, reset model
      if (id === 'provider') {
        delete updatedParams.model;
      }
      if (id === 'agent') {
        updatedParams.approval_mode = this._getAgentDefaultApprovalMode(val);
      }

      this.$.chatParams = updatedParams;

      let chatId = this._loadedChatId || dashState.activeChatId;
      if (chatId) {
        let saveData = { id: chatId, [id]: val };
        if (id === 'provider') saveData.model = null;
        if (id === 'agent') saveData.approval_mode = updatedParams.approval_mode;
        fetch('/api/chats/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(saveData)
        });
      }
    },

    onAttachClick: async () => {
      let path = await uiPrompt('Enter file or folder path to attach:');
      if (path && path.trim()) {
        this._attachContext({ type: 'file', path: path.trim(), source: 'manual' });
      }
    },

    onRemoveContext: (e) => {
      this.$.attachedContext = removeAttachedContext(this.$.attachedContext, e.currentTarget.dataset.key);
    },

    onScrollToBottom: () => {
      this._scrollMessagesToBottom({ smooth: true });
    },

    onDragOver: (e) => {
      e.preventDefault();
      e.currentTarget.classList.add('drag-over');
    },

    onDragLeave: (e) => {
      e.currentTarget.classList.remove('drag-over');
    },

    onDrop: (e) => {
      e.preventDefault();
      e.currentTarget.classList.remove('drag-over');

      let path = e.dataTransfer.getData('text/plain');
      if (path && path.trim()) {
        this._attachContext({ type: 'file', path: path.trim(), source: 'drop' });
      }
    },

    onMessageItemClick: (e) => {
      let copyBtn = e.target.closest('.work-copy-btn');
      if (copyBtn) {
        e.preventDefault();
        e.stopPropagation();
        this._copyMessageText(copyBtn.dataset.copyText || '', copyBtn);
        return;
      }

      let card = e.target.closest('.delegation-card');
      if (card) {
        let chatId = card.dataset.chatId;
        if (chatId) {
          dashState.activeChatId = chatId;
          setGlobalParam('chat', chatId);
          dashEmit('active-chat-changed', { id: chatId });
        }
      }
    },
  };

  renderCallback() {

    // Initial empty state
    queueMicrotask(() => this._updateEmptyState());

    // Fetch adapter metadata
    this._fetchAdapterMeta();


    
    this._ac = new ChatAutocomplete({
      popupEl: this.ref.autocompletePopup,
      textareaEl: this.ref.chatInput,
      onAttachFile: (newVal, path) => {
        this.$.inputVal = newVal;
        this.ref.chatInput.value = newVal;
        this._attachContext({ type: 'file', path, source: 'autocomplete' });
      },
      onInsertWorkflow: (newVal) => {
        this.$.inputVal = newVal;
        this.ref.chatInput.value = newVal;
      }
    });

    this.ref.chatMessages?.addEventListener('scroll', () => this._updateScrollBottomButton(), { passive: true });

    this._wsClient = new ChatWsClient({
      getMessages: () => this.$.messages,
      setMessages: (msgs) => { this.$.messages = msgs; },
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
      onDone: () => {
        this._setSending(false);
        this._renderLiveStatus(null);
        this._updateEmptyState();
      },
      onError: (errText) => {
        this._setSending(false);
        this._renderLiveStatus(null);
        this._updateEmptyState();
      },
      buildSessionMetaHtml: (text) => this._buildSessionMetaHtml(text)
    });
    dashEvents.addEventListener('active-chat-changed', (e) => {
      console.log('[AgentChat] active-chat-changed received:', e.detail);
      this._loadChat(e.detail?.id);
    });
    dashEvents.addEventListener('graph-context-selected', (e) => {
      this._attachContext(e.detail);
    });

    // Self-register with router: react to ?chat= URL param changes
    this.sub('ROUTER/query', (query) => {
      console.log('[AgentChat] ROUTER/query changed:', query);
      this._syncChatFromRouter();
    });

    // Re-render messages when they change
    this.sub('messages', (msgs) => {
      this._renderMessages();
      this._updateEmptyState();
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

    // Sync state from router after all listeners are attached (fixes cold load bug)
    this._syncChatFromRouter();
  }

  _updateInputState() {
    let adapter = this.$.chatAdapter || 'pool';
    let isModelRequired = adapter === 'pool' || adapter === 'opencode';
    let hasModel = !!this.$.chatParams?.model;
    
    let disabled = isModelRequired && !hasModel;
    this.$.isInputDisabled = disabled;
    this.$.inputPlaceholder = disabled 
      ? 'Select a model to start...' 
      : 'Ask anything, @ to mention, / for workflows';
  }

  _attachContext(item) {
    this.$.attachedContext = mergeAttachedContext(this.$.attachedContext || [], item);
  }

  /**
   * Build compact HTML for the session metadata shown in the chat header.
   * @param {string} text - Formatted markdown result from get_task_result
   * @returns {string} HTML string
   */
  _buildSessionMetaHtml(text) {
    if (!text) return '';
    let chips = [];
    let modeMatch = text.match(/- Mode:\s*(.+)/i);
    if (modeMatch) {
      let mode = modeMatch[1].trim();
      let iconName = mode === 'yolo' ? 'bolt' : mode === 'plan' ? 'lock' : 'settings';
      chips.push(`<span class="meta-chip"><span class="material-symbols-outlined" style="font-size:12px">${iconName}</span> ${escapeHtml(mode)}</span>`);
    }
    let exitMatch = text.match(/- Exit code:\s*(\d+)/i);
    if (exitMatch) {
      let code = parseInt(exitMatch[1]);
      let cls = code === 0 ? 'meta-ok' : 'meta-err';
      chips.push(`<span class="meta-chip ${cls}">exit ${code}</span>`);
    }
    let sidMatch = text.match(/- Session ID:\s*`([^`]+)`/i);
    if (sidMatch) {
      chips.push(`<span class="meta-chip meta-sid" title="${escapeHtml(sidMatch[1])}">${escapeHtml(sidMatch[1].substring(0, 12))}…</span>`);
    }
    let tokensMatch = text.match(/- Tokens:\s*(\d+)/i);
    if (tokensMatch) {
      chips.push(`<span class="meta-chip meta-info" title="Tokens">${tokensMatch[1]} tks</span>`);
    }
    let costMatch = text.match(/- Cost:\s*\$?([\d.]+)/i);
    if (costMatch) {
      chips.push(`<span class="meta-chip meta-info" title="Cost">$${costMatch[1]}</span>`);
    }
    return chips.join('');
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
  _setSending(active) {
    this._isSending = active;
    let btn = this.ref.btnSend;
    let icon = this.ref.sendIcon;
    if (btn && icon) {
      if (active) {
        btn.classList.add('btn-stop');
        icon.textContent = 'stop';
      } else {
        btn.classList.remove('btn-stop');
        icon.textContent = 'arrow_upward';
      }
    }
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

      let providers = Object.keys(meta).filter(k => k !== 'pool');
      let currentProvider = currentParams.provider ?? providers[0];

      paramsToMap.push({
        id: 'provider', label: 'Provider', type: 'select', options: providers
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
            } else if (p.id === 'approval_mode') {
              paramValue = this._getAgentDefaultApprovalMode(currentParams.agent);
            } else if (p.id === 'model') {
              let defMap = { 'gemini': 'gemini-3.1-pro-preview', 'opencode': 'DeepSeek: DeepSeek V4 Pro' };
              let currentCtx = adapter === 'pool' ? currentParams.provider : adapter;
              let expectedDef = defMap[currentCtx];
              let found = expectedDef ? p.options.find(o => (typeof o === 'string' ? o : o.val) === expectedDef) : null;
              if (found) {
                paramValue = typeof found === 'string' ? found : found.val;
              } else {
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
            let sel = val === paramValue ? 'selected' : '';
            return `<option value="${escapeHtml(val)}" ${sel}>${escapeHtml(text)}</option>`;
          }).join('');
          
          let disabledAttr = '';
          if ((p.id === 'provider' || p.id === 'agent') && this.$.messages && this.$.messages.length > 0) {
            disabledAttr = 'disabled title="Locked"';
          }

          let iconName = p.id === 'agent' ? 'smart_toy' : p.id === 'provider' ? 'dns' : p.id === 'model' ? 'neurology' : 'tune';
          let currentOption = p.options.find(opt => (typeof opt === 'string' ? opt : opt.val) === paramValue);
          let currentLabel = typeof currentOption === 'string' ? currentOption : currentOption?.text || p.label;
          
          return `<span class="composer-footer-btn composer-param composer-param-${escapeHtml(p.id)} ${priorityClass}" title="${escapeHtml(p.label)}: ${escapeHtml(currentLabel)}"><span class="material-symbols-outlined">${iconName}</span><select class="composer-footer-select" data-param="${escapeHtml(p.id)}" aria-label="${escapeHtml(p.label)}" ${disabledAttr}>${optionsHtml}</select></span>`;
        } else if (p.type === 'boolean') {
          let paramValue = currentParams[p.id];
          if (paramValue === undefined) {
            paramValue = true; // Default to true as requested
            currentParams[p.id] = paramValue;
            paramsChanged = true;
          }
          let checked = paramValue ? 'checked' : '';
          let iconColor = paramValue ? 'var(--sn-text-dim)' : 'var(--sn-text-dim)';
          let textColor = paramValue ? 'var(--sn-text-dim)' : 'var(--sn-text-dim)';
          
          return `<label class="composer-footer-btn composer-param composer-param-${escapeHtml(p.id)} ${priorityClass}" title="${escapeHtml(p.label)}">
            <input type="checkbox" class="composer-footer-checkbox" data-param="${escapeHtml(p.id)}" ${checked} hidden>
            <span class="material-symbols-outlined composer-toggle-icon" style="color:${iconColor};">${paramValue ? 'toggle_on' : 'toggle_off'}</span>
            <span class="composer-footer-label" style="color:${textColor}; font-weight:500;">${escapeHtml(p.label)}</span>
          </label>`;
        }
        return '';
      }).join('');
      this.$.composerFooterHtml = htmlStr;
      // Batch-persist all defaults in a single reactive update
      if (paramsChanged) {
        this.$.chatParams = { ...currentParams };
      }
    } else {
      this.$.composerFooterHtml = '';
    }
    this._updatingOptions = false;
  }

  _composerParamPriorityClass(paramId) {
    switch (paramId) {
      case 'model': return 'composer-priority-5';
      case 'agent': return 'composer-priority-4';
      case 'provider': return 'composer-priority-3';
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

  _syncChatFromRouter() {
    let route = getRoute();
    let globals = parseQuery(route.query || '');
    let chatId = globals.chat || null;
    console.log('[AgentChat] _syncChatFromRouter: route=', route, 'chatId=', chatId, 'dashState.activeChatId=', dashState.activeChatId);

    if (chatId && chatId !== dashState.activeChatId) {
      console.log('[AgentChat] Emitting active-chat-changed for', chatId);
      dashState.activeChatId = chatId;
      dashEmit('active-chat-changed', { id: chatId, fromRoute: true });
    } else if (chatId !== this._loadedChatId) {
      console.log('[AgentChat] dashState already matches but not loaded locally. Loading', chatId);
      this._loadChat(chatId);
    }
  }


  _renderMessages() {
    let container = this.ref.chatMessages || this.querySelector('.chat-messages');
    if (!container) return;
    
    // Check if user has scrolled up
    let isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 10;

    let messages = this.$.messages || [];
    let items = [];
    let lastAgentItem = null;
    let streamingBoards = [];

    for (let i = 0; i < messages.length; i++) {
      let msg = messages[i];

      if (msg.role === 'thinking' && msg.done) {
        let copyText = this._findPreviousAgentText(messages, i);
        if (lastAgentItem) {
          lastAgentItem.workSummaryHtml = this._buildWorkSummaryHtml(msg, copyText);
          continue;
        }
      }

      let item = this._toMessageItem(msg);
      if (msg.role === 'thinking' && msg.done) {
        item.copyText = this._findPreviousAgentText(messages, i);
      }
      items.push(item);

      if (msg.role === 'agent') lastAgentItem = item;
      if (msg.role === 'board' && msg.streaming && msg.taskIds?.length) {
        streamingBoards.push([...msg.taskIds]);
      }
    }

    this.$.messageItems = items;

    requestAnimationFrame(() => {
      for (let taskIds of streamingBoards) {
        let firstCard = container.querySelector(`[data-task-id="${this._cssEscape(taskIds[0])}"]`);
        let board = firstCard?.closest('.delegation-board');
        if (board) this._startDelegationPolling(taskIds, board);
      }
      if (isAtBottom) {
        this._scrollMessagesToBottom();
      }
      this._updateScrollBottomButton();
    });
  }

  _toMessageItem(msg) {
    return {
      type: msg.type || msg.role,
      role: msg.role,
      text: msg.text || msg.content || '',
      isStreaming: !!msg.streaming,
      name: msg.name || '',
      input: msg.input || null,
      result: msg.result || null,
      done: !!msg.done,
      elapsedText: formatElapsed(msg.elapsed || 0),
      status: msg.status || '',
      metaHtml: this._buildWorkMetaHtml(msg.meta),
      taskIds: msg.taskIds || [],
      workSummaryHtml: '',
      copyText: '',
    };
  }

  _cssEscape(value) {
    let str = String(value || '');
    return globalThis.CSS?.escape ? CSS.escape(str) : str.replace(/["\\]/g, '\\$&');
  }

  _buildWorkSummaryHtml(msg, copyText) {
    let metaHtml = this._buildWorkMetaHtml(msg.meta);
    let bodyHtml = metaHtml ? `<div class="work-body">${metaHtml}</div>` : '';
    let copyBtn = copyText
      ? `<button class="work-copy-btn" type="button" title="Copy response" data-copy-text="${escapeHtml(copyText)}"><span class="material-symbols-outlined">content_copy</span></button>`
      : '';
    return `<div class="work-summary-wrap"><details class="work-summary"><summary><span class="material-symbols-outlined" style="font-size:16px;color:var(--sn-success-color)">check_circle</span>Worked for ${escapeHtml(formatElapsed(msg.elapsed || 0))}</summary>${bodyHtml}</details>${copyBtn}</div>`;
  }

  _buildWorkMetaHtml(meta) {
    if (!meta) return '';
    let items = [];
    if (meta.mode) {
      let iconName = meta.mode === 'yolo' ? 'bolt' : 'settings';
      items.push(`<span class="meta-chip"><span class="material-symbols-outlined" style="font-size:12px">${iconName}</span> ${escapeHtml(meta.mode)}</span>`);
    }
    if (meta.exitCode != null) {
      let cls = meta.exitCode === 0 ? 'meta-ok' : 'meta-err';
      items.push(`<span class="meta-chip ${cls}">exit ${meta.exitCode}</span>`);
    }
    if (meta.sessionId) items.push(`<span class="meta-chip meta-sid" title="${escapeHtml(meta.sessionId)}">${escapeHtml(meta.sessionId.substring(0, 16))}...</span>`);
    if (meta.tools) items.push(`<span class="meta-chip">${meta.tools} tool call${meta.tools > 1 ? 's' : ''}</span>`);
    if (meta.tokens != null) items.push(`<span class="meta-chip meta-info">${meta.tokens} tks</span>`);
    if (meta.cost != null) items.push(`<span class="meta-chip meta-info">$${meta.cost.toFixed(4)}</span>`);
    if (meta.errors) items.push(`<span class="meta-chip meta-err">${escapeHtml(meta.errors)}</span>`);
    return items.join('');
  }

  _findPreviousAgentText(messages, fromIndex) {
    for (let i = fromIndex - 1; i >= 0; i--) {
      let msg = messages[i];
      if (msg?.role === 'agent' && typeof msg.text === 'string' && msg.text.trim()) return msg.text;
      if (msg?.role === 'user') break;
    }
    return '';
  }

  async _copyMessageText(text, btn) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        this._copyTextFallback(text);
      }
      this._flashCopyButton(btn, 'check');
    } catch {
      if (this._copyTextFallback(text)) {
        this._flashCopyButton(btn, 'check');
      } else {
        this._flashCopyButton(btn, 'error');
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

  _scrollMessagesToBottom({ smooth = false } = {}) {
    let container = this.ref.chatMessages || this.querySelector('.chat-messages');
    if (!container) return;
    if (smooth && typeof container.scrollTo === 'function') {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    } else {
      container.scrollTop = container.scrollHeight;
    }
    this._updateScrollBottomButton();
  }

  _updateScrollBottomButton() {
    let container = this.ref.chatMessages || this.querySelector('.chat-messages');
    let btn = this.ref.scrollBottomBtn;
    if (!container || !btn) return;
    let hasOverflow = container.scrollHeight > container.clientHeight + 12;
    let isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 32;
    btn.classList.toggle('visible', hasOverflow && !isAtBottom);
  }

  async _sendMessage() {
    console.log('[AgentChat] _sendMessage called!', new Error().stack);
    this._syncComposerParamsFromDom();
    let chatId = this._loadedChatId || dashState.activeChatId;

    // Auto-create chat on first message (quick-start flow)
    if (!chatId) {
      try {
        let adapter = this.$.chatAdapter || 'pool';
        // Include current chatParams (provider, model, etc.) in the new chat
        let createPayload = { adapter, ...this.$.chatParams };
        let res = await fetch('/api/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createPayload),
        });
        let data = await res.json();
        if (data.ok) {
          chatId = data.id;
          dashState.activeChatId = chatId;
          setGlobalParam('chat', chatId);
          dashEmit('active-chat-changed', { id: chatId });
          dashEmit('active-chat-changed', { id: chatId });
        } else {
          return;
        }
      } catch {
        return;
      }
    }

    let prompt = this.$.inputVal.trim();
    if (!prompt) return;

    // Sync any default/unsaved params from the UI dropdowns
    let changedParams = this._syncComposerParamsFromDom();
    if (changedParams && chatId) {
      fetch('/api/chats/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: chatId, ...this.$.chatParams })
      });
    }

    let contextText = formatAttachedContextBlock(this.$.attachedContext || []);
    if (contextText) {
      prompt = contextText + prompt;
    }

    this.$.messages = [...this.$.messages, { role: 'user', text: prompt }];
    this.$.inputVal = '';
    this.$.attachedContext = []; // Clear context after send
    if (this.ref.chatInput) {
      this.ref.chatInput.value = '';
      this.ref.chatInput.style.height = 'auto';
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
        if (this.ref.cellBg) this.ref.cellBg.toggle(true);

        reply = await this._wsClient.send(chatId, prompt, this.$.chatParams, this._sessionId);

        // _sendViaWs handles thinking block, final messages, and persistence
      } else {
        this.$.messages = [...this.$.messages, { role: 'system', text: 'Processing...' }];
        if (this.ref.cellBg) this.ref.cellBg.toggle(true);

        let payload = { type: adapter, prompt, timeout: 300, ...this.$.chatParams };
        let res = await fetch('/api/adapter/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        let data = await res.json();
        this.$.messages = this.$.messages.filter(m => m.text !== 'Processing...');

        if (data.error) {
          reply = `Error: ${data.error}`;
        } else {
          reply = data.response;
          structuredEvents = data.events;
        }
        if (data.errors?.length) reply += `\n\n[Warnings]:\n${data.errors.join('\n')}`;
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
      this.$.messages = [...this.$.messages, { role: 'system', text: `Error: ${err.message}` }];
    }
    this._setSending(false);
    if (this.ref.cellBg) this.ref.cellBg.toggle(false);
  }

  _syncComposerParamsFromDom() {
    if (!this.ref.composer) return false;
    let selects = this.ref.composer.querySelectorAll('.composer-footer-select');
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

  async _loadChat(chatId) {
    console.log('[AgentChat] _loadChat called with', chatId);
    this._loadedChatId = chatId;
    // Reset sending state — each chat manages its own task lifecycle independently.
    // The correct state will be restored below if the chat has a pendingTaskId.
    this._setSending(false);
    if (!chatId) {
      this.$.messages = [];
      this.$.chatName = 'New Chat';
      this.$.chatAdapter = 'pool';
      this.$.chatParams = {};
      this._sessionId = null;
      this.$.sessionMetaHtml = '';
      this._updateComposerFooter();
      return;
    }

    try {
      console.log('[AgentChat] Fetching /api/chats/get for', chatId);
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

      console.log('[AgentChat] Successfully loaded chat:', chat);
      this.$.chatName = chat.name || 'Chat';
      this.$.chatAdapter = chat.adapter || 'pool';
      // Filter out stale transient status messages (process artifacts, not conversation content)
      let msgs = (chat.messages || []).filter(m => {
        if (m.role !== 'system') return true;
        let t = m.text || '';
        return !t.startsWith(ICONS.WAIT) && !t.startsWith(ICONS.OK) && !t.startsWith(ICONS.WARN) && t !== 'Processing...';
      });
      this.$.messages = msgs;
      this._sessionId = chat.sessionId || null;
      
      // Load saved params — collect all non-base keys that have values
      let params = {};
      let baseProps = ['id', 'projectId', 'name', 'adapter', 'messages', 'sessionId', 'pendingTaskId', 'createdAt', 'updatedAt'];
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
        console.log(`[AgentChat] Resuming pending task: ${chat.pendingTaskId}`);
        this._setSending(true);
        this._wsClient.resume(chatId, chat.pendingTaskId);
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
    let container = this.querySelector('.chat-messages');
    if (!container) return;

    // Remove existing status indicator
    let existing = container.querySelector('.live-status-indicator');
    if (existing) existing.remove();

    if (!meta) return;

    let indicator = document.createElement('div');
    indicator.className = 'live-status-indicator';

    let icon, text, spinClass;
    switch (meta.phase) {
      case 'thinking':
        icon = 'pending';
        spinClass = 'spin-icon';
        text = meta.thinkingStatus || 'Thinking…';
        break;
      case 'tool':
        icon = 'build_circle';
        spinClass = 'spin-icon';
        text = `Running: ${escapeHtml(meta.lastToolName || 'tool')}`;
        break;
      case 'responding':
        icon = 'edit_note';
        spinClass = '';
        text = 'Writing response…';
        break;
      default:
        icon = 'pending';
        spinClass = 'spin-icon';
        text = 'Processing…';
    }

    indicator.innerHTML = `<span class="material-symbols-outlined ${spinClass}" style="font-size:14px">${icon}</span> <span>${text}</span>`;
    container.appendChild(indicator);

    // Auto-scroll
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
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
          let card = boardEl.querySelector(`[data-task-id="${taskId}"]`);
          if (!card || !task) continue;

          let status = task.status || 'running';
          let isDone = status === 'done' || status === 'error' || status === 'cancelled' || status === 'lost';

          card.dataset.status = isDone ? status : 'running';

          // Update header icon
          let headerEl = card.querySelector('.delegation-card-header');
          if (headerEl) {
            let icon = isDone
              ? (status === 'done' ? 'check_circle' : 'error')
              : 'pending';
            let spin = isDone ? '' : 'spin-icon';
            let iconColor = status === 'done' ? 'color:var(--sn-success-color)' : status === 'error' ? 'color:var(--sn-danger-color)' : '';
            headerEl.querySelector('.material-symbols-outlined').className = `material-symbols-outlined ${spin}`;
            headerEl.querySelector('.material-symbols-outlined').textContent = icon;
            if (iconColor) headerEl.querySelector('.material-symbols-outlined').setAttribute('style', iconColor);
          }

          // Update status text
          let statusEl = card.querySelector('.delegation-card-status');
          if (statusEl) {
            if (isDone) {
              statusEl.textContent = status === 'done' ? 'Completed' : status === 'error' ? 'Failed' : 'Cancelled';
            } else {
              let elapsed = task.updatedAt ? formatElapsed(Math.round((Date.now() - (task.startedAt || task.updatedAt)) / 1000)) : '';
              statusEl.textContent = `Running${elapsed ? ' · ' + elapsed : ''}`;
            }
          }

          // Link card to associated chat when resolved
          if (task.chatId && !card.dataset.chatId) {
            card.dataset.chatId = task.chatId;
            card.classList.add('delegation-card-linked');
            let titleEl = card.querySelector('.card-title');
            if (titleEl && task.chatName) {
              titleEl.textContent = task.chatName;
            }
          }

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
