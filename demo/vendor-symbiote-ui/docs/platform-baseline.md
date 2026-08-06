# Platform Baseline

`CHROMIUM_BASELINE_TARGET`: `Chromium 133+`

Symbiote UI treats Chromium 133+ as the browser-platform target for target-schema
browser smoke and feature planning. Runtime code must still feature-detect browser
surfaces before use; this target is a planning baseline, not a user-agent gate.

Rows marked `shimmed` or `capability-detected` are the allowed R-UI28 exception
classes. They must be re-graded when the underlying API reaches stable Chromium
and whenever `CHROMIUM_BASELINE_TARGET` changes.

## Feature Ledger

| Feature | Status | Shim | Spec consumers | Capability gate |
| --- | --- | --- | --- | --- |
| URLPattern | baseline | - | Route schema, route matcher, server-plane URL contracts | `globalThis.URLPattern` |
| Element.moveBefore / connectedMoveCallback | baseline | - | Framework handoff, state-preserving shell moves, WebMCP target continuity | `Element.prototype.moveBefore`; `connectedMoveCallback` tracked with the framework backlog |
| Declarative Shadow DOM | baseline | - | SSR process HTML, stream rendering, root shadow hydration | `HTMLTemplateElement.prototype.shadowRootMode` |
| adoptedStyleSheets / rootStyles delivery | baseline | - | SSR rootStyles, cascade themes, constructable stylesheet delivery | `Document.prototype.adoptedStyleSheets`, `ShadowRoot.prototype.adoptedStyleSheets`, `CSSStyleSheet.prototype.replaceSync` |
| view-transition-name custom idents | baseline | - | Workspace address serialization, panel transition targets, route animations | `CSS.supports("view-transition-name", "workspace-panel-main")` |
| document.modelContext | shimmed | symbiote-webmcp-shim | WebMCP tool registration, tour context, agent-visible component actions | `document.modelContext`; otherwise install `symbiote-webmcp-shim` |

## Source Notes

- URLPattern is part of the current browser baseline and remains feature-detected
  because route matching must also run in non-browser tests.
- Declarative Shadow DOM and constructable stylesheets are required for SSR and
  rootStyles delivery paths, but hosts still own fallback rendering where a target
  browser does not expose the feature.
- `document.modelContext` is intentionally shimmed until the WebMCP surface is
  stable in Chromium; this row is the R-UI28 exception that must be re-graded first.
