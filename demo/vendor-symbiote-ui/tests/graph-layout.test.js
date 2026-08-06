import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeAutoLayout } from '../canvas/AutoLayout.js';
import {
  computeInitialGraphPositions,
  createForceLayoutPayload,
  findForceNodeGroup,
  getDrillableFiles,
  getForceLayoutOptions,
  getGraphCacheKey,
  getOrBuildGraph,
} from '../canvas/graph-layout.js';
import {
  createCanvasGraphStore,
  normalizeCanvasGraphModel,
} from '../canvas/graph-model.js';
import {
  cameraCenterToViewport,
  MIN_CANVAS_GRAPH_ZOOM,
  resolveCanvasGraphCameraArc,
  resolveCanvasGraphMinZoom,
  resolveCanvasGraphTransitionDuration,
  resolveCanvasGraphViewportFit,
  viewportToCameraCenter,
} from '../canvas/CanvasGraph/CanvasGraphViewport.js';

function createEditor(nodes, connections = []) {
  return {
    getNodes() {
      return nodes;
    },
    getConnections() {
      return connections;
    },
  };
}

function assertNoNodeOverlaps(positions, nodeSizes, padding = 0) {
  let ids = Object.keys(positions);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      let idA = ids[i];
      let idB = ids[j];
      let a = positions[idA];
      let b = positions[idB];
      let sizeA = nodeSizes[idA];
      let sizeB = nodeSizes[idB];
      let separated = (
        b.x >= a.x + sizeA.w + padding ||
        a.x >= b.x + sizeB.w + padding ||
        b.y >= a.y + sizeA.h + padding ||
        a.y >= b.y + sizeB.h + padding
      );
      assert.equal(separated, true, `${idA} overlaps ${idB}`);
    }
  }
}

describe('node graph layout helpers', () => {
  it('computes grouped auto layout positions without macro placement crashes', () => {
    let editor = createEditor(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      [{ from: 'a', to: 'b' }, { from: 'c', to: 'd' }]
    );
    let positions = computeAutoLayout(editor, {
      groups: {
        one: ['a', 'b'],
        two: ['c', 'd'],
      },
      nodeSizes: {
        a: { w: 120, h: 56 },
        b: { w: 140, h: 64 },
        c: { w: 160, h: 72 },
        d: { w: 180, h: 80 },
      },
    });

    assert.deepEqual(Object.keys(positions).sort(), ['a', 'b', 'c', 'd']);
    for (let position of Object.values(positions)) {
      assert.equal(Number.isFinite(position.x), true);
      assert.equal(Number.isFinite(position.y), true);
    }
    assert.notDeepEqual(positions.a, positions.c);
  });

  it('keeps final grouped auto layout rectangles separated', () => {
    let nodes = [
      'profile/photo',
      'bio/about',
      'projects/index',
      'pulse/index',
      'skills/index',
      'skills/agentic-ai',
      'skills/product-ui',
      'projects/agent-portal',
      'projects/video-studio',
      'pulse/agent-portal',
      'pulse/video-studio',
    ].map((id) => ({ id }));
    let editor = createEditor(nodes, [
      { from: 'profile/photo', to: 'bio/about' },
      { from: 'profile/photo', to: 'projects/index' },
      { from: 'profile/photo', to: 'pulse/index' },
      { from: 'profile/photo', to: 'skills/index' },
      { from: 'skills/index', to: 'skills/agentic-ai' },
      { from: 'skills/index', to: 'skills/product-ui' },
      { from: 'projects/index', to: 'projects/agent-portal' },
      { from: 'projects/index', to: 'projects/video-studio' },
      { from: 'projects/agent-portal', to: 'pulse/agent-portal' },
      { from: 'projects/video-studio', to: 'pulse/video-studio' },
      { from: 'pulse/index', to: 'pulse/agent-portal' },
      { from: 'pulse/index', to: 'pulse/video-studio' },
      { from: 'skills/agentic-ai', to: 'projects/agent-portal' },
      { from: 'skills/product-ui', to: 'projects/video-studio' },
    ]);
    let nodeSizes = Object.fromEntries(nodes.map((node) => [node.id, { w: 220, h: 120 }]));
    nodeSizes['profile/photo'] = { w: 240, h: 220 };
    nodeSizes['projects/agent-portal'] = { w: 300, h: 240 };
    nodeSizes['projects/video-studio'] = { w: 300, h: 240 };

    let positions = computeAutoLayout(editor, {
      groups: {
        biography: ['profile/photo', 'bio/about'],
        skills: ['skills/index', 'skills/agentic-ai', 'skills/product-ui'],
        projects: ['projects/index', 'projects/agent-portal', 'projects/video-studio'],
        pulse: ['pulse/index', 'pulse/agent-portal', 'pulse/video-studio'],
      },
      nodeSizes,
      gapX: 90,
      gapY: 48,
      maxLayerRows: 2,
    });

    assert.deepEqual(Object.keys(positions).sort(), nodes.map((node) => node.id).sort());
    assertNoNodeOverlaps(positions, nodeSizes);
  });

  it('builds a force-layout worker payload from generic nodes and connections', () => {
    let payload = createForceLayoutPayload({
      nodes: [
        { id: 'a', params: { calculatedWidth: 120, calculatedHeight: 48 } },
        { id: 'b' },
      ],
      connections: [{ from: 'a', to: 'b' }],
      positions: { a: { x: 10, y: 20 } },
      groups: { core: ['a'] },
      nodeSizes: { b: { w: 90, h: 30 } },
      continuous: true,
    });

    assert.deepEqual(payload.nodes, [
      { id: 'a', x: 10, y: 20, group: 'core', w: 120, h: 48 },
      { id: 'b', group: null, w: 90, h: 30 },
    ]);
    assert.deepEqual(payload.edges, [{ from: 'a', to: 'b' }]);
    assert.deepEqual(payload.groups, { core: ['a'] });
    assert.equal(payload.options.mode, 'continuous');
    assert.equal(payload.options.brownian, 0);
  });

  it('normalizes canvas-graph semantic groups from model groups, children, and parent links', () => {
    let normalized = normalizeCanvasGraphModel({
      nodes: [
        { id: 'group/projects', label: 'Projects', children: ['projects/a'] },
        { id: 'projects/a', label: 'A' },
        { id: 'projects/b', label: 'B', parentId: 'group/projects' },
        { id: 'skills/ui', label: 'UI', group: 'skills' },
      ],
      groups: [
        { id: 'skills', nodeIds: ['skills/ui', 'missing'] },
      ],
      edges: [],
    });
    let store = createCanvasGraphStore({
      nodes: normalized.nodes,
      edges: normalized.edges,
      rootNodes: normalized.rootNodes,
      groups: normalized.groups,
    });
    let projectNode = normalized.nodes.find((node) => node.id === 'group/projects');

    assert.equal(projectNode.isGroup, true);
    assert.deepEqual(projectNode.children, ['projects/a', 'projects/b']);
    assert.deepEqual(normalized.groups['group/projects'], ['group/projects', 'projects/a', 'projects/b']);
    assert.deepEqual(normalized.groups.skills, ['skills/ui']);
    assert.deepEqual(store.groups, normalized.groups);
  });

  it('derives semantic force weights from group size and cross-group links', () => {
    let options = getForceLayoutOptions(10, {
      continuous: true,
      groups: {
        projects: ['group/projects', 'projects/a', 'projects/b', 'projects/c'],
        pulse: ['group/pulse', 'pulse/a', 'pulse/b'],
        skills: ['skills/ui', 'skills/ai'],
      },
      edges: [
        { from: 'group/projects', to: 'projects/a' },
        { from: 'projects/a', to: 'projects/b' },
        { from: 'group/pulse', to: 'pulse/a' },
        { from: 'projects/a', to: 'pulse/a' },
        { from: 'skills/ui', to: 'projects/a' },
      ],
    });

    assert.equal(options.mode, 'continuous');
    assert.equal(options.layoutAlgorithm, 'organic');
    assert.ok(options.groupDistance > 120);
    assert.ok(options.groupStrength > 0.05);
    assert.ok(options.wellStrength > 0.8);
    assert.ok(options.wellRepulsion > 5);
    assert.ok(options.crossLinkScale < 0.32);
    assert.ok(options.chargeStrength < -150);
  });

  it('keeps dense process graph gravity below cluster separation forces', () => {
    let nodes = Array.from({ length: 48 }, (_, index) => `node-${index}`);
    let groups = Object.fromEntries(
      Array.from({ length: 6 }, (_, groupIndex) => [
        `group-${groupIndex}`,
        nodes.slice(groupIndex * 8, groupIndex * 8 + 8),
      ])
    );
    let edges = [];
    for (let index = 0; index < nodes.length - 1; index++) {
      edges.push({ from: nodes[index], to: nodes[index + 1] });
      if (index + 8 < nodes.length) edges.push({ from: nodes[index], to: nodes[index + 8] });
    }

    let options = getForceLayoutOptions(nodes.length, { continuous: true, groups, edges });

    assert.ok(options.centerPull <= 0.24);
    assert.ok(options.wellRepulsion >= 8);
    assert.ok(options.groupDistance >= 150);
    assert.ok(options.crossLinkScale <= 0.28);
  });

  it('fits one-node canvas graph frames without converting fit zoom into a hard zoom floor', () => {
    let rect = { width: 480, height: 320 };
    let frame = { minX: -8, minY: -8, maxX: 8, maxY: 8 };

    let fit = resolveCanvasGraphViewportFit({
      frame,
      rect,
      padding: 80,
      minZoom: MIN_CANVAS_GRAPH_ZOOM,
      maxZoom: 1.35,
    });

    assert.equal(fit.zoom, 1.35);
    assert.equal(fit.panX, 240);
    assert.equal(fit.panY, 160);
    assert.equal(resolveCanvasGraphMinZoom({ frame, rect, visibleNodeCount: 1 }), MIN_CANVAS_GRAPH_ZOOM);
  });

  it('passes the camera arc through route fit and lands centered on the target', () => {
    let rect = { width: 1000, height: 700 };
    let startCenter = { x: 120, y: 80 };
    let routeCenter = { x: 520, y: 310 };
    let targetCenter = { x: 920, y: 540 };
    let options = {
      startCenter,
      routeCenter,
      targetCenter,
      startZoom: 1.4,
      routeZoom: 0.42,
      targetZoom: 1.1,
      rect,
      minZoom: 0.02,
      maxZoom: 5,
    };

    let start = resolveCanvasGraphCameraArc({ ...options, progress: 0 });
    let apex = resolveCanvasGraphCameraArc({ ...options, progress: 0.5 });
    let target = resolveCanvasGraphCameraArc({ ...options, progress: 1 });

    let assertCenter = (actual, expected) => {
      assert.ok(Math.abs(actual.x - expected.x) < 1e-10);
      assert.ok(Math.abs(actual.y - expected.y) < 1e-10);
    };
    assertCenter(viewportToCameraCenter(start, rect), startCenter);
    assertCenter(viewportToCameraCenter(apex, rect), routeCenter);
    assertCenter(viewportToCameraCenter(target, rect), targetCenter);
    assert.ok(Math.abs(apex.zoom - options.routeZoom) < 1e-10);
    assert.ok(Math.abs(target.zoom - options.targetZoom) < 1e-10);
    assert.deepEqual(target, cameraCenterToViewport(targetCenter, options.targetZoom, rect));
  });

  it('keeps the camera arc positive and continuous across extreme zooms', () => {
    let rect = { width: 1280, height: 720 };
    let samples = Array.from({ length: 101 }, (_, index) => resolveCanvasGraphCameraArc({
      startCenter: { x: -800, y: 200 },
      routeCenter: { x: 0, y: 0 },
      targetCenter: { x: 900, y: -300 },
      startZoom: 4.8,
      routeZoom: 0.02,
      targetZoom: 3.7,
      rect,
      progress: index / 100,
      minZoom: 0.02,
      maxZoom: 5,
    }));

    assert.ok(samples.every((sample) => Number.isFinite(sample.zoom)));
    assert.ok(samples.every((sample) => sample.zoom >= 0.02 && sample.zoom <= 5));
    for (let index = 1; index < samples.length; index++) {
      assert.ok(Math.abs(samples[index].zoom - samples[index - 1].zoom) < 0.5);
      assert.ok(Math.abs(samples[index].panX - samples[index - 1].panX) < 260);
      assert.ok(Math.abs(samples[index].panY - samples[index - 1].panY) < 160);
    }
  });

  it('uses one scale-aware duration contract for graph camera transitions', () => {
    assert.equal(resolveCanvasGraphTransitionDuration({}), 680);
    assert.equal(resolveCanvasGraphTransitionDuration({
      routeDistance: 900,
      distanceScale: 1,
    }), 1000);
    assert.equal(resolveCanvasGraphTransitionDuration({
      routeDistance: 9000,
      distanceScale: 1,
    }), 1800);
    assert.equal(resolveCanvasGraphTransitionDuration({
      routeDistance: 90,
      distanceScale: 1,
    }), 620);
    assert.equal(resolveCanvasGraphTransitionDuration({
      transitionMs: 1200,
      duration: 1100,
      transitionMarkerMs: 1000,
    }), 1200);
    assert.equal(resolveCanvasGraphTransitionDuration({
      duration: 1100,
      transitionMarkerMs: 1000,
    }), 1100);
    assert.equal(resolveCanvasGraphTransitionDuration({
      transitionMarkerMs: 1000,
      motionScale: 0.5,
    }), 500);
    assert.equal(resolveCanvasGraphTransitionDuration({
      transitionMs: 1200,
      disabled: true,
    }), 0);
  });

  it('computes deterministic grouped flat positions with an injected random source', () => {
    let editor = createEditor([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    let positions = computeInitialGraphPositions({
      editor,
      groups: { one: ['a'], two: ['b'] },
      random: () => 0.5,
    });

    assert.deepEqual(Object.keys(positions).sort(), ['a', 'b', 'c']);
    assert.equal(typeof positions.a.x, 'number');
    assert.equal(typeof positions.b.y, 'number');
    assert.notDeepEqual(positions.a, positions.b);
  });

  it('uses stable default flat seed positions for repeated graph layout passes', () => {
    let editor = createEditor([{ id: 'alpha' }, { id: 'beta' }, { id: 'gamma' }]);
    let options = {
      editor,
      groups: { letters: ['alpha', 'beta'] },
    };

    assert.deepEqual(
      computeInitialGraphPositions(options),
      computeInitialGraphPositions(options)
    );
  });

  it('delegates structured layout to the provided tree-layout function', () => {
    let editor = createEditor([{ id: 'dir-a' }, { id: 'file-a' }]);
    let result = computeInitialGraphPositions({
      editor,
      isStructured: true,
      dirFiles: new Map([['src', ['src/a.js']]]),
      dirNodeMap: new Map([['src', 'dir-a']]),
      computeTreeLayoutFn: (receivedEditor, options) => {
        assert.equal(receivedEditor, editor);
        assert.deepEqual(options.dirPaths, { 'dir-a': 'src' });
        return { 'dir-a': { x: 1, y: 2 } };
      },
    });

    assert.deepEqual(result, { 'dir-a': { x: 1, y: 2 } });
  });

  it('caches graph builds by view mode and source object identity', () => {
    let skeleton = {};
    let cache = {};
    let builds = 0;
    let first = getOrBuildGraph({
      cache,
      skeleton,
      isStructured: false,
      buildFileGraphFn: () => {
        builds += 1;
        return { nodes: [], connections: [] };
      },
      buildStructuredGraphFn: () => {
        throw new Error('unexpected structured build');
      },
    });
    let second = getOrBuildGraph({
      cache,
      skeleton,
      isStructured: false,
      buildFileGraphFn: () => {
        builds += 1;
        return { nodes: [], connections: [] };
      },
      buildStructuredGraphFn: () => {
        throw new Error('unexpected structured build');
      },
    });

    assert.equal(getGraphCacheKey(false), 'flat');
    assert.deepEqual([...getDrillableFiles(new Map([['a', { file: 'src/a.js' }]]))], ['src/a.js']);
    assert.equal(findForceNodeGroup({ core: ['a'] }, 'a'), 'core');
    assert.equal(getForceLayoutOptions(1000).chargeStrength, -300);
    assert.equal(first.cached, false);
    assert.equal(second.cached, true);
    assert.equal(first.graph, second.graph);
    assert.equal(builds, 1);
    assert.ok(second.graph.symbolMap instanceof Map);
  });
});
