import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGraphExplorerViewController,
  createGraphPathStyleMenuActions,
  resolveGraphPathStyleAction,
} from '../canvas/graph-explorer.js';

test('graph path style menu actions are a structured graph capability', () => {
  let structuredActions = createGraphPathStyleMenuActions({
    mode: 'structured',
    pathStyle: 'orthogonal',
    labels: {
      pcb: 'Routed',
      orthogonal: 'Right angles',
      bezier: 'Curved',
      straight: 'Straight',
    },
    titles: {
      pcb: 'Use routed paths',
      orthogonal: 'Use right-angle paths',
      bezier: 'Use curved paths',
      straight: 'Use straight paths',
    },
  });

  assert.deepEqual(structuredActions.map((action) => action.id), [
    'path:pcb',
    'path:bezier',
    'path:orthogonal',
    'path:straight',
  ]);
  assert.deepEqual(structuredActions.map((action) => action.group), ['path', 'path', 'path', 'path']);
  assert.equal(structuredActions.find((action) => action.id === 'path:orthogonal')?.active, true);
  assert.equal(structuredActions.find((action) => action.id === 'path:pcb')?.title, 'Use routed paths');
  assert.deepEqual(createGraphPathStyleMenuActions({ mode: 'flat', pathStyle: 'pcb' }), []);
  assert.deepEqual(createGraphPathStyleMenuActions({ mode: 'media', pathStyle: 'pcb' }), []);
  assert.equal(resolveGraphPathStyleAction('path:straight'), 'straight');
  assert.equal(resolveGraphPathStyleAction('graph:flat-mode'), '');
});

test('graph view controller runs path style menu actions only for structured mode', () => {
  let calls = [];
  let structuredCanvas = {
    hidden: false,
    setAttribute() {},
    resumeLayout() {},
    setPathStyle(style) {
      calls.push(`structured:path:${style}`);
    },
    refreshConnections() {
      calls.push('structured:refresh');
    },
  };
  let flatGraph = {
    hidden: false,
    setAttribute() {},
    suspendLayout() {},
  };
  let controller = createGraphExplorerViewController({
    mode: 'structured',
    structuredCanvas,
    flatGraph,
    pathStyle: 'pcb',
  });

  assert.equal(controller.runPathStyleMenuAction('path:straight'), true);
  assert.equal(controller.getState().pathStyle, 'straight');
  assert.deepEqual(calls.slice(-2), ['structured:path:straight', 'structured:refresh']);
  assert.equal(controller.getPathStyleMenuActions().find((action) => action.id === 'path:straight')?.active, true);

  controller.setMode('flat');
  assert.deepEqual(controller.getPathStyleMenuActions(), []);
  assert.equal(controller.runPathStyleMenuAction('path:pcb'), false);
  assert.equal(controller.getState().pathStyle, 'straight');
});
