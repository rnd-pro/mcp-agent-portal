import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDrillableFiles,
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
