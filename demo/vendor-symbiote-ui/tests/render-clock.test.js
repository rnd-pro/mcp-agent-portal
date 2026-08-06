import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';

import { installRenderClock, renderNow } from '../core/render-clock.js';
import { createFocusTransitionClock } from '../canvas/CanvasGraph/CanvasGraphViewport.js';
import {
  CANVAS_GRAPH_BASE_FRAME_MS,
  getLayerAnimationFrame,
  resolveCanvasGraphFrameContext,
  resolveFocusFrame,
  resolveGroupOrbitRotationFrame,
  resolveViewportAnimation,
} from '../canvas/CanvasGraph/CanvasGraphDrawState.js';

test('render clock uses the live performance clock when no clock is installed', () => {
  let originalPerformance = globalThis.performance;
  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: { now: () => 123.5 },
  });
  try {
    assert.equal(renderNow(), 123.5);
  } finally {
    Object.defineProperty(globalThis, 'performance', {
      configurable: true,
      value: originalPerformance,
    });
  }
});

test('render clock uses the installed clock until its disposer runs', () => {
  let dispose = installRenderClock({ now: () => 2400 });
  assert.equal(renderNow(), 2400);
  dispose();
  assert.notEqual(renderNow(), 2400);
});

test('render clock rejects invalid contracts and non-finite installed values', () => {
  assert.throws(() => installRenderClock({}), /now/);
  let dispose = installRenderClock({ now: () => Number.NaN });
  try {
    assert.throws(() => renderNow(), /finite/);
  } finally {
    dispose();
  }
});

test('canvas graph frame context derives progression from render time', () => {
  let first = resolveCanvasGraphFrameContext(1000, null);
  let duplicate = resolveCanvasGraphFrameContext(1000, 1000);
  let thirtyFps = resolveCanvasGraphFrameContext(1000 + CANVAS_GRAPH_BASE_FRAME_MS * 2, 1000);
  let twelveFps = resolveCanvasGraphFrameContext(1000 + CANVAS_GRAPH_BASE_FRAME_MS * 5, 1000);

  assert.equal(first.frameStep, 1);
  assert.equal(duplicate.frameStep, 0);
  assert.ok(Math.abs(thirtyFps.frameStep - 2) < 1e-9);
  assert.ok(Math.abs(twelveFps.frameStep - 5) < 1e-9);
});

test('canvas graph easing is invariant across equivalent frame-time steps', () => {
  let viewportOptions = {
    zoom: 1,
    targetZoom: 2,
    panX: 0,
    panY: 0,
    targetPanX: 100,
    targetPanY: -50,
    zoomAnchor: null,
    viewportEase: 0.15,
  };
  let firstViewport = resolveViewportAnimation({ ...viewportOptions, frameStep: 1 });
  let secondViewport = resolveViewportAnimation({
    ...viewportOptions,
    ...firstViewport,
    frameStep: 1,
  });
  let combinedViewport = resolveViewportAnimation({ ...viewportOptions, frameStep: 2 });
  assert.ok(Math.abs(secondViewport.zoom - combinedViewport.zoom) < 1e-12);
  assert.ok(Math.abs(secondViewport.panX - combinedViewport.panX) < 1e-12);
  assert.ok(Math.abs(secondViewport.panY - combinedViewport.panY) < 1e-12);

  let layers = {
    0: { scale: 1, opacity: 1, parallax: 0 },
    1: { scale: 1, opacity: 1, parallax: 0 },
    2: { scale: 1, opacity: 1, parallax: 0 },
    3: { scale: 1, opacity: 1, parallax: 0 },
    4: { scale: 1, opacity: 1, parallax: 0 },
  };
  let layerOptions = {
    layerTargets: {
      scale: [1.14, 0.96, 0.88, 0.78, 0.68],
      opacity: [1, 0.52, 0.24, 0.07, 0.02],
      parallax: [0, 0.02, 0.045, 0.075, 0.11],
    },
    isIdle: false,
    inGroupMode: false,
  };
  let firstLayers = getLayerAnimationFrame({ ...layerOptions, layerAnim: layers, frameStep: 1 });
  let secondLayers = getLayerAnimationFrame({ ...layerOptions, layerAnim: firstLayers, frameStep: 1 });
  let combinedLayers = getLayerAnimationFrame({ ...layerOptions, layerAnim: layers, frameStep: 2 });
  for (let depth = 0; depth <= 4; depth += 1) {
    for (let key of ['scale', 'opacity', 'parallax']) {
      assert.ok(Math.abs(secondLayers[depth][key] - combinedLayers[depth][key]) < 1e-12);
    }
  }
});

test('canvas graph focus recurrence does not advance twice at one render timestamp', () => {
  let options = {
    activeNode: null,
    deactivating: false,
    activePosition: null,
    infoPanel: {},
    canvasRect: null,
    dpr: 1,
    zoom: 1,
    panX: 0,
    panY: 0,
    focusX: 120,
    focusY: 80,
    focusActive: true,
    vcx: 320,
    vcy: 180,
    frameStep: 0,
  };
  let frame = resolveFocusFrame(options);
  assert.equal(frame.focusX, 120);
  assert.equal(frame.focusY, 80);
});

test('canvas graph group orbit is invariant across equivalent frame-time steps', () => {
  let options = { rotation: 0.4, rotationSpeed: 0.01, hovered: true, dragged: false };
  let first = resolveGroupOrbitRotationFrame({ ...options, frameStep: 1 });
  let second = resolveGroupOrbitRotationFrame({
    ...options,
    rotation: first.rotation,
    rotationSpeed: first.rotationSpeed,
    frameStep: 1,
  });
  let combined = resolveGroupOrbitRotationFrame({ ...options, frameStep: 2 });
  assert.ok(Math.abs(second.rotation - combined.rotation) < 1e-12);
  assert.ok(Math.abs(second.rotationSpeed - combined.rotationSpeed) < 1e-12);

  let duplicate = resolveGroupOrbitRotationFrame({ ...options, frameStep: 0 });
  assert.equal(duplicate.rotation, options.rotation);
  assert.equal(duplicate.rotationSpeed, options.rotationSpeed);
});

test('render clock is public from Node-safe entrypoints', async () => {
  let core = await import('../core/index.js');
  let root = await import('../index.js');
  assert.equal(core.installRenderClock, installRenderClock);
  assert.equal(core.renderNow, renderNow);
  assert.equal(root.installRenderClock, installRenderClock);
  assert.equal(root.renderNow, renderNow);
});

test('CanvasGraph visual effect timestamps use the shared render clock', async () => {
  let source = await readFile(new URL('../canvas/CanvasGraph/CanvasGraph.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ renderNow \} from '..\/..\/core\/render-clock\.js';/);
  assert.match(source, /pulseNode\([\s\S]*?let now = renderNow\(\);/);
  assert.match(source, /_queuePulseNow\([\s\S]*?startTime = renderNow\(\)/);
  assert.match(source, /_drawTransitionMarkers\([\s\S]*?let now = renderNow\(\);/);
  assert.match(
    source,
    /let frameContext = resolveCanvasGraphFrameContext\(renderNow\(\), this\._lastRenderTime\);[\s\S]*?this\._pulses = this\._pulses\.filter/,
  );
  assert.match(source, /ip\.startTime = now;/);
  assert.match(source, /const elapsed = now - ip\.startTime;/);
  assert.match(source, /let now = Number\.isFinite\(options\.startTime\) \? options\.startTime : renderNow\(\);/);
  assert.match(source, /clearPulses\(\) \{/);
  assert.match(source, /marker\.pendingPulse = null;/);
});

test('CanvasGraph pulse APIs honor explicit seek time and clear queued effects', async () => {
  let { window } = parseHTML('<html><body></body></html>');
  let globalKeys = ['window', 'document', 'HTMLElement', 'customElements', 'CustomEvent', 'Event', 'EventTarget', 'Node', 'CSSStyleSheet'];
  let descriptors = new Map(globalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (let key of globalKeys.slice(0, -1)) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: window[key] || window,
    });
  }
  Object.defineProperty(globalThis, 'CSSStyleSheet', {
    configurable: true,
    value: class CSSStyleSheet { replaceSync() {} },
  });
  let disposeClock = installRenderClock({ now: () => 700 });
  try {
    let { CanvasGraph } = await import('../canvas/CanvasGraph/CanvasGraph.js');
    let graph = Object.create(CanvasGraph.prototype);
    let wakes = 0;
    graph._pulses = [];
    graph._transitionMarkers = [{
      toId: 'deferred',
      startTime: 500,
      duration: 400,
      pendingPulse: { duration: 600, waves: 1 },
    }];
    graph._wakeLoop = () => { wakes += 1; };

    graph.pulseNode('explicit', 900, { startTime: 100, deferUntilTransition: false });
    graph.pulseNode('clock', 1200, { deferUntilTransition: false });

    assert.deepEqual(graph._pulses.map(({ id, startTime, duration }) => ({ id, startTime, duration })), [
      { id: 'explicit', startTime: 100, duration: 900 },
      { id: 'clock', startTime: 700, duration: 1200 },
    ]);
    assert.equal(graph.clearPulses(), 3);
    assert.deepEqual(graph._pulses, []);
    assert.equal(graph._transitionMarkers[0].pendingPulse, null);
    assert.equal(wakes, 3);
  } finally {
    disposeClock();
    for (let key of globalKeys) {
      let descriptor = descriptors.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('CanvasGraph presents externally driven frames without leaving a stale loop', async () => {
  let { window } = parseHTML('<html><body></body></html>');
  let globalKeys = ['window', 'document', 'HTMLElement', 'customElements', 'CustomEvent', 'Event', 'EventTarget', 'Node', 'CSSStyleSheet', 'requestAnimationFrame', 'cancelAnimationFrame'];
  let descriptors = new Map(globalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (let key of globalKeys.slice(0, -3)) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: window[key] || window,
    });
  }
  Object.defineProperty(globalThis, 'CSSStyleSheet', {
    configurable: true,
    value: class CSSStyleSheet { replaceSync() {} },
  });
  let canceled = [];
  let nextFrameId = 100;
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: () => ++nextFrameId,
  });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    value: (id) => canceled.push(id),
  });
  try {
    let { CanvasGraph } = await import('../canvas/CanvasGraph/CanvasGraph.js');
    let graph = Object.create(CanvasGraph.prototype);
    let draws = 0;
    graph.canvas = { width: 640, height: 360 };
    graph._animationFrame = 42;
    graph._loopRunning = true;
    graph._idleFrames = 8;
    graph._inDraw = false;
    graph._externalFrameDrive = false;
    graph.draw = () => { draws += 1; return true; };

    assert.equal(graph.presentFrame(), true);
    assert.deepEqual(canceled, [42]);
    assert.equal(draws, 1);
    assert.equal(graph._animationFrame, 101);
    assert.equal(graph._loopRunning, true);
    assert.equal(graph._externalFrameDrive, false);

    assert.equal(graph.setFrameDriver('external'), 'external');
    assert.deepEqual(canceled, [42, 101]);
    assert.equal(graph.presentFrame(), true);
    assert.equal(draws, 2);
    assert.equal(graph._externalFrameDrive, true);
    assert.equal(graph._loopRunning, false);
    assert.throws(() => graph.setFrameDriver('timer'), /frame driver/);

    graph._inDraw = true;
    assert.equal(graph.presentFrame(), false);
    assert.equal(draws, 2);
    graph._inDraw = false;
    graph.canvas = { width: 0, height: 0 };
    assert.equal(graph.presentFrame(), false);

    let width = 640;
    let height = 360;
    let dimensionWrites = 0;
    graph.canvas = {
      style: {},
      get width() { return width; },
      set width(value) { width = value; dimensionWrites += 1; },
      get height() { return height; },
      set height(value) { height = value; dimensionWrites += 1; },
    };
    graph.getBoundingClientRect = () => ({ width: 640, height: 360 });
    graph.resizeCanvas();
    assert.equal(dimensionWrites, 0);
    graph.getBoundingClientRect = () => ({ width: 641, height: 361 });
    graph.resizeCanvas();
    assert.equal(dimensionWrites, 2);

    graph._nodeAppearances = new Map([
      ['node', { startTime: 0, duration: 900 }],
      ['future', { startTime: 500, duration: 900 }],
    ]);
    assert.equal(graph._hasActiveNodeAppearances(100), true);
    assert.equal(graph._hasActiveNodeAppearances(2000), false);
    assert.deepEqual(graph._resolveNodeAppearance('node', 12000), { alpha: 1, scale: 1 });
    let rewound = graph._resolveNodeAppearance('node', 100);
    assert.ok(rewound.alpha > 0 && rewound.alpha < 1);
    assert.ok(rewound.scale > 0 && rewound.scale < 1);
    assert.equal(graph._nodeAppearances.has('node'), true);
  } finally {
    for (let key of globalKeys) {
      let descriptor = descriptors.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('CanvasGraph node appearance remains seekable after a later frame', async () => {
  let source = await readFile(new URL('../canvas/CanvasGraph/CanvasGraph.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /_nodeAppearances\.delete\(nodeId\)/);
  assert.match(source, /if \(elapsed >= marker\.duration\) \{\s+return \{ alpha: 1, scale: 1 \};/);
});

test('focus transition clock resolves a delayed first default frame to progress zero', () => {
  let clock = createFocusTransitionClock();
  let delayedFirstFrame = 5000;
  let startedAt = clock.resolveStart(delayedFirstFrame);
  assert.equal(startedAt, delayedFirstFrame);
  let progress = Math.max(0, Math.min(1, (delayedFirstFrame - startedAt) / 680));
  assert.equal(progress, 0);
});

test('focus transition clock keeps an explicit start time authoritative across frames', () => {
  let clock = createFocusTransitionClock(4600);
  assert.equal(clock.resolveStart(5000), 4600);
  assert.equal(clock.resolveStart(6000), 4600);
  let progress = Math.max(0, Math.min(1, (5000 - clock.resolveStart(5000)) / 680));
  assert.equal(progress, 400 / 680);
});

test('focus transition clock shares one zero regardless of the first consumer', () => {
  let frames = { viewport: 4000, markerCallback: 4008, markerRefresh: 4016 };
  let orders = [
    ['viewport', 'markerCallback', 'markerRefresh'],
    ['markerCallback', 'markerRefresh', 'viewport'],
    ['markerRefresh', 'viewport', 'markerCallback'],
  ];
  for (let order of orders) {
    let clock = createFocusTransitionClock();
    let sharedZero = frames[order[0]];
    let resolved = order.map((consumer) => clock.resolveStart(frames[consumer]));
    assert.deepEqual(resolved, [sharedZero, sharedZero, sharedZero]);
    assert.equal(frames[order[0]] - sharedZero, 0);
  }
});

test('focus transition clock does not skip motion during a blocked frame', () => {
  let clock = createFocusTransitionClock();
  assert.equal(clock.resolveStart(1000), 1000);
  assert.equal(clock.resolveStart(1900), 1836);
  assert.equal(1900 - clock.resolveStart(1900), 64);
  assert.equal(clock.resolveStart(1890), 1836);
  assert.equal(clock.resolveStart(1916), 1836);
});

test('focus transition clock wiring routes every consumer through one shared clock', async () => {
  let nodeCanvasSource = await readFile(
    new URL('../canvas/NodeCanvas/NodeCanvas.js', import.meta.url),
    'utf8'
  );
  let viewportSource = await readFile(
    new URL('../canvas/CanvasViewport.js', import.meta.url),
    'utf8'
  );

  assert.match(nodeCanvasSource, /createFocusTransitionClock/);
  assert.match(nodeCanvasSource, /transitionClock: createFocusTransitionClock\(options\.transitionStartTime\)/);
  assert.match(nodeCanvasSource, /let clock = options\.transitionClock \|\| createFocusTransitionClock\(options\.transitionStartTime\);/);
  assert.match(nodeCanvasSource, /let startedAt = clock\.resolveStart\(now\);/);
  assert.match(nodeCanvasSource, /this\._renderFocusTransitionMarker\(now\)/);

  assert.match(viewportSource, /createFocusTransitionClock/);
  assert.match(viewportSource, /let clock = options\.transitionClock \|\| createFocusTransitionClock\(options\.transitionStartTime\);/);
  assert.match(viewportSource, /let elapsed = now - clock\.resolveStart\(now\);/);
});
