import { Symbiote } from "@symbiotejs/symbiote";
import template from "./AgentBoard.tpl.js";
import css from "./AgentBoard.css.js";
import { mcpCall } from "../../common/mcp-call.js";
import { stateSync } from "../../state-sync.js";

function formatElapsed(startAt, completedAt) {
  if (!startAt) return '0s';
  let end = completedAt ? new Date(completedAt).getTime() : Date.now();
  let start = new Date(startAt).getTime();
  let ms = end - start;
  if (ms < 0) ms = 0;
  
  let s = Math.floor(ms / 1000);
  if (s < 60) return s + 's';
  let m = Math.floor(s / 60);
  let sec = s % 60;
  return m + 'm ' + sec + 's';
}

export class AgentBoard extends Symbiote {
  init$ = {
    isCollapsed: false,
    collapseIcon: 'expand_less',
    queuedNodes: [],
    queuedCount: 0,
    runningNodes: [],
    runningCount: 0,
    doneNodes: [],
    doneCount: 0,
    errorNodes: [],
    errorCount: 0,
    
    onToggleCollapse: () => {
      this.$.isCollapsed = !this.$.isCollapsed;
      this.$.collapseIcon = this.$.isCollapsed ? 'expand_more' : 'expand_less';
    },
    onRefresh: () => {
      this.refreshBoard();
    },
    onCardClick: (e) => {
      let chatId = e.currentTarget.dataset.chat;
      if (chatId && chatId !== 'undefined' && chatId !== 'null') {
        dashState.activeChatId = chatId;
        if (typeof setGlobalParam === 'function') setGlobalParam('chat', chatId);
        if (typeof dashEmit === 'function') dashEmit('active-chat-changed', { id: chatId });
      }
    }
  };

  /** @type {string} */
  chatId = null;
  /** @type {string} */
  cwd = null;
  /** @type {any} */
  _unsub = null;
  /** @type {number} */
  _timer = null;

  renderCallback() {
    this.refreshBoard();
    
    // Auto-update running timers every second
    this._timer = setInterval(() => {
      if (this.$.isCollapsed) return;
      let needsUpdate = false;
      let updatedRunning = this.$.runningNodes.map(n => {
        let text = formatElapsed(n._rawCreatedAt || n._rawStartedAt, null);
        if (text !== n.elapsedText) {
          needsUpdate = true;
          return { ...n, elapsedText: text };
        }
        return n;
      });
      if (needsUpdate) this.$.runningNodes = updatedRunning;
    }, 1000);

    // Subscribe to StateGraph task updates for reactive refresh
    this._unsub = stateSync.on('tasks', () => {
      this.refreshBoard();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._unsub) this._unsub();
    if (this._timer) clearInterval(this._timer);
  }

  async refreshBoard() {
    if (!this.cwd) return;
    try {
      let state = await mcpCall('agent-pool', 'get_board_state', { cwd: this.cwd });
      this.processState(state);
    } catch (err) {
      console.warn('[AgentBoard] Failed to fetch board state:', err);
    }
  }

  processState(state) {
    if (!state || !state.nodes) return;
    
    let nodes = state.nodes;
    
    // Filter nodes by chatId — only show tasks linked to this chat tree
    if (this.chatId) {
      let relevantIds = new Set();
      let changed = true;
      
      // Seed: root tasks whose parentId matches this chatId
      for (let n of nodes) {
        if (n.parentId === this.chatId) relevantIds.add(n.id);
      }
      
      // Expand: add all descendants
      while (changed) {
        changed = false;
        for (let n of nodes) {
          if (n.parentId && relevantIds.has(n.parentId) && !relevantIds.has(n.id)) {
            relevantIds.add(n.id);
            changed = true;
          }
        }
      }
      
      nodes = nodes.filter(n => relevantIds.has(n.id));
    }

    let queued = [];
    let running = [];
    let done = [];
    let error = [];

    for (let n of nodes) {
      let costStr = n.cost ? ('$' + n.cost.toFixed(4)) : '';
      let tokensStr = n.tokens ? (n.tokens + ' tk') : '';
      
      let item = {
        id: n.id,
        chatId: n.chatId,
        agentSlug: n.agentSlug || 'agent',
        description: n.description || 'Unknown task',
        elapsedText: formatElapsed(n.startedAt || n.createdAt, n.completedAt),
        cost: costStr,
        tokens: tokensStr,
        hideMetrics: !n.cost && !n.tokens,
        _rawCreatedAt: n.createdAt,
        _rawStartedAt: n.startedAt
      };

      if (n.status === 'queued') queued.push(item);
      else if (n.status === 'running') running.push(item);
      else if (n.status === 'done') done.push(item);
      else error.push(item);
    }

    this.$.queuedNodes = queued;
    this.$.queuedCount = queued.length;
    this.$.runningNodes = running;
    this.$.runningCount = running.length;
    this.$.doneNodes = done;
    this.$.doneCount = done.length;
    this.$.errorNodes = error;
    this.$.errorCount = error.length;
    
    // Auto-hide board if no tasks exist
    let total = queued.length + running.length + done.length + error.length;
    this.style.display = total === 0 ? 'none' : 'block';
  }
}

AgentBoard.template = template;
AgentBoard.rootStyles = css;
AgentBoard.reg('agent-board');
