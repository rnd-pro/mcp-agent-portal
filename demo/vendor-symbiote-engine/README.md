# symbiote-engine

[![npm version](https://img.shields.io/npm/v/symbiote-engine.svg)](https://www.npmjs.com/package/symbiote-engine)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js >=18](https://img.shields.io/badge/Node.js-%3E%3D18-339933.svg)](package.json)

**symbiote-engine turns portable workflow graphs into executable automation runtimes.**

Use it to build graph-driven tools, agent workflows, and automation backends
without tying execution logic to a browser UI or host product. The package
provides graph primitives, lifecycle-aware execution, handler packs, portable
contracts, and optional CLI/server surfaces for running Symbiote workflows.

> Learn more in the companion packages:
> [`symbiote-workspace`](https://github.com/RND-PRO/symbiote-workspace) and
> [`symbiote-ui`](https://github.com/RND-PRO/symbiote-ui).

## Why symbiote-engine?

- **Graph-first execution** — model work as nodes, sockets, and connections
  that can be serialized, inspected, replayed, and shared.
- **Host-neutral runtime** — keep application policy in the host while the
  engine handles graph execution, lifecycle hooks, registry lookups, and packs.
- **Browser-safe imports** — use `symbiote-engine/browser` when UI packages need
  graph primitives without Node-only server, file, or handler-loader modules.
- **Composable automation packs** — register reusable node packs and custom
  handlers instead of baking product-specific behavior into the engine.

## What is symbiote-engine?

`symbiote-engine` is the execution package in the Symbiote family. It owns the
portable runtime primitives that can run in Node.js and, through a separate
browser-safe entrypoint, inside UI packages.

The engine stays independent from workspace orchestration and Web Components.
Use `symbiote-workspace` for portable workspace configs, construction flows, and
host integration, and use `symbiote-ui` for component catalogs, layouts,
metadata, and browser UI.

## Key Features

- **Runtime graph model** — `Graph`, `Executor`, graph history, socket types,
  lifecycle hooks, cache behavior, and serialization helpers.
- **Handler and pack registry** — node type registration, pack discovery,
  compatible-node lookup, parameter validation, and hot-loadable handlers.
- **Portable host contracts** — normalized source documents, resource trees, and
  persistence adapters for agent and editor surfaces.
- **Local media provider primitives** — audio provider contracts, provider-job
  queues, content-addressed artifacts, and receipt-verified local TTS providers.
- **Multiple runtime surfaces** — Node-safe root exports, browser-safe exports,
  CLI workflow commands, and an optional HTTP/WebSocket graph server.

## Quick Start

```bash
npm install symbiote-engine
```

```js
import { Executor, Graph, registerNodeType } from 'symbiote-engine';

registerNodeType({
  type: 'input/number',
  driver: {
    description: 'Provide a number',
    inputs: [],
    outputs: [{ name: 'value', type: 'number' }],
  },
  process: (_inputs, { value = 0 }) => ({ value }),
});

registerNodeType({
  type: 'math/add',
  driver: {
    description: 'Add two numbers',
    inputs: [
      { name: 'a', type: 'number' },
      { name: 'b', type: 'number' },
    ],
    outputs: [{ name: 'sum', type: 'number' }],
  },
  process: ({ a = 0, b = 0 }) => ({ sum: a + b }),
});

registerNodeType({
  type: 'output/value',
  driver: {
    description: 'Expose a final value',
    inputs: [{ name: 'value', type: 'number' }],
    outputs: [{ name: 'value', type: 'number' }],
  },
  process: ({ value }) => ({ value }),
});

let graph = new Graph();
let a = graph.addNode('input/number', { value: 2 });
let b = graph.addNode('input/number', { value: 3 });
let add = graph.addNode('math/add');
let output = graph.addNode('output/value');

graph.connect(a, 'value', add, 'a');
graph.connect(b, 'value', add, 'b');
graph.connect(add, 'sum', output, 'value');

let executor = new Executor();
let result = await executor.run(graph);

console.log(result.outputs[output].value);
```

## Browser-safe Runtime

Browser UI code should import the browser entrypoint so client bundles do not
pull Node-only server, CLI, handler-loader, or file-watch modules:

```js
import { Graph, Executor, deserialize } from 'symbiote-engine/browser';
```

## CLI

```bash
symbiote-engine run workflow.json --pack video --json
symbiote-engine validate workflow.json --json
symbiote-engine list --pack video
symbiote-engine inspect workflow.json --json
```

## Documentation

- [Browser-safe Runtime](#browser-safe-runtime) — import graph primitives into
  client-side packages without Node-only modules.
- [CLI](#cli) — run, validate, list, and inspect workflow JSON from the command
  line.
- [Runtime Surfaces](#runtime-surfaces) — choose the correct package entrypoint
  for Node, browser, CLI, contracts, or packs.

## Runtime Surfaces

- `symbiote-engine` — Node-safe runtime exports, including handler loading and
  persistence helpers.
- `symbiote-engine/browser` — browser-safe graph, registry, execution, contract,
  and serialization exports.
- `symbiote-engine/cli` — workflow runner and inspection commands.
- `symbiote-engine/contracts` — normalized resource, document, persistence,
  render-provider, audio-provider, render-capability, native-segment, and
  browser-codec contract helpers. Render capability contracts declare the three
  execution tiers (`sequential-realtime`, `replayable-segment`,
  `checkpointed-deterministic`), independent renderer/encoder candidates with a
  strict usability predicate, versioned native encoded-segment job and artifact
  contracts (logical/capture ranges, preroll/postroll, continuation/checkpoint
  and UI-clock evidence, exact `frameDurationTicks` cadence, master media
  reference, and full color/audio stream-layout compatibility fields), and a
  versioned seam-policy/seam-boundary descriptor.
- `symbiote-engine/artifacts` — Node-only content-addressed artifact store.
- `symbiote-engine/providers/local-audio-tts.js` — Node-only local TTS transport
  with mandatory canonical v2 `X-Audio-Receipt` verification. The HMAC-bound
  receipt requires exact speaker-probe verdicts, measured distances and signed
  thresholds, plus loudness/true-peak normalization evidence matching the public
  request. Configure
  `receiptSecret` with at least 32 bytes; v1, malformed, negative, out-of-range,
  threshold-failing, or inconsistent receipts fail before artifact writes.
- `symbiote-engine/provider-jobs` — engine-owned provider job queue primitives
  with model-service readiness gating.
- `symbiote-engine/render-cache` — Node-only frame cache keys, segment-addressed
  cache keys and range-scoped invalidation (a changed source or settings range
  never invalidates unrelated compatible segments), in-memory frame cache store,
  render retention cleanup, and cleanup proof evidence helpers.
- `symbiote-engine/render-finalize` — frame-sequence encode args, audio
  concat/mix/mux args, ffprobe JSON parsing, and neutral proof manifest
  projection/state helpers.
- `symbiote-engine/render-lifecycle` — render event progress mapping, terminal
  job patches, queue snapshots, terminal error factories, and stable render
  error taxonomy helpers.
- `symbiote-engine/render-proof` — ffprobe stream normalization,
  audio/speaker layer proof, A/V sync, frame completeness, segment seam
  (exact/perceptual over a versioned seam-boundary input requiring an explicit
  canonical overlap owner matching the seam policy; rejects duplicate boundary
  PTS, logical frame/PTS gaps or overlaps, and capture-coverage holes so each
  canonical logical frame maps to exactly one segment even when capture ranges
  overlap), exact-cadence stream-PTS (requires a positive
  integer `ptsStep`, fails closed on an empty frame stream, requires a non-empty
  identity and non-negative integer index per frame, and rejects duplicate/
  reordered/gapped identity, index, and PTS while a static scene's repeated pixel
  hashes stay valid), and pure throughput/resource proof helpers for
  provider-backed render pipelines.
- `symbiote-engine/render-jobs` — engine-owned render provider job queue
  primitives with progress, timeout, cancel, cache-hit, and cleanup events.
- `symbiote-engine/render-workers` — contiguous frame-range partitioning and
  ordered completion tracking for bounded parallel capture.
- `symbiote-engine/render-selection` — independent renderer/encoder capability
  negotiation. Produces a selection receipt with evidence, requested policy,
  allowed fallback, and explicit rejection reasons. Usability is gated by the
  shared `accelerationCandidateProven` predicate: a renderer needs an available
  `renderer-identity` probe with a real identity and an encoder an available
  `real-encode` probe with `encodeOk:true`; a device node or probe-name flag
  alone is never usable and fallback is never silent. Final native artifacts
  also bind the receipt's requested backend/codec/fallback policy, selected
  codec, continuation hashes, and clock-equivalence proof to the originating
  job.
- `symbiote-engine/render-segments` — native encoded-segment compatibility and
  concat planning. Stream-copy requires positive compatibility evidence
  (container, codec, geometry, time-base, pixel format, color, video extradata,
  stream layout, and — when audio exists — audio codec/sample-rate/channels/
  layout/time-base/extradata) and fails closed when any is missing; logical
  ranges must be contiguous and adjacent boundary PTS exactly one frame-duration
  apart. Color/audio/codec/geometry/time-base/extradata/stream-layout mismatches
  are separately reported; frame-range and PTS continuity defects are fatal even
  under re-encode (it cannot invent missing source frames); groups split at every
  incompatible boundary; duplicate segment ids are rejected; and re-encode is
  always an explicit result.
- `symbiote-engine/render-admission` — hard pre-dispatch capacity admission that
  fails closed: it validates the tier, requires an explicit allowed-tier policy
  and finite positive limits, requires positive correctly-typed dimensions and a
  positive integer worker count, binds `sequential-realtime` to exactly one
  worker, and rejects (never clamps) missing fields/limits, over-limit values,
  memory/storage estimates, and over-capacity worker counts.
- `symbiote-engine/packs/*` — reusable domain packs and node handlers.
- `symbiote-engine/providers/*` — injectable local provider implementations,
  including browser screencast and local audio HTTP clients.

### Deterministic browser capture

`createLocalBrowserScreencastProvider()` accepts an opt-in `renderClock` job
contract for seekable offline pages:

```js
{
  renderClock: {
    mode: 'deterministic',
    path: '__renderSurface.renderAt',
    workerCount: 4,
    settleFrames: 2,
    timeoutMs: 10000,
    setupState: {
      exportPath: '__renderSurface.exportState',
      importPath: '__renderSurface.importState',
    },
  },
}
```

Before each screenshot the provider calls the page method with exact timeline
time and frame/worker metadata. The method must return
`{ presentedTimeMs, projectionId, contentDigest }`, where `projectionId` is a
non-empty deterministic identity and `contentDigest` identifies the rendered
page state. Stateful provider `timeline`
actions are rejected in deterministic mode because the page owns arbitrary-time
state projection. Multiple workers use isolated browser profiles and contiguous
frame ranges, but peers import an opaque canonical state exported by the leader.
The provider compares the content digest and boundary pixels from the encoded
worker ranges. The first three frames of every peer range are checked. Pixel
proof requires an exact hash or SSIM of at least `0.999999`;
a mismatch fails with `RENDER_SEAM_MISMATCH`. Artifacts
include setup-state and seam evidence alongside duration, throughput, range, and
warm-up metadata. Realtime capture remains single-worker.

## Caption Presentation Track v3 API

The engine provides robust, deterministic caption placement and track generation conforming to the `caption-presentation-track-v3` schema.

### Strict Cue IDs
All inputs to the caption boundaries (including `buildCaptionCues` and `buildCaptionPlacementTrack`) must provide explicit, unique, and safe canonical cue IDs. A cue ID must strictly match `/^[a-z][a-z0-9._:-]*$/`. The engine does not synthesize fallback IDs and throws a `TypeError` if an input cue lacks a valid identifier or if duplicates are found.

### Decision and Move Evidence
Each placed cue contains `decisionEvidence` detailing the exact reasoning of the placement engine:
- `decision` — Indicates the cue's final placement type: `'initialized'`, `'retained'`, or `'moved'`.
- `switchReason` — Indicates the reason for a relocation: `'initialization'`, `'collision'`, `'safe-bounds'`, or `null` (strictly `null` for retained slots).
- `discontinuity` — A boolean flag indicating whether a layout discontinuity reset occurred.
- `collidedRegions` — A list of intersected regions containing `{ id, kind }` objects that caused a relocation.

### Typography and Adaptation
The engine adapts typography by reducing font sizes in place to fit candidate slots before attempting relocation. If a cue's text cannot fit inside safe bounds even at the minimum font size, the engine fails closed and throws an error instead of producing an invalid track.

### ASS Subtitle Serialization and Parsing
- **ASS Name/Effect Mapping** — When serializing to ASS format, the cue's `speaker` is mapped to the ASS `Name` field, and the canonical `cueId` is mapped to the ASS `Effect` field.
- **`parseAss`** — Restores presentation coordinates and timing from ASS file content. It splits lines and parses tags under strict fail-closed validation, throwing a `TypeError` on malformed/non-finite timestamps, start/end timing order violations, duplicate or unsafe Effect cue IDs, or invalid tags.

### Artifact Joining
- **joinCaptionArtifacts** — Merges partial caption metadata arrays by matching cue IDs. It throws a `TypeError` on duplicate cue IDs, missing IDs on either side, or invalid cue ID formatting.

## License

MIT

## Related Projects

- [`symbiote-ui`](https://github.com/RND-PRO/symbiote-ui) — Web Components,
  provider catalogs, layout metadata, and WebMCP descriptors.
- [`symbiote-workspace`](https://github.com/RND-PRO/symbiote-workspace) —
  workspace construction, plugin contracts, server mode, and portable configs.
- [`symbiote-node`](https://github.com/RND-PRO/symbiote-node) — terminal
  migration facade for older imports.

Made with ❤️ by the RND-PRO team
