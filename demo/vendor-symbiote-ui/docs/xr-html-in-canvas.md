# XR HTML-in-Canvas Contract

Current-behavior reference for the experimental HTML-in-Canvas path exposed through
`symbiote-ui/xr` (`createXRHtmlCanvasRenderer`, `createXRHtmlCanvasDiagnostics`,
`createXRTextureGateSummary`) and the underlying adapter primitives re-exported
from `symbiote-ui`, `symbiote-ui/canvas`, and `symbiote-ui/ui`.

## Experimental, flagged platform capability

HTML-in-Canvas is an experimental Chromium capability behind an origin trial
(Chrome milestone range 148-150) and the `CanvasDrawElement` flag
(`chrome://flags/#canvas-draw-element`). It is never the only rendering path:
every use is gated by runtime feature detection (`getHtmlInCanvasSupport`,
`createXRHtmlCanvasEnablementSummary`), and unsupported environments must render
the declared fallback. Do not assume support in any Chromium, Safari, Firefox,
Electron, or WebView target without detection.

## Structured WebGL upload receipt

`renderer.renderPanel(panelId, gl, options)` in webgl mode never throws for
capability or ownership failures. It returns a bounded receipt:

```js
{
  version: 'xr-html-canvas-upload-receipt-v1',
  panelId,
  mode: 'webgl',
  rendered,     // true only when the native upload ran and succeeded
  uploaded,     // mirrors rendered
  canvasMatch,  // true when the panel element passed the same-canvas gate
  width, height,          // finite dimensions or null
  signature,    // 'current' | 'flag-era' | null
  reason,       // machine-readable failure reason or null
  errorName,    // DOMException name when the native call threw, else null
}
```

The receipt version is also exported as `XR_HTML_CANVAS_UPLOAD_RECEIPT_VERSION`.
The receipt is data only: it never carries DOM element, canvas, or message
references, so it is safe to log, transfer, and assert against.

## Same-canvas ownership gate

A panel element participates in HTML-in-Canvas only while it remains a direct
child of the canvas that owns the WebGL context. Before any native
`texElementImage2D` call, the renderer verifies both that `gl.canvas` is the
prepared canvas and that the element is still a direct child of it. Violations
skip the native call entirely and report structured reasons:

- `canvas-mismatch` — the element lives outside the context-owning canvas
  (`canvasMatch: false`);
- `missing-prepared-canvas` — the panel was prepared without a canvas;
- `missing-context-canvas` — the WebGL context exposes no canvas;
- `panel-outside-canvas-direct-child` — preparation or 2D preview was requested
  for an element that is not a direct canvas child.

## WebGL upload signature detection

`texElementImage2D` changed shape between the flag era and the current origin
trial. `uploadHtmlElementToWebGLTexture` uses native function arity only as a
signature hint: arity 3 maps to the current WebIDL signature
(`target, internalFormat, element[, config]`), while arity 6 maps to the
flag-era signature (`target, level, internalFormat, format, type, element`).
The optional current config does not change native function arity.

Current uploads accept only `RGBA8`, `SRGB8_ALPHA8`, `RGBA16F`, or `RGBA32F`.
The config may contain `sx`, `sy`, `swidth`, `sheight`, `width`, and `height`;
the four source-rectangle members must be provided together, as must the two
destination-size members. The flag-era adapter uses only the canonical
`TEXTURE_2D, 0, RGBA, RGBA, UNSIGNED_BYTE, element` tuple. Invalid formats or
configurations return bounded `invalid-internal-format`,
`invalid-current-config`, or `invalid-legacy-format-combination` results before
the native call. Any other arity returns
`{ rendered: false, mode: 'webgl', reason: 'unsupported-signature', arity }`.

## WebGPU copy signature

The current `GPUQueue.copyElementImageToTexture` WebIDL takes exactly two
dictionaries. The source dictionary contains the required `source` element or
element image plus optional `sx`, `sy`, `swidth`, and `sheight`. The destination
dictionary contains the required `destination` texture descriptor plus optional
`width` and `height`. `copySize` in the adapter is normalized into those
destination members; it is never forwarded as a third native argument.
Unsupported arity, incomplete copy dimensions, and native failures return
bounded `unsupported-signature`, `invalid-current-config`, or `copy-failed`
results.

## Capability failure as data

Missing platform capability is modeled as data, never as thrown control flow:

- `reason: 'unsupported'` when the required API is absent;
- `reason: 'html-in-canvas-unsupported'` when no render mode is available;
- `createXRHtmlCanvasDiagnostics` reports `supported`, `availability`
  (`texture-ready`, `canvas-ready`, `missing-layout-subtree`,
  `origin-trial-token-present-api-missing`, `origin-trial-or-flag-required`),
  per-API booleans, `missing`, and `blockingMissing` lists;
- `createXRPanelTextureSourceSummary` reports `source: 'html-in-canvas'`,
  `'provider-material-fallback'`, or `'unsupported'` with a reason;
- strict texture mode (`createXRTextureGateSummary` with `strict`) blocks frames
  until every panel uploads, surfacing the first blocking reason.

## Explicit semantic fallback expectation

Hosts must treat the fallback as a first-class, declared outcome — not an error
to hide. When the receipt or diagnostics report failure, the host renders the
declared semantic fallback: the `dom-overlay` fallback from the renderer
metadata, the provider material fallback (`provider-material-fallback`) for
world-space panels, or the regular DOM panel. Fallback preview pixels are never
used as the final XR texture size, and accessibility (focus, keyboard, text
selection) stays on the live DOM panel regardless of renderer mode.
