import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';
import * as state from '../display/DataTable/dataTableState.js';

test('normalizeColumns handles empty and invalid inputs', () => {
  let cols = state.normalizeColumns(null);
  assert.deepEqual(cols, []);

  let raw = [
    { key: 'id', label: 'ID', sortable: true },
    { key: 'name', visible: false },
    { key: 'status', pinned: 'left', width: 150 },
    { key: 'action', pinned: 'right', order: 10 },
  ];

  let norm = state.normalizeColumns(raw);
  assert.equal(norm.length, 4);
  assert.equal(norm[0].key, 'id');
  assert.equal(norm[0].visible, true);
  assert.equal(norm[0].pinned, false);

  assert.equal(norm[1].key, 'name');
  assert.equal(norm[1].visible, false);

  assert.equal(norm[2].key, 'status');
  assert.equal(norm[2].pinned, 'left');
  assert.equal(norm[2].width, '150');

  assert.equal(norm[3].key, 'action');
  assert.equal(norm[3].pinned, 'right');
  assert.equal(norm[3].order, 10);
});

test('normalizeColumns normalizes schema aliases and unsafe widths', () => {
  let [col] = state.normalizeColumns([
    { key: 'name', pinned: 'none', width: '120; color: red' },
  ]);

  assert.equal(col.pinned, false);
  assert.equal(col.width, 'auto');

  let resized = state.setColumnWidth([col], 'name', 96.8);
  assert.equal(resized[0].width, '97');

  let unsafeResize = state.setColumnWidth([col], 'name', '12rem');
  assert.equal(unsafeResize[0].width, 'auto');
});

test('sortColumns preserves pinned ordering rules', () => {
  let cols = [
    { key: 'col1', pinned: false, order: 2 },
    { key: 'col2', pinned: 'right', order: 5 },
    { key: 'col3', pinned: 'left', order: 1 },
    { key: 'col4', pinned: false, order: 0 },
  ];

  let sorted = state.sortColumns(cols);
  assert.equal(sorted[0].key, 'col3'); // pinned: 'left'
  assert.equal(sorted[1].key, 'col4'); // pinned: false, order: 0
  assert.equal(sorted[2].key, 'col1'); // pinned: false, order: 2
  assert.equal(sorted[3].key, 'col2'); // pinned: 'right'
});

test('toggleColumnVisibility modifies target visibility state', () => {
  let cols = [
    { key: 'c1', visible: true },
    { key: 'c2', visible: true },
  ];

  let next = state.toggleColumnVisibility(cols, 'c1', false);
  assert.equal(next[0].visible, false);
  assert.equal(next[1].visible, true);
});

test('toggleColumnPinning sets correct pin status', () => {
  let cols = [
    { key: 'c1', pinned: false },
  ];

  let next = state.toggleColumnPinning(cols, 'c1', 'left');
  assert.equal(next[0].pinned, 'left');
});

test('toggleRowSelection supports single and multi mode selections', () => {
  let selected = new Set(['row1']);

  // Single select same row deselects it
  let nextSingle = state.toggleRowSelection(selected, 'row1', 'single');
  assert.equal(nextSingle.size, 0);

  // Single select other row clears first and selects other
  let nextSingleOther = state.toggleRowSelection(selected, 'row2', 'single');
  assert.equal(nextSingleOther.size, 1);
  assert.ok(nextSingleOther.has('row2'));

  // Multi select toggles
  let nextMulti = state.toggleRowSelection(selected, 'row2', 'multi');
  assert.equal(nextMulti.size, 2);
  assert.ok(nextMulti.has('row1'));
  assert.ok(nextMulti.has('row2'));
});

test('getTreeRows flattens hierarchical list based on expanded status', () => {
  let rows = [
    {
      id: 'r1',
      name: 'Root 1',
      children: [
        { id: 'c1', name: 'Child 1' },
        {
          id: 'c2',
          name: 'Child 2',
          children: [
            { id: 'gc1', name: 'Grandchild 1' }
          ]
        }
      ]
    },
    { id: 'r2', name: 'Root 2' }
  ];

  let expanded = new Set(['r1']); // c2 not expanded
  let flat = state.getTreeRows(rows, expanded);
  assert.equal(flat.length, 4); // r1, c1, c2, r2
  assert.equal(flat[0].level, 0);
  assert.equal(flat[1].level, 1);
  assert.equal(flat[2].level, 1);
  assert.equal(flat[3].level, 0);

  let expandedAll = new Set(['r1', 'c2']);
  let flatAll = state.getTreeRows(rows, expandedAll);
  assert.equal(flatAll.length, 5); // r1, c1, c2, gc1, r2
  assert.equal(flatAll[3].id, 'gc1');
  assert.equal(flatAll[3].level, 2);
});

// DOM Integration Tests
class TestCSSStyleSheet {
  replaceSync(text) {
    this.cssText = text;
  }
}

let testWindow = null;

function installDom() {
  if (testWindow) {
    testWindow.document.body.innerHTML = '';
    testWindow.document.adoptedStyleSheets = [];
    return;
  }

  let { window } = parseHTML('<!doctype html><html><body></body></html>');
  testWindow = window;
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    customElements: window.customElements,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    MutationObserver: window.MutationObserver,
    CSSStyleSheet: TestCSSStyleSheet,
  });
  window.document.adoptedStyleSheets = [];
}

async function nextRenderTick() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('DOM: sn-data-table rendering, visibility, selection and tree expansion', async () => {
  installDom();
  
  let { DataTable } = await import('../display/DataTable/DataTable.js');
  if (!customElements.get('sn-data-table')) {
    customElements.define('sn-data-table', DataTable);
  }

  let grid = document.createElement('sn-data-table');
  document.body.append(grid);
  await nextRenderTick();

  // Bind columns and rows
  grid.setData({
    columns: [
      { key: 'id', label: 'ID', width: 60, pinned: 'left' },
      { key: 'name', label: 'Name', sortable: true },
      { key: 'status', label: 'Status' }
    ],
    rows: [
      {
        id: 'r1',
        name: 'Root Alpha',
        status: 'Active',
        children: [
          { id: 'c1', name: 'Child Beta', status: 'Pending' }
        ]
      },
      { id: 'r2', name: 'Root Gamma', status: 'Inactive' }
    ]
  });
  await nextRenderTick();

  // Assert basic rendering
  assert.equal(grid.querySelector('table')?.getAttribute('role'), 'grid');
  let ths = grid.querySelectorAll('th');
  assert.equal(ths.length, 3);
  assert.match(ths[0].textContent, /ID/);
  assert.match(ths[1].textContent, /Name/);

  // Pinned styles checking
  assert.ok(ths[0].getAttribute('style').includes('position: sticky'));

  // Renders 2 visible rows initially because r1 is not expanded
  let trs = grid.querySelectorAll('tbody tr');
  assert.equal(trs.length, 2);

  // Toggle tree expansion
  grid.toggleRowExpansion('r1');
  await nextRenderTick();

  // Child row should now be visible (total 3 rows)
  let trsExpanded = grid.querySelectorAll('tbody tr');
  assert.equal(trsExpanded.length, 3);
  assert.equal(trsExpanded[1].dataset.rowId, 'c1');

  // Test multi-selection mode
  grid.selectionMode = 'multi';
  await nextRenderTick();

  // Header should now contain 4 columns (selection checkbox column + data columns)
  let thsMulti = grid.querySelectorAll('th');
  assert.equal(thsMulti.length, 4);
  assert.ok(grid.querySelector('.sn-data-table-select-all'));

  let selectEvent = null;
  grid.addEventListener('sn-data-table-select', (event) => {
    selectEvent = event.detail;
  });
  let selectAll = grid.querySelector('.sn-data-table-select-all');
  selectAll.checked = true;
  selectAll.dispatchEvent(new Event('click', { bubbles: true }));
  await nextRenderTick();

  assert.deepEqual(grid.selectedRowIds, ['r1', 'c1', 'r2']);
  assert.equal(selectEvent.mode, 'all');
  assert.deepEqual(selectEvent.selectedRowIds, ['r1', 'c1', 'r2']);

  // Test column visibility toggle
  grid.toggleColumnVisibility('status', false);
  await nextRenderTick();

  let thsHidden = grid.querySelectorAll('th');
  // Check that the hidden column status is omitted (4 -> 3)
  assert.equal(thsHidden.length, 3);
});

test('DOM: sn-data-table escapes row details content', async () => {
  installDom();

  let { DataTable } = await import('../display/DataTable/DataTable.js');
  if (!customElements.get('sn-data-table')) {
    customElements.define('sn-data-table', DataTable);
  }

  let grid = document.createElement('sn-data-table');
  document.body.append(grid);
  await nextRenderTick();

  grid.setData({
    columns: [{ key: 'name', label: 'Name' }],
    rows: [
      {
        id: 'r1',
        name: 'Unsafe details',
        details: '<img src=x onerror=alert(1)>',
      },
    ],
  });
  grid.toggleRowExpansion('r1');
  await nextRenderTick();

  let details = grid.querySelector('.sn-data-table-details-row td');
  assert.ok(details);
  assert.equal(details.textContent, '<img src=x onerror=alert(1)>');
  assert.equal(details.querySelector('img'), null);
});

test('DOM: sn-data-table edit intents use visible sorted columns', async () => {
  installDom();

  let { DataTable } = await import('../display/DataTable/DataTable.js');
  if (!customElements.get('sn-data-table')) {
    customElements.define('sn-data-table', DataTable);
  }

  let grid = document.createElement('sn-data-table');
  document.body.append(grid);
  await nextRenderTick();

  grid.setData({
    columns: [
      { key: 'id', label: 'ID', visible: false, order: 0 },
      { key: 'name', label: 'Name', order: 2 },
      { key: 'priority', label: 'Priority', order: 1 },
    ],
    rows: [
      { id: 'r1', name: 'Build', priority: 'High' },
    ],
  });
  await nextRenderTick();

  let editDetail = null;
  grid.addEventListener('sn-data-table-edit', (event) => {
    editDetail = event.detail;
  });

  let firstVisibleCell = grid.querySelector('tbody tr td');
  firstVisibleCell.dispatchEvent(new Event('dblclick', { bubbles: true }));
  await nextRenderTick();

  assert.equal(firstVisibleCell.textContent.trim(), 'High');
  assert.equal(editDetail.columnKey, 'priority');
  assert.equal(editDetail.value, 'High');
});

test('DOM: sn-data-table visible-window uses configured row height', async () => {
  installDom();

  let { DataTable } = await import('../display/DataTable/DataTable.js');
  if (!customElements.get('sn-data-table')) {
    customElements.define('sn-data-table', DataTable);
  }

  let grid = document.createElement('sn-data-table');
  grid.setAttribute('row-height', '48');
  document.body.append(grid);
  await nextRenderTick();

  grid.setData({
    columns: [{ key: 'name', label: 'Name' }],
    rows: Array.from({ length: 10 }, (_, index) => ({ id: `r${index}`, name: `Row ${index}` })),
  });
  await nextRenderTick();

  let visibleWindow = null;
  grid.addEventListener('sn-data-table-visible-window', (event) => {
    visibleWindow = event.detail;
  });

  let scroll = grid.querySelector('.sn-data-table-scroll');
  Object.defineProperty(scroll, 'scrollTop', { value: 96, configurable: true });
  Object.defineProperty(scroll, 'clientHeight', { value: 96, configurable: true });
  scroll.dispatchEvent(new Event('scroll', { bubbles: true }));
  await nextRenderTick();

  assert.equal(visibleWindow.startIndex, 2);
  assert.equal(visibleWindow.endIndex, 4);
});
