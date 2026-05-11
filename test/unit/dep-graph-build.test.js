import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createForceLayoutPayload,
  findForceNodeGroup,
  getDrillableFiles,
  getForceLayoutOptions,
  getGraphCacheKey,
  getOrBuildGraph,
} from '../../web/panels/dep-graph-build.js';

function createGraph(label) {
  return {
    editor: {
      label,
      getNodes() {
        return [{ id: `${label}-node` }];
      },
    },
    fileMap: new Map(),
    dirFiles: new Map(),
    dirNodeMap: new Map(),
    idToPath: new Map(),
    symbolMap: new Map(),
  };
}

test('getGraphCacheKey maps view mode to cache key', () => {
  assert.equal(getGraphCacheKey(true), 'structured');
  assert.equal(getGraphCacheKey(false), 'flat');
});

test('getOrBuildGraph builds and caches structured graphs', () => {
  const cache = {};
  const skeleton = { id: 'skeleton' };
  let structuredCalls = 0;

  const result = getOrBuildGraph({
    cache,
    skeleton,
    isStructured: true,
    buildStructuredGraphFn() {
      structuredCalls++;
      return createGraph('structured');
    },
    buildFileGraphFn() {
      throw new Error('unexpected flat build');
    },
  });

  assert.equal(result.cacheKey, 'structured');
  assert.equal(result.cached, false);
  assert.equal(result.graph.editor.label, 'structured');
  assert.equal(cache.structured, result.graph);
  assert.equal(structuredCalls, 1);

  const cached = getOrBuildGraph({
    cache,
    skeleton,
    isStructured: true,
    buildStructuredGraphFn() {
      structuredCalls++;
      return createGraph('structured-again');
    },
    buildFileGraphFn() {
      throw new Error('unexpected flat build');
    },
  });

  assert.equal(cached.cached, true);
  assert.equal(cached.graph.editor.label, 'structured');
  assert.equal(structuredCalls, 1);
});

test('getOrBuildGraph normalizes missing flat symbolMap', () => {
  const cache = {};
  const skeleton = { id: 'flat' };

  const result = getOrBuildGraph({
    cache,
    skeleton,
    isStructured: false,
    buildStructuredGraphFn() {
      throw new Error('unexpected structured build');
    },
    buildFileGraphFn() {
      const graph = createGraph('flat');
      delete graph.symbolMap;
      return graph;
    },
  });

  assert.equal(result.cacheKey, 'flat');
  assert.equal(result.cached, false);
  assert.equal(result.graph.symbolMap instanceof Map, true);
});

test('getDrillableFiles returns files from symbols', () => {
  const symbolMap = new Map([
    ['symbol-a', { file: 'src/a.js' }],
    ['symbol-b', { file: 'src/b.js' }],
  ]);

  assert.deepEqual(getDrillableFiles(symbolMap), new Set(['src/a.js', 'src/b.js']));
});

test('findForceNodeGroup returns containing group name', () => {
  const groups = {
    src: ['node-a', 'node-b'],
    test: ['node-c'],
  };

  assert.equal(findForceNodeGroup(groups, 'node-b'), 'src');
  assert.equal(findForceNodeGroup(groups, 'missing'), null);
});

test('getForceLayoutOptions preserves small and large graph thresholds', () => {
  assert.deepEqual(getForceLayoutOptions(50), {
    chargeStrength: -150,
    linkDistance: 150,
  });

  assert.deepEqual(getForceLayoutOptions(501, { continuous: true }), {
    chargeStrength: -300,
    linkDistance: 100,
    nodeWidth: 260,
    nodeHeight: 40,
    mode: 'continuous',
    brownian: 0,
  });
});

test('createForceLayoutPayload maps editor data to worker payload', () => {
  const nodes = [
    { id: 'node-a', params: { calculatedWidth: 320, calculatedHeight: 80 } },
    { id: 'node-b', params: { calculatedWidth: 280, calculatedHeight: 70 } },
  ];
  const connections = [
    { id: 'conn-a', from: 'node-a', to: 'node-b' },
  ];
  const positions = {
    'node-a': { x: 10, y: 20 },
  };
  const groups = {
    src: ['node-a'],
  };
  const nodeSizes = {
    'node-b': { w: 340, h: 90 },
  };

  assert.deepEqual(createForceLayoutPayload({
    nodes,
    connections,
    positions,
    groups,
    nodeSizes,
    continuous: true,
  }), {
    nodes: [
      { id: 'node-a', x: 10, y: 20, group: 'src', w: 320, h: 80 },
      { id: 'node-b', x: 0, y: 0, group: null, w: 340, h: 90 },
    ],
    edges: [
      { from: 'node-a', to: 'node-b' },
    ],
    groups,
    options: {
      chargeStrength: -150,
      linkDistance: 150,
      nodeWidth: 260,
      nodeHeight: 40,
      mode: 'continuous',
      brownian: 0,
    },
  });
});
