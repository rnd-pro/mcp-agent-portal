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
  queues, content-addressed artifacts, and injectable local TTS providers.
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
  render-provider, and audio-provider contract helpers.
- `symbiote-engine/artifacts` — Node-only content-addressed artifact store.
- `symbiote-engine/provider-jobs` — engine-owned provider job queue primitives
  with model-service readiness gating.
- `symbiote-engine/render-cache` — Node-only frame cache keys, in-memory frame
  cache store, render retention cleanup, and cleanup proof evidence helpers.
- `symbiote-engine/render-finalize` — frame-sequence encode args, audio
  concat/mix/mux args, ffprobe JSON parsing, and neutral proof manifest
  projection/state helpers.
- `symbiote-engine/render-lifecycle` — render event progress mapping, terminal
  job patches, queue snapshots, terminal error factories, and stable render
  error taxonomy helpers.
- `symbiote-engine/render-proof` — ffprobe stream normalization,
  audio/speaker layer proof, and A/V sync proof helpers for provider-backed
  render pipelines.
- `symbiote-engine/render-jobs` — engine-owned render provider job queue
  primitives with progress, timeout, cancel, cache-hit, and cleanup events.
- `symbiote-engine/render-workers` — contiguous frame-range partitioning and
  ordered completion tracking for bounded parallel capture.
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

## Documentation Site

- **[Symbiote Engine Landing](https://rnd-pro.github.io/symbiote-engine/)**
- **[Symbiote Engine Docs](https://rnd-pro.github.io/symbiote-engine/docs/)**

To build the static documentation site locally (requires Node 20+ for JSDA site tooling, while the engine runtime supports Node 18+):
```sh
npm install
npm run site:build
```
For local development with live reload:
```sh
npm run site:dev
```

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
