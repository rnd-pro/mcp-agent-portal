import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import * as THREE from 'three';

import {
  createXRFrameTimingTracker,
  createXRPortablePanelStore,
  createXRThreeInteractionReadinessSummary,
  createXRThreeSessionController,
  createXRThreeWebXRAdapter,
  verifyXRPortablePanelReceipt,
  verifyXRPortablePanelStateSnapshot,
} from 'symbiote-ui/xr';
import { createSpatialTarget } from './xr-spatial-fixtures.js';

let directory = dirname(fileURLToPath(import.meta.url));

function panel(overrides = {}) {
  let canonical = overrides.canonical || {
    position: [0, 1.4, -1],
    quaternion: [0, 0, 0, 1],
    size: [0.8, 0.5],
  };
  let current = overrides.current || structuredClone(canonical);
  return {
    id: 'panel-a',
    canonical: structuredClone(canonical),
    current: structuredClone(current),
    portable: true,
    pinned: false,
    focused: false,
    revision: 0,
    sourceMetadata: { sourceId: 'maintenance-chat', contentRevision: 4 },
    ...overrides,
  };
}

function receiptContext(overrides = {}) {
  return {
    sessionId: 'session-1',
    startFrameId: 'session-1:1:10',
    endFrameId: 'session-1:1:11',
    timestamp: 120,
    inputSourceId: 'controller-right',
    inputKind: 'controller',
    handedness: 'right',
    profiles: ['meta-quest-touch-plus'],
    ...overrides,
  };
}

function assertDeepFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (let child of Object.values(value)) assertDeepFrozen(child);
}

function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

async function createSchemaValidators() {
  let names = [
    'xr-portable-panel-state-v1.json',
    'xr-portable-panel-receipt-v1.json',
    'xr-frame-timing-v1.json',
    'xr-final-session-snapshot-v1.json',
  ];
  let schemas = await Promise.all(names.map(async (name) => (
    JSON.parse(await readFile(resolve(directory, '..', 'schemas', name), 'utf8'))
  )));
  let ajv = new Ajv2020({ allErrors: true, strict: true });
  for (let schema of schemas) ajv.addSchema(schema);
  return {
    ajv,
    validatePanelState: ajv.getSchema(schemas[0].$id),
    validateReceipt: ajv.getSchema(schemas[1].$id),
    validateFrameTiming: ajv.getSchema(schemas[2].$id),
    validateFinalSnapshot: ajv.getSchema(schemas[3].$id),
  };
}

function inputSource(overrides = {}) {
  return {
    id: 'controller-right',
    handedness: 'right',
    targetRayMode: 'tracked-pointer',
    profiles: ['meta-quest-touch-plus'],
    targetRaySpace: {},
    gripSpace: {},
    ...overrides,
  };
}

async function createControllerHarness(options = {}) {
  let source = options.inputSource || inputSource();
  let sessionEndCalls = 0;
  let sessionEndEvents = 0;
  let sessions = [];
  let sessionRequests = 0;

  function createSession() {
    let listenersByType = new Map();
    let nextSession = {
      visibilityState: 'visible',
      enabledFeatures: ['local-floor'],
      inputSources: [source],
      frameRate: 90,
      supportedFrameRates: [72, 80, 90, 120],
      addEventListener(type, listener) {
        let listeners = listenersByType.get(type) || new Set();
        listeners.add(listener);
        listenersByType.set(type, listeners);
      },
      removeEventListener(type, listener) {
        listenersByType.get(type)?.delete(listener);
      },
      async end() {
        sessionEndCalls += 1;
        if (options.endError) throw options.endError;
        for (let listener of listenersByType.get('end') || []) {
          sessionEndEvents += 1;
          listener();
        }
      },
    };
    sessions.push(nextSession);
    return nextSession;
  }

  let session = createSession();
  let referenceSpaceListeners = new Map();
  let referenceSpace = {
    addEventListener(type, listener) {
      referenceSpaceListeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (referenceSpaceListeners.get(type) === listener) referenceSpaceListeners.delete(type);
    },
  };
  let controllers = [new THREE.Group(), new THREE.Group()];
  let animationLoop = null;
  let loopAssignments = [];
  let renderer = {
    xr: {
      async setSession() {},
      getController(index) {
        return controllers[index];
      },
      setAnimationLoop(callback) {
        animationLoop = callback;
        loopAssignments.push(callback);
      },
    },
    render() {},
  };
  if (options.noSetAnimationLoop) delete renderer.xr.setAnimationLoop;
  let descriptor = panel(options.panel || {});
  let mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(descriptor.current.size[0], descriptor.current.size[1]),
    new THREE.MeshBasicMaterial(),
  );
  mesh.position.fromArray(descriptor.current.position);
  mesh.quaternion.fromArray(descriptor.current.quaternion);
  mesh.userData = {
    panelId: descriptor.id,
    xrSize: [...descriptor.current.size],
    panel: {
      portable: descriptor.portable,
      pinned: descriptor.pinned,
      focused: descriptor.focused,
      revision: descriptor.revision,
      sourceMetadata: structuredClone(descriptor.sourceMetadata),
      size: [...descriptor.current.size],
    },
  };
  let visualRefreshes = 0;
  mesh.userData.updatePanelFrameVisuals = () => {
    visualRefreshes += 1;
  };

  let hit = null;
  let dragging = null;
  let beginDragCalls = 0;
  let dragPreviewUpdates = 0;
  let endDragCalls = 0;
  let settledPosition = options.settledPosition || [0.25, 1.55, -1.15];
  let receipts = [];
  let adapterSceneRoot = options.adapterSceneRoot || null;
  let controllerRays = {
    panelStore: null,
    receiptsList: null,
    getHits() {
      return hit ? [hit] : [];
    },
    beginDrag(controller, nextHit) {
      beginDragCalls += 1;
      dragging = { controller, hit: nextHit, mesh: nextHit.object };
      return {
        ok: true,
        panelId: nextHit.object.userData.panelId,
        frameTarget: nextHit.frameTarget,
      };
    },
    updateDrag() {
      if (!dragging) return { ok: false, reason: 'not-dragging' };
      dragPreviewUpdates += 1;
      dragging.mesh.position.fromArray(settledPosition);
      return { ok: true, panelId: dragging.mesh.userData.panelId };
    },
    endDrag() {
      endDragCalls += 1;
      let ended = dragging;
      dragging = null;
      return {
        ok: true,
        panelId: ended?.mesh?.userData?.panelId || null,
        frameTarget: ended?.hit?.frameTarget || null,
        pose: ended ? {
          position: ended.mesh.position.toArray(),
          rotation: ended.mesh.quaternion.toArray(),
          size: [...ended.mesh.userData.xrSize],
        } : null,
      };
    },
    getState() {
      return {
        dragging: Boolean(dragging),
        panelId: dragging?.mesh?.userData?.panelId || null,
      };
    },
    getDiagnostics() {
      return {};
    },
  };
  let adapter = {
    async setSession(nextSession) {
      return { ok: true, session: nextSession, referenceSpace };
    },
    listPanelMeshes() {
      return [mesh];
    },
    getPanelMesh(panelId) {
      return panelId === mesh.userData.panelId ? mesh : null;
    },
    getSceneRoot() {
      return adapterSceneRoot;
    },
    controllerRays,
    getDiagnostics() {
      return {};
    },
  };
  let target = {
    ok: true,
    renderer,
    camera: new THREE.PerspectiveCamera(),
    scene: new THREE.Scene(),
  };
  if (options.sceneRemoveNoop) {
    target.scene.remove = () => target.scene;
  }
  let controller = createXRThreeSessionController({
    globalThis: {
      navigator: {
        xr: {
          async requestSession() {
            let requestedSession = sessionRequests === 0 ? session : createSession();
            sessionRequests += 1;
            return requestedSession;
          },
        },
      },
    },
    adapter,
    onPortablePanelReceipt(nextReceipt) {
      receipts.push(nextReceipt);
      options.onPortablePanelReceipt?.(nextReceipt);
    },
  });
  let started = await controller.start('immersive-ar', {
    target,
    controllerRayVisuals: false,
    panelHitReticle: false,
    renderFrame: false,
  });
  assert.equal(started.ok, true);

  let root = options.missingRootObject ? null : (options.rootObject || new THREE.Group());
  root?.updateMatrixWorld?.(true);
  let spatialObject = options.spatialObject || mesh;
  spatialObject.updateMatrixWorld(true);
  let committed = controller.commitSpatialEvidence({
    spatialTarget: createSpatialTarget(),
    sessionId: options.sessionId || 'session-1',
    referenceSpaceId: 'reference-space-1',
    provenance: {
      runtimeId: 'three-webxr',
      runtimeVersion: '1.0.0',
      appId: 'provider-release-gate',
      buildHash: 'sha256:provider-release-gate',
      deviceId: 'quest-3-gate',
      deviceKind: 'headset',
      emulation: 'native',
    },
    rootPolicy: {
      mode: 'world-locked',
      id: 'root-1',
      commitId: 'root-commit-1',
      ...(root
        ? { object: root }
        : { matrix: new THREE.Matrix4().identity().toArray() }),
    },
    spatialObjects: [{
      id: 'assembly',
      object: spatialObject,
      size: options.sourceSize || [0.2, 0.2, 0.01],
      ...(typeof options.getSize === 'function' ? { getSize: options.getSize } : {}),
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

  function setFrameTarget(frameTarget) {
    hit = {
      object: mesh,
      point: new THREE.Vector3(...mesh.position.toArray()),
      uv: new THREE.Vector2(0.5, 0.5),
      frameTarget,
    };
  }

  function dispatch(type) {
    controllers[0].dispatchEvent({ type, data: source });
  }

  function dispatchReferenceSpaceReset() {
    referenceSpaceListeners.get('reset')?.({ type: 'reset' });
  }

  return {
    adapter,
    controller,
    controllers,
    dispatch,
    dispatchReferenceSpaceReset,
    frame,
    mesh,
    receipts,
    renderer,
    root,
    session,
    sessions,
    setFrameTarget,
    target,
    state() {
      return {
        animationLoop,
        beginDragCalls,
        dragPreviewUpdates,
        endDragCalls,
        loopAssignments: [...loopAssignments],
        sessionEndCalls,
        sessionEndEvents,
        sessionRequests,
        visualRefreshes,
      };
    },
  };
}

test('portable receipts contain exact complete frozen panel snapshots', () => {
  let store = createXRPortablePanelStore([panel()]);
  let receipt = store.settleMove(
    'panel-a',
    [0.2, 1.5, -1.2],
    [0, 0, 0, 1],
    receiptContext(),
  );
  let expectedSnapshotKeys = [
    'canonical',
    'current',
    'focused',
    'id',
    'pinned',
    'portable',
    'revision',
    'sourceMetadata',
  ];

  assert.deepEqual(Object.keys(receipt.before).sort(), expectedSnapshotKeys);
  assert.deepEqual(Object.keys(receipt.after).sort(), expectedSnapshotKeys);
  assert.equal(receipt.before.id, 'panel-a');
  assert.equal(receipt.before.portable, true);
  assert.equal(receipt.after.revision, receipt.before.revision + 1);
  assert.deepEqual(receipt.before.sourceMetadata, panel().sourceMetadata);
  assertDeepFrozen(receipt);
});

test('portable verifiers are strict, deeply frozen, and accept spec-valid empty profiles', () => {
  let store = createXRPortablePanelStore([panel()]);
  let receipt = store.focus('panel-a', receiptContext());
  let receiptResult = verifyXRPortablePanelReceipt(receipt);
  let snapshotResult = verifyXRPortablePanelStateSnapshot(store.getSnapshot());
  let emptyProfiles = structuredClone(receipt);
  emptyProfiles.profiles = [];
  let invalidProfileResults = [[''], [42]].map((profiles) => {
    let candidate = structuredClone(receipt);
    candidate.profiles = profiles;
    return verifyXRPortablePanelReceipt(candidate).ok;
  });
  assert.deepEqual({
    receiptResultFrozen: isDeepFrozen(receiptResult),
    snapshotResultFrozen: isDeepFrozen(snapshotResult),
    emptyProfilesValid: verifyXRPortablePanelReceipt(emptyProfiles).ok,
    invalidProfileResults,
  }, {
    receiptResultFrozen: true,
    snapshotResultFrozen: true,
    emptyProfilesValid: true,
    invalidProfileResults: [false, false],
  });
});

test('portable store rejects duplicate, multifocus, and flat legacy initialization', () => {
  let duplicate = panel();
  assert.throws(
    () => createXRPortablePanelStore([duplicate, structuredClone(duplicate)]),
    /duplicate/i,
  );
  assert.throws(
    () => createXRPortablePanelStore([
      panel({ id: 'panel-a', focused: true }),
      panel({ id: 'panel-b', focused: true }),
    ]),
    /focus/i,
  );
  assert.throws(
    () => createXRPortablePanelStore([{
      id: 'legacy-panel',
      position: [0, 1.4, -1],
      quaternion: [0, 0, 0, 1],
      size: [0.8, 0.5],
      portable: true,
      pinned: false,
      focused: false,
      revision: 0,
      sourceMetadata: {},
    }]),
    /canonical|current|legacy/i,
  );
  assert.throws(
    () => createXRPortablePanelStore([panel({ revision: 0.5 })]),
    /revision|integer/i,
  );
});

test('portable store rejects canonical, metadata, and focus-coherence restore tampering', () => {
  let cases = [
    ['canonical', (snapshot) => {
      snapshot.panels[0].canonical.position[0] = 9;
    }],
    ['metadata', (snapshot) => {
      snapshot.panels[0].sourceMetadata.sourceId = 'tampered-source';
    }],
    ['focus', (snapshot) => {
      snapshot.focusedPanelId = 'panel-a';
      snapshot.panels[0].focused = false;
    }],
    ['revision', (snapshot) => {
      snapshot.layoutRevision = 1.5;
    }],
  ];
  for (let [reason, mutator] of cases) {
    let store = createXRPortablePanelStore([panel()]);
    let before = store.getSnapshot();
    let snapshot = structuredClone(store.getSnapshot());
    snapshot.layoutRevision = 1;
    snapshot.panels[0].revision = 1;
    mutator(snapshot);
    assert.throws(() => store.restore(snapshot), new RegExp(reason, 'i'));
    assert.deepEqual(store.getSnapshot(), before);
  }
});

test('portable store uses codepoint order and propagates receipt callback failures', () => {
  let sorted = createXRPortablePanelStore([
    panel({ id: 'ä-panel' }),
    panel({ id: 'z-panel' }),
  ]).getSnapshot().panels.map((candidate) => candidate.id);
  assert.deepEqual(sorted, ['z-panel', 'ä-panel']);

  let callbackFailure = new Error('receipt-callback-failed');
  let store = createXRPortablePanelStore([panel()], {
    onReceipt() {
      throw callbackFailure;
    },
  });
  assert.throws(
    () => store.focus('panel-a', receiptContext()),
    (error) => error === callbackFailure,
  );
});

test('frame timing metrics validate against their public schema with exact reset reasons', async () => {
  let { ajv, validateFrameTiming } = await createSchemaValidators();
  let resetTracker = createXRFrameTimingTracker({
    nominalFrameRate: 90,
    supportedFrameRates: [72, 80, 90, 120],
  });
  resetTracker.recordFrame(100);
  resetTracker.recordFrame(111);
  resetTracker.recordFrame(105);
  resetTracker.recordFrame(120, { visible: false });
  resetTracker.recordFrame(130, { discontinuous: true });
  let resetMetrics = resetTracker.getMetrics();

  let tracker = createXRFrameTimingTracker({
    nominalFrameRate: 90,
    supportedFrameRates: [120, 90, 72, 90, Number.NaN, -1],
  });
  for (let index = 0; index <= 900; index += 1) {
    tracker.recordFrame(index * (1000 / 90));
  }
  let metrics = tracker.getMetrics();

  let schemaValid = validateFrameTiming(metrics);
  assert.deepEqual({
    schemaValid,
    schemaErrors: schemaValid ? '' : ajv.errorsText(validateFrameTiming.errors),
    resetReasons: resetMetrics.resets?.map((reset) => reset.reason) || null,
    resetCountMatches: resetMetrics.resets
      ? resetMetrics.resetCount === resetMetrics.resets.length
      : false,
    supportedFrameRates: metrics.supportedFrameRates,
    unknownNominalRate: createXRFrameTimingTracker().getMetrics().nominalFrameRate,
    frozen: isDeepFrozen(metrics),
  }, {
    schemaValid: true,
    schemaErrors: '',
    resetReasons: ['non-monotonic', 'hidden', 'discontinuity'],
    resetCountMatches: true,
    supportedFrameRates: [72, 90, 120],
    unknownNominalRate: null,
    frozen: true,
  });
  assert.equal(metrics.sampleCount, 901);
  assert.ok(Math.abs(metrics.durationMs - 10_000) < 1e-6);
  assert.ok(Math.abs(metrics.effectiveFrameRate - 90) < 1e-9);
  assert.ok(Math.abs(metrics.meanIntervalMs - (1000 / 90)) < 1e-9);
  assert.ok(Math.abs(metrics.p95IntervalMs - (1000 / 90)) < 1e-9);
  assert.equal(metrics.dropRatio, 0);
  assert.throws(() => tracker.recordFrame(Number.NaN), /finite/i);
});

test('final session snapshot schema composes and enforces all child evidence schemas', async () => {
  let harness = await createControllerHarness();
  harness.frame(100);
  harness.setFrameTarget({
    version: 'xr-panel-frame-target-v1',
    panelId: 'panel-a',
    zone: 'move',
    operation: 'move',
    handle: null,
  });
  harness.dispatch('selectstart');
  harness.frame(111);
  harness.dispatch('selectend');
  await harness.controller.stop();
  let snapshot = harness.controller.getFinalSessionSnapshot();
  let {
    ajv,
    validatePanelState,
    validateReceipt,
    validateFrameTiming,
    validateFinalSnapshot,
  } = await createSchemaValidators();

  let panelStateValid = validatePanelState(snapshot.panelState);
  let receiptValid = validateReceipt(snapshot.receipts[0]);
  let frameTimingValid = validateFrameTiming(snapshot.frameTiming);
  let finalSnapshotValid = validateFinalSnapshot(snapshot);
  let invalidChildren = ['panelState', 'receipts', 'frameTiming', 'facts'].map((child) => {
    let candidate = structuredClone(snapshot);
    if (child === 'panelState') delete candidate.panelState.layoutRevision;
    if (child === 'receipts') delete candidate.receipts[0].receiptId;
    if (child === 'frameTiming') delete candidate.frameTiming.sampleCount;
    if (child === 'facts') candidate.facts.privateRuntimeValue = 'not-allowlisted';
    return validateFinalSnapshot(candidate);
  });
  assert.deepEqual({
    panelStateValid,
    receiptValid,
    frameTimingValid,
    frameTimingErrors: frameTimingValid ? '' : ajv.errorsText(validateFrameTiming.errors),
    finalSnapshotValid,
    invalidChildren,
    frozen: isDeepFrozen(snapshot),
  }, {
    panelStateValid: true,
    receiptValid: true,
    frameTimingValid: true,
    frameTimingErrors: '',
    finalSnapshotValid: true,
    invalidChildren: [false, false, false, false],
    frozen: true,
  });
  assert.equal(snapshot.receipts.length, 1);
  assert.equal(
    snapshot.receipts[0].layoutRevisionAfter,
    snapshot.panelState.layoutRevision,
  );
  assert.deepEqual(
    [...new Set(snapshot.receipts.map((candidate) => candidate.sessionId))],
    ['session-1'],
  );
  assert.deepEqual(snapshot.facts, {
    endEventObserved: true,
    providerIdle: true,
    activeSessionCleared: true,
    rootHidden: true,
    controllersDestroyed: true,
    captureStopped: true,
    teardownReason: 'stop-called',
  });
});

test('pinned and nonportable event paths reject without starting a visual preview', async () => {
  let outcomes = [];
  let descriptors = [
    { state: 'pinned', portable: true, pinned: true, reason: 'panel-pinned' },
    { state: 'fixed', portable: false, pinned: false, reason: 'panel-not-portable' },
  ];
  for (let descriptor of descriptors) {
    for (let operation of ['move', 'resize']) {
      let id = `${descriptor.state}-${operation}`;
      let harness = await createControllerHarness({
        panel: {
          id,
          portable: descriptor.portable,
          pinned: descriptor.pinned,
        },
        sessionId: `session-${id}`,
      });
      harness.frame(100);
      harness.setFrameTarget({
        version: 'xr-panel-frame-target-v1',
        panelId: id,
        zone: operation,
        operation,
        handle: operation === 'resize' ? 'east' : null,
      });
      let before = harness.mesh.position.toArray();
      let beforeSize = [...harness.mesh.userData.xrSize];
      harness.dispatch('selectstart');
      harness.frame(111);
      harness.dispatch('selectend');
      let state = harness.state();
      outcomes.push({
        id,
        beginDragCalls: state.beginDragCalls,
        dragPreviewUpdates: state.dragPreviewUpdates,
        positionStayedCanonical: harness.mesh.position.equals(new THREE.Vector3(...before)),
        sizeStayedCanonical: JSON.stringify(harness.mesh.userData.xrSize) === JSON.stringify(beforeSize),
        receipts: harness.receipts.map((receipt) => ({
          accepted: receipt.accepted,
          action: receipt.action,
          reason: receipt.reason,
        })),
      });
      await harness.controller.stop();
    }
  }

  assert.deepEqual(outcomes, [
    {
      id: 'pinned-move',
      beginDragCalls: 0,
      dragPreviewUpdates: 0,
      positionStayedCanonical: true,
      sizeStayedCanonical: true,
      receipts: [{ accepted: false, action: 'move', reason: 'panel-pinned' }],
    },
    {
      id: 'pinned-resize',
      beginDragCalls: 0,
      dragPreviewUpdates: 0,
      positionStayedCanonical: true,
      sizeStayedCanonical: true,
      receipts: [{ accepted: false, action: 'resize', reason: 'panel-pinned' }],
    },
    {
      id: 'fixed-move',
      beginDragCalls: 0,
      dragPreviewUpdates: 0,
      positionStayedCanonical: true,
      sizeStayedCanonical: true,
      receipts: [{ accepted: false, action: 'move', reason: 'panel-not-portable' }],
    },
    {
      id: 'fixed-resize',
      beginDragCalls: 0,
      dragPreviewUpdates: 0,
      positionStayedCanonical: true,
      sizeStayedCanonical: true,
      receipts: [{ accepted: false, action: 'resize', reason: 'panel-not-portable' }],
    },
  ]);
});

test('controller and hand-shaped input each settle exactly once on selectend', async () => {
  let cases = [
    inputSource(),
    inputSource({
      id: 'hand-right',
      profiles: ['generic-hand-select'],
      hand: new Map([['index-finger-tip', {}]]),
    }),
  ];
  let outcomes = [];
  for (let source of cases) {
    let harness = await createControllerHarness({ inputSource: source });
    harness.frame(100);
    harness.setFrameTarget({
      version: 'xr-panel-frame-target-v1',
      panelId: 'panel-a',
      zone: 'move',
      operation: 'move',
      handle: null,
    });
    harness.dispatch('selectstart');
    harness.frame(111);
    harness.frame(122);
    harness.dispatch('selectend');
    assert.equal(harness.receipts.length, 1);
    let receipt = harness.receipts[0];
    assert.equal(receipt.sessionId, 'session-1');
    assert.doesNotMatch(receipt.startFrameId, /unknown/i);
    assert.doesNotMatch(receipt.endFrameId, /unknown/i);
    assert.notEqual(receipt.startFrameId, receipt.endFrameId);
    assert.deepEqual(receipt.profiles, source.profiles);
    assert.equal(receipt.handedness, source.handedness);
    outcomes.push(harness.receipts.map((receipt) => ({
      action: receipt.action,
      phase: receipt.phase,
      inputKind: receipt.inputKind,
      inputSourceId: receipt.inputSourceId,
    })));
    await harness.controller.stop();
  }

  assert.deepEqual(outcomes, [
    [{
      action: 'move',
      phase: 'settled',
      inputKind: 'controller',
      inputSourceId: 'controller-right',
    }],
    [{
      action: 'move',
      phase: 'settled',
      inputKind: 'hand',
      inputSourceId: 'hand-right',
    }],
  ]);
});

test('callable and live object sizes take precedence over stale configured capture size', async () => {
  let callable = await createControllerHarness({
    sourceSize: [0.2, 0.2, 0.01],
    getSize: () => [1.4, 0.9, 0.03],
  });
  callable.mesh.userData.xrSize = [1.1, 0.7];
  callable.mesh.userData.panel.size = [1.1, 0.7];
  callable.frame(100);
  assert.deepEqual(
    callable.controller.getDiagnostics().lastObservation.objects[0].size,
    [1.4, 0.9, 0.03],
  );
  await callable.controller.stop();

  let live = await createControllerHarness({ sourceSize: [0.2, 0.2, 0.01] });
  live.mesh.userData.xrSize = [1.1, 0.7];
  live.mesh.userData.panel.size = [1.1, 0.7];
  live.frame(100);
  assert.deepEqual(
    live.controller.getDiagnostics().lastObservation.objects[0].size,
    [1.1, 0.7, 0.01],
  );
  await live.controller.stop();
});

test('reset synchronizes mesh metadata and frame visuals with restored store state', async () => {
  let harness = await createControllerHarness({
    panel: { pinned: true, focused: true },
  });
  harness.mesh.position.set(4, 5, 6);
  harness.mesh.userData.xrSize = [1.4, 0.9];
  harness.mesh.userData.panel.size = [1.4, 0.9];
  harness.mesh.geometry.dispose();
  harness.mesh.geometry = new THREE.PlaneGeometry(1.4, 0.9);
  harness.frame(100);
  harness.setFrameTarget({
    version: 'xr-panel-frame-target-v1',
    panelId: 'panel-a',
    zone: 'action',
    operation: 'action',
    action: 'reset',
  });
  harness.dispatch('selectstart');
  harness.frame(111);
  harness.dispatch('selectend');
  let restored = harness.controller.getPortablePanelState().panels[0];

  assert.deepEqual(harness.mesh.position.toArray(), restored.current.position);
  assert.deepEqual(harness.mesh.userData.xrSize, restored.current.size);
  assert.deepEqual(
    [harness.mesh.geometry.parameters.width, harness.mesh.geometry.parameters.height],
    restored.current.size,
  );
  assert.equal(harness.mesh.userData.panel.pinned, restored.pinned);
  assert.equal(harness.mesh.userData.panel.focused, restored.focused);
  assert.equal(harness.mesh.userData.panel.revision, restored.revision);
  assert.deepEqual(harness.mesh.userData.panel.sourceMetadata, restored.sourceMetadata);
  await harness.controller.stop();
});

test('session teardown is idempotent and clears the exact animation-loop owner', async () => {
  let first = await createControllerHarness({ sessionId: 'session-first' });
  let second = await createControllerHarness({
    sessionId: 'session-second',
    panel: { id: 'panel-second' },
  });
  first.frame(100);
  second.frame(200);
  await first.controller.stop();
  let firstSnapshot = structuredClone(first.controller.getFinalSessionSnapshot());
  await first.controller.stop();
  assert.deepEqual({
    firstLoopCleared: first.state().animationLoop === null,
    secondLoopActive: typeof second.state().animationLoop === 'function',
    secondControllerActive: second.controller.getDiagnostics().active,
    sessionEndCalls: first.state().sessionEndCalls,
    sessionEndEvents: first.state().sessionEndEvents,
    snapshotStable: JSON.stringify(first.controller.getFinalSessionSnapshot()) === JSON.stringify(firstSnapshot),
    secondPanelId: second.controller.getPortablePanelState().panels[0].id,
  }, {
    firstLoopCleared: true,
    secondLoopActive: true,
    secondControllerActive: true,
    sessionEndCalls: 1,
    sessionEndEvents: 1,
    snapshotStable: true,
    secondPanelId: 'panel-second',
  });
  await second.controller.stop();
});

test('independent Three adapter instances keep resize geometry provider-local', async () => {
  assert.equal(THREE.REVISION, '185');
  let packageLock = JSON.parse(await readFile(resolve(directory, '..', 'package-lock.json'), 'utf8'));
  assert.equal(packageLock.packages['node_modules/three'].version, '0.185.1');
  class ProviderAPlaneGeometry extends THREE.PlaneGeometry {
    constructor(...args) {
      super(...args);
      this.providerTag = 'provider-a';
    }
  }
  class ProviderBPlaneGeometry extends THREE.PlaneGeometry {
    constructor(...args) {
      super(...args);
      this.providerTag = 'provider-b';
    }
  }
  let threeA = { ...THREE, PlaneGeometry: ProviderAPlaneGeometry };
  let threeB = { ...THREE, PlaneGeometry: ProviderBPlaneGeometry };
  let raycasterA = new THREE.Raycaster();
  let adapterA = createXRThreeWebXRAdapter({
    THREE: threeA,
    raycaster: raycasterA,
    dragSmoothing: 1,
    maxDragStep: 10,
  });
  adapterA.setScene({
    id: 'scene-a',
    panels: [{
      id: 'panel-a',
      position: [0, 0, -1],
      rotation: [0, 0, 0],
      size: [0.8, 0.5],
    }],
  });
  let adapterB = createXRThreeWebXRAdapter({ THREE: threeB });
  adapterB.setScene({
    id: 'scene-b',
    panels: [{
      id: 'panel-b',
      position: [0, 0, -1],
      rotation: [0, 0, 0],
      size: [0.8, 0.5],
    }],
  });

  let mesh = adapterA.getPanelMesh('panel-a');
  let meshB = adapterB.getPanelMesh('panel-b');
  let initialGeometry = mesh.geometry;
  let initialWidth = initialGeometry.parameters.width;
  let initialGeometryB = meshB.geometry;
  mesh.userData.lastFrameTarget = {
    version: 'xr-panel-frame-target-v1',
    panelId: 'panel-a',
    zone: 'resize',
    operation: 'resize',
    handle: 'northEast',
  };
  let controller = new THREE.Group();
  let camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 0, 1);
  camera.updateMatrixWorld(true);
  controller.updateMatrixWorld(true);
  let intersection = new THREE.Vector3(0.4, 0, -1);
  raycasterA.ray.intersectPlane = (dragPlane, target) => target.copy(intersection);
  assert.equal(adapterA.controllerRays.beginDrag(controller, mesh, camera).ok, true);
  intersection = new THREE.Vector3(0.6, 0, -1);
  assert.equal(adapterA.controllerRays.updateDrag(controller).ok, true);

  assert.equal(mesh.geometry.providerTag, 'provider-a');
  assert.equal(mesh.geometry instanceof ProviderAPlaneGeometry, true);
  assert.equal(mesh.geometry instanceof ProviderBPlaneGeometry, false);
  assert.deepEqual(
    [mesh.geometry.parameters.width, mesh.geometry.parameters.height],
    mesh.userData.xrSize,
  );
  assert.ok(mesh.geometry.parameters.width > initialWidth);
  let frameObjects = mesh.userData.panelFrameVisuals.objects;
  let northEast = frameObjects.find((object) => object.userData.handle === 'northEast');
  let southWest = frameObjects.find((object) => object.userData.handle === 'southWest');
  assert.ok(northEast);
  assert.ok(southWest);
  // Horizon-style grips straddle the corners: zone centers sit exactly on
  // the panel edges after a resize.
  let panelWidth = mesh.geometry.parameters.width;
  assert.ok(Math.abs(northEast.position.x - panelWidth / 2) < 1e-9);
  assert.ok(Math.abs(southWest.position.x + panelWidth / 2) < 1e-9);
  assert.equal(frameObjects.every((object) => object.scale.equals(new THREE.Vector3(1, 1, 1))), true);
  assert.equal(meshB.geometry, initialGeometryB);
  assert.equal(meshB.geometry.providerTag, 'provider-b');
});

function commitHarnessSpatialEvidence(harness, sessionId, root) {
  root?.updateMatrixWorld?.(true);
  harness.mesh.updateMatrixWorld(true);
  return harness.controller.commitSpatialEvidence({
    spatialTarget: createSpatialTarget(),
    sessionId,
    referenceSpaceId: `reference-space-${sessionId}`,
    provenance: {
      runtimeId: 'three-webxr',
      runtimeVersion: '1.0.0',
      appId: 'provider-release-gate',
      buildHash: 'sha256:provider-release-gate',
      deviceId: 'quest-3-gate',
      deviceKind: 'headset',
      emulation: 'native',
    },
    rootPolicy: {
      mode: 'world-locked',
      id: `root-${sessionId}`,
      commitId: `root-commit-${sessionId}`,
      ...(root
        ? { object: root }
        : { matrix: new THREE.Matrix4().identity().toArray() }),
    },
    spatialObjects: [{
      id: 'assembly',
      object: harness.mesh,
      size: [0.8, 0.5, 0.01],
      visible: true,
      getState: () => 'ready',
    }],
    resolveInputSourceId: (candidate) => candidate.id,
  });
}

test('runtime verifiers and public schemas reject truncated or schema-incompatible panel evidence', async () => {
  let {
    validatePanelState,
    validateReceipt,
  } = await createSchemaValidators();
  let store = createXRPortablePanelStore([panel()]);
  let receipt = store.focus('panel-a', receiptContext());
  let snapshot = store.getSnapshot();

  let fractionalRevisions = structuredClone(receipt);
  fractionalRevisions.layoutRevisionBefore = 0.5;
  fractionalRevisions.layoutRevisionAfter = 1.5;

  let receiptArrayMetadata = structuredClone(receipt);
  receiptArrayMetadata.before.sourceMetadata = [];
  receiptArrayMetadata.after.sourceMetadata = [];

  let snapshotArrayMetadata = structuredClone(snapshot);
  snapshotArrayMetadata.panels[0].sourceMetadata = [];

  let canonicalNull = structuredClone(snapshot);
  canonicalNull.panels[0].canonical = null;

  let currentNull = structuredClone(snapshot);
  currentNull.panels[0].current = null;

  let receiptSnapshotsNull = structuredClone(receipt);
  receiptSnapshotsNull.before = null;
  receiptSnapshotsNull.after = null;

  assert.deepEqual({
    fractionalRevisions: {
      runtime: verifyXRPortablePanelReceipt(fractionalRevisions).ok,
      schema: validateReceipt(fractionalRevisions),
    },
    receiptArrayMetadata: {
      runtime: verifyXRPortablePanelReceipt(receiptArrayMetadata).ok,
      schema: validateReceipt(receiptArrayMetadata),
    },
    snapshotArrayMetadata: {
      runtime: verifyXRPortablePanelStateSnapshot(snapshotArrayMetadata).ok,
      schema: validatePanelState(snapshotArrayMetadata),
    },
    canonicalNull: {
      runtime: verifyXRPortablePanelStateSnapshot(canonicalNull).ok,
      schema: validatePanelState(canonicalNull),
    },
    currentNull: {
      runtime: verifyXRPortablePanelStateSnapshot(currentNull).ok,
      schema: validatePanelState(currentNull),
    },
    receiptSnapshotsNull: {
      runtime: verifyXRPortablePanelReceipt(receiptSnapshotsNull).ok,
      schema: validateReceipt(receiptSnapshotsNull),
    },
  }, {
    fractionalRevisions: { runtime: false, schema: false },
    receiptArrayMetadata: { runtime: false, schema: false },
    snapshotArrayMetadata: { runtime: false, schema: false },
    canonicalNull: { runtime: false, schema: false },
    currentNull: { runtime: false, schema: false },
    receiptSnapshotsNull: { runtime: false, schema: false },
  });
});

test('frame timing schema requires every field emitted by the runtime tracker', async () => {
  let { validateFrameTiming } = await createSchemaValidators();
  let tracker = createXRFrameTimingTracker({
    nominalFrameRate: 90,
    supportedFrameRates: [72, 90, 120],
  });
  tracker.recordFrame(100);
  tracker.recordFrame(111);
  let metrics = tracker.getMetrics();
  let missingFieldResults = ['supportedFrameRates', 'resetCount'].map((field) => {
    let candidate = structuredClone(metrics);
    delete candidate[field];
    return validateFrameTiming(candidate);
  });

  assert.deepEqual(missingFieldResults, [false, false]);
});

test('portable panel state is schema-valid before a session starts', async () => {
  let { validatePanelState } = await createSchemaValidators();
  let controller = createXRThreeSessionController({
    adapter: {
      controllerRays: {
        getState() {
          return { dragging: false, panelId: null };
        },
      },
      getDiagnostics() {
        return {};
      },
    },
  });
  let snapshot = controller.getPortablePanelState();

  assert.deepEqual({
    snapshot,
    schemaValid: validatePanelState(snapshot),
  }, {
    snapshot: {
      version: 'xr-portable-panel-state-v1',
      layoutRevision: 0,
      focusedPanelId: null,
      panels: [],
    },
    schemaValid: true,
  });
});

test('successful stop reports only teardown facts that were actually performed', async () => {
  let harness = await createControllerHarness();
  harness.frame(100);
  assert.equal(await harness.controller.stop('release-gate-stop'), true);
  let diagnostics = harness.controller.getDiagnostics();
  let performed = {
    endEventObserved: harness.state().sessionEndEvents === 1,
    providerIdle: diagnostics.status === 'idle',
    activeSessionCleared: diagnostics.active === false,
    rootHidden: harness.root.visible === false,
    controllersDestroyed: harness.controllers.every((controller) => (
      !harness.target.scene.children.includes(controller)
    )),
    captureStopped: harness.state().animationLoop === null,
  };

  assert.deepEqual({
    performed,
    reported: harness.controller.getFinalSessionSnapshot().facts,
  }, {
    performed: {
      endEventObserved: true,
      providerIdle: true,
      activeSessionCleared: true,
      rootHidden: true,
      controllersDestroyed: true,
      captureStopped: true,
    },
    reported: {
      endEventObserved: true,
      providerIdle: true,
      activeSessionCleared: true,
      rootHidden: true,
      controllersDestroyed: true,
      captureStopped: true,
      teardownReason: 'stop-called',
    },
  });
});

test('rejected session end propagates and never claims that an end event was observed', async () => {
  let endError = new Error('session-end-rejected');
  let harness = await createControllerHarness({ endError });
  let rejection = null;
  try {
    await harness.controller.stop('release-gate-rejected-end');
  } catch (error) {
    rejection = error;
  }
  let snapshot = harness.controller.getFinalSessionSnapshot();

  assert.deepEqual({
    propagated: rejection === endError,
    observedEndEvents: harness.state().sessionEndEvents,
    claimedEndEvent: snapshot?.facts?.endEventObserved === true,
  }, {
    propagated: true,
    observedEndEvents: 0,
    claimedEndEvent: false,
  });
});

test('one session controller produces a fresh finalized snapshot after a second start and stop', async () => {
  let harness = await createControllerHarness({ sessionId: 'session-first' });
  harness.frame(100);
  harness.setFrameTarget({
    version: 'xr-panel-frame-target-v1',
    panelId: 'panel-a',
    zone: 'action',
    operation: 'focus',
    handle: null,
  });
  harness.dispatch('selectstart');
  harness.frame(111);
  harness.dispatch('selectend');
  await harness.controller.stop('first-stop');
  let firstSnapshot = harness.controller.getFinalSessionSnapshot();

  let restarted = await harness.controller.start('immersive-ar', {
    target: harness.target,
    controllerRayVisuals: false,
    panelHitReticle: false,
    renderFrame: false,
  });
  let secondRoot = new THREE.Group();
  let recommitted = commitHarnessSpatialEvidence(harness, 'session-second', secondRoot);
  harness.frame(200);
  harness.setFrameTarget({
    version: 'xr-panel-frame-target-v1',
    panelId: 'panel-a',
    zone: 'action',
    operation: 'action',
    action: 'pin',
  });
  harness.dispatch('selectstart');
  harness.frame(211);
  harness.dispatch('selectend');
  await harness.controller.stop('second-stop');
  let secondSnapshot = harness.controller.getFinalSessionSnapshot();

  assert.deepEqual({
    restarted: restarted.ok,
    recommitted: recommitted.ok,
    freshIdentity: secondSnapshot !== firstSnapshot,
    freshSession: harness.sessions.length === 2 && harness.sessions[1] !== harness.session,
    firstSessionIds: [...new Set(firstSnapshot.receipts.map((receipt) => receipt.sessionId))],
    secondSessionIds: [...new Set(secondSnapshot.receipts.map((receipt) => receipt.sessionId))],
    endCalls: harness.state().sessionEndCalls,
    endEvents: harness.state().sessionEndEvents,
    activeAfterSecondStop: harness.controller.getDiagnostics().active,
  }, {
    restarted: true,
    recommitted: true,
    freshIdentity: true,
    freshSession: true,
    firstSessionIds: ['session-first'],
    secondSessionIds: ['session-second'],
    endCalls: 2,
    endEvents: 2,
    activeAfterSecondStop: false,
  });
});

test('reset geometry remains bound to provider A after provider B is instantiated', async () => {
  class ProviderAPlaneGeometry extends THREE.PlaneGeometry {
    constructor(...args) {
      super(...args);
      this.providerTag = 'provider-a';
    }
  }
  class ProviderBPlaneGeometry extends THREE.PlaneGeometry {
    constructor(...args) {
      super(...args);
      this.providerTag = 'provider-b';
    }
  }
  let threeA = { ...THREE, PlaneGeometry: ProviderAPlaneGeometry };
  let threeB = { ...THREE, PlaneGeometry: ProviderBPlaneGeometry };
  createXRThreeWebXRAdapter({ THREE: threeA });
  createXRThreeWebXRAdapter({ THREE: threeB });

  let harness = await createControllerHarness();
  harness.mesh.userData.THREE = threeA;
  harness.mesh.position.set(4, 5, 6);
  harness.mesh.userData.xrSize = [1.4, 0.9];
  harness.mesh.userData.panel.size = [1.4, 0.9];
  harness.mesh.geometry.dispose();
  harness.mesh.geometry = new ProviderAPlaneGeometry(1.4, 0.9);
  harness.frame(100);
  harness.setFrameTarget({
    version: 'xr-panel-frame-target-v1',
    panelId: 'panel-a',
    zone: 'action',
    operation: 'action',
    action: 'reset',
  });
  harness.dispatch('selectstart');
  harness.frame(111);
  harness.dispatch('selectend');
  let restored = harness.controller.getPortablePanelState().panels[0];
  let outcome = {
    providerTag: harness.mesh.geometry.providerTag,
    providerA: harness.mesh.geometry instanceof ProviderAPlaneGeometry,
    providerB: harness.mesh.geometry instanceof ProviderBPlaneGeometry,
    geometrySize: [
      harness.mesh.geometry.parameters.width,
      harness.mesh.geometry.parameters.height,
    ],
    restoredSize: restored.current.size,
  };
  await harness.controller.stop();

  assert.deepEqual(outcome, {
    providerTag: 'provider-a',
    providerA: true,
    providerB: false,
    geometrySize: [0.8, 0.5],
    restoredSize: [0.8, 0.5],
  });
});

test('preallocated controllers do not replace the requirement for live XR input sources', () => {
  let summary = createXRThreeInteractionReadinessSummary({
    version: 'xr-three-session-telemetry-v1',
    status: 'running',
    active: true,
    panelCount: 1,
    panelFrameVisuals: 1,
    controllers: 2,
    inputSources: [],
    controllerRayVisuals: 2,
    hitReticleVisuals: 1,
    hover: {
      panelId: 'panel-a',
      frameTarget: { operation: 'move' },
    },
    interactionEvents: 1,
    drag: {
      active: true,
      panelId: 'panel-a',
      frameTarget: { operation: 'move' },
      resize: null,
    },
  });
  let inputCheck = summary.checks.find((check) => check.id === 'input-sources-present');

  assert.deepEqual({
    ready: summary.ready,
    inputSourcesReady: inputCheck?.status === 'ready',
    issueReported: summary.issueCodes.includes('input-sources-present'),
  }, {
    ready: false,
    inputSourcesReady: false,
    issueReported: true,
  });
});

test('invalid callable sizes fall through to live size and then static size', async () => {
  let invalidGetters = [
    () => [1.4, Number.NaN, 0.03],
    () => [1.4, 0, 0.03],
    () => [1.4, 0.9],
  ];
  let outcomes = [];
  for (let getSize of invalidGetters) {
    let harness = await createControllerHarness({
      sourceSize: [0.2, 0.2, 0.01],
      getSize,
    });
    harness.mesh.userData.xrSize = [1.1, 0.7];
    harness.mesh.userData.panel.size = [1.1, 0.7];
    harness.mesh.geometry.dispose();
    harness.mesh.geometry = new THREE.PlaneGeometry(1.1, 0.7);
    harness.frame(100);
    outcomes.push(harness.controller.getDiagnostics().lastObservation.objects[0].size);
    await harness.controller.stop();
  }

  let sourceWithoutLiveSize = new THREE.Group();
  let staticFallback = await createControllerHarness({
    spatialObject: sourceWithoutLiveSize,
    sourceSize: [0.3, 0.4, 0.02],
    getSize: () => [Number.POSITIVE_INFINITY, 0.9, 0.03],
  });
  staticFallback.frame(100);
  outcomes.push(staticFallback.controller.getDiagnostics().lastObservation.objects[0].size);
  await staticFallback.controller.stop();

  assert.deepEqual(outcomes, [
    [1.1, 0.7, 0.01],
    [1.1, 0.7, 0.01],
    [1.1, 0.7, 0.01],
    [0.3, 0.4, 0.02],
  ]);
});

test('portable action starts are consumed once and invalidated by reference-space reset', async () => {
  let frameTarget = {
    version: 'xr-panel-frame-target-v1',
    panelId: 'panel-a',
    zone: 'action',
    operation: 'focus',
    handle: null,
  };

  let duplicateEnd = await createControllerHarness();
  duplicateEnd.frame(100);
  duplicateEnd.setFrameTarget(frameTarget);
  duplicateEnd.dispatch('selectstart');
  duplicateEnd.frame(111);
  duplicateEnd.dispatch('selectend');
  duplicateEnd.dispatch('selectend');
  let duplicateState = duplicateEnd.controller.getPortablePanelState();
  let duplicateOutcome = {
    receipts: duplicateEnd.controller.getPortablePanelReceipts().length,
    layoutRevision: duplicateState.layoutRevision,
    panelRevision: duplicateState.panels[0].revision,
  };
  await duplicateEnd.controller.stop();

  let resetBetweenPhases = await createControllerHarness();
  resetBetweenPhases.frame(100);
  resetBetweenPhases.setFrameTarget(frameTarget);
  resetBetweenPhases.dispatch('selectstart');
  resetBetweenPhases.dispatchReferenceSpaceReset();
  resetBetweenPhases.frame(111);
  resetBetweenPhases.dispatch('selectend');
  let resetState = resetBetweenPhases.controller.getPortablePanelState();
  let resetOutcome = {
    receipts: resetBetweenPhases.controller.getPortablePanelReceipts().length,
    layoutRevision: resetState.layoutRevision,
    panelRevision: resetState.panels[0].revision,
  };
  await resetBetweenPhases.controller.stop();

  assert.deepEqual({ duplicateOutcome, resetOutcome }, {
    duplicateOutcome: {
      receipts: 1,
      layoutRevision: 1,
      panelRevision: 1,
    },
    resetOutcome: {
      receipts: 0,
      layoutRevision: 0,
      panelRevision: 0,
    },
  });
});

test('retained receipt readiness requires public verification and matching session identity', () => {
  let telemetry = {
    version: 'xr-three-session-telemetry-v1',
    sessionId: 'session-ready',
    status: 'running',
    active: true,
    panelCount: 1,
    panelFrameVisuals: 1,
    controllers: 2,
    inputSources: [],
    controllerRayVisuals: 2,
    hitReticleVisuals: 1,
    hover: {
      panelId: 'panel-a',
      frameTarget: { operation: 'move' },
    },
    interactionEvents: 1,
    drag: {
      active: true,
      panelId: 'panel-a',
      frameTarget: { operation: 'move' },
      resize: null,
    },
  };
  let forged = {
    accepted: true,
    phase: 'settled',
    sessionId: 'session-ready',
  };
  let matchingStore = createXRPortablePanelStore([panel()]);
  let matchingReceipt = matchingStore.focus(
    'panel-a',
    receiptContext({ sessionId: 'session-ready' }),
  );
  let mismatchedStore = createXRPortablePanelStore([panel()]);
  let mismatchedReceipt = mismatchedStore.focus(
    'panel-a',
    receiptContext({ sessionId: 'session-other' }),
  );

  function receiptReadiness(receipt, verifyReceipt) {
    let summary = createXRThreeInteractionReadinessSummary(telemetry, {
      retainedReceipt: receipt,
      expectedSessionId: 'session-ready',
      ...(verifyReceipt ? { verifyReceipt } : {}),
    });
    let inputCheck = summary.checks.find((check) => check.id === 'input-sources-present');
    return {
      ready: summary.ready,
      trusted: inputCheck?.hasTrustedReceipt === true,
    };
  }

  assert.deepEqual({
    forgedWithoutVerifier: receiptReadiness(forged),
    forgedWithPublicVerifier: receiptReadiness(forged, verifyXRPortablePanelReceipt),
    validButMismatched: receiptReadiness(mismatchedReceipt, verifyXRPortablePanelReceipt),
    validAndMatching: receiptReadiness(matchingReceipt, verifyXRPortablePanelReceipt),
  }, {
    forgedWithoutVerifier: { ready: false, trusted: false },
    forgedWithPublicVerifier: { ready: false, trusted: false },
    validButMismatched: { ready: false, trusted: false },
    validAndMatching: { ready: true, trusted: true },
  });
});

test('retained receipt readiness requires a resolved non-empty active session identity', () => {
  let telemetry = {
    version: 'xr-three-session-telemetry-v1',
    status: 'running',
    active: true,
    panelCount: 1,
    panelFrameVisuals: 1,
    controllers: 2,
    inputSources: [],
    controllerRayVisuals: 2,
    hitReticleVisuals: 1,
    hover: {
      panelId: 'panel-a',
      frameTarget: { operation: 'move' },
    },
    interactionEvents: 1,
    drag: {
      active: true,
      panelId: 'panel-a',
      frameTarget: { operation: 'move' },
      resize: null,
    },
  };
  let store = createXRPortablePanelStore([panel()]);
  let receipt = store.focus(
    'panel-a',
    receiptContext({ sessionId: 'session-ready' }),
  );

  function readiness(sessionId, expectedSessionId) {
    let summary = createXRThreeInteractionReadinessSummary({
      ...telemetry,
      ...(sessionId === undefined ? {} : { sessionId }),
    }, {
      retainedReceipt: receipt,
      verifyReceipt: verifyXRPortablePanelReceipt,
      ...(expectedSessionId === undefined ? {} : { expectedSessionId }),
    });
    let inputCheck = summary.checks.find((check) => check.id === 'input-sources-present');
    return {
      ready: summary.ready,
      trusted: inputCheck?.hasTrustedReceipt === true,
    };
  }

  assert.deepEqual({
    unresolved: readiness(undefined, undefined),
    explicitlyEmpty: readiness('', ''),
    telemetryMismatch: readiness('session-other', undefined),
    telemetryMatch: readiness('session-ready', undefined),
    explicitMatch: readiness(undefined, 'session-ready'),
  }, {
    unresolved: { ready: false, trusted: false },
    explicitlyEmpty: { ready: false, trusted: false },
    telemetryMismatch: { ready: false, trusted: false },
    telemetryMatch: { ready: true, trusted: true },
    explicitMatch: { ready: true, trusted: true },
  });
});

test('recommitting a previously hidden root makes it visible for the new session', async () => {
  let harness = await createControllerHarness({ sessionId: 'session-first' });
  await harness.controller.stop('first-stop');
  let hiddenAfterFirstStop = harness.root.visible === false;

  let restarted = await harness.controller.start('immersive-ar', {
    target: harness.target,
    controllerRayVisuals: false,
    panelHitReticle: false,
    renderFrame: false,
  });
  let recommitted = commitHarnessSpatialEvidence(harness, 'session-second', harness.root);
  let visibleAfterRecommit = harness.root.visible === true;
  await harness.controller.stop('second-stop');

  assert.deepEqual({
    hiddenAfterFirstStop,
    restarted: restarted.ok,
    recommitted: recommitted.ok,
    visibleAfterRecommit,
  }, {
    hiddenAfterFirstStop: true,
    restarted: true,
    recommitted: true,
    visibleAfterRecommit: true,
  });
});

test('invalid live userData size falls through to valid geometry before static capture size', async () => {
  let harness = await createControllerHarness({
    sourceSize: [0.2, 0.2, 0.01],
  });
  harness.mesh.userData.xrSize = [Number.NaN, 0];
  harness.mesh.userData.panel.size = [-1, Number.POSITIVE_INFINITY];
  harness.mesh.geometry.dispose();
  harness.mesh.geometry = new THREE.PlaneGeometry(1.2, 0.75);
  harness.frame(100);
  let capturedSize = harness.controller.getDiagnostics().lastObservation.objects[0].size;
  await harness.controller.stop();

  assert.deepEqual(capturedSize, [1.2, 0.75, 0.01]);
});

test('each invalid xrSize candidate falls through to valid panel size before geometry and static size', async () => {
  let invalidSizes = [
    [Number.NaN, 0.7],
    [1.1, 0],
    [Number.POSITIVE_INFINITY, 0.7],
  ];
  let outcomes = [];
  for (let invalidSize of invalidSizes) {
    let harness = await createControllerHarness({
      sourceSize: [0.3, 0.4, 0.02],
    });
    harness.mesh.userData.xrSize = invalidSize;
    harness.mesh.userData.panel.size = [1.25, 0.72];
    harness.mesh.geometry.dispose();
    harness.mesh.geometry = new THREE.PlaneGeometry(1.5, 0.9);
    harness.frame(100);
    outcomes.push(harness.controller.getDiagnostics().lastObservation.objects[0].size);
    await harness.controller.stop();
  }

  assert.deepEqual(outcomes, [
    [1.25, 0.72, 0.02],
    [1.25, 0.72, 0.02],
    [1.25, 0.72, 0.02],
  ]);
});

test('matrix-only recommit restores the fallback scene root hidden by teardown', async () => {
  let fallbackRoot = new THREE.Group();
  let harness = await createControllerHarness({
    adapterSceneRoot: fallbackRoot,
    missingRootObject: true,
    sessionId: 'session-first',
  });
  await harness.controller.stop('first-stop');
  let hiddenAfterFirstStop = fallbackRoot.visible === false;

  let restarted = await harness.controller.start('immersive-ar', {
    target: harness.target,
    controllerRayVisuals: false,
    panelHitReticle: false,
    renderFrame: false,
  });
  let recommitted = commitHarnessSpatialEvidence(harness, 'session-second');
  let visibleAfterRecommit = fallbackRoot.visible === true;
  await harness.controller.stop('second-stop');

  assert.deepEqual({
    hiddenAfterFirstStop,
    restarted: restarted.ok,
    recommitted: recommitted.ok,
    visibleAfterRecommit,
  }, {
    hiddenAfterFirstStop: true,
    restarted: true,
    recommitted: true,
    visibleAfterRecommit: true,
  });
});

test('portable panel receipt callback exceptions propagate by exact identity', async () => {
  let callbackFailure = new Error('portable-receipt-callback-failed');
  let callbackCalls = 0;
  let harness = await createControllerHarness({
    onPortablePanelReceipt() {
      callbackCalls += 1;
      throw callbackFailure;
    },
  });
  harness.frame(100);
  harness.setFrameTarget({
    version: 'xr-panel-frame-target-v1',
    panelId: 'panel-a',
    zone: 'action',
    operation: 'focus',
    handle: null,
  });
  harness.dispatch('selectstart');
  harness.frame(111);
  let thrown = null;
  try {
    harness.dispatch('selectend');
  } catch (error) {
    thrown = error;
  }
  await harness.controller.stop();

  assert.deepEqual({
    callbackCalls,
    exactFailure: thrown === callbackFailure,
  }, {
    callbackCalls: 1,
    exactFailure: true,
  });
});

test('controller teardown fact reflects failed scene removal', async () => {
  let harness = await createControllerHarness({ sceneRemoveNoop: true });
  await harness.controller.stop();
  let remainingControllers = harness.controllers.filter((controller) => (
    harness.target.scene.children.includes(controller)
  )).length;
  let snapshot = harness.controller.getFinalSessionSnapshot();

  assert.deepEqual({
    remainingControllers,
    controllersDestroyed: snapshot.facts.controllersDestroyed,
  }, {
    remainingControllers: 2,
    controllersDestroyed: false,
  });
});

test('teardown does not claim hidden root or stopped capture without performed operations', async () => {
  let missingRoot = await createControllerHarness({
    missingRootObject: true,
    noSetAnimationLoop: true,
  });
  await missingRoot.controller.stop();
  let missingRootFacts = missingRoot.controller.getFinalSessionSnapshot().facts;

  let unhideableRoot = new THREE.Group();
  Object.defineProperty(unhideableRoot, 'visible', {
    configurable: true,
    get() {
      return true;
    },
    set() {},
  });
  let unhideable = await createControllerHarness({ rootObject: unhideableRoot });
  await unhideable.controller.stop();
  let unhideableFacts = unhideable.controller.getFinalSessionSnapshot().facts;

  assert.deepEqual({
    missingRootHidden: missingRootFacts.rootHidden,
    missingCaptureStopped: missingRootFacts.captureStopped,
    unhideableRootHidden: unhideableFacts.rootHidden,
  }, {
    missingRootHidden: false,
    missingCaptureStopped: false,
    unhideableRootHidden: false,
  });
});

function reorderedPanelSnapshot(candidate) {
  return {
    sourceMetadata: {
      contentRevision: candidate.sourceMetadata.contentRevision,
      sourceId: candidate.sourceMetadata.sourceId,
    },
    revision: candidate.revision,
    focused: candidate.focused,
    pinned: candidate.pinned,
    portable: candidate.portable,
    current: {
      size: [...candidate.current.size],
      quaternion: [...candidate.current.quaternion],
      position: [...candidate.current.position],
    },
    canonical: {
      size: [...candidate.canonical.size],
      quaternion: [...candidate.canonical.quaternion],
      position: [...candidate.canonical.position],
    },
    id: candidate.id,
  };
}

test('panel restore and rejected equality ignore object key order but detect value tampering', () => {
  let restoreStore = createXRPortablePanelStore([panel()]);
  let reorderedState = structuredClone(restoreStore.getSnapshot());
  reorderedState.panels[0] = reorderedPanelSnapshot(reorderedState.panels[0]);
  let reorderedRestoreAccepted = false;
  try {
    reorderedRestoreAccepted = restoreStore.restore(reorderedState);
  } catch {}

  let tamperedRestoreStore = createXRPortablePanelStore([panel()]);
  let tamperedState = structuredClone(tamperedRestoreStore.getSnapshot());
  tamperedState.panels[0].sourceMetadata.sourceId = 'tampered-source';
  let tamperedRestoreRejected = false;
  try {
    tamperedRestoreStore.restore(tamperedState);
  } catch {
    tamperedRestoreRejected = true;
  }

  let rejectedStore = createXRPortablePanelStore([panel({ pinned: true })]);
  let rejectedReceipt = rejectedStore.settleMove(
    'panel-a',
    [0.2, 1.5, -1.2],
    [0, 0, 0, 1],
    receiptContext(),
  );
  let reorderedReceipt = structuredClone(rejectedReceipt);
  reorderedReceipt.after = reorderedPanelSnapshot(reorderedReceipt.after);
  let tamperedReceipt = structuredClone(reorderedReceipt);
  tamperedReceipt.after.sourceMetadata.sourceId = 'tampered-source';

  assert.deepEqual({
    reorderedRestoreAccepted,
    tamperedRestoreRejected,
    reorderedRejectedReceiptValid: verifyXRPortablePanelReceipt(reorderedReceipt).ok,
    tamperedRejectedReceiptInvalid: !verifyXRPortablePanelReceipt(tamperedReceipt).ok,
  }, {
    reorderedRestoreAccepted: true,
    tamperedRestoreRejected: true,
    reorderedRejectedReceiptValid: true,
    tamperedRejectedReceiptInvalid: true,
  });
});
