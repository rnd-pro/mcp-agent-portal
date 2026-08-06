import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';
import {
  createPresenterCursor,
  normalizePresenterAnnotation,
  normalizePresenterMarker,
  normalizePresenterSymbol,
  PRESENTER_FRAME_MS,
  playCursorScenario,
  resolvePresenterHighlightRect,
  resolvePresenterTravelDuration,
  resolvePresenterVisibleRect,
} from '../chat/presenter-cursor.js';

/**
 * Fake cursor: records every `moveTo` element (and the opts it was given) plus
 * `clear` calls, so a test can assert what the scenario player drove without a
 * real DOM. It also honors the gesture-settled contract: when a move carries a
 * gesture it records the gesture name and (by default) reports settlement
 * synchronously, standing in for a real flourish so the player can advance. Pass
 * `{ settleGesture: false }` to leave a gesture pending (e.g. to exercise the
 * watchdog or abort paths).
 */
function makeFakeCursor({ settleGesture = true } = {}) {
  let cursor = {
    moves: [],
    clicks: [],
    gestures: [],
    markers: [],
    clearCount: 0,
    moveTo(el, opts) {
      cursor.moves.push({ el, opts });
      if (opts && typeof opts.gesture === 'string') {
        cursor.gestures.push(opts.gesture);
      }
      if (opts && typeof opts.marker === 'string') {
        cursor.markers.push(opts.marker);
      }
      if (settleGesture && opts && typeof opts.onGestureSettled === 'function') {
        opts.onGestureSettled();
      }
    },
    clear() {
      cursor.clearCount += 1;
    },
    annotateElement(el, opts) {
      cursor.moves.push({ el, opts, annotation: true });
      if (opts && typeof opts.gesture === 'string') {
        cursor.gestures.push(opts.gesture);
      }
      if (opts && typeof opts.marker === 'string') {
        cursor.markers.push(opts.marker);
      }
      if (settleGesture && opts && typeof opts.onGestureSettled === 'function') {
        opts.onGestureSettled();
      }
    },
    clickElement(el, opts) {
      cursor.clicks.push({ el, opts });
      if (settleGesture && opts && typeof opts.onGestureSettled === 'function') {
        opts.onGestureSettled();
      }
    },
  };
  return cursor;
}

/**
 * Fake resolveTarget: maps an agent-authored string target to a stand-in
 * "element" object, recording the order targets were resolved. Unknown targets
 * resolve to null so the player skips the move.
 */
function makeFakeResolver(map = {}) {
  let resolver = {
    resolved: [],
    resolve(target) {
      resolver.resolved.push(target);
      return Object.prototype.hasOwnProperty.call(map, target) ? map[target] : null;
    },
  };
  return resolver;
}

function makePresenterDom(frameStepMs = 1000) {
  let { window } = parseHTML('<!doctype html><html><body></body></html>');
  let now = 0;
  Object.defineProperty(window, 'performance', {
    configurable: true,
    value: { now: () => now },
  });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
  window.requestAnimationFrame = (cb) => {
    now += frameStepMs;
    return setTimeout(() => cb(now), 0);
  };
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  window.getComputedStyle = (el) => ({
    overflow: el.style?.overflow || 'visible',
    overflowX: el.style?.overflowX || el.style?.overflow || 'visible',
    overflowY: el.style?.overflowY || el.style?.overflow || 'visible',
    clipPath: el.style?.clipPath || 'none',
    contain: el.style?.contain || '',
  });
  return window;
}

function boxElement(document, rect) {
  let el = document.createElement('button');
  el.getBoundingClientRect = () => ({
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    ...rect,
  });
  document.body.appendChild(el);
  return el;
}

function nextFrame() {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

test('playCursorScenario visits each step target in order', async () => {
  let cursor = makeFakeCursor();
  let elA = { id: 'a' };
  let elB = { id: 'b' };
  let elC = { id: 'c' };
  let resolver = makeFakeResolver({ a: elA, b: elB, c: elC });

  let scenario = {
    steps: [{ target: 'a' }, { target: 'b' }, { target: 'c' }],
  };

  await playCursorScenario(cursor, scenario, {
    resolveTarget: resolver.resolve,
    defaultHoldMs: 0,
  });

  assert.deepEqual(resolver.resolved, ['a', 'b', 'c']);
  assert.deepEqual(
    cursor.moves.map((m) => m.el),
    [elA, elB, elC],
  );
});

test('normalizePresenterMarker accepts marker aliases and rejects unknown values', () => {
  assert.equal(normalizePresenterMarker('circle'), 'oval');
  assert.equal(normalizePresenterMarker('marker'), 'oval');
  assert.equal(normalizePresenterMarker('highlight'), '');
  assert.equal(normalizePresenterMarker('brackets'), '');
  assert.equal(normalizePresenterMarker('diagonal'), '');
  assert.equal(normalizePresenterMarker('missing'), '');
  assert.equal(normalizePresenterMarker('missing', 'underline'), 'underline');
});

test('normalizePresenterAnnotation separates semantic marks from cursor focus', () => {
  assert.equal(normalizePresenterSymbol('?'), 'question');
  assert.equal(normalizePresenterSymbol('x'), 'cross');
  assert.deepEqual(normalizePresenterAnnotation({ intent: 'detail' }), {
    kind: 'marker',
    intent: 'detail',
    marker: 'underline',
    placement: 'over',
  });
  assert.deepEqual(normalizePresenterAnnotation({ intent: 'question' }), {
    kind: 'symbol',
    intent: 'question',
    symbol: 'question',
    placement: 'after',
  });
  assert.deepEqual(normalizePresenterAnnotation({ symbol: 'heart' }), {
    kind: 'symbol',
    intent: '',
    symbol: 'heart',
    placement: 'after',
  });
  assert.equal(normalizePresenterAnnotation({ kind: 'symbol', symbol: 'not-a-symbol' }), null);
});

test('playCursorScenario fires onStep(step, index) once per step', async () => {
  let cursor = makeFakeCursor();
  let resolver = makeFakeResolver({ a: { id: 'a' }, b: { id: 'b' } });
  let seen = [];

  let scenario = {
    steps: [
      { target: 'a', label: 'first' },
      { target: 'b', label: 'second' },
    ],
  };

  await playCursorScenario(cursor, scenario, {
    resolveTarget: resolver.resolve,
    defaultHoldMs: 0,
    onStep: (step, index) => seen.push({ label: step.label, index }),
  });

  assert.deepEqual(seen, [
    { label: 'first', index: 0 },
    { label: 'second', index: 1 },
  ]);
});

test('playCursorScenario respects per-step holdMs', async () => {
  let cursor = makeFakeCursor();
  let resolver = makeFakeResolver({ a: { id: 'a' }, b: { id: 'b' } });
  let stamps = [];

  let scenario = {
    steps: [
      { target: 'a', holdMs: 40 },
      { target: 'b', holdMs: 0 },
    ],
  };

  let start = Date.now();
  await playCursorScenario(cursor, scenario, {
    resolveTarget: resolver.resolve,
    defaultHoldMs: 0,
    onStep: () => stamps.push(Date.now() - start),
  });

  // The first step holds ~40ms before its onStep; the second holds ~0ms after.
  assert.equal(stamps.length, 2);
  assert.ok(stamps[0] >= 35, `expected first onStep after the hold, got ${stamps[0]}ms`);
  assert.ok(stamps[1] - stamps[0] < 35, `expected second onStep promptly, got ${stamps[1] - stamps[0]}ms`);
});

test('playCursorScenario uses defaultHoldMs when a step omits holdMs', async () => {
  let cursor = makeFakeCursor();
  let resolver = makeFakeResolver({ a: { id: 'a' } });
  let elapsed = -1;

  let start = Date.now();
  await playCursorScenario(
    cursor,
    { steps: [{ target: 'a' }] },
    {
      resolveTarget: resolver.resolve,
      defaultHoldMs: 40,
      onStep: () => {
        elapsed = Date.now() - start;
      },
    },
  );

  assert.ok(elapsed >= 35, `expected the default hold to apply, got ${elapsed}ms`);
});

test('playCursorScenario skips moveTo for unresolved targets but still fires onStep', async () => {
  let cursor = makeFakeCursor();
  let elB = { id: 'b' };
  let resolver = makeFakeResolver({ b: elB }); // 'a' resolves to null
  let seen = [];

  let scenario = {
    steps: [{ target: 'a' }, { target: 'b' }],
  };

  await playCursorScenario(cursor, scenario, {
    resolveTarget: resolver.resolve,
    defaultHoldMs: 0,
    onStep: (step, index) => seen.push(index),
  });

  // Only the resolvable step drives the cursor.
  assert.deepEqual(
    cursor.moves.map((m) => m.el),
    [elB],
  );
  // Both steps report through onStep, in order.
  assert.deepEqual(seen, [0, 1]);
});

test('playCursorScenario passes gesture and label through to the cursor opts', async () => {
  let cursor = makeFakeCursor();
  let resolver = makeFakeResolver({ a: { id: 'a' } });

  await playCursorScenario(
    cursor,
    { steps: [{ target: 'a', gesture: 'oval', label: 'intro' }] },
    { resolveTarget: resolver.resolve, defaultHoldMs: 0 },
  );

  assert.equal(cursor.moves.length, 1);
  assert.equal(cursor.moves[0].opts.gesture, 'oval');
  assert.equal(cursor.moves[0].opts.label, 'intro');
});

test('playCursorScenario passes marker through to the cursor opts', async () => {
  let cursor = makeFakeCursor();
  let resolver = makeFakeResolver({ a: { id: 'a' } });

  await playCursorScenario(
    cursor,
    { steps: [{ target: 'a', marker: 'freehand', label: 'intro' }] },
    { resolveTarget: resolver.resolve, defaultHoldMs: 0 },
  );

  assert.equal(cursor.moves.length, 1);
  assert.equal(cursor.moves[0].opts.marker, 'freehand');
  assert.equal(cursor.moves[0].opts.gesture, 'freehand');
  assert.equal(cursor.moves[0].opts.label, 'intro');
  assert.deepEqual(cursor.markers, ['freehand']);
});

test('playCursorScenario routes marker-only steps through semantic annotation when available', async () => {
  let annotated = [];
  let cursor = {
    moves: [],
    annotateElement(el, opts) {
      annotated.push({ el, opts });
      opts?.onGestureSettled?.();
    },
    moveTo(el, opts) {
      cursor.moves.push({ el, opts });
    },
  };
  let elA = { id: 'a' };
  let resolver = makeFakeResolver({ a: elA });

  await playCursorScenario(
    cursor,
    { steps: [{ target: 'a', gesture: 'underline', label: 'detail' }] },
    { resolveTarget: resolver.resolve, defaultHoldMs: 0 },
  );

  assert.deepEqual(cursor.moves, []);
  assert.equal(annotated.length, 1);
  assert.equal(annotated[0].el, elA);
  assert.equal(annotated[0].opts.kind, 'marker');
  assert.equal(annotated[0].opts.marker, 'underline');
  assert.equal(annotated[0].opts.label, 'detail');
});

test('playCursorScenario drives click steps through clickElement', async () => {
  let cursor = makeFakeCursor();
  let elA = { id: 'a' };
  let elB = { id: 'b' };
  let resolver = makeFakeResolver({ a: elA, b: elB });

  await playCursorScenario(
    cursor,
    { steps: [{ target: 'a', action: 'click', label: 'open' }, { target: 'b', click: true }] },
    { resolveTarget: resolver.resolve, defaultHoldMs: 0 },
  );

  assert.deepEqual(cursor.moves, []);
  assert.deepEqual(cursor.clicks.map((entry) => entry.el), [elA, elB]);
  assert.equal(cursor.clicks[0].opts.label, 'open');
});

test('playCursorScenario preserves click action IDs across replay', async () => {
  let actions = new Map();
  let invocations = [];
  let fired = 0;
  let cursor = {
    moveTo() {},
    clickElement(el, opts) {
      invocations.push({ el, actionId: opts.actionId });
      if (actions.has(opts.actionId)) return actions.get(opts.actionId);
      fired += 1;
      opts.onGestureSettled();
      let action = Promise.resolve({ actionId: opts.actionId, fired: true });
      actions.set(opts.actionId, action);
      return action;
    },
  };
  let el = { id: 'open' };
  let scenario = {
    steps: [{ target: 'open', action: 'click', actionId: 'open-workspace', holdMs: 0 }],
  };
  let options = { resolveTarget: () => el, defaultHoldMs: 0 };

  await playCursorScenario(cursor, scenario, options);
  await playCursorScenario(cursor, scenario, options);

  assert.deepEqual(invocations.map((entry) => entry.actionId), [
    'open-workspace',
    'open-workspace',
  ]);
  assert.equal(fired, 1);
});

test('playCursorScenario runs a step gesture and keeps step order', async () => {
  let cursor = makeFakeCursor();
  let resolver = makeFakeResolver({ a: { id: 'a' }, b: { id: 'b' }, c: { id: 'c' } });
  let seen = [];

  let scenario = {
    steps: [
      { target: 'a', gesture: 'oval', label: 'one' },
      { target: 'b', label: 'two' }, // no gesture
      { target: 'c', gesture: 'underline', label: 'three' },
    ],
  };

  await playCursorScenario(cursor, scenario, {
    resolveTarget: resolver.resolve,
    defaultHoldMs: 0,
    onStep: (step, index) => seen.push({ index, gesture: step.gesture || null }),
  });

  // Every gesture fired through the cursor's gesture path, in order.
  assert.deepEqual(cursor.gestures, ['oval', 'underline']);
  // The cursor still visited each target in order.
  assert.deepEqual(
    cursor.moves.map((m) => m.el.id),
    ['a', 'b', 'c'],
  );
  // The scenario completed in order, gesture steps included.
  assert.deepEqual(seen, [
    { index: 0, gesture: 'oval' },
    { index: 1, gesture: null },
    { index: 2, gesture: 'underline' },
  ]);
});

test('playCursorScenario waits for a slow gesture before advancing', async () => {
  // A cursor whose gesture settles asynchronously: the player must hold the step
  // open until settlement, so the next step does not start mid-flourish.
  let order = [];
  let cursor = {
    moves: [],
    moveTo(el, opts) {
      cursor.moves.push(el);
      order.push(`move:${el.id}`);
      if (opts && typeof opts.gesture === 'string' && typeof opts.onGestureSettled === 'function') {
        // Settle a tick later, after the (zero) hold would otherwise advance.
        setTimeout(() => {
          order.push(`gesture-done:${el.id}`);
          opts.onGestureSettled();
        }, 30);
      }
    },
    clear() {},
  };
  let resolver = makeFakeResolver({ a: { id: 'a' }, b: { id: 'b' } });

  await playCursorScenario(
    cursor,
    { steps: [{ target: 'a', gesture: 'circle', holdMs: 0 }, { target: 'b', holdMs: 0 }] },
    {
      resolveTarget: resolver.resolve,
      defaultHoldMs: 0,
      onStep: (_step, index) => order.push(`step:${index}`),
    },
  );

  // The gesture on 'a' completed before the cursor moved to 'b'.
  assert.deepEqual(order, ['move:a', 'gesture-done:a', 'step:0', 'move:b', 'step:1']);
});

test('playCursorScenario does not stall when a gesture never settles', async () => {
  // A cursor that ignores onGestureSettled must not hang the run: the watchdog
  // cap lets the step advance. (Kept well under the cap via abort.)
  let cursor = makeFakeCursor({ settleGesture: false });
  let resolver = makeFakeResolver({ a: { id: 'a' }, b: { id: 'b' } });
  let controller = new AbortController();
  let seen = [];

  // Abort shortly after the run starts so the never-settling gesture wait ends
  // via the abort branch rather than the multi-second watchdog.
  let timer = setTimeout(() => controller.abort(), 20);

  await playCursorScenario(
    cursor,
    { steps: [{ target: 'a', gesture: 'oval', holdMs: 0 }, { target: 'b' }] },
    { resolveTarget: resolver.resolve, signal: controller.signal, defaultHoldMs: 0 },
  );
  clearTimeout(timer);

  // The gesture name was still recorded, and the run stopped at the aborted step.
  assert.deepEqual(cursor.gestures, ['oval']);
  assert.deepEqual(
    cursor.moves.map((m) => m.el.id),
    ['a'],
  );
  assert.deepEqual(seen, []);
});

test('playCursorScenario does nothing when already aborted', async () => {
  let cursor = makeFakeCursor();
  let resolver = makeFakeResolver({ a: { id: 'a' } });
  let controller = new AbortController();
  controller.abort();

  await playCursorScenario(
    cursor,
    { steps: [{ target: 'a' }] },
    { resolveTarget: resolver.resolve, signal: controller.signal, defaultHoldMs: 0 },
  );

  assert.equal(cursor.moves.length, 0);
  assert.equal(resolver.resolved.length, 0);
  assert.equal(cursor.clearCount, 1);
});

test('AbortSignal stops further steps and ends the in-progress hold promptly', async () => {
  let cursor = makeFakeCursor();
  let resolver = makeFakeResolver({ a: { id: 'a' }, b: { id: 'b' }, c: { id: 'c' } });
  let controller = new AbortController();
  let stepped = [];

  let scenario = {
    steps: [
      { target: 'a', holdMs: 5000 },
      { target: 'b', holdMs: 5000 },
      { target: 'c', holdMs: 5000 },
    ],
  };

  let start = Date.now();
  // Abort during the first step's long hold.
  let timer = setTimeout(() => controller.abort(), 20);

  await playCursorScenario(cursor, scenario, {
    resolveTarget: resolver.resolve,
    signal: controller.signal,
    onStep: (step, index) => stepped.push(index),
  });
  clearTimeout(timer);

  let took = Date.now() - start;
  // The 5s hold did not run to completion — the abort ended it promptly.
  assert.ok(took < 1000, `expected a prompt abort, took ${took}ms`);
  // Only the first step started; the run stopped before step two.
  assert.deepEqual(
    cursor.moves.map((m) => m.el.id),
    ['a'],
  );
  // Aborting during the hold means onStep for the interrupted step did not fire.
  assert.deepEqual(stepped, []);
  assert.ok(cursor.clearCount >= 1);
});

test('playCursorScenario tolerates an empty or missing scenario', async () => {
  let cursor = makeFakeCursor();
  let resolver = makeFakeResolver();

  await playCursorScenario(cursor, { steps: [] }, { resolveTarget: resolver.resolve });
  await playCursorScenario(cursor, {}, { resolveTarget: resolver.resolve });
  await playCursorScenario(cursor, undefined, { resolveTarget: resolver.resolve });

  assert.equal(cursor.moves.length, 0);
});

test('playCursorScenario is a clean no-op against a non-cursor', async () => {
  // No cursor / wrong shape: resolves without throwing.
  await assert.doesNotReject(
    playCursorScenario(null, { steps: [{ target: 'a' }] }, { resolveTarget: () => ({}) }),
  );
  await assert.doesNotReject(playCursorScenario({}, { steps: [{ target: 'a' }] }, {}));
});

test('createPresenterCursor returns inert no-ops with no document (Node import)', () => {
  let cursor = createPresenterCursor();
  assert.equal(cursor.isSupported(), false);
  // Every handle is a safe no-op in a non-browser env.
  assert.doesNotThrow(() => cursor.moveTo({ getBoundingClientRect: () => ({}) }));
  assert.doesNotThrow(() => cursor.annotateElement({ getBoundingClientRect: () => ({}) }, { intent: 'detail' }));
  assert.doesNotThrow(() => cursor.clear());
  assert.doesNotThrow(() => cursor.dispose());
});

test('annotateElement clears the focus marquee before drawing marker ink', async () => {
  let window = makePresenterDom();
  let cursor = createPresenterCursor(window.document);
  let el = boxElement(window.document, { left: 120, top: 80, width: 160, height: 64 });

  await cursor.moveTo(el, { animate: false });

  let overlay = window.document.querySelector('.symbiote-presenter-cursor');
  let marquee = window.document.querySelector('.pc-marquee');
  assert.ok(overlay.classList.contains('is-visible'));
  assert.equal(marquee.style.width, '180px');
  assert.equal(marquee.style.height, '84px');

  cursor.annotateElement(el, { marker: 'underline' });
  await nextFrame();

  assert.ok(overlay.classList.contains('is-visible'));
  assert.equal(marquee.style.width, '0px');
  assert.equal(marquee.style.height, '0px');
  assert.ok(marquee.classList.contains('pc-marquee-faded'));

  cursor.dispose();
});

test('annotateElement flips bottom-edge underlines and returns live safety evidence', async () => {
  let window = makePresenterDom();
  let cursor = createPresenterCursor(window.document);
  let el = boxElement(window.document, { left: 120, top: 562, width: 160, height: 28 });
  let obstacle = {
    id: 'captions',
    kind: 'caption',
    rect: { left: 100, top: 526, width: 200, height: 28 },
  };

  let receipt = await cursor.annotateElement(el, {
    marker: 'underline',
    obstacles: [obstacle],
  });

  assert.equal(receipt.status, 'settled');
  assert.equal(receipt.placement, 'above');
  assert.equal(receipt.safety.viewportCollision, false);
  assert.equal(receipt.safety.safe, false);
  assert.deepEqual(receipt.safety.collisions.map((collision) => collision.id), ['captions']);
  cursor.dispose();
});

test('clickElement fires one semantic click for duplicate action IDs', async () => {
  let window = makePresenterDom();
  let cursor = createPresenterCursor(window.document);
  let el = boxElement(window.document, { left: 120, top: 80, width: 160, height: 64 });
  let clickCount = 0;
  el.click = () => { clickCount += 1; };

  let first = cursor.clickElement(el, { actionId: 'open-workspace' });
  let duplicate = cursor.clickElement(el, { actionId: 'open-workspace' });
  assert.ok(window.document.querySelector('.symbiote-presenter-cursor').classList.contains('is-visible'));
  assert.equal(duplicate, first);

  let receipt = await first;
  assert.equal(receipt.fired, true);
  assert.equal(clickCount, 1);
  cursor.dispose();
});

test('clearing a pending click prevents the semantic action from firing', async () => {
  let window = makePresenterDom();
  let cursor = createPresenterCursor(window.document);
  let el = boxElement(window.document, { left: 500, top: 420, width: 120, height: 40 });
  let clickCount = 0;
  el.click = () => { clickCount += 1; };

  let pending = cursor.clickElement(el, { actionId: 'cancelled-click' });
  cursor.clear();
  let receipt = await pending;

  assert.equal(receipt.status, 'aborted');
  assert.equal(receipt.fired, false);
  assert.equal(clickCount, 0);
  cursor.dispose();
});

test('resolvePresenterVisibleRect clips large targets to viewport and scroll containers', () => {
  let window = makePresenterDom();
  let { document } = window;
  let scroller = boxElement(document, { left: 100, top: 90, width: 220, height: 150 });
  scroller.style.overflow = 'auto';
  let target = document.createElement('section');
  target.getBoundingClientRect = () => ({
    left: 80,
    top: 70,
    right: 580,
    bottom: 520,
    width: 500,
    height: 450,
  });
  scroller.appendChild(target);

  assert.deepEqual(resolvePresenterVisibleRect(target, { width: 400, height: 300 }), {
    left: 100,
    top: 90,
    right: 320,
    bottom: 240,
    width: 220,
    height: 150,
  });
});

test('moveTo draws the focus frame around only the visible part of a scrollable target', async () => {
  let window = makePresenterDom();
  let { document } = window;
  let scroller = boxElement(document, { left: 100, top: 90, width: 220, height: 150 });
  scroller.style.overflow = 'auto';
  let target = document.createElement('section');
  target.getBoundingClientRect = () => ({
    left: 80,
    top: 70,
    right: 580,
    bottom: 520,
    width: 500,
    height: 450,
  });
  scroller.appendChild(target);

  let cursor = createPresenterCursor(document);
  await cursor.moveTo(target);

  let marquee = document.querySelector('.pc-marquee');
  assert.ok(document.querySelector('.symbiote-presenter-cursor').classList.contains('is-visible'));
  assert.equal(marquee.style.transform, 'translate(90px, 80px)');
  assert.equal(marquee.style.width, '240px');
  assert.equal(marquee.style.height, '170px');
  cursor.dispose();
});

test('live cursor, focus, marker, and symbol phases remain serialized at 30 FPS', async () => {
  let window = makePresenterDom(PRESENTER_FRAME_MS);
  let cursor = createPresenterCursor(window.document);
  let el = boxElement(window.document, { left: 180, top: 140, width: 180, height: 72 });

  let focusReceipt = await cursor.moveTo(el);
  let markerReceipt = await cursor.annotateElement(el, { marker: 'underline' });
  let symbolReceipt = await cursor.annotateElement(el, { kind: 'symbol', symbol: 'check' });

  assert.equal(focusReceipt.status, 'settled');
  assert.equal(markerReceipt.status, 'settled');
  assert.equal(symbolReceipt.status, 'settled');
  assert.equal(window.document.querySelector('.pc-cursor').style.opacity, '1');
  cursor.dispose();
});

test('resolvePresenterHighlightRect expands targets away from viewport edges', () => {
  assert.deepEqual(
    resolvePresenterHighlightRect({ left: 100, top: 80, width: 120, height: 40 }, { width: 500, height: 400 }),
    { left: 90, top: 70, width: 140, height: 60 },
  );
});

test('resolvePresenterHighlightRect keeps edge targets inset from the viewport', () => {
  assert.deepEqual(
    resolvePresenterHighlightRect({ left: 0, top: 2, width: 120, height: 40 }, { width: 500, height: 400 }),
    { left: 8, top: 8, width: 122, height: 44 },
  );
  assert.deepEqual(
    resolvePresenterHighlightRect({ left: 460, top: 370, width: 80, height: 50 }, { width: 500, height: 400 }),
    { left: 450, top: 360, width: 42, height: 32 },
  );
});

test('resolvePresenterTravelDuration uses human-paced cursor travel bounds', () => {
  assert.equal(resolvePresenterTravelDuration(0), 850);
  assert.ok(Math.abs(resolvePresenterTravelDuration(500) - 1176.67) < 0.01);
  assert.equal(resolvePresenterTravelDuration(2000), 1600);
});

test('createPresenterCursor drives a scenario end to end through the real player', async () => {
  // The inert cursor still satisfies the player contract, so the scenario layer
  // is exercised against the real createPresenterCursor in Node.
  let cursor = createPresenterCursor();
  let elements = { a: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }) } };
  let seen = [];

  await playCursorScenario(
    cursor,
    { steps: [{ target: 'a' }] },
    {
      resolveTarget: (target) => elements[target] || null,
      defaultHoldMs: 0,
      onStep: (_step, index) => seen.push(index),
    },
  );

  assert.deepEqual(seen, [0]);
});
