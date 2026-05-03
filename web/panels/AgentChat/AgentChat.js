import { Symbiote, PubSub } from "@symbiotejs/symbiote";
import { state as dashState, events as dashEvents, emit as dashEmit } from "../../dashboard-state.js";
import { setGlobalParam, parseQuery, getRoute } from 'symbiote-node';
import template from './AgentChat.tpl.js';
import css from "./AgentChat.css.js";
import '../../common/CellBg/CellBg.js';
import { uiPrompt } from '../../common/ui-dialogs.js';
import { replaceIconsWithHtml, ICONS } from '../../common/icons.js';

const STORAGE_KEY_CHAT_NAV = 'sn-chat-nav-collapsed';

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
    inputVal: "",
    chatName: "Select a chat",
    chatAdapter: "",
    adapterMeta: {},
    adapterOptionsHtml: '',
    composerFooterHtml: '',
    chatParams: {},
    attachedContext: [],
    navCollapsed: false,
    isInputDisabled: true,
    inputPlaceholder: "Ask anything, @ to mention, / for workflows",
    sessionMetaHtml: '',

    onKeyDown: (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._sendMessage();
      }
      if (e.key === 'Escape') this._hideAutocomplete();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (this._acVisible) {
          e.preventDefault();
          this._navigateAutocomplete(e.key === 'ArrowDown' ? 1 : -1);
        }
      }
      if (e.key === 'Tab' && this._acVisible) {
        e.preventDefault();
        this._selectAutocomplete();
      }
    },

    onInput: (e) => {
      let ta = e.target;
      this.$.inputVal = ta.value;
      // Auto-grow
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
      // Autocomplete trigger
      this._checkAutocomplete(ta.value, ta.selectionStart);
    },

    onSend: () => {
      this._sendMessage();
    },

    onToggleNav: () => {
      this.$.navCollapsed = !this.$.navCollapsed;
    },

    onNewChat: () => {
      this._createChat();
    },

    onParamChangeDelegated: (e) => {
      let select = e.target;
      if (!select || !select.classList.contains('composer-footer-select')) return;
      
      let id = select.dataset.param;
      let val = select.value;

      let currentParams = this.$.chatParams || {};
      let updatedParams = { ...currentParams, [id]: val };

      // Cascade: when provider changes, reset model
      if (id === 'provider') {
        delete updatedParams.model;
      }

      this.$.chatParams = updatedParams;

      let chatId = dashState.activeChatId;
      if (chatId) {
        let saveData = { id: chatId, [id]: val };
        if (id === 'provider') saveData.model = null;
        fetch('/api/chats/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(saveData)
        });
      }
    },

    onAttachClick: async () => {
      let path = await uiPrompt("Enter file or folder path to attach:");
      if (path && path.trim()) {
        this.$.attachedContext = [...this.$.attachedContext, { path: path.trim() }];
      }
    },

    onRemoveContext: (e) => {
      let path = e.target.dataset.path;
      let ctx = this.$.attachedContext.filter(c => c.path !== path);
      this.$.attachedContext = ctx;
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
        // Prevent duplicates
        let ctx = this.$.attachedContext || [];
        if (!ctx.find(c => c.path === path.trim())) {
          this.$.attachedContext = [...ctx, { path: path.trim() }];
        }
      }
    },
  };

  renderCallback() {
    // Restore collapsed state from localStorage
    if (typeof localStorage !== 'undefined') {
      let stored = localStorage.getItem(STORAGE_KEY_CHAT_NAV);
      if (stored === 'true') {
        this.$.navCollapsed = true;
      }
    }

    // Initial empty state
    queueMicrotask(() => this._updateEmptyState());

    // Reflect nav collapsed state and persist to localStorage
    this.sub('navCollapsed', (val) => {
      let nav = this.querySelector('.chat-nav');
      if (nav) nav.toggleAttribute('collapsed', val);

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_CHAT_NAV, String(val));
      }
    });

    // Fetch adapter metadata
    this._fetchAdapterMeta();

    // Fetch chats, then sync from URL — component is ready when fetch completes
    this._fetchChats().then(() => {
      console.log("[AgentChat] _fetchChats completed. Calling _syncChatFromRouter");
      this._syncChatFromRouter();
    });

    dashEvents.addEventListener('chats-updated', () => this._fetchChats());
    dashEvents.addEventListener('active-chat-changed', (e) => {
      console.log("[AgentChat] active-chat-changed received:", e.detail);
      this._loadChat(e.detail?.id);
      this._renderNavItems();
    });
    dashEvents.addEventListener('active-project-changed', () => this._renderNavItems());

    // Self-register with router: react to ?chat= URL param changes
    this.sub('ROUTER/query', (query) => {
      console.log("[AgentChat] ROUTER/query changed:", query);
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
  }

  _updateInputState() {
    let adapter = this.$.chatAdapter || "pool";
    let isModelRequired = adapter === "pool" || adapter === "opencode";
    let hasModel = !!this.$.chatParams?.model;
    
    let disabled = isModelRequired && !hasModel;
    this.$.isInputDisabled = disabled;
    this.$.inputPlaceholder = disabled 
      ? "Select a model to start..." 
      : "Ask anything, @ to mention, / for workflows";
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
      chips.push(`<span class="meta-chip"><span class="material-symbols-outlined" style="font-size:12px">${iconName}</span> ${this._esc(mode)}</span>`);
    }
    let exitMatch = text.match(/- Exit code:\s*(\d+)/i);
    if (exitMatch) {
      let code = parseInt(exitMatch[1]);
      let cls = code === 0 ? 'meta-ok' : 'meta-err';
      chips.push(`<span class="meta-chip ${cls}">exit ${code}</span>`);
    }
    let sidMatch = text.match(/- Session ID:\s*`([^`]+)`/i);
    if (sidMatch) {
      chips.push(`<span class="meta-chip meta-sid" title="${this._esc(sidMatch[1])}">${this._esc(sidMatch[1].substring(0, 12))}…</span>`);
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

  /* ── Autocomplete (@, /) ── */

  _acVisible = false;
  _acItems = [];
  _acIndex = -1;
  _acTrigger = null; // '@' or '/'
  _acStartPos = 0;

  _checkAutocomplete(value, cursorPos) {
    // Find trigger character before cursor
    let before = value.substring(0, cursorPos);
    let atMatch = before.match(/@([\w./\-]*)$/);
    let slashMatch = before.match(/^\/([\w]*)$/);

    if (atMatch) {
      this._acTrigger = '@';
      this._acStartPos = cursorPos - atMatch[0].length;
      this._showAutocomplete(atMatch[1]);
    } else if (slashMatch) {
      this._acTrigger = '/';
      this._acStartPos = 0;
      this._showAutocomplete(slashMatch[1]);
    } else {
      this._hideAutocomplete();
    }
  }

  async _showAutocomplete(query) {
    let items = [];
    if (this._acTrigger === '/') {
      // Workflows
      items = [
        { label: 'publish', hint: 'Cross-project publication', icon: 'rocket_launch' },
      ];
      if (query) items = items.filter(i => i.label.startsWith(query));
    } else if (this._acTrigger === '@') {
      // Files from project
      try {
        let res = await fetch('/api/files/list');
        if (res.ok) {
          let data = await res.json();
          items = (data.files || []).map(f => ({
            label: f.path || f, hint: f.type || 'file', icon: f.type === 'directory' ? 'folder' : 'description'
          }));
        }
      } catch (e) { console.warn('[AgentChat] file list fetch failed:', e.message); }
      // Fallback: allow typing arbitrary paths
      if (items.length === 0) {
        items = [{ label: query || 'path/to/file', hint: 'type a path', icon: 'description' }];
      }
      if (query) items = items.filter(i => i.label.toLowerCase().includes(query.toLowerCase()));
      items = items.slice(0, 12);
    }

    this._acItems = items;
    this._acIndex = items.length > 0 ? 0 : -1;
    this._renderAutocomplete();
  }

  _hideAutocomplete() {
    this._acVisible = false;
    this._acItems = [];
    this._acIndex = -1;
    let popup = this.ref.autocompletePopup;
    if (popup) popup.classList.remove('visible');
  }

  _renderAutocomplete() {
    let popup = this.ref.autocompletePopup;
    if (!popup) return;
    if (this._acItems.length === 0) {
      this._hideAutocomplete();
      return;
    }
    this._acVisible = true;
    let header = this._acTrigger === '@' ? 'Files' : 'Workflows';
    popup.innerHTML = `<div class="autocomplete-header">${header}</div>` +
      this._acItems.map((item, i) => `
        <div class="autocomplete-item${i === this._acIndex ? ' active' : ''}" data-index="${i}">
          <span class="material-symbols-outlined">${item.icon}</span>
          <span class="autocomplete-item-label">${this._esc(item.label)}</span>
          <span class="autocomplete-item-hint">${this._esc(item.hint)}</span>
        </div>
      `).join('');
    popup.classList.add('visible');

    // Click handler
    popup.onclick = (e) => {
      let el = e.target.closest('.autocomplete-item');
      if (el) {
        this._acIndex = parseInt(el.dataset.index);
        this._selectAutocomplete();
      }
    };
  }

  _navigateAutocomplete(dir) {
    if (this._acItems.length === 0) return;
    this._acIndex = (this._acIndex + dir + this._acItems.length) % this._acItems.length;
    this._renderAutocomplete();
  }

  _selectAutocomplete() {
    let item = this._acItems[this._acIndex];
    if (!item) return;

    let ta = this.ref.chatInput;
    let value = ta.value;

    if (this._acTrigger === '@') {
      // Insert file as context attachment
      let before = value.substring(0, this._acStartPos);
      let after = value.substring(ta.selectionStart);
      ta.value = before + after;
      this.$.inputVal = ta.value;
      // Add to attachedContext
      let ctx = this.$.attachedContext || [];
      if (!ctx.find(c => c.path === item.label)) {
        this.$.attachedContext = [...ctx, { path: item.label }];
      }
    } else if (this._acTrigger === '/') {
      // Insert workflow command
      ta.value = '/' + item.label + ' ';
      this.$.inputVal = ta.value;
    }

    this._hideAutocomplete();
    ta.focus();
  }

  /** Simple HTML entity escaper for user-facing text in innerHTML */
  _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /** Format seconds into human-readable elapsed time */
  _formatElapsed(sec) {
    if (sec < 60) return `${sec}s`;
    let m = Math.floor(sec / 60);
    let s = sec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
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
    let adapter = this.$.chatAdapter || "pool";
    let meta = this.$.adapterMeta || {};
    let currentParams = this.$.chatParams || {};
    let paramsToMap = [];

    if (adapter === 'pool') {
      let providers = Object.keys(meta).filter(k => k !== 'pool');
      let currentProvider = currentParams.provider ?? providers[0];

      paramsToMap.push({
        id: 'provider', label: 'Provider', type: 'select', options: providers
      });

      if (currentProvider && meta[currentProvider]?.parameters) {
        paramsToMap.push(...meta[currentProvider].parameters);
      }

      if (meta.pool?.parameters) {
        paramsToMap.push(...meta.pool.parameters);
      }
    } else if (adapter && meta[adapter]?.parameters) {
      paramsToMap = [...meta[adapter].parameters];
    }

    this._updatingOptions = true;
    if (paramsToMap.length > 0) {
      let htmlStr = paramsToMap.map(p => {
        if (p.type === 'select' && Array.isArray(p.options)) {
          let paramValue = currentParams[p.id];
          if (!paramValue && p.options.length > 0 && p.id !== 'model') {
            let firstOpt = p.options[0];
            paramValue = typeof firstOpt === 'string' ? firstOpt : firstOpt.val;
            // Persist visual default back to chatParams so it's included in send
            if (paramValue) {
              currentParams[p.id] = paramValue;
              this.$.chatParams = { ...currentParams };
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
            return `<option value="${this._esc(val)}" ${sel}>${this._esc(text)}</option>`;
          }).join('');
          
          let disabledAttr = '';
          if (p.id === 'provider' && this.$.messages && this.$.messages.length > 0) {
            disabledAttr = 'disabled title="Locked"';
          }

          let iconName = p.id === 'provider' ? 'dns' : p.id === 'model' ? 'smart_toy' : 'tune';
          
          return `<span class="composer-footer-btn"><span class="material-symbols-outlined">${iconName}</span><select class="composer-footer-select" data-param="${this._esc(p.id)}" ${disabledAttr}>${optionsHtml}</select></span>`;
        }
        return '';
      }).join('');
      this.$.composerFooterHtml = htmlStr;
    } else {
      this.$.composerFooterHtml = '';
    }
    this._updatingOptions = false;
  }

  _syncChatFromRouter() {
    let route = getRoute();
    let globals = parseQuery(route.query || '');
    let chatId = globals.chat || null;
    console.log("[AgentChat] _syncChatFromRouter: route=", route, "chatId=", chatId, "dashState.activeChatId=", dashState.activeChatId);

    if (chatId && chatId !== dashState.activeChatId) {
      console.log("[AgentChat] Emitting active-chat-changed for", chatId);
      dashState.activeChatId = chatId;
      dashEmit('active-chat-changed', { id: chatId, fromRoute: true });
    }
  }

  _formatMarkdown(text) {
    if (!text) return '';
    let html = this._escapeHtml(text);
    
    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre class="markdown-pre"><code>$1</code></pre>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="markdown-code">$1</code>');
    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="markdown-link">$1</a>');
    // Newlines
    html = html.split('\n').join('<br>');
    // Restore newlines inside pre
    html = html.replace(/<pre class="markdown-pre"><code>([\s\S]*?)<\/code><\/pre>/g, (match, p1) => {
      return `<pre class="markdown-pre"><code>${p1.split('<br>').join('\n')}</code></pre>`;
    });

    // Icons
    html = replaceIconsWithHtml(html);

    return html;
  }

  _renderMessages() {
    let container = this.querySelector('.chat-messages');
    if (!container) return;
    
    // Check if user has scrolled up
    let isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 10;
    
    container.innerHTML = '';

    let messages = this.$.messages || [];
    for (let msg of messages) {
      let div = document.createElement('div');
      div.className = `message ${msg.role}`;
      if (msg.streaming) div.classList.add('streaming');

      if (msg.role === 'tool') {
        // Tool call card
        let details = document.createElement('details');
        details.className = 'tool-card';
        if (msg.streaming) details.setAttribute('open', ''); // Auto-open while running

        let summary = document.createElement('summary');
        summary.className = 'tool-header';
        
        let icon = msg.streaming ? 'build_circle' : 'build';
        let spinClass = msg.streaming ? 'spin-icon' : '';
        summary.innerHTML = `<span class="material-symbols-outlined ${spinClass}" style="font-size:14px">${icon}</span> ${this._escapeHtml(msg.name || 'tool')}`;
        details.appendChild(summary);

        if (msg.input) {
          let inputBlock = document.createElement('div');
          inputBlock.className = 'tool-section';
          inputBlock.innerHTML = `<div class="tool-label">Input</div><pre class="tool-code">${this._escapeHtml(typeof msg.input === 'string' ? msg.input : JSON.stringify(msg.input, null, 2))}</pre>`;
          details.appendChild(inputBlock);
        }

        if (msg.result) {
          let resultBlock = document.createElement('div');
          resultBlock.className = 'tool-section';
          let resultText = typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result, null, 2);
          // Truncate long results
          let truncated = resultText.length > 500 ? resultText.slice(0, 500) + '\n...' : resultText;
          resultBlock.innerHTML = `<div class="tool-label">Result</div><pre class="tool-code">${this._escapeHtml(truncated)}</pre>`;
          details.appendChild(resultBlock);
        } else if (msg.streaming) {
          let waitBlock = document.createElement('div');
          waitBlock.className = 'tool-section tool-waiting';
          waitBlock.innerHTML = `<em>Running...</em>`;
          details.appendChild(waitBlock);
        }

        div.appendChild(details);
      } else if (msg.role === 'thinking') {
        // "Thinking for Xs" / "Worked for Xm" collapsible
        let details = document.createElement('details');
        details.className = msg.done ? 'work-summary' : 'thinking-block';
        if (!msg.done) details.setAttribute('open', '');

        let summary = document.createElement('summary');
        let label = msg.done ? 'Worked for' : 'Thinking for';
        let timeStr = this._formatElapsed(msg.elapsed || 0);
        if (msg.done) {
          summary.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;color:hsl(140,40%,50%)">check_circle</span>${label} ${timeStr}`;
        } else {
          let statusHtml = msg.status ? `<span class="thinking-status">${this._escapeHtml(msg.status)}</span>` : '';
          summary.innerHTML = `<span class="material-symbols-outlined spin-icon" style="font-size:16px">pending</span>${label} ${timeStr}${statusHtml}`;
        }
        details.appendChild(summary);

        if (msg.done && msg.meta) {
          let body = document.createElement('div');
          body.className = 'work-body';
          let items = [];
          if (msg.meta.mode) {
            let iconName = msg.meta.mode === 'yolo' ? 'bolt' : 'settings';
            items.push(`<span class="meta-chip"><span class="material-symbols-outlined" style="font-size:12px">${iconName}</span> ${this._escapeHtml(msg.meta.mode)}</span>`);
          }
          if (msg.meta.exitCode != null) {
            let cls = msg.meta.exitCode === 0 ? 'meta-ok' : 'meta-err';
            items.push(`<span class="meta-chip ${cls}">exit ${msg.meta.exitCode}</span>`);
          }
          if (msg.meta.sessionId) items.push(`<span class="meta-chip meta-sid" title="${this._escapeHtml(msg.meta.sessionId)}">${this._escapeHtml(msg.meta.sessionId.substring(0, 16))}\u2026</span>`);
          if (msg.meta.tools) items.push(`<span class="meta-chip">${msg.meta.tools} tool call${msg.meta.tools > 1 ? 's' : ''}</span>`);
          if (msg.meta.errors) items.push(`<span class="meta-chip meta-err">${this._escapeHtml(msg.meta.errors)}</span>`);
          body.innerHTML = items.join('');
          details.appendChild(body);
        }

        div.appendChild(details);
      } else {
        // Regular text message
        let content = document.createElement('div');
        content.className = 'msg-content';
        content.innerHTML = this._formatMarkdown(msg.text);
        if (msg.streaming) {
          let cursor = document.createElement('span');
          cursor.className = 'streaming-cursor';
          content.appendChild(cursor);
        }
        div.appendChild(content);
      }

      container.appendChild(div);
    }

    requestAnimationFrame(() => {
      if (isAtBottom) {
        container.scrollTop = container.scrollHeight;
      }
    });
  }


  _escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async _fetchChats() {
    try {
      let res = await fetch('/api/chats');
      let data = await res.json();
      dashState.chats = data.chats || [];
      this._renderNavItems();
    } catch (err) {
      console.error('[AgentChat] fetch chats error:', err);
    }
  }

  _renderNavItems() {
    let container = this.querySelector('.chat-items');
    if (!container) return;
    container.innerHTML = '';

    let chats = dashState.chats || [];

    let projectId = dashState.activeProjectId;
    if (projectId) {
      // Project scope: show ONLY chats bound to this project
      chats = chats.filter(c => c.projectId === projectId);
    }
    // Home scope (no projectId): show ALL chats from all projects

    // Build parent-child map
    let childMap = new Map(); // parentId → [chat, ...]
    let rootChats = [];

    for (let chat of chats) {
      if (chat.parentChatId) {
        if (!childMap.has(chat.parentChatId)) {
          childMap.set(chat.parentChatId, []);
        }
        childMap.get(chat.parentChatId).push(chat);
      } else {
        rootChats.push(chat);
      }
    }

    for (let chat of rootChats) {
      let children = childMap.get(chat.id) || [];
      let hasChildren = children.length > 0;

      this._renderChatItem(container, chat, hasChildren, false);

      if (hasChildren) {
        let subContainer = document.createElement('div');
        subContainer.className = 'chat-sub-items';
        subContainer.dataset.parent = chat.id;

        for (let child of children) {
          this._renderChatItem(subContainer, child, false, true);
        }
        container.appendChild(subContainer);
      }
    }

    // Orphan children (parent deleted) — show as root
    for (let [parentId, children] of childMap) {
      if (rootChats.some(c => c.id === parentId)) continue;
      for (let child of children) {
        this._renderChatItem(container, child, false, false);
      }
    }
  }

  _renderChatItem(container, chat, hasChildren, isChild) {
    let div = document.createElement('div');
    div.className = 'chat-item';
    if (isChild) div.classList.add('chat-item-child');
    if (chat.id === dashState.activeChatId) div.setAttribute('active', '');

    let expandHtml = '';
    if (hasChildren) {
      expandHtml = `<span class="material-symbols-outlined chat-expand-icon">chevron_right</span>`;
    }

    let icon = isChild ? 'subdirectory_arrow_right' : 'chat';

    div.innerHTML = `
      ${expandHtml}
      <span class="material-symbols-outlined">${icon}</span>
      <span class="chat-item-label">${chat.name}</span>
      <span class="chat-item-adapter">${chat.adapter}</span>
      <button class="chat-item-delete" title="Delete">×</button>
    `;

    // Expand/collapse children
    if (hasChildren) {
      div.querySelector('.chat-expand-icon').addEventListener('click', (e) => {
        e.stopPropagation();
        let subContainer = container.querySelector(`.chat-sub-items[data-parent="${chat.id}"]`);
        if (!subContainer) return;
        let isExpanded = subContainer.hasAttribute('expanded');
        subContainer.toggleAttribute('expanded', !isExpanded);
        div.classList.toggle('chat-item-expanded', !isExpanded);
      });
    }

    div.addEventListener('click', (e) => {
      if (e.target.closest('.chat-item-delete')) return;
      if (e.target.closest('.chat-expand-icon')) return;
      dashState.activeChatId = chat.id;
      setGlobalParam('chat', chat.id);
      dashEmit('active-chat-changed', { id: chat.id });
    });

    div.querySelector('.chat-item-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      await fetch('/api/chats/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: chat.id }),
      });
      if (dashState.activeChatId === chat.id) {
        dashState.activeChatId = null;
        setGlobalParam('chat', null);
        dashEmit('active-chat-changed', { id: null });
      }
      this._fetchChats();
    });

    container.appendChild(div);
  }

  async _createChat() {
    console.log('[AgentChat] _createChat called!', new Error().stack);
    let adapter = dashState.globalCli?.defaultAdapter || 'pool';
    let projectId = dashState.activeProjectId || null;
    let projectName = null;

    if (projectId) {
      let proj = (dashState.projectHistory || []).find(p => p.id === projectId);
      projectName = proj?.name;
    }

    let name = projectName ? `${projectName} — Chat` : 'New Chat';

    try {
      let res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, name, adapter }),
      });
      let data = await res.json();
      if (data.ok) {
        dashState.activeChatId = data.id;
        setGlobalParam('chat', data.id);
        dashEmit('active-chat-changed', { id: data.id });
        await this._fetchChats();
      }
    } catch (err) {
      console.error('[AgentChat] create chat error:', err);
    }
  }

  async _sendMessage() {
    console.log('[AgentChat] _sendMessage called!', new Error().stack);
    let chatId = dashState.activeChatId;

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
          this._fetchChats();
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
    if (this.ref.composer) {
      let selects = this.ref.composer.querySelectorAll('.composer-footer-select');
      let paramsObj = { ...this.$.chatParams };
      let hasChanges = false;
      for (let select of selects) {
        let id = select.dataset.param;
        // Don't sync empty values like '-- Model --'
        if (select.value && select.value !== '' && paramsObj[id] !== select.value) {
          paramsObj[id] = select.value;
          hasChanges = true;
        }
      }
      if (hasChanges) {
        this.$.chatParams = paramsObj;
        fetch('/api/chats/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: chatId, ...paramsObj })
        });
      }
    }

    // Prepend context if present
    if (this.$.attachedContext && this.$.attachedContext.length > 0) {
      let contextText = '[Attached Context]:\n' + this.$.attachedContext.map(c => `- ${c.path}`).join('\n') + '\n\n';
      prompt = contextText + prompt;
    }

    this.$.messages = [...this.$.messages, { role: "user", text: prompt }];
    this.$.inputVal = "";
    this.$.attachedContext = []; // Clear context after send
    if (this.ref.chatInput) {
      this.ref.chatInput.value = '';
      this.ref.chatInput.style.height = 'auto';
    }
    this._setSending(true);

    // Persist
    await fetch("/api/chats/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, role: "user", text: prompt }),
    });

    try {
      let adapter = this.$.chatAdapter || "pool";
      let reply = "";
      let structuredEvents = null;

      if (adapter === "pool") {
        if (this.ref.cellBg) this.ref.cellBg.toggle(true);

        reply = await this._sendViaWs(chatId, prompt);

        // _sendViaWs handles thinking block, final messages, and persistence
      } else {
        this.$.messages = [...this.$.messages, { role: "system", text: "Processing..." }];
        if (this.ref.cellBg) this.ref.cellBg.toggle(true);

        let payload = { type: adapter, prompt, timeout: 300, ...this.$.chatParams };
        let res = await fetch("/api/adapter/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        let data = await res.json();
        this.$.messages = this.$.messages.filter(m => m.text !== "Processing...");

        if (data.error) {
          reply = `Error: ${data.error}`;
        } else {
          reply = data.response;
          structuredEvents = data.events;
        }
        if (data.errors?.length) reply += `\n\n[Warnings]:\n${data.errors.join('\n')}`;
      }

      // If we got structured events from HTTP adapter, render them
      if (adapter !== "pool") {
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
          this.$.messages = [...this.$.messages, { role: "agent", text: reply }];
        }
      } else {
        // Pool adapter: Handler in _sendViaWs already merged the final result
        // into the last streamed agent message. Nothing to do here.
      }

      // Persist the full chat state (pool adapter persists inside _sendViaWs handler)
      if (adapter !== 'pool') {
        await fetch("/api/chats/messages", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, messages: this.$.messages }),
        });
        dashEmit("chats-updated");
      }
    } catch (err) {
      this.$.messages = [...this.$.messages, { role: "system", text: `Error: ${err.message}` }];
    }
    this._setSending(false);
    if (this.ref.cellBg) this.ref.cellBg.toggle(false);
  }

  /**
   * Ensure a WebSocket connection to /ws/chat is open.
   * Reuses existing connection if alive.
   */
  _ensureChatWs() {
    if (this._chatWs && this._chatWs.readyState === WebSocket.OPEN) return this._chatWs;
    if (this._chatWs) {
      try { this._chatWs.close(); } catch (e) { /* already closed */ }
    }

    let base = new URL('.', location.href).href.replace(/^http/, 'ws');
    this._chatWs = new WebSocket(`${base}ws/chat`);
    this._chatWs.onclose = () => { this._chatWs = null; };
    this._chatWs.onerror = () => {};
    return this._chatWs;
  }

  /**
   * Send a prompt via WebSocket and wait for the final response.
   * Streams progress events to the UI in real-time.
   *
   * @param {string} chatId
   * @param {string} prompt
   * @returns {Promise<string>} Final reply text
   */
  _sendViaWs(chatId, prompt) {
    return new Promise((resolve, reject) => {
      let ws = this._ensureChatWs();
      let startTime = Date.now();
      
      // Insert a "thinking" block that updates in-place
      let thinkingMsg = { role: 'thinking', elapsed: 0, done: false };
      this.$.messages = [...this.$.messages, thinkingMsg];

      let timerInterval = setInterval(() => {
        thinkingMsg.elapsed = Math.round((Date.now() - startTime) / 1000);
        // Trigger re-render by reassigning array
        this.$.messages = [...this.$.messages];
      }, 1000);

      let send = () => {
        let params = { chatId, prompt, timeout: 600, ...this.$.chatParams };
        if (this._sessionId) params.sessionId = this._sessionId;
        console.log('[AgentChat] WS send params:', JSON.stringify(params));
        ws.send(JSON.stringify({ method: 'chat.send', params }));
      };

      let isFinished = false;

      let onClose = () => {
        if (isFinished) return;
        isFinished = true;
        clearInterval(timerInterval);
        ws.removeEventListener('message', onMessage);
        
        let crashMsg = `${ICONS.WAIT} Process crashed or connection closed unexpectedly.`;
        
        // Remove thinking block and streaming flags
        this.$.messages = this.$.messages
          .filter(m => !(m.role === 'thinking' && !m.done))
          .map(m => ({ ...m, streaming: false }));
          
        this.$.messages = [...this.$.messages, { role: 'system', text: crashMsg }];
        if (this.ref.cellBg) this.ref.cellBg.toggle(false);
        
        resolve(crashMsg);
      };
      ws.addEventListener('close', onClose);

      let onMessage = (e) => {
        try {
          let msg = JSON.parse(e.data);
          
          switch (msg.method) {
            case 'chat.delegated':
              break;

            case 'chat.event': {
              let ev = msg.params?.event;
              if (!ev) break;
              
              // Live streaming logic
              if (ev.type === 'message' && ev.role === 'system') {
                // Merge status into the thinking block instead of separate messages
                let msgs = [...this.$.messages];
                let thinkingIdx = msgs.findIndex(m => m.role === 'thinking' && !m.done);
                if (thinkingIdx >= 0) {
                  msgs[thinkingIdx].status = ev.content || '';
                } else {
                  // Fallback: no thinking block yet, add as system message
                  msgs.push({ role: 'system', text: ev.content || '' });
                }
                this.$.messages = msgs;
              } else if (ev.type === 'message' && ev.role === 'assistant') {
                let msgs = [...this.$.messages];
                let lastMsg = msgs[msgs.length - 1];
                if (!lastMsg || lastMsg.role !== 'agent' || !lastMsg.streaming) {
                  msgs.push({ role: 'agent', text: ev.content || '', streaming: true });
                } else {
                  lastMsg.text += (ev.content || '');
                }
                this.$.messages = msgs;
              } else if (ev.type === 'tool_use') {
                let msgs = [...this.$.messages];
                msgs.push({
                  role: 'tool',
                  name: ev.name || ev.tool_name,
                  input: ev.parameters || ev.arguments,
                  result: null,
                  streaming: true
                });
                this.$.messages = msgs;
              } else if (ev.type === 'tool_result') {
                let msgs = [...this.$.messages];
                for (let i = msgs.length - 1; i >= 0; i--) {
                  if (msgs[i].role === 'tool' && msgs[i].streaming) {
                    msgs[i].result = ev.output || ev.status;
                    msgs[i].streaming = false;
                    break;
                  }
                }
                this.$.messages = msgs;
              }
              break;
            }

            case 'chat.done': {
              isFinished = true;
              clearInterval(timerInterval);
              ws.removeEventListener('message', onMessage);
              ws.removeEventListener('close', onClose);
              
              // Remove streaming flags from all messages
              this.$.messages = this.$.messages.map(m => ({ ...m, streaming: false }));
              
              let text = msg.params?.text || '';

              // Extract and persist sessionId
              let sessionMatch = text.match(/Session ID:\s*`([a-f0-9-]+)`/);
              if (sessionMatch) {
                this._sessionId = sessionMatch[1];
                fetch("/api/chats/session", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chatId, sessionId: this._sessionId }),
                }).catch(() => {});
              }

              // Remove system status messages and the thinking block
              this.$.messages = this.$.messages.filter(m => 
                !(m.role === 'system' && (m.text.startsWith(ICONS.WAIT) || m.text.startsWith(ICONS.OK)))
                && !(m.role === 'thinking' && !m.done)
              );

              // Parse metadata from the formatted result.
              let meta = {};
              if (text) {
                let lastAgent = [...this.$.messages].reverse().find(m => m.role === 'agent');
                if (!lastAgent) {
                  let bodyMatch = text.match(/## Agent Response\n+([\s\S]*?)(?=\n+(?:---|## Tools Used|## Errors|## Stats)|$)/i);
                  let body = bodyMatch ? bodyMatch[1].trim() : text;
                  this.$.messages.push({ role: 'agent', text: body });
                }

                let modeMatch = text.match(/- Mode:\s*(.+)/i);
                if (modeMatch) meta.mode = modeMatch[1].trim();
                let sidMatch = text.match(/- Session ID:\s*`([^`]+)`/i);
                if (sidMatch) meta.sessionId = sidMatch[1];
                let exitMatch = text.match(/- Exit code:\s*(\d+)/i);
                if (exitMatch) meta.exitCode = parseInt(exitMatch[1]);
                let toolsMatch = text.match(/## Tools Used \((\d+)\)/i);
                if (toolsMatch) meta.tools = parseInt(toolsMatch[1]);
                let errorsMatch = text.match(/## Errors\n+([\s\S]*?)(?=\n+##|$)/i);
                if (errorsMatch) meta.errors = errorsMatch[1].trim();
                let failMatch = text.match(/## \[ERR\] Agent Failed[\s\S]*?(?=\n+##|$)/i);
                if (failMatch) meta.errors = failMatch[0].trim();

                // Update header meta
                this.$.sessionMetaHtml = this._buildSessionMetaHtml(text);
              }

              // Insert "Worked for Xm" summary block
              let elapsedSec = Math.round((Date.now() - startTime) / 1000);
              this.$.messages.push({
                role: 'thinking',
                elapsed: elapsedSec,
                done: true,
                meta: Object.keys(meta).length > 0 ? meta : null
              });

              if (this.ref.cellBg) this.ref.cellBg.toggle(false);

              // Persist final state
              fetch("/api/chats/messages", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chatId, messages: this.$.messages }),
              }).catch(() => {});
              dashEmit("chats-updated");

              // Resolve with empty — _sendMessage should NOT add another message
              resolve('');
              break;
            }

            case 'chat.error': {
              isFinished = true;
              clearInterval(timerInterval);
              ws.removeEventListener('message', onMessage);
              ws.removeEventListener('close', onClose);
              
              // Remove streaming flags from all messages
              this.$.messages = this.$.messages.map(m => ({ ...m, streaming: false }));
              
              let errText = msg.params?.text || msg.params?.error || 'Unknown error';

              // Extract sessionId even from error responses
              let errSessionMatch = errText.match(/Session ID:\s*`([a-f0-9-]+)`/);
              if (errSessionMatch) {
                this._sessionId = errSessionMatch[1];
                fetch("/api/chats/session", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chatId, sessionId: this._sessionId }),
                }).catch(() => {});
              }

              // Remove streaming text blocks, finalize tool blocks
              let finalMessages = [];
              for (let m of this.$.messages) {
                if (m.role === 'tool') {
                  finalMessages.push({ ...m, streaming: false });
                } else if (!m.streaming) {
                  finalMessages.push(m);
                }
              }
              this.$.messages = finalMessages;

              resolve(errText);
              break;
            }
          }
        } catch (e) { console.error('[AgentChat] WS message parse error:', e); }
      };

      ws.addEventListener('message', onMessage);

      // Timeout safety net (10 minutes)
      let timeout = setTimeout(() => {
        clearInterval(timerInterval);
        ws.removeEventListener('message', onMessage);
        resolve('');
      }, 600_000);

      // If WS is already open — send immediately, else wait for open
      if (ws.readyState === WebSocket.OPEN) {
        send();
      } else {
        ws.addEventListener('open', () => send(), { once: true });
        ws.addEventListener('error', () => {
          clearInterval(timerInterval);
          ws.removeEventListener('message', onMessage);
          reject(new Error('WebSocket connection failed'));
        }, { once: true });
      }
    });
  }

  async _loadChat(chatId) {
    console.log("[AgentChat] _loadChat called with", chatId);
    if (!chatId) {
      this.$.messages = [];
      this.$.chatName = "New Chat";
      this.$.chatAdapter = "pool";
      this.$.chatParams = {};
      this._sessionId = null;
      this.$.sessionMetaHtml = '';
      this._updateComposerFooter();
      return;
    }

    try {
      console.log("[AgentChat] Fetching /api/chats/get for", chatId);
      let res = await fetch("/api/chats/get", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: chatId }),
      });
      if (!res.ok) {
        console.error("[AgentChat] Server error:", res.status);
        this.$.messages = [{ role: "system", text: `Server error: ${res.status}` }];
        return;
      }
      let chat = await res.json();
      if (chat.error) {
        console.error("[AgentChat] API error:", chat.error);
        this.$.messages = [{ role: "system", text: chat.error }];
        return;
      }

      console.log("[AgentChat] Successfully loaded chat:", chat);
      this.$.chatName = chat.name || "Chat";
      this.$.chatAdapter = chat.adapter || "pool";
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
        this._resumeTask(chatId, chat.pendingTaskId);
      }
      
    } catch (err) {
      console.error("[AgentChat] Catch error:", err);
      this.$.messages = [{ role: "system", text: `Load error: ${err.message}` }];
    }
  }

  /**
   * Resume subscription to an in-flight task after browser reload.
   * Opens a WS, sends chat.resume, and handles streaming events + final result.
   */
  _resumeTask(chatId, taskId) {
    // Show status
    this.$.messages = [...this.$.messages, { role: 'system', text: `${ICONS.WAIT} Reconnecting to running task...` }];
    if (this.ref.cellBg) this.ref.cellBg.toggle(true);

    let ws = this._ensureChatWs();

    let send = () => {
      ws.send(JSON.stringify({ method: 'chat.resume', params: { chatId, taskId } }));
    };

    if (ws.readyState === WebSocket.OPEN) {
      send();
    } else {
      ws.addEventListener('open', send, { once: true });
    }

    let onMessage = (e) => {
      try {
        let msg = JSON.parse(e.data);
        switch (msg.method) {
          case 'chat.resumed': {
            let msgs = [...this.$.messages];
            let last = msgs[msgs.length - 1];
            let isRunning = msg.params?.status === 'running';
            if (last && last.role === 'system' && last.text.startsWith(`${ICONS.WAIT} Reconnecting`)) {
              last.text = isRunning 
                ? `${ICONS.OK} Reconnected — task still running...`
                : `${ICONS.WAIT} Task status unknown, waiting...`;
            }
            this.$.messages = msgs;
            break;
          }

          case 'chat.event': {
            let ev = msg.params?.event;
            if (!ev) break;
            if (ev.type === 'message' && ev.role === 'system') {
              let msgs = [...this.$.messages];
              let last = msgs[msgs.length - 1];
              if (last && last.role === 'system') {
                last.text = ev.content || '';
              } else {
                msgs.push({ role: 'system', text: ev.content || '' });
              }
              this.$.messages = msgs;
            } else if (ev.type === 'message' && ev.role === 'assistant') {
              let msgs = [...this.$.messages];
              let last = msgs[msgs.length - 1];
              if (!last || last.role !== 'agent' || !last.streaming) {
                msgs.push({ role: 'agent', text: ev.content || '', streaming: true });
              } else {
                last.text += (ev.content || '');
              }
              this.$.messages = msgs;
            } else if (ev.type === 'tool_use') {
              let msgs = [...this.$.messages];
              msgs.push({ role: 'tool', name: ev.name || ev.tool_name, input: ev.parameters || ev.arguments, result: null, streaming: true });
              this.$.messages = msgs;
            } else if (ev.type === 'tool_result') {
              let msgs = [...this.$.messages];
              for (let i = msgs.length - 1; i >= 0; i--) {
                if (msgs[i].role === 'tool' && msgs[i].streaming) {
                  msgs[i].result = ev.output || ev.status;
                  msgs[i].streaming = false;
                  break;
                }
              }
              this.$.messages = msgs;
            }
            break;
          }

          case 'chat.done': {
            ws.removeEventListener('message', onMessage);
            this.$.messages = this.$.messages.map(m => ({ ...m, streaming: false }));
            if (this.ref.cellBg) this.ref.cellBg.toggle(false);

            let text = msg.params?.text || '';
            let sessionMatch = text.match(/Session ID:\s*`([a-f0-9-]+)`/);
            if (sessionMatch) {
              this._sessionId = sessionMatch[1];
              fetch("/api/chats/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chatId, sessionId: this._sessionId }),
              }).catch(() => {});
            }

            // Remove system status messages, add final reply
            let cleaned = this.$.messages.filter(m => !(m.role === 'system' && (m.text.startsWith(ICONS.WAIT) || m.text.startsWith(ICONS.OK))));
            if (text) cleaned.push({ role: 'agent', text });
            this.$.messages = cleaned;

            fetch("/api/chats/messages", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chatId, messages: this.$.messages }),
            }).catch(() => {});

            dashEmit("chats-updated");
            this._setSending(false);
            this._updateEmptyState();
            break;
          }

          case 'chat.error': {
            ws.removeEventListener('message', onMessage);
            this.$.messages = this.$.messages.map(m => ({ ...m, streaming: false }));
            if (this.ref.cellBg) this.ref.cellBg.toggle(false);
            let errText = msg.params?.text || msg.params?.error || 'Task failed';
            
            // If it's a "lost task" error, just show a temporary system message
            if (errText.includes('lost')) {
              this.$.messages = [...this.$.messages, { role: 'system', text: `${ICONS.WARN} ${errText}` }];
              // Clear pending task ID from backend
              fetch("/api/chats/messages", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chatId, messages: this.$.messages }),
              }).catch(() => {});
            } else {
              this.$.messages = [...this.$.messages, { role: 'system', text: `Error: ${errText}` }];
            }
            
            this._setSending(false);
            this._updateEmptyState();
            break;
          }
        }
      } catch (e) { console.error('[AgentChat] WS message parse error:', e); }
    };
    ws.addEventListener('message', onMessage);
  }
}

AgentChat.template = template;
AgentChat.rootStyles = css;
AgentChat.reg("pg-agent-chat");
