# WebMCP Bridge Reference

Complete reference for Symbiote UI's integration with the Web Model Context
Protocol (WebMCP) for model-driven tool registration and command events.

## Overview

WebMCP allows Web Components to declare themselves as "tools" that AI models
can discover and invoke. Symbiote UI provides a bridge layer that:

1. Registers component capabilities with `document.modelContext` (if available).
2. Falls back gracefully when WebMCP is not supported.
3. Emits `webmcp-command` custom events that the runtime controller forwards via WebSocket.

All functions are exported from `symbiote-ui/webmcp` (file: `webmcp.js`).

## getModelContext(target)

Returns the model context provider, or `null`.

```javascript
import { getModelContext } from 'symbiote-ui/webmcp';

let ctx = getModelContext(document);
// ctx = document.modelContext || null
```

## createToolDescriptor(options)

Creates a plain tool descriptor object (shallow copy).

```javascript
import { createToolDescriptor } from 'symbiote-ui/webmcp';

let descriptor = createToolDescriptor({
  name: 'update-panel',
  description: 'Update panel label and state',
  inputSchema: {
    type: 'object',
    properties: {
      label: { type: 'string' },
      state: { type: 'string', enum: ['idle', 'running', 'error'] }
    }
  }
});
```

## createComponentToolDescriptor(component, tool)

Creates a tool descriptor enriched with component metadata.

```javascript
import { createComponentToolDescriptor } from 'symbiote-ui/webmcp';

let descriptor = createComponentToolDescriptor(myPanelElement, {
  name: 'toggle-visibility',
  description: 'Show or hide this panel'
});
// descriptor.description includes component.componentDescription prefix
// descriptor.annotations includes { componentTag, componentClass, semanticRole }
```

**Component description resolution:**
1. `component.componentDescription`
2. `component.agent?.componentDescription`
3. `component.description`
4. `''`

**Annotations added automatically:**
| Key | Source |
|-----|--------|
| `componentTag` | `component.tagName` |
| `componentClass` | `component.className` |
| `semanticRole` | `component.agent?.semanticRole` |

## registerWebMcpTool(options, target, registrationOptions)

Registers a tool with the model context provider. Falls back gracefully.

```javascript
import { registerWebMcpTool } from 'symbiote-ui/webmcp';

let abortController = new AbortController();
let { nativeActive, descriptor, unregister } = await registerWebMcpTool({
  name: 'send-chat-message',
  description: 'Send a message in the chat panel',
  inputSchema: {
    type: 'object',
    properties: { message: { type: 'string' } },
    required: ['message']
  },
  execute(input) {
    return { sent: input.message };
  }
}, document, {
  signal: abortController.signal,
  exposedTo: ['https://agent.example']
});

if (nativeActive) {
  console.log('Tool registered natively with browser WebMCP');
} else {
  console.log('Fallback: tool descriptor created but not registered natively');
}

// Cleanup
unregister();
```

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `options` | `object` | — | Tool descriptor options (name, description, inputSchema, execute) |
| `target` | `Document` | `globalThis.document` | Document for model context resolution |
| `registrationOptions` | `object` | `{}` | Registration configuration options (e.g. signal, exposedTo) |

**Returns:**
```javascript
{
  nativeActive: boolean,  // true if registered with native WebMCP API
  descriptor: object,     // The tool descriptor object (always the same canonical plain descriptor passed to registration)
  unregister: function    // Idempotent cleanup function
}
```

**Validation and Fallback behavior:**
- **Fail-Fast Verification**: Both `registerWebMcpTool()` and `registerProductContextTools()` throw an error if `descriptor.execute` is not a function.
- **Registration Options**: an external `signal` is mapped to the internal registration lifecycle signal passed to `document.modelContext.registerTool`; `exposedTo` is forwarded unchanged.
- If `modelContext` is not available → returns `nativeActive: false` with the same canonical plain descriptor.
- `unregister()` is always safe to call (noop if no native registration) and is fully idempotent.

`annotations.destructiveHint` is product/MCP policy metadata for consumers such
as a confirmation gateway. It does not imply that the browser will mediate or
confirm a destructive execution.

### Execution Context & Out-of-Band Calls
Standard WebMCP `execute` callbacks in the browser receive exactly one argument: the tool input. In-bound executions from the host platform invoke this callback using only the `input` argument. Internal framework callers can execute the closure with a second out-of-band execution parameter containing advanced metadata like `signal`, `source`, `descriptor`, and `onSettled`.

When a product constructs its adapter and consumer from a prebuilt
`createProductWebMcpBundle()` result, pass that result as the `bundle` option to
`registerProductContextTools()`. Registration then uses the exact canonical
descriptor objects from `bundle.descriptors`; it does not create a second
descriptor set.

## triggerWebMcpCommand(element, command, args)

Dispatches a `webmcp-command` CustomEvent that bubbles through the DOM.

```javascript
import { triggerWebMcpCommand } from 'symbiote-ui/webmcp';

triggerWebMcpCommand(myElement, 'refresh-data', { source: 'timer', interval: 5000 });
```

The event:
- `type`: `'webmcp-command'`
- `bubbles`: `true`
- `composed`: `true` (crosses Shadow DOM boundaries)
- `detail`: `{ command: string, args: object }`

## Integration with Runtime Controller

When the runtime controller is connected via WebSocket, it listens for
`webmcp-command` events on the root element:

```javascript
root.addEventListener('webmcp-command', (e) => {
  ws.send(JSON.stringify({
    method: 'command',
    params: e.detail
  }));
});
```

This means any component in the subtree can trigger commands that reach the
server without direct WebSocket access — just by dispatching the custom event.
