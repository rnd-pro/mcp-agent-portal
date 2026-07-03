import { Symbiote } from '@symbiotejs/symbiote';
import { getRoute, parseQuery, sharedUiStyles as cssShared } from 'symbiote-ui/ui';
import 'symbiote-ui/board';
import { state as dashState } from '../../dashboard-state.js';
import { stateSync } from '../../state-sync.js';
import {
  fetchWorkflowBoardProjection,
  fetchWorkflowBoard,
  controlWorkflowCard,
  controlWorkflowBoard,
  deleteWorkflowCard,
  getAdjacentColumn,
  importWorkflowWorkItems,
  normalizeWorkflowBoardPayload,
  orchestrateWorkflowCard,
  reconcileWorkflowRecovery,
  requestWorkflowTransition,
  updateWorkflowBoardAutomation,
  updateWorkflowColumn,
} from '../../services/workflow-board.js';
import {
  buildWorkflowBoardCanvasGraphModel,
  buildWorkflowBoardGraphModel,
  summarizeWorkflowBoardGraphModel,
} from '../../services/board-graph.js';
import { fetchAgentCatalog, agentCatalogSnapshot } from '../../services/agent-catalog.js';
import template from './WorkflowBoard.tpl.js';
import cssLocal from './WorkflowBoard.css.js';
import { setWorkflowBoardSelection } from './workflow-board-selection.js';
import { openChat } from '../../common/open-chat.js';
import { tPortal } from '../../common/localization.js';
import { latestRun, agentName, isCardActive } from './workflow-card-telemetry.js';
import {
  cardFooterChips,
  cardMetaChips,
  deriveCardTicker,
  effectiveColumnAutomation,
  localizeWorkflowEnum,
} from './workflow-card-presentation.js';
import {
  buildWorkflowBoardProjectionFromContext,
  createWorkflowBoardRenderContext,
  workflowBoardGraphTopologySignature,
  workflowBoardRenderScopeKey,
} from './workflow-board-render-context.js';
import { decideWorkflowBoardRealtimeRefresh } from './workflow-board-realtime.js';

const DEFAULT_SCOPE = 'home';
const BOARD_VIEWS = new Set(['kanban', 'graph']);
const FALLBACK_REFRESH_INTERVAL_MS = 60_000;
const REALTIME_DEBOUNCE_MS = 200;
const REALTIME_STATE_KEYS = ['workflowCards', 'workflowRuns', 'workflowLeases', 'workflowTransitions', 'tasks'];
const LAUNCH_COLUMNS = new Set(['ideas', 'backlog']);
const ACTIVE_CONTROL_COLUMNS = new Set(['ready', 'in-progress', 'quality-audit', 'commit-publish']);
const COLUMN_TRIGGERS = ['manual', 'on_enter', 'lease_required'];
const COLUMN_ACTIONS = ['classify', 'scope', 'orchestrate', 'execute', 'audit', 'publish', 'close'];
const COLUMN_MODES = ['manual', 'gated', 'auto'];
const COLUMN_APPROVAL_MODES = ['', 'plan', 'auto_edit', 'yolo'];
const RESUMABLE_BOARD_MODES = new Set(['paused', 'draining', 'stopped', 'maintenance', 'recovery_only']);
const BOARD_MODE_VARIANTS = {
  autonomous: 'success',
  armed: 'warning',
  manual: 'info',
  maintenance: 'warning',
  passive: 'info',
  paused: 'info',
  draining: 'warning',
  stopped: 'error',
  recovery_only: 'warning',
};

function normalizeText(value, fallback = '') {
  let text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatLabel(value) {
  let text = normalizeText(value);
  if (!text) return '';
  return text
    .split(/[-_:/]+/)
    .filter(Boolean)
    .map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

// UI-chrome enum localization is shared with the card-presentation module (single vocabulary).
const tEnum = localizeWorkflowEnum;

function formatMode(value) {
  return tEnum(value || 'passive');
}

function formatDateTime(value) {
  if (!value) return '';
  let date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function eventTimestamp(event = {}) {
  return event.timestamp || event.createdAt || event.updatedAt || '';
}

function makeElement(tagName, className = '', textContent = '') {
  let element = document.createElement(tagName);
  if (className) element.className = className;
  if (textContent) element.textContent = textContent;
  return element;
}

function makeIcon(name) {
  let icon = makeElement('span', 'material-symbols-outlined', name);
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

// U15: chip semantics never rely on color alone — pair an icon + label, and always set a title so an
// icon-adjacent tooltip/label is available (not just a bare colored pill).
function makeChip(text, kind = '', options = {}) {
  let chip = makeElement('span', 'wb-chip');
  if (options.icon) chip.append(makeIcon(options.icon));
  chip.append(document.createTextNode(text));
  if (kind) chip.dataset.kind = kind;
  if (options.title) chip.title = options.title;
  return chip;
}

function isRuntimeOnlyCard(card = {}) {
  return Boolean(
    card.metadata?.runtimeOnly
    || card.raw?.metadata?.runtimeOnly
    || card.kind === 'runtime-task'
  );
}

function createButton(label, options = {}) {
  let button = document.createElement('sn-button');
  if (options.variant) button.setAttribute('variant', options.variant);
  if (options.className) button.className = options.className;
  if (options.title) {
    button.setAttribute('title', options.title);
    button.setAttribute('aria-label', options.title);
  }
  if (options.icon) button.append(makeIcon(options.icon));
  if (label) button.append(document.createTextNode(label));
  for (let [key, value] of Object.entries(options.dataset || {})) {
    if (value != null) button.dataset[key] = String(value);
  }
  return button;
}

function createField(label, control) {
  let field = makeElement('label', 'wb-setting-field');
  field.append(makeElement('span', '', label), control);
  return field;
}

function createSelect(value, options, dataset = {}) {
  let select = makeElement('select', 'wb-setting-control');
  for (let option of options) {
    select.append(new Option(tEnum(option || 'default'), option));
  }
  select.value = options.includes(value) ? value : '';
  for (let [key, item] of Object.entries(dataset)) select.dataset[key] = item;
  return select;
}

function createTextInput(value, dataset = {}, options = {}) {
  let input = document.createElement('input');
  input.className = 'wb-setting-control';
  input.value = value || '';
  input.type = options.type || 'text';
  if (options.min != null) input.min = String(options.min);
  if (options.placeholder) input.placeholder = options.placeholder;
  for (let [key, item] of Object.entries(dataset)) input.dataset[key] = item;
  return input;
}

function cardHasActiveRun(card = {}) {
  return isCardActive(card);
}

function eventDetail(board, card, extra = {}) {
  return {
    board,
    boardId: board?.boardId || board?.id || '',
    card,
    cardId: card?.id || '',
    columnId: card?.columnId || '',
    ...extra,
  };
}

export class WorkflowBoard extends Symbiote {
  static get observedAttributes() {
    return ['scope', 'project-id', 'board-id', 'mode'];
  }

  init$ = {
    modeLabel: formatMode('passive'),
    scopeLabel: tPortal('workflow.scope.home'),
  };

  #board = null;
  #selectedCardId = '';
  #activeView = 'kanban';
  #abortController = null;
  #applyingAttributes = false;
  #lastLoadKey = '';
  #routeSyncHandler = null;
  #fallbackRefreshTimer = null;
  #focusSyncHandler = null;
  #visibilitySyncHandler = null;
  #realtimeUnsubscribers = [];
  #realtimeRefreshTimer = null;
  #realtimeRefreshMode = '';
  #statusAbortController = null;
  #renderContext = null;
  #renderContextBoard = null;
  #renderContextScopeKey = '';
  #graphRenderCache = null;
  // Per-column header memoization: the same DOM node is returned while the column's rendered config
  // is unchanged, so the board's keyed reconciliation never rebuilds a header (or tears down its
  // open settings popover) on a silent refresh. Keyed by column id → { key, element, stale }.
  #columnHeaderCache = new Map();
  #columnHeaderRevision = 0;
  // One stable closure across setBoard calls — a fresh closure per render would read as a changed
  // renderer and force header rebuilds even when nothing changed.
  #renderColumnHeaderBound = (column) => this.#memoizedColumnHeader(column);

  initCallback() {
    this.#localizeChrome();
    this.ref.pauseBoardBtn.onclick = () => this.controlBoard('pause');
    this.ref.resumeBoardBtn.onclick = () => this.controlBoard('resume');
    this.ref.drainBoardBtn.onclick = () => this.controlBoard('drain');
    this.ref.stopBoardBtn.onclick = () => this.controlBoard('stop');
    this.ref.importBtn.onclick = () => this.importWorkItems();
    this.ref.reconcileBtn.onclick = () => this.reconcileRecovery();
    this.ref.saveBoardSettingsBtn.onclick = () => this.saveBoardSettings();
    this.#groupToolbarControls();
    this.ref.boardView.addEventListener('sn-board-card-select', (event) => this.#onBoardCardSelect(event));
    this.ref.boardView.addEventListener('sn-board-card-action', (event) => this.#onBoardCardAction(event));
    this.ref.boardView.addEventListener('sn-board-card-drop', (event) => this.#onBoardCardDrop(event));
    this.ref.boardView.addEventListener('click', (event) => this.#onBoardHeaderClick(event));
    this.ref.kanbanViewBtn.onclick = () => this.setView('kanban');
    this.ref.graphViewBtn.onclick = () => this.setView('graph');
    this.ref.graphFitBtn.onclick = () => this.#fitGraph();
    this.#syncViewControls();
    this.#routeSyncHandler = () => this.loadBoard({ reason: 'route-change' });
    globalThis.addEventListener?.('hashchange', this.#routeSyncHandler);
    this.#focusSyncHandler = () => this.loadBoard({ silent: true, reason: 'focus-sync' });
    this.#visibilitySyncHandler = () => {
      if (!globalThis.document?.hidden) this.loadBoard({ silent: true, reason: 'visibility-sync' });
    };
    globalThis.addEventListener?.('focus', this.#focusSyncHandler);
    globalThis.document?.addEventListener?.('visibilitychange', this.#visibilitySyncHandler);
    this.#subscribeRealtime();
    this.#startFallbackRefresh();
    this.loadBoard();
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    this.#abortController?.abort();
    this.#abortController = null;
    this.#statusAbortController?.abort();
    this.#statusAbortController = null;
    if (this.#routeSyncHandler) {
      globalThis.removeEventListener?.('hashchange', this.#routeSyncHandler);
      this.#routeSyncHandler = null;
    }
    if (this.#focusSyncHandler) {
      globalThis.removeEventListener?.('focus', this.#focusSyncHandler);
      this.#focusSyncHandler = null;
    }
    if (this.#visibilitySyncHandler) {
      globalThis.document?.removeEventListener?.('visibilitychange', this.#visibilitySyncHandler);
      this.#visibilitySyncHandler = null;
    }
    if (this.#fallbackRefreshTimer) {
      globalThis.clearInterval?.(this.#fallbackRefreshTimer);
      this.#fallbackRefreshTimer = null;
    }
    for (let unsubscribe of this.#realtimeUnsubscribers) unsubscribe?.();
    this.#realtimeUnsubscribers = [];
    if (this.#realtimeRefreshTimer) {
      globalThis.clearTimeout?.(this.#realtimeRefreshTimer);
      this.#realtimeRefreshTimer = null;
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    super.attributeChangedCallback?.(name, oldValue, newValue);
    if (oldValue === newValue || this.#applyingAttributes || !this.isConnected) return;
    this.loadBoard({ reason: `attribute:${name}` });
  }

  setScope(options = {}) {
    this.#applyingAttributes = true;
    this.#setOptionalAttribute('scope', options.scope);
    this.#setOptionalAttribute('project-id', options.projectId);
    this.#setOptionalAttribute('board-id', options.boardId);
    this.#setOptionalAttribute('mode', options.mode);
    this.#applyingAttributes = false;
    if (this.isConnected) return this.loadBoard({ reason: 'set-scope' });
    return Promise.resolve(null);
  }

  setBoardData(payload = {}) {
    this.#board = normalizeWorkflowBoardPayload(payload, this.#scopeState());
    this.#invalidateRenderContext();
    this.#ensureSelection();
    this.#render();
    this.#publishSelection('set-board-data');
    this.#dispatch('workflow-board-loaded', eventDetail(this.#board, this.#selectedCard()));
    return this.#board;
  }

  getBoard() {
    return this.#board;
  }

  getSelection() {
    let card = this.#selectedCard();
    return eventDetail(this.#board, card);
  }

  selectCard(cardId = '') {
    let id = normalizeText(cardId);
    if (!id || !this.#board?.cards?.some(card => card.id === id)) return null;
    this.#selectedCardId = id;
    this.#render();
    let card = this.#selectedCard();
    this.#publishSelection('select-card');
    this.#dispatch('workflow-card-selected', eventDetail(this.#board, card));
    return card;
  }

  async loadBoard(options = {}) {
    let filters = this.#scopeState();
    let loadKey = JSON.stringify(filters);
    this.#lastLoadKey = loadKey;
    this.#abortController?.abort();
    this.#abortController = new AbortController();
    if (!options.silent) this.#setBanner('running', tPortal('workflow.banner.loading'));

    try {
      let [board] = await Promise.all([
        fetchWorkflowBoard(filters, { signal: this.#abortController.signal }),
        // Agent identity (declared icon/color) rides along so chips render identity on first paint.
        fetchAgentCatalog().catch(() => null),
      ]);
      if (loadKey !== this.#lastLoadKey) return null;
      this.#board = board;
      this.#invalidateRenderContext();
      this.#ensureSelection();
      this.#clearBanner();
      this.#render();
      this.#publishSelection(options.reason || 'load');
      this.#dispatch('workflow-board-loaded', {
        ...eventDetail(this.#board, this.#selectedCard()),
        reason: options.reason || 'load',
      });
      return board;
    } catch (error) {
      if (error?.name === 'AbortError') return null;
      this.#setBanner('error', error?.message || String(error));
      if (!this.#board) {
        this.#selectedCardId = '';
        this.#renderError(error);
      }
      this.#dispatch('workflow-board-error', {
        error,
        message: error?.message || String(error),
        filters,
      });
      return null;
    }
  }

  #subscribeRealtime() {
    let ready = false;
    let onPatch = (key, value) => {
      // Ignore the synchronous initial delivery emitted while subscribing; the
      // first board load is driven by loadBoard() in initCallback.
      if (ready) this.#scheduleRealtimeRefresh(this.#realtimeRefreshDecision(key, value));
    };
    for (let key of REALTIME_STATE_KEYS) {
      this.#realtimeUnsubscribers.push(stateSync.on(key, value => onPatch(key, value)));
    }
    ready = true;
  }

  #realtimeRefreshDecision(key, value) {
    return decideWorkflowBoardRealtimeRefresh({
      key,
      value,
      board: this.#board,
      scope: this.#scopeState(),
    });
  }

  #scheduleRealtimeRefresh(mode = 'full') {
    if (mode === 'skip') return;
    if (mode === 'full' || !this.#realtimeRefreshMode) this.#realtimeRefreshMode = mode;
    // Coalesce a burst of patches (e.g. a multi-card transition) into one refresh.
    if (this.#realtimeRefreshTimer) return;
    this.#realtimeRefreshTimer = globalThis.setTimeout?.(() => {
      let nextMode = this.#realtimeRefreshMode || 'full';
      this.#realtimeRefreshTimer = null;
      this.#realtimeRefreshMode = '';
      if (!this.isConnected || globalThis.document?.hidden) return;
      if (nextMode === 'status') {
        this.#loadBoardStatus({ reason: 'realtime-status-sync' });
      } else {
        this.loadBoard({ silent: true, reason: 'realtime-sync' });
      }
    }, REALTIME_DEBOUNCE_MS) || null;
  }

  async #loadBoardStatus(options = {}) {
    if (!this.#board) return this.loadBoard({ silent: true, reason: options.reason || 'status-sync' });
    let filters = {
      ...this.#scopeState(),
      view: 'status',
      compact: true,
      includeCards: false,
      includeEvents: false,
      includeRuntime: true,
      eventLimit: 1,
    };
    this.#statusAbortController?.abort();
    this.#statusAbortController = new AbortController();
    try {
      let projection = await fetchWorkflowBoardProjection(filters, {
        signal: this.#statusAbortController.signal,
      });
      this.#applyStatusProjection(projection);
      this.#renderStatusReadout();
      this.#dispatch('workflow-board-status-loaded', {
        ...eventDetail(this.#board, this.#selectedCard()),
        reason: options.reason || 'status-sync',
      });
      return projection;
    } catch (error) {
      if (error?.name !== 'AbortError') this.#dispatch('workflow-board-error', {
        error,
        message: error?.message || String(error),
        filters,
      });
      return null;
    }
  }

  #applyStatusProjection(projection = {}) {
    let load = projection.load || {};
    let activity = projection.activity || {};
    let columns = asArray(projection.columns);
    this.#board = {
      ...this.#board,
      lastActivityAt: activity.latestEventAt || this.#board.lastActivityAt,
      counters: {
        ...(this.#board.counters || {}),
        active: Number.isFinite(Number(load.activeCardCount)) ? Number(load.activeCardCount) : this.#board.counters?.active,
        blocked: Number.isFinite(Number(load.blockedCardCount)) ? Number(load.blockedCardCount) : this.#board.counters?.blocked,
        recovery: columns.reduce((sum, column) => sum + (Number(column.recoveryCount) || 0), 0),
      },
      raw: {
        ...(this.#board.raw || {}),
        statusProjection: projection,
      },
    };
    this.#invalidateRenderContext();
  }

  #startFallbackRefresh() {
    // Heartbeat fallback only; realtime ws/state patches drive normal updates.
    if (this.#fallbackRefreshTimer) globalThis.clearInterval?.(this.#fallbackRefreshTimer);
    this.#fallbackRefreshTimer = globalThis.setInterval?.(() => {
      if (!this.isConnected || globalThis.document?.hidden) return;
      this.loadBoard({ silent: true, reason: 'fallback-sync' });
    }, FALLBACK_REFRESH_INTERVAL_MS) || null;
  }

  async requestTransition(options = {}) {
    let card = this.#cardById(options.cardId || this.#selectedCardId);
    let board = this.#board;
    let toColumnId = normalizeText(options.toColumnId || options.to);
    if (!board || !card || !toColumnId) return null;

    let detail = eventDetail(board, card, {
      fromColumnId: card.columnId,
      toColumnId,
      actor: normalizeText(options.actor, 'human'),
      mode: normalizeText(options.mode, 'manual'),
      reason: normalizeText(options.reason),
      entityRefs: card.entityRefs || {},
      expectedVersion: card.version,
    });
    let event = this.#dispatch('workflow-board-transition-request', detail, {
      cancelable: true,
    });
    if (event.defaultPrevented) return null;

    this.#setBanner('running', tPortal('workflow.banner.requestingTransition', {
      column: this.#columnTitle(toColumnId),
    }));
    try {
      let result = await requestWorkflowTransition(detail);
      this.#dispatch('workflow-board-transition-result', {
        ...detail,
        result,
      });
      await this.loadBoard({ silent: true, reason: 'transition-result' });
      this.#setBanner('success', tPortal('workflow.banner.transitionRequested', { title: card.title }));
      return result;
    } catch (error) {
      this.#setBanner('error', error?.message || String(error));
      this.#dispatch('workflow-board-transition-error', {
        ...detail,
        error,
        message: error?.message || String(error),
      });
      return null;
    }
  }

  async orchestrateCard(options = {}) {
    let card = this.#cardById(options.cardId || this.#selectedCardId);
    if (!this.#board || !card) return null;
    this.#setBanner('running', tPortal('workflow.banner.requestingOrchestration', { title: card.title }));
    try {
      let payload = await orchestrateWorkflowCard({
        boardId: this.#board.boardId,
        cardId: card.id,
        actor: 'human',
        mode: 'manual',
        reason: 'Requested from workflow board.',
        expectedVersion: card.version,
      });
      await this.loadBoard({ silent: true, reason: 'orchestrate-result' });
      this.#setBanner('success', payload?.result?.sideEffects?.length
        ? tPortal('workflow.banner.orchestrationRequested', { title: card.title })
        : tPortal('workflow.banner.runRecorded', { title: card.title }));
      return payload;
    } catch (error) {
      this.#setBanner('error', error?.message || String(error));
      return null;
    }
  }

  async controlCard(action, options = {}) {
    let card = this.#cardById(options.cardId || this.#selectedCardId);
    if (!this.#board || !card || !action) return null;
    this.#setBanner('running', tPortal('workflow.banner.controlRequested', {
      action: tEnum(action),
      title: card.title,
    }));
    try {
      let payload = await controlWorkflowCard({
        boardId: this.#board.boardId,
        cardId: card.id,
        action,
        actor: 'human',
        reason: `${formatLabel(action)} from workflow board.`,
        expectedVersion: card.version,
      });
      await this.loadBoard({ silent: true, reason: 'control-result' });
      this.#setBanner('success', tPortal('workflow.banner.controlApplied', {
        action: tEnum(action),
        title: card.title,
      }));
      return payload;
    } catch (error) {
      this.#setBanner('error', error?.message || String(error));
      return null;
    }
  }

  async deleteCard(options = {}) {
    let card = this.#cardById(options.cardId || this.#selectedCardId);
    if (!this.#board || !card) return null;
    let confirmed = globalThis.confirm?.(tPortal('workflow.confirm.delete', { title: card.title })) ?? true;
    if (!confirmed) return null;
    this.#setBanner('running', tPortal('workflow.banner.deleting', { title: card.title }));
    try {
      let payload = await deleteWorkflowCard({
        boardId: this.#board.boardId,
        cardId: card.id,
        actor: 'human',
        reason: 'Deleted from workflow board.',
        expectedVersion: card.version,
      });
      if (this.#selectedCardId === card.id) this.#selectedCardId = '';
      await this.loadBoard({ silent: true, reason: 'delete-result' });
      this.#setBanner('success', tPortal('workflow.banner.deleted', { title: card.title }));
      return payload;
    } catch (error) {
      this.#setBanner('error', error?.message || String(error));
      return null;
    }
  }

  async saveColumnSettings(columnId = '') {
    let column = this.#columnById(columnId);
    if (!this.#board || !column) return null;
    let form = this.ref.boardView.querySelector(`[data-column-settings-form="${column.id}"]`);
    if (!form) return null;
    let valueFor = (field) => form.querySelector(`[data-column-field="${field}"]`)?.value?.trim() || '';
    let agents = valueFor('agents')
      .split(',')
      .map(item => normalizeText(item))
      .filter(Boolean);
    let parallelValue = Number(valueFor('parallelLimit'));
    let automation = {
      trigger: valueFor('trigger'),
      action: valueFor('action'),
      mode: valueFor('mode'),
      approvalMode: valueFor('approvalMode'),
      agents,
      ...(Number.isFinite(parallelValue) && parallelValue > 0 ? { parallelLimit: Math.floor(parallelValue) } : {}),
    };
    this.#setBanner('running', tPortal('workflow.banner.savingColumn', { column: column.title }));
    try {
      let payload = await updateWorkflowColumn({
        boardId: this.#board.boardId,
        columnId: column.id,
        patch: { automation },
        actor: 'human',
        reason: 'Updated from workflow board column settings.',
        expectedVersion: this.#board.version,
      });
      await this.loadBoard({ silent: true, reason: 'column-settings-save' });
      this.#setBanner('success', tPortal('workflow.banner.columnSaved', { column: column.title }));
      return payload;
    } catch (error) {
      this.#setBanner('error', error?.message || String(error));
      return null;
    }
  }

  async saveBoardSettings() {
    if (!this.#board) return null;
    let agents = normalizeText(this.ref.boardAgentsInput.value)
      .split(',')
      .map(item => normalizeText(item))
      .filter(Boolean);
    let parallelValue = Number(this.ref.boardParallelInput.value);
    let automation = {
      pickup: this.ref.boardPickupSelect.value,
      recovery: this.ref.boardRecoverySelect.value,
      defaultApprovalMode: this.ref.boardApprovalSelect.value,
      fallbackAgents: agents,
      ...(Number.isFinite(parallelValue) && parallelValue > 0 ? { globalParallelLimit: Math.floor(parallelValue) } : {}),
    };
    this.#setBanner('running', tPortal('workflow.banner.savingBoard'));
    try {
      let payload = await updateWorkflowBoardAutomation({
        boardId: this.#board.boardId,
        mode: this.ref.boardModeSelect.value,
        patch: { automation },
        actor: 'human',
        reason: 'Updated from workflow board automation panel.',
        expectedVersion: this.#board.version,
      });
      this.ref.boardSettings.open = false;
      await this.loadBoard({ silent: true, reason: 'board-settings-save' });
      this.#setBanner('success', tPortal('workflow.banner.boardSaved'));
      return payload;
    } catch (error) {
      this.#setBanner('error', error?.message || String(error));
      return null;
    }
  }

  async controlBoard(action = '') {
    if (!this.#board || !action) return null;
    if (action === 'stop') {
      let confirmed = globalThis.confirm?.(tPortal('workflow.confirm.stopBoard')) ?? true;
      if (!confirmed) return null;
    }
    let filters = this.#scopeState();
    this.#setBanner('running', tPortal('workflow.banner.boardControl', { action: tEnum(action) }));
    try {
      let payload = await controlWorkflowBoard({
        boardId: this.#board.boardId,
        projectId: filters.projectId,
        action,
        actor: 'human',
        reason: `${formatLabel(action)} from workflow board automation panel.`,
      });
      await this.loadBoard({ silent: true, reason: 'board-control' });
      this.#setBanner('success', tPortal('workflow.banner.boardControlApplied', { action: tEnum(action) }));
      return payload;
    } catch (error) {
      this.#setBanner('error', error?.message || String(error));
      return null;
    }
  }

  async reconcileRecovery() {
    let filters = this.#scopeState();
    this.#setBanner('running', tPortal('workflow.banner.reconciling'));
    try {
      let payload = await reconcileWorkflowRecovery({
        boardId: filters.boardId || this.#board?.boardId,
        projectId: filters.projectId,
        actor: 'human',
      });
      await this.loadBoard({ silent: true, reason: 'recovery-reconcile' });
      let count = payload?.reconciled?.length ?? 0;
      this.#setBanner('success', tPortal('workflow.banner.reconciled', { count }));
      return payload;
    } catch (error) {
      this.#setBanner('error', error?.message || String(error));
      return null;
    }
  }

  async importWorkItems() {
    let filters = this.#scopeState();
    this.#setBanner('running', tPortal('workflow.banner.importing'));
    try {
      let payload = await importWorkflowWorkItems({
        boardId: filters.boardId || this.#board?.boardId,
        projectId: filters.projectId,
        actor: 'human',
      });
      await this.loadBoard({ silent: true, reason: 'markdown-import' });
      let count = payload?.count ?? payload?.imported?.length ?? 0;
      this.#setBanner('success', tPortal('workflow.banner.imported', { count }));
      return payload;
    } catch (error) {
      this.#setBanner('error', error?.message || String(error));
      return null;
    }
  }

  #setOptionalAttribute(name, value) {
    let text = normalizeText(value);
    if (text) {
      this.setAttribute(name, text);
    } else {
      this.removeAttribute(name);
    }
  }

  #scopeState() {
    let route = getRoute?.() || {};
    let query = parseQuery?.(route.query || '') || {};
    let routeProjectId = normalizeText(query.project || query.projectId);
    let activeProjectId = normalizeText(dashState.activeProjectId);
    let projectId = normalizeText(this.getAttribute('project-id') || routeProjectId || activeProjectId);
    let scope = normalizeText(this.getAttribute('scope'), projectId ? 'project' : DEFAULT_SCOPE);
    let boardId = normalizeText(this.getAttribute('board-id'));
    let mode = normalizeText(this.getAttribute('mode'));
    let goalId = normalizeText(query.goal || query.goalId);
    let chatId = normalizeText(query.chat || query.chatId);
    return { scope, projectId, boardId, mode, goalId, chatId };
  }

  #invalidateRenderContext() {
    this.#renderContext = null;
    this.#renderContextBoard = null;
    this.#renderContextScopeKey = '';
  }

  #getRenderContext() {
    let scope = this.#scopeState();
    let scopeKey = workflowBoardRenderScopeKey(scope);
    if (
      this.#renderContext
      && this.#renderContextBoard === this.#board
      && this.#renderContextScopeKey === scopeKey
    ) {
      return this.#renderContext;
    }
    this.#renderContext = createWorkflowBoardRenderContext(this.#board, scope);
    this.#renderContextBoard = this.#board;
    this.#renderContextScopeKey = scopeKey;
    return this.#renderContext;
  }

  #ensureSelection(context = this.#getRenderContext()) {
    let cards = context.visibleCards;
    if (context.visibleCardById.has(this.#selectedCardId)) return;
    this.#selectedCardId = cards[0]?.id || '';
  }

  #selectedCard() {
    return this.#cardById(this.#selectedCardId);
  }

  #cardById(cardId = '') {
    let id = normalizeText(cardId);
    return this.#getRenderContext().cardsById.get(id) || null;
  }

  #columnTitle(columnId = '') {
    let column = this.#getRenderContext().columnById.get(columnId);
    return column?.title || formatLabel(columnId);
  }

  #columnById(columnId = '') {
    let id = normalizeText(columnId);
    return this.#getRenderContext().columnById.get(id) || null;
  }

  #render() {
    let board = this.#board;
    if (!board) {
      this.#renderEmptyShell();
      return;
    }
    let context = this.#getRenderContext();
    this.#ensureSelection(context);
    this.$.modeLabel = formatMode(board.mode);
    this.$.scopeLabel = board.projectId
      ? tPortal('workflow.scope.project', { projectId: board.projectId })
      : tPortal('workflow.scope.generic', { scope: formatLabel(board.scope) });
    this.ref.modeBadge.setAttribute('variant', BOARD_MODE_VARIANTS[board.mode] || 'info');
    this.#syncBoardAutomationControls();
    this.#renderBoardHistory();
    this.#renderStatusReadout(context);
    this.#renderColumns(context);
    if (this.#activeView === 'graph') this.#renderGraph(context);
  }

  setView(view = 'kanban') {
    let next = BOARD_VIEWS.has(view) ? view : 'kanban';
    if (next === this.#activeView) return;
    this.#activeView = next;
    this.#syncViewControls();
    if (next === 'graph') {
      this.#renderGraph();
      this.#fitGraph();
    }
  }

  #syncViewControls() {
    let isGraph = this.#activeView === 'graph';
    this.ref.kanbanRegion.hidden = isGraph;
    this.ref.graphRegion.hidden = !isGraph;
    this.ref.kanbanViewBtn.setAttribute('aria-pressed', String(!isGraph));
    this.ref.graphViewBtn.setAttribute('aria-pressed', String(isGraph));
    this.ref.kanbanViewBtn.classList.toggle('is-active', !isGraph);
    this.ref.graphViewBtn.classList.toggle('is-active', isGraph);
  }

  #renderGraph(context = this.#getRenderContext()) {
    let cards = context.visibleCards;
    let signature = workflowBoardGraphTopologySignature(context);
    let rebuilt = false;
    if (!this.#graphRenderCache || this.#graphRenderCache.signature !== signature) {
      let projection = buildWorkflowBoardProjectionFromContext(context);
      this.#graphRenderCache = {
        signature,
        graphModel: buildWorkflowBoardGraphModel(projection),
        canvasModel: buildWorkflowBoardCanvasGraphModel(projection),
      };
      rebuilt = true;
    }
    let hasCards = cards.length > 0;
    this.ref.graphEmpty.hidden = hasCards;
    if (rebuilt) this.ref.graphCanvas.setGraphModel?.(this.#graphRenderCache.canvasModel);
    this.#renderGraphStats(this.#graphRenderCache.graphModel);
  }

  #renderGraphStats(model) {
    let summary = summarizeWorkflowBoardGraphModel(model);
    let metadata = summary.metadata || {};
    this.ref.graphStats.textContent = [
      tPortal('workflow.graph.columns', { count: metadata.columnCount ?? 0 }),
      tPortal('workflow.graph.cards', { count: metadata.cardCount ?? 0 }),
      tPortal('workflow.graph.transitions', { count: metadata.transitionCount ?? 0 }),
      metadata.dependencyCount ? tPortal('workflow.graph.deps', { count: metadata.dependencyCount }) : '',
      metadata.blockedOnDependencyCount ? tPortal('workflow.graph.blocked', { count: metadata.blockedOnDependencyCount }) : '',
    ].filter(Boolean).join(' · ');
  }

  #fitGraph() {
    if (this.#activeView !== 'graph') return;
    requestAnimationFrame(() => {
      let didFit = this.ref.graphCanvas.fitView?.({ padding: 48, animate: true });
      if (!didFit) this.ref.graphCanvas.resetView?.();
    });
  }

  #renderEmptyShell() {
    this.#graphRenderCache = null;
    this.$.modeLabel = formatMode('passive');
    this.$.scopeLabel = tPortal('workflow.scope.none');
    this.ref.boardView.setBoard({ columns: [] });
    this.ref.boardReadout.textContent = '';
    this.#syncBoardAutomationControls();
    this.#renderBoardHistory();
    this.ref.emptyState.hidden = false;
    this.ref.graphCanvas.setGraphModel?.({ nodes: [], edges: [], rootNodes: [] });
    this.ref.graphStats.textContent = '';
    this.ref.graphEmpty.hidden = false;
    this.#publishSelection('empty-shell');
  }

  // U10: the panel's static chrome (icon tooltips, group/region aria-labels, select option labels,
  // empty states) is localized once at init from portal.workflow.* keys. Board DATA — column titles,
  // card titles/summaries, agent names, resource-group names — is never translated.
  #localizeChrome() {
    let labelControl = (element, key) => {
      if (!element) return;
      let value = tPortal(key);
      element.setAttribute('title', value);
      element.setAttribute('aria-label', value);
    };
    labelControl(this.ref.kanbanViewBtn, 'workflow.view.kanban');
    labelControl(this.ref.graphViewBtn, 'workflow.view.graph');
    labelControl(this.ref.pauseBoardBtn, 'workflow.toolbar.pause');
    labelControl(this.ref.resumeBoardBtn, 'workflow.toolbar.resume');
    labelControl(this.ref.drainBoardBtn, 'workflow.toolbar.drain');
    labelControl(this.ref.stopBoardBtn, 'workflow.toolbar.stop');
    labelControl(this.ref.importBtn, 'workflow.toolbar.import');
    labelControl(this.ref.reconcileBtn, 'workflow.toolbar.reconcile');
    labelControl(this.ref.graphFitBtn, 'workflow.graph.fit');
    labelControl(this.ref.boardSettings.querySelector('summary'), 'workflow.toolbar.settings');
    this.querySelector('.wb-controls')?.setAttribute('aria-label', tPortal('workflow.controls.label'));
    this.querySelector('.wb-view-toggle')?.setAttribute('aria-label', tPortal('workflow.view.group'));
    this.ref.kanbanRegion.setAttribute('aria-label', tPortal('workflow.kanban.region'));
    this.ref.graphRegion.setAttribute('aria-label', tPortal('workflow.graph.region'));
    this.ref.boardView.setAttribute('label', tPortal('workflow.kanban.region'));
    this.ref.boardView.setAttribute('empty-text', tPortal('workflow.empty.columns'));
    this.ref.emptyState.textContent = tPortal('workflow.empty.cards');
    this.ref.graphEmpty.textContent = tPortal('workflow.empty.graph');
    this.ref.lblBoardMode.textContent = tPortal('workflow.settings.mode');
    this.ref.lblBoardPickup.textContent = tPortal('workflow.settings.pickup');
    this.ref.lblBoardRecovery.textContent = tPortal('workflow.settings.recovery');
    this.ref.lblBoardParallel.textContent = tPortal('workflow.settings.parallelLimit');
    this.ref.lblBoardApproval.textContent = tPortal('workflow.settings.approval');
    this.ref.lblBoardAgents.textContent = tPortal('workflow.settings.fallbackAgents');
    this.ref.saveBoardLabel.textContent = tPortal('workflow.settings.saveBoard');
    let optionSelects = [
      this.ref.boardModeSelect,
      this.ref.boardPickupSelect,
      this.ref.boardRecoverySelect,
      this.ref.boardApprovalSelect,
    ];
    for (let select of optionSelects) {
      for (let option of select.options) option.textContent = tEnum(option.value || 'default');
    }
  }

  // U12: the toolbar was 7 icon-only buttons in one flat row with no grouping and no active-state
  // indication. Re-parent the existing button refs (already created by the template) into labeled
  // groups once at init: a mode-toggle group (Pause/Resume collapse into one control below), a
  // destructive-automation group (Drain/Stop), and a routine-maintenance group (Import/Reconcile) —
  // separated by a visible divider so destructive actions are not adjacent to routine ones.
  #groupToolbarControls() {
    let actions = this.ref.pauseBoardBtn.parentElement;
    if (!actions || actions.dataset.wbGrouped === 'true') return;
    actions.dataset.wbGrouped = 'true';

    // U12: surface the recovery count as its own visible flag ahead of the routine status text
    // instead of burying it in the truncating readout string.
    let recoveryFlag = makeElement('span', 'wb-recovery-flag');
    recoveryFlag.hidden = true;
    recoveryFlag.setAttribute('role', 'status');
    this.ref.boardReadout.before(recoveryFlag);
    this.ref.boardRecoveryFlag = recoveryFlag;

    let modeGroup = makeElement('div', 'wb-toolbar-group');
    modeGroup.setAttribute('role', 'group');
    modeGroup.setAttribute('aria-label', tPortal('workflow.toolbar.modeGroup'));
    modeGroup.append(this.ref.pauseBoardBtn, this.ref.resumeBoardBtn);

    let destructiveGroup = makeElement('div', 'wb-toolbar-group wb-toolbar-group-danger');
    destructiveGroup.setAttribute('role', 'group');
    destructiveGroup.setAttribute('aria-label', tPortal('workflow.toolbar.dangerGroup'));
    destructiveGroup.append(this.ref.drainBoardBtn, this.ref.stopBoardBtn);

    let maintenanceGroup = makeElement('div', 'wb-toolbar-group');
    maintenanceGroup.setAttribute('role', 'group');
    maintenanceGroup.setAttribute('aria-label', tPortal('workflow.toolbar.maintenanceGroup'));
    maintenanceGroup.append(this.ref.importBtn, this.ref.reconcileBtn);

    let viewToggle = actions.querySelector('.wb-view-toggle');
    let boardSettings = this.ref.boardSettings;
    actions.replaceChildren();
    if (viewToggle) actions.append(viewToggle);
    actions.append(modeGroup, destructiveGroup, maintenanceGroup);
    if (boardSettings) actions.append(boardSettings);
  }

  #syncBoardAutomationControls() {
    let board = this.#board;
    let mode = normalizeText(board?.mode, 'passive');
    let hasBoard = Boolean(board);
    let canResume = RESUMABLE_BOARD_MODES.has(mode) || mode === 'manual' || mode === 'passive';
    let isPaused = mode === 'paused' || mode === 'stopped';
    // Pause and Resume previously were both always visible regardless of board mode. Show only the
    // action that currently applies — a single mode-aware toggle instead of two competing buttons.
    this.ref.pauseBoardBtn.hidden = isPaused;
    this.ref.resumeBoardBtn.hidden = !isPaused;
    this.ref.pauseBoardBtn.disabled = !hasBoard || isPaused;
    this.ref.resumeBoardBtn.disabled = !hasBoard || !canResume;
    this.ref.drainBoardBtn.disabled = !hasBoard || mode === 'draining' || mode === 'stopped';
    this.ref.drainBoardBtn.classList.toggle('is-active', mode === 'draining');
    this.ref.drainBoardBtn.setAttribute('aria-pressed', String(mode === 'draining'));
    this.ref.stopBoardBtn.disabled = !hasBoard || mode === 'stopped';
    this.ref.stopBoardBtn.classList.toggle('is-active', mode === 'stopped');
    this.ref.stopBoardBtn.setAttribute('aria-pressed', String(mode === 'stopped'));
    this.ref.importBtn.disabled = !hasBoard;
    this.ref.reconcileBtn.disabled = !hasBoard;
    if (!hasBoard || this.ref.boardSettings?.open) return;
    let automation = board.automation || {};
    this.ref.boardModeSelect.value = [...this.ref.boardModeSelect.options].some(option => option.value === mode)
      ? mode
      : 'armed';
    this.ref.boardPickupSelect.value = automation.pickup || 'auto';
    this.ref.boardRecoverySelect.value = automation.recovery || 'manual';
    this.ref.boardApprovalSelect.value = automation.defaultApprovalMode || '';
    this.ref.boardParallelInput.value = automation.globalParallelLimit || '';
    this.ref.boardAgentsInput.value = asArray(automation.fallbackAgents).join(', ');
  }

  #renderError(error) {
    this.#setBanner('error', error?.message || String(error));
    this.#renderEmptyShell();
    this.ref.emptyState.textContent = tPortal('workflow.error.unavailable');
  }

  // U12: the readout previously buried the one alarming signal (recovery count) among routine facts
  // in a single ellipsis-truncating string. Surface "N recovery" as its own warning-kind chip ahead
  // of the routine readout text, and give the routine text a title/aria-label carrying the FULL
  // string (not just the visibly truncated portion) so a hover or screen reader gets everything
  // that does not fit — an accessible alternative to a title-attribute-only tooltip.
  #renderStatusReadout(context = this.#getRenderContext()) {
    let scope = this.#scopeState();
    let count = context.visibleCards.length;
    // "Updated" must reflect real board ACTIVITY (cards/runs/leases/events), not board.updatedAt —
    // that field only moves on board CONFIG changes and read days stale on a live autonomous board.
    let updated = formatDateTime(this.#board?.lastActivityAt || this.#board?.updatedAt);
    let counters = this.#board?.counters || {};
    let automation = this.#board?.automation || {};
    let lastEvent = asArray(this.#board?.events).filter(event => normalizeText(event.eventType).startsWith('board_')).at(-1);
    let recoveryCount = Number(counters.recovery) || 0;

    if (this.ref.boardRecoveryFlag) {
      this.ref.boardRecoveryFlag.hidden = recoveryCount <= 0;
      if (recoveryCount > 0) {
        let detail = tPortal('workflow.recovery.detail', { count: recoveryCount });
        this.ref.boardRecoveryFlag.textContent = tPortal('workflow.recovery.flag', { count: recoveryCount });
        // U15: the detail is exposed both visibly (title) and to assistive tech (aria-label), not
        // as a title-attribute-only tooltip.
        this.ref.boardRecoveryFlag.title = detail;
        this.ref.boardRecoveryFlag.setAttribute('aria-label', detail);
      }
    }

    let readoutText = [
      tPortal('workflow.readout.visible', { count }),
      scope.goalId ? tPortal('workflow.readout.goal', { id: scope.goalId.slice(0, 8) }) : '',
      scope.chatId ? tPortal('workflow.readout.chat', { id: scope.chatId.slice(0, 8) }) : '',
      counters.active ? tPortal('workflow.readout.active', { count: counters.active }) : '',
      automation.pickup ? tPortal('workflow.readout.pickup', { pickup: tEnum(automation.pickup) }) : '',
      automation.globalParallelLimit ? tPortal('workflow.readout.limit', { limit: automation.globalParallelLimit }) : '',
      lastEvent ? tPortal('workflow.readout.lastEvent', { event: formatLabel(lastEvent.eventType) }) : '',
      updated ? tPortal('workflow.readout.updated', { time: updated }) : '',
    ].filter(Boolean).join(' · ');
    this.ref.boardReadout.textContent = readoutText;
    this.ref.boardReadout.title = readoutText;
    this.ref.boardReadout.setAttribute('aria-label', readoutText);
  }

  #renderBoardHistory() {
    if (!this.ref.boardHistory) return;
    let events = asArray(this.#board?.events)
      .filter(event => normalizeText(event.eventType).startsWith('board_'))
      .slice(-3)
      .reverse();
    if (!events.length) {
      this.ref.boardHistory.replaceChildren(makeElement('div', 'wb-board-history-row', tPortal('workflow.history.empty')));
      return;
    }
    this.ref.boardHistory.replaceChildren(...events.map((event) => {
      let row = makeElement('div', 'wb-board-history-row');
      row.append(
        makeElement('strong', '', formatLabel(event.eventType)),
        makeElement('span', '', [
          event.note || event.reason,
          event.actor,
          formatDateTime(eventTimestamp(event)),
        ].filter(Boolean).join(' · ')),
      );
      return row;
    }));
  }

  #renderColumns(context = this.#getRenderContext()) {
    let columns = context.columns;
    let hasCards = columns.some(column => column.cards.length);
    this.ref.emptyState.hidden = hasCards;
    this.ref.emptyState.textContent = hasCards ? '' : tPortal('workflow.empty.cards');
    let downstream = context.downstreamDependencyCounts;
    this.ref.boardView.setBoard({
      id: this.#board?.boardId || this.#board?.id || '',
      title: this.#board?.title || tPortal('text.workflowBoard'),
      mode: this.#board?.mode || '',
      columns: columns.map(column => ({
        id: column.id,
        title: column.title,
        description: column.description || column.gate || '',
        automation: column.automation,
        boardMode: this.#board?.mode || '',
        headerRevision: this.#columnHeaderRevision,
        cards: column.cards.map(card => this.#toKanbanCard(card, downstream)),
      })),
    }, {
      renderColumnHeader: this.#renderColumnHeaderBound,
    });
    for (let id of this.#columnHeaderCache.keys()) {
      if (!columns.some(column => column.id === id)) this.#columnHeaderCache.delete(id);
    }
  }

  // U05: chip budget. A card needs at most a handful of at-a-glance signals — everything else
  // belongs to the inspector, not the card face. `FOOTER_CHIP_BUDGET` footer chips render in full;
  // any remainder collapses into one "+N" overflow chip (sn-kanban-board's `data-kind="overflow"`
  // affordance) instead of dumping every available signal onto the card.
  static #FOOTER_CHIP_BUDGET = 4;

  // Agents declare their own identity (icon + color) in team-memory frontmatter; the chip carries
  // it so a card's executor reads at a glance. Unknown/undeclared agents fall back to the generic
  // robot marker with the theme accent.
  static #agentChip(agent) {
    let meta = agentCatalogSnapshot().get(agent);
    return {
      label: agent,
      icon: meta?.icon || 'smart_toy',
      kind: 'agent',
      accent: meta?.color || '',
      title: meta?.description || agent,
    };
  }

  #toKanbanCard(card, downstream = new Map()) {
    let nextColumn = getAdjacentColumn(this.#board, card.columnId, 1);
    let runtimeOnly = isRuntimeOnlyCard(card);
    let agent = agentName(card, latestRun(card));
    let blockedBy = asArray(card.raw?.dependsOn ?? card.dependsOn).length;
    let unlocks = downstream.get(card.id) ?? 0;

    let footerCandidates = cardFooterChips(card, {
      blockedBy,
      unlocks,
      agentChip: agent ? WorkflowBoard.#agentChip(agent) : null,
    });
    let footer = footerCandidates.slice(0, WorkflowBoard.#FOOTER_CHIP_BUDGET);
    let overflowCount = footerCandidates.length - footer.length;
    if (overflowCount > 0) {
      footer.push({
        label: `+${overflowCount}`,
        kind: 'overflow',
        title: tPortal('workflow.card.overflowTitle', { count: overflowCount }),
      });
    }

    return {
      id: card.id,
      columnId: card.columnId,
      title: card.title,
      // Backward-compat only: the fixed-geometry card no longer renders a summary line (long texts
      // live in the inspector), but the normalized model still accepts the field.
      summary: card.summary || '',
      busy: isCardActive(card),
      // The one-line "last agent action / live status" row between title and footer.
      ticker: deriveCardTicker(card),
      meta: cardMetaChips(card),
      footer,
      actions: this.#cardActions(card, nextColumn, runtimeOnly),
      draggable: !runtimeOnly,
      raw: card,
    };
  }

  #cardActions(card, nextColumn, runtimeOnly) {
    if (runtimeOnly) {
      return card.entityRefs?.chatId ? [{
        id: 'open:chat',
        icon: 'forum',
        title: tPortal('workflow.cardAction.openChat'),
      }] : [];
    }

    let actions = [];
    if (nextColumn && LAUNCH_COLUMNS.has(card.columnId)) {
      actions.push({
        id: `transition:${nextColumn.id}`,
        icon: 'play_arrow',
        title: tPortal('workflow.cardAction.launchTo', { column: nextColumn.title }),
      });
    } else if (card.columnId === 'ready') {
      actions.push({
        id: 'orchestrate',
        icon: 'play_arrow',
        title: tPortal('workflow.cardAction.orchestrate'),
      });
    } else if (nextColumn) {
      actions.push({
        id: `transition:${nextColumn.id}`,
        icon: 'arrow_forward',
        title: tPortal('workflow.cardAction.moveTo', { column: nextColumn.title }),
      });
    }

    if (ACTIVE_CONTROL_COLUMNS.has(card.columnId)) {
      actions.push(
        { id: 'control:pause', icon: 'pause', title: tPortal('workflow.cardAction.pause') },
        { id: 'control:stop', icon: 'stop', title: tPortal('workflow.cardAction.stop') },
        { id: 'control:cancel', icon: 'cancel', title: tPortal('workflow.cardAction.cancel') },
      );
    }
    let activeRun = cardHasActiveRun(card);
    actions.push({
      id: 'delete',
      icon: 'delete',
      title: activeRun ? tPortal('workflow.cardAction.deleteBlocked') : tPortal('workflow.cardAction.delete'),
      kind: 'danger',
      disabled: activeRun,
    });
    return actions;
  }

  // Memoization wrapper around #renderColumnHeader: an unchanged column config returns the SAME
  // element (no rebuild); a changed config with an OPEN settings popover keeps serving the stale
  // header and reconciles when the popover closes, so a silent refresh never eats an in-progress edit.
  #memoizedColumnHeader(column) {
    let automation = column.raw?.automation || column.automation || {};
    let key = JSON.stringify({
      id: column.id,
      title: column.title,
      description: column.description || '',
      count: column.count ?? null,
      boardMode: this.#board?.mode || '',
      automation,
    });
    let cached = this.#columnHeaderCache.get(column.id);
    if (cached) {
      if (cached.key === key) return cached.element;
      if (cached.element.querySelector('details[open]')) {
        cached.stale = true;
        return cached.element;
      }
    }
    let element = this.#renderColumnHeader(column);
    let entry = { key, element, stale: false };
    element.querySelector('details.wb-column-settings')?.addEventListener('toggle', (event) => {
      if (!event.target.open && entry.stale) {
        entry.stale = false;
        this.#columnHeaderCache.delete(column.id);
        this.#columnHeaderRevision += 1;
        this.#renderColumns();
      }
    });
    this.#columnHeaderCache.set(column.id, entry);
    return element;
  }

  #renderColumnHeader(column) {
    let root = makeElement('div', 'wb-column-head');
    let copy = makeElement('div', 'wb-column-copy');
    copy.append(makeElement('div', 'sn-kanban-column-title', column.title));
    if (column.description) {
      copy.append(makeElement('div', 'sn-kanban-column-description', column.description));
    }
    // The chip shows the EFFECTIVE execution mode (board mode × column mode); the configured mode
    // and trigger live in the tooltip and the settings popover, not in the chip row.
    let summary = effectiveColumnAutomation(this.#board?.mode, column.raw?.automation || column.automation || {});
    let policy = makeElement('div', 'wb-column-policy');
    policy.append(makeChip(summary.label, summary.kind, { icon: summary.icon, title: summary.title }));
    copy.append(policy);
    let tools = makeElement('div', 'wb-column-tools');
    tools.append(
      makeElement('span', 'sn-kanban-column-count', String(column.count)),
    );
    root.append(copy, tools, this.#renderColumnSettingsControl(column));
    return root;
  }

  #renderColumnSettingsControl(column) {
    let automation = column.automation || {};
    let details = makeElement('details', 'wb-column-settings');
    details.dataset.columnSettingsPanel = column.id;
    let summary = makeElement('summary', 'wb-column-settings-summary');
    let settingsLabel = tPortal('workflow.column.settings');
    summary.title = settingsLabel;
    summary.setAttribute('aria-label', settingsLabel);
    summary.append(makeIcon('settings'));
    let form = makeElement('div', 'wb-settings-form');
    form.dataset.columnSettingsForm = column.id;
    form.append(
      createField(tPortal('workflow.column.trigger'), createSelect(automation.trigger || 'manual', COLUMN_TRIGGERS, { columnField: 'trigger' })),
      createField(tPortal('workflow.column.action'), createSelect(automation.action || '', COLUMN_ACTIONS, { columnField: 'action' })),
      createField(tPortal('workflow.column.mode'), createSelect(automation.mode || 'manual', COLUMN_MODES, { columnField: 'mode' })),
      createField(tPortal('workflow.column.approval'), createSelect(automation.approvalMode || '', COLUMN_APPROVAL_MODES, { columnField: 'approvalMode' })),
      createField(tPortal('workflow.column.agentPool'), createTextInput(asArray(automation.agents).join(', '), { columnField: 'agents' }, { placeholder: 'orchestrator, reviewer' })),
      createField(tPortal('workflow.column.parallelLimit'), createTextInput(automation.parallelLimit || '', { columnField: 'parallelLimit' }, { type: 'number', min: 1 })),
    );
    let actionRow = makeElement('div', 'wb-action-row');
    actionRow.append(createButton(tPortal('workflow.column.save'), {
      variant: 'primary',
      icon: 'save',
      dataset: { columnSettingsSave: column.id },
    }));
    details.append(summary, form, actionRow);
    return details;
  }

  #onBoardHeaderClick(event) {
    let columnSave = event.target?.closest?.('[data-column-settings-save]');
    if (columnSave) {
      event.preventDefault();
      event.stopPropagation();
      this.saveColumnSettings(columnSave.dataset.columnSettingsSave);
      return;
    }
    let settings = event.target?.closest?.('[data-column-settings-panel]');
    if (!settings) return;
    event.stopPropagation();
  }

  #onBoardCardSelect(event) {
    let cardId = event.detail?.card?.id;
    if (cardId) this.selectCard(cardId);
  }

  #onBoardCardAction(event) {
    let cardId = event.detail?.card?.id;
    let actionId = normalizeText(event.detail?.actionId);
    if (!cardId || !actionId) return;
    if (actionId.startsWith('transition:')) {
      this.requestTransition({
        cardId,
        toColumnId: actionId.slice('transition:'.length),
      });
      return;
    }
    if (actionId === 'orchestrate') {
      this.orchestrateCard({ cardId });
      return;
    }
    if (actionId.startsWith('control:')) {
      this.controlCard(actionId.slice('control:'.length), { cardId });
      return;
    }
    if (actionId === 'delete') {
      this.deleteCard({ cardId });
      return;
    }
    if (actionId === 'open:chat') {
      let card = this.#cardById(cardId);
      let chatId = card?.entityRefs?.chatId;
      openChat(chatId);
      this.#dispatch('workflow-card-open', eventDetail(this.#board, card, {
        refType: 'chat',
        refId: chatId,
      }));
    }
  }

  #onBoardCardDrop(event) {
    let cardId = event.detail?.card?.id;
    let toColumnId = event.detail?.toColumnId;
    if (!cardId || !toColumnId) return;
    this.requestTransition({ cardId, toColumnId });
  }

  #publishSelection(reason = '') {
    setWorkflowBoardSelection({
      ...eventDetail(this.#board, this.#selectedCard(), { reason }),
    }, {
      preserveEmpty: !['empty-shell', 'delete-result'].includes(reason),
    });
  }

  #setBanner(kind, message) {
    this.ref.statusBanner.hidden = false;
    this.ref.statusBanner.setAttribute('variant', kind);
    this.ref.statusBanner.textContent = message;
  }

  #clearBanner() {
    this.ref.statusBanner.hidden = true;
    this.ref.statusBanner.textContent = '';
    this.ref.statusBanner.removeAttribute('variant');
  }

  #dispatch(name, detail = {}, options = {}) {
    let event = new CustomEvent(name, {
      bubbles: true,
      composed: true,
      cancelable: Boolean(options.cancelable),
      detail,
    });
    this.dispatchEvent(event);
    return event;
  }
}

WorkflowBoard.template = template;
WorkflowBoard.rootStyles = cssShared + cssLocal;
WorkflowBoard.reg('pg-workflow-board');

export default WorkflowBoard;
