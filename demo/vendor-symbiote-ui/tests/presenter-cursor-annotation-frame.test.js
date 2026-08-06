import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';
import {
  PRESENTER_CLICK_DURATION_MS,
  PRESENTER_ANNOTATION_DURATION_MS,
  PRESENTER_ANNOTATION_COLLISION_ALLOWANCE_PX,
  PRESENTER_ANNOTATION_TARGET_INSET_PX,
  PRESENTER_CURSOR_SIZE_PX,
  PRESENTER_FOCUS_REVEAL_DURATION_MS,
  analyzePresenterAnnotationSafety,
  createPresenterCursor,
  PRESENTER_FRAME_MS,
  PRESENTER_MARKERS,
  PRESENTER_SYMBOLS,
  projectPresenterState,
} from '../chat/presenter-cursor.js';

function makeDom() {
  let { window } = parseHTML('<!doctype html><html><body></body></html>');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
  window.getComputedStyle = (el) => ({
    overflow: el.style?.overflow || 'visible',
    overflowX: el.style?.overflowX || el.style?.overflow || 'visible',
    overflowY: el.style?.overflowY || el.style?.overflow || 'visible',
    clipPath: el.style?.clipPath || 'none',
    contain: el.style?.contain || '',
  });
  window.requestAnimationFrame = () => {
    throw new Error('deterministic annotation frames must not schedule animation frames');
  };
  return window;
}

function target(document, rect = { left: 180, top: 140, width: 260, height: 160 }) {
  let el = document.createElement('section');
  el.getBoundingClientRect = () => ({
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
  });
  document.body.appendChild(el);
  return el;
}

function inkPath(document) {
  return document.querySelector('.pc-ink path')?.getAttribute('d') || '';
}

test('deterministic annotation frame is idempotent and prefix-stable', () => {
  let window = makeDom();
  let cursor = createPresenterCursor(window.document);
  let el = target(window.document, { left: 180, top: 140, width: 100, height: 80 });

  let first = cursor.presentAnnotationFrame(el, { marker: 'oval' }, { progress: 0.4, seed: 17 });
  let prefix = inkPath(window.document);
  let repeated = cursor.presentAnnotationFrame(el, { marker: 'oval' }, { progress: 0.4, seed: 17 });
  assert.deepEqual(repeated, first);
  assert.equal(inkPath(window.document), prefix);

  let later = cursor.presentAnnotationFrame(el, { marker: 'oval' }, { progress: 0.7, seed: 17 });
  assert.ok(inkPath(window.document).startsWith(prefix));
  assert.ok(later.pathPoints > first.pathPoints);
  assert.notEqual(later.pathDigest, first.pathDigest);

  cursor.dispose();
});

test('deterministic focus frame projects cursor and frame modes without scheduling animation', () => {
  let window = makeDom();
  let cursor = createPresenterCursor(window.document);
  let el = target(window.document, { left: 180, top: 140, width: 100, height: 80 });

  let framed = cursor.presentFocusFrame(el, { elapsedMs: 0, seed: 7, mode: 'frame' });
  assert.equal(framed.presented, true);
  assert.equal(framed.visible, true);
  assert.equal(framed.mode, 'frame');
  assert.equal(framed.cursor, null);
  assert.equal(framed.revealProgress, 0);
  assert.equal(framed.revealing, true);
  assert.equal(framed.frameRect.width, 1);
  assert.equal(framed.frameRect.height, 1);
  assert.equal(framed.dragHandle.visible, true);
  assert.equal(window.document.querySelector('.pc-cursor').style.opacity, '0');

  let pointed = cursor.presentFocusFrame(el, {
    elapsedMs: PRESENTER_FOCUS_REVEAL_DURATION_MS / 2,
    seed: 7,
    mode: 'cursor',
  });
  assert.equal(pointed.mode, 'cursor');
  assert.equal(pointed.cursor.visible, true);
  assert.equal(window.document.querySelector('.pc-cursor').style.opacity, '1');
  assert.notEqual(pointed.antsDashOffset, framed.antsDashOffset);
  assert.ok(pointed.revealProgress > framed.revealProgress);
  assert.ok(pointed.frameRect.width > framed.frameRect.width);
  assert.ok(pointed.frameRect.height > framed.frameRect.height);
  assert.equal(pointed.dragHandle.visible, true);

  let complete = cursor.presentFocusFrame(el, {
    elapsedMs: PRESENTER_FOCUS_REVEAL_DURATION_MS,
    seed: 7,
    mode: 'frame',
  });
  assert.equal(complete.revealProgress, 1);
  assert.equal(complete.revealing, false);
  assert.equal(complete.dragHandle.visible, false);
  assert.ok(complete.frameRect.width > pointed.frameRect.width);
  assert.ok(complete.frameRect.height > pointed.frameRect.height);

  cursor.dispose();
});

test('deterministic annotation frame clamps progress and respects explicit seed', () => {
  let window = makeDom();
  let cursor = createPresenterCursor(window.document);
  let el = target(window.document, { left: 180, top: 140, width: 100, height: 80 });

  let empty = cursor.presentAnnotationFrame(el, { marker: 'underline' }, { progress: -1, seed: 5 });
  assert.equal(empty.progress, 0);
  assert.equal(empty.pathPoints, 0);
  assert.equal(inkPath(window.document), '');

  let full = cursor.presentAnnotationFrame(el, { marker: 'underline' }, { progress: 2, seed: 5 });
  let firstPath = inkPath(window.document);
  assert.equal(full.progress, 1);
  assert.equal(full.pathPoints, 97);
  assert.match(firstPath, /^M[\d.-]+ [\d.-]+Q/);
  assert.match(firstPath, /T[\d.-]+ [\d.-]+$/);
  assert.doesNotMatch(firstPath, /L/);
  let changedSeed = cursor.presentAnnotationFrame(el, { marker: 'underline' }, { progress: 1, seed: 6 });
  assert.notEqual(inkPath(window.document), firstPath);
  assert.notEqual(changedSeed.pathDigest, full.pathDigest);
  assert.equal(PRESENTER_ANNOTATION_DURATION_MS, 1000);

  cursor.dispose();
});

test('annotation safety accepts perimeter ink and rejects protected content', () => {
  let targetRect = { left: 100, top: 100, width: 200, height: 100 };
  let safe = analyzePresenterAnnotationSafety({
    pathSamples: [{ x: 90, y: 90 }, { x: 310, y: 90 }],
    cursor: { x: 80, y: 80 },
    targetRect,
  });
  assert.equal(safe.safe, true);
  assert.equal(safe.allowancePx, PRESENTER_ANNOTATION_COLLISION_ALLOWANCE_PX);
  assert.equal(safe.targetInsetPx, PRESENTER_ANNOTATION_TARGET_INSET_PX);
  assert.equal(safe.cursorSizePx, PRESENTER_CURSOR_SIZE_PX);

  let unsafe = analyzePresenterAnnotationSafety({
    pathSamples: [{ x: 80, y: 150 }, { x: 320, y: 150 }],
    cursor: { x: 80, y: 80 },
    targetRect,
  });
  assert.equal(unsafe.safe, false);
  assert.equal(unsafe.targetInteriorCollision, true);
});

test('annotation safety includes stroke allowance, cursor body, and obstacle identity', () => {
  let obstacle = { id: 'caption', kind: 'caption', rect: { left: 300, top: 200, width: 180, height: 40 } };
  let edgeTouch = analyzePresenterAnnotationSafety({
    pathSamples: [{ x: 200, y: 195.7 }, { x: 500, y: 195.7 }],
    cursor: { x: 40, y: 40 },
    targetRect: { left: 40, top: 40, width: 80, height: 80 },
    obstacles: [obstacle],
  });
  assert.equal(edgeTouch.safe, false);
  assert.deepEqual(edgeTouch.collisions.map(({ id, ink, cursor }) => ({ id, ink, cursor })), [
    { id: 'caption', ink: true, cursor: false },
  ]);

  let cursorCollision = analyzePresenterAnnotationSafety({
    pathSamples: [],
    cursor: { x: 290, y: 190 },
    targetRect: { left: 40, top: 40, width: 80, height: 80 },
    obstacles: [obstacle],
  });
  assert.equal(cursorCollision.safe, false);
  assert.equal(cursorCollision.collisions[0].cursor, true);
});

test('annotation safety caps target inset at one quarter of the smaller side', () => {
  let result = analyzePresenterAnnotationSafety({
    pathSamples: [{ x: 0, y: 2.6 }, { x: 100, y: 2.6 }],
    cursor: null,
    targetRect: { left: 0, top: 0, width: 100, height: 20 },
    targetInsetPx: 8,
  });
  assert.equal(result.targetInsetPx, 5);
  assert.equal(result.targetInteriorCollision, true);
});

test('annotation safety fails closed when the target rect is unavailable', () => {
  let result = analyzePresenterAnnotationSafety({
    pathSamples: [{ x: 20, y: 20 }, { x: 40, y: 40 }],
    targetRect: null,
  });
  assert.equal(result.safe, false);
  assert.equal(result.missingTarget, true);
});

test('annotation safety rejects ink and cursor geometry outside the supplied viewport', () => {
  let result = analyzePresenterAnnotationSafety({
    pathSamples: [{ x: 10, y: 10 }, { x: 205, y: 10 }],
    cursor: { x: 190, y: 90 },
    targetRect: { left: 40, top: 40, width: 40, height: 20 },
    viewport: { width: 200, height: 100 },
  });

  assert.equal(result.safe, false);
  assert.equal(result.viewportCollision, true);
  assert.equal(result.inkViewportCollision, true);
  assert.equal(result.cursorViewportCollision, true);
});

test('freehand annotation keeps its exact ink and cursor outside protected target content', () => {
  let window = makeDom();
  let el = target(window.document, { left: 180, top: 140, width: 100, height: 80 });
  let cursor = createPresenterCursor(window.document);
  let targetRect = el.getBoundingClientRect();
  for (let progress of [0, 0.25, 0.5, 0.75, 1]) {
    let frame = cursor.presentAnnotationFrame(el, { marker: 'freehand' }, { progress, seed: 17 });
    let safety = analyzePresenterAnnotationSafety({
      pathSamples: frame.pathSamples,
      cursor: frame.cursor,
      cursorSizePx: frame.cursorSizePx,
      targetRect,
    });
    assert.equal(safety.safe, true, `freehand must remain safe at progress ${progress}`);
  }
  cursor.dispose();
});

test('oval annotation traces an external rounded perimeter', () => {
  let window = makeDom();
  let el = target(window.document, { left: 120, top: 100, width: 360, height: 72 });
  let cursor = createPresenterCursor(window.document);
  let targetRect = el.getBoundingClientRect();
  for (let progress of [0, 0.25, 0.5, 0.75, 1]) {
    let frame = cursor.presentAnnotationFrame(el, { marker: 'oval' }, { progress, seed: 23 });
    let safety = analyzePresenterAnnotationSafety({
      pathSamples: frame.pathSamples,
      cursor: frame.cursor,
      cursorSizePx: frame.cursorSizePx,
      targetRect,
    });
    assert.equal(safety.safe, true, `oval must remain safe at progress ${progress}`);
  }
  cursor.dispose();
});

test('small oval stays compact between its target and an adjacent control', () => {
  let window = makeDom();
  let targetRect = { left: 288, top: 146, width: 28, height: 24 };
  let obstacle = {
    id: 'adjacent-control',
    kind: 'critical-control',
    rect: { left: 288, top: 114, width: 28, height: 24 },
  };
  let el = target(window.document, targetRect);
  let cursor = createPresenterCursor(window.document);

  for (let seed of [23, 2544744498]) {
    for (let progress of [0, 0.25, 0.29166666666666685, 0.5, 0.75, 0.875, 1]) {
      let frame = cursor.presentAnnotationFrame(el, { marker: 'oval' }, {
        progress,
        seed,
        viewport: { width: 800, height: 600 },
        obstacles: [obstacle],
      });
      assert.equal(frame.safety.safe, true, `compact oval must remain safe at progress ${progress} for seed ${seed}`);
      assert.equal(frame.safety.targetInteriorCollision, false);
      assert.deepEqual(frame.safety.collisions, []);
    }
  }

  cursor.dispose();
});

test('compact status oval keeps its nib outside protected content at every 30 FPS phase', () => {
  let window = makeDom();
  let targetRect = { left: 1201.406, top: 148, width: 49.688, height: 20.391 };
  let el = target(window.document, targetRect);
  let cursor = createPresenterCursor(window.document);

  for (let frameIndex = 0; frameIndex <= 30; frameIndex += 1) {
    let progress = frameIndex / 30;
    let frame = cursor.presentAnnotationFrame(el, { marker: 'oval' }, {
      progress,
      seed: 3931985963,
      viewport: { width: 1920, height: 1080 },
    });
    assert.equal(frame.safety.safe, true, `status oval must remain safe at frame ${frameIndex}`);
    assert.equal(frame.safety.cursorTargetCollision, false);
    assert.equal(frame.safety.targetInteriorCollision, false);
  }

  cursor.dispose();
});

test('progress zero cursor projection is independent of presentation history', () => {
  let firstWindow = makeDom();
  let firstCursor = createPresenterCursor(firstWindow.document);
  let firstTarget = target(firstWindow.document, { left: 180, top: 140, width: 100, height: 80 });
  firstCursor.presentAnnotationFrame(firstTarget, { marker: 'oval' }, { progress: 1, seed: 99 });
  let afterHistory = firstCursor.presentAnnotationFrame(
    firstTarget,
    { marker: 'underline' },
    { progress: 0, seed: 5 },
  );
  let afterHistoryTransform = firstWindow.document.querySelector('.pc-cursor')?.style.transform;

  let freshWindow = makeDom();
  let freshCursor = createPresenterCursor(freshWindow.document);
  let freshTarget = target(freshWindow.document, { left: 180, top: 140, width: 100, height: 80 });
  let fromFresh = freshCursor.presentAnnotationFrame(
    freshTarget,
    { marker: 'underline' },
    { progress: 0, seed: 5 },
  );
  let freshTransform = freshWindow.document.querySelector('.pc-cursor')?.style.transform;

  assert.deepEqual(afterHistory, fromFresh);
  assert.equal(afterHistoryTransform, freshTransform);
  assert.match(freshTransform, /^translate\(.+px, .+px\)$/);
  firstCursor.dispose();
  freshCursor.dispose();
});

test('shallow target underline stays outside protected content for the full gesture', () => {
  let window = makeDom();
  let cursor = createPresenterCursor(window.document);
  let rect = { left: 16, top: 28, width: 760, height: 36 };
  let el = target(window.document, rect);

  for (let progress of [0, 0.125, 0.25, 0.5, 0.75, 1]) {
    let frame = cursor.presentAnnotationFrame(
      el,
      { kind: 'marker', marker: 'underline' },
      { progress, seed: 6 },
    );
    let safety = analyzePresenterAnnotationSafety({
      pathSamples: frame.pathSamples,
      cursor: frame.cursor || { x: 0, y: 0 },
      cursorSizePx: frame.cursorSizePx,
      targetRect: rect,
    });

    if (progress === 0) assert.equal(frame.pathPoints, 0);
    if (progress < 1) {
      assert.ok(frame.cursor.y > rect.top + rect.height);
      assert.equal(safety.cursorTargetCollision, false);
    } else {
      assert.ok(frame.cursor);
    }
    assert.equal(safety.safe, true, `underline must remain safe at progress ${progress}`);
  }
  cursor.dispose();
});

test('deterministic underline flips above a bottom-edge target and clamps every point', () => {
  let window = makeDom();
  let cursor = createPresenterCursor(window.document);
  let el = target(window.document, { left: 12, top: 152, width: 196, height: 24 });
  let viewport = { width: 220, height: 180 };

  let frameActive = cursor.presentAnnotationFrame(
    el,
    { marker: 'underline' },
    { progress: 0.5, seed: 13, viewport },
  );
  assert.equal(frameActive.placement, 'above');
  assert.ok(frameActive.cursor.x >= 0 && frameActive.cursor.x + PRESENTER_CURSOR_SIZE_PX <= viewport.width);
  assert.ok(frameActive.cursor.y >= 0 && frameActive.cursor.y + PRESENTER_CURSOR_SIZE_PX <= viewport.height);

  let frameCompleted = cursor.presentAnnotationFrame(
    el,
    { marker: 'underline' },
    { progress: 1, seed: 13, viewport },
  );
  assert.equal(frameCompleted.placement, 'above');
  assert.equal(frameCompleted.safety.safe, true);
  assert.ok(frameCompleted.pathSamples.every((point) => point.x >= 0 && point.x <= viewport.width));
  assert.ok(frameCompleted.pathSamples.every((point) => point.y >= 0 && point.y <= viewport.height));
  assert.ok(frameCompleted.cursor);
  cursor.dispose();
});

test('explicit above underline avoids the adjacent control from the square capture geometry', () => {
  let window = makeDom();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1080 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1080 });
  let cursor = createPresenterCursor(window.document);
  let el = target(window.document, { left: 927, top: 707, width: 24, height: 24 });
  let obstacle = {
    id: 'tour-control-39',
    kind: 'critical-control',
    rect: { left: 778.6, top: 749, width: 277.4, height: 47.6 },
  };

  for (let progress of [0, 0.25, 0.5, 0.75, 1]) {
    let frame = cursor.presentAnnotationFrame(
      el,
      { marker: 'underline', placement: 'above' },
      { progress, seed: 2544744498, viewport: { width: 1080, height: 1080 }, obstacles: [obstacle] },
    );
    assert.equal(frame.placement, 'above');
    assert.equal(frame.safety.safe, true, `above underline must remain safe at progress ${progress}`);
    assert.deepEqual(frame.safety.collisions, []);
  }

  cursor.dispose();
});

test('deterministic symbols choose before and above when preferred placement escapes', () => {
  let window = makeDom();
  let cursor = createPresenterCursor(window.document);
  let viewport = { width: 220, height: 180 };
  let rightEdge = target(window.document, { left: 178, top: 60, width: 36, height: 32 });
  let bottomEdge = target(window.document, { left: 80, top: 142, width: 60, height: 32 });

  let before = cursor.presentAnnotationFrame(
    rightEdge,
    { kind: 'symbol', symbol: 'question', placement: 'after' },
    { progress: 1, seed: 21, viewport },
  );
  let above = cursor.presentAnnotationFrame(
    bottomEdge,
    { kind: 'symbol', symbol: 'flourish', placement: 'below' },
    { progress: 1, seed: 22, viewport },
  );

  assert.equal(before.placement, 'before');
  assert.equal(above.placement, 'above');
  for (let frame of [before, above]) {
    assert.equal(frame.safety.viewportCollision, false);
    assert.ok(frame.pathSamples.every((point) => point.x >= 0 && point.x <= viewport.width));
    assert.ok(frame.pathSamples.every((point) => point.y >= 0 && point.y <= viewport.height));
  }
  cursor.dispose();
});

test('deterministic annotation frame returns safety evidence for supplied obstacles', () => {
  let window = makeDom();
  let cursor = createPresenterCursor(window.document);
  let el = target(window.document, { left: 40, top: 60, width: 120, height: 30 });
  let obstacle = {
    id: 'captions',
    kind: 'caption',
    rect: { left: 20, top: 96, width: 180, height: 28 },
  };
  let frame = cursor.presentAnnotationFrame(
    el,
    { marker: 'underline' },
    {
      progress: 1,
      seed: 6,
      viewport: { width: 220, height: 180 },
      obstacles: [obstacle],
    },
  );

  assert.equal(frame.safety.safe, false);
  assert.deepEqual(frame.safety.collisions.map((collision) => collision.id), ['captions']);
  assert.equal(frame.safety.viewportCollision, false);
  cursor.dispose();
});

test('deterministic annotation frame renders every marker and symbol', () => {
  let window = makeDom();
  let cursor = createPresenterCursor(window.document);
  let el = target(window.document, { left: 180, top: 140, width: 100, height: 80 });

  for (let [index, marker] of PRESENTER_MARKERS.entries()) {
    let result = cursor.presentAnnotationFrame(el, { kind: 'marker', marker }, { progress: 1, seed: index + 1 });
    assert.equal(result.presented, true, marker);
    assert.equal(result.name, marker);
    assert.ok(result.pathPoints > 2, marker);
    assert.ok(inkPath(window.document).length > 10, marker);
  }
  for (let [index, symbol] of PRESENTER_SYMBOLS.entries()) {
    let result = cursor.presentAnnotationFrame(
      el,
      { kind: 'symbol', symbol, placement: 'over' },
      { progress: 1, seed: index + 20 },
    );
    assert.equal(result.presented, true, symbol);
    assert.equal(result.name, symbol);
    assert.ok(result.pathPoints > 2, symbol);
    assert.ok(inkPath(window.document).length > 10, symbol);
  }

  cursor.dispose();
});

test('every marker exposes a monotonic three-stage drawing path', () => {
  let window = makeDom();
  let cursor = createPresenterCursor(window.document);
  let el = target(window.document, { left: 180, top: 140, width: 120, height: 84 });

  for (let [index, marker] of PRESENTER_MARKERS.entries()) {
    let early = cursor.presentAnnotationFrame(el, { kind: 'marker', marker }, { progress: 0.25, seed: index + 31 });
    let middle = cursor.presentAnnotationFrame(el, { kind: 'marker', marker }, { progress: 0.55, seed: index + 31 });
    let complete = cursor.presentAnnotationFrame(el, { kind: 'marker', marker }, { progress: 1, seed: index + 31 });

    assert.ok(early.pathPoints > 2, marker);
    assert.ok(middle.pathPoints > early.pathPoints, marker);
    assert.ok(complete.pathPoints > middle.pathPoints, marker);
    assert.deepEqual(middle.pathSamples.slice(0, early.pathSamples.length), early.pathSamples, marker);
    assert.deepEqual(complete.pathSamples.slice(0, middle.pathSamples.length), middle.pathSamples, marker);
  }

  cursor.dispose();
});

test('presenter layers share one constant 30 FPS projector', () => {
  let firstTime = PRESENTER_FRAME_MS * 3 + 1;
  let sameFrameTime = PRESENTER_FRAME_MS * 4 - 1;
  let nextFrameTime = PRESENTER_FRAME_MS * 4 + 1;

  let focusLayers = {
    focus: {
      active: true,
      rect: { left: 20, top: 30, width: 540, height: 260 },
      duration: PRESENTER_FOCUS_REVEAL_DURATION_MS,
    },
  };
  let focusFirst = projectPresenterState(focusLayers, firstTime, 17);
  let focusSame = projectPresenterState(focusLayers, sameFrameTime, 17);
  let focusNext = projectPresenterState(focusLayers, nextFrameTime, 17);
  assert.deepEqual(focusSame.focus, focusFirst.focus);
  assert.notDeepEqual(focusNext.focus, focusFirst.focus);

  let cursorLayers = {
    cursor: { active: true, fromX: 10, fromY: 10, toX: 240, toY: 180, duration: 850 },
  };
  let cursorFirst = projectPresenterState(cursorLayers, firstTime, 17);
  let cursorSame = projectPresenterState(cursorLayers, sameFrameTime, 17);
  let cursorNext = projectPresenterState(cursorLayers, nextFrameTime, 17);
  assert.deepEqual(cursorSame.cursor, cursorFirst.cursor);
  assert.notDeepEqual(cursorNext.cursor, cursorFirst.cursor);

  let markerLayers = {
    marker: {
      active: true,
      name: 'oval',
      rect: { left: 20, top: 30, width: 540, height: 260 },
      duration: PRESENTER_ANNOTATION_DURATION_MS,
    },
  };
  let markerFirst = projectPresenterState(markerLayers, firstTime, 17);
  let markerSame = projectPresenterState(markerLayers, sameFrameTime, 17);
  let markerNext = projectPresenterState(markerLayers, nextFrameTime, 17);
  assert.deepEqual(markerSame.marker, markerFirst.marker);
  assert.notDeepEqual(markerNext.marker, markerFirst.marker);

  let symbolLayers = {
    symbol: {
      active: true,
      name: 'check',
      rect: { left: 20, top: 30, width: 540, height: 260 },
      duration: PRESENTER_ANNOTATION_DURATION_MS,
    },
  };
  let symbolFirst = projectPresenterState(symbolLayers, firstTime, 17);
  let symbolSame = projectPresenterState(symbolLayers, sameFrameTime, 17);
  let symbolNext = projectPresenterState(symbolLayers, nextFrameTime, 17);
  assert.deepEqual(symbolSame.symbol, symbolFirst.symbol);
  assert.notDeepEqual(symbolNext.symbol, symbolFirst.symbol);

  let clickLayers = { click: { active: true, x: 240, y: 180 } };
  let clickFirst = projectPresenterState(clickLayers, firstTime, 17);
  let clickSame = projectPresenterState(clickLayers, sameFrameTime, 17);
  let clickNext = projectPresenterState(clickLayers, nextFrameTime, 17);
  assert.deepEqual(clickSame.click, clickFirst.click);
  assert.notDeepEqual(clickNext.click, clickFirst.click);
});

test('focus reveal stays monotonic and bounded in horizontal, vertical, and square frames', () => {
  let cases = [
    { viewport: { width: 1920, height: 1080 }, rect: { left: 240, top: 160, width: 880, height: 420 } },
    { viewport: { width: 1080, height: 1920 }, rect: { left: 90, top: 420, width: 760, height: 620 } },
    { viewport: { width: 1080, height: 1080 }, rect: { left: 140, top: 210, width: 720, height: 480 } },
  ];

  for (let { viewport, rect } of cases) {
    let layers = { focus: { active: true, rect, duration: PRESENTER_FOCUS_REVEAL_DURATION_MS } };
    let first = projectPresenterState(layers, 0, 11, viewport).focus;
    let middle = projectPresenterState(layers, PRESENTER_FOCUS_REVEAL_DURATION_MS / 2, 11, viewport).focus;
    let complete = projectPresenterState(layers, PRESENTER_FOCUS_REVEAL_DURATION_MS, 11, viewport).focus;

    assert.ok(first.width < middle.width && middle.width < complete.width);
    assert.ok(first.height < middle.height && middle.height < complete.height);
    assert.ok(first.revealProgress < middle.revealProgress && middle.revealProgress < complete.revealProgress);
    assert.equal(complete.width, rect.width);
    assert.equal(complete.height, rect.height);
    assert.equal(complete.dragHandle.visible, false);
    assert.ok(complete.left + complete.width <= viewport.width);
    assert.ok(complete.top + complete.height <= viewport.height);
  }
});

test('projectPresenterState resolves edge placement and exposes annotation safety', () => {
  let viewport = { width: 200, height: 140 };
  let frame = projectPresenterState({
    symbol: {
      active: true,
      name: 'check',
      rect: { left: 168, top: 48, width: 28, height: 28 },
      placement: 'after',
      obstacles: [{ id: 'left-rail', rect: { left: 100, top: 32, width: 36, height: 72 } }],
      duration: PRESENTER_ANNOTATION_DURATION_MS,
    },
  }, PRESENTER_ANNOTATION_DURATION_MS, 17, viewport);

  assert.equal(frame.symbol.placement, 'before');
  assert.equal(frame.annotation.placement, 'before');
  assert.deepEqual(frame.annotation.safety, frame.symbol.safety);
  assert.equal(frame.annotation.safety.safe, false);
  assert.deepEqual(frame.annotation.safety.collisions.map((collision) => collision.id), ['left-rail']);
  assert.equal(frame.annotation.safety.viewportCollision, false);
});

test('large annotation targets remain marker ink instead of becoming focus frames', () => {
  let frame = projectPresenterState({
    focus: { active: false },
    marker: {
      active: true,
      name: 'oval',
      rect: { left: 40, top: 40, width: 960, height: 420 },
      duration: PRESENTER_ANNOTATION_DURATION_MS,
    },
  }, 500, 9);

  assert.equal(frame.focus.visible, false);
  assert.equal(frame.marker.visible, true);
  assert.equal(frame.marker.name, 'oval');
  assert.match(frame.marker.path, /^M/);
});

test('deterministic annotation frame rejects hidden targets and is inert without a DOM', () => {
  let window = makeDom();
  let cursor = createPresenterCursor(window.document);
  let hidden = target(window.document, { left: 100, top: 100, width: 0, height: 0 });
  assert.deepEqual(
    cursor.presentAnnotationFrame(hidden, { marker: 'freehand' }, { progress: 1, seed: 1 }),
    { presented: false, reason: 'hidden-target' },
  );
  assert.deepEqual(
    createPresenterCursor(null).presentAnnotationFrame(null, { marker: 'freehand' }, { progress: 1, seed: 1 }),
    { presented: false, reason: 'unsupported' },
  );
  cursor.dispose();
});

test('deterministic click frame projects the shared ripple without firing a native click', () => {
  let window = makeDom();
  let cursor = createPresenterCursor(window.document);
  let el = target(window.document, { left: 120, top: 80, width: 80, height: 40 });
  let nativeClicks = 0;
  el.addEventListener('click', () => { nativeClicks += 1; });

  let start = cursor.presentClickFrame(el, { elapsedMs: 0, seed: 7 });
  let middle = cursor.presentClickFrame(el, { elapsedMs: 200, seed: 7 });
  let repeated = cursor.presentClickFrame(el, { elapsedMs: 200, seed: 7 });
  let finished = cursor.presentClickFrame(el, { elapsedMs: PRESENTER_CLICK_DURATION_MS + 1, seed: 7 });
  let halo = window.document.querySelector('.pc-click');

  assert.equal(start.presented, true);
  assert.equal(start.visible, true);
  assert.deepEqual(start.hotspot, { x: 160, y: 100 });
  assert.ok(middle.scale > start.scale);
  assert.deepEqual(repeated, middle);
  assert.equal(finished.presented, true);
  assert.equal(finished.visible, false);
  assert.equal(halo.style.display, 'none');
  assert.equal(nativeClicks, 0);
  cursor.dispose();
});

test('deterministic click frame rejects hidden targets and is inert without a DOM', () => {
  let window = makeDom();
  let cursor = createPresenterCursor(window.document);
  let hidden = target(window.document, { left: 100, top: 100, width: 0, height: 0 });
  assert.deepEqual(
    cursor.presentClickFrame(hidden, { elapsedMs: 0 }),
    { presented: false, reason: 'hidden-target' },
  );
  assert.deepEqual(
    createPresenterCursor(null).presentClickFrame(null, { elapsedMs: 0 }),
    { presented: false, reason: 'unsupported' },
  );
  cursor.dispose();
});

test('projectPresenterState throws when asked to project mutually exclusive active layers simultaneously', () => {
  let layers = {
    marker: { active: true, name: 'oval', rect: { left: 20, top: 30, width: 540, height: 260 } },
    symbol: { active: true, name: 'check', rect: { left: 20, top: 30, width: 540, height: 260 } },
  };
  assert.throws(() => {
    projectPresenterState(layers, 0, 1);
  }, (err) => {
    assert.match(err.message, /Mutually exclusive emphasis layers/);
    assert.equal(err.diagnostics.error, 'Mutually exclusive emphasis layers active simultaneously');
    assert.deepEqual(err.diagnostics.marker, layers.marker);
    assert.deepEqual(err.diagnostics.symbol, layers.symbol);
    return true;
  });
});

test('projectPresenterState throws on focus+marker simultaneously', () => {
  let layers = {
    focus: { active: true, rect: { left: 20, top: 30, width: 540, height: 260 } },
    marker: { active: true, name: 'oval', rect: { left: 20, top: 30, width: 540, height: 260 } },
  };
  assert.throws(() => {
    projectPresenterState(layers, 0, 1);
  }, (err) => {
    assert.equal(err.code, 'ERR_MUTUALLY_EXCLUSIVE_LAYERS');
    assert.deepEqual(err.diagnostics.activeLayers, ['focus', 'marker']);
    return true;
  });
});

test('projectPresenterState throws on focus+symbol simultaneously', () => {
  let layers = {
    focus: { active: true, rect: { left: 20, top: 30, width: 540, height: 260 } },
    symbol: { active: true, name: 'check', rect: { left: 20, top: 30, width: 540, height: 260 } },
  };
  assert.throws(() => {
    projectPresenterState(layers, 0, 1);
  }, (err) => {
    assert.equal(err.code, 'ERR_MUTUALLY_EXCLUSIVE_LAYERS');
    assert.deepEqual(err.diagnostics.activeLayers, ['focus', 'symbol']);
    return true;
  });
});

test('projectPresenterState throws on marker+symbol simultaneously', () => {
  let layers = {
    marker: { active: true, name: 'oval', rect: { left: 20, top: 30, width: 540, height: 260 } },
    symbol: { active: true, name: 'check', rect: { left: 20, top: 30, width: 540, height: 260 } },
  };
  assert.throws(() => {
    projectPresenterState(layers, 0, 1);
  }, (err) => {
    assert.equal(err.code, 'ERR_MUTUALLY_EXCLUSIVE_LAYERS');
    assert.deepEqual(err.diagnostics.activeLayers, ['marker', 'symbol']);
    return true;
  });
});

test('projectPresenterState future-start does not trigger mutual exclusion or projection', () => {
  let layers = {
    focus: { active: true, rect: { left: 20, top: 30, width: 540, height: 260 }, startMs: 100 },
    marker: { active: true, name: 'oval', rect: { left: 20, top: 30, width: 540, height: 260 }, startMs: 0 },
  };

  let frame0 = projectPresenterState(layers, 0, 1);
  assert.equal(frame0.focus.visible, false);
  assert.equal(frame0.marker.visible, true);

  assert.throws(() => {
    projectPresenterState(layers, 100, 1);
  }, (err) => {
    assert.equal(err.code, 'ERR_MUTUALLY_EXCLUSIVE_LAYERS');
    return true;
  });
});

test('projectPresenterState treats adjacent cursor travel and focus reveal as sequential phases', () => {
  let layers = {
    cursor: {
      active: true,
      fromX: 0,
      fromY: 0,
      toX: 100,
      toY: 100,
      duration: 300,
    },
    focus: {
      active: true,
      rect: { left: 10, top: 10, width: 100, height: 100 },
      startMs: 300,
      duration: 300,
    },
  };

  let travel = projectPresenterState(layers, 150, 1);
  assert.equal(travel.cursor.motorActive, true);
  assert.equal(travel.focus.visible, false);

  let boundary = projectPresenterState(layers, 300, 1);
  assert.equal(boundary.cursor.motorActive, false);
  assert.equal(boundary.focus.motorActive, true);

  let reveal = projectPresenterState(layers, 450, 1);
  assert.equal(reveal.cursor.motorActive, false);
  assert.equal(reveal.focus.motorActive, true);
});

test('projectPresenterState idle-cursor remains visible', () => {
  let layers = {
    cursor: { active: true, x: 100, y: 100, duration: 1000 },
  };
  let frame = projectPresenterState(layers, 0, 1);
  assert.equal(frame.cursor.visible, true);
  assert.equal(frame.cursor.x, 100);
  assert.equal(frame.cursor.y, 100);

  let layersTravel = {
    cursor: { active: true, fromX: 0, fromY: 0, toX: 100, toY: 100, duration: 500 },
  };
  let frameActive = projectPresenterState(layersTravel, 250, 1);
  assert.equal(frameActive.cursor.visible, true);

  let frameCompleted = projectPresenterState(layersTravel, 600, 1);
  assert.equal(frameCompleted.cursor.visible, true);
  assert.equal(frameCompleted.cursor.x, 100);
  assert.equal(frameCompleted.cursor.y, 100);
});

test('projectPresenterState rejects pair conflicts', () => {
  let phases = {
    focus: { active: true, rect: { left: 10, top: 10, width: 100, height: 100 }, duration: 600 },
    marker: { active: true, name: 'underline', rect: { left: 10, top: 10, width: 100, height: 100 }, duration: 600 },
    symbol: { active: true, name: 'check', rect: { left: 10, top: 10, width: 100, height: 100 }, duration: 600 },
    cursor: { active: true, fromX: 0, fromY: 0, toX: 100, toY: 100, duration: 600 },
    click: { active: true, x: 50, y: 50 }
  };
  let keys = Object.keys(phases);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      let layers = {
        [keys[i]]: phases[keys[i]],
        [keys[j]]: phases[keys[j]]
      };
      assert.throws(() => {
        projectPresenterState(layers, 100, 1);
      }, (err) => {
        assert.equal(err.code, 'ERR_MUTUALLY_EXCLUSIVE_LAYERS');
        let expectedOrder = [keys[i], keys[j]].sort();
        assert.deepEqual(err.diagnostics.activeLayers, expectedOrder);
        return true;
      });
    }
  }
});

test('projectPresenterState allows completed-residue coexistence', () => {
  let layers = {
    focus: { active: true, rect: { left: 10, top: 10, width: 100, height: 100 }, duration: 100 },
    marker: { active: true, name: 'underline', rect: { left: 10, top: 10, width: 100, height: 100 }, duration: 100 },
    cursor: { active: true, fromX: 0, fromY: 0, toX: 100, toY: 100, duration: 100 }
  };
  let frame = projectPresenterState(layers, 200, 1);
  assert.equal(frame.focus.visible, true);
  assert.equal(frame.focus.motorActive, false);
  assert.equal(frame.marker.visible, true);
  assert.equal(frame.marker.motorActive, false);
  assert.equal(frame.cursor.visible, true);
  assert.equal(frame.cursor.motorActive, false);

  layers.symbol = { active: true, name: 'check', rect: { left: 20, top: 20, width: 50, height: 50 }, duration: 100, startMs: 200 };
  let frameCoexist = projectPresenterState(layers, 250, 1);
  assert.equal(frameCoexist.symbol.visible, true);
  assert.equal(frameCoexist.symbol.motorActive, true);
  assert.equal(frameCoexist.focus.visible, true);
  assert.equal(frameCoexist.focus.motorActive, false);
  assert.equal(frameCoexist.marker.visible, true);
  assert.equal(frameCoexist.marker.motorActive, false);
  assert.equal(frameCoexist.cursor.visible, true);
  assert.equal(frameCoexist.cursor.motorActive, false);
});

test('projectPresenterState visible-idle-cursor shows cursor at endpoint or custom position', () => {
  let layers = {
    cursor: { active: true, x: 150, y: 250 }
  };
  let frameIdle = projectPresenterState(layers, 0, 1);
  assert.equal(frameIdle.cursor.visible, true);
  assert.equal(frameIdle.cursor.x, 150);
  assert.equal(frameIdle.cursor.y, 250);

  let layersTravel = {
    cursor: { active: true, fromX: 0, fromY: 0, toX: 100, toY: 100, duration: 500 }
  };
  let frameCompleted = projectPresenterState(layersTravel, 600, 1);
  assert.equal(frameCompleted.cursor.visible, true);
  assert.equal(frameCompleted.cursor.x, 100);
  assert.equal(frameCompleted.cursor.y, 100);
});
