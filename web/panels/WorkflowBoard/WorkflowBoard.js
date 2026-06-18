import { Symbiote } from '@symbiotejs/symbiote';
import { getRoute, parseQuery, sharedUiStyles as cssShared } from 'symbiote-ui/ui';
import {
  fetchWorkflowBoard,
  controlWorkflowCard,
  getAdjacentColumn,
  getCardTransitions,
  normalizeWorkflowBoardPayload,
  orchestrateWorkflowCard,
  reconcileWorkflowRecovery,
  requestWorkflowTransition,
} from '../../services/workflow-board.js';
import template from './WorkflowBoard.tpl.js';
import cssLocal from './WorkflowBoard.css.js';

const DEFAULT_SCOPE = 'home';
const BOARD_MODE_VARIANTS = {
  autonomous: 'success',
  armed: 'warning',
  maintenance: 'warning',
  passive: 'info',
  paused: 'info',
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
  return `Mode: ${formatLabel(value || 'passive')}`;
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

function appendDetail(details, label, value) {
  let text = normalizeText(value);
  if (!text) return;
  details.append(makeElement('dt', '', label), makeElement('dd', '', text));
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
    boardTitle: 'Workflow Board',
    boardDescription: 'Loading workflow control plane projection.',
    modeLabel: formatMode('passive'),
    scopeLabel: 'Home board',
  };

  #board = null;
  #selectedCardId = '';
  #projectFilter = '';
  #abortController = null;
  #applyingAttributes = false;
  #lastLoadKey = '';
  #routeSyncHandler = null;

  initCallback() {
    this.ref.refreshBtn.onclick = () => this.loadBoard({ reason: 'manual-refresh' });
    this.ref.reconcileBtn.onclick = () => this.reconcileRecovery();
    this.ref.projectFilter.onchange = () => {
      this.#projectFilter = this.ref.projectFilter.value;
      this.#render();
      this.#dispatch('workflow-board-filter-change', {
        projectId: this.#projectFilter,
        scope: this.#scopeState().scope,
      });
    };
    this.ref.columns.addEventListener('click', (event) => this.#onColumnsClick(event));
    this.ref.inspector.addEventListener('click', (event) => this.#onInspectorClick(event));
    this.ref.inspector.addEventListener('change', (event) => this.#onInspectorChange(event));
    this.#routeSyncHandler = () => this.loadBoard({ reason: 'route-change' });
    globalThis.addEventListener?.('hashchange', this.#routeSyncHandler);
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

  setProjectFilter(projectId = '') {
    this.#projectFilter = normalizeText(projectId);
    this.#render();
  }

  setBoardData(payload = {}) {
    this.#board = normalizeWorkflowBoardPayload(payload, this.#scopeState());
    this.#ensureSelection();
    this.#render();
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
      if (filters.projectId) this.#projectFilter = filters.projectId;
      this.#ensureSelection();
      this.#clearBanner();
      this.#render();
      this.#dispatch('workflow-board-loaded', {
        ...eventDetail(this.#board, this.#selectedCard()),
        reason: options.reason || 'load',
      });
      return board;
    } catch (error) {
      if (error?.name === 'AbortError') return null;
      this.#board = null;
      this.#selectedCardId = '';
      this.#renderError(error);
      this.#dispatch('workflow-board-error', {
        error,
        message: error?.message || String(error),
        filters,
      });
      return null;
    }
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

  async reconcileRecovery() {
    let filters = this.#scopeState();
    this.#setBanner('running', 'Reconciling workflow recovery...');
    try {
      let payload = await reconcileWorkflowRecovery({
        boardId: filters.boardId || this.#board?.boardId,
        projectId: filters.projectId || this.#projectFilter,
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
    let routeProjectId = normalizeText(parseQuery?.(route.query || '')?.project);
    let projectId = normalizeText(this.getAttribute('project-id') || routeProjectId);
    let scope = normalizeText(this.getAttribute('scope'), projectId ? 'project' : DEFAULT_SCOPE);
    let boardId = normalizeText(this.getAttribute('board-id'));
    let mode = normalizeText(this.getAttribute('mode'));
    return { scope, projectId, boardId, mode };
  }

  #visibleCards() {
    let cards = asArray(this.#board?.cards);
    let filter = normalizeText(this.#projectFilter);
    if (!filter) return cards;
    return cards.filter(card => card.projectId === filter);
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
    this.#selectedCardId = cards[0]?.id || this.#board?.cards?.[0]?.id || '';
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

  #render() {
    let board = this.#board;
    if (!board) {
      this.#renderEmptyShell();
      return;
    }
    this.#ensureSelection();
    this.$.boardTitle = board.title || 'Workflow Board';
    this.$.boardDescription = board.description
      || (board.projectId ? `Project-scoped board for ${board.projectId}.` : 'Multi-project workflow control plane.');
    this.$.modeLabel = formatMode(board.mode);
    this.$.scopeLabel = board.projectId ? `Project: ${board.projectId}` : `${formatLabel(board.scope)} scope`;
    this.ref.modeBadge.setAttribute('variant', BOARD_MODE_VARIANTS[board.mode] || 'info');
    this.#renderCounters();
    this.#renderProjectFilter();
    this.#renderColumns();
    this.#renderInspector();
  }

  #renderEmptyShell() {
    this.$.boardTitle = 'Workflow Board';
    this.$.boardDescription = 'Workflow board projection is not loaded.';
    this.$.modeLabel = formatMode('passive');
    this.$.scopeLabel = 'No board data';
    this.ref.summaryGrid.replaceChildren();
    this.ref.columns.replaceChildren();
    this.ref.projectFilter.replaceChildren(new Option('All projects', ''));
    this.ref.filterReadout.textContent = '';
    this.ref.emptyState.hidden = false;
    this.ref.inspector.replaceChildren(
      makeElement('sn-empty-state', 'wb-inspector-empty', 'Load the workflow board to inspect cards.'),
    );
  }

  #renderError(error) {
    this.#setBanner('error', error?.message || String(error));
    this.#renderEmptyShell();
    this.ref.emptyState.textContent = 'Workflow board data is unavailable.';
  }

  #renderCounters() {
    let counters = this.#board?.counters || {};
    let visibleCards = this.#visibleCards();
    let visibleRecovery = visibleCards.filter(card => card.flags?.some(flag => flagKind(flag))).length;
    let items = [
      ['Cards', visibleCards.length],
      ['Columns', counters.columns ?? this.#board.columns.length],
      ['Active', counters.active ?? 0],
      ['Blocked', counters.blocked ?? 0],
      ['Recovery', counters.recovery ?? visibleRecovery],
      ['Done', counters.done ?? 0],
    ];
    this.ref.summaryGrid.replaceChildren(...items.map(([label, value]) => {
      let counter = makeElement('div', 'wb-counter');
      counter.append(
        makeElement('span', 'wb-counter-label', label),
        makeElement('span', 'wb-counter-value', String(value ?? 0)),
      );
      return counter;
    }));
  }

  #renderProjectFilter() {
    let scope = this.#scopeState();
    let projects = [...new Set(asArray(this.#board?.cards)
      .map(card => card.projectId)
      .filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));

    if (scope.projectId) this.#projectFilter = scope.projectId;
    let selected = normalizeText(this.#projectFilter);
    let options = [new Option('All projects', '')];
    for (let projectId of projects) {
      options.push(new Option(projectId, projectId));
    }
    if (selected && !projects.includes(selected)) options.push(new Option(selected, selected));

    this.ref.projectFilter.replaceChildren(...options);
    this.ref.projectFilter.value = selected;
    this.ref.projectFilter.disabled = Boolean(scope.projectId);
    let count = this.#visibleCards().length;
    let updated = formatDateTime(this.#board?.updatedAt);
    this.ref.filterReadout.textContent = [
      `${count} visible card${count === 1 ? '' : 's'}`,
      updated ? `updated ${updated}` : '',
    ].filter(Boolean).join(' · ');
  }

  #renderColumns() {
    let columns = this.#columnsWithVisibleCards();
    let hasCards = columns.some(column => column.cards.length);
    this.ref.emptyState.hidden = hasCards;
    this.ref.columns.replaceChildren(...columns.map(column => this.#renderColumn(column)));
  }

  #renderColumn(column) {
    let lane = makeElement('section', 'wb-column');
    lane.dataset.columnId = column.id;
    lane.setAttribute('aria-label', column.title);

    let header = makeElement('header', 'wb-column-header');
    let copy = makeElement('div');
    copy.append(
      makeElement('div', 'wb-column-title', column.title),
      makeElement('div', 'wb-column-description', column.description || column.gate || 'No gate metadata.'),
    );
    header.append(copy, makeElement('span', 'wb-column-count', String(column.cards.length)));

    let list = makeElement('div', 'wb-card-list');
    if (column.cards.length) {
      list.replaceChildren(...column.cards.map(card => this.#renderCard(card)));
    } else {
      list.replaceChildren(makeElement('div', 'wb-column-empty', 'No cards in this column.'));
    }
    lane.append(header, list);
    return lane;
  }

  #renderCard(card) {
    let cardButton = makeElement('button', 'wb-card');
    cardButton.type = 'button';
    cardButton.dataset.cardId = card.id;
    cardButton.setAttribute('aria-selected', String(card.id === this.#selectedCardId));
    cardButton.setAttribute('aria-label', `Inspect ${card.title}`);

    let meta = makeElement('div', 'wb-card-meta');
    if (card.projectId) meta.append(makeChip(card.projectId));
    if (card.kind) meta.append(makeChip(card.kind));
    if (card.priority) meta.append(makeChip(card.priority, 'status'));

    let title = makeElement('div', 'wb-card-title', card.title);
    let summary = makeElement('div', 'wb-card-summary', card.summary || 'No summary provided.');
    let footer = makeElement('div', 'wb-card-footer');
    if (card.status) footer.append(makeChip(card.status, statusKind(card.status)));
    if (card.lease?.leaseOwner) footer.append(makeChip(card.lease.leaseOwner, 'status'));
    for (let flag of card.flags.slice(0, 3)) footer.append(makeChip(formatLabel(flag), flagKind(flag)));

    let nextColumn = getAdjacentColumn(this.#board, card.columnId, 1);
    if (nextColumn) {
      footer.append(createButton('', {
        className: 'wb-card-action',
        title: `Move to ${nextColumn.title}`,
        icon: 'arrow_forward',
        dataset: {
          cardId: card.id,
          transitionTo: nextColumn.id,
        },
      }));
    }

    cardButton.append(meta, title, summary, footer);
    return cardButton;
  }

  #renderInspector() {
    let card = this.#selectedCard();
    if (!card) {
      this.ref.inspector.replaceChildren(
        makeElement('sn-empty-state', 'wb-inspector-empty', 'Select a workflow card to inspect it.'),
      );
      return;
    }

    let scroll = makeElement('div', 'wb-inspector-scroll');
    scroll.append(
      this.#renderInspectorHeader(card),
      this.#renderInspectorDetails(card),
      this.#renderInspectorActions(card),
      this.#renderInspectorFlags(card),
      this.#renderInspectorChecks(card),
      this.#renderInspectorRefs(card),
      this.#renderInspectorFiles(card),
      this.#renderInspectorEvents(card),
    );
    this.ref.inspector.replaceChildren(scroll);
  }

  #renderInspectorHeader(card) {
    let header = makeElement('header', 'wb-inspector-head');
    header.append(
      makeElement('h3', 'wb-inspector-title', card.title),
      makeElement('p', 'wb-inspector-summary', card.summary || 'No summary provided.'),
    );
    return header;
  }

  #renderInspectorDetails(card) {
    let section = this.#section('Details');
    let details = makeElement('dl', 'wb-detail-grid');
    appendDetail(details, 'Column', this.#columnTitle(card.columnId));
    appendDetail(details, 'Project', card.projectId || 'Global');
    appendDetail(details, 'Kind', card.kind);
    appendDetail(details, 'Owner', card.owner || 'Unassigned');
    appendDetail(details, 'Agent', card.assignedAgent);
    appendDetail(details, 'Resource', card.resourceGroup);
    appendDetail(details, 'Approval', card.approvalMode);
    appendDetail(details, 'Status', card.status);
    appendDetail(details, 'Lease', card.lease?.leaseOwner);
    appendDetail(details, 'Run', card.run?.status);
    appendDetail(details, 'Version', card.version == null ? '' : String(card.version));
    appendDetail(details, 'Updated', formatDateTime(card.updatedAt));
    appendDetail(details, 'Blocker', card.blocker);
    section.append(details);
    return section;
  }

  #renderInspectorActions(card) {
    let section = this.#section('Transitions');
    let row = makeElement('div', 'wb-action-row');
    let previous = getAdjacentColumn(this.#board, card.columnId, -1);
    let next = getAdjacentColumn(this.#board, card.columnId, 1);

    if (previous) {
      row.append(createButton('Previous', {
        icon: 'arrow_back',
        dataset: { cardId: card.id, transitionTo: previous.id },
      }));
    }
    if (next) {
      row.append(createButton('Next', {
        variant: 'primary',
        icon: 'arrow_forward',
        dataset: { cardId: card.id, transitionTo: next.id },
      }));
    }

    row.append(createButton('Orchestrate', {
      icon: 'play_arrow',
      dataset: { cardId: card.id, orchestrate: 'true' },
    }));
    row.append(createButton('Pause', {
      icon: 'pause',
      dataset: { cardId: card.id, controlAction: 'pause' },
    }));
    row.append(createButton('Stop', {
      icon: 'stop',
      dataset: { cardId: card.id, controlAction: 'stop' },
    }));
    row.append(createButton('Cancel', {
      icon: 'cancel',
      dataset: { cardId: card.id, controlAction: 'cancel' },
    }));

    let select = makeElement('select', 'wb-move-select');
    select.dataset.moveSelect = card.id;
    select.setAttribute('aria-label', 'Move selected card to column');
    select.append(new Option('Move to...', ''));
    for (let transition of getCardTransitions(this.#board, card)) {
      select.append(new Option(this.#columnTitle(transition.to), transition.to));
    }
    row.append(select, createButton('Move', {
      dataset: { cardId: card.id, moveSelected: 'true' },
    }));

    if (card.entityRefs?.chatId) {
      row.append(createButton('Open chat', {
        icon: 'forum',
        dataset: { openRef: 'chat', refId: card.entityRefs.chatId },
      }));
    }
    if (card.entityRefs?.goalId) {
      row.append(createButton('Open goal', {
        icon: 'flag',
        dataset: { openRef: 'goal', refId: card.entityRefs.goalId },
      }));
    }

    if (!row.childElementCount) {
      row.append(makeElement('div', 'wb-section-note', 'No transitions are available for this card.'));
    }
    section.append(row);
    return section;
  }

  #renderInspectorFlags(card) {
    let section = this.#section('Recovery Flags');
    let list = makeElement('div', 'wb-chip-list');
    let flags = card.flags.length ? card.flags : ['clear'];
    for (let flag of flags) list.append(makeChip(formatLabel(flag), flagKind(flag)));
    section.append(list);
    return section;
  }

  #renderInspectorChecks(card) {
    let section = this.#section('Checks');
    if (!card.checks.length) {
      section.append(makeElement('div', 'wb-section-note', 'No check data reported.'));
      return section;
    }
    let list = makeElement('ul', 'wb-list');
    for (let check of card.checks) {
      let item = makeElement('li', 'wb-list-item');
      item.append(
        makeElement('strong', '', check.label),
        makeElement('span', '', [check.status, check.note].filter(Boolean).join(' · ')),
      );
      list.append(item);
    }
    section.append(list);
    return section;
  }

  #renderInspectorRefs(card) {
    let section = this.#section('Entity Refs');
    let refs = card.entityRefs || {};
    let details = makeElement('dl', 'wb-detail-grid');
    appendDetail(details, 'Goal', refs.goalId);
    appendDetail(details, 'Chat', refs.chatId);
    appendDetail(details, 'Tasks', asArray(refs.taskIds).join(', '));
    if (!details.childElementCount) {
      section.append(makeElement('div', 'wb-section-note', 'No goal, chat, or task refs.'));
    } else {
      section.append(details);
    }
    return section;
  }

  #renderInspectorFiles(card) {
    let section = this.#section('Files');
    if (!card.files.length) {
      section.append(makeElement('div', 'wb-section-note', 'No file refs reported.'));
      return section;
    }
    let list = makeElement('ul', 'wb-list');
    for (let file of card.files.slice(0, 8)) {
      let item = makeElement('li', 'wb-list-item');
      item.append(makeElement('strong', '', file));
      list.append(item);
    }
    section.append(list);
    return section;
  }

  #renderInspectorEvents(card) {
    let section = this.#section('Event History');
    if (!card.events.length) {
      section.append(makeElement('div', 'wb-section-note', 'No transition events reported.'));
      return section;
    }
    let list = makeElement('ul', 'wb-list');
    for (let event of card.events.slice(0, 8)) {
      let item = makeElement('li', 'wb-list-item');
      item.append(
        makeElement('strong', '', event.label),
        makeElement('span', '', [
          event.status,
          event.actor,
          formatDateTime(event.timestamp),
          event.note,
        ].filter(Boolean).join(' · ')),
      );
      list.append(item);
    }
    section.append(list);
    return section;
  }

  #section(title) {
    let section = makeElement('section', 'wb-inspector-section');
    section.append(makeElement('div', 'wb-section-title', title));
    return section;
  }

  #onColumnsClick(event) {
    let action = event.target?.closest?.('[data-transition-to]');
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      this.requestTransition({
        cardId: action.dataset.cardId,
        toColumnId: action.dataset.transitionTo,
      });
      return;
    }

    let cardElement = event.target?.closest?.('[data-card-id]');
    if (!cardElement) return;
    this.selectCard(cardElement.dataset.cardId);
  }

  #onInspectorClick(event) {
    let transition = event.target?.closest?.('[data-transition-to]');
    if (transition) {
      this.requestTransition({
        cardId: transition.dataset.cardId,
        toColumnId: transition.dataset.transitionTo,
      });
      return;
    }

    let moveButton = event.target?.closest?.('[data-move-selected]');
    if (moveButton) {
      let select = this.ref.inspector.querySelector(`[data-move-select="${moveButton.dataset.cardId}"]`);
      if (select?.value) {
        this.requestTransition({
          cardId: moveButton.dataset.cardId,
          toColumnId: select.value,
        });
      }
      return;
    }

    let orchestrate = event.target?.closest?.('[data-orchestrate]');
    if (orchestrate) {
      this.orchestrateCard({ cardId: orchestrate.dataset.cardId });
      return;
    }

    let control = event.target?.closest?.('[data-control-action]');
    if (control) {
      this.controlCard(control.dataset.controlAction, { cardId: control.dataset.cardId });
      return;
    }

    let openRef = event.target?.closest?.('[data-open-ref]');
    if (!openRef) return;
    let card = this.#selectedCard();
    this.#dispatch('workflow-card-open', eventDetail(this.#board, card, {
      refType: openRef.dataset.openRef,
      refId: openRef.dataset.refId,
    }));
  }

  #onInspectorChange(event) {
    let select = event.target?.closest?.('[data-move-select]');
    if (!select?.value) return;
    this.#dispatch('workflow-card-transition-preview', {
      ...eventDetail(this.#board, this.#cardById(select.dataset.moveSelect)),
      toColumnId: select.value,
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
