import { Symbiote } from '@symbiotejs/symbiote';
import { getRoute, parseQuery, sharedUiStyles } from 'symbiote-ui/ui';
import { tPortal } from '../../common/localization.js';
import { persistLayout, readLayout } from '../../common/ui-state.js';
import { state as dashState, events as dashEvents } from '../../dashboard-state.js';
import {
  buildAgentProcessCanvasGraphModel,
  buildAgentProcessGraphModel,
  summarizeAgentProcessGraphModel,
} from '../../services/agent-process-graph.js';
import template from './AgentProcessGraph.tpl.js';
import css from './AgentProcessGraph.css.js';

function activeRouteChatId() {
  let route = getRoute();
  let globals = parseQuery(route.query);
  return globals.chat || dashState.activeChatId || null;
}

function processGraphLayoutKey(chatId) {
  return `agent-process-graph:${encodeURIComponent(String(chatId || 'active'))}:layout`;
}

function normalizeLayoutSnapshot(snapshot) {
  return snapshot && typeof snapshot === 'object' ? snapshot : null;
}

async function fetchJson(url, options = {}) {
  let res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchChat(chatId) {
  if (!chatId) return null;
  let chat = await fetchJson('/api/chats/get', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: chatId }),
  });
  return chat?.error ? null : chat;
}

function collectDescendantMetas(chats = [], rootChatId, limit = 24) {
  let result = [];
  let queue = [rootChatId];
  let seen = new Set([rootChatId]);

  while (queue.length && result.length < limit) {
    let parentId = queue.shift();
    for (let chat of chats) {
      if (!chat?.id || chat.parentChatId !== parentId || seen.has(chat.id)) continue;
      seen.add(chat.id);
      result.push(chat);
      queue.push(chat.id);
      if (result.length >= limit) break;
    }
  }
  return result;
}

export class AgentProcessGraph extends Symbiote {
  init$ = {};

  initCallback() {
    this._canvasGraph = this.querySelector('canvas-graph');
    this._empty = this.querySelector('[data-empty]');
    this._stats = this.ref.stats || this.querySelector('.apg-stats');
    this._emptyText = this.ref.emptyText || this.querySelector('[ref="emptyText"]');
    this._emptyText.textContent = tPortal('text.noChatsNew');
    this._onLayoutSnapshot = (event) => this._persistLayoutSnapshot(event.detail);
    this._canvasGraph?.addEventListener('layout-snapshot', this._onLayoutSnapshot);

    this.querySelector('[data-action="fit"]')?.addEventListener('click', () => this._fit());
    this.querySelector('[data-action="refresh"]')?.addEventListener('click', () => this._scheduleRefresh(0));

    this._onRoute = () => this._scheduleRefresh(0);
    this._onChatUpdate = (event) => this._handleChatUpdate(event.detail || {});
    this._onChatsUpdate = () => this._scheduleRefresh(120);

    window.addEventListener('hashchange', this._onRoute);
    dashEvents.addEventListener('active-chat-changed', this._onRoute);
    dashEvents.addEventListener('chat-updated', this._onChatUpdate);
    dashEvents.addEventListener('chats-updated', this._onChatsUpdate);

    this._resizeObserver = new ResizeObserver(() => {
      if (!this._hasRestoredLayout) this._fit({ soft: true });
    });
    this._resizeObserver.observe(this);

    this._scheduleRefresh(0);
  }

  disconnectedCallback() {
    window.removeEventListener('hashchange', this._onRoute);
    dashEvents.removeEventListener('active-chat-changed', this._onRoute);
    dashEvents.removeEventListener('chat-updated', this._onChatUpdate);
    dashEvents.removeEventListener('chats-updated', this._onChatsUpdate);
    this._resizeObserver?.disconnect();
    clearTimeout(this._refreshTimer);
    clearTimeout(this._fitFallbackTimer);
    if (this._canvasGraph && this._layoutTickHandler) {
      this._canvasGraph.removeEventListener('layout-tick', this._layoutTickHandler);
      this._canvasGraph.removeEventListener('layout-done', this._layoutDoneHandler);
    }
    this._canvasGraph?.removeEventListener('layout-snapshot', this._onLayoutSnapshot);
  }

  _handleChatUpdate(detail = {}) {
    let chatId = activeRouteChatId();
    if (!chatId || !detail.id || detail.id === chatId || this._childChatIds?.has(detail.id)) {
      this._scheduleRefresh(120);
    }
  }

  _scheduleRefresh(delay = 80) {
    clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => this._refresh(), delay);
  }

  async _refresh() {
    let chatId = activeRouteChatId();
    if (!chatId) {
      this._renderEmpty(tPortal('text.noChatsNew'));
      return;
    }

    try {
      let [chat, chatListResult] = await Promise.all([
        fetchChat(chatId),
        fetchJson('/api/chats').catch(() => ({ chats: dashState.chats || [] })),
      ]);
      if (!chat) {
        this._renderEmpty(tPortal('text.selectChat'));
        return;
      }

      let chats = chatListResult.chats || dashState.chats || [];
      let childMetas = collectDescendantMetas(chats, chat.id);
      this._childChatIds = new Set(childMetas.map(child => child.id));
      let childChats = (await Promise.all(childMetas.map(child => fetchChat(child.id).catch(() => child))))
        .filter(Boolean);

      let graphModel = buildAgentProcessGraphModel({ chat, chats, childChats });
      let canvasModel = buildAgentProcessCanvasGraphModel({ chat, chats, childChats });
      let layoutSnapshot = normalizeLayoutSnapshot(readLayout(processGraphLayoutKey(chat.id)));
      this._layoutKey = processGraphLayoutKey(chat.id);
      this._rootNodeId = graphModel.metadata.rootNodeId || canvasModel.rootNodes?.[0] || null;
      this._hasRestoredLayout = Boolean(layoutSnapshot);
      this._lastModel = graphModel;
      this._canvasGraph?.setLayoutSnapshot?.(layoutSnapshot || null);
      this._canvasGraph?.setGraphModel(canvasModel);
      this._renderStats(graphModel);
      this._setEmpty(false);
      this._fitAfterLayout({ restoreLayout: Boolean(layoutSnapshot) });
    } catch (err) {
      this._renderEmpty(`${tPortal('text.error')}: ${err.message}`);
    }
  }

  _renderStats(model) {
    let summary = summarizeAgentProcessGraphModel(model);
    if (!this._stats) return;
    this._stats.replaceChildren(
      this._stat('nodes', summary.nodes),
      this._stat('edges', summary.edges),
      this._stat('tools', summary.metadata.toolCount || 0),
      this._stat('files', summary.metadata.fileCount || 0),
      this._stat('agents', summary.metadata.childChatCount || 0),
    );
  }

  _stat(label, value) {
    let item = document.createElement('span');
    item.className = 'graph-explorer-stat';
    item.innerHTML = `<span class="graph-explorer-stat-val">${String(value)}</span> ${label}`;
    return item;
  }

  _renderEmpty(text) {
    if (this._emptyText) this._emptyText.textContent = text;
    this._stats?.replaceChildren();
    this._setEmpty(true);
    this._layoutKey = null;
    this._rootNodeId = null;
    this._hasRestoredLayout = false;
    this._canvasGraph?.setLayoutSnapshot?.(null);
    this._canvasGraph?.setGraphModel?.({ nodes: [], edges: [], rootNodes: [] });
  }

  _setEmpty(isEmpty) {
    if (this._empty) this._empty.hidden = !isEmpty;
  }

  _fitAfterLayout({ restoreLayout = false } = {}) {
    if (!this._canvasGraph) return;
    if (this._fitFallbackTimer) clearTimeout(this._fitFallbackTimer);
    if (this._layoutTickHandler) {
      this._canvasGraph.removeEventListener('layout-tick', this._layoutTickHandler);
      this._canvasGraph.removeEventListener('layout-done', this._layoutDoneHandler);
    }
    this._layoutTickHandler = null;
    this._layoutDoneHandler = null;
    if (restoreLayout) return;

    let tickCount = 0;
    let done = () => {
      if (!this._layoutTickHandler) return;
      this._canvasGraph.removeEventListener('layout-tick', this._layoutTickHandler);
      this._canvasGraph.removeEventListener('layout-done', this._layoutDoneHandler);
      this._layoutTickHandler = null;
      this._layoutDoneHandler = null;
      clearTimeout(this._fitFallbackTimer);
      this._fitFallbackTimer = null;
      this._fitRoot();
    };

    this._layoutTickHandler = () => {
      tickCount += 1;
      if (tickCount >= 8) done();
    };
    this._layoutDoneHandler = done;
    this._canvasGraph.addEventListener('layout-tick', this._layoutTickHandler);
    this._canvasGraph.addEventListener('layout-done', this._layoutDoneHandler);
    this._fitFallbackTimer = setTimeout(done, 1200);
  }

  _fitRoot() {
    let rect = this.getBoundingClientRect();
    if (!this._rootNodeId || rect.width < 80 || rect.height < 120) return;
    requestAnimationFrame(() => {
      let didFit = this._canvasGraph?.fitNodes?.([this._rootNodeId], {
        padding: 96,
        maxZoom: 1.35,
        animate: false,
      });
      if (!didFit) this._canvasGraph?.resetView?.();
      this._persistCurrentLayoutSnapshot();
    });
  }

  _fit({ soft = false } = {}) {
    let rect = this.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 120) return;
    requestAnimationFrame(() => {
      if (soft) {
        this._canvasGraph?.resetView?.();
      } else {
        this._canvasGraph?.resetView?.();
      }
      this._persistCurrentLayoutSnapshot();
    });
  }

  _persistCurrentLayoutSnapshot() {
    setTimeout(() => {
      let snapshot = this._canvasGraph?.getLayoutSnapshot?.();
      this._persistLayoutSnapshot(snapshot);
    }, 0);
  }

  _persistLayoutSnapshot(snapshot) {
    if (!this._layoutKey || !snapshot || typeof snapshot !== 'object') return;
    persistLayout(this._layoutKey, snapshot);
    this._hasRestoredLayout = true;
  }
}

AgentProcessGraph.template = template;
AgentProcessGraph.rootStyles = sharedUiStyles + css;
AgentProcessGraph.reg('pg-agent-process-graph');

export default AgentProcessGraph;
