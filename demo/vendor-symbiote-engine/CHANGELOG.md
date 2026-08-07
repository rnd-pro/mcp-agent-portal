# Changelog

## Unreleased

- Bound browser worker shutdown, including aborts during launch, and expose
  `capture.browserCloseTimeouts` so a disconnected browser-adapter close promise
  cannot block completed render frames.
- Added deterministic browser render-clock capture, bounded parallel worker
  coordination, ordered frame progress, and capture performance metadata.
- Made parallel deterministic capture fail closed by handing an opaque canonical
  setup state from the leader to peer browsers and verifying content plus
  near-lossless boundary pixels before encoding independently rendered ranges.
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
