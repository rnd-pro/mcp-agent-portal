import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFlatPathHash,
  getFileSelectionNodeId,
  resolveGraphNodeClick,
  resolveToolbarAction,
  selectLabelMode,
} from '../../web/panels/dep-graph-ui.js';

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
