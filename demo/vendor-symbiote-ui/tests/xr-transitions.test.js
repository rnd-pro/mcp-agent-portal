import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE_REAL from 'three';

import { easeOutCubic, createXRScaleFadeTween } from '../xr/transitions.js';
import { createXRThreeSessionController } from '../xr/three-webxr-adapter.js';
import { createSpatialTarget } from './xr-spatial-fixtures.js';

const TRANSITION_DURATION_MS = 180;

function approx(actual, expected, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

function createTweenTarget() {
  return {
    scale: {
      x: 1,
      y: 1,
      z: 1,
      set(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
      },
    },
    material: { opacity: 1 },
  };
}

// --- easeOutCubic math ---

test('easeOutCubic hits its endpoints exactly and matches the cubic curve', () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  approx(easeOutCubic(0.5), 0.875);
});

test('easeOutCubic is monotonically non-decreasing over [0, 1]', () => {
  let previous = easeOutCubic(0);
  for (let step = 1; step <= 100; step += 1) {
    let current = easeOutCubic(step / 100);
    assert.ok(current >= previous, `easeOutCubic decreased at step ${step}`);
    previous = current;
  }
  assert.ok(easeOutCubic(0.999) > easeOutCubic(0.001));
});

test('easeOutCubic clamps out-of-range input and rejects non-finite input', () => {
  assert.equal(easeOutCubic(-0.25), 0);
  assert.equal(easeOutCubic(1.25), 1);
  assert.throws(() => easeOutCubic(Number.NaN), TypeError);
  assert.throws(() => easeOutCubic('0.5'), TypeError);
});

// --- createXRScaleFadeTween validation (fail-closed) ---

test('createXRScaleFadeTween rejects invalid options with TypeError', () => {
  let target = createTweenTarget();
  assert.throws(() => createXRScaleFadeTween(), TypeError);
  assert.throws(() => createXRScaleFadeTween({ object: null, durationMs: 100, from: 1, to: 0 }), TypeError);
  assert.throws(() => createXRScaleFadeTween({ object: target, durationMs: -1, from: 1, to: 0 }), TypeError);
  assert.throws(() => createXRScaleFadeTween({ object: target, durationMs: Number.NaN, from: 1, to: 0 }), TypeError);
  assert.throws(() => createXRScaleFadeTween({ object: target, durationMs: 100, from: Number.NaN, to: 0 }), TypeError);
  assert.throws(() => createXRScaleFadeTween({ object: target, durationMs: 100, from: {}, to: 0 }), TypeError);
  assert.throws(() => createXRScaleFadeTween({ object: target, durationMs: 100, from: 1, to: 0, onDone: 'done' }), TypeError);
});

test('createXRScaleFadeTween rejects mismatched channels and missing targets', () => {
  let target = createTweenTarget();
  assert.throws(
    () => createXRScaleFadeTween({ object: target, durationMs: 100, from: { scale: 1 }, to: { opacity: 1 } }),
    TypeError,
  );
  assert.throws(
    () => createXRScaleFadeTween({ object: { material: { opacity: 1 } }, durationMs: 100, from: 1, to: 0 }),
    TypeError,
  );
  assert.throws(
    () => createXRScaleFadeTween({ object: { material: [{ opacity: 1 }] }, durationMs: 100, from: { opacity: 0 }, to: { opacity: 1 } }),
    TypeError,
  );
});

// --- createXRScaleFadeTween ticking ---

test('tween applies from at creation and pumps to the exact final state', () => {
  let target = createTweenTarget();
  let doneCalls = 0;
  let tween = createXRScaleFadeTween({
    object: target,
    durationMs: 100,
    from: 1,
    to: 0.5,
    onDone: () => {
      doneCalls += 1;
    },
  });

  assert.equal(target.scale.x, 1);
  assert.equal(target.scale.y, 1);
  assert.equal(target.scale.z, 1);

  assert.equal(tween.tick(1000), false);
  assert.equal(target.scale.x, 1);

  assert.equal(tween.tick(1050), false);
  approx(target.scale.x, 1 + (0.5 - 1) * 0.875);
  approx(target.scale.y, target.scale.x);
  approx(target.scale.z, target.scale.x);

  assert.equal(tween.tick(1100), true);
  assert.equal(target.scale.x, 0.5);
  assert.equal(doneCalls, 1);
  assert.equal(tween.isDone(), true);
  assert.equal(tween.isCancelled(), false);
});

test('tween anchors its start time on the first tick', () => {
  let target = createTweenTarget();
  let tween = createXRScaleFadeTween({ object: target, durationMs: 100, from: 0, to: 1 });
  assert.equal(target.scale.x, 0);
  tween.tick(5000);
  assert.equal(target.scale.x, 0);
  tween.tick(5050);
  approx(target.scale.x, 0.875);
});

test('tween onDone fires exactly once across extra ticks', () => {
  let target = createTweenTarget();
  let doneCalls = 0;
  let tween = createXRScaleFadeTween({
    object: target,
    durationMs: 100,
    from: 1,
    to: 0.92,
    onDone: () => {
      doneCalls += 1;
    },
  });
  tween.tick(0);
  tween.tick(100);
  tween.tick(200);
  tween.tick(300);
  assert.equal(doneCalls, 1);
  assert.equal(tween.tick(400), true);
  assert.equal(doneCalls, 1);
  assert.equal(target.scale.x, 0.92);
});

test('tween cancel settles silently: no onDone and no further writes', () => {
  let target = createTweenTarget();
  let doneCalls = 0;
  let tween = createXRScaleFadeTween({
    object: target,
    durationMs: 100,
    from: 1,
    to: 0.5,
    onDone: () => {
      doneCalls += 1;
    },
  });
  tween.tick(0);
  tween.tick(50);
  let scaleAtCancel = target.scale.x;
  tween.cancel();
  assert.equal(tween.isCancelled(), true);
  assert.equal(tween.isDone(), false);
  assert.equal(tween.tick(100), true);
  assert.equal(target.scale.x, scaleAtCancel);
  assert.equal(doneCalls, 0);
});

test('tween with zero duration completes on the first tick', () => {
  let target = createTweenTarget();
  let doneCalls = 0;
  let tween = createXRScaleFadeTween({
    object: target,
    durationMs: 0,
    from: 1,
    to: 0.25,
    onDone: () => {
      doneCalls += 1;
    },
  });
  assert.equal(tween.tick(42), true);
  assert.equal(target.scale.x, 0.25);
  assert.equal(doneCalls, 1);
});

test('tween opacity channel writes only material.opacity and leaves scale alone', () => {
  let target = createTweenTarget();
  let tween = createXRScaleFadeTween({
    object: target,
    durationMs: 100,
    from: { opacity: 0 },
    to: { opacity: 1 },
  });
  assert.equal(target.material.opacity, 0);
  assert.equal(target.scale.x, 1);
  tween.tick(0);
  tween.tick(50);
  approx(target.material.opacity, 0.875);
  assert.equal(target.scale.x, 1);
  tween.tick(100);
  assert.equal(target.material.opacity, 1);
  assert.equal(target.scale.x, 1);
});

test('tween tick rejects non-finite time while unsettled', () => {
  let target = createTweenTarget();
  let tween = createXRScaleFadeTween({ object: target, durationMs: 100, from: 1, to: 0 });
  assert.throws(() => tween.tick(Number.NaN), TypeError);
});

// --- Three session controller harness (panelTransitions option) ---

async function createTransitionHarness(options = {}) {
  let source = {
    id: 'controller-right',
    handedness: 'right',
    targetRayMode: 'tracked-pointer',
    profiles: ['meta-quest-touch-plus'],
    targetRaySpace: {},
    gripSpace: {},
  };
  let sessionListeners = new Map();
  let session = {
    visibilityState: 'visible',
    enabledFeatures: ['local-floor'],
    inputSources: [source],
    frameRate: 90,
    addEventListener(type, listener) {
      sessionListeners.set(type, listener);
    },
    removeEventListener(type) {
      sessionListeners.delete(type);
    },
    async end() {
      sessionListeners.get('end')?.();
    },
  };
  let animationLoop = null;
  let controllers = [new THREE_REAL.Group(), new THREE_REAL.Group()];
  let renderer = {
    xr: {
      async setSession() {},
      getController(index) {
        return controllers[index];
      },
      setAnimationLoop(callback) {
        animationLoop = callback;
      },
    },
    render() {},
  };
  let sceneRoot = new THREE_REAL.Group();
  let mesh = new THREE_REAL.Mesh(
    new THREE_REAL.PlaneGeometry(0.8, 0.5),
    new THREE_REAL.MeshBasicMaterial(),
  );
  mesh.position.set(0, 1.4, -1);
  mesh.userData = {
    panelId: 'panel-a',
    xrSize: [0.8, 0.5],
    THREE: THREE_REAL,
    panel: {
      portable: true,
      pinned: false,
      focused: false,
      closable: true,
      revision: 0,
      sourceMetadata: {},
      size: [0.8, 0.5],
    },
    updatePanelFrameVisuals() {},
  };
  sceneRoot.add(mesh);

  let hit = null;
  let beginDragCalls = [];
  let draggingPanel = null;
  let controllerRays = {
    panelStore: null,
    receiptsList: null,
    getHits() {
      return hit ? [hit] : [];
    },
    beginDrag(controller, dragHit) {
      beginDragCalls.push(dragHit?.object?.userData?.panelId || null);
      draggingPanel = dragHit?.object?.userData?.panelId || null;
      return { ok: true };
    },
    updateDrag() {
      return { ok: false, reason: 'not-dragging' };
    },
    endDrag() {
      let panelId = draggingPanel;
      draggingPanel = null;
      return { ok: true, panelId };
    },
    getState() {
      return { dragging: draggingPanel !== null, panelId: draggingPanel };
    },
    getDiagnostics() {
      return {};
    },
  };
  let adapter = {
    THREE: THREE_REAL,
    async setSession(nextSession) {
      return { ok: true, session: nextSession, referenceSpace: {} };
    },
    listPanelMeshes() {
      return [mesh];
    },
    getPanelMesh(panelId) {
      return panelId === 'panel-a' ? mesh : null;
    },
    getSceneRoot() {
      return sceneRoot;
    },
    controllerRays,
    getDiagnostics() {
      return {};
    },
  };
  let receipts = [];
  let diagnosticEvents = [];
  let controller = createXRThreeSessionController({
    globalThis: {
      navigator: {
        xr: {
          async requestSession() {
            return session;
          },
        },
      },
    },
    adapter,
    THREE: THREE_REAL,
    onPortablePanelReceipt(receipt) {
      receipts.push(receipt);
    },
    onDiagnostic(event) {
      diagnosticEvents.push(event);
    },
  });
  let startOptions = {
    target: {
      ok: true,
      renderer,
      camera: new THREE_REAL.PerspectiveCamera(),
      scene: new THREE_REAL.Scene(),
    },
    controllerRayVisuals: false,
    panelHitReticle: false,
    renderFrame: false,
  };
  if (options.panelTransitions) {
    startOptions.panelTransitions = options.panelTransitions;
  }
  let started = await controller.start('immersive-ar', startOptions);
  assert.equal(started.ok, true);

  let committed = controller.commitSpatialEvidence({
    spatialTarget: createSpatialTarget(),
    sessionId: 'session-transitions',
    referenceSpaceId: 'reference-space-1',
    provenance: {
      runtimeId: 'three-webxr',
      runtimeVersion: '1.0.0',
      appId: 'transitions-test',
      buildHash: 'sha256:transitions-test',
      deviceId: 'quest-3',
      deviceKind: 'headset',
      emulation: 'native',
    },
    rootPolicy: {
      mode: 'world-locked',
      id: 'root-1',
      commitId: 'root-commit-1',
      matrix: new THREE_REAL.Matrix4().identity().toArray(),
    },
    spatialObjects: [{
      id: 'assembly',
      object: mesh,
      size: [0.2, 0.2, 0.01],
      visible: true,
      getState: () => 'ready',
    }],
    resolveInputSourceId: (candidate) => candidate.id,
  });
  assert.equal(committed.ok, true);

  function frame(time) {
    assert.equal(typeof animationLoop, 'function');
    animationLoop(time, {
      predictedDisplayTime: time,
      getViewerPose() {
        return null;
      },
      getPose() {
        return null;
      },
    });
  }

  function actionTarget(action) {
    return {
      version: 'xr-panel-frame-target-v1',
      panelId: 'panel-a',
      zone: 'action',
      action,
      operation: 'action',
      handle: null,
      point: { x: 0.5, y: 0.5 },
    };
  }

  function selectAction(object, action) {
    hit = {
      object,
      point: new THREE_REAL.Vector3(object.position.x, object.position.y, object.position.z),
      uv: null,
      frameTarget: actionTarget(action),
    };
    controllers[0].dispatchEvent({ type: 'selectstart', data: source });
    controllers[0].dispatchEvent({ type: 'selectend', data: source });
  }

  function selectDragTarget(object) {
    hit = {
      object,
      point: new THREE_REAL.Vector3(object.position.x, object.position.y, object.position.z),
      uv: null,
      frameTarget: {
        version: 'xr-panel-frame-target-v1',
        panelId: 'panel-a',
        zone: 'move',
        action: null,
        operation: 'move',
        handle: null,
        point: { x: 0.5, y: 0.5 },
      },
    };
    controllers[0].dispatchEvent({ type: 'selectstart', data: source });
  }

  function selectResizeDrag(object) {
    hit = {
      object,
      point: new THREE_REAL.Vector3(object.position.x, object.position.y, object.position.z),
      uv: null,
      frameTarget: {
        version: 'xr-panel-frame-target-v1',
        panelId: 'panel-a',
        zone: 'resize',
        action: null,
        operation: 'resize',
        handle: 'east',
        point: { x: 1, y: 0.5 },
      },
    };
    controllers[0].dispatchEvent({ type: 'selectstart', data: source });
    controllers[0].dispatchEvent({ type: 'selectend', data: source });
  }

  function findRestoreChip() {
    return sceneRoot.children.find((child) => child.userData?.snPanelRestoreChip === true) || null;
  }

  return {
    beginDragCalls,
    controller,
    diagnosticEvents,
    findRestoreChip,
    frame,
    mesh,
    receipts,
    sceneRoot,
    selectAction,
    selectDragTarget,
    selectResizeDrag,
  };
}

// --- Adapter behavior with panelTransitions enabled ---

test('close tween keeps the mesh ray-visible, then hides it with exact end-state', async () => {
  let harness = await createTransitionHarness({
    panelTransitions: { durationMs: TRANSITION_DURATION_MS },
  });
  let { mesh } = harness;

  harness.frame(1000);
  harness.selectAction(mesh, 'close');

  assert.equal(harness.receipts.length, 1);
  assert.equal(harness.receipts[0].action, 'close');
  assert.equal(harness.receipts[0].after.hidden, true);

  // The store commits synchronously while the mesh stays ray-visible for the
  // tween; the tween's from value is applied immediately.
  assert.equal(mesh.visible, true);
  assert.equal(mesh.scale.x, 1);

  let chip = harness.findRestoreChip();
  assert.ok(chip);
  assert.notEqual(chip.material, mesh.material);
  assert.equal(chip.material.opacity, 0);

  harness.frame(1100);
  assert.equal(mesh.visible, true);
  assert.equal(mesh.scale.x, 1);
  assert.equal(chip.material.opacity, 0);

  harness.frame(1190);
  assert.equal(mesh.visible, true);
  approx(mesh.scale.x, 1 + (0.92 - 1) * 0.875);
  approx(mesh.scale.y, mesh.scale.x);
  approx(mesh.scale.z, mesh.scale.x);
  approx(chip.material.opacity, 0.875);
  assert.equal(mesh.material.opacity, 1);

  harness.frame(1280);
  assert.equal(mesh.visible, false);
  assert.equal(mesh.scale.x, 1);
  assert.equal(mesh.scale.y, 1);
  assert.equal(mesh.scale.z, 1);
  assert.equal(chip.material.opacity, 1);
  assert.equal(mesh.material.opacity, 1);

  await harness.controller.stop();
});

test('show tween sets the mesh visible immediately and settles at unit scale', async () => {
  let harness = await createTransitionHarness({
    panelTransitions: { durationMs: TRANSITION_DURATION_MS },
  });
  let { mesh } = harness;

  harness.frame(1000);
  harness.selectAction(mesh, 'close');
  harness.frame(1100);
  harness.frame(1280);
  assert.equal(mesh.visible, false);

  let chip = harness.findRestoreChip();
  assert.ok(chip);
  harness.selectAction(chip, 'restore');

  assert.equal(harness.receipts.length, 2);
  assert.equal(harness.receipts[1].action, 'restore');
  assert.equal(mesh.visible, true);
  approx(mesh.scale.x, 0.92);
  assert.ok(harness.findRestoreChip());
  assert.equal(chip.material.opacity, 1);

  harness.frame(1500);
  harness.frame(1590);
  assert.equal(mesh.visible, true);
  approx(mesh.scale.x, 0.92 + (1 - 0.92) * 0.875);
  assert.ok(chip.material.opacity < 1);
  assert.ok(harness.findRestoreChip());

  harness.frame(1680);
  assert.equal(mesh.scale.x, 1);
  assert.equal(mesh.scale.y, 1);
  assert.equal(mesh.scale.z, 1);
  assert.equal(mesh.material.opacity, 1);
  assert.equal(harness.findRestoreChip(), null);

  await harness.controller.stop();
});

test('chip fade-out excludes the chip from hits and disposes it at tween end', async () => {
  let harness = await createTransitionHarness({
    panelTransitions: { durationMs: TRANSITION_DURATION_MS },
  });
  let { mesh } = harness;

  harness.frame(1000);
  harness.selectAction(mesh, 'close');
  harness.frame(1100);
  harness.frame(1280);

  let chip = harness.findRestoreChip();
  harness.selectAction(chip, 'restore');
  assert.equal(mesh.visible, true);
  assert.equal(harness.findRestoreChip(), chip);

  harness.frame(1500);
  harness.frame(1680);
  assert.equal(harness.findRestoreChip(), null);

  await harness.controller.stop();
});

test('drag-start guard rejects gestures on a store-hidden panel and accepts after restore', async () => {
  let harness = await createTransitionHarness({
    panelTransitions: { durationMs: TRANSITION_DURATION_MS },
  });
  let { mesh } = harness;

  harness.frame(1000);
  harness.selectAction(mesh, 'close');
  assert.equal(harness.receipts.length, 1);

  // The closing mesh is still ray-visible, but the store already owns
  // hidden=true: the gesture is rejected before any drag, event, or receipt
  // can form.
  let eventsBefore = harness.diagnosticEvents.length;
  harness.selectDragTarget(mesh);
  assert.equal(harness.beginDragCalls.length, 0);
  assert.equal(harness.diagnosticEvents.length, eventsBefore);
  assert.equal(harness.receipts.length, 1);

  harness.frame(1100);
  harness.frame(1280);
  let chip = harness.findRestoreChip();
  harness.selectAction(chip, 'restore');
  harness.frame(1500);
  harness.frame(1680);
  assert.equal(mesh.visible, true);

  harness.selectDragTarget(mesh);
  assert.equal(harness.beginDragCalls.length, 1);
  assert.equal(harness.beginDragCalls[0], 'panel-a');
  assert.equal(harness.diagnosticEvents.includes('spatial-three-drag-start'), true);

  await harness.controller.stop();
});

test('resize settle mid-show-tween stores the exact target size, not the eased scale', async () => {
  let harness = await createTransitionHarness({
    panelTransitions: { durationMs: TRANSITION_DURATION_MS },
  });
  let { mesh } = harness;

  harness.frame(1000);
  harness.selectAction(mesh, 'close');
  harness.frame(1100);
  harness.frame(1280);
  assert.equal(mesh.visible, false);

  let chip = harness.findRestoreChip();
  harness.selectAction(chip, 'restore');
  assert.equal(mesh.visible, true);
  approx(mesh.scale.x, 0.92);

  // Foreign-mesh size contract: no xrSize/panel.size, so the panel size lives
  // in geometry.parameters × scale — the exact read the settle path must not
  // fold the mid-ease scale into. The 1.0 x 0.5 geometry is the drag result.
  delete mesh.userData.xrSize;
  delete mesh.userData.panel.size;
  mesh.geometry = new THREE_REAL.PlaneGeometry(1.0, 0.5);

  harness.selectResizeDrag(mesh);

  let receipt = harness.receipts.at(-1);
  assert.equal(receipt.action, 'resize');
  assert.equal(receipt.accepted, true);
  assert.deepEqual(receipt.after.current.size, [1.0, 0.5]);

  let snapshot = harness.controller.getPortablePanelState();
  let stored = snapshot.panels.find((panel) => panel.id === 'panel-a');
  assert.deepEqual(stored.current.size, [1.0, 0.5]);

  await harness.controller.stop();
});

test('session teardown mid-tween restores instant end-state visuals', async () => {
  let harness = await createTransitionHarness({
    panelTransitions: { durationMs: TRANSITION_DURATION_MS },
  });
  let { mesh } = harness;

  harness.frame(1000);
  harness.selectAction(mesh, 'close');
  harness.frame(1100);
  harness.frame(1190);
  assert.ok(mesh.scale.x < 1);
  assert.equal(mesh.visible, true);

  await harness.controller.stop();
  assert.equal(mesh.scale.x, 1);
  assert.equal(mesh.visible, false);
  assert.equal(harness.findRestoreChip(), null);
});

test('start rejects an invalid panelTransitions option with TypeError', async () => {
  let controller = createXRThreeSessionController({
    globalThis: { navigator: {} },
    adapter: { getDiagnostics: () => ({}) },
    THREE: THREE_REAL,
  });
  await assert.rejects(
    () => controller.start('immersive-ar', { panelTransitions: { durationMs: 0 } }),
    TypeError,
  );
  await assert.rejects(
    () => controller.start('immersive-ar', { panelTransitions: { durationMs: -5 } }),
    TypeError,
  );
  await assert.rejects(
    () => controller.start('immersive-ar', { panelTransitions: [180] }),
    TypeError,
  );
  await assert.rejects(
    () => controller.start('immersive-ar', { panelTransitions: { durationMs: 'fast' } }),
    TypeError,
  );
});

// --- Option-absent behavior stays instant ---

test('option-absent close and restore stay instant with no tween created', async () => {
  let harness = await createTransitionHarness();
  let { mesh } = harness;

  harness.frame(1000);
  harness.selectAction(mesh, 'close');

  assert.equal(harness.receipts.length, 1);
  assert.equal(mesh.visible, false);
  assert.equal(mesh.scale.x, 1);

  let chip = harness.findRestoreChip();
  assert.ok(chip);
  assert.equal(chip.material.opacity, 1);

  harness.frame(1100);
  assert.equal(mesh.visible, false);
  assert.equal(mesh.scale.x, 1);
  assert.equal(chip.material.opacity, 1);

  harness.selectAction(chip, 'restore');
  assert.equal(mesh.visible, true);
  assert.equal(mesh.scale.x, 1);
  assert.equal(harness.findRestoreChip(), null);

  await harness.controller.stop();
});
