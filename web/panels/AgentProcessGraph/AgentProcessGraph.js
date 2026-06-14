import { Symbiote } from '@symbiotejs/symbiote';
import { getRoute, parseQuery, sharedUiStyles } from 'symbiote-ui/ui';
import { tPortal } from '../../common/localization.js';
import { persistLayout, persistUiValue, readLayout, readUiValue } from '../../common/ui-state.js';
import { state as dashState, events as dashEvents } from '../../dashboard-state.js';
import {
  buildAgentProcessCanvasGraphModel,
  buildAgentProcessGraphModel,
  summarizeAgentProcessGraphModel,
} from '../../services/agent-process-graph.js';
import { fetchDevelopmentMap } from '../../services/orchestration-development-map.js';
import template from './AgentProcessGraph.tpl.js';
import css from './AgentProcessGraph.css.js';

const DEFAULT_LAYOUT_ALGORITHM = 'organic';
const PROCESS_GRAPH_MESSAGE_LIMIT = 160;
const LAYOUT_ALGORITHMS = new Set(['organic', 'oil-cloud', 'spring']);
const LAYOUT_ALGORITHM_PATH = 'ui/preferences/agentProcessGraph/layoutAlgorithm';
const LAYOUT_ALGORITHM_KEY = 'agent-process-graph:layout-algorithm';

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

function normalizeLayoutAlgorithm(value) {
  let normalized = String(value || '').trim();
  return LAYOUT_ALGORITHMS.has(normalized) ? normalized : DEFAULT_LAYOUT_ALGORITHM;
}

function isLayoutSnapshotUsable(snapshot, canvasModel = {}) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  let nodes = Array.isArray(canvasModel.nodes) ? canvasModel.nodes : [];
  if (nodes.length <= 1) return true;
  let positions = snapshot.positions && typeof snapshot.positions === 'object'
    ? snapshot.positions
    : {};
  let nodeIds = new Set(nodes.map(node => node.id));
  let matchedPositions = Object.keys(positions).filter(id => nodeIds.has(id)).length;
  return matchedPositions >= Math.max(2, Math.ceil(nodes.length * 0.5));
}

function findGraphNode(model = {}, nodeId = '') {
  let nodes = Array.isArray(model.nodes) ? model.nodes : [];
  return nodes.find(node => node?.id === nodeId) || null;
}

function normalizeMessageIndex(value) {
  let index = Number(value);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function formatDurationMs(value) {
  let ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  let seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds >= 10 ? 0 : 1)}s`;
  let minutes = Math.floor(seconds / 60);
  let rest = Math.round(seconds % 60);
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

function getNodeChatEventTarget(node = {}) {
  let params = node?.params || {};
  let chatId = params.chatId || params.sourceChatId || null;
  let messageIndex = normalizeMessageIndex(params.messageIndex);
  if (messageIndex == null) messageIndex = normalizeMessageIndex(params.sourceMessageIndex);
  if (!chatId || messageIndex == null) return null;
  return {
    nodeId: node.id,
    chatId,
    messageIndex,
  };
}

function setRouteChatId(chatId) {
  if (!chatId || !globalThis.location) return;
  let hash = globalThis.location.hash || '#agent-chat';
  let body = hash.startsWith('#') ? hash.slice(1) : hash;
  let separatorIndex = body.indexOf('?');
  let routeName = separatorIndex >= 0 ? body.slice(0, separatorIndex) : body;
  let query = separatorIndex >= 0 ? body.slice(separatorIndex + 1) : '';
  let params = new URLSearchParams(query);
  params.set('chat', chatId);
  globalThis.location.hash = `${routeName || 'agent-chat'}?${params.toString()}`;
}

function findChatMessageTarget(messageIndex) {
  let transcript = document.querySelector('pg-agent-chat chat-transcript')
    || document.querySelector('chat-workspace chat-transcript')
    || document.querySelector('chat-transcript');
  let container = transcript?.getScrollContainer?.() || transcript?.querySelector?.('.chat-messages') || null;
  let items = container?.querySelectorAll('chat-message-item') || transcript?.querySelectorAll('chat-message-item') || [];
  let windowState = transcript?.getMessageWindow?.() || {};
  let startIndex = Number.isFinite(windowState.startIndex) ? windowState.startIndex : 0;
  let localIndex = messageIndex - startIndex;
  let item = localIndex >= 0 ? items[localIndex] || null : null;
  return { transcript, container, item };
}

function scrollChatMessageTargetIntoView({ transcript, container, item } = {}) {
  if (!container || !item) {
    item?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    return;
  }

  let maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  let targetTop = item.offsetTop - Math.max(0, (container.clientHeight - item.offsetHeight) / 2);
  targetTop = Math.min(maxScrollTop, Math.max(0, targetTop));
  if (typeof container.scrollTo === 'function') {
    container.scrollTo({ top: targetTop, behavior: 'smooth' });
  } else {
    container.scrollTop = targetTop;
  }
  transcript?.updateScrollBottomButton?.();
}

async function fetchJson(url, options = {}) {
  let res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchChat(chatId) {
  if (!chatId) return null;
  let [chat, page] = await Promise.all([
    fetchJson('/api/chats/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: chatId, includeMessages: false }),
    }),
    fetchJson('/api/chats/messages/page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, limit: PROCESS_GRAPH_MESSAGE_LIMIT }),
    }),
  ]);
  if (chat?.error || page?.error) return null;
  return {
    ...chat,
    messages: Array.isArray(page.messages) ? page.messages : [],
    messageCount: page.total,
    messageWindow: {
      startIndex: page.start,
      count: Math.max(0, page.end - page.start),
      totalItems: page.total,
      hasOlder: Boolean(page.hasBefore),
      hasNewer: Boolean(page.hasAfter),
      start: page.start,
      end: page.end,
    },
  };
}

async function fetchAgents() {
  let result = await fetchJson(`/api/agents?ts=${Date.now()}`).catch(() => ({ agents: [] }));
  return Array.isArray(result.agents) ? result.agents : [];
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
    this._developmentMapSummary = this.ref.developmentMapSummary || this.querySelector('[data-development-map-summary]');
    this._layoutAlgorithmSelect = this.ref.layoutAlgorithm || this.querySelector('[data-field="layout-algorithm"]');
    this._emptyText.textContent = tPortal('text.noChatsNew');
    this._onLayoutSnapshot = (event) => this._persistLayoutSnapshot(event.detail);
    this._canvasGraph?.addEventListener('layout-snapshot', this._onLayoutSnapshot);
    this._onGraphNodeSelected = (event) => this._handleGraphNodeSelected(event.detail || {});
    this._canvasGraph?.addEventListener('file-selected', this._onGraphNodeSelected);

    this.querySelector('[data-action="fit"]')?.addEventListener('click', () => this._fit());
    this.querySelector('[data-action="refresh"]')?.addEventListener('click', () => this._scheduleRefresh(0));
    this._layoutAlgorithm = normalizeLayoutAlgorithm(
      readUiValue(LAYOUT_ALGORITHM_PATH, LAYOUT_ALGORITHM_KEY, DEFAULT_LAYOUT_ALGORITHM),
    );
    this._syncLayoutAlgorithmControl();
    this._applyLayoutAlgorithm({ restart: false });
    this._onLayoutAlgorithmChange = () => this._handleLayoutAlgorithmChange();
    this._layoutAlgorithmSelect?.addEventListener('change', this._onLayoutAlgorithmChange);

    this._onRoute = () => this._scheduleRefresh(0);
    this._onChatUpdate = (event) => this._handleChatUpdate(event.detail || {});
    this._onChatsUpdate = () => this._scheduleRefresh(120);
    this._onChatLiveUpdate = (event) => this._handleChatLiveUpdate(event.detail || {});

    window.addEventListener('hashchange', this._onRoute);
    dashEvents.addEventListener('active-chat-changed', this._onRoute);
    dashEvents.addEventListener('chat-updated', this._onChatUpdate);
    dashEvents.addEventListener('chats-updated', this._onChatsUpdate);
    dashEvents.addEventListener('chat-live-updated', this._onChatLiveUpdate);

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
    dashEvents.removeEventListener('chat-live-updated', this._onChatLiveUpdate);
    this._layoutAlgorithmSelect?.removeEventListener('change', this._onLayoutAlgorithmChange);
    this._resizeObserver?.disconnect();
    clearTimeout(this._refreshTimer);
    clearTimeout(this._fitFallbackTimer);
    if (this._canvasGraph && this._layoutTickHandler) {
      this._canvasGraph.removeEventListener('layout-tick', this._layoutTickHandler);
      this._canvasGraph.removeEventListener('layout-done', this._layoutDoneHandler);
    }
    this._canvasGraph?.removeEventListener('layout-snapshot', this._onLayoutSnapshot);
    this._canvasGraph?.removeEventListener('file-selected', this._onGraphNodeSelected);
    clearTimeout(this._chatSyncTimer);
    this._clearChatSyncHighlight();
  }

  _handleChatUpdate(detail = {}) {
    let chatId = activeRouteChatId();
    if (!chatId || !detail.id || detail.id === chatId || this._childChatIds?.has(detail.id)) {
      this._scheduleRefresh(120);
    }
  }

  _handleChatLiveUpdate(detail = {}) {
    let eventChatId = detail.id || detail.chatId || null;
    let chatId = activeRouteChatId();
    if (!chatId || !eventChatId) return;
    if (eventChatId === chatId || this._childChatIds?.has(eventChatId)) {
      this._scheduleRefresh(detail.source === 'pull' ? 0 : 35);
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
      let [chat, chatListResult, agents] = await Promise.all([
        fetchChat(chatId),
        fetchJson('/api/chats').catch(() => ({ chats: dashState.chats || [] })),
        fetchAgents(),
      ]);
      if (!chat) {
        this._renderEmpty(tPortal('text.selectChat'));
        return;
      }
      let chatChanged = this._currentChatId !== chat.id;
      this._currentChatId = chat.id;

      let chats = chatListResult.chats || dashState.chats || [];
      let childMetas = collectDescendantMetas(chats, chat.id);
      this._childChatIds = new Set(childMetas.map(child => child.id));
      let childChats = (await Promise.all(childMetas.map(child => fetchChat(child.id).catch(() => child))))
        .filter(Boolean);
      let developmentMap = await fetchDevelopmentMap({
        chatId: chat.id,
        taskId: chat.pendingTaskId || '',
      }).catch(() => null);

      let graphModel = buildAgentProcessGraphModel({ chat, chats, childChats, agents, developmentMap });
      let canvasModel = buildAgentProcessCanvasGraphModel({ chat, chats, childChats, agents, developmentMap });
      let savedSnapshot = normalizeLayoutSnapshot(readLayout(processGraphLayoutKey(chat.id)));
      let layoutSnapshot = isLayoutSnapshotUsable(savedSnapshot, canvasModel) ? savedSnapshot : null;
      this._layoutKey = processGraphLayoutKey(chat.id);
      this._rootNodeId = graphModel.metadata.rootNodeId || canvasModel.rootNodes?.[0] || null;
      this._hasRestoredLayout = Boolean(layoutSnapshot);
      this._nodeCount = canvasModel.nodes?.length || 0;
      this._lastModel = graphModel;
      this._lastCanvasModel = canvasModel;
      this._applyLayoutAlgorithm({ restart: false });
      this._canvasGraph?.setLayoutSnapshot?.(layoutSnapshot || null);
      this._canvasGraph?.setGraphModel(canvasModel);
      this._renderStats(graphModel);
      this._renderDevelopmentMapSummary(developmentMap);
      this._setEmpty(false);
      this._fitAfterLayout({ restoreLayout: Boolean(layoutSnapshot) && !chatChanged });
    } catch (err) {
      this._renderEmpty(`${tPortal('text.error')}: ${err.message}`);
    }
  }

  _renderStats(model) {
    let summary = summarizeAgentProcessGraphModel(model);
    let developmentMap = summary.metadata.developmentMap || null;
    if (!this._stats) return;
    let stats = [
      this._stat('nodes', summary.nodes),
      this._stat('edges', summary.edges),
      this._stat('tools', summary.metadata.toolCount || 0),
      this._stat('files', summary.metadata.fileCount || 0),
      this._stat('agents', summary.metadata.childChatCount || 0),
    ];
    if (developmentMap) {
      stats.push(
        this._stat('tasks', `${developmentMap.runningTasks}/${developmentMap.totalTasks}`),
        this._stat('live tools', developmentMap.latestToolCount || 0),
        this._stat('tool time', formatDurationMs(developmentMap.toolUsageMs) || '0ms'),
      );
    }
    this._stats.replaceChildren(...stats);
  }

  _stat(label, value) {
    let item = document.createElement('span');
    item.className = 'graph-explorer-stat';
    item.innerHTML = `<span class="graph-explorer-stat-val">${String(value)}</span> ${label}`;
    return item;
  }

  _renderDevelopmentMapSummary(map) {
    if (!this._developmentMapSummary) return;
    this._developmentMapSummary.replaceChildren();
    if (!map) {
      this._developmentMapSummary.hidden = true;
      return;
    }

    let activityMap = map.activityMap || {};
    let usage = activityMap.summary || map.usage || {};
    let latestTools = Array.isArray(activityMap.latestTools)
      ? activityMap.latestTools.slice(0, 4)
      : Array.isArray(map.latestTools) ? map.latestTools.slice(0, 4) : [];
    let hints = Array.isArray(activityMap.promptHints)
      ? activityMap.promptHints.slice(0, 3)
      : Array.isArray(map.promptHintMap?.hints) ? map.promptHintMap.hints.slice(0, 3) : [];

    let header = document.createElement('div');
    header.className = 'apg-map-summary-head';
    header.append(
      this._summaryMetric('Tasks', `${usage.runningTasks || 0}/${usage.totalTasks || 0}`),
      this._summaryMetric('Agents', usage.subagents || 0),
      this._summaryMetric('Tools', usage.toolUses || 0),
      this._summaryMetric('Time', formatDurationMs(usage.toolUsageMs) || '0ms'),
    );
    this._developmentMapSummary.append(header);

    if (activityMap.stateError || map.stateError) {
      let error = document.createElement('div');
      error.className = 'apg-map-summary-error';
      error.textContent = activityMap.stateError || map.stateError;
      this._developmentMapSummary.append(error);
    }

    if (latestTools.length) {
      let tools = document.createElement('div');
      tools.className = 'apg-map-summary-list';
      for (let tool of latestTools) {
        let item = document.createElement('div');
        item.className = 'apg-map-summary-row';
        item.textContent = [
          tool.name || 'tool',
          tool.detailLabel || tool.detail || '',
          tool.status || 'unknown',
          formatDurationMs(tool.usageMs ?? tool.elapsedMs ?? tool.durationMs),
          tool.timingSource || '',
        ].filter(Boolean).join(' · ');
        tools.append(item);
      }
      this._developmentMapSummary.append(tools);
    }

    if (hints.length) {
      let hintList = document.createElement('div');
      hintList.className = 'apg-map-summary-hints';
      for (let hint of hints) {
        let item = document.createElement('span');
        item.className = 'apg-map-summary-hint';
        item.textContent = [hint.label || hint.id, hint.tool].filter(Boolean).join(' · ');
        hintList.append(item);
      }
      this._developmentMapSummary.append(hintList);
    }

    this._developmentMapSummary.hidden = false;
  }

  _summaryMetric(label, value) {
    let item = document.createElement('span');
    item.className = 'apg-map-summary-metric';
    let valueEl = document.createElement('strong');
    valueEl.textContent = String(value ?? 0);
    let labelEl = document.createElement('span');
    labelEl.textContent = label;
    item.append(valueEl, labelEl);
    return item;
  }

  _renderEmpty(text) {
    if (this._emptyText) this._emptyText.textContent = text;
    this._stats?.replaceChildren();
    this._setEmpty(true);
    this._layoutKey = null;
    this._rootNodeId = null;
    this._hasRestoredLayout = false;
    this._nodeCount = 0;
    this._currentChatId = null;
    this._lastCanvasModel = null;
    this._renderDevelopmentMapSummary(null);
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
      this._fitInitialGraph();
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

  _fitInitialGraph() {
    if ((this._nodeCount || 0) > 1) {
      this._fitAll();
      return;
    }
    this._fitRoot();
  }

  _fitAll() {
    let rect = this.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 120) return;
    requestAnimationFrame(() => {
      let didFit = this._canvasGraph?.fitView?.({ padding: 48, animate: true });
      if (!didFit) this._canvasGraph?.resetView?.();
      this._persistCurrentLayoutSnapshot(didFit ? 700 : 0);
    });
  }

  _fitRoot() {
    let rect = this.getBoundingClientRect();
    if (!this._rootNodeId || rect.width < 80 || rect.height < 120) return;
    requestAnimationFrame(() => {
      let didFit = this._canvasGraph?.fitNodes?.([this._rootNodeId], {
        padding: 96,
        maxZoom: 1.35,
        animate: true,
      });
      if (!didFit) this._canvasGraph?.resetView?.();
      this._persistCurrentLayoutSnapshot(didFit ? 700 : 0);
    });
  }

  _fit({ soft = false } = {}) {
    let rect = this.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 120) return;
    requestAnimationFrame(() => {
      let didFit = false;
      if ((this._nodeCount || 0) > 1) {
        didFit = this._canvasGraph?.fitView?.({ padding: 48, animate: true });
      } else if (this._rootNodeId) {
        didFit = this._canvasGraph?.fitNodes?.([this._rootNodeId], {
          padding: 96,
          maxZoom: soft ? 1.2 : 1.35,
          animate: true,
        });
      }
      if (!didFit) {
        this._canvasGraph?.resetView?.();
      } else {
        this._canvasGraph?.animateNodeAppearance?.(null, { durationMs: 520, staggerMs: 4 });
      }
      this._persistCurrentLayoutSnapshot(didFit ? 700 : 0);
    });
  }

  _handleLayoutAlgorithmChange() {
    let nextAlgorithm = normalizeLayoutAlgorithm(this._layoutAlgorithmSelect?.value);
    if (nextAlgorithm === this._layoutAlgorithm) return;
    this._layoutAlgorithm = nextAlgorithm;
    this._syncLayoutAlgorithmControl();
    persistUiValue(LAYOUT_ALGORITHM_PATH, nextAlgorithm, LAYOUT_ALGORITHM_KEY);
    this._applyLayoutAlgorithm({ restart: false });

    if (this._lastCanvasModel) {
      this._canvasGraph?.resetLayoutState?.();
      this._canvasGraph?.setLayoutSnapshot?.(null);
      this._hasRestoredLayout = false;
      this._canvasGraph?.setGraphModel?.(this._lastCanvasModel);
      this._applyLayoutAlgorithm({ restart: true });
      this._fitAfterLayout({ restoreLayout: false });
    }
  }

  _handleGraphNodeSelected(detail = {}) {
    let nodeId = detail.path || detail.nodeId || detail.id || '';
    let node = findGraphNode(this._lastModel, nodeId);
    let target = getNodeChatEventTarget(node);
    if (!target) {
      this._clearChatSyncHighlight();
      return;
    }
    this._syncChatToGraphNode(target);
  }

  _syncChatToGraphNode(target, attempt = 0) {
    if (!target?.chatId) return;
    if (attempt > 10) return;
    if (activeRouteChatId() !== target.chatId) {
      setRouteChatId(target.chatId);
      clearTimeout(this._chatSyncTimer);
      this._chatSyncTimer = setTimeout(() => this._syncChatToGraphNode(target, attempt + 1), 180);
      return;
    }

    let messageTarget = findChatMessageTarget(target.messageIndex);
    let item = messageTarget.item;
    if (!item) {
      if (attempt < 10) {
        clearTimeout(this._chatSyncTimer);
        this._chatSyncTimer = setTimeout(() => this._syncChatToGraphNode(target, attempt + 1), 140);
      }
      return;
    }

    this._clearChatSyncHighlight();
    item.setAttribute('data-process-sync-active', '');
    requestAnimationFrame(() => scrollChatMessageTargetIntoView(messageTarget));
  }

  _clearChatSyncHighlight() {
    for (let activeItem of document.querySelectorAll('chat-message-item[data-process-sync-active]')) {
      activeItem.removeAttribute('data-process-sync-active');
    }
  }

  _syncLayoutAlgorithmControl() {
    if (!this._layoutAlgorithmSelect) return;
    this._layoutAlgorithmSelect.value = this._layoutAlgorithm || DEFAULT_LAYOUT_ALGORITHM;
  }

  _applyLayoutAlgorithm({ restart = false } = {}) {
    this._canvasGraph?.setForceLayoutOptions?.({
      layoutAlgorithm: this._layoutAlgorithm || DEFAULT_LAYOUT_ALGORITHM,
    }, { restart });
  }

  _persistCurrentLayoutSnapshot(delay = 0) {
    setTimeout(() => {
      let snapshot = this._canvasGraph?.getLayoutSnapshot?.();
      this._persistLayoutSnapshot(snapshot);
    }, delay);
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
