import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';

class TestCSSStyleSheet {
  replaceSync(text) {
    this.cssText = text;
  }
}

function installDom() {
  let { window } = parseHTML('<!doctype html><html><body></body></html>');
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    customElements: window.customElements,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    CSSStyleSheet: TestCSSStyleSheet,
  });
  window.document.adoptedStyleSheets = [];
  Object.defineProperty(window.HTMLElement.prototype, 'adoptedStyleSheets', {
    configurable: true,
    get() {
      return this.__symbioteSsrSheets || [];
    },
    set(value) {
      this.__symbioteSsrSheets = value;
    },
  });
}

async function nextTick() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('sn-kanban-board renders columns and emits card intents', async () => {
  installDom();
  let { KanbanBoard, normalizeKanbanBoardModel } = await import('../board/index.js');

  assert.equal(typeof KanbanBoard, 'function');
  let normalized = normalizeKanbanBoardModel({
    id: 'workflow',
    columns: [{ id: 'ready', title: 'Ready' }],
    cards: [{ id: 'task-1', columnId: 'ready', title: 'Task 1' }],
  });
  assert.equal(normalized.columns[0].cards[0].title, 'Task 1');

  let board = document.createElement('sn-kanban-board');
  let selected = null;
  let action = null;
  board.addEventListener('sn-board-card-select', (event) => {
    selected = event.detail;
  });
  board.addEventListener('sn-board-card-action', (event) => {
    action = event.detail;
  });
  document.body.append(board);
  await nextTick();

  board.setBoard({
    columns: [{
      id: 'ready',
      title: 'Ready',
      cards: [{
        id: 'task-1',
        title: 'Task 1',
        summary: 'Accepted work',
        meta: ['project-a'],
        footer: [{ label: 'qa-engineer', icon: 'bug_report', kind: 'agent', accent: '#6A1B9A' }],
        actions: [{ id: 'move-next', icon: 'arrow_forward', title: 'Move next' }],
      }],
    }],
  });

  assert.equal(board.querySelectorAll('.sn-kanban-column').length, 1);
  assert.equal(board.querySelector('.sn-kanban-card-title-text')?.textContent, 'Task 1');
  assert.equal(board.querySelector('.sn-kanban-card')?.tagName.toLowerCase(), 'article');
  assert.equal(board.querySelector('.sn-kanban-card')?.getAttribute('role'), 'button');
  assert.equal(
    board.querySelector('.sn-kanban-card-actions')?.tagName.toLowerCase(),
    'sn-dropdown',
    'card actions should render behind one native-popover dropdown trigger, not an in-card expanding menu',
  );
  assert.ok(
    board.querySelector('.sn-kanban-card-actions .sn-dropdown-trigger .sn-kanban-card-menu'),
    'slot distribution should place the card menu button inside the dropdown trigger',
  );
  let actionMenu = board.querySelector('.sn-kanban-card-actions .sn-dropdown-popover sn-menu');
  assert.ok(
    actionMenu,
    'slot distribution should place the action menu inside the native popover, hidden until triggered',
  );
  // Lazy population: the sn-menu shell exists eagerly (it is the popover anchor), but its
  // items are deferred until the popover first opens — nothing to render across a whole board
  // of closed menus.
  assert.equal(
    actionMenu.querySelectorAll('sn-menu-item').length,
    0,
    'action items are not materialized until the popover is first opened',
  );
  let dropdown = board.querySelector('.sn-kanban-card-actions');
  let popover = dropdown.querySelector('.sn-dropdown-popover');
  popover.dispatchEvent(new CustomEvent('beforetoggle', { detail: {} }));
  assert.equal(
    actionMenu.querySelectorAll('sn-menu-item').length,
    1,
    'opening the popover materializes the action items once',
  );
  assert.ok(
    board.querySelector('.sn-kanban-card-actions .sn-dropdown-popover sn-menu [data-sn-board-action="move-next"]'),
    'the materialized item carries its action id for the select handler',
  );
  // Agent identity chip: the data-carried accent lands as a custom property the theme's
  // container-fill math consumes; kind switches the chip to the agent variant.
  let agentChip = board.querySelector('.sn-kanban-chip[data-kind="agent"]');
  assert.ok(agentChip, 'footer renders the agent identity chip');
  assert.equal(agentChip.style.getPropertyValue('--sn-kanban-chip-accent'), '#6A1B9A');
  board.querySelector('.sn-kanban-card').click();
  assert.equal(selected.card.id, 'task-1');
  board.querySelector('[data-sn-board-action]').click();
  assert.equal(action.actionId, 'move-next');
  assert.equal(action.card.id, 'task-1');

  board.setBoard({ columns: [] });
  let emptyState = board.querySelector('sn-empty-state.sn-kanban-empty');
  assert.ok(emptyState, 'board empty state should compose the shared display primitive');
  assert.equal(emptyState.hidden, false);
});

test('sn-kanban-board reconciles setBoard by key instead of rebuilding the DOM', async () => {
  // Reuses the DOM + custom-element registry installed by the first test: the component is
  // registered against that window, so a fresh installDom() would produce inert elements.
  await import('../board/index.js');
  let board = document.createElement('sn-kanban-board');
  document.body.append(board);
  await nextTick();

  let model = (cards) => ({
    columns: [{ id: 'ready', title: 'Ready' }, { id: 'doing', title: 'Doing' }],
    cards,
  });
  board.setBoard(model([
    { id: 'a', columnId: 'ready', title: 'Alpha', ticker: { label: 'Reviewing diff', icon: 'bolt', kind: 'state' } },
    { id: 'b', columnId: 'ready', title: 'Beta' },
  ]));

  let cardA = board.querySelector('[data-sn-board-card-id="a"]');
  let cardB = board.querySelector('[data-sn-board-card-id="b"]');
  let readyList = board.querySelector('.sn-kanban-card-list[data-column-id="ready"]');
  let titleTextB = cardB.querySelector('.sn-kanban-card-title-text');
  cardA.testMarker = 'alpha';
  cardB.testMarker = 'beta';

  // Ticker renders as the dedicated one-line row between title and footer.
  let ticker = cardA.querySelector('.sn-kanban-card-ticker');
  assert.equal(ticker.dataset.kind, 'state');
  assert.equal(ticker.querySelector('.sn-kanban-card-ticker-text')?.textContent, 'Reviewing diff');
  assert.equal(ticker.querySelector('.material-symbols-outlined')?.textContent, 'bolt');
  assert.equal([...cardA.children].indexOf(ticker), 2, 'ticker row sits between title and footer');

  board.setBoard(model([
    { id: 'a', columnId: 'ready', title: 'Alpha renamed', summary: 'A very long inspector-only text', ticker: { label: 'Running tests', kind: 'state' } },
    {
      id: 'b',
      columnId: 'ready',
      title: 'Beta',
      body: 'Inspector-only body that should not repaint the card face.',
      runs: [{ id: 'run-b', status: 'completed' }],
      events: [{ id: 'event-b', eventType: 'note' }],
      metadata: { realization: { total: 12, done: 7 } },
    },
  ]));

  // (a) A changed card is PATCHED: the article element is the same node.
  let patchedA = board.querySelector('[data-sn-board-card-id="a"]');
  assert.equal(patchedA, cardA, 'changed card keeps element identity');
  assert.equal(patchedA.testMarker, 'alpha');
  assert.equal(patchedA.querySelector('.sn-kanban-card-title-text').textContent, 'Alpha renamed');
  assert.equal(patchedA.getAttribute('aria-label'), 'Alpha renamed');
  assert.equal(patchedA.querySelector('.sn-kanban-card-ticker-text').textContent, 'Running tests');
  // Summary is inspector content — the card face never renders it.
  assert.equal(patchedA.querySelector('.sn-kanban-card-summary'), null);

  // (b) An unchanged card is not touched at all: same element, same child nodes.
  let untouchedB = board.querySelector('[data-sn-board-card-id="b"]');
  assert.equal(untouchedB, cardB);
  assert.equal(untouchedB.testMarker, 'beta');
  assert.equal(untouchedB.querySelector('.sn-kanban-card-title-text'), titleTextB, 'unchanged card children are untouched');
  assert.equal(untouchedB.querySelector('.sn-kanban-card-summary'), null, 'inspector-only body stays off the card face');
  // The column's card list (the scroll host) is never recreated for a surviving column.
  assert.equal(board.querySelector('.sn-kanban-card-list[data-column-id="ready"]'), readyList);

  // (c) A card moved between columns keeps element identity.
  board.setBoard(model([
    { id: 'a', columnId: 'doing', title: 'Alpha renamed', ticker: { label: 'Running tests', kind: 'state' } },
    { id: 'b', columnId: 'ready', title: 'Beta' },
  ]));
  let movedA = board.querySelector('.sn-kanban-card-list[data-column-id="doing"] [data-sn-board-card-id="a"]');
  assert.equal(movedA, cardA, 'moved card keeps element identity');
  assert.equal(board.querySelector('.sn-kanban-card-list[data-column-id="ready"] [data-sn-board-card-id="a"]'), null);

  // (d) A removed card leaves the DOM; the emptied column shows its placeholder.
  board.setBoard(model([{ id: 'b', columnId: 'ready', title: 'Beta' }]));
  assert.equal(board.querySelector('[data-sn-board-card-id="a"]'), null);
  assert.equal(cardA.isConnected, false);
  assert.ok(board.querySelector('.sn-kanban-card-list[data-column-id="doing"] .sn-kanban-column-empty'));

  board.remove();
});

test('sn-kanban-board defers action items until first open and re-arms on action change', async () => {
  await import('../board/index.js');
  let board = document.createElement('sn-kanban-board');
  document.body.append(board);
  await nextTick();

  let openMenu = (dropdown) =>
    dropdown.querySelector('.sn-dropdown-popover')
      .dispatchEvent(new CustomEvent('beforetoggle', { detail: {} }));

  board.setBoard({
    columns: [{
      id: 'ready',
      title: 'Ready',
      cards: [{ id: 'a', title: 'Alpha', actions: [{ id: 'edit', title: 'Edit' }, { id: 'del', title: 'Delete' }] }],
    }],
  });

  let dropdown = board.querySelector('.sn-kanban-card-actions');
  let menu = dropdown.querySelector('.sn-dropdown-popover sn-menu');
  // Closed: the sn-menu shell exists (popover anchor) but carries no items.
  assert.equal(menu.querySelectorAll('sn-menu-item').length, 0, 'items are deferred until first open');

  openMenu(dropdown);
  assert.equal(menu.querySelectorAll('sn-menu-item').length, 2, 'first open materializes the items once');
  let firstItem = menu.querySelector('sn-menu-item');

  // Re-open with unchanged actions: the built items are reused, not rebuilt.
  openMenu(dropdown);
  assert.equal(menu.querySelectorAll('sn-menu-item').length, 2, 'a second open reuses the built items');
  assert.equal(menu.querySelector('sn-menu-item'), firstItem, 'built items are reused across opens');

  // An unchanged card on a fresh setBoard keeps its live dropdown and does not rebuild the menu.
  board.setBoard({
    columns: [{
      id: 'ready',
      title: 'Ready',
      cards: [{ id: 'a', title: 'Alpha', actions: [{ id: 'edit', title: 'Edit' }, { id: 'del', title: 'Delete' }] }],
    }],
  });
  assert.equal(board.querySelector('.sn-kanban-card-actions'), dropdown, 'unchanged actions keep the dropdown');
  assert.equal(menu.querySelector('sn-menu-item'), firstItem, 'unchanged actions keep the built items');

  // Changing the action list re-arms the lazy menu: it empties and rebuilds on the next open.
  board.setBoard({
    columns: [{
      id: 'ready',
      title: 'Ready',
      cards: [{ id: 'a', title: 'Alpha', actions: [{ id: 'edit', title: 'Edit' }] }],
    }],
  });
  assert.equal(board.querySelector('.sn-kanban-card-actions'), dropdown, 'changed actions reuse the dropdown + trigger');
  assert.equal(menu.querySelectorAll('sn-menu-item').length, 0, 'changed actions clear the lazy menu until re-opened');
  openMenu(dropdown);
  assert.equal(menu.querySelectorAll('sn-menu-item').length, 1, 'the re-armed menu rebuilds from the new actions on open');
  assert.ok(menu.querySelector('[data-sn-board-action="edit"]'));
  assert.equal(menu.querySelector('[data-sn-board-action="del"]'), null, 'the removed action is gone from the rebuilt menu');

  board.remove();
});

test('sn-kanban-board skips header measurement on card-only updates', async () => {
  await import('../board/index.js');
  let board = document.createElement('sn-kanban-board');
  document.body.append(board);
  await nextTick();

  let originalRaf = globalThis.requestAnimationFrame;
  let originalRect = window.HTMLElement.prototype.getBoundingClientRect;
  let measureCount = 0;
  globalThis.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };
  window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if (this.classList?.contains('sn-kanban-column-header')) measureCount += 1;
    return { height: 24, width: 160, top: 0, left: 0, right: 160, bottom: 24 };
  };

  try {
    let model = (columnTitle, cardTitle) => ({
      columns: [{
        id: 'ready',
        title: columnTitle,
        cards: [{ id: 'a', columnId: 'ready', title: cardTitle }],
      }],
    });

    board.setBoard(model('Ready', 'Alpha'));
    assert.equal(measureCount, 1, 'initial header render measures once');

    measureCount = 0;
    board.setBoard(model('Ready', 'Alpha renamed'));
    assert.equal(measureCount, 0, 'card-only updates skip header measurement');

    board.setBoard(model('Ready now', 'Alpha renamed'));
    assert.equal(measureCount, 1, 'header changes still measure alignment');
  } finally {
    if (originalRaf) globalThis.requestAnimationFrame = originalRaf;
    else delete globalThis.requestAnimationFrame;
    if (originalRect) {
      window.HTMLElement.prototype.getBoundingClientRect = originalRect;
    } else {
      delete window.HTMLElement.prototype.getBoundingClientRect;
    }
    board.remove();
  }
});

test('sn-kanban-board updates custom headers only for header context changes', async () => {
  await import('../board/index.js');
  let board = document.createElement('sn-kanban-board');
  document.body.append(board);
  await nextTick();

  let calls = 0;
  let renderColumnHeader = (column, context) => {
    calls += 1;
    let node = document.createElement('div');
    node.className = 'custom-header';
    node.textContent = `${context.board.raw.mode}:${column.title}`;
    return node;
  };
  let model = (mode, title = 'Alpha') => ({
    mode,
    columns: [{
      id: 'ready',
      title: 'Ready',
      cards: [{ id: 'a', columnId: 'ready', title }],
    }],
  });

  board.setBoard(model('manual'), { renderColumnHeader });
  let header = board.querySelector('.custom-header');
  assert.equal(header.textContent, 'manual:Ready');
  assert.equal(calls, 1);

  board.setBoard(model('manual', 'Alpha changed'), { renderColumnHeader });
  assert.equal(board.querySelector('.custom-header'), header, 'card-only updates keep the header node');
  assert.equal(calls, 1);

  board.setBoard(model('autonomous', 'Alpha changed'), { renderColumnHeader });
  assert.notEqual(board.querySelector('.custom-header'), header, 'board header context changes rebuild the header');
  assert.equal(board.querySelector('.custom-header').textContent, 'autonomous:Ready');
  assert.equal(calls, 2);

  board.remove();
});

test('sn-kanban-board exposes column stretch sizing tokens', async () => {
  let { default: css } = await import('../board/KanbanBoard/KanbanBoard.css.js');

  assert.match(css, /align-items: var\(--sn-kanban-columns-align, stretch\);/);
  assert.match(css, /height: var\(--sn-kanban-columns-height, 100%\);/);
  assert.match(css, /min-height: var\(--sn-kanban-columns-min-height, 0\);/);
  assert.match(css, /height: var\(--sn-kanban-column-height, auto\);/);
  assert.match(css, /overflow: var\(--sn-kanban-card-list-overflow, auto\);/);
  assert.match(css, /sn-kanban-board \.sn-kanban-column-header \{[\s\S]*flex: 0 0 auto;/);
  assert.match(css, /sn-kanban-board \.sn-kanban-card \{[\s\S]*flex: 0 0 auto;/);
  // Fixed widget geometry: meta and footer are single non-wrapping clipped lines; the
  // host's chip budget + '+N' overflow chip (U01) guarantee the footer fits.
  assert.match(css, /sn-kanban-board \.sn-kanban-card-footer \{[^}]*flex-wrap: nowrap;/);
  assert.match(css, /sn-kanban-board \.sn-kanban-card-meta \{[^}]*flex-wrap: nowrap;/);
  assert.doesNotMatch(css, /sn-kanban-board \.sn-kanban-card-footer \{[^}]*display: grid;/);
  // Uniform card height (height, not min-height) with internal clipping.
  assert.match(css, /sn-kanban-board \.sn-kanban-card \{[^}]*height: var\(--sn-kanban-card-height, 148px\);/);
  assert.match(css, /sn-kanban-board \.sn-kanban-card \{[^}]*overflow: hidden;/);
  assert.doesNotMatch(css, /min-height: var\(--sn-kanban-card-min-height/);
  // Title clamps to two lines on the fixed card face.
  assert.match(css, /sn-kanban-board \.sn-kanban-card-title-text \{[^}]*-webkit-line-clamp: var\(--sn-kanban-card-title-lines, 2\);/);
  // Ticker row: one ellipsized line with a text-relative icon.
  assert.match(css, /sn-kanban-board \.sn-kanban-card-ticker-text \{[^}]*white-space: nowrap;/);
  assert.match(css, /sn-kanban-board \.sn-kanban-card-ticker \.material-symbols-outlined \{[^}]*font-size: 1\.15em;/);
  // Chip icons size relative to chip text instead of inheriting oversized glyphs.
  assert.match(css, /sn-kanban-board \.sn-kanban-chip \.material-symbols-outlined \{[^}]*font-size: 1\.15em;/);
  // 'state' chip kind: accent-tinted fill, the only animated chip family.
  assert.match(css, /sn-kanban-board \.sn-kanban-chip\[data-kind="state"\] \{[^}]*background: color-mix\(in oklch, var\(--sn-sys-accent\) 14%, var\(--sn-kanban-card-bg\)\);/);
  assert.match(css, /sn-kanban-board \.sn-kanban-chip\[data-kind="state"\] \{[^}]*animation: sn-kanban-chip-pulse var\(--sn-animation-duration-slower\)/);
  assert.doesNotMatch(css, /sn-kanban-board \.sn-kanban-chip\[data-kind="(?:status|warning|error|agent)"\] \{[^}]*animation:/);
  // Narrow-column adaptivity via named inline-size container queries on the column.
  assert.match(css, /container: kanban-column \/ inline-size;/);
  assert.match(css, /@container kanban-column \(width <= 250px\)/);
  assert.match(css, /@container kanban-column \(width <= 210px\)/);
  // U07: the actions menu is the sn-dropdown native popover + anchor-positioning primitive —
  // no in-card grid-column: 1/-1 expansion class remains.
  assert.doesNotMatch(css, /grid-column:\s*1\s*\/\s*-1/);
  assert.doesNotMatch(css, /\[open\]/);
  assert.match(css, /sn-kanban-board \.sn-kanban-card-actions \{[^}]*--sn-dropdown-position-area/);
  // U02: card summary clamps instead of rendering unbounded raw text.
  assert.match(css, /sn-kanban-board \.sn-kanban-card-summary \{[^}]*-webkit-line-clamp: var\(--sn-kanban-card-summary-lines, 3\);/);
  // U05: status/priority chips carry container-fill weight; plain chips stay outline-only.
  assert.match(css, /sn-kanban-board \.sn-kanban-chip\[data-kind="status"\] \{[^}]*background: var\(--sn-sys-success-container\);/);
  // Agent identity chips blend the data-carried accent through theme-owned container math.
  assert.match(css, /sn-kanban-board \.sn-kanban-chip\[data-kind="agent"\] \{[^}]*var\(--sn-kanban-chip-accent, var\(--sn-sys-accent\)\)/);
  assert.doesNotMatch(css, /sn-kanban-board \.sn-kanban-chip \{[^}]*background:/);
  // U08: grab/grabbing cursor affordance for the draggable card.
  assert.match(css, /sn-kanban-board \.sn-kanban-card \{[\s\S]*cursor: grab;/);
  assert.match(css, /sn-kanban-board \.sn-kanban-card:active \{[\s\S]*cursor: grabbing;/);
  // No legacy flat token names or literal colors remain — only T2 system roles / T3 aliases
  // (the repo-wide tier audit enforces the full contract; pin the removed families here).
  assert.doesNotMatch(css, /var\(--sn-node-(?:bg|border|selected|hover)[,)]/);
  assert.doesNotMatch(css, /var\(--sn-(?:success|warning|danger)-color/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(css, /\b(?:hsla?|rgba?)\(/);
});
