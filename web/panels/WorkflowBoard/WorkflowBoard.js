import { Symbiote } from '@symbiotejs/symbiote';
import { getRoute, parseQuery, sharedUiStyles as cssShared } from 'symbiote-ui/ui';
import 'symbiote-ui/board';
import { state as dashState } from '../../dashboard-state.js';
import {
  fetchWorkflowBoard,
  controlWorkflowCard,
  controlWorkflowBoard,
  deleteWorkflowCard,
  getAdjacentColumn,
  getCardTransitions,
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
import template from './WorkflowBoard.tpl.js';
import cssLocal from './WorkflowBoard.css.js';
import { setWorkflowBoardSelection } from './workflow-board-selection.js';
import { openChat } from '../../common/open-chat.js';
import {
  latestRun,
  agentName,
  formatDuration,
  formatTokens,
} from './workflow-card-telemetry.js';

const DEFAULT_SCOPE = 'home';
const BOARD_VIEWS = new Set(['kanban', 'graph']);
const AUTO_REFRESH_INTERVAL_MS = 15_000;
const LAUNCH_COLUMNS = new Set(['ideas', 'backlog']);
const ACTIVE_CONTROL_COLUMNS = new Set(['ready', 'in-progress', 'quality-audit', 'commit-publish']);
const RUNNING_RUN_STATUSES = new Set(['requested', 'running', 'recovering']);
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

function formatMode(value) {
  return formatLabel(value || 'passive');
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

function makeChip(text, kind = '') {
  let chip = makeElement('span', 'wb-chip', text);
  if (kind) chip.dataset.kind = kind;
  return chip;
}

function automationChips(automation = {}) {
  let chips = [];
  if (automation.trigger) chips.push({ label: formatLabel(automation.trigger), kind: automation.trigger === 'on_enter' ? 'status' : '' });
  if (automation.action) chips.push({ label: formatLabel(automation.action), kind: automation.action === 'orchestrate' ? 'status' : '' });
  if (automation.mode) chips.push({ label: formatLabel(automation.mode), kind: automation.mode === 'auto' ? 'warning' : '' });
  let agents = asArray(automation.agents).map(item => normalizeText(item)).filter(Boolean);
  if (automation.agent) agents.unshift(automation.agent);
  let agentText = [...new Set(agents)].slice(0, 3).join(', ');
  if (agentText) chips.push({ label: agentText, kind: 'status' });
  if (automation.parallelLimit) chips.push({ label: `x${automation.parallelLimit}`, kind: '' });
  return chips;
}

function flagKind(flag = '') {
  let key = normalizeText(flag).toLowerCase();
  if (key === 'blocked' || key === 'lost') return 'error';
  if (key.includes('audit') || key.includes('resume') || key === 'recovering' || key === 'stale') {
    return 'warning';
  }
  return '';
}

function statusKind(status = '') {
  let key = normalizeText(status).toLowerCase();
  if (key === 'blocked' || key === 'error' || key === 'lost') return 'error';
  if (key === 'stale' || key === 'recovering' || key === 'needs_resume') return 'warning';
  return 'status';
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
    select.append(new Option(option ? formatLabel(option) : 'Default', option));
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

function hasRunData(run = {}) {
  return Boolean(
    normalizeText(run.id)
    || normalizeText(run.status)
    || normalizeText(run.leaseOwner)
    || asArray(run.taskIds).length
    || normalizeText(run.startedAt)
    || normalizeText(run.updatedAt)
    || normalizeText(run.completedAt)
  );
}

function cardHasActiveRun(card = {}) {
  let run = hasRunData(card.run) ? card.run : null;
  let runs = [...asArray(card.runs), run].filter(Boolean);
  return runs.some(item => RUNNING_RUN_STATUSES.has(normalizeText(item.status).toLowerCase()));
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

// Reconstruct a `workflow-board-projection/v2`-shaped object from the normalized board so the pure
// board-graph adapter receives the frozen projection contract. The web normalizer keeps the original
// projection card on `card.raw`, which carries `lifecycle` / `dependsOn` / `queue`; surface those here
// without inventing values.
function projectionFromBoard(board, columns, cards) {
  let projectionCards = asArray(cards).map((card) => {
    let raw = card.raw && typeof card.raw === 'object' ? card.raw : {};
    return {
      id: card.id,
      columnId: card.columnId,
      title: card.title,
      priority: card.priority,
      status: card.status,
      lifecycle: raw.lifecycle ?? card.lifecycle ?? 'idle',
      dependsOn: raw.dependsOn ?? raw.depends_on ?? card.dependsOn ?? [],
      queue: raw.queue ?? card.queue ?? {},
    };
  });
  return {
    schema: 'workflow-board-projection/v2',
    boardId: board?.boardId || board?.id || '',
    board: {
      id: board?.boardId || board?.id || '',
      columns: asArray(columns).map(column => ({
        id: column.id,
        title: column.title,
        description: column.description || '',
        gate: column.gate || '',
        automation: column.automation || {},
      })),
      transitions: asArray(board?.transitions),
    },
    columns: asArray(columns).map(column => ({
      id: column.id,
      title: column.title,
      description: column.description || '',
      gate: column.gate || '',
      automation: column.automation || {},
      cards: asArray(column.cards).map(card => projectionCards.find(item => item.id === card.id)).filter(Boolean),
    })),
    cards: projectionCards,
    version: board?.version ?? null,
  };
}

export class WorkflowBoard extends Symbiote {
  static get observedAttributes() {
    return ['scope', 'project-id', 'board-id', 'mode'];
  }

  init$ = {
    modeLabel: formatMode('passive'),
    scopeLabel: 'Home board',
  };

  #board = null;
  #selectedCardId = '';
  #activeView = 'kanban';
  #abortController = null;
  #applyingAttributes = false;
  #lastLoadKey = '';
  #routeSyncHandler = null;
  #autoRefreshTimer = null;
  #focusSyncHandler = null;
  #visibilitySyncHandler = null;

  initCallback() {
    this.ref.pauseBoardBtn.onclick = () => this.controlBoard('pause');
    this.ref.resumeBoardBtn.onclick = () => this.controlBoard('resume');
    this.ref.drainBoardBtn.onclick = () => this.controlBoard('drain');
    this.ref.stopBoardBtn.onclick = () => this.controlBoard('stop');
    this.ref.importBtn.onclick = () => this.importWorkItems();
    this.ref.reconcileBtn.onclick = () => this.reconcileRecovery();
    this.ref.saveBoardSettingsBtn.onclick = () => this.saveBoardSettings();
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
    this.#startAutoRefresh();
    this.loadBoard();
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    this.#abortController?.abort();
    this.#abortController = null;
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
    if (this.#autoRefreshTimer) {
      globalThis.clearInterval?.(this.#autoRefreshTimer);
      this.#autoRefreshTimer = null;
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
    if (!options.silent) this.#setBanner('running', 'Loading workflow board...');

    try {
      let board = await fetchWorkflowBoard(filters, {
        signal: this.#abortController.signal,
      });
      if (loadKey !== this.#lastLoadKey) return null;
      this.#board = board;
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

  #startAutoRefresh() {
    if (this.#autoRefreshTimer) globalThis.clearInterval?.(this.#autoRefreshTimer);
    this.#autoRefreshTimer = globalThis.setInterval?.(() => {
      if (!this.isConnected || globalThis.document?.hidden) return;
      this.loadBoard({ silent: true, reason: 'auto-sync' });
    }, AUTO_REFRESH_INTERVAL_MS) || null;
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

    this.#setBanner('running', `Requesting transition to ${this.#columnTitle(toColumnId)}...`);
    try {
      let result = await requestWorkflowTransition(detail);
      this.#dispatch('workflow-board-transition-result', {
        ...detail,
        result,
      });
      await this.loadBoard({ silent: true, reason: 'transition-result' });
      this.#setBanner('success', `Transition requested for ${card.title}.`);
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
    this.#setBanner('running', `Requesting orchestration for ${card.title}...`);
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
        ? `Orchestration requested for ${card.title}.`
        : `Workflow run recorded for ${card.title}.`);
      return payload;
    } catch (error) {
      this.#setBanner('error', error?.message || String(error));
      return null;
    }
  }

  async controlCard(action, options = {}) {
    let card = this.#cardById(options.cardId || this.#selectedCardId);
    if (!this.#board || !card || !action) return null;
    this.#setBanner('running', `${formatLabel(action)} requested for ${card.title}...`);
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
      this.#setBanner('success', `${formatLabel(action)} applied to ${card.title}.`);
      return payload;
    } catch (error) {
      this.#setBanner('error', error?.message || String(error));
      return null;
    }
  }

  async deleteCard(options = {}) {
    let card = this.#cardById(options.cardId || this.#selectedCardId);
    if (!this.#board || !card) return null;
    let confirmed = globalThis.confirm?.(`Delete workflow card "${card.title}" from this board?`) ?? true;
    if (!confirmed) return null;
    this.#setBanner('running', `Deleting ${card.title}...`);
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
      this.#setBanner('success', `${card.title} deleted from the board.`);
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
    this.#setBanner('running', `Saving ${column.title} settings...`);
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
      this.#setBanner('success', `${column.title} settings saved.`);
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
    this.#setBanner('running', 'Saving board automation...');
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
      this.#setBanner('success', 'Board automation saved.');
      return payload;
    } catch (error) {
      this.#setBanner('error', error?.message || String(error));
      return null;
    }
  }

  async controlBoard(action = '') {
    if (!this.#board || !action) return null;
    if (action === 'stop') {
      let confirmed = globalThis.confirm?.('Stop all active workflow runs in this board scope?') ?? true;
      if (!confirmed) return null;
    }
    let filters = this.#scopeState();
    this.#setBanner('running', `${formatLabel(action)} board automation...`);
    try {
      let payload = await controlWorkflowBoard({
        boardId: this.#board.boardId,
        projectId: filters.projectId,
        action,
        actor: 'human',
        reason: `${formatLabel(action)} from workflow board automation panel.`,
      });
      await this.loadBoard({ silent: true, reason: 'board-control' });
      this.#setBanner('success', `${formatLabel(action)} applied to board automation.`);
      return payload;
    } catch (error) {
      this.#setBanner('error', error?.message || String(error));
      return null;
    }
  }

  async reconcileRecovery() {
    let filters = this.#scopeState();
    this.#setBanner('running', 'Reconciling workflow recovery...');
    try {
      let payload = await reconcileWorkflowRecovery({
        boardId: filters.boardId || this.#board?.boardId,
        projectId: filters.projectId,
        actor: 'human',
      });
      await this.loadBoard({ silent: true, reason: 'recovery-reconcile' });
      let count = payload?.reconciled?.length ?? 0;
      this.#setBanner('success', `Recovery reconciliation updated ${count} card${count === 1 ? '' : 's'}.`);
      return payload;
    } catch (error) {
      this.#setBanner('error', error?.message || String(error));
      return null;
    }
  }

  async importWorkItems() {
    let filters = this.#scopeState();
    this.#setBanner('running', 'Importing workflow work items...');
    try {
      let payload = await importWorkflowWorkItems({
        boardId: filters.boardId || this.#board?.boardId,
        projectId: filters.projectId,
        actor: 'human',
      });
      await this.loadBoard({ silent: true, reason: 'markdown-import' });
      let count = payload?.count ?? payload?.imported?.length ?? 0;
      this.#setBanner('success', `Imported ${count} workflow work item${count === 1 ? '' : 's'}.`);
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

  #visibleCards() {
    let cards = asArray(this.#board?.cards);
    let { goalId, chatId } = this.#scopeState();
    return cards
      .filter(card => !goalId || card.entityRefs?.goalId === goalId)
      .filter(card => !chatId || card.entityRefs?.chatId === chatId);
  }

  #columnsWithVisibleCards() {
    let visible = new Map(this.#visibleCards().map(card => [card.id, card]));
    return asArray(this.#board?.columns).map(column => ({
      ...column,
      cards: asArray(column.cards).filter(card => visible.has(card.id)),
    }));
  }

  #ensureSelection() {
    let cards = this.#visibleCards();
    if (cards.some(card => card.id === this.#selectedCardId)) return;
    this.#selectedCardId = cards[0]?.id || '';
  }

  #selectedCard() {
    return this.#cardById(this.#selectedCardId);
  }

  #cardById(cardId = '') {
    let id = normalizeText(cardId);
    return asArray(this.#board?.cards).find(card => card.id === id) || null;
  }

  #columnTitle(columnId = '') {
    let column = asArray(this.#board?.columns).find(item => item.id === columnId);
    return column?.title || formatLabel(columnId);
  }

  #columnById(columnId = '') {
    let id = normalizeText(columnId);
    return asArray(this.#board?.columns).find(item => item.id === id) || null;
  }

  #render() {
    let board = this.#board;
    if (!board) {
      this.#renderEmptyShell();
      return;
    }
    this.#ensureSelection();
    this.$.modeLabel = formatMode(board.mode);
    this.$.scopeLabel = board.projectId ? `Project: ${board.projectId}` : `${formatLabel(board.scope)} scope`;
    this.ref.modeBadge.setAttribute('variant', BOARD_MODE_VARIANTS[board.mode] || 'info');
    this.#syncBoardAutomationControls();
    this.#renderBoardHistory();
    this.#renderStatusReadout();
    this.#renderColumns();
    if (this.#activeView === 'graph') this.#renderGraph();
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

  #renderGraph() {
    let columns = this.#columnsWithVisibleCards();
    let cards = this.#visibleCards();
    let projection = projectionFromBoard(this.#board, columns, cards);
    let graphModel = buildWorkflowBoardGraphModel(projection);
    let canvasModel = buildWorkflowBoardCanvasGraphModel(projection);
    let hasCards = cards.length > 0;
    this.ref.graphEmpty.hidden = hasCards;
    this.ref.graphCanvas.setGraphModel?.(canvasModel);
    this.#renderGraphStats(graphModel);
  }

  #renderGraphStats(model) {
    let summary = summarizeWorkflowBoardGraphModel(model);
    let metadata = summary.metadata || {};
    this.ref.graphStats.textContent = [
      `${metadata.columnCount ?? 0} columns`,
      `${metadata.cardCount ?? 0} cards`,
      `${metadata.transitionCount ?? 0} transitions`,
      metadata.dependencyCount ? `${metadata.dependencyCount} deps` : '',
      metadata.blockedOnDependencyCount ? `${metadata.blockedOnDependencyCount} blocked` : '',
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
    this.$.modeLabel = formatMode('passive');
    this.$.scopeLabel = 'No board data';
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

  #syncBoardAutomationControls() {
    let board = this.#board;
    let mode = normalizeText(board?.mode, 'passive');
    let hasBoard = Boolean(board);
    this.ref.pauseBoardBtn.disabled = !hasBoard || mode === 'paused' || mode === 'stopped';
    this.ref.resumeBoardBtn.disabled = !hasBoard || (!RESUMABLE_BOARD_MODES.has(mode) && mode !== 'manual' && mode !== 'passive');
    this.ref.drainBoardBtn.disabled = !hasBoard || mode === 'draining' || mode === 'stopped';
    this.ref.stopBoardBtn.disabled = !hasBoard || mode === 'stopped';
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
    this.ref.emptyState.textContent = 'Workflow board data is unavailable.';
  }

  #renderStatusReadout() {
    let scope = this.#scopeState();
    let count = this.#visibleCards().length;
    let updated = formatDateTime(this.#board?.updatedAt);
    let counters = this.#board?.counters || {};
    let automation = this.#board?.automation || {};
    let lastEvent = asArray(this.#board?.events).filter(event => normalizeText(event.eventType).startsWith('board_')).at(-1);
    this.ref.boardReadout.textContent = [
      `${count} visible`,
      scope.goalId ? `goal ${scope.goalId.slice(0, 8)}` : '',
      scope.chatId ? `chat ${scope.chatId.slice(0, 8)}` : '',
      counters.active ? `${counters.active} active` : '',
      counters.recovery ? `${counters.recovery} recovery` : '',
      automation.pickup ? `pickup ${automation.pickup}` : '',
      automation.globalParallelLimit ? `limit ${automation.globalParallelLimit}` : '',
      lastEvent ? `last ${formatLabel(lastEvent.eventType)}` : '',
      updated ? `updated ${updated}` : '',
    ].filter(Boolean).join(' · ');
  }

  #renderBoardHistory() {
    if (!this.ref.boardHistory) return;
    let events = asArray(this.#board?.events)
      .filter(event => normalizeText(event.eventType).startsWith('board_'))
      .slice(-3)
      .reverse();
    if (!events.length) {
      this.ref.boardHistory.replaceChildren(makeElement('div', 'wb-board-history-row', 'No board automation events yet.'));
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

  #renderColumns() {
    let columns = this.#columnsWithVisibleCards();
    let hasCards = columns.some(column => column.cards.length);
    this.ref.emptyState.hidden = hasCards;
    this.ref.emptyState.textContent = hasCards
      ? ''
      : [
        'No workflow cards in this scope.',
        'Import markdown work items or reconcile recovery from the board controls.',
      ].join(' ');
    this.ref.boardView.setBoard({
      id: this.#board?.boardId || this.#board?.id || '',
      title: this.#board?.title || 'Workflow Board',
      columns: columns.map(column => ({
        id: column.id,
        title: column.title,
        description: column.description || column.gate || '',
        automation: column.automation,
        cards: column.cards.map(card => this.#toKanbanCard(card)),
      })),
    }, {
      renderColumnHeader: (column) => this.#renderColumnHeader(column),
    });
  }

  #toKanbanCard(card) {
    let nextColumn = getAdjacentColumn(this.#board, card.columnId, 1);
    let runtimeOnly = isRuntimeOnlyCard(card);
    let run = latestRun(card);
    let agent = agentName(card, run);
    let duration = formatDuration(run);
    let tokens = formatTokens(run?.tokens);
    let busy = ['running', 'requested', 'recovering', 'active', 'started', 'streaming']
      .includes(normalizeText(run?.status).toLowerCase());
    return {
      id: card.id,
      columnId: card.columnId,
      title: card.title,
      summary: card.summary || 'No summary provided.',
      busy,
      meta: [
        card.projectId ? { label: card.projectId } : null,
        card.kind ? { label: card.kind } : null,
        card.priority ? { label: card.priority, kind: 'status' } : null,
      ].filter(Boolean),
      footer: [
        card.status ? { label: card.status, kind: statusKind(card.status) } : null,
        agent ? { label: agent, kind: 'status' } : null,
        duration ? { label: duration, kind: 'status' } : null,
        tokens ? { label: `${tokens} tok`, kind: 'status' } : null,
        ...card.flags.slice(0, 2).map(flag => ({ label: formatLabel(flag), kind: flagKind(flag) })),
      ].filter(Boolean),
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
        title: 'Open workflow chat',
      }] : [];
    }

    let actions = [];
    if (nextColumn && LAUNCH_COLUMNS.has(card.columnId)) {
      actions.push({
        id: `transition:${nextColumn.id}`,
        icon: 'play_arrow',
        title: `Launch to ${nextColumn.title}`,
      });
    } else if (card.columnId === 'ready') {
      actions.push({
        id: 'orchestrate',
        icon: 'play_arrow',
        title: 'Start orchestration',
      });
    } else if (nextColumn) {
      actions.push({
        id: `transition:${nextColumn.id}`,
        icon: 'arrow_forward',
        title: `Move to ${nextColumn.title}`,
      });
    }

    if (ACTIVE_CONTROL_COLUMNS.has(card.columnId)) {
      actions.push(
        { id: 'control:pause', icon: 'pause', title: 'Pause workflow card' },
        { id: 'control:stop', icon: 'stop', title: 'Stop workflow card' },
        { id: 'control:cancel', icon: 'cancel', title: 'Cancel workflow card' },
      );
    }
    let activeRun = cardHasActiveRun(card);
    actions.push({
      id: 'delete',
      icon: 'delete',
      title: activeRun ? 'Stop or cancel before deleting this workflow card' : 'Delete workflow card',
      kind: 'danger',
      disabled: activeRun,
    });
    return actions;
  }

  #renderColumnHeader(column) {
    let root = makeElement('div', 'wb-column-head');
    let copy = makeElement('div', 'wb-column-copy');
    copy.append(makeElement('div', 'sn-kanban-column-title', column.title));
    if (column.description) {
      copy.append(makeElement('div', 'sn-kanban-column-description', column.description));
    }
    let chips = makeElement('div', 'wb-column-policy');
    for (let chip of automationChips(column.raw?.automation || column.automation || {})) {
      chips.append(makeChip(chip.label, chip.kind));
    }
    if (chips.childElementCount) copy.append(chips);
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
    summary.title = 'Column settings';
    summary.setAttribute('aria-label', 'Column settings');
    summary.append(makeIcon('settings'));
    let form = makeElement('div', 'wb-settings-form');
    form.dataset.columnSettingsForm = column.id;
    form.append(
      createField('Trigger', createSelect(automation.trigger || 'manual', COLUMN_TRIGGERS, { columnField: 'trigger' })),
      createField('Action', createSelect(automation.action || '', COLUMN_ACTIONS, { columnField: 'action' })),
      createField('Mode', createSelect(automation.mode || 'manual', COLUMN_MODES, { columnField: 'mode' })),
      createField('Approval', createSelect(automation.approvalMode || '', COLUMN_APPROVAL_MODES, { columnField: 'approvalMode' })),
      createField('Agent pool', createTextInput(asArray(automation.agents).join(', '), { columnField: 'agents' }, { placeholder: 'orchestrator, reviewer' })),
      createField('Parallel limit', createTextInput(automation.parallelLimit || '', { columnField: 'parallelLimit' }, { type: 'number', min: 1 })),
    );
    let actionRow = makeElement('div', 'wb-action-row');
    actionRow.append(createButton('Save column', {
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
