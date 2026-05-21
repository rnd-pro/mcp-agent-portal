import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFlatPathHash,
  getFileSelectionNodeId,
  getGraphHashNavigationState,
  resolveFlatHashChange,
  resolveGraphNodeClick,
  resolveToolbarAction,
  selectLabelMode,
  shouldClearFocusOnSelection,
  shouldFitForceLayoutInitialTick,
} from '../../web/panels/dep-graph-ui.js';
import {
  mountDepGraphTemplate,
  renderClusterPanel,
  renderGraphStats,
} from '../../web/panels/dep-graph-dom.js';

function createElement(tagName) {
  return {
    tagName,
    children: [],
    className: '',
    hidden: false,
    style: {},
    textContent: '',
    title: '',
    append(...items) {
      this.children.push(...items);
    },
    replaceChildren(...items) {
      this.children = items;
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    toggleAttribute(name, value) {
      this[name] = Boolean(value);
    },
  };
}

const testDocument = {
  createElement,
  createRange() {
    return {
      createContextualFragment(template) {
        return { template };
      },
    };
  },
};

test('mountDepGraphTemplate replaces host content with parsed template fragment', () => {
  const host = createElement('host');
  mountDepGraphTemplate(host, '<node-canvas></node-canvas>', testDocument);

  assert.deepEqual(host.children, [{ template: '<node-canvas></node-canvas>' }]);
});

test('renderClusterPanel hides unavailable flat legend and clears rows', () => {
  const panel = createElement('div');
  const toggle = createElement('button');

  renderClusterPanel({
    panel,
    toggle,
    clusters: [{ label: 'Core', paths: ['src/a.js'], color: 'red' }],
    viewMode: 'structured',
    isOpen: true,
    doc: testDocument,
  });

  assert.equal(panel.hidden, true);
  assert.deepEqual(panel.children, []);
  assert.equal(toggle.hidden, true);
});

test('renderClusterPanel renders safe semantic rows', () => {
  const panel = createElement('div');
  const toggle = createElement('button');

  renderClusterPanel({
    panel,
    toggle,
    clusters: [{ label: '<Core>', paths: ['src/a.js', 'src/b.js'], color: 'red' }],
    viewMode: 'flat',
    isOpen: true,
    doc: testDocument,
  });

  assert.equal(panel.hidden, false);
  assert.equal(panel.children.length, 1);
  assert.equal(panel.children[0].className, 'pcb-cluster-row');
  assert.equal(panel.children[0].children[1].textContent, '<Core>');
  assert.equal(toggle['data-active'], true);
});

test('renderGraphStats renders value/label pairs without HTML strings', () => {
  const stats = createElement('div');
  renderGraphStats(stats, [[3, 'files'], [2, 'edges']], testDocument);

  assert.equal(stats.children.length, 2);
  assert.equal(stats.children[0].children[0].className, 'graph-explorer-stat-val');
  assert.equal(stats.children[0].children[0].textContent, '3');
  assert.equal(stats.children[0].children[1], ' files');
});

test('buildFlatPathHash preserves query params for nested paths', () => {
  const params = new URLSearchParams('mode=flat&focus=src/app.js&style=pcb');

  assert.equal(
    buildFlatPathHash('src/components', params),
    '#graph/src/components?mode=flat&focus=src%2Fapp.js&style=pcb',
  );
});

test('buildFlatPathHash clears focus when returning to graph root', () => {
  const params = new URLSearchParams('mode=flat&focus=src/app.js&style=pcb');

  assert.equal(buildFlatPathHash('', params), '#graph?mode=flat&style=pcb');
});

test('selectLabelMode marks one button active and updates canvas mode', () => {
  function createButton(mode, active = false) {
    const attrs = new Set(active ? ['data-active'] : []);
    return {
      attrs,
      getAttribute(name) {
        return name === 'data-mode' ? mode : null;
      },
      setAttribute(name) {
        attrs.add(name);
      },
      removeAttribute(name) {
        attrs.delete(name);
      },
    };
  }

  const compact = createButton('compact', true);
  const full = createButton('full');
  const canvasAttrs = new Map();
  const canvas = {
    setAttribute(name, value) {
      canvasAttrs.set(name, value);
    },
  };

  assert.equal(selectLabelMode([compact, full], full, canvas), 'full');
  assert.equal(compact.attrs.has('data-active'), false);
  assert.equal(full.attrs.has('data-active'), true);
  assert.equal(canvasAttrs.get('data-label-mode'), 'full');
});

test('getFileSelectionNodeId strips trailing slash from directory selections', () => {
  assert.equal(getFileSelectionNodeId('src/components/'), 'src/components');
  assert.equal(getFileSelectionNodeId('src/app.js'), 'src/app.js');
});

test('resolveGraphNodeClick returns symbol click updates', () => {
  assert.deepEqual(
    resolveGraphNodeClick({
      nodeId: 'symbol-1',
      symbol: { name: 'run()', file: 'src/run.js' },
    }),
    {
      hashUpdates: [['symbol', 'run()']],
      fileEvent: { path: 'src/run.js', source: 'canvas' },
    },
  );
});

test('resolveGraphNodeClick returns root file focus updates', () => {
  assert.deepEqual(
    resolveGraphNodeClick({ nodeId: 'file-1', path: 'src/app.js', depth: 0 }),
    {
      hashUpdates: [['focus', 'src/app.js'], ['in', null]],
      fileEvent: { path: 'src/app.js', source: 'canvas' },
    },
  );
});

test('resolveGraphNodeClick returns drilled relative focus updates', () => {
  assert.deepEqual(
    resolveGraphNodeClick({
      nodeId: 'file-1',
      path: 'src/components/Button.js',
      depth: 1,
      hash: '#graph/src/components/?focus=Button.js',
    }),
    {
      hashUpdates: [['focus', 'Button.js'], ['in', '1']],
      fileEvent: { path: 'src/components/Button.js', source: 'canvas' },
    },
  );
});

test('resolveToolbarAction maps toolbar actions to component effects', () => {
  assert.deepEqual(
    resolveToolbarAction({ action: 'explore', nodeId: 'src/app.js', viewMode: 'flat' }),
    { type: 'fly-to-node', nodeId: 'src/app.js' },
  );
  assert.deepEqual(
    resolveToolbarAction({ action: 'explore', nodeId: 'node-1', viewMode: 'structured' }),
    { type: 'explore-node', nodeId: 'node-1' },
  );
  assert.deepEqual(
    resolveToolbarAction({ action: 'view-code', nodeId: 'node-1', viewMode: 'structured', path: 'src/app.js' }),
    { type: 'open-file', hash: '#explorer/src/app.js' },
  );
  assert.deepEqual(
    resolveToolbarAction({
      action: 'view-code',
      nodeId: 'symbol-1',
      viewMode: 'structured',
      symbol: { file: 'src/symbol.js' },
    }),
    { type: 'open-file', hash: '#explorer/src/symbol.js' },
  );
  assert.deepEqual(
    resolveToolbarAction({ action: 'enter', nodeId: 'src/components', viewMode: 'flat' }),
    { type: 'drill-node', nodeId: 'src/components' },
  );
});

test('shouldClearFocusOnSelection only clears focus after restored deselection', () => {
  assert.equal(
    shouldClearFocusOnSelection({
      selectedNodes: [],
      initialViewRestored: true,
      hash: '#graph?focus=src/app.js',
    }),
    true,
  );
  assert.equal(
    shouldClearFocusOnSelection({
      selectedNodes: ['node-1'],
      initialViewRestored: true,
      hash: '#graph?focus=src/app.js',
    }),
    false,
  );
  assert.equal(
    shouldClearFocusOnSelection({
      selectedNodes: [],
      initialViewRestored: false,
      hash: '#graph?focus=src/app.js',
    }),
    false,
  );
  assert.equal(
    shouldClearFocusOnSelection({
      selectedNodes: [],
      initialViewRestored: true,
      hash: '#graph',
    }),
    false,
  );
});

test('resolveFlatHashChange returns path and decoded focus for graph hashes', () => {
  assert.deepEqual(
    resolveFlatHashChange('#graph/src/components?focus=Button.js&mode=flat'),
    { path: 'src/components', focus: 'Button.js' },
  );
  assert.deepEqual(
    resolveFlatHashChange('#graph?focus=src%2Fapp.js'),
    { path: '', focus: 'src/app.js' },
  );
  assert.equal(resolveFlatHashChange('#dashboard'), null);
});

test('getGraphHashNavigationState detects graph paths and query params', () => {
  assert.deepEqual(getGraphHashNavigationState('#graph/src/components'), {
    hasPath: true,
    hasParams: false,
    shouldRestore: true,
  });
  assert.deepEqual(getGraphHashNavigationState('#graph?focus=src/app.js'), {
    hasPath: false,
    hasParams: true,
    shouldRestore: true,
  });
  assert.deepEqual(getGraphHashNavigationState('#graph'), {
    hasPath: false,
    hasParams: false,
    shouldRestore: false,
  });
});

test('shouldFitForceLayoutInitialTick skips fit when graph hash has params', () => {
  assert.equal(shouldFitForceLayoutInitialTick('#graph'), true);
  assert.equal(shouldFitForceLayoutInitialTick('#graph?focus=src/app.js'), false);
  assert.equal(shouldFitForceLayoutInitialTick('#graph?mode=flat'), false);
});
