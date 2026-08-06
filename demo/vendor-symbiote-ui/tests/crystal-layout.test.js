import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

import {
  computeCrystalLayout,
  computeCrystalTargets,
} from '../canvas/CrystalLayout.js';
import { ForceLayout } from '../canvas/ForceLayout.js';
import { analyzeGraphLayout } from '../graph/layout-quality.js';

function createEditor(nodes, connections) {
  return {
    getNodes: () => nodes,
    getConnections: () => connections,
  };
}

function rectangleOverlaps(a, b) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

function assertNoRectangleOverlaps(nodes, positions, nodeSizes) {
  for (let left = 0; left < nodes.length; left++) {
    for (let right = left + 1; right < nodes.length; right++) {
      let a = nodes[left];
      let b = nodes[right];
      assert.equal(rectangleOverlaps(
        { ...positions[a.id], width: nodeSizes[a.id].w, height: nodeSizes[a.id].h },
        { ...positions[b.id], width: nodeSizes[b.id].w, height: nodeSizes[b.id].h },
      ), false, `${a.id} overlaps ${b.id}`);
    }
  }
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function centerOf(position, size) {
  return {
    x: position.x + size.w / 2,
    y: position.y + size.h / 2,
  };
}

function createUnequalFixture() {
  let nodes = [
    { id: 'root' },
    { id: 'article-a' },
    { id: 'article-b' },
    ...Array.from({ length: 10 }, (_, index) => ({ id: `media-a-${index}` })),
    ...Array.from({ length: 4 }, (_, index) => ({ id: `media-b-${index}` })),
  ];
  let connections = [
    { from: 'root', to: 'article-a' },
    { from: 'root', to: 'article-b' },
    ...Array.from({ length: 10 }, (_, index) => ({
      from: 'article-a',
      to: `media-a-${index}`,
    })),
    ...Array.from({ length: 4 }, (_, index) => ({
      from: 'article-b',
      to: `media-b-${index}`,
    })),
  ];
  let nodeSizes = Object.fromEntries(nodes.map((node, index) => [node.id, {
    w: 42 + (index * 37) % 176,
    h: 34 + (index * 29) % 128,
  }]));
  nodeSizes.root = { w: 128, h: 96 };
  nodeSizes['article-a'] = { w: 240, h: 132 };
  nodeSizes['article-b'] = { w: 210, h: 148 };
  return { nodes, connections, nodeSizes };
}

test('crystal layout composes unequal leaves around their own hubs without rectangle overlaps', () => {
  let { nodes, connections, nodeSizes } = createUnequalFixture();
  let groups = {
    'article-a': ['article-a', ...Array.from({ length: 10 }, (_, index) => `media-a-${index}`)],
    'article-b': ['article-b', ...Array.from({ length: 4 }, (_, index) => `media-b-${index}`)],
  };
  let positions = computeCrystalLayout(createEditor(nodes, connections), {
    rootNodeId: 'root',
    groups,
    nodeSizes,
    startX: 120,
    startY: 80,
    crystalRingDistance: 96,
    crystalSpokes: 6,
    crystalAngleJitter: 0.12,
  });

  assert.deepEqual(positions.root, { x: 120, y: 80 });
  assertNoRectangleOverlaps(nodes, positions, nodeSizes);

  for (let ownerId of ['article-a', 'article-b']) {
    let ownerCenter = centerOf(positions[ownerId], nodeSizes[ownerId]);
    let otherId = ownerId === 'article-a' ? 'article-b' : 'article-a';
    let otherCenter = centerOf(positions[otherId], nodeSizes[otherId]);
    let prefix = ownerId === 'article-a' ? 'media-a-' : 'media-b-';
    for (let node of nodes.filter((candidate) => candidate.id.startsWith(prefix))) {
      let leafCenter = centerOf(positions[node.id], nodeSizes[node.id]);
      assert.ok(
        distanceBetween(leafCenter, ownerCenter) < distanceBetween(leafCenter, otherCenter),
        `${node.id} is not nearest to ${ownerId}`,
      );
    }
  }
});

test('crystal layout keeps authoritative groups compact in a broad structural graph', () => {
  let projectIds = Array.from({ length: 18 }, (_, index) => `project-${index}`);
  let skillIds = Array.from({ length: 8 }, (_, index) => `skill-${index}`);
  let pulseIds = projectIds.map((id) => `pulse-${id}`);
  let miscIds = ['profile-summary', 'event-map'];
  let mediaCounts = [1, 10, 1, 2, 4, 6, 1];
  let mediaIds = mediaCounts.flatMap((count, ownerIndex) => (
    Array.from({ length: count }, (_, mediaIndex) => `media-${ownerIndex}-${mediaIndex}`)
  ));
  let nodes = [
    { id: 'root' },
    { id: 'bio' },
    { id: 'projects' },
    { id: 'skills' },
    { id: 'pulse' },
    ...miscIds.map((id) => ({ id })),
    ...projectIds.map((id) => ({ id })),
    ...skillIds.map((id) => ({ id })),
    ...pulseIds.map((id) => ({ id })),
    ...mediaIds.map((id) => ({ id })),
  ];
  assert.equal(nodes.length, 76);
  let nodeSizes = Object.fromEntries(nodes.map((node, index) => [node.id, {
    w: 220 + (index * 29) % 120,
    h: 110 + (index * 23) % 150,
  }]));
  nodeSizes.root = { w: 280, h: 280 };
  let connections = [
    { from: 'root', to: 'bio' },
    { from: 'root', to: 'projects' },
    { from: 'root', to: 'skills' },
    { from: 'root', to: 'pulse' },
    ...miscIds.map((id) => ({ from: 'root', to: id })),
    ...projectIds.map((id) => ({ from: 'projects', to: id })),
    ...skillIds.map((id) => ({ from: 'skills', to: id })),
    ...pulseIds.map((id) => ({ from: 'pulse', to: id })),
  ];
  for (let index = 0; index < projectIds.length; index++) {
    connections.push({ from: projectIds[index], to: pulseIds[index] });
    connections.push({ from: skillIds[index % skillIds.length], to: projectIds[index] });
    connections.push({ from: skillIds[(index + 3) % skillIds.length], to: projectIds[index] });
  }
  let groups = {};
  let mediaOffset = 0;
  for (let ownerIndex = 0; ownerIndex < mediaCounts.length; ownerIndex++) {
    let ownerId = projectIds[ownerIndex];
    let ownedMedia = mediaIds.slice(mediaOffset, mediaOffset + mediaCounts[ownerIndex]);
    mediaOffset += mediaCounts[ownerIndex];
    groups[ownerId] = [ownerId, ...ownedMedia];
    for (let mediaId of ownedMedia) connections.push({ from: ownerId, to: mediaId });
  }

  let layoutOptions = {
    rootNodeId: 'root',
    groups,
    nodeSizes,
    crystalSpokes: 6,
    crystalAngleJitter: 0.12,
  };
  let positions = computeCrystalLayout(createEditor(nodes, connections), layoutOptions);
  let targets = computeCrystalTargets(nodes, connections, groups, layoutOptions);
  let reversedGroups = Object.fromEntries(
    Object.entries(groups).reverse().map(([id, memberIds]) => [id, [...memberIds].reverse()])
  );
  let reversedPositions = computeCrystalLayout(
    createEditor([...nodes].reverse(), [...connections].reverse()),
    { ...layoutOptions, groups: reversedGroups },
  );
  assert.deepEqual(reversedPositions, positions);
  assertNoRectangleOverlaps(nodes, positions, nodeSizes);
  for (let [ownerId, memberIds] of Object.entries(groups)) {
    let ownerCenter = centerOf(positions[ownerId], nodeSizes[ownerId]);
    let competingOwners = projectIds.filter((id) => id !== ownerId);
    for (let mediaId of memberIds.slice(1)) {
      assert.equal(targets[mediaId].layoutParentId, ownerId);
      let mediaCenter = centerOf(positions[mediaId], nodeSizes[mediaId]);
      let ownerDistance = distanceBetween(mediaCenter, ownerCenter);
      let competingDistance = Math.min(...competingOwners.map((id) => (
        distanceBetween(mediaCenter, centerOf(positions[id], nodeSizes[id]))
      )));
      assert.ok(ownerDistance < competingDistance, `${mediaId} is not nearest to ${ownerId}`);
    }
  }
  for (let [layoutParentId, memberIds] of [
    ['root', projectIds.slice(mediaCounts.length)],
    ['root', skillIds],
    ['root', pulseIds],
  ]) {
    for (let memberId of memberIds) {
      assert.equal(targets[memberId].layoutParentId, layoutParentId);
    }
  }

  let minX = Math.min(...nodes.map((node) => positions[node.id].x));
  let minY = Math.min(...nodes.map((node) => positions[node.id].y));
  let maxX = Math.max(...nodes.map((node) => positions[node.id].x + nodeSizes[node.id].w));
  let maxY = Math.max(...nodes.map((node) => positions[node.id].y + nodeSizes[node.id].h));
  assert.ok(maxX - minX < 9000, `Layout width is ${maxX - minX}`);
  assert.ok(maxY - minY < 9000, `Layout height is ${maxY - minY}`);

  let report = analyzeGraphLayout({
    version: 'graph-layout-snapshot-v1',
    nodes: nodes.map((node) => ({
      id: node.id,
      bounds: {
        ...positions[node.id],
        width: nodeSizes[node.id].w,
        height: nodeSizes[node.id].h,
      },
    })),
    edges: connections.map((connection, index) => ({
      id: `edge-${index}`,
      sourceId: connection.from,
      targetId: connection.to,
    })),
    policy: {
      maxEdgeLengthRatio: 24,
      maxNearestNeighborDistanceRatio: 24,
    },
  });

  assert.equal(report.complete, true);
  assert.ok(
    report.metrics.edges.maxLengthRatio < 24,
    `Maximum normalized edge length is ${report.metrics.edges.maxLengthRatio}`
  );
  assert.deepEqual(
    report.findings.filter((finding) => finding.ruleId === 'edge.too-long'),
    []
  );
});

test('explicit root overrides focus and prior positions never affect explicit crystal relayout', () => {
  let nodes = [
    { id: 'root', x: 8000, y: -3000 },
    { id: 'focused', x: -7000, y: 9000 },
    { id: 'leaf', x: 12000, y: 14000 },
  ];
  let connections = [
    { from: 'root', to: 'focused' },
    { from: 'focused', to: 'leaf' },
  ];
  let nodeSizes = {
    root: { w: 120, h: 90 },
    focused: { w: 180, h: 110 },
    leaf: { w: 72, h: 54 },
  };
  let options = {
    rootNodeId: 'root',
    activeVisualNodeId: 'focused',
    nodeSizes,
    startX: 35,
    startY: 45,
  };
  let positioned = computeCrystalLayout(createEditor(nodes, connections), options);
  let unpositioned = computeCrystalLayout(createEditor(
    nodes.map(({ id }) => ({ id })),
    connections,
  ), options);

  assert.deepEqual(positioned, unpositioned);
  assert.deepEqual(positioned.root, { x: 35, y: 45 });
  assert.notDeepEqual(positioned.focused, { x: 35, y: 45 });
});

test('invalid explicit root produces a deterministic complete plan independent of focus', () => {
  let nodes = [
    { id: 'zeta', w: 90, h: 60 },
    { id: 'alpha', w: 100, h: 70 },
    { id: 'beta', w: 80, h: 50 },
  ];
  let connections = [{ from: 'alpha', to: 'beta' }];
  let first = computeCrystalTargets(nodes, connections, {}, {
    rootNodeId: 'missing',
    activeVisualNodeId: 'zeta',
  });
  let second = computeCrystalTargets([...nodes].reverse(), [...connections].reverse(), {}, {
    rootNodeId: 'missing',
    activeVisualNodeId: 'beta',
  });

  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first).sort(), ['alpha', 'beta', 'zeta']);
  for (let target of Object.values(first)) {
    assert.equal(Number.isFinite(target.x), true);
    assert.equal(Number.isFinite(target.y), true);
  }
});

test('force layout sends canonical targets and retains merged crystal config across updates', () => {
  let NativeWorker = globalThis.Worker;
  let workers = [];
  class CaptureWorker {
    messages = [];

    constructor() {
      workers.push(this);
    }

    postMessage(message) {
      this.messages.push(message);
    }

    terminate() {}
  }
  globalThis.Worker = CaptureWorker;

  try {
    let force = new ForceLayout('/force-worker.js');
    force.start({
      nodes: [
        { id: 'root', w: 100, h: 80 },
        { id: 'other', w: 90, h: 70 },
      ],
      edges: [{ from: 'root', to: 'other' }],
      options: {
        layoutAlgorithm: 'crystal',
        activeVisualNodeId: 'other',
      },
    });
    force.updateConfig({ rootNodeId: 'root' });
    force.updateConfig({ crystalRingDistance: 240 });

    let [init, firstUpdate, secondUpdate] = workers[0].messages;
    assert.equal(init.type, 'init');
    assert.deepEqual(init.crystalTargets, computeCrystalTargets(
      init.nodes,
      init.edges,
      init.groups,
      init.options,
    ));
    assert.deepEqual(init.crystalTargets.other, computeCrystalTargets(
      init.nodes,
      init.edges,
      init.groups,
      init.options,
    ).other);
    assert.deepEqual(firstUpdate.crystalTargets.root, {
      ...firstUpdate.crystalTargets.root,
      x: 0,
      y: 0,
    });
    assert.equal(secondUpdate.config.rootNodeId, 'root');
    assert.equal(secondUpdate.config.crystalRingDistance, 240);
    assert.equal(secondUpdate.crystalTargets.root.x, 0);
    assert.equal(secondUpdate.crystalTargets.root.y, 0);

    force.stop();
    force.start({
      nodes: [{ id: 'replacement', w: 40, h: 40 }],
      edges: [],
      options: { layoutAlgorithm: 'crystal' },
    });
    force.updateConfig({ crystalRingDistance: 160 });
    let replacementUpdate = workers[1].messages.at(-1);
    assert.deepEqual(Object.keys(replacementUpdate.crystalTargets), ['replacement']);
    force.stop();
  } finally {
    if (NativeWorker) {
      globalThis.Worker = NativeWorker;
    } else {
      delete globalThis.Worker;
    }
  }
});

test('classic force worker consumes canonical targets without an embedded crystal planner', async () => {
  let source = await readFile(new URL('../canvas/ForceWorker.js', import.meta.url), 'utf8');
  let wrapperSource = await readFile(new URL('../canvas/ForceLayout.js', import.meta.url), 'utf8');
  let messages = [];
  let workerScope = {
    postMessage(message) {
      messages.push(message);
    },
  };
  vm.runInContext(source, vm.createContext({
    self: workerScope,
    setTimeout,
    clearTimeout,
    console,
  }), { filename: 'ForceWorker.js' });
  workerScope.onmessage({
    data: {
      type: 'init',
      nodes: [
        { id: 'root', w: 80, h: 80 },
        { id: 'leaf', w: 40, h: 40 },
      ],
      edges: [{ from: 'root', to: 'leaf' }],
      groups: {},
      crystalTargets: {
        root: { x: 40, y: 60, shell: 0, center: true },
        leaf: { x: 240, y: 60, shell: 1, center: false },
      },
      options: {
        mode: 'continuous',
        layoutAlgorithm: 'crystal',
        positionOrigin: 'center',
        initialAlpha: 0.001,
        contAlphaFloor: 0.001,
        contAlphaTarget: 0.001,
        alphaDecay: 1,
        chargeStrength: 0,
        linkStrength: 0,
        collideStrength: 0,
        crystalStrength: 0.01,
        brownian: 0,
      },
    },
  });
  let ids = messages.find((message) => message.type === 'nodeIds').ids;
  let tick = messages.find((message) => message.type === 'tick');
  let packed = new Float32Array(tick.packed);
  let positions = Object.fromEntries(ids.map((id, index) => [id, {
    x: packed[index * 2],
    y: packed[index * 2 + 1],
  }]));
  workerScope.onmessage({ data: { type: 'stop' } });

  assert.deepEqual(positions.root, { x: 40, y: 60 });
  assert.deepEqual(positions.leaf, { x: 240, y: 60 });
  assert.match(source, /applyCrystalTargetsToWorkerNodes\(data\.crystalTargets, true\)/);
  assert.doesNotMatch(source, /assignCrystalTargets|getCrystalBranchStep|getCrystalClusterRadius/);
  assert.doesNotMatch(source, /return 0;\s*\}\s*function applyCrystal/);
  assert.doesNotMatch(
    `${wrapperSource}\n${source}`,
    /^\s*crystal(?:RingDistance|Spokes|AngleJitter):/m,
  );
});

test('node-canvas crystal layout batches positions and fits only when requested', async () => {
  let { window } = parseHTML('<!doctype html><html><body></body></html>');
  let NativeHTMLElement = globalThis.HTMLElement;
  let NativeCustomElements = globalThis.customElements;
  let NativeDocument = globalThis.document;
  let NativeWindow = globalThis.window;
  let NativeElement = globalThis.Element;
  let NativeNode = globalThis.Node;
  let NativeEvent = globalThis.Event;
  let NativeCustomEvent = globalThis.CustomEvent;
  let NativeMutationObserver = globalThis.MutationObserver;
  let NativeGetComputedStyle = globalThis.getComputedStyle;
  let NativeRequestAnimationFrame = globalThis.requestAnimationFrame;
  let NativeCancelAnimationFrame = globalThis.cancelAnimationFrame;
  let NativeCSSStyleSheet = globalThis.CSSStyleSheet;
  Object.assign(globalThis, {
    window,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    MutationObserver: window.MutationObserver,
    customElements: window.customElements,
    document: window.document,
    getComputedStyle: window.getComputedStyle || (() => ({})),
    requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    CSSStyleSheet: class {
      replaceSync(text) {
        this.cssText = text;
      }
    },
  });
  window.document.adoptedStyleSheets = [];

  try {
    let { NodeCanvas } = await import('../canvas/NodeCanvas/NodeCanvas.js');
    let nodes = [{ id: 'root' }, { id: 'leaf' }];
    let calls = [];
    let canvas = Object.assign(Object.create(NodeCanvas.prototype), {
      _editor: createEditor(nodes, [{ from: 'root', to: 'leaf' }]),
      clearFlowLayout: () => calls.push('clear'),
      measureNodeSizes: () => ({
        root: { w: 120, h: 80 },
        leaf: { w: 70, h: 50 },
      }),
      setBatchMode: (active) => calls.push(`batch:${active}`),
      setNodePosition: (id, x, y) => calls.push(['position', id, x, y]),
      syncPhantom: () => calls.push('sync'),
      refreshConnections: () => calls.push('refresh'),
      fitView: () => calls.push('fit'),
      _scheduleConnectionSettleRefresh: () => calls.push('settle'),
    });

    let result = canvas.applyLayout({
      algorithm: 'crystal',
      rootNodeId: 'root',
      startX: 20,
      startY: 30,
      fit: true,
    });

    assert.deepEqual(result.positions.root, { x: 20, y: 30 });
    assert.deepEqual(calls.filter((entry) => entry === 'refresh'), ['refresh']);
    assert.deepEqual(calls.filter((entry) => entry === 'fit'), ['fit']);
    assert.deepEqual(calls.filter((entry) => entry === 'settle'), []);
    assert.deepEqual(calls.filter((entry) => typeof entry === 'string' && entry.startsWith('batch:')), [
      'batch:true',
      'batch:false',
    ]);

    calls.length = 0;
    canvas.applyLayout({
      algorithm: 'crystal',
      rootNodeId: 'root',
      fit: false,
    });
    assert.deepEqual(calls.filter((entry) => entry === 'fit'), []);
    assert.deepEqual(calls.filter((entry) => entry === 'settle'), []);
    assert.deepEqual(calls.filter((entry) => entry === 'refresh'), ['refresh']);
  } finally {
    if (NativeHTMLElement) globalThis.HTMLElement = NativeHTMLElement;
    else delete globalThis.HTMLElement;
    if (NativeCustomElements) globalThis.customElements = NativeCustomElements;
    else delete globalThis.customElements;
    if (NativeDocument) globalThis.document = NativeDocument;
    else delete globalThis.document;
    if (NativeWindow) globalThis.window = NativeWindow;
    else delete globalThis.window;
    if (NativeElement) globalThis.Element = NativeElement;
    else delete globalThis.Element;
    if (NativeNode) globalThis.Node = NativeNode;
    else delete globalThis.Node;
    if (NativeEvent) globalThis.Event = NativeEvent;
    else delete globalThis.Event;
    if (NativeCustomEvent) globalThis.CustomEvent = NativeCustomEvent;
    else delete globalThis.CustomEvent;
    if (NativeMutationObserver) globalThis.MutationObserver = NativeMutationObserver;
    else delete globalThis.MutationObserver;
    if (NativeGetComputedStyle) globalThis.getComputedStyle = NativeGetComputedStyle;
    else delete globalThis.getComputedStyle;
    if (NativeRequestAnimationFrame) globalThis.requestAnimationFrame = NativeRequestAnimationFrame;
    else delete globalThis.requestAnimationFrame;
    if (NativeCancelAnimationFrame) globalThis.cancelAnimationFrame = NativeCancelAnimationFrame;
    else delete globalThis.cancelAnimationFrame;
    if (NativeCSSStyleSheet) globalThis.CSSStyleSheet = NativeCSSStyleSheet;
    else delete globalThis.CSSStyleSheet;
  }
});
