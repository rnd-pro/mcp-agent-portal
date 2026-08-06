---
name: symbiote-ui
description: >
  Build and control professional Studio UX interfaces at runtime using the
  Symbiote UI Web Component library. Covers component lifecycle
  (create/update/destroy), bidirectional WebSocket protocol, dynamic Web
  Component registration with code sandboxing, and transactional agent-intent
  orchestration with automatic rollback. Also audits settled graph layouts for
  overlaps, obstructed or crossing connections, distance outliers, viewport
  readability, locality, and stability. Use when building agent-driven UI,
  runtime dashboards, node graph editors, validating graph layout quality, or
  assembling an interface programmatically without a build step.
license: MIT
metadata:
  author: rnd-pro
  version: "1.0"
---

# Symbiote UI — Runtime Agent Skill

Symbiote UI is a **runtime Web Component library** — agents use its programmatic
API to create and manage UI, not static templates. All components are standard
Custom Elements; no build step, no framework lock-in.

Graph layout auditing and metadata discovery are Node-safe. Web Component
workflows require a browser or DOM-compatible environment such as linkedom.

## Quick Start

```javascript
import { createRuntimeUiController } from 'symbiote-ui/runtime';

// 1. Create a controller
let controller = createRuntimeUiController({ root: document.body });

// 2. Create a component from JSON
let instance = controller.create({
  id: 'my-panel',
  component: 'sym-panel',
  props: { label: 'Status' },
  attrs: { 'data-engine-state': 'idle' },
  children: [
    { component: 'sym-text', props: { textContent: 'Ready' } }
  ]
});

// 3. Mount it
document.querySelector('#workspace').append(instance.element);

// 4. Update state
controller.update('my-panel', {
  props: { label: 'Running' },
  attrs: { 'data-engine-state': 'running' }
});

// 5. Tear down
controller.destroy('my-panel');
```


## Component Authoring Contract

Before building or hardening a Symbiote UI element, run a Symbiote feature pass
against the closest existing component and the current `@symbiotejs/symbiote`
patterns used in this repository. Use every relevant built-in capability before
adding manual infrastructure.

- Prefer Symbiote `html` templates, declarative bindings, Light DOM slots,
  `rootStyles`, reactive component state, lifecycle hooks, bubbling intent
  events, and provider metadata/discover contracts over ad hoc DOM wiring.
- Translate visual behavior through Symbiote cascade tokens and component-owned
  `rootStyles`; do not duplicate cascade formulas in component logic.
- Use imperative DOM listeners only for native browser behavior that Symbiote
  does not cover cleanly, and keep that code local to the component.
- Keep Node-safe entry points free of browser-only imports while browser Web
  Components stay behind `symbiote-ui/ui`.
- If a relevant Symbiote capability is intentionally not used, record the reason
  in the implementation notes, test name, or durable goal checklist.

## Core API

### createRuntimeUiController(options)

Creates a controller that manages UI component instances.

**Options:**
- `root` — Root element for layout actions and event listeners.
- `document` — DOM document provider (default: `globalThis.document`).
- `onIntent(intent)` — Callback for intent events from components.
- `onReload(params)` — Callback for hot-reload notifications.
- `dynamicRegistry` — Custom `DynamicComponentRegistry` instance.

**Returns** a controller with:

| Method | Description |
|--------|-------------|
| `controller.create(node, options)` | Create a component instance from a JSON node |
| `controller.update(id, state)` | Update props/attrs/methods on an existing instance |
| `controller.destroy(id, options)` | Remove and clean up an instance by ID |
| `controller.clear(options)` | Destroy all managed instances |
| `controller.connect(wsUrl, options)` | Connect to a WebSocket for remote control |
| `controller.disconnect()` | Close WebSocket and remove listeners |
| `controller.instances` | `Map<string, instance>` of all live instances |
| `controller.dynamicRegistry` | The `DynamicComponentRegistry` instance |

### JSON Node Format

```javascript
{
  id: 'widget-1',          // Unique identifier
  component: 'sym-panel',  // Custom element tag name
  props: { label: 'Hi' },  // DOM properties to set
  attrs: { role: 'region' }, // HTML attributes to set
  state: {                 // Additional state
    props: {},
    attrs: {},
    methods: { focus: [] } // Call element methods
  },
  events: {                // Intent event bindings
    click: 'panel-clicked' // eventName → action string
  },
  children: []             // Nested child nodes
}
```

## WebSocket Protocol

Connect the controller to a server for remote UI management:

```javascript
controller.connect('ws://localhost:8080/runtime', {
  reconnectMs: 2000,    // Auto-reconnect delay (0 to disable)
  onReload: (params) => handleRuntimeReload(params),
});
```

### Inbound Messages (server → client)

| Method | Params | Effect |
|--------|--------|--------|
| `create` | `{ node, targetSelector?, parentId? }` | Create and mount a component |
| `update` | `{ id, state }` | Update component state |
| `destroy` | `{ id, options? }` | Destroy a component |
| `clear` | `{ options? }` | Destroy all components |
| `layout` | `{ action, options? }` | Apply layout panel action |
| `reload` | `{ ... }` | Dispatch `runtime-reload` event |
| `discover-update` | `{ ... }` | Dispatch `runtime-reload` event |

### Outbound Messages (client → server)

| Method | Trigger |
|--------|---------|
| `intent` | Component event fires (via `onIntent`) |
| `command` | `webmcp-command` custom event bubbles to root |

## Agent Intent Orchestrator

Execute multi-step UI transactions with automatic rollback on failure:

```javascript
import { executeAgentIntent } from 'symbiote-ui/runtime';

let intent = {
  version: 'agent-intent-v1',
  intentId: 'build-chat-panel',
  operations: [
    { type: 'register-component', params: { tagName: 'sym-chat', code: '...' } },
    { type: 'ui', params: { action: 'create', node: { id: 'chat-1', component: 'sym-chat' }, targetSelector: '#workspace' } },
    { type: 'theme', params: { targetSelector: '#workspace', presets: { color: 'carbon', skin: 'compact', motion: 'fast' } } },
    { type: 'state', params: { id: 'chat-1', state: { props: { placeholder: 'Ask anything...' } } } }
  ]
};

let result = await executeAgentIntent(controller, intent, {
  document,
  onRegisterDriver: async (params) => { /* load server-side driver */ }
});
// → { success: true, executedCount: 4 }
```

**Operation Types:**

| Type | Purpose | Rollback |
|------|---------|----------|
| `register-component` | Register a Web Component via DynamicComponentRegistry | Tracked (no browser undo) |
| `register-driver` | Load a server-side handler (via `onRegisterDriver` callback) | Tracked |
| `layout` | Apply panel layout action (`open-panel`, etc.) | Reverse action |
| `ui` | Create or destroy component instances | Destroy created / n/a |
| `theme` | Apply cascade theme to a target element | Restore original CSS vars |
| `state` | Update component state | Restore original props/attrs |

If **any operation fails**, all previously executed operations are rolled back in reverse order.

## Dynamic Component Registry

Register Web Components at runtime with code sandboxing:

```javascript
import { createDynamicComponentRegistry, validateComponentCode } from 'symbiote-ui/runtime';

let registry = createDynamicComponentRegistry();

// Register from a class
await registry.register('my-widget', MyWidgetClass);

// Register from code string (sandboxed)
await registry.register('my-dynamic', `
  export default class MyDynamic extends HTMLElement {
    connectedCallback() { this.textContent = 'Hello'; }
  }
`);

// Check and list
registry.has('my-widget');  // true
registry.list();            // [{ tagName, classDefinition, ... }]
```

**Blocked Keywords** (default sandbox): `document.cookie`, `document.write`,
`localStorage`, `sessionStorage`, `IndexedDB`, `eval(`, `new Function(`,
`process.env`, `process.exit`, `require(`.

Custom validators can be passed via `options.validate`.

## WebMCP Bridge

Symbiote UI components can register as model tools and send commands:

```javascript
import { registerWebMcpTool, triggerWebMcpCommand } from 'symbiote-ui/webmcp';

// Register a tool for model context
let { descriptor, unregister } = await registerWebMcpTool({
  name: 'update-panel',
  description: 'Update panel state',
  inputSchema: { type: 'object', properties: { label: { type: 'string' } } },
  execute(input) {
    return { label: input.label };
  }
});

// Trigger a command (bubbles to controller via webmcp-command event)
triggerWebMcpCommand(element, 'refresh-data', { source: 'chat' });
```

## Graph Layout Quality

Discover the operation before auditing:

```sh
symbiote-ui discover
```

Read `manifest.graphAnalysis` for the public function, CLI command, status
semantics, stable rule IDs, default policy, per-field policy constraints,
per-rule payload schemas, types and units, report invariants, numeric domain,
annotations, and exact `graph-layout-quality-v1` input/output schema. Supply a
JSON-compatible snapshot with top-left node bounds from a settled layout;
include routed edge points, viewport, parent relations, or a baseline only when
they are available.

```javascript
import { analyzeGraphLayout } from 'symbiote-ui/graph';

let report = analyzeGraphLayout({
  version: 'graph-layout-snapshot-v1',
  nodes: [
    { id: 'hub', bounds: { x: 0, y: 0, width: 240, height: 160 } },
    {
      id: 'leaf',
      parentId: 'hub',
      bounds: { x: 320, y: 20, width: 180, height: 120 },
    },
  ],
  edges: [{ id: 'hub-leaf', sourceId: 'hub', targetId: 'leaf' }],
  policy: { idealEdgeLength: 160 },
});
```

Block acceptance when `report.pass` is false. Use `findings[].ruleId`, involved
node/edge IDs, `actual`, and `limit` to adjust the caller's layout parameters,
then audit a new settled snapshot. Treat `incomplete` as a failed gate; never
assume an unevaluated pair set is clean. Do not mutate node positions or encode
product-specific geometry rules inside the analyzer.

Use canonical IDs without surrounding whitespace and geometry inside the
published numeric domain. In `coverage.checks`, `required` counts entity pairs,
`status` is `complete` or `skipped-budget`, and `budgetCost` reserves worst-case
primitive segment comparisons. `skippedCount` includes every skipped
occurrence, while `unidentifiedCount` covers entries that cannot appear in
`skippedIds`. Treat `layout.numeric-underflow` as blocking: a non-zero derived
center delta, direct metric, or aggregate ratio materialized as zero, so the
analyzer deliberately refused a clean result.

Run the same contract without writing code:

```sh
symbiote-ui layout-audit graph-layout-snapshot.json
```

## Studio UX Philosophy

Symbiote UI targets **professional tool interfaces** (IDE, DAW, CAD), not consumer pages:

1. **High density**: Default `density: 85`, compact fonts, minimal padding.
2. **Utility motion**: Animations explain spatial changes, never decorate. Default `< 150ms`.
3. **Visible state**: Backend process status reflects directly in CSS via `data-engine-state` attributes.
4. **BSP layout**: Binary Space Partitioning panels — resize, split, collapse independently.
5. **Keyboard-first**: Command palette and hotkeys over mouse interactions.

## Common Mistakes

- **Never call `customElements.define()` directly** — use `DynamicComponentRegistry` to avoid fatal duplicate-tag crashes.
- **Never use `eval()` or `new Function()` in component code** — the sandbox will reject it.
- **Always set `version: 'agent-intent-v1'`** in intents — the orchestrator throws on mismatched versions.
- **Apply themes to containers, not `:root`** — cascade isolation prevents token leaks between panels.
- **Use `controller.destroy(id)` for cleanup** — don't manually call `element.remove()`, or subscriptions leak.

## References

For detailed API documentation, see:
- [Runtime API Reference](references/runtime-api.md) — Full function signatures and WebSocket message formats.
- [Intent Orchestrator Reference](references/intent-orchestrator.md) — Complete `agent-intent-v1` schema and rollback rules.
- [Dynamic Registry Reference](references/dynamic-registry.md) — Component loading, sandbox, and duplicate handling.
- [WebMCP Bridge Reference](references/webmcp-bridge.md) — Tool registration, command events, and graceful degradation.
