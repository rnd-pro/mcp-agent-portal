import {
  XR_SPATIAL_TOLERANCES,
  XR_SPATIAL_TRANSFORM_CONVENTION,
  XR_SPATIAL_VERSIONS,
} from '../xr/spatial-contract.js';
import { makeTransform, makeTranslation } from '../xr/spatial-math.js';

export let XR_TEST_IDENTITY = makeTransform([0, 0, 0], [0, 0, 0, 1]);

export let XR_TEST_PROJECTION = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, -1.002002002002002, -1,
  0, 0, -0.20020020020020018, 0,
];

export function createSpatialTarget() {
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
      profileId: 'stereo-interaction',
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

export function createSpatialObservation(options = {}) {
  let sequence = options.sequence ?? 1;
  let time = options.time ?? sequence * 26;
  let resetEpoch = options.resetEpoch ?? 1;
  let frameId = options.frameId || `session-1:${resetEpoch}:${sequence}`;
  let objectPosition = options.objectPosition || [0, 0, -2];
  let objectQuaternion = options.objectQuaternion || [0, 0, 0, 1];
  let objectMatrix = makeTransform(objectPosition, objectQuaternion);
  let views = options.views || [
    {
      frameId,
      eye: 'left',
      viewMatrix: makeTranslation(0.03, 0, 0),
      projectionMatrix: [...XR_TEST_PROJECTION],
      viewport: { x: 0, y: 0, width: 512, height: 512 },
    },
    {
      frameId,
      eye: 'right',
      viewMatrix: makeTranslation(-0.03, 0, 0),
      projectionMatrix: [...XR_TEST_PROJECTION],
      viewport: { x: 512, y: 0, width: 512, height: 512 },
    },
  ];
  let inputs = options.inputs || [{
    frameId,
    sourceId: 'controller-right',
    kind: 'controller',
    handedness: 'right',
    profiles: ['generic-trigger'],
    targetRay: {
      matrix: makeTranslation(0, 0, -1),
      origin: [0, 0, -1],
      direction: [0, 0, -1],
    },
    grip: { matrix: makeTranslation(0, 0, -1) },
  }];
  return {
    version: XR_SPATIAL_VERSIONS.observation,
    observationId: `${frameId}:observation`,
    targetHash: 'sha256:assembly-target',
    provenance: {
      runtimeId: 'three-webxr',
      runtimeVersion: '1.0.0',
      appId: 'reference-xr-host',
      buildHash: 'sha256:build',
      deviceId: 'device-1',
      deviceKind: 'headset',
      emulation: 'native',
    },
    session: {
      id: 'session-1',
      mode: 'immersive-ar',
      visibility: options.visibility || 'visible',
    },
    frame: {
      id: frameId,
      sequence,
      time,
      predictedDisplayTime: options.predictedDisplayTime ?? time,
      captureTime: options.captureTime ?? time,
    },
    referenceSpace: {
      id: 'reference-space-1',
      type: 'local-floor',
      resetEpoch,
    },
    root: {
      id: 'root-1',
      commitId: 'root-commit-1',
      matrix: [...XR_TEST_IDENTITY],
      pose: { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
    },
    posePhase: 'committed',
    viewerPose: {
      matrix: [...XR_TEST_IDENTITY],
      pose: { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
    },
    activeGrab: options.activeGrab || { active: false, sourceId: null, objectId: null },
    views,
    objects: [{
      frameId,
      id: 'assembly',
      matrix: objectMatrix,
      pose: { position: [...objectPosition], quaternion: [...objectQuaternion] },
      size: options.objectSize || [0.2, 0.2, 0.2],
      visible: options.objectVisible ?? true,
      state: options.objectState ?? 'ready',
    }],
    inputs,
  };
}

export function createHitMapDescriptor(options = {}) {
  return {
    version: XR_SPATIAL_VERSIONS.hitMap,
    panelId: options.panelId || 'panel-1',
    contentHash: options.contentHash || 'sha256:panel-content',
    revision: options.revision ?? 7,
    coordinateSpace: options.coordinateSpace || 'normalized',
    viewport: options.viewport || { width: 1_000, height: 600 },
    capture: options.capture || {
      sessionId: 'session-1',
      frameId: 'session-1:1:10',
      sequence: 10,
      time: 100,
    },
    targets: options.targets || [{
      id: 'replace-action',
      action: 'replace',
      bounds: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
    }],
  };
}

export function createInteractionPhase(phase, options = {}) {
  let isEnd = phase === 'selectend';
  return {
    version: XR_SPATIAL_VERSIONS.interactionPhase,
    eventId: isEnd ? 'event-end' : 'event-start',
    phase,
    sessionId: 'session-1',
    frameId: isEnd ? 'session-1:1:11' : 'session-1:1:10',
    frameSequence: isEnd ? 11 : 10,
    timestamp: isEnd ? 120 : 100,
    inputSourceId: 'controller-right',
    inputKind: 'controller',
    handedness: 'right',
    profiles: ['generic-trigger'],
    uv: { x: 0.2, y: 0.2 },
    contentPoint: { x: 200, y: 120 },
    panelId: 'panel-1',
    targetId: 'replace-action',
    action: 'replace',
    contentHash: 'sha256:panel-content',
    revision: 7,
    startEventId: isEnd ? 'event-start' : null,
    spatialTargetHash: 'sha256:assembly-target',
    rootCommitId: 'root-commit-1',
    ...options,
  };
}

export function createPlacementPhase(phase, options = {}) {
  let isEnd = phase === 'selectend';
  let position = isEnd ? [1.01, 0, -1] : [1, 0, -1];
  return {
    version: XR_SPATIAL_VERSIONS.placementPhase,
    eventId: isEnd ? 'placement-event-end' : 'placement-event-start',
    phase,
    sessionId: 'session-1',
    frameId: isEnd ? 'session-1:placement:11' : 'session-1:placement:10',
    frameSequence: isEnd ? 11 : 10,
    timestamp: isEnd ? 120 : 100,
    referenceSpaceId: 'reference-space-1',
    inputSourceId: 'controller-right',
    inputKind: 'controller',
    handedness: 'right',
    profiles: ['generic-trigger'],
    hitTestResultId: isEnd ? 'hit-result-11' : 'hit-result-10',
    hitPose: {
      matrix: makeTransform(position, [0, 0, 0, 1]),
      pose: { position, quaternion: [0, 0, 0, 1] },
    },
    surfaceNormal: [0, 1, 0],
    startEventId: isEnd ? 'placement-event-start' : null,
    ...options,
  };
}
