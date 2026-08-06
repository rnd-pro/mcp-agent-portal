import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';

import {
  CANVAS_GRAPH_LAYER_TARGETS,
  CANVAS_GRAPH_RENDER_SNAPSHOT_VERSION,
  getLayerAnimationFrame,
  resolveViewportAnimation,
  resolveFocusFrame,
  normalizeCanvasGraphRenderSnapshot,
} from '../canvas/CanvasGraph/CanvasGraphDrawState.js';

const VERSION = CANVAS_GRAPH_RENDER_SNAPSHOT_VERSION;

const GLOBAL_KEYS = ['window', 'document', 'HTMLElement', 'customElements', 'CustomEvent', 'Event', 'EventTarget', 'Node', 'CSSStyleSheet'];

async function withDom(run) {
  let { window } = parseHTML('<html><body></body></html>');
  let descriptors = new Map(GLOBAL_KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (let key of GLOBAL_KEYS.slice(0, -1)) {
    Object.defineProperty(globalThis, key, { configurable: true, value: window[key] || window });
  }
  Object.defineProperty(globalThis, 'CSSStyleSheet', {
    configurable: true,
    value: class CSSStyleSheet { replaceSync() {} },
  });
  try {
    let { CanvasGraph } = await import('../canvas/CanvasGraph/CanvasGraph.js');
    return await run(CanvasGraph);
  } finally {
    for (let key of GLOBAL_KEYS) {
      let descriptor = descriptors.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

const NODES = [
  { id: 'a', label: 'Alpha', type: 'data', isGroup: true, children: ['b', 'c'] },
  { id: 'b', label: 'Beta', type: 'action' },
  { id: 'c', label: 'Gamma', type: 'output' },
  { id: 'd', label: 'Delta', type: 'config' },
];
const EDGES = [
  { from: 'a', to: 'b' },
  { from: 'b', to: 'c' },
  { from: 'c', to: 'd' },
];

function makeGraph(CanvasGraph) {
  let graph = Object.create(CanvasGraph.prototype);
  graph.nodes = NODES.map((n) => ({ ...n }));
  graph.edges = EDGES.map((e) => ({ ...e }));
  graph.nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  graph.adjMap = new Map(graph.nodes.map((n) => [n.id, new Set()]));
  for (let e of graph.edges) {
    graph.adjMap.get(e.from)?.add(e.to);
    graph.adjMap.get(e.to)?.add(e.from);
  }
  graph.interactionDepths = new Map();
  graph.graphDB = { nodes: new Map(graph.nodes.map((n) => [n.id, n])), edges: graph.edges, rootNodes: ['a'] };
  graph.nodePositions = new Map();
  graph.smoothPositions = new Map();
  graph.smoothing = 0.99;
  graph.renderMode = 'dots';
  graph.currentGroupId = null;
  graph.activeNode = null;
  graph.nextActiveNode = null;
  graph.hoverNode = null;
  graph.dragNode = null;
  graph.deactivating = false;
  graph.menuAnim = 0;
  graph._hoverAction = '';
  graph.zoom = 0.5;
  graph.panX = 0;
  graph.panY = 0;
  graph._targetZoom = 0.5;
  graph._targetPanX = null;
  graph._targetPanY = null;
  graph._zoomAnchor = null;
  graph._viewportEase = 0.15;
  graph.focusX = 0;
  graph.focusY = 0;
  graph.focusActive = false;
  graph._prevDragDeltaX = 0;
  graph._prevDragDeltaY = 0;
  graph._orientationParallaxEnabled = false;
  graph._orientationParallaxX = 0;
  graph._orientationParallaxY = 0;
  graph._orientationParallaxTargetX = 0;
  graph._orientationParallaxTargetY = 0;
  graph.layerAnim = { 0: { scale: 1, opacity: 1, parallax: 0 }, 1: { scale: 1, opacity: 1, parallax: 0 }, 2: { scale: 1, opacity: 1, parallax: 0 }, 3: { scale: 1, opacity: 1, parallax: 0 }, 4: { scale: 1, opacity: 1, parallax: 0 } };
  graph._transitionMarkers = [];
  graph._pulses = [];
  graph._nodeAppearances = new Map();
  graph._infoPanel = { nodeId: null, lines: [], opacity: 0, startTime: 0, totalExtent: 0, totalExtentY: 0, _centeredForNode: null };
  graph._idleFrames = 0;
  graph.lastAlpha = 0;
  graph.frameCount = 0;
  graph.tickCount = 0;
  graph._lastRenderTime = 1000;
  graph.layoutSettled = false;
  graph.worker = null;
  graph._workerGeneration = 0;
  graph.needsDraw = false;
  graph._wakeLoop = () => {};
  graph._emitGraphEvent = () => {};
  return graph;
}

function warmUp(graph, variant) {
  for (let i = 0; i < graph.nodes.length; i++) {
    let node = graph.nodes[i];
    graph.nodePositions.set(node.id, { x: (i + 1) * 37.123456789 + variant, y: (i + 1) * -19.98765 - variant });
    graph.smoothPositions.set(node.id, { x: (i + 1) * 37.1 + variant * 2, y: (i + 1) * -20 - variant });
    node.aScale = 1 + i * 0.05 + variant * 0.01;
    node.aGlow = i * 0.03 + variant * 0.02;
    node.aRot = i * 0.2 + variant * 0.03;
    node.aRotSpeed = i * 0.01 + variant * 0.002;
  }
  for (let i = 0; i < graph.edges.length; i++) {
    graph.edges[i].aAlpha = 0.4 + i * 0.05 + variant * 0.01;
    graph.edges[i].aWidth = 1.2 + i * 0.1 + variant * 0.02;
  }
  graph.activeNode = graph.nodeMap.get('b');
  graph.zoom = 0.85 + variant * 0.05;
  graph.panX = 12.5 + variant;
  graph.panY = -8.25 - variant;
  graph._targetZoom = 1.2;
  graph._targetPanX = 40 + variant;
  graph._targetPanY = -30;
  graph.focusX = 5 + variant;
  graph.focusY = 7 - variant;
  graph.focusActive = true;
  graph._orientationParallaxEnabled = variant % 2 === 0;
  graph._orientationParallaxX = 3 + variant;
  graph._orientationParallaxY = -2 - variant;
  graph._orientationParallaxTargetX = 4 + variant;
  graph._orientationParallaxTargetY = -3 - variant;
  graph.layerAnim = getLayerAnimationFrame({
    layerAnim: graph.layerAnim,
    layerTargets: CANVAS_GRAPH_LAYER_TARGETS,
    isIdle: false,
    inGroupMode: false,
  });
  graph._pulses = [{ id: 'a', startTime: 1000 + variant, duration: 1500, waves: 2 }];
  graph._nodeAppearances.set('c', { startTime: 900, duration: 700 });
  graph._infoPanel = {
    nodeId: 'b', lines: [{ text: 'Beta', revealed: 4 }, { text: 'Type: Action', revealed: 6 }],
    opacity: 0.7, startTime: 800, totalExtent: 120, totalExtentY: 60, _centeredForNode: 'b',
  };
  graph.lastAlpha = 0.02;
  graph.layoutSettled = true;
  graph.updateInteractionDepths();
}

function advance(graph) {
  graph.layerAnim = getLayerAnimationFrame({
    layerAnim: graph.layerAnim,
    layerTargets: CANVAS_GRAPH_LAYER_TARGETS,
    isIdle: (!graph.activeNode && !graph.currentGroupId) || graph.deactivating,
    inGroupMode: !!graph.currentGroupId,
  });
  let vp = resolveViewportAnimation({
    zoom: graph.zoom, targetZoom: graph._targetZoom, panX: graph.panX, panY: graph.panY,
    targetPanX: graph._targetPanX, targetPanY: graph._targetPanY, zoomAnchor: graph._zoomAnchor,
    viewportEase: graph._viewportEase,
  });
  graph.zoom = vp.zoom; graph.panX = vp.panX; graph.panY = vp.panY;
  graph._targetPanX = vp.targetPanX; graph._targetPanY = vp.targetPanY;
  let t = 1 - graph.smoothing;
  for (let [id, raw] of graph.nodePositions) {
    let prev = graph.smoothPositions.get(id);
    if (prev) { prev.x += (raw.x - prev.x) * t; prev.y += (raw.y - prev.y) * t; }
  }
}

test('render snapshot round-trips full continuation state across divergent instances', async () => {
  await withDom((CanvasGraph) => {
    let source = makeGraph(CanvasGraph);
    warmUp(source, 0);
    let dest = makeGraph(CanvasGraph);
    warmUp(dest, 7);

    let snapshot = source.getRenderSnapshot();
    assert.notDeepEqual(dest.getRenderSnapshot(), snapshot, 'graphs must start divergent');

    assert.equal(dest.setRenderSnapshot(snapshot), true);

    assert.deepEqual(dest.getRenderSnapshot(), snapshot);

    assert.equal(dest.nodeMap.get('b').aScale, source.nodeMap.get('b').aScale);
    assert.equal(dest.nodeMap.get('c').aGlow, source.nodeMap.get('c').aGlow);
    assert.equal(dest.nodeMap.get('a').aRot, source.nodeMap.get('a').aRot);
    assert.equal(dest.nodeMap.get('a').aRotSpeed, source.nodeMap.get('a').aRotSpeed);
    assert.equal(dest.edges[1].aAlpha, source.edges[1].aAlpha);
    assert.equal(dest.activeNode, dest.nodeMap.get('b'));
    assert.equal(dest.activeNode.aScale, source.activeNode.aScale);
    assert.equal(dest._orientationParallaxEnabled, source._orientationParallaxEnabled);

    advance(source);
    advance(dest);
    assert.deepEqual(dest.getRenderSnapshot(), source.getRenderSnapshot());
  });
});

test('render snapshot round-trips a hierarchical projection with hidden graph nodes', async () => {
  await withDom((CanvasGraph) => {
    let source = makeGraph(CanvasGraph);
    warmUp(source, 0);
    source.nodes = source.nodes.filter((node) => node.id === 'a' || node.id === 'd');
    source.nodeMap = new Map(source.nodes.map((node) => [node.id, node]));
    source.edges = [];
    source.activeNode = null;
    source.nextActiveNode = null;
    source.hoverNode = null;
    source.dragNode = null;

    let dest = makeGraph(CanvasGraph);
    warmUp(dest, 5);
    dest.nodes = dest.nodes.filter((node) => node.id === 'a' || node.id === 'd');
    dest.nodeMap = new Map(dest.nodes.map((node) => [node.id, node]));
    dest.edges = [];
    dest.activeNode = null;
    dest.nextActiveNode = null;
    dest.hoverNode = null;
    dest.dragNode = null;

    let snapshot = source.getRenderSnapshot();
    assert.deepEqual(snapshot.graph.nodeIds, ['a', 'd']);
    assert.equal(dest.setRenderSnapshot(snapshot), true);
    assert.deepEqual(dest.getRenderSnapshot(), snapshot);
  });
});

test('render snapshot stops and invalidates the destination force worker', async () => {
  await withDom((CanvasGraph) => {
    let source = makeGraph(CanvasGraph);
    warmUp(source, 0);
    let dest = makeGraph(CanvasGraph);
    warmUp(dest, 4);
    let stops = 0;
    dest._workerGeneration = 7;
    dest.worker = { stop() { stops += 1; } };

    assert.equal(dest.setRenderSnapshot(source.getRenderSnapshot()), true);
    assert.equal(stops, 1);
    assert.equal(dest.worker, null);
    assert.equal(dest._workerGeneration, 8);
  });
});

test('render snapshot rejects unsettled layout state', async () => {
  await withDom((CanvasGraph) => {
    let graph = makeGraph(CanvasGraph);
    assert.throws(() => graph.getRenderSnapshot(), /settled layout/);

    warmUp(graph, 0);
    let snapshot = graph.getRenderSnapshot();
    snapshot.meta.layoutSettled = false;
    assert.equal(graph.setRenderSnapshot(snapshot), false);
  });
});

function focusStep(graph, dpr = 1) {
  let vcx = graph.canvas.width / 2;
  let vcy = graph.canvas.height / 2;
  let focus = resolveFocusFrame({
    activeNode: graph.activeNode,
    deactivating: graph.deactivating,
    activePosition: graph.activeNode ? graph.nodePositions.get(graph.activeNode.id) : null,
    infoPanel: graph._infoPanel,
    canvasRect: null,
    dpr,
    zoom: graph.zoom,
    panX: graph.panX,
    panY: graph.panY,
    focusX: graph.focusX,
    focusY: graph.focusY,
    focusActive: graph.focusActive,
    vcx,
    vcy,
  });
  graph.focusX = focus.focusX;
  graph.focusY = focus.focusY;
  graph.focusActive = focus.focusActive;
  graph._prevDragDeltaX = focus.dragDeltaX;
  graph._prevDragDeltaY = focus.dragDeltaY;
  return { dragDeltaX: focus.dragDeltaX, dragDeltaY: focus.dragDeltaY };
}

test('focus continuation survives a round-trip on an equivalent render surface', async () => {
  await withDom((CanvasGraph) => {
    let leader = makeGraph(CanvasGraph);
    warmUp(leader, 0);
    leader.canvas = { width: 1218, height: 812 };
    leader.activeNode = null;
    leader.focusX = 433.7786603963981;
    leader.focusY = 260;
    leader.focusActive = true;
    leader.layoutSettled = true;

    let peer = makeGraph(CanvasGraph);
    warmUp(peer, 4);
    peer.canvas = { width: 1218, height: 812 };
    peer.activeNode = null;

    let snapshot = leader.getRenderSnapshot();
    assert.equal(peer.setRenderSnapshot(snapshot), true);
    assert.deepEqual(peer.getRenderSnapshot(), snapshot);

    let leaderDelta = focusStep(leader);
    let peerDelta = focusStep(peer);
    assert.equal(peerDelta.dragDeltaX, leaderDelta.dragDeltaX);
    assert.equal(peerDelta.dragDeltaY, leaderDelta.dragDeltaY);
    assert.equal(peer._prevDragDeltaX, leader._prevDragDeltaX);
    assert.equal(peer.focusX - peer.canvas.width / 2, leader.focusX - leader.canvas.width / 2);
    assert.deepEqual(peer.getRenderSnapshot().focus, leader.getRenderSnapshot().focus);

    let buggyPeer = makeGraph(CanvasGraph);
    buggyPeer.canvas = { width: 825, height: 812 };
    buggyPeer.focusX = snapshot.focus.focusX + leader.canvas.width / 2;
    buggyPeer.focusActive = true;
    let buggyDelta = focusStep(buggyPeer);
    assert.notEqual(buggyDelta.dragDeltaX, leaderDelta.dragDeltaX);
    assert.equal(leader._prevDragDeltaX, -161.20363243531375);
    assert.equal(buggyDelta.dragDeltaX, 19.576367564686223);
  });
});

test('render snapshot rejects a destination with different backing geometry', async () => {
  await withDom((CanvasGraph) => {
    let source = makeGraph(CanvasGraph);
    source.canvas = { width: 1218, height: 812 };
    source.layoutSettled = true;
    let snapshot = source.getRenderSnapshot();

    let dest = makeGraph(CanvasGraph);
    dest.canvas = { width: 825, height: 812 };
    assert.equal(dest.setRenderSnapshot(snapshot), false);
    assert.equal(dest.canvas.width, 825);
  });
});

test('render snapshot output is deep-cloned and isolated from live state', async () => {
  await withDom((CanvasGraph) => {
    let graph = makeGraph(CanvasGraph);
    warmUp(graph, 0);
    let snapshot = graph.getRenderSnapshot();

    snapshot.positions.a.x = 999999;
    snapshot.layerAnim[0].scale = -42;
    snapshot.infoPanel.lines[0].text = 'tampered';
    assert.notEqual(graph.nodePositions.get('a').x, 999999);
    assert.notEqual(graph.layerAnim[0].scale, -42);
    assert.equal(graph._infoPanel.lines[0].text, 'Beta');

    let applied = graph.getRenderSnapshot();
    assert.equal(graph.setRenderSnapshot(applied), true);
    graph.nodePositions.get('a').x = 12345;
    graph.nodeMap.get('b').aScale = 3.14;
    assert.notEqual(applied.positions.a.x, 12345);
    assert.notEqual(applied.nodeAnim.b.aScale, 3.14);
  });
});

test('render snapshot rejects malformed payloads without mutating the graph', async () => {
  await withDom((CanvasGraph) => {
    let graph = makeGraph(CanvasGraph);
    warmUp(graph, 0);
    let before = graph.getRenderSnapshot();

    let bad = [
      null,
      undefined,
      42,
      'nope',
      {},
      { kind: 'canvas-graph-render' },
      { kind: 'wrong', version: 1, viewport: before.viewport, layerAnim: before.layerAnim },
      { kind: 'canvas-graph-render', version: 999, viewport: before.viewport, layerAnim: before.layerAnim },
      { kind: 'canvas-graph-render', version: VERSION, layerAnim: before.layerAnim },
      { kind: 'canvas-graph-render', version: VERSION, viewport: { zoom: Number.NaN, panX: 0, panY: 0 }, layerAnim: before.layerAnim },
      { kind: 'canvas-graph-render', version: VERSION, viewport: before.viewport, layerAnim: { 0: { scale: 1, opacity: 1, parallax: 0 } } },
    ];
    for (let payload of bad) {
      assert.equal(graph.setRenderSnapshot(payload), false);
      assert.equal(normalizeCanvasGraphRenderSnapshot(payload), null);
    }
    assert.deepEqual(graph.getRenderSnapshot(), before, 'graph must be untouched after rejects');
  });
});

test('render snapshot fails closed on any graph or continuation identity mismatch', async () => {
  await withDom((CanvasGraph) => {
    let graph = makeGraph(CanvasGraph);
    warmUp(graph, 0);
    let before = graph.getRenderSnapshot();

    let mismatched = graph.getRenderSnapshot();
    mismatched.interaction.activeNodeId = 'does-not-exist';
    assert.equal(graph.setRenderSnapshot(mismatched), false);
    assert.deepEqual(graph.getRenderSnapshot(), before, 'mismatched identity must not partially mutate');

    let extra = graph.getRenderSnapshot();
    extra.positions['ghost'] = { x: 1, y: 2 };
    assert.equal(graph.setRenderSnapshot(extra), false);

    let wrongMode = graph.getRenderSnapshot();
    wrongMode.renderMode = 'cards';
    assert.equal(graph.setRenderSnapshot(wrongMode), false);

    let wrongGraph = graph.getRenderSnapshot();
    wrongGraph.graph.nodeIds.push('ghost');
    assert.equal(graph.setRenderSnapshot(wrongGraph), false);

    let wrongTransition = graph.getRenderSnapshot();
    wrongTransition.transitionMarkers.push({
      fromId: 'a', toId: 'ghost', path: ['a', 'ghost'], startTime: 0, duration: 100,
    });
    assert.equal(graph.setRenderSnapshot(wrongTransition), false);
    assert.deepEqual(graph.getRenderSnapshot(), before, 'identity rejects must remain atomic');
  });
});

test('render snapshot rejects malformed collection members instead of silently dropping them', async () => {
  await withDom((CanvasGraph) => {
    let graph = makeGraph(CanvasGraph);
    warmUp(graph, 0);
    let before = graph.getRenderSnapshot();
    for (let mutate of [
      (snapshot) => { snapshot.positions.a = { x: 'bad', y: 1 }; },
      (snapshot) => { delete snapshot.smoothPositions.a; },
      (snapshot) => { snapshot.nodeAnim.a.aRot = Number.NaN; },
      (snapshot) => { snapshot.edgeAnim[0].index = 7; },
      (snapshot) => { snapshot.pulses.push({ id: 'a', startTime: 'bad', duration: 1, waves: 1 }); },
      (snapshot) => { snapshot.infoPanel.lines.push({ text: 7, revealed: 0 }); },
    ]) {
      let malformed = graph.getRenderSnapshot();
      mutate(malformed);
      assert.equal(graph.setRenderSnapshot(malformed), false);
      assert.deepEqual(graph.getRenderSnapshot(), before);
    }
  });
});

test('render snapshot rejects semantically invalid animation state', async () => {
  await withDom((CanvasGraph) => {
    let graph = makeGraph(CanvasGraph);
    warmUp(graph, 0);
    for (let mutate of [
      (snapshot) => { snapshot.viewport.zoom = 0; },
      (snapshot) => { snapshot.viewport.targetZoom = -1; },
      (snapshot) => { snapshot.viewport.viewportEase = 2; },
      (snapshot) => { snapshot.layerAnim[0].opacity = -0.1; },
      (snapshot) => { snapshot.nodeAnim.a.aScale = 0; },
      (snapshot) => { snapshot.edgeAnim[0].aWidth = -1; },
      (snapshot) => { snapshot.interaction.menuAnim = 2; },
      (snapshot) => { snapshot.pulses[0].duration = 0; },
      (snapshot) => { snapshot.nodeAppearances[0].duration = -1; },
    ]) {
      let malformed = graph.getRenderSnapshot();
      mutate(malformed);
      assert.equal(graph.setRenderSnapshot(malformed), false);
      assert.equal(normalizeCanvasGraphRenderSnapshot(malformed), null);
    }
  });
});

test('render snapshot restores selection identity and recomputes interaction depths', async () => {
  await withDom((CanvasGraph) => {
    let source = makeGraph(CanvasGraph);
    warmUp(source, 0);
    let dest = makeGraph(CanvasGraph);

    assert.equal(dest.setRenderSnapshot(source.getRenderSnapshot()), true);
    assert.equal(dest.activeNode.id, 'b');
    assert.deepEqual(
      dest.nodes.map((n) => [n.id, n.targetDepth]),
      source.nodes.map((n) => [n.id, n.targetDepth]),
    );
    assert.equal(dest.nodeMap.get('b').targetDepth, 0);
    assert.equal(dest.nodeMap.get('d').targetDepth, 2);
  });
});
