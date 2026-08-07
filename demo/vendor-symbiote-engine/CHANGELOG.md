# Changelog

## Unreleased

## 0.3.0-alpha.14

- Upgraded the public caption placement track contract to `caption-presentation-track-v3`.
- Stopped manufacturing fallback cue IDs in `assignCanonicalCaptionCueIds` and enforced strict unique safe cue ID validation matching `/^[a-z][a-z0-9._:-]*$/` across entry points.
- Refactored caption placement taxonomy: limited `switchReason` to `'initialization'`, `'collision'`, `'safe-bounds'`, and `null`. Set `switchReason` to `null` for retained slots.
- Added explicit reconstructable decision evidence (`decision` and `discontinuity`) to cues.
- Separated compact focus intersection, active-caption intersection, and other collision evidence. Relocated cues now carry `collidedRegions` details of IDs and kinds.
- Enhanced track hash coverage in `computeTrackHash` to cover the entire track object minus the `trackHash` key.
- Hardened `parseAss` to fail closed on malformed/non-finite timestamps, start/end timing anomalies, duplicate or unsafe Effect IDs, and invalid placement tags.

## 0.3.0-alpha.13

- Retain an active caption slot until its measured rectangle actually intersects an attention region; placement search still keeps a small visual gap after a forced move.
- Reflow reused slots that no longer fit, validate continuity controls before output, and preserve adjacent source cue identities through VTT generation.
- Exported `CAPTION_PRESENTATION_TRACK_VERSION` for the canonical v3 contract and
  made `cueId` an explicit, nonempty requirement; legacy `id`, `index`, and
  synthesized identities no longer satisfy caption placement or range
  attribution.
- Preserved cue indexes, scene-boundary/reset/discontinuity evidence, and the
  configured continuity gap when v3 placement tracks are shifted and rebuilt.
- Upgraded the public caption placement track contract to `caption-presentation-track-v3`.
- Corrected proof metrics: `hardCollisionCount` and `safeBoundsViolationCount` now count only unresolved final defects (which are zero for successfully placed tracks).
- Added `forcedCollisionRelocationCount` and `forcedSafeBoundsRelocationCount` to count successfully resolved relocations.
- Fixed `unforcedSwitchCount` to not increment during allowed discontinuity resets.
- Fixed `pingPongCount` to describe actual output A-B-A transitions and report zero on successful tracks.
- Persisted `continuityGapMs` in the track contract and preserved explicit cue scene/discontinuity/reset evidence (`sceneBoundary`/`discontinuity`/`resetContinuity` flags) to ensure exact canonical reconstruction.
- Standardized exact anchor definition (alignment, x, y, wrap width, line budget, and font size) to allow reuse while preventing forced relocation for line budget or metric overflow unless they violate safe bounds or collide.
- Updated WebVTT generation to emit canonical `cueId` as the WebVTT cue identifier and added uniqueness validation.
- Preserved explicitly measured capture teardown evidence (`cleanupOk` and
  `cleanupErrors`) through render-artifact normalization, with strict boolean
  and string-array validation so downstream proof gates cannot infer cleanup.
- Added canonical five-word timed caption chunks and adaptive collision-aware
  caption placement. Live and rendered captions can rewrap into safe side
  columns with matching ASS anchors while still failing closed when every
  readable zone is occupied. Narrow safe side columns receive an adaptive
  six-line budget for canonical five-word, speaker-labelled cues, preserving
  the configured font size while the normal full-width line limit stays intact.
  When a long word alone exceeds a collision-free shelf, the cue now selects
  the largest readable font down to the output-relative accessibility floor;
  the same measured cue typography is retained by live DOM and ASS output.
  Caption profiles now carry a validated regular/bold weight; conservative
  weight-aware metrics and a regular-weight vertical preset prevent live and
  ASS text from being clipped by narrow columns.
- Added a neutral, versioned Linux-native render provider surface (contracts
  plus pure orchestration primitives; no Docker/Xvfb/Chromium, FFmpeg, GPU, or
  UI implementation). It declares three execution tiers — `sequential-realtime`
  (the universal baseline for arbitrary non-cooperative sites, with no
  segment-parallelism claim), `replayable-segment`, and
  `checkpointed-deterministic` — and never encodes parallelism as a universal
  requirement.
- Added independent renderer and encoder capability negotiation
  (`render-capability` contract + `selectRenderAcceleration`). Selection
  receipts carry evidence, requested policy, allowed fallback, and explicit
  rejection reasons. Usability has one source of truth,
  `accelerationCandidateProven`: a renderer is proven only with an
  `available` `renderer-identity` probe carrying a non-empty actual identity,
  and an encoder only with an `available` `real-encode` probe carrying
  `encodeOk:true`. A device node or probe-name flag alone is never usable,
  failed evidence stays representable for rejection receipts, a required
  backend/codec with no proven candidate fails closed, and fallback is never
  silent.
- Added a versioned native encoded-segment job (`native-segment-job/1`) and
  artifact (`native-segment/1`) contract, wired into `normalizeRenderJob` and
  `normalizeRenderArtifact` for the `native-segment` kind with no legacy
  passthrough. The job structurally validates execution tier, inclusive
  logical/capture frame ranges (capture enclosing logical) with consistent
  preroll/postroll, tier-appropriate continuation (continuous / replay ref+hash
  / checkpoint ref+hash), UI-clock mode and rate (wall-clock at exactly 1x for
  sequential and replayable work; render-time or non-1x acceleration only for
  checkpointed-deterministic with a clock-equivalence proof reference),
  viewport, rational frame-rate/time-base with an exact integer
  `frameDurationTicks`, a normalized capability request with explicit fallback
  policy (with `capability.tier` equal to the job tier and any requested encoder
  codec equal to the video codec), container/video/audio codec and color/audio
  stream-layout parameters, source/settings hashes, a positive timeout, and
  portable (non-AbortSignal, non-host-policy) cancellation and cleanup
  references. Segments carry an exact `frameDurationTicks` cadence cross-checked
  against frame-rate and time-base, and self-contained inclusive logical
  `frameRange` plus enclosing `captureRange` with consistent preroll/postroll.
  The artifact additionally requires an opaque master media reference
  (`mediaRef`) and portable non-empty string cleanup/continuation/clock
  references (objects and functions are rejected, never coerced), a selection
  receipt whose tier matches, whose `ok` is true, and whose selected renderer and
  encoder are semantically proven and codec-consistent, whose selected backend
  and codec either satisfy the requested policy or carry an explicitly allowed
  fallback, tier-bound clock evidence (wall-clock at 1x for
  sequential and replayable work; render-time or non-1x only for
  checkpointed-deterministic with an equivalence proof reference), tier-bound
  continuation evidence, and a passing (`ok:true`) proof verdict. It cross-checks
  frame count/range, `fps` against the rational frame-rate within tolerance,
  `durationSec` against the exact frame-count/cadence/time-base with only a
  microsecond-scale numeric tolerance, dimensions, PTS
  cadence, and tier; and when the engine registry supplies the originating job it
  additionally reconciles the artifact against that job's tier, logical/capture
  ranges, preroll/postroll, continuation, UI clock, geometry, cadence, hashes,
  complete capability/selection request, continuation hashes, clock-equivalence
  proof, and cleanup reference.
- Added segment compatibility and concat planning (`planSegmentConcat` +
  `buildSegmentConcatArgs`). Stream-copy requires positive compatibility
  evidence — container, codec, geometry, rational time-base, pixel format,
  color space/primaries/transfer/range/chroma, a video extradata hash, a stream
  layout hash, and (when audio exists) audio codec/sample-rate/channels/layout/
  time-base/extradata — and fails closed when any is missing. Color, audio
  layout, codec, geometry, time-base, extradata, and stream-layout mismatches
  are separately reported, logical frame ranges must be contiguous and
  non-overlapping, and adjacent boundary PTS must be exactly one
  `frameDurationTicks` apart (no floating tolerance). Frame-range and PTS
  gaps/overlaps are fatal even under `allowReencode` — re-encode may reconcile
  codec/color/layout but can never invent missing or overlapping source frames —
  concat groups split at every incompatible boundary so each returned group is
  internally concat-safe, and an empty segment list, duplicate segment ids, and a
  non-boolean re-encode policy are rejected; re-encode is always explicit.
- Added seam policy and proof helpers for exact and perceptual seams over a
  strictly versioned seam-boundary input (`render-seam-input/1`) that requires an
  explicit canonical `overlapOwner` for every seam. The segment-seam proof
  rejects duplicate boundary PTS, frame gaps/overlaps, PTS gaps/overlaps,
  ownership mismatches, and unproven exact/perceptual evidence, and combines the
  per-seam owner check with each segment's capture range and preroll/postroll to
  verify every canonical logical frame maps to exactly one segment even when
  capture ranges overlap. The stream-PTS
  proof requires an exact positive integer `ptsStep` (missing cadence fails
  closed), fails closed on an empty frame stream, requires a non-empty identity
  and a non-negative integer index per frame, and rejects duplicate/reordered/
  gapped indexes and duplicate/reordered/gapped PTS while keeping a genuinely
  static scene's repeated pixel hashes valid when identity, index, and PTS stay
  distinct.
- Added segment-addressed render cache keys and range-scoped invalidation so a
  changed source or settings range does not invalidate unrelated compatible
  segments.
- Added hard pre-dispatch capacity admission (`admitRenderRequest`) that fails
  closed: it validates the execution tier, requires an explicit non-empty
  allowed-tier policy and finite positive limits for every hard-gated dimension,
  requires positive correctly-typed resolution/DPR/FPS and a positive integer
  worker count, binds `sequential-realtime` to exactly one worker (the universal
  arbitrary-site path with no parallelism claim), and rejects — never clamps —
  missing fields, missing limits, over-limit values, memory/storage estimates,
  and over-capacity worker counts.
- Added `reconcileTerminalRenderStatus` so a timed-out job resolves to exactly
  one terminal classification and can never be reported as both a terminal
  failure and an active cancellation.
- Added a browser-only, dependency-free WebCodecs support contract
  (`normalizeBrowserCodecSupport`) exposed through the browser-safe entrypoint;
  it normalizes an injected capability descriptor and adds no runtime
  dependency and no browser globals to Node-safe modules.
- Added an opt-in timestamp-attributed compositor capture transport for
  deterministic render jobs. Each `renderAt(frame)` evaluation returns an
  epoch-millisecond marker from its first presentation animation frame. The
  engine discards and acknowledges earlier compositor events, accepts the first
  event at or after that marker, and never advances before attribution succeeds.
  A host-agnostic injected `compositorCapture` adapter supplies sessions with
  `sessionId`, `next`, `ack`, and `stop`, keeping browser, CDP, and Playwright
  imports outside the engine. The transport is explicit opt-in and validates
  lossless PNG bytes, fixed dimensions, DPR, policy version, timeouts, aborts,
  and session cleanup without storing frame bytes in evidence. Screenshot
  capture remains the default with no silent fallback.
- Added mandatory canonical synthesis-receipt v2 verification for local TTS
  audio, including strict HMAC-bound speaker-probe verdicts, distances and
  thresholds, normalization evidence, request, artifact, voice, language,
  sample-rate, and duration checks before content-addressed artifact writes.
- Invalidated pre-v2 TTS cache keys and rejected v1 synthesis receipts on the
  active-development contract.
- Preserved verified synthesis receipts through provider queue results, cache
  hits, and artifact metadata, with deterministic sidecar conflict rejection.
- Added pure frame-completeness and render-performance proof helpers for
  missing/duplicate/reordered frame detection, capture/encode throughput,
  realtime ratio, and bounded resource verdicts from caller-owned samples.
- Bound browser worker shutdown, including aborts during launch, and expose
  `capture.browserCloseTimeouts` so a disconnected browser-adapter close promise
  cannot block completed render frames.
- Added deterministic browser render-clock capture, bounded parallel worker
  coordination, ordered frame progress, and capture performance metadata.
- Made parallel deterministic capture fail closed by handing an opaque canonical
  setup state from the leader to peer browsers and verifying content plus
  near-lossless boundary pixels before encoding independently rendered ranges.
- Replaced the shared initial setup-state handoff with a leader-only, no-raster
  continuation prepass that reproduces the sequential draw history and exports a
  distinct opaque continuation payload immediately before each parallel range
  start, so every capturing worker imports the exact state after the previous
  frame of its range instead of re-rendering the boundary frame. The leader is
  restored to the canonical initial payload before it captures range 0, mid-video
  ranges prime the caption overlay for their boundary frame without a render, and
  the prepass fails closed with stable error codes on a missing, non-object, or
  incomplete boundary payload while recording its duration, projected frame count,
  and per-range continuation hashes in normalized capture evidence and stage
  telemetry without leaking payloads.
- Hardened the deterministic worker seam threshold so a requested `seamSsim`
  below the locked exact-browser-pixel minimum (`0.999999`), NaN, or out-of-range
  value fails closed instead of being silently clamped, and rejected malformed or
  missing measured seam evidence from passing while preserving the exact-pixel
  fast path and the measured ssim, requiredSsim, match flags, worker ids, and
  frame in normalized seam-proof evidence.
- Added audio provider contract helpers, an engine-owned provider job queue,
  a content-addressed artifact store, and an injectable local TTS HTTP provider
  for local audio generation pipelines.
- Added audio-provider readiness gating, engine-owned bytes-back artifact
  handoff for local audio services, and an injectable local Whisper/transcribe
  HTTP provider.
- Added audio provider queue timeouts that cover readiness waits and provider
  execution without caching timed-out artifacts.
- Added provider id and provider settings dimensions to audio artifact cache
  keys so local TTS/Whisper caches invalidate when provider configuration
  changes.
- Added render provider job queue and render cache helpers for provider-backed
  screencast jobs, deterministic frame cache keys, and retention cleanup.
- Added render cleanup proof evidence helpers for consumers that need to mirror
  cleanup results into render proof state without parsing cleanup internals.
- Added `render-captions` helpers for reusable Whisper caption cue attribution
  and VTT generation in provider-backed render pipelines.
- Added authored caption alignment over Whisper word timings with pause-aware
  karaoke timing, mixed-source attribution, and mismatch diagnostics.
- Added `render-finalize` helpers for reusable frame-sequence encode args,
  audio concat/mix/mux args, ffprobe JSON parsing, and neutral proof manifest
  projection/state helpers.
- Added `render-lifecycle` helpers for reusable render event progress mapping,
  terminal job patches, queue snapshots, terminal error factories, and stable
  render error taxonomy.
- Added `render-proof` helpers for reusable ffprobe stream normalization,
  audio/speaker layer proof, and A/V sync proof in provider-backed render
  pipelines.
- Added `render-progress` helpers for reusable render stage evidence and
  progress timeline tracking.
- Refactored `ai/tts` and `ai/whisper` packs to use injected audio provider
  queues instead of serialized remote paths, SSH mode, or localhost endpoint
  defaults.
- Kept `browser-tts` live-only by rejecting it from executable audio providers
  that must return cacheable `sha256:` artifacts.

## 0.3.0-alpha.12

- Added `llms.txt` as a compact agent-facing resource map and included it in
  the published package.
- Updated the public README and package description to match the shared
  RND-PRO package presentation style.

## 0.3.0-alpha.11

- Kept `packs/video-pack.js` browser-safe by registering through the registry primitive instead of the Node-only root entrypoint.

## 0.3.0-alpha.10

- Added `symbiote-engine/browser`, a browser-safe runtime entrypoint for UI packages.
- Kept Node-only handler loading, server, CLI, and file-system helpers out of browser imports.

## 0.3.0-alpha.7

- Updated runtime identity strings, log prefixes, temporary workspace names, and handler metadata to use `symbiote-engine`.

## 0.3.0-alpha.6

- Updated package metadata to point at the standalone `symbiote-engine` repository.
- Published this release as a metadata-only registry correction after the repository split.

## 0.3.0-alpha.5

- Published explicit package subpath exports for UI-safe engine helpers used by `symbiote-ui`.

## 0.3.0-alpha.4

- Split runtime execution from the former `symbiote-node` monolith.
- Added `symbiote-engine` package exports for runtime primitives, CLI, server helpers, and packs.
- Kept browser UI ownership out of the engine package.
