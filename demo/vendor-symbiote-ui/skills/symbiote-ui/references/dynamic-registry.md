# Dynamic Component Registry Reference

Complete reference for `createDynamicComponentRegistry` and `validateComponentCode`.

## validateComponentCode(code, options)

Validates a JavaScript code string against security policies before dynamic loading.

```javascript
import { validateComponentCode } from 'symbiote-ui/runtime';

validateComponentCode(myCode);  // throws on violation
validateComponentCode(myCode, {
  blockedKeywords: ['fetch(', 'XMLHttpRequest'],
  validate: (code) => !code.includes('__proto__'),
});
```

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `code` | `string` | JavaScript source code to validate |
| `options.blockedKeywords` | `string[]` | Keywords to reject (overrides defaults) |
| `options.validate` | `function(code): boolean` | Custom validation function |

**Default blocked keywords:**
```javascript
[
  'document.cookie',
  'document.write',
  'localStorage',
  'sessionStorage',
  'IndexedDB',
  'eval(',
  'new Function(',
  'process.env',
  'process.exit',
  'require('
]
```

**Returns:** `true` if valid.

**Throws:** `Error` with descriptive message on violation.

## createDynamicComponentRegistry(options)

Creates a registry that dynamically loads and registers Custom Elements.

```javascript
import { createDynamicComponentRegistry } from 'symbiote-ui/runtime';

let registry = createDynamicComponentRegistry({
  blockedKeywords: ['eval(', 'document.cookie'],
  validate: (code) => code.length < 50000,
  importModule: async (url) => import(url),  // override for testing
});
```

**Options:**
| Option | Type | Description |
|--------|------|-------------|
| `customElements` | `object` | Override for `globalThis.customElements` |
| `validate` | `function(code): boolean` | Global custom validator |
| `blockedKeywords` | `string[]` | Global blocked keyword list |
| `importModule` | `async function(url)` | Dynamic import override |

## Registry Methods

### registry.has(tagName)

Returns `true` if the tag is registered locally or in the global `customElements` registry.

```javascript
registry.has('my-widget');  // true or false
```

### registry.get(tagName)

Returns the class constructor for the tag, or `undefined`.

```javascript
let MyWidget = registry.get('my-widget');
```

### registry.list()

Returns an array of all locally-registered components.

```javascript
registry.list();
// [{ tagName: 'my-widget', classDefinition: class, code: '...', registeredAt: 1700000000 }]
```

### registry.register(tagName, codeOrClass, registerOptions)

Registers a Custom Element. Accepts either a class constructor or a JavaScript
code string.

```javascript
// From class
await registry.register('my-widget', MyWidgetClass);

// From code string
await registry.register('my-dynamic', `
  export default class extends HTMLElement {
    connectedCallback() { this.textContent = 'Hello'; }
  }
`);
```

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `tagName` | `string` | Must contain a hyphen (Custom Element spec requirement) |
| `codeOrClass` | `string \| Function` | Source code or class constructor |
| `registerOptions.allowOverride` | `boolean` | If `true`, silently reuses existing registration |
| `registerOptions.blockedKeywords` | `string[]` | Override blocked keywords for this registration |
| `registerOptions.validate` | `function` | Override validator for this registration |
| `registerOptions.exportName` | `string` | Named export to use (default: `default`) |

**Returns:** The class constructor.

**Throws:**
- If `tagName` doesn't contain a hyphen.
- If the tag is already registered and `allowOverride` is not `true`.
- If code validation fails (blocked keyword or custom validator).
- If dynamic import fails to produce a class constructor.

## Code Loading Mechanism

When a code string is provided:

1. **Validation** — `validateComponentCode()` checks for blocked keywords and custom validators.
2. **Module creation** — Code is wrapped in a `Blob` with `application/javascript` MIME type, and a temporary object URL is created. Falls back to `data:` URI if `Blob` is unavailable.
3. **Dynamic import** — The URL is imported via `importModule()` (configurable for testing).
4. **Export resolution** — Extracts `default` export, or `exportName`, or the single named export.
5. **Cleanup** — Revokes the Blob URL.
6. **Registration** — Calls `customElements.define(tagName, ClassDef)`.
7. **Tracking** — Stores `{ classDefinition, code, registeredAt }` in internal `definitions` Map.

## Duplicate Handling

The browser's `customElements.define()` throws if a tag is already registered.
The registry handles this gracefully:

1. Check `customElements.get(tagName)` first.
2. If the tag exists **and the code/class is identical** → silently return the existing class.
3. If the tag exists **but code/class differs** → throw an error (unless `allowOverride: true`).
4. If `allowOverride: true` → return the existing class without re-defining.

This prevents the common agent mistake of calling `customElements.define()` twice, which is a **fatal, unrecoverable browser error**.
