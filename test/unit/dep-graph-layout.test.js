import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFlatGroups,
  buildGraphStatItems,
  prepareGraphBuild,
} from 'symbiote-node/graph';

function createGraph() {
  return {
    editor: {},
    fileMap: new Map([
      ['web/app.js', 'node-web'],
      ['src/a.js', 'node-src-a'],
      ['src/b.js', 'node-src-b'],
    ]),
    dirFiles: new Map([
      ['web/', ['web/app.js']],
      ['src/', ['src/a.js', 'src/b.js']],
    ]),
    dirNodeMap: new Map(),
    idToPath: new Map(),
    symbolMap: new Map([
      ['symbol-a', { file: 'src/a.js' }],
      ['symbol-b', { file: 'src/b.js' }],
    ]),
  };
}

function getOrBuildGraph({
  cache,
  skeleton,
  isStructured,
  buildStructuredGraphFn,
  buildFileGraphFn,
}) {
  let cacheKey = isStructured ? 'structured' : 'flat';
  let cachedGraph = cache[cacheKey];

  if (cachedGraph?.skeleton === skeleton) {
    return { graph: cachedGraph, cached: true };
  }

  let graph = isStructured
    ? buildStructuredGraphFn(skeleton)
    : buildFileGraphFn(skeleton);

  cache[cacheKey] = { skeleton, ...graph };
  return { graph: cache[cacheKey], cached: false };
}

function getDrillableFiles(symbolMap = new Map()) {
  return new Set([...symbolMap.values()].map((symbol) => symbol.file));
}

describe('dep-graph-layout', () => {
  it('buildFlatGroups maps directory files to node ids', () => {
    const dirFiles = new Map([
      ['src/', ['src/a.js', 'src/b.js', 'src/missing.js']],
      ['test/', ['test/a.test.js']],
    ]);
    const fileMap = new Map([
      ['src/a.js', 'node-a'],
      ['src/b.js', 'node-b'],
      ['test/a.test.js', 'node-test'],
    ]);

    assert.deepEqual(buildFlatGroups(dirFiles, fileMap), {
      'src/': ['node-a', 'node-b'],
      'test/': ['node-test'],
    });
  });

  it('buildFlatGroups keeps directory groups for files outside semantic clusters', () => {
    const dirFiles = new Map([
      ['web/', ['web/app.js']],
      ['src/', ['src/a.js', 'src/b.js']],
    ]);
    const fileMap = new Map([
      ['web/app.js', 'node-web'],
      ['src/a.js', 'node-src-a'],
      ['src/b.js', 'node-src-b'],
    ]);

    assert.deepEqual(buildFlatGroups(dirFiles, fileMap, {
      clusters: [{ id: 'web-dashboard', label: 'Web Dashboard', paths: ['web/'] }],
    }), {
      'cluster:web-dashboard': ['node-web'],
      'src/': ['node-src-a', 'node-src-b'],
    });
  });

  it('prepareGraphBuild returns flat groups and drillable files', () => {
    let cache = {};
    let skeleton = { files: [] };

    let result = prepareGraphBuild({
      cache,
      skeleton,
      isStructured: false,
      projectGraphMetadata: {
        clusters: [{ id: 'web-dashboard', label: 'Web Dashboard', paths: ['web/'] }],
      },
      getOrBuildGraphFn: getOrBuildGraph,
      getDrillableFilesFn: getDrillableFiles,
      buildStructuredGraphFn: () => {
        throw new Error('structured builder should not run');
      },
      buildFileGraphFn: createGraph,
    });

    assert.equal(result.cached, false);
    assert.deepEqual(result.groups, {
      'cluster:web-dashboard': ['node-web'],
      'src/': ['node-src-a', 'node-src-b'],
    });
    assert.deepEqual([...result.drillableFiles].sort(), ['src/a.js', 'src/b.js']);
  });

  it('prepareGraphBuild keeps structured groups empty and reuses cache', () => {
    let cache = {};
    let skeleton = { files: [] };
    let buildCount = 0;

    let options = {
      cache,
      skeleton,
      isStructured: true,
      projectGraphMetadata: null,
      getOrBuildGraphFn: getOrBuildGraph,
      getDrillableFilesFn: getDrillableFiles,
      buildStructuredGraphFn: () => {
        buildCount++;
        return createGraph();
      },
      buildFileGraphFn: () => {
        throw new Error('file builder should not run');
      },
    };

    let first = prepareGraphBuild(options);
    let second = prepareGraphBuild(options);

    assert.equal(buildCount, 1);
    assert.equal(first.cached, false);
    assert.equal(second.cached, true);
    assert.deepEqual(first.groups, {});
    assert.deepEqual(second.groups, {});
  });

  it('buildGraphStatItems includes vias only when present', () => {
    assert.deepEqual(
      buildGraphStatItems({
        skeletonStats: { functions: 4, classes: 2 },
        fileCount: 3,
        edgeCount: 5,
        viaCount: 1,
      }),
      [[3, 'files'], [4, 'fn'], [2, 'cls'], [5, 'edges'], [1, 'vias']],
    );

    assert.deepEqual(
      buildGraphStatItems({
        skeletonStats: {},
        fileCount: 3,
        edgeCount: 5,
        viaCount: 0,
      }),
      [[3, 'files'], [0, 'fn'], [0, 'cls'], [5, 'edges']],
    );
  });
});
