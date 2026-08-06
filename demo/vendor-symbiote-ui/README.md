[![npm version](https://img.shields.io/npm/v/symbiote-ui)](https://www.npmjs.com/package/symbiote-ui) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org) [![ESM](https://img.shields.io/badge/ESM-only-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)

# symbiote-ui

**symbiote-ui turns provider metadata into agent-ready Web Components,
layouts, themes, and UI contracts. Fast.**

Build browser-facing and agent-facing interfaces from Symbiote
primitives: Web Components, layout shells, graph and board surfaces, display
widgets, Cascade themes, manifests, schemas, rules, WebMCP descriptors, and
SSR-safe runtime helpers. The package gives agents and hosts a direct path from
component discovery to hydrated UI without binding provider contracts to one
product app or frontend framework.

## Why symbiote-ui?

- **One catalog for agent-built UI** — components, layouts, themes, schemas,
  rules, and WebMCP metadata are discoverable through package exports and
  provider manifests.
- **Platform-native components** — browser modules register Custom Elements
  that hosts can hydrate without a framework-specific runtime.
- **Layouts and data views for professional apps** — shells, panels, graph
  canvases, boards, trees, editors, timelines, event feeds, file trees, and
  inspector surfaces are reusable across host products.
- **Cascade theme by default** — shared tokens, rules, and theme helpers keep
  agent-generated interfaces visually coherent.
- **Node-safe contracts, browser-only UI** — provider metadata and runtime
  helpers stay importable in Node while Web Components stay behind
  `symbiote-ui/ui`.

> **Learn more**: [Agent UI Construction Principles](https://rnd-pro.github.io/symbiote-ui/)

## Key Features

### Provider Catalog and Discovery

- **Manifest-first UI construction** — agents read component descriptions,
  tags, categories, schema links, rules, theme parts, and WebMCP descriptors
  before composing an interface.
- **Discoverable package contracts** — `symbiote-ui discover`,
  `custom-elements.json`, `symbiote-ui/manifest`, tokens, rules, and schemas
  describe what the package can provide.
- **Product-context projection** — host-owned product context becomes
  agent-facing views, component refs, entities, actions, and tool descriptors
  without moving host policy into reusable UI code.
- **Graph layout quality reports** — a Node-safe analyzer and CLI detect
  overlaps, obstructed or crossing connections, distance outliers, viewport
  readability, locality, and instability with deterministic agent-readable IDs.

### Web Component Runtime

- **Browser registration surface** — `symbiote-ui/ui` defines Custom Elements
  for chat, layout, graph, board, tree, editor, display, media, theme, and
  utility modules.
- **SSR-safe entry points** — root, `core`, `layout`, `graph`, `manifest`,
  `runtime`, `locale`, and related contracts stay safe for Node imports.
- **Display and editor primitives** — source viewers, source editors, diffs,
  code blocks, event feeds, file trees, kanban boards, data tables, graph
  canvases, and inspector surfaces support professional agent interfaces.

### Theme, Layout, and Interaction Contracts

- **Cascade theme helpers** — tokens and theme factories keep generated UI
  consistent across shells, panels, and embedded components.
- **Reusable layout primitives** — shell, sidebar, panel, tab, graph, board,
  and adaptive layout contracts can be composed by hosts and workspace
  constructors.
- **Host-owned state and policy** — components emit intent events and consume
  explicit data; navigation, persistence, permissions, secrets, and identity
  remain in the host.

## Quick Start

```sh
npm install symbiote-ui @symbiotejs/symbiote@3.8.0-webmcp.2
```

For SSR integration tests or JSDA-based hosts, install the integration dependencies in the host project:

```sh
npm install jsda-kit linkedom
```

`jsda-kit` is intentionally not a runtime dependency of `symbiote-ui`.

## Example: Browser Registration

```js
import { defineModule, listModules } from 'symbiote-ui/ui';

defineModule('chat-composer');
defineModule('cascade-theme-editor');

console.log(listModules());
```

The root package and Node-safe entry points import without creating DOM globals.
Browser-only Custom Elements and module definition helpers belong behind
`symbiote-ui/ui`. See [Runtime UI Construction](./docs/runtime-ui-construction.md)
for layout panels, chat, voice controls, runtime UI adapters, localization, and
constructor examples.

## Example: Agent UI Construction

```js
import { listAgentComponentDescriptions } from 'symbiote-ui/manifest';

let catalog = listAgentComponentDescriptions();
let graphSurface = catalog.find((item) => item.tagName === 'node-canvas');
console.log(graphSurface.componentDescription);
console.log(graphSurface.webmcp.toolNames);
```

Agents start from the manifest, choose a component by its agent-facing
description, ask the host to bind data, and insert the component into an
approved layout surface. Deep constructor, graph, runtime, and host-policy
examples live in [Runtime UI Construction](./docs/runtime-ui-construction.md).

## Example: Multi-Voice Narrated Tour

```js
import { createDialogueStage } from 'symbiote-ui/chat/dialogue-stage.js';
import { buildAlternatingTimeline } from 'symbiote-ui/chat/dialogue-timeline.js';
import { createDialoguePlayer } from 'symbiote-ui/chat/dialogue-player.js';

let stage = createDialogueStage({ locale: 'en' });
stage.persona('guide', { pitch: 1, rate: 1 });
stage.persona('agent', { pitch: 0.9, rate: 1.05 });

let timeline = buildAlternatingTimeline(
  ['guide', 'agent'],
  [
    { text: 'Welcome to the workspace tour.', cue: 'intro' },
    { text: 'I will highlight each panel as we go.', cue: 'panels' },
    { text: 'Drag a node onto the canvas to begin.', cue: 'canvas' },
  ],
  200, // overlap so the two voices cross-talk
);

let player = createDialoguePlayer(stage, timeline);
player.onCue = (cue) => highlight(cue);
stage.installGestureUnlock(document.body); // browsers gate speech behind a gesture
player.play();
```

The stage gives each persona its own hidden-iframe `speechSynthesis` channel so
voices overlap, the timeline sequences turns with cues and overlap, and the
player exposes `play`/`pause`/`resume`/`prev`/`next`/`seek`/`stop` plus a `done`
promise.

## Example: Presenter Cursor Scenario

```js
import {
  createPresenterCursor,
  playCursorScenario,
} from 'symbiote-ui/chat/presenter-cursor.js';

let cursor = createPresenterCursor(); // inert no-ops in Node; renders in the browser

let scenario = {
  steps: [
    { target: 'sidebar', holdMs: 1500, label: 'Open the project sidebar' },
    { target: 'canvas', label: 'Drop a node onto the canvas' },
    { target: 'inspector', holdMs: 900, label: 'Edit it in the inspector' },
  ],
};

await playCursorScenario(cursor, scenario, {
  resolveTarget: (ref) => document.querySelector(`[data-tour="${ref}"]`),
  onStep: (step) => console.log(step.label),
  defaultHoldMs: 1200,
});
```

The cursor draws an animated arrow with a marching-ants marquee and travels
between checkpoints along a curved path. `resolveTarget` maps each agent-authored
`target` reference to a DOM element; when it resolves the cursor moves there and
holds `holdMs` (or `defaultHoldMs`), then `onStep` fires. Pass an `AbortSignal`
as `signal` to stop playback and clear the cursor mid-run.

`applyPresenterTextSelection` selects an exact or whitespace-normalized quote,
or an offset range, and returns a portable receipt with `clear()` and `restore()`.

## Example: Action Message Part

```js
import { defineModule } from 'symbiote-ui/ui';

defineModule('chat-transcript');

let message = {
  role: 'agent',
  parts: [
    { type: 'text', text: 'Ready to apply the cascade theme?' },
    {
      type: 'actions',
      actions: [
        { id: 'apply', label: 'Apply', icon: 'check', variant: 'primary' },
        { id: 'dismiss', label: 'Not now', variant: 'ghost' },
      ],
    },
  ],
};

transcript.addEventListener('chat-message-action', (event) => {
  // { id, actionId, payload }
  console.log(event.detail.actionId);
});
```

An `actions` part renders inline buttons and emits `chat-message-action` /
`chat-workspace-action`. An `embed` part (`{ type: 'embed', key }`) renders a
keyed slot instead; `ChatTranscript` emits `chat-transcript-embeds-ready` /
`chat-workspace-embeds-ready` `{ embeds: [{ key, slot }] }` so the host can mount
and re-attach a live widget into the message.

## CLI

```sh
symbiote-ui discover
symbiote-ui layout-audit graph-layout-snapshot.json
```

The discovery command prints the export map, component catalog, schemas, rules,
tokens, theme recipes, graph-analysis operations, WebMCP metadata, and
agent-facing descriptors. The layout audit prints a versioned quality report
and exits non-zero when analysis fails or is incomplete.

## Documentation

- [Entry Points](./docs/entry-points.md) — package exports and Node/browser-safe boundaries.
- [Runtime UI Construction](./docs/runtime-ui-construction.md) — browser registration, agent construction, panels, chat, voice controls, runtime adapters, and localization.
- [Cascade Theme](./docs/cascade-theme.md) — bounded theme controls, recipes, design policy validation, editor/widget usage, and runtime tokens.
- [Layout and Spatial Contracts](./docs/layout-and-spatial.md) — responsive layout behavior, panel lifecycle, spatial graph primitives, XR helpers, and standalone subpath imports.
- [XR Spatial Evidence](./docs/xr-spatial-evidence.md) — placement, audit, and 2×2 projections.
- [Integration Contracts](./docs/integration-contracts.md) — WebMCP metadata, JSDA SSR expectations, and package boundary rules.
- [Agent UI Construction Principles](./docs/agent-ui-principles.md) — UX scenarios and workspace rules for agent-built interfaces.
- [Showcase Demo Structure](./docs/showcase-demo-structure.md) — public demo navigation model and workspace layout patterns.

## Demos

- [`demo/cascade-theme-lab.html`](./demo/cascade-theme-lab.html) — agent workspace showcase with project-type top tabs, per-tab sidebar menus, a right collapsed page-agent chat layout panel, project file tree, source editor, markdown/source viewer, editable node canvas, canvas graph overview, chat and voice controls, runtime UI contracts, spatial node preview, component surfaces, and cascade theme editing.
- [`demo/canvas-graph-gravity-lab.html`](./demo/canvas-graph-gravity-lab.html) — standalone `canvas-graph` force controls with fit, focus, node appearance animation, and one-node zoom diagnostics.
- [`demo/pcb-router-stress.html`](./demo/pcb-router-stress.html) — animated PCB route diagnostics with orbit metrics, keyframes, and agent-readable JSON samples.

## License

MIT © [RND-PRO.com](https://rnd-pro.com)

## Related Projects

- [symbiote-engine](https://github.com/RND-PRO/symbiote-engine) — runtime execution, CLI commands, server helpers, persistence, and handlers.
- [symbiote-workspace](https://github.com/RND-PRO/symbiote-workspace) — workspace orchestration, plugin system, server mode, and portable configs.
- [symbiote-node](https://github.com/RND-PRO/symbiote-node) — terminal migration facade for older imports.
- [Package split guide](https://github.com/RND-PRO/symbiote-node/blob/main/docs/package-split.md)
- [Agent contract index](https://github.com/RND-PRO/symbiote-node/blob/main/docs/agent-contracts.md)
- [JSDA-Kit](https://github.com/rnd-pro/jsda-kit) — JavaScript ESM asset generation, SSR, and static output pipeline.
- [Symbiote.js](https://github.com/symbiotejs/symbiote.js) — isomorphic reactive Web Components framework.

Made with ❤️ by the RND-PRO team
