import {
  XR_SPATIAL_PLACEMENT_LIMITS,
  XR_SPATIAL_TOLERANCES,
  XR_SPATIAL_TRANSFORM_CONVENTION,
  XR_SPATIAL_VERSIONS,
  freezeSpatialValue,
} from '../xr/spatial-contract.js';

export let XR_SPATIAL_SCHEMA_VERSIONS = [
  {
    version: XR_SPATIAL_VERSIONS.target,
    path: 'schemas/xr-spatial-target-v1.json',
    description: 'Approved or committed metric target for root-relative XR spatial verification.',
  },
  {
    version: XR_SPATIAL_VERSIONS.observation,
    path: 'schemas/xr-spatial-observation-v1.json',
    description: 'Same-frame stereo, object, viewer, root, and input evidence captured from an XR session.',
  },
  {
    version: XR_SPATIAL_VERSIONS.audit,
    path: 'schemas/xr-spatial-audit-v1.json',
    description: 'Stable-window metric audit with orthographic, stereo, and reference-only axonometric projections.',
  },
  {
    version: XR_SPATIAL_VERSIONS.hitMap,
    path: 'schemas/xr-content-hit-map-v1.json',
    description: 'Immutable frame-bound content hit map for portable XR panel interactions.',
  },
  {
    version: XR_SPATIAL_VERSIONS.placementReceipt,
    path: 'schemas/xr-spatial-placement-receipt-v1.json',
    description: 'Paired pre-root placement evidence bound to XR session, frame, input source, hit pose, and surface normal.',
  },
  {
    version: 'xr-portable-panel-state-v1',
    path: 'schemas/xr-portable-panel-state-v1.json',
    description: 'Universal tracking representation for portable, pinned, and focused WebXR panels.',
  },
  {
    version: 'xr-portable-panel-receipt-v1',
    path: 'schemas/xr-portable-panel-receipt-v1.json',
    description: 'Deeply frozen operation receipt verifying layout adjustments, focus changes, or pinned state.',
  },
  {
    version: 'xr-frame-timing-v1',
    path: 'schemas/xr-frame-timing-v1.json',
    description: 'Summary of WebXR session frame rate performance, drop ratios, and intervals.',
  },
  {
    version: 'xr-final-session-snapshot-v1',
    path: 'schemas/xr-final-session-snapshot-v1.json',
    description: 'Sanitized post-cleanup snapshot capturing the final spatial, receipt, performance and input state.',
  },
];

export function listXRSpatialSchemas() {
  return XR_SPATIAL_SCHEMA_VERSIONS.map((schema) => ({
    ...schema,
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `https://rnd-pro.github.io/symbiote-ui/${schema.path}`,
  }));
}

export let XR_SPATIAL_EVIDENCE_CONTRACT = freezeSpatialValue({
  version: 'xr-spatial-provider-contract-v1',
  entrypoint: 'symbiote-ui/xr',
  transformConvention: XR_SPATIAL_TRANSFORM_CONVENTION,
  tolerances: XR_SPATIAL_TOLERANCES,
  placementLimits: XR_SPATIAL_PLACEMENT_LIMITS,
  schemas: listXRSpatialSchemas(),
  exports: {
    target: ['validateTarget'],
    capture: ['checkSampleEligibility', 'evaluateSample'],
    audit: ['SpatialStabilityTracker', 'verifyXRSpatialAuditEnvelope'],
    projection: ['projectTop', 'projectFront', 'projectRight', 'projectAxonometric', 'projectObservations'],
    placement: ['createXRPlacementReceipt', 'verifyXRPlacementReceipt'],
    contentSelect: ['createXRTrustedSelectReceipt', 'verifyXRTrustedSelectReceipt'],
    portablePanel: ['createXRPortablePanelStore', 'verifyXRPortablePanelReceipt', 'verifyXRPortablePanelStateSnapshot'],
  },
  verification: {
    requiresStereoEvidence: true,
    metricVerdictInputs: [
      'root-relative-object-error',
      'typed-spatial-constraints',
      'all-frame-stability',
      'same-frame-stereo-eligibility',
    ],
    minimumFrames: XR_SPATIAL_TOLERANCES.minimumFrames,
    minimumDurationMs: XR_SPATIAL_TOLERANCES.minimumDurationMs,
    projections: {
      metricReference: ['top', 'front', 'right', 'stereo'],
      referenceOnly: [{ id: 'axonometric', metric: false, affectsRuntimeVerdict: false }],
    },
  },
  interactions: {
    placement: {
      phaseVersion: XR_SPATIAL_VERSIONS.placementPhase,
      receiptVersion: XR_SPATIAL_VERSIONS.placementReceipt,
      preRoot: true,
      requiresPanelHit: false,
      requiresCommittedRoot: false,
    },
    contentSelect: {
      phaseVersion: XR_SPATIAL_VERSIONS.interactionPhase,
      receiptVersion: XR_SPATIAL_VERSIONS.trustedSelect,
      requiresPanelHit: true,
      requiresCommittedRoot: true,
    },
  },
});
