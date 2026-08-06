import Symbiote from '@symbiotejs/symbiote';
import '../../display/EmptyState/EmptyState.js';
import '../../menu/Menu/Menu.js';
import template from './KanbanBoard.tpl.js';
import css from './KanbanBoard.css.js';

function normalizeText(value, fallback = '') {
  let text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function normalizeId(value, fallback = '') {
  let text = normalizeText(value, fallback);
  return text.toLowerCase().replace(/[^a-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '');
}

function titleFromId(value) {
  return normalizeText(value)
    .split(/[-_:/]+/)
    .filter(Boolean)
    .map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function normalizeChip(value) {
  if (value && typeof value === 'object') {
    let label = normalizeText(value.label ?? value.title ?? value.text ?? value.value);
    if (!label) return null;
    return {
      label,
      kind: normalizeText(value.kind ?? value.variant ?? value.status),
      title: normalizeText(value.title),
      // U15: chip semantics must never rely on color alone. `label` already carries text; an
      // optional icon glyph is a second, non-color signal a host can pair with it.
      icon: normalizeText(value.icon),
      // Optional data-carried identity color (e.g. an agent's declared color); the stylesheet
      // owns all fill/contrast math against this single input.
      accent: normalizeText(value.accent ?? value.color),
    };
  }
  let label = normalizeText(value);
  return label ? { label, kind: '', title: '', icon: '', accent: '' } : null;
}

function normalizeAction(value, index = 0) {
  let action = value && typeof value === 'object' ? value : { label: value };
  let id = normalizeText(action.id ?? action.action ?? action.name, `action-${index + 1}`);
  let label = normalizeText(action.label ?? action.title);
  return {
    id,
    label,
    icon: normalizeText(action.icon),
    title: normalizeText(action.title, label || titleFromId(id)),
    disabled: Boolean(action.disabled),
    kind: normalizeText(action.kind ?? action.variant),
    raw: action,
  };
}

/** The ticker's status vocabulary; anything else falls back to the quiet '' kind. */
const TICKER_KINDS = new Set(['state', 'warning', 'error']);

/*
 * Ticker: the card's one-line "last agent action / live status" row between title and footer.
 * '' is quiet telemetry, 'state' is execution state (accent tint), 'warning'/'error' carry the
 * attention tints. Long texts belong in the inspector — the row always ellipsizes to one line.
 */
function normalizeTicker(value) {
  if (value == null) return null;
  let ticker = typeof value === 'object' ? value : { label: value };
  let label = normalizeText(ticker.label ?? ticker.text ?? ticker.message);
  if (!label) return null;
  let kind = normalizeText(ticker.kind ?? ticker.variant);
  return {
    label,
    icon: normalizeText(ticker.icon),
    kind: TICKER_KINDS.has(kind) ? kind : '',
    title: normalizeText(ticker.title),
  };
}

export function normalizeKanbanCard(raw = {}, index = 0, fallbackColumnId = '') {
  let card = raw && typeof raw === 'object' ? raw : { title: raw };
  let title = normalizeText(card.title ?? card.label ?? card.name, `Card ${index + 1}`);
  let id = normalizeText(card.id ?? card.cardId ?? card.key);
  if (!id) id = normalizeId(`${fallbackColumnId}-${title}`, `card-${index + 1}`);
  let columnId = normalizeId(card.columnId ?? card.column_id ?? card.laneId ?? card.stage, fallbackColumnId);
  return {
    id,
    columnId,
    title,
    // Accepted for host compat; the card face no longer renders it (inspector content).
    summary: normalizeText(card.summary ?? card.description ?? card.body),
    ticker: normalizeTicker(card.ticker),
    meta: asArray(card.meta ?? card.badges ?? card.labels).map(normalizeChip).filter(Boolean),
    footer: asArray(card.footer ?? card.statuses ?? card.flags).map(normalizeChip).filter(Boolean),
    actions: asArray(card.actions).map(normalizeAction),
    busy: Boolean(card.busy ?? card.running ?? card.active),
    draggable: card.draggable !== false,
    raw: card,
  };
}

export function normalizeKanbanColumn(raw = {}, index = 0, rootCards = []) {
  let column = raw && typeof raw === 'object' ? raw : { title: raw };
  let id = normalizeId(column.id ?? column.columnId ?? column.key ?? column.name, `column-${index + 1}`);
  let cards = asArray(column.cards).length
    ? asArray(column.cards)
    : rootCards.filter(card => normalizeId(card.columnId ?? card.column_id ?? card.laneId ?? card.stage) === id);
  let normalizedCards = cards.map((card, cardIndex) => normalizeKanbanCard(card, cardIndex, id));
  return {
    id,
    title: normalizeText(column.title ?? column.label ?? column.name, titleFromId(id)),
    description: normalizeText(column.description ?? column.summary ?? column.gate),
    count: Number.isFinite(Number(column.count)) ? Number(column.count) : normalizedCards.length,
    cards: normalizedCards,
    raw: column,
  };
}

export function normalizeKanbanBoardModel(input = {}) {
  let board = input && typeof input === 'object' ? input : {};
  let rootCards = asArray(board.cards);
  let columns = asArray(board.columns).map((column, index) => normalizeKanbanColumn(column, index, rootCards));
  return {
    id: normalizeText(board.id ?? board.boardId ?? board.key),
    title: normalizeText(board.title ?? board.label ?? board.name),
    columns,
    raw: board,
  };
}

function makeElement(tagName, className = '', textContent = '') {
  let element = document.createElement(tagName);
  if (className) element.className = className;
  if (textContent) element.textContent = textContent;
  return element;
}

function appendNodes(parent, value) {
  let nodes = Array.isArray(value) ? value : [value];
  for (let node of nodes) {
    if (!node) continue;
    if (typeof node === 'string') {
      parent.append(document.createTextNode(node));
    } else {
      parent.append(node);
    }
  }
}

function toNode(value) {
  return typeof value === 'string' ? document.createTextNode(value) : value;
}

let snapshotNonce = 0;

/** Stable change signature; non-serializable host data forces a re-render instead of a stale skip. */
function toJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    snapshotNonce += 1;
    return `unserializable-${snapshotNonce}`;
  }
}

/** The action-menu identity: replace the live sn-dropdown only when this actually changes. */
function actionSignatureValue(actions) {
  return actions.map(action => [action.id, action.label, action.icon, action.title, action.disabled, action.kind]);
}

function actionSignature(actions) {
  return toJson(actionSignatureValue(actions));
}

function chipSignatureValue(chip = {}) {
  return [chip.label, chip.kind, chip.title, chip.icon, chip.accent];
}

function cardFaceSignature(card = {}) {
  return toJson({
    id: card.id,
    columnId: card.columnId,
    title: card.title,
    ticker: card.ticker,
    meta: card.meta.map(chipSignatureValue),
    footer: card.footer.map(chipSignatureValue),
    actions: actionSignatureValue(card.actions),
    busy: card.busy,
    draggable: card.draggable,
  });
}

function headerBoardSignature(board = {}) {
  let raw = board.raw && typeof board.raw === 'object' ? { ...board.raw } : {};
  delete raw.columns;
  delete raw.cards;
  return {
    id: board.id,
    title: board.title,
    raw,
  };
}

function headerColumnSignature(column = {}) {
  let raw = column.raw && typeof column.raw === 'object' ? { ...column.raw } : {};
  delete raw.cards;
  return {
    id: column.id,
    title: column.title,
    description: column.description,
    count: column.count,
    raw,
  };
}

/** linkedom/SSR DOMs cannot parse ':popover-open'; treat those environments as closed. */
function isPopoverOpen(element) {
  try {
    return element.matches(':popover-open');
  } catch {
    return false;
  }
}

export class KanbanBoard extends Symbiote {
  static observedAttributes = ['empty-text', 'label'];

  init$ = {
    emptyText: 'No board columns.',
    isEmpty: false,
  };

  #board = normalizeKanbanBoardModel();
  #selectedCardId = '';
  #dragCardId = '';
  #headerSyncId = 0;
  #resizeHandler = null;

  // Keyed reconciliation state (NodeViewManager house style: Map<id, element> reuse).
  #columnParts = new Map();
  #headerSignatures = new Map();
  #bodySignatures = new Map();
  #cardNodes = new Map();
  #cardSignatures = new Map();
  #defaultCards = new WeakSet();
  #actionSignatures = new WeakMap();

  renderCard = null;
  renderColumnBody = null;
  renderColumnHeader = null;

  initCallback() {
    this.ref.columns.addEventListener('click', (event) => this.#onClick(event));
    this.ref.columns.addEventListener('click', (event) => this.#onColumnHeaderInteraction(event));
    this.ref.columns.addEventListener('keydown', (event) => this.#onKeyDown(event));
    this.ref.columns.addEventListener('dragstart', (event) => this.#onDragStart(event));
    this.ref.columns.addEventListener('dragend', () => this.#clearDropState());
    this.ref.columns.addEventListener('dragover', (event) => this.#onDragOver(event));
    this.ref.columns.addEventListener('dragleave', (event) => this.#onDragLeave(event));
    this.ref.columns.addEventListener('drop', (event) => this.#onDrop(event));
    this.ref.columns.addEventListener('toggle', () => this.#syncColumnHeaderHeights(), true);
    this.#resizeHandler = () => this.#syncColumnHeaderHeights();
    globalThis.addEventListener?.('resize', this.#resizeHandler);
    this.#syncAttributes();
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    if (this.#resizeHandler) {
      globalThis.removeEventListener?.('resize', this.#resizeHandler);
      this.#resizeHandler = null;
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'empty-text') {
      this.$.emptyText = normalizeText(newValue, 'No board columns.');
      return;
    }
    if (name === 'label') {
      this.setAttribute('aria-label', normalizeText(newValue, 'Kanban board'));
      return;
    }
    super.attributeChangedCallback?.(name, oldValue, newValue);
  }

  setBoard(board = {}, options = {}) {
    let renderersChanged = false;
    for (let key of ['renderCard', 'renderColumnBody', 'renderColumnHeader']) {
      if (!(key in options) || options[key] === this[key]) continue;
      this[key] = options[key];
      renderersChanged = true;
    }
    // A different renderer invalidates every cached signature: rebuild from scratch.
    if (renderersChanged) this.#resetReconcilerState();
    this.#board = normalizeKanbanBoardModel(board);
    this.#ensureSelection();
    this.#render();
    return this.#board;
  }

  setColumns(columns = [], options = {}) {
    return this.setBoard({ columns }, options);
  }

  getBoard() {
    return this.#board;
  }

  getSelectedCard() {
    return this.#cardById(this.#selectedCardId);
  }

  selectCard(cardId = '') {
    let card = this.#cardById(cardId);
    if (!card) return null;
    this.#selectedCardId = card.id;
    this.#syncCardSelection();
    this.#dispatch('sn-board-card-select', { card, column: this.#columnById(card.columnId) });
    return card;
  }

  #syncAttributes() {
    this.$.emptyText = normalizeText(this.getAttribute('empty-text'), this.$.emptyText);
    this.setAttribute('role', 'region');
    this.setAttribute('aria-label', normalizeText(this.getAttribute('label'), this.#board.title || 'Kanban board'));
  }

  #ensureSelection() {
    if (this.#cardById(this.#selectedCardId)) return;
    this.#selectedCardId = this.#board.columns.flatMap(column => column.cards)[0]?.id || '';
  }

  #cardById(cardId = '') {
    let id = normalizeText(cardId);
    if (!id) return null;
    for (let column of this.#board.columns) {
      let card = column.cards.find(item => item.id === id);
      if (card) return card;
    }
    return null;
  }

  #columnById(columnId = '') {
    let id = normalizeId(columnId);
    return this.#board.columns.find(column => column.id === id) || null;
  }

  /*
   * Keyed reconciliation: realtime board pushes patch the live DOM instead of wiping it, so
   * open popovers, drag state, column/board scroll, and focus survive any update that does not
   * remove the element they live in. Columns and cards are reused by id; an entry whose visible
   * signature is unchanged is not touched at all.
   */
  #render() {
    this.#syncAttributes();
    let columns = this.#board.columns;
    this.$.isEmpty = columns.length === 0;
    let headerChanged = this.#reconcile(columns);
    this.#syncCardSelection();
    // The action dropdowns are connected now, so their popovers exist: arm the lazy-open build.
    this.#connectPendingActionListeners();
    if (headerChanged) this.#syncColumnHeaderHeights();
  }

  #resetReconcilerState() {
    this.#columnParts.clear();
    this.#headerSignatures.clear();
    this.#bodySignatures.clear();
    this.#cardNodes.clear();
    this.#cardSignatures.clear();
    this.ref.columns.replaceChildren();
  }

  #reconcile(columns) {
    let root = this.ref.columns;
    let headerChanged = false;
    let liveColumnIds = new Set(columns.map(column => column.id));
    for (let [id, parts] of this.#columnParts) {
      if (liveColumnIds.has(id)) continue;
      parts.lane.remove();
      this.#columnParts.delete(id);
      this.#headerSignatures.delete(id);
      this.#bodySignatures.delete(id);
      headerChanged = true;
    }
    let liveCardIds = new Set(columns.flatMap(column => column.cards.map(card => card.id)));
    for (let [id, node] of this.#cardNodes) {
      if (liveCardIds.has(id)) continue;
      node.remove?.();
      this.#cardNodes.delete(id);
      this.#cardSignatures.delete(id);
    }
    let previousLane = null;
    for (let column of columns) {
      let parts = this.#columnParts.get(column.id);
      if (!parts) {
        parts = this.#createColumnParts(column);
        headerChanged = true;
      }
      if (this.#updateColumn(parts, column)) headerChanged = true;
      let anchor = previousLane ? previousLane.nextSibling : root.firstChild;
      if (parts.lane !== anchor) root.insertBefore(parts.lane, anchor);
      previousLane = parts.lane;
    }
    return headerChanged;
  }

  #createColumnParts(column) {
    let lane = makeElement('section', 'sn-kanban-column');
    lane.dataset.columnId = column.id;
    let header = makeElement('header', 'sn-kanban-column-header');
    let body = makeElement('div', 'sn-kanban-column-body');
    lane.append(header, body);
    let parts = { lane, header, body, list: null, empty: null };
    this.#columnParts.set(column.id, parts);
    return parts;
  }

  #updateColumn(parts, column) {
    parts.lane.setAttribute('aria-label', column.title);
    let headerChanged = false;
    let headerSignature = toJson({
      column: headerColumnSignature(column),
      board: headerBoardSignature(this.#board),
    });
    if (this.#headerSignatures.get(column.id) !== headerSignature) {
      this.#renderColumnHeaderContent(parts.header, column);
      this.#headerSignatures.set(column.id, headerSignature);
      headerChanged = true;
    }
    if (typeof this.renderColumnBody === 'function') {
      let bodySignature = toJson(column);
      if (this.#bodySignatures.get(column.id) === bodySignature) return headerChanged;
      let custom = this.renderColumnBody(column, { board: this.#board, host: this });
      if (custom) {
        parts.list = null;
        parts.empty = null;
        parts.body.replaceChildren();
        appendNodes(parts.body, custom);
        this.#bodySignatures.set(column.id, bodySignature);
        return headerChanged;
      }
      this.#bodySignatures.delete(column.id);
    }
    this.#reconcileCardList(parts, column);
    return headerChanged;
  }

  /*
   * Header content is re-rendered only when its header-relevant data changed. When a host
   * renderColumnHeader supplies interactive content, an open <details> or popover is carried
   * to the replacement by matching its data attributes.
   */
  #renderColumnHeaderContent(header, column) {
    let custom = typeof this.renderColumnHeader === 'function'
      ? this.renderColumnHeader(column, { board: this.#board, host: this })
      : null;
    if (custom) {
      let openState = this.#captureHeaderOpenState(header);
      header.replaceChildren();
      appendNodes(header, custom);
      this.#restoreHeaderOpenState(header, openState);
      return;
    }
    header.replaceChildren();
    let copy = makeElement('div');
    copy.append(
      makeElement('div', 'sn-kanban-column-title', column.title),
      makeElement('div', 'sn-kanban-column-description', column.description || 'No description.'),
    );
    header.append(copy, makeElement('span', 'sn-kanban-column-count', String(column.count)));
  }

  #captureHeaderOpenState(header) {
    let entries = [];
    for (let element of header.querySelectorAll('details[open], [popover]')) {
      let popover = element.hasAttribute('popover');
      if (popover && !isPopoverOpen(element)) continue;
      let names = element.getAttributeNames().filter(name => name.startsWith('data-'));
      if (!names.length) continue;
      let selector = element.localName + names
        .map(name => `[${name}="${element.getAttribute(name).replaceAll('"', '\\"')}"]`)
        .join('');
      entries.push({ selector, popover });
    }
    return entries;
  }

  #restoreHeaderOpenState(header, entries) {
    for (let entry of entries) {
      let element = header.querySelector(entry.selector);
      if (!element) continue;
      if (entry.popover) element.showPopover?.();
      else element.toggleAttribute('open', true);
    }
  }

  #reconcileCardList(parts, column) {
    if (!parts.list || parts.list.parentNode !== parts.body) {
      parts.list = makeElement('div', 'sn-kanban-card-list');
      parts.list.dataset.columnId = column.id;
      parts.body.replaceChildren(parts.list);
      parts.empty = null;
    }
    let list = parts.list;
    if (parts.empty && column.cards.length) {
      parts.empty.remove();
      parts.empty = null;
    }
    let nodes = column.cards.map(card => this.#materializeCard(card, column));
    let desired = new Set(nodes);
    let previous = null;
    for (let node of nodes) {
      // Skip nodes departing to other columns so surviving cards are never moved needlessly.
      let anchor = previous ? previous.nextSibling : list.firstChild;
      while (anchor && !desired.has(anchor)) anchor = anchor.nextSibling;
      if (node !== anchor) list.insertBefore(node, anchor);
      previous = node;
    }
    // U11: one clearly-labeled empty state per column.
    if (!column.cards.length && !parts.empty) {
      parts.empty = makeElement('div', 'sn-kanban-column-empty', 'No cards in this column.');
      list.append(parts.empty);
    }
  }

  #materializeCard(card, column) {
    let signature = this.#cardSignature(card, column);
    let node = this.#cardNodes.get(card.id);
    if (!node) {
      node = this.#createCardNode(card, column);
    } else if (this.#cardSignatures.get(card.id) !== signature) {
      node = this.#updateCardNode(node, card, column);
    }
    this.#cardNodes.set(card.id, node);
    this.#cardSignatures.set(card.id, signature);
    return node;
  }

  #cardSignature(card, column) {
    if (typeof this.renderCard === 'function') {
      let explicit = card.raw?.renderSignature ?? card.raw?.signature ?? card.raw?.cardSignature;
      if (explicit != null) {
        return toJson({ id: card.id, columnId: card.columnId, signature: explicit });
      }
      return toJson({
        card,
        column: headerColumnSignature(column),
        board: headerBoardSignature(this.#board),
      });
    }
    return cardFaceSignature(card);
  }

  #createCardNode(card, column) {
    let custom = typeof this.renderCard === 'function'
      ? this.renderCard(card, { column, board: this.#board, host: this })
      : null;
    if (custom) return toNode(custom);
    return this.#renderDefaultCard(card);
  }

  #updateCardNode(node, card, column) {
    let custom = typeof this.renderCard === 'function'
      ? this.renderCard(card, { column, board: this.#board, host: this })
      : null;
    if (!custom && this.#defaultCards.has(node)) {
      this.#patchCard(node, card);
      return node;
    }
    let next = custom ? toNode(custom) : this.#renderDefaultCard(card);
    node.replaceWith?.(next);
    return next;
  }

  /*
   * Fixed widget geometry: uniform-height card face of four one-purpose rows —
   * meta (1 clipped line) / title (2-line clamp) / ticker (1 line) / footer (1 line, no wrap).
   * Summary stays in the normalized model for hosts but is inspector content, not card face.
   */
  #renderDefaultCard(card) {
    let cardEl = makeElement('article', 'sn-kanban-card');
    cardEl.dataset.snBoardCardId = card.id;
    cardEl.tabIndex = 0;
    cardEl.setAttribute('role', 'button');
    cardEl.append(
      makeElement('div', 'sn-kanban-card-meta'),
      makeElement('div', 'sn-kanban-card-title'),
      makeElement('div', 'sn-kanban-card-ticker'),
      makeElement('div', 'sn-kanban-card-footer'),
    );
    this.#defaultCards.add(cardEl);
    this.#patchCard(cardEl, card);
    return cardEl;
  }

  #patchCard(cardEl, card) {
    let [meta, title, ticker, footer] = cardEl.children;
    cardEl.draggable = card.draggable;
    cardEl.setAttribute('aria-selected', String(card.id === this.#selectedCardId));
    cardEl.setAttribute('aria-label', card.title);
    if (card.busy) cardEl.dataset.busy = 'true';
    else delete cardEl.dataset.busy;

    meta.replaceChildren(...card.meta.map(chip => this.#renderChip(chip)));

    let titleNodes = [];
    if (card.draggable) {
      // U08: explicit drag-handle affordance disambiguating click (select) from drag (move),
      // in addition to the whole-card grab/grabbing cursor set in KanbanBoard.css.js.
      let handle = makeElement('span', 'sn-kanban-card-drag-handle');
      handle.setAttribute('aria-hidden', 'true');
      handle.append(makeElement('span', 'material-symbols-outlined', 'drag_indicator'));
      titleNodes.push(handle);
    }
    if (card.busy) {
      let spinner = makeElement('span', 'sn-kanban-card-spinner');
      spinner.setAttribute('aria-hidden', 'true');
      titleNodes.push(spinner);
    }
    titleNodes.push(makeElement('span', 'sn-kanban-card-title-text', card.title));
    title.replaceChildren(...titleNodes);

    this.#patchTicker(ticker, card.ticker);
    this.#patchFooter(footer, card);
  }

  #patchTicker(element, ticker) {
    if (!ticker) {
      element.replaceChildren();
      delete element.dataset.kind;
      element.removeAttribute('title');
      return;
    }
    if (ticker.kind) element.dataset.kind = ticker.kind;
    else delete element.dataset.kind;
    element.title = ticker.title || ticker.label;
    let nodes = [];
    if (ticker.icon) {
      let icon = makeElement('span', 'material-symbols-outlined', ticker.icon);
      icon.setAttribute('aria-hidden', 'true');
      nodes.push(icon);
    }
    nodes.push(makeElement('span', 'sn-kanban-card-ticker-text', ticker.label));
    element.replaceChildren(...nodes);
  }

  /*
   * Chip rows rebuild wholesale (no interaction state lives there), but the actions
   * <sn-dropdown> — which may host an open popover — is replaced only when the action
   * list itself changed.
   */
  #patchFooter(footer, card) {
    let dropdown = [...footer.children].find(child => child.classList?.contains('sn-kanban-card-actions')) || null;
    for (let child of [...footer.children]) {
      if (child !== dropdown) child.remove();
    }
    for (let chip of card.footer) {
      footer.insertBefore(this.#renderChip(chip), dropdown);
    }
    if (!card.actions.length) {
      dropdown?.remove();
      return;
    }
    let signature = actionSignature(card.actions);
    if (dropdown && this.#actionSignatures.get(dropdown) === signature) return;
    // The action list changed. Reuse the live dropdown (trigger + popover anchor + any open
    // state survive), just re-arm its lazy menu against the new actions: the items rebuild on
    // the next open, or immediately if the popover is currently open.
    if (dropdown) {
      let menu = dropdown.__snActionsMenu || dropdown.querySelector('sn-menu');
      if (menu) {
        this.#armLazyActions(dropdown, menu, card);
        this.#actionSignatures.set(dropdown, signature);
        let popover = dropdown.querySelector('.sn-dropdown-popover');
        if (popover && isPopoverOpen(popover)) this.#populateActionMenu(dropdown);
        return;
      }
      dropdown.replaceWith(this.#renderActionMenu(card));
      return;
    }
    footer.append(this.#renderActionMenu(card));
  }

  #renderChip(chip) {
    let node = makeElement('span', 'sn-kanban-chip');
    if (chip.icon) {
      let icon = makeElement('span', 'material-symbols-outlined', chip.icon);
      icon.setAttribute('aria-hidden', 'true');
      node.append(icon);
    }
    node.append(document.createTextNode(chip.label));
    if (chip.kind) node.dataset.kind = chip.kind;
    if (chip.title) node.title = chip.title;
    // Data-carried identity color (e.g. an agent's declared color): the value is data, but all
    // fill/border/contrast math stays in the stylesheet against this one custom property.
    if (chip.accent) node.style.setProperty('--sn-kanban-chip-accent', chip.accent);
    return node;
  }

  /*
   * U07: reuse the sn-dropdown native popover + anchor-positioned floating-menu primitive
   * (menu/Menu/Menu.js) instead of the old <details> that expanded grid-column: 1/-1 inside
   * the card. The panel now floats over the board and never reflows card/column layout.
   *
   * The trigger button and empty <sn-menu> are built eagerly (they are the ⋯ affordance and
   * the popover's anchor), but the menu items are materialized lazily on first open: across a
   * full board that is hundreds of hidden nodes never built until a menu is actually used. The
   * card's normalized `actions` model is unchanged — only the DOM of the items is deferred.
   */
  #renderActionMenu(card) {
    let dropdown = makeElement('sn-dropdown', 'sn-kanban-card-actions');
    let trigger = makeElement('button', 'sn-kanban-card-menu');
    trigger.type = 'button';
    trigger.slot = 'trigger';
    trigger.title = 'Card actions';
    trigger.setAttribute('aria-label', 'Card actions');
    trigger.append(makeElement('span', 'material-symbols-outlined', 'more_horiz'));
    dropdown.append(trigger);
    let menu = makeElement('sn-menu');
    menu.setAttribute('role', 'menu');
    dropdown.append(menu);
    this.#armLazyActions(dropdown, menu, card);
    this.#actionSignatures.set(dropdown, actionSignature(card.actions));
    return dropdown;
  }

  /*
   * Point the dropdown's lazy menu at a card's live actions and mark it unbuilt. The item
   * source is stashed on the dropdown; the open listeners that trigger the one-shot build are
   * wired later, once the dropdown is connected (#connectActionListeners), because the native
   * popover element only exists after the dropdown renders its shadow tree.
   */
  #armLazyActions(dropdown, menu, card) {
    dropdown.__snActionsCard = card;
    dropdown.__snActionsMenu = menu;
    dropdown.__snActionsPopulated = false;
    // Re-arming a menu that was already built (its action list changed) drops the stale items
    // so the closed menu is empty again until the next open rebuilds it from the new actions.
    if (menu.firstChild) menu.replaceChildren();
  }

  /*
   * Wire the one-shot populate to the first popover-open signal — the native
   * 'beforetoggle'/'toggle' to newState 'open' — plus a redundant trigger press path. Runs
   * after the dropdown is connected so the shadow-rendered popover and trigger exist; the
   * listeners are attached once per dropdown and reused across re-arms.
   */
  #connectActionListeners(dropdown) {
    if (dropdown.__snActionsListening) return;
    let popover = dropdown.querySelector('.sn-dropdown-popover');
    let trigger = dropdown.querySelector('.sn-dropdown-trigger');
    if (!popover && !trigger) return;
    dropdown.__snActionsListening = true;
    let populate = () => this.#populateActionMenu(dropdown);
    let onToggle = (event) => {
      if (!event || event.newState == null || event.newState === 'open') populate();
    };
    if (popover) {
      popover.addEventListener('beforetoggle', onToggle);
      popover.addEventListener('toggle', onToggle);
    }
    // Redundant eager path: a trigger press opens the popover, so build before it shows.
    (trigger || dropdown).addEventListener('pointerdown', populate);
    (trigger || dropdown).addEventListener('click', populate);
  }

  #connectPendingActionListeners() {
    for (let dropdown of this.ref.columns.querySelectorAll('.sn-kanban-card-actions')) {
      this.#connectActionListeners(dropdown);
    }
  }

  #populateActionMenu(dropdown) {
    if (dropdown.__snActionsPopulated) return;
    let card = dropdown.__snActionsCard;
    let menu = dropdown.__snActionsMenu;
    if (!card || !menu) return;
    dropdown.__snActionsPopulated = true;
    menu.replaceChildren(...card.actions.map(action => this.#renderAction(card, action)));
  }

  #renderAction(card, action) {
    let item = makeElement('sn-menu-item', 'sn-kanban-card-action');
    item.dataset.snBoardAction = action.id;
    item.dataset.snBoardCardId = card.id;
    item.title = action.title;
    item.setAttribute('aria-label', action.title);
    if (action.disabled) item.setAttribute('disabled', '');
    if (action.kind) item.dataset.kind = action.kind;
    if (action.icon) item.setAttribute('icon', action.icon);
    item.append(document.createTextNode(action.label || action.title));
    return item;
  }

  #onClick(event) {
    let action = event.target.closest?.('[data-sn-board-action]');
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      let card = this.#cardById(action.dataset.snBoardCardId);
      if (!card) return;
      this.#dispatch('sn-board-card-action', {
        actionId: action.dataset.snBoardAction,
        card,
        column: this.#columnById(card.columnId),
      });
      return;
    }
    if (event.target.closest?.('.sn-kanban-card-actions')) return;
    let cardEl = event.target.closest?.('[data-sn-board-card-id]');
    if (cardEl) this.selectCard(cardEl.dataset.snBoardCardId);
  }

  #onKeyDown(event) {
    if (event.target.closest?.('.sn-kanban-card-actions')) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    let cardEl = event.target.closest?.('[data-sn-board-card-id]');
    if (!cardEl) return;
    event.preventDefault();
    this.selectCard(cardEl.dataset.snBoardCardId);
  }

  #onDragStart(event) {
    let cardEl = event.target.closest?.('[data-sn-board-card-id]');
    if (!cardEl) return;
    this.#dragCardId = cardEl.dataset.snBoardCardId;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', this.#dragCardId);
  }

  #onDragOver(event) {
    if (!this.#dragCardId) return;
    let column = event.target.closest?.('.sn-kanban-column');
    if (!column) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    column.dataset.dropActive = 'true';
  }

  #onDragLeave(event) {
    let column = event.target.closest?.('.sn-kanban-column');
    if (!column || (event.relatedTarget && column.contains(event.relatedTarget))) return;
    delete column.dataset.dropActive;
  }

  #onDrop(event) {
    if (!this.#dragCardId) return;
    let columnEl = event.target.closest?.('.sn-kanban-column');
    let toColumnId = columnEl?.dataset.columnId;
    let card = this.#cardById(this.#dragCardId);
    this.#clearDropState();
    if (!card || !toColumnId || card.columnId === toColumnId) return;
    event.preventDefault();
    this.#dispatch('sn-board-card-drop', {
      card,
      fromColumnId: card.columnId,
      toColumnId,
      column: this.#columnById(toColumnId),
    });
  }

  #clearDropState() {
    this.#dragCardId = '';
    this.ref.columns.querySelectorAll('.sn-kanban-column[data-drop-active]')
      .forEach(column => delete column.dataset.dropActive);
  }

  #onColumnHeaderInteraction(event) {
    let header = event.target.closest?.('.sn-kanban-column-header');
    if (!header || !this.ref.columns.contains(header)) return;
    this.#syncColumnHeaderHeights();
  }

  #syncCardSelection() {
    this.ref.columns.querySelectorAll('[data-sn-board-card-id]').forEach((cardEl) => {
      if (cardEl.classList.contains('sn-kanban-card')) {
        cardEl.setAttribute('aria-selected', String(cardEl.dataset.snBoardCardId === this.#selectedCardId));
      }
    });
  }

  #syncColumnHeaderHeights() {
    let syncId = ++this.#headerSyncId;
    let schedule = globalThis.requestAnimationFrame || ((callback) => globalThis.setTimeout?.(callback, 0));
    schedule?.(() => {
      if (syncId !== this.#headerSyncId || !this.isConnected) return;
      let headers = [...this.querySelectorAll('.sn-kanban-column-header')];
      for (let header of headers) header.style.height = 'auto';
      let maxHeight = Math.ceil(Math.max(0, ...headers.map((header) => {
        let rectHeight = header.getBoundingClientRect?.().height || 0;
        return rectHeight || header.offsetHeight || 0;
      })));
      if (!maxHeight) return;
      for (let header of headers) header.style.height = `${maxHeight}px`;
    });
  }

  #dispatch(type, detail = {}) {
    let event = new CustomEvent(type, {
      bubbles: true,
      composed: true,
      detail: { board: this.#board, ...detail },
    });
    this.dispatchEvent(event);
    return event;
  }
}

KanbanBoard.template = template;
KanbanBoard.rootStyles = css;
KanbanBoard.reg('sn-kanban-board');

export default KanbanBoard;
