export const XR_SPATIAL_VERSIONS = Object.freeze({
  target: 'xr-spatial-target-v1',
  observation: 'xr-spatial-observation-v1',
  audit: 'xr-spatial-audit-v1',
  hitMap: 'xr-content-hit-map-v1',
  projection: 'xr-spatial-projection-v1',
  rootCommit: 'xr-spatial-root-commit-v1',
  interactionPhase: 'xr-spatial-interaction-phase-v1',
  trustedSelect: 'xr-trusted-select-receipt-v1',
  placementPhase: 'xr-spatial-placement-phase-v1',
  placementReceipt: 'xr-spatial-placement-receipt-v1',
});

export const XR_SPATIAL_TRANSFORM_CONVENTION = Object.freeze({
  matrixOrder: 'column-major',
  vectorConvention: 'column-vectors',
  quaternionOrder: 'xyzw',
  pivot: 'center',
  eulerComposition: 'T*Rz*Ry*Rx',
});

export const XR_SPATIAL_TOLERANCES = Object.freeze({
  positionMeters: 0.025,
  orientationDegrees: 2,
  cornerEdgeMeters: 0.025,
  sizeMeters: 0.025,
  minimumFrames: 30,
  minimumDurationMs: 750,
  p95TranslationJitterMeters: 0.008,
  maximumTranslationDriftMeters: 0.015,
  p95RotationJitterDegrees: 0.75,
  maximumRotationDriftDegrees: 1.5,
});

export const XR_SPATIAL_PLACEMENT_LIMITS = Object.freeze({
  maximumAgeMs: 150,
  maximumFrameAge: 2,
  maximumDurationMs: 1_000,
  maximumHitDriftMeters: 0.05,
  maximumNormalChangeDegrees: 10,
});

export const XR_SPATIAL_RUNTIME_VERDICTS = Object.freeze([
  'NOT_EVALUATED',
  'INVALID_EVIDENCE',
  'FAIL',
  'PASS',
]);

export const XR_SPATIAL_REASON = Object.freeze({
  invalidTarget: 'invalid-target',
  invalidObservation: 'invalid-observation',
  unsupportedVersion: 'unsupported-version',
  missingProvenance: 'missing-provenance',
  targetHashMismatch: 'target-hash-mismatch',
  sessionMismatch: 'session-mismatch',
  referenceSpaceMismatch: 'reference-space-mismatch',
  referenceEpochMismatch: 'reference-epoch-mismatch',
  rootMismatch: 'root-mismatch',
  rootCommitMismatch: 'root-commit-mismatch',
  frameMismatch: 'frame-mismatch',
  duplicateSequence: 'duplicate-sequence',
  outOfOrderSequence: 'out-of-order-sequence',
  sequenceGap: 'sequence-gap',
  nonMonotonicTime: 'non-monotonic-time',
  staleTimestamp: 'stale-timestamp',
  hidden: 'hidden',
  visibleBlurred: 'visible-blurred',
  posePhaseMismatch: 'pose-phase-mismatch',
  missingViewerPose: 'missing-viewer-pose',
  missingRootPose: 'missing-root-pose',
  activeGrab: 'active-grab',
  missingView: 'missing-view',
  duplicateEye: 'duplicate-eye',
  mixedFrame: 'mixed-frame',
  invalidViewport: 'invalid-viewport',
  invalidProjection: 'invalid-projection',
  invalidQuaternion: 'invalid-quaternion',
  invalidMatrix: 'invalid-matrix',
  duplicateObjectId: 'duplicate-object-id',
  objectSetMismatch: 'object-set-mismatch',
  objectInvisible: 'object-invisible',
  missingObjectPose: 'missing-object-pose',
  missingObjectSize: 'missing-object-size',
  missingInputProof: 'missing-input-proof',
  missingInputSource: 'missing-input-source',
  interactionMismatch: 'interaction-mismatch',
  hitMapMismatch: 'hit-map-mismatch',
  hitMapStale: 'hit-map-stale',
});

function freezeRecursively(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (let child of Object.values(value)) freezeRecursively(child);
  return value;
}

export function freezeSpatialValue(value) {
  return freezeRecursively(structuredClone(value));
}
