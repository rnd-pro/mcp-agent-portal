# XR Spatial Evidence

`symbiote-ui/xr` provides renderer-neutral contracts for proving that a
world-locked XR layout matches an approved metric target. The contracts keep
placement, capture, audit, and app-owned portable panel interaction as separate
steps so no stage depends on evidence that can only exist later.

## Placement before root commit

The host owns its `XRSession`, reference space, hit-test source, reticle, and
session select listeners. For `selectstart` and `selectend`, it records the
current frame identity, input-source identity, real hit-test result identity,
hit pose, and normalized surface normal as
`xr-spatial-placement-phase-v1` values.

```js
import {
  createXRPlacementReceipt,
  verifyXRPlacementReceipt,
} from 'symbiote-ui/xr/pointer';

let receipt = createXRPlacementReceipt(selectStart, selectEnd);
let verification = verifyXRPlacementReceipt(receipt, {
  sessionId: activeSessionId,
  referenceSpaceId,
  now: currentFrameTime,
  frameSequence: currentFrameSequence,
  minimumHoldMs: 10,
  maximumHitDriftMeters: 0.02,
  maximumNormalChangeDegrees: 5,
});
```

The verifier requires an expected session plus an explicit current clock and
frame sequence. It checks exact phase pairing, freshness, hold duration, hit
drift, normal change, pose/matrix consistency, and that each normal matches the
hit pose's local positive-Y axis. A placement receipt has no panel, content,
spatial-target, or committed-root fields.

After the host accepts the placement, it commits the world root and calls the
Three session controller's `commitSpatialEvidence(config)`. Spatial observation
capture remains disabled before that commit.

## Target, observation, and audit

The evidence lifecycle uses three strict versions:

1. `xr-spatial-target-v1` fixes provenance, meters, column-major transforms,
   object poses and sizes, typed constraints, tolerances, and required stereo
   input evidence.
2. `xr-spatial-observation-v1` binds one XR frame to its session, reference-space
   epoch, committed root, viewer pose, left/right views, objects, and controller
   or hand input.
3. `xr-spatial-audit-v1` aggregates only eligible consecutive observations and
   reports metric object/constraint errors, stability, and visual projections.

```js
import {
  SpatialStabilityTracker,
  verifyXRSpatialAuditEnvelope,
} from 'symbiote-ui/xr';

let tracker = new SpatialStabilityTracker(target);
tracker.addFrame(observation, { now: observation.frame.captureTime });

let audit = tracker.getAudit();
let verified = verifyXRSpatialAuditEnvelope(audit, {
  targetHash: target.contentHash,
  sessionId,
  rootCommitId,
  minimumFrameCount: 30,
  minimumDurationMs: 750,
});
```

`minimumFrameCount` and `minimumDurationMs` are lower bounds. The default stable
window requires at least 30 consecutive frames spanning at least 750 ms. Every
accepted frame contributes to object, typed-constraint, jitter, and drift
results. An ineligible frame resets the window while preserving the rejection
reason in the audit envelope.

## Projection panes

`projectObservations()` returns target and observed overlays for a deterministic
2×2 reference layout:

| Pane | Axes | Contract |
| --- | --- | --- |
| Top | `+x`, `-z` | metric, meters |
| Front | `+x`, `-y` | metric, meters |
| Right | `-z`, `-y` | metric, meters |
| Axonometric | deterministic oblique basis | `referenceOnly: true`, `metric: false` |

The three orthographic panes preserve shared metric coordinates for line and
relative-position comparison. `projectAxonometric(point, anchor)` supplies the
fourth visual reference pane. Axonometric output never changes `PASS` or `FAIL`;
runtime verdicts depend on root-relative metric errors, typed constraints,
all-frame stability, and same-frame stereo eligibility.

Stereo projections use each eye's real view matrix, projection matrix, and
viewport. Invalid matrices, missing eyes, non-positive clip `w`, and out-of-range
depth produce explicit `UNAVAILABLE` results.

## Portable panel interaction

App-owned portable panels use immutable `xr-content-hit-map-v1` maps. A trusted
content action requires a fresh, exact `selectstart`/`selectend` pair bound to
the same session, input source, panel, content hash, revision, target, committed
root, and spatial target:

```js
import {
  createXRTrustedSelectReceipt,
  verifyXRTrustedSelectReceipt,
} from 'symbiote-ui/xr/pointer';
```

This post-commit content contract is intentionally distinct from the pre-root
placement receipt.

### Panel State & Layout Contracts

Layout and configuration for portable panels are managed through a conformed, nested schema structure where each panel object nested within the panels array specifies its `canonical` (original) and `current` (actual) transformation parameters:

```json
{
  "id": "panel-a",
  "canonical": {
    "position": [0, 1.35, -1.8],
    "quaternion": [0, 0, 0, 1],
    "size": [0.8, 0.45]
  },
  "current": {
    "position": [0.2, 1.35, -1.8],
    "quaternion": [0, 0, 0, 1],
    "size": [0.8, 0.45]
  },
  "portable": true,
  "pinned": false,
  "focused": true,
  "revision": 1,
  "sourceMetadata": {}
}
```

The state lifecycle, receipts, and snapshots are managed using the following functions:

*   `createXRPortablePanelStore(initialPanels, storeOptions)`: Creates a store to perform layout changes (focus, pin toggle, reset, settle move, settle resize).
*   `verifyXRPortablePanelReceipt(receipt)`: Verifies sequence order, non-finite values, unit quaternions, and deep-freeze invariants for layout receipts.
*   `verifyXRPortablePanelStateSnapshot(snapshot, options)`: Verifies key structures and consistency of panel state snapshots.

Each WebXR panel frame exposes close, reset, pin, and fullscreen controls. The
first three mutate the portable store and produce receipts. Fullscreen remains
a layout-host concern: `createXRThreeSessionController({ onPanelFullscreen })`
emits an `xr-panel-fullscreen-intent-v1` toggle intent so the owning layout can
apply the same fullscreen policy as `layout-node` without mixing viewport
policy into persisted spatial pose state.


## Explicit browser emulation

Native WebXR remains the default. A host that explicitly opts into IWER can
request replacement of an existing browser `navigator.xr` runtime:

```js
let result = await installWebXREmulationRuntime({
  globalThis,
  module: IWER,
  profile: 'metaQuest3',
  preferNative: false,
});
```

For IWER 2.3, `preferNative: false` maps to
`device.installRuntime({ globalObject, forceInstall: true })`. Without that
explicit opt-in, an existing native runtime is preserved. Emulator output must
remain labelled as non-device evidence.

## Published schemas

| Version | Package path |
| --- | --- |
| `xr-spatial-target-v1` | `symbiote-ui/schemas/xr-spatial-target-v1.json` |
| `xr-spatial-observation-v1` | `symbiote-ui/schemas/xr-spatial-observation-v1.json` |
| `xr-spatial-audit-v1` | `symbiote-ui/schemas/xr-spatial-audit-v1.json` |
| `xr-content-hit-map-v1` | `symbiote-ui/schemas/xr-content-hit-map-v1.json` |
| `xr-spatial-placement-receipt-v1` | `symbiote-ui/schemas/xr-spatial-placement-receipt-v1.json` |
| `xr-portable-panel-state-v1` | `symbiote-ui/schemas/xr-portable-panel-state-v1.json` |
| `xr-portable-panel-receipt-v1` | `symbiote-ui/schemas/xr-portable-panel-receipt-v1.json` |
| `xr-frame-timing-v1` | `symbiote-ui/schemas/xr-frame-timing-v1.json` |
| `xr-final-session-snapshot-v1` | `symbiote-ui/schemas/xr-final-session-snapshot-v1.json` |

The same descriptors and verdict semantics are available through
`symbiote-ui/manifest` and `symbiote-ui discover` under
`manifest.xrSpatialEvidence`.
