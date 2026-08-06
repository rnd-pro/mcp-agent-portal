# Runtime API Reference

Detailed reference for the Symbiote UI runtime controller, component lifecycle,
and WebSocket protocol.

## Exports

All runtime functions are exported from `symbiote-ui/runtime` (file: `runtime/index.js`):

```javascript
import {
  RUNTIME_UI_CONTRACT_VERSION,  // 'runtime-ui-v1'
  RUNTIME_UI_CONTRACT,          // Frozen contract descriptor
  normalizeRuntimeUiNode,       // Normalize a JSON node to standard shape
  normalizeRuntimeUiState,      // Normalize state object { props, attrs, methods }
  applyRuntimeUiState,          // Apply state to an existing DOM element
  createRuntimeUiInstance,      // Create a single component instance from JSON
  createRuntimeUiController,    // Create the full controller
  applyRuntimeLayoutAction,     // Apply layout panel action (open/close/remove)
  executeAgentIntent,           // Run transactional agent intents
  createDynamicComponentRegistry, // Create component registry
  validateComponentCode,        // Validate code string for security
} from 'symbiote-ui/runtime';
```

## normalizeRuntimeUiNode(node)

Normalizes a loose JSON node into the canonical shape.

**Input:** Any object (tolerates missing fields).

**Output:**
```javascript
{
  id: '',               // string
  component: '',        // Custom element tag name
  componentRegistry: '',// Registry identifier
  props: {},            // DOM properties
  attrs: {},            // HTML attributes
  state: {              // Component state
    props: {},
    attrs: {},
    methods: {}
  },
  events: {},           // Intent event map { eventName: action }
  bindings: {},         // Host-owned bindings
  layout: {},           // Layout metadata (direction, weight, area)
  theme: undefined,     // Optional theme override
  children: []          // Normalized child nodes (recursive)
}
```

**Tag name resolution order:** `node.component` > `node.tagName` > `node.tag`.

## applyRuntimeUiState(element, state, options)

Applies normalized state to a DOM element.

- `state.attrs` — sets/removes HTML attributes via `setAttribute`/`removeAttribute`.
- `state.props` — assigns DOM properties directly (`element[name] = value`).
- `state.methods` — calls element methods if allowed by the host gate.

**Host method gate (options):**
- `options.allowMethod(name, element)` — function returning boolean.
- `options.allowedMethods` — array of allowed method names.
- If neither is set, all methods are allowed.

## createRuntimeUiInstance(node, options)

Creates a DOM element from a JSON node, applies initial state, wires intent
events, and recursively creates children.

**Returns:**
```javascript
{
  id: 'widget-1',
  component: 'sym-panel',
  element: HTMLElement,
  node: normalizedNode,
  children: [childInstances],
  update(nextState) { ... },   // Apply new state
  destroy({ remove }) { ... }  // Tear down and optionally remove from DOM
}
```

## createRuntimeUiController(options)

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `root` | `Element` | Root element for layout and event listeners |
| `document` | `Document` | DOM document provider |
| `onIntent` | `function(intent)` | Intent callback (also sent via WebSocket) |
| `onReload` | `function(params)` | Reload notification callback |
| `dynamicRegistry` | `object` | Override DynamicComponentRegistry instance |

**Controller instance:**

### controller.create(node, createOptions)
Creates, normalizes, indexes, and returns a component instance. Intent events
are wired to the controller's WebSocket (if connected) and the `onIntent` callback.

### controller.update(id, state)
Finds instance by `id` and applies new state. Returns the instance or `null`.

### controller.destroy(id, options)
Destroys the instance and all its children. Removes from DOM by default
(`options.remove` defaults to `true`). Unsubscribes all event listeners.

### controller.clear(options)
Destroys all managed instances.

### controller.connect(wsUrl, connectOptions)
Connects to a WebSocket endpoint for bidirectional control.

**connectOptions:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `reconnectMs` | `number` | `2000` | Reconnect delay in ms (0 = no reconnect) |
| `WebSocket` | `class` | `globalThis.WebSocket` | WebSocket constructor override |
| `document` | `Document` | controller document | Document for DOM operations |
| `root` | `Element` | controller root | Root for events and layout |
| `onReload` | `function` | controller onReload | Reload callback override |

### controller.disconnect()
Closes the WebSocket, cancels reconnect timer, and removes the
`webmcp-command` event listener from the root element.

## WebSocket Message Format

All messages are JSON with `{ method, params }` structure.

### Inbound (server to client)

**create:**
```json
{
  "method": "create",
  "params": {
    "node": { "id": "w1", "component": "sym-panel", "props": { "label": "Hi" } },
    "targetSelector": "#workspace",
    "parentId": null,
    "options": {}
  }
}
```

**update:**
```json
{ "method": "update", "params": { "id": "w1", "state": { "props": { "label": "Bye" } } } }
```

**destroy / clear:**
```json
{ "method": "destroy", "params": { "id": "w1", "options": {} } }
{ "method": "clear", "params": { "options": {} } }
```

**layout:**
```json
{ "method": "layout", "params": { "action": { "type": "open-panel", "panelType": "sym-inspector" } } }
```

**reload / discover-update:**
```json
{ "method": "reload", "params": { "reason": "handler-changed", "file": "handlers/chat.js" } }
```
Dispatches a bubbling, composed `runtime-reload` CustomEvent on the root element.

### Outbound (client to server)

**intent** (on component event):
```json
{
  "method": "intent",
  "params": {
    "version": "runtime-ui-v1",
    "action": "panel-clicked",
    "eventName": "click",
    "component": "sym-panel",
    "componentId": "w1",
    "detail": null
  }
}
```

**command** (on webmcp-command event):
```json
{ "method": "command", "params": { "command": "refresh-data", "args": { "source": "chat" } } }
```

## applyRuntimeLayoutAction(target, action, options)

Manages BSP layout panels.

**Action types:**
- `open-panel` — opens a panel of `panelType`.
- `close-ui-panel` — closes (hides) a panel.
- `remove-ui-panel` — removes a panel entirely.

**Resolution order:**
1. If `target` has `.openPanel()` / `.closeUiPanel()` / `.removeUiPanel()` methods, delegates to element.
2. Otherwise, uses `LayoutTree` helper functions (`openPanel`, `closeUiPanel`, `removeUiPanel`).

**Returns:** `{ handled: boolean, mode: 'element' or 'tree', reason?: string }`.
