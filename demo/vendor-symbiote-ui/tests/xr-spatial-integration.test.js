import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

import {
  createXRHitMap,
  createXRTrustedSelectReceipt,
  verifyXRTrustedSelectReceipt,
} from '../xr/pointer.js';
import { XR_SPATIAL_TOLERANCES, XR_SPATIAL_TRANSFORM_CONVENTION, XR_SPATIAL_VERSIONS } from '../xr/spatial-contract.js';
import { checkSampleEligibility, verifyXRSpatialAuditEnvelope } from '../xr/spatial-evidence.js';
import { makeTransform, makeTranslation } from '../xr/spatial-math.js';
import { SpatialStabilityTracker } from '../xr/spatial-stability.js';
import { createXRThreeSessionController } from '../xr/three-webxr-adapter.js';

let directory = dirname(fileURLToPath(import.meta.url));
let identity = makeTransform([0, 0, 0], [0, 0, 0, 1]);
let rootMatrix = makeTranslation(10, 0, 0);
let objectMatrix = makeTranslation(10, 0, -2);
let inputMatrix = makeTranslation(10, 0, -1);
let projectionMatrix = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, -1.002002002002002, -1,
  0, 0, -0.20020020020020018, 0,
];

function createTarget() {
  return {
    version: XR_SPATIAL_VERSIONS.target,
    targetId: 'assembly-target',
    contentHash: 'sha256:assembly-target',
    provenance: {
      kind: 'approved',
      sourceId: 'approved-layout',
      commitId: null,
      derivedFromHash: null,
    },
    units: 'meters',
    transformConvention: { ...XR_SPATIAL_TRANSFORM_CONVENTION },
    tolerances: { ...XR_SPATIAL_TOLERANCES },
    requiredEvidenceProfile: {
      profileId: 'native-stereo-interaction',
      stereoRequired: true,
      inputProof: 'interaction-proof',
      maximumSampleAgeMs: 50,
    },
    objects: [{
      id: 'assembly',
      expectedPose: { position: [0, 0, -2], quaternion: [0, 0, 0, 1] },
      expectedMatrix: makeTransform([0, 0, -2], [0, 0, 0, 1]),
      size: [0.2, 0.2, 0.2],
    }],
    constraints: [
      {
        id: 'assembly-depth',
        type: 'datum',
        objectId: 'assembly',
        axis: 'z',
        expectedCoordinate: -2,
        tolerance: 0.005,
      },
      {
        id: 'assembly-safe',
        type: 'safety-state',
        objectId: 'assembly',
        requiredState: 'ready',
      },
    ],
  };
}

function createController() {
  let listeners = new Map();
  return {
    children: [],
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    dispatch(type, event) {
      listeners.get(type)?.(event);
    },
    add() {},
    remove() {},
  };
}

function createRuntime() {
  let sessionListeners = new Map();
  let referenceListeners = new Map();
  let referenceSpace = {
    addEventListener(type, listener) {
      referenceListeners.set(type, listener);
    },
    removeEventListener(type) {
      referenceListeners.delete(type);
    },
  };
  let inputSource = {
    id: 'controller-right',
    handedness: 'right',
    targetRayMode: 'tracked-pointer',
    profiles: ['generic-trigger'],
    targetRaySpace: {},
    gripSpace: {},
  };
  let session = {
    visibilityState: 'visible',
    enabledFeatures: ['local-floor'],
    inputSources: [inputSource],
    renderState: {
      baseLayer: {
        getViewport(view) {
          return view.eye === 'left'
            ? { x: 0, y: 0, width: 512, height: 512 }
            : { x: 512, y: 0, width: 512, height: 512 };
        },
      },
    },
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
  let controllers = [createController(), createController()];
  let renderer = {
    windowAnimationLoopCalls: 0,
    xr: {
      async setSession() {},
      getReferenceSpace() {
        return referenceSpace;
      },
      getController(index) {
        return controllers[index];
      },
      setAnimationLoop(callback) {
        renderer.animationLoop = callback;
      },
    },
    setAnimationLoop(callback) {
      this.windowAnimationLoopCalls += 1;
      this.animationLoop = callback;
    },
    render() {},
  };
  let scene = {
    background: 'opaque',
    add() {},
    remove() {},
  };
  return { controllers, inputSource, referenceSpace, renderer, scene, session };
}

function createViewerPose() {
  return {
    transform: { matrix: rootMatrix },
    views: [
      {
        eye: 'left',
        transform: { inverse: { matrix: makeTranslation(-9.97, 0, 0) } },
        projectionMatrix,
      },
      {
        eye: 'right',
        transform: { inverse: { matrix: makeTranslation(-10.03, 0, 0) } },
        projectionMatrix,
      },
    ],
  };
}

function createFrame(time, viewerPoseCalls) {
  return {
    predictedDisplayTime: time,
    getViewerPose() {
      viewerPoseCalls.count += 1;
      return createViewerPose();
    },
    getPose() {
      return { transform: { matrix: inputMatrix } };
    },
  };
}

async function loadSchemas() {
  let names = [
    'xr-spatial-target-v1.json',
    'xr-spatial-observation-v1.json',
    'xr-spatial-audit-v1.json',
  ];
  return Promise.all(names.map(async (name) => JSON.parse(await readFile(resolve(directory, '..', 'schemas', name), 'utf8'))));
}

test('Three adapter joins committed root evidence, trusted selects, and a schema-valid 30-frame audit', async () => {
  let runtime = createRuntime();
  let viewerPoseCalls = { count: 0 };
  let applyViewerPoseCalls = 0;
  let hits = [];
  let observations = [];
  let interactionPhases = [];
  let adapter = {
    async setSession(session) {
      return { ok: true, session, referenceSpace: runtime.referenceSpace };
    },
    applyViewerPose() {
      applyViewerPoseCalls += 1;
      return { ok: true, rootTransform: { mode: 'viewer-relative' } };
    },
    controllerRays: {
      getHits() {
        return hits;
      },
      getState() {
        return { dragging: false, panelId: null };
      },
      updateDrag() {
        return { ok: true };
      },
    },
    listPanelMeshes() {
      return [];
    },
    getDiagnostics() {
      return { ok: true };
    },
  };
  let globalThis = {
    navigator: {
      xr: {
        async requestSession() {
          return runtime.session;
        },
      },
    },
  };
  let controller = createXRThreeSessionController({
    globalThis,
    adapter,
    onObservation(observation) {
      observations.push(observation);
    },
  });
  let started = await controller.start('immersive-ar', {
    target: { ok: true, renderer: runtime.renderer, camera: {}, scene: runtime.scene },
    controllerRayVisuals: false,
    panelHitReticle: false,
    renderFrame: false,
  });
  assert.equal(started.ok, true, JSON.stringify(started));
  assert.equal(runtime.renderer.windowAnimationLoopCalls, 0, 'active XR loop must not restart window RAF');

  runtime.renderer.animationLoop(0, createFrame(0, viewerPoseCalls));
  assert.equal(observations.length, 0, 'capture remains disabled before root commit');
  assert.equal(applyViewerPoseCalls, 1, 'non-committed scene may initialize from the viewer');

  let target = createTarget();
  let panelInteraction = null;
  let evidenceConfig = {
    spatialTarget: target,
    provenance: {
      runtimeId: 'three-webxr',
      runtimeVersion: '1.0.0',
      appId: 'reference-xr-host',
      buildHash: 'sha256:build',
      deviceId: 'device-1',
      deviceKind: 'headset',
      emulation: 'native',
    },
    sessionId: 'session-1',
    referenceSpaceId: 'reference-space-1',
    rootPolicy: {
      mode: 'world-locked',
      id: 'root-1',
      commitId: 'root-commit-1',
      matrix: rootMatrix,
    },
    spatialObjects: [{
      id: 'assembly',
      worldMatrix: objectMatrix,
      size: [0.2, 0.2, 0.2],
      visible: true,
      state: 'ready',
    }],
    resolvePanelInteraction() {
      return panelInteraction;
    },
    onInteraction(receipt) {
      interactionPhases.push(receipt);
    },
  };
  assert.deepEqual(controller.commitSpatialEvidence({
    ...evidenceConfig,
    spatialObjects: [],
  }), { ok: false, reason: 'invalid-spatial-object-sources' });
  let committed = controller.commitSpatialEvidence(evidenceConfig);
  assert.equal(committed.ok, true);
  assert.equal(Object.isFrozen(committed.committed.matrix), true);

  for (let index = 0; index < 30; index += 1) {
    let time = 100 + index * 26;
    runtime.renderer.animationLoop(time, createFrame(time, viewerPoseCalls));
  }
  assert.equal(observations.length, 30);
  assert.equal(viewerPoseCalls.count, 31, 'getViewerPose is called exactly once per XR frame');
  assert.equal(applyViewerPoseCalls, 1, 'committed world root never follows subsequent viewer poses');

  let [targetSchema, observationSchema, auditSchema] = await loadSchemas();
  let ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addSchema(targetSchema);
  ajv.addSchema(observationSchema);
  let validateObservation = ajv.getSchema(observationSchema.$id);
  let validateAudit = ajv.compile(auditSchema);
  for (let observation of observations) {
    assert.equal(validateObservation(observation), true, ajv.errorsText(validateObservation.errors));
    assert.deepEqual(checkSampleEligibility(target, observation, { now: observation.frame.captureTime }).reasons, []);
  }

  let tracker = new SpatialStabilityTracker(target);
  for (let observation of observations) {
    tracker.addFrame(observation, { now: observation.frame.captureTime });
  }
  let audit = tracker.getAudit();
  assert.equal(audit.runtimeVerdict, 'PASS');
  assert.equal(audit.stability.frameCount, 30);
  assert.equal(audit.stability.durationMs, 754);
  assert.equal(audit.projections.orthographic.status, 'READY');
  assert.equal(audit.projections.axonometric.status, 'READY');
  assert.equal(audit.projections.axonometric.referenceOnly, true);
  assert.equal(audit.projections.axonometric.metric, false);
  assert.equal(audit.projections.stereo.status, 'READY');
  assert.equal(validateAudit(audit), true, ajv.errorsText(validateAudit.errors));
  let auditVerification = verifyXRSpatialAuditEnvelope(audit, {
    targetId: 'assembly-target',
    targetHash: 'sha256:assembly-target',
    sessionId: 'session-1',
    referenceSpaceId: 'reference-space-1',
    resetEpoch: 1,
    rootId: 'root-1',
    rootCommitId: 'root-commit-1',
    buildHash: 'sha256:build',
    deviceId: 'device-1',
    runtimeVerdict: 'PASS',
    now: observations.at(-1).frame.captureTime,
    maximumAgeMs: 50,
  });
  assert.deepEqual(auditVerification, { ok: true, reasons: [] });
  let tamperedAudit = structuredClone(audit);
  tamperedAudit.runtimeVerdict = 'FAIL';
  assert.equal(verifyXRSpatialAuditEnvelope(tamperedAudit).ok, false);

  let latest = observations.at(-1).frame;
  let hitMap = createXRHitMap({
    version: XR_SPATIAL_VERSIONS.hitMap,
    panelId: 'panel-1',
    contentHash: 'sha256:panel-content',
    revision: 7,
    coordinateSpace: 'normalized',
    viewport: { width: 1_000, height: 600 },
    capture: {
      sessionId: 'session-1',
      frameId: latest.id,
      sequence: latest.sequence,
      time: latest.time,
    },
    targets: [{
      id: 'replace-action',
      action: 'replace',
      bounds: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
    }],
  });
  panelInteraction = {
    hitMap,
    contentHash: 'sha256:panel-content',
    revision: 7,
  };
  hits = [{
    object: { userData: { panelId: 'panel-1' } },
    uv: { x: 0.2, y: 0.8 },
    point: null,
    frameTarget: null,
  }];
  runtime.controllers[0].dispatch('selectstart', { type: 'selectstart', data: runtime.inputSource });
  runtime.controllers[0].dispatch('selectend', { type: 'selectend', data: runtime.inputSource });
  assert.equal(interactionPhases.length, 2);
  assert.equal(interactionPhases[0].phase, 'selectstart');
  assert.equal(interactionPhases[0].inputSourceId, 'controller-right');
  assert.equal(interactionPhases[1].phase, 'selectend');
  assert.equal(interactionPhases[1].startEventId, interactionPhases[0].eventId);
  assert.equal(interactionPhases[1].targetId, 'replace-action');
  assert.equal(interactionPhases[1].inputSourceId, 'controller-right');
  assert.equal(Object.isFrozen(interactionPhases[1]), true);
  let trustedSelect = createXRTrustedSelectReceipt(interactionPhases[0], interactionPhases[1]);
  assert.deepEqual(verifyXRTrustedSelectReceipt(trustedSelect, {
    sessionId: 'session-1',
    inputSourceId: 'controller-right',
    panelId: 'panel-1',
    targetId: 'replace-action',
    contentHash: 'sha256:panel-content',
    revision: 7,
    spatialTargetHash: 'sha256:assembly-target',
    rootCommitId: 'root-commit-1',
    maximumDurationMs: 50,
    now: interactionPhases[1].timestamp,
    maximumAgeMs: 50,
  }), { ok: true, reasons: [] });
  let tamperedSelect = structuredClone(trustedSelect);
  tamperedSelect.revision = 8;
  assert.equal(verifyXRTrustedSelectReceipt(tamperedSelect).ok, false);

  runtime.controllers[0].dispatch('selectstart', { type: 'selectstart', data: runtime.inputSource });
  panelInteraction = { ...panelInteraction, revision: 8 };
  runtime.controllers[0].dispatch('selectend', { type: 'selectend', data: runtime.inputSource });
  assert.equal(interactionPhases.length, 3, 'mismatched selectend does not create a trusted phase');

  let observationCount = observations.length;
  let recommitted = controller.commitSpatialEvidence({
    ...evidenceConfig,
    rootPolicy: {
      mode: 'world-locked',
      id: 'root-1',
      commitId: 'root-commit-2',
      matrix: rootMatrix,
    },
    spatialObjects: [{
      id: 'assembly',
      getWorldMatrix() {
        throw new Error('object-pose-unavailable');
      },
      size: [0.2, 0.2, 0.2],
      visible: true,
      state: 'ready',
    }],
  });
  assert.equal(recommitted.ok, true);
  runtime.renderer.animationLoop(1_000, createFrame(1_000, viewerPoseCalls));
  assert.equal(observations.length, observationCount + 1);
  assert.equal(observations.at(-1).objects[0].matrix, null);
  assert.equal(observations.at(-1).objects[0].pose, null);
  assert.equal(validateObservation(observations.at(-1)), true, ajv.errorsText(validateObservation.errors));
  assert.equal(checkSampleEligibility(target, observations.at(-1), {
    now: observations.at(-1).frame.captureTime,
  }).eligible, false);

  await controller.stop();
  assert.equal(controller.getDiagnostics().status, 'idle');
});
