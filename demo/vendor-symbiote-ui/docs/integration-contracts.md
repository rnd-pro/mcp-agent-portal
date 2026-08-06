# Integration Contracts

## WebMCP

Component metadata uses `component-descriptor-v2` with bounded agent-facing contracts:

- `componentDescription` gives agents a stable explanation of what the component represents in the current UI contract.
- `agent.semanticRole`, `agent.usage`, `agent.dataOwnership`, and `agent.webmcp` describe when to use a component, who owns its data, and which explicit tools exist.
- `contract.ssr.mode` classifies SSR safety as `node-safe`, `ssr-entry-safe`, `jsda-ssr-renderable`, `hydrate-only`, or `client-only`.
- `contract.webmcp.tools[]` documents explicit tool descriptors with `name`, `description`, `inputSchema`, `annotations`, visibility, and permission hints.
- WebMCP exposure is explicit-first. The package does not enable global `Symbiote.mcpToolMode` by default.

Use `listAgentComponentDescriptions()` from `symbiote-ui/manifest` or
`symbiote-ui discover` when an agent needs to understand which component is
which before composing a layout or choosing a tool.

`symbiote-ui/webmcp` also exposes `createComponentToolDescriptor(component,
tool)`, which appends the component context to explicit tool descriptions while
preserving the typed `ToolDescriptor` shape.

The RND-PRO overview of Symbiote WebMCP support is:

https://rnd-pro.com/pulse/symbiote-webmcp-support/

The upstream Symbiote WebMCP reference is:

https://github.com/symbiotejs/symbiote.js/blob/webmcp/docs/webmcp.md

## JSDA SSR

Hosts that use JSDA SSR should provide their own SSR runtime and DOM adapter:

```js
import { parseHTML } from 'linkedom';
import 'symbiote-ui/ui';
```

`jsda-ssr-renderable` components are expected to import safely in a JSDA SSR fixture with `ssr.enabled`, `ssr.imports`, `linkedom`, and Web Component SSR enabled by the host.

## Graph Media

Graph nodes carry an optional normalized media descriptor on `params.media`:

```js
{ kind, poster, alt, fit, activation: { provider, ...providerData }, targetIds }
```

The Node-safe `symbiote-ui`/`symbiote-ui/graph` entrypoint exports
`normalizeMediaDescriptor(raw)` and `isMediaDescriptor(value)` and validates the
shape against `schemas/media-descriptor-v1.json` (also inlined as the shared
`media` definition in `graph-model-v1` and `graph-v1`). A well-formed descriptor
is normalized; a missing `activation.provider` is rejected.

Presentation and activation are split so the graph stays cheap:

- `graph-node` renders only a lightweight poster (`alt`/`fit`) plus a themed,
  solid play affordance with a transparent cutout. It never mounts an iframe or
  player during render, pan, or zoom. Activating the poster (pointer or keyboard,
  via a native `<button>`)
  emits a bubbling, composed `sn-media-activate` event with
  `detail: { descriptor, nodeId }`.
- The browser `sn-media-host` component (`symbiote-ui/ui`) consumes a descriptor
  and mounts exactly one provider adapter on explicit user activation. Setting a
  new descriptor, deselection, or terminal disconnection unmounts it. An unknown
  provider or an adapter failure degrades to a poster plus an external link without
  throwing. Fallback navigation accepts only HTTP(S) or safely resolved relative
  URLs; executable schemes are omitted. `activate()` is readiness-safe: a
  request made before the provider
  stage is ready is remembered as a single pending activation and fulfilled from
  the Symbiote render lifecycle (not a timer), and a descriptor replacement or
  disconnect cancels a stale pending request so a rapid reselect never mounts the
  previous host late. Temporary DOM reparenting relies on Symbiote's native
  delayed destroy lifecycle: reconnecting before terminal destruction preserves
  the active adapter and mounted DOM stage without a public layout-move API.
  Terminal destruction releases the adapter and restores the poster; a later
  reconnect restores activation listeners.

The same descriptor drives the canvas render path. `CanvasGraph` draws a poster
clipped to the node dot plus a media-kind badge directly from
`node.params.media`, using the reusable `canvas-graph-media` helpers
(`getCanvasGraphNodeMedia`, `CanvasGraphMediaImages`, `drawCanvasGraphNodeMedia`,
`drawCanvasGraphImageFit`, `drawCanvasGraphMediaBadge`, exported from
`symbiote-ui/ui`). Poster images are lazily cached and drawn with `cover`/
`contain` fit; a node with no ready poster falls back to its icon. The canvas
never mounts a player during render, pan, or zoom — activation stays the
existing graph selection intent, so consumers do not need a product-local
canvas drawing fork.

`CanvasGraph.activateNode(nodeId, { transition = false, marker = false } = {})`
reflects activation state without changing or targeting the viewport. Its defaults
skip transition markers, it returns `false` for a missing or unknown id, and it is
idempotent for an already-active node. Hosts that own a scroll or visibility policy
can use this method without calling private graph internals or camera-moving focus APIs.

Provider adapters use fixed keys and an explicit `{ mount, unmount }` contract,
registered through `registerMediaProvider` / `getMediaProvider` /
`hasMediaProvider` / `listMediaProviders`. `symbiote-ui` ships built-in `image`
and privacy-hardened `youtube` adapters (`youtube-nocookie.com`, user activation
only, `loading=lazy`, minimal `allow`, sandboxed, and
`referrerpolicy=strict-origin-when-cross-origin`). Consumers register additional
fixed-key adapters (for example an IMS player) without forking the host.

## Rendered Content Slots

`code-block` (and `source-viewer`, which forwards to its nested `code-block`)
exposes a generic seam for mounting host-owned content at semantic positions
inside a rendered markdown body. It carries no HTML strings and no media, route,
or product concepts — the host owns what gets mounted and where selection leads.

Authors place a safe standalone directive between the relevant paragraphs of the
markdown source:

```markdown
The lesson introduces the player below.

:::content-slot lesson-intro

The next section explains the controls.
```

The directive `:::content-slot <key>` renders a library-owned placeholder in
document order. The key charset is constrained to `[A-Za-z0-9_-]`; any line with
a quoted, angle-bracketed, spaced, or extra-attribute payload does not match and
stays inert escaped text. There is no raw-HTML support. `renderMarkdown()` stays
pure and DOM-free, so the directive parses identically on the server.

```js
const hosts = codeBlock.renderContentSlots((hostElement, slotKey, { scrollRoot }) => {
  // mount host-owned content for slotKey; scrollRoot is the owned scroll viewport
  hostElement.append(myElement);
});
codeBlock.scrollToTop({ behavior: 'auto' });
codeBlock.scrollToFragment('lesson-intro', { behavior: 'smooth' });
codeBlock.clearContentSlots();
```

- `renderContentSlots(composer)` registers `composer(hostElement, slotKey, { scrollRoot })` and
  invokes it once for every rendered slot placeholder in document order, returning
  the array of composed host elements. `slotKey` is the directive key; each
  `hostElement` is the placeholder (`.cb-content-slot[data-content-slot]`) inside
  the markdown body. `scrollRoot` is the code-block-owned scroll viewport element,
  so hosts do not query the internal scroll selector. The composer is stored and
  re-run after every subsequent
  markdown render. Composition is binding-driven: a scoped `MutationObserver`
  watches direct child replacement on the innerHTML-bound `.cb-md` markdown root
  (never slot descendants), so recomposition follows the markdown replacement with
  no timer/rAF, no observer feedback loop, and no duplicate composition, and it
  survives repeated content swaps on the same block.
- `clearContentSlots()` drops the composer and disconnects the observer; composed
  content disappears naturally when the next markdown replacement removes its
  slots.
- `SourceViewer.showFile({ raw, renderedRaw, lang: 'md' })` may keep a clean
  source document in `raw` while using slot directives only in `renderedRaw`.
- `scrollToTop(options = {})` resets the owned viewport to `top: 0, left: 0`,
  honors an explicit `behavior`, and uses the same reduced-motion default as
  fragment scrolling.
- `scrollToFragment(id, options = {})` scrolls the internal viewport to a
  rendered-flow element by `id`. It is a no-op for a missing or invalid id, honors
  an explicit `behavior`, and defaults to `auto` when `prefers-reduced-motion`
  matches, otherwise `smooth`.

This is the counterpart to Graph Media: a graph media node stays a lightweight
poster, and selecting it navigates to the article whose normal markdown scroll
flow hosts the real player mounted through the slot the author placed between the
relevant paragraphs. Route, hash, and media policy stay with the host;
`symbiote-ui` owns only the generic slot point and the readiness-safe host.

## CodeBlock Presentation Chrome

`code-block` delivers a stable public presentation contract for documentation layouts.

### Attributes
- `copyable` (boolean): If present, displays a copy code affordance in the toolbar.
- `language-label` (string): If set, displays a language label in the toolbar.
- `line-numbers="show|hide"` (default `"show"`): If set to `"hide"`, suppresses the line number gutter.
- `frameless` (boolean): If present, guarantees no nested `<pre>` borders, background colors, or border radii, so the code block blends into parent containers.

### Methods
- `setPresentation(options = {})`: Batch updates presentation settings. Options include:
  - `copyable` (boolean)
  - `languageLabel` (string)
  - `lineNumbers` (`"show" | "hide"`)
  - `frameless` (boolean)
- `copyContent()`: Triggers a direct write of the code block's text contents to the modern system Clipboard API. Returns a Promise resolving to `true` (success) or `false` (rejection).

### Events
- `code-block-copy`: Emitted on copy execution. Bubbles and is composed. The event `detail` contract contains:
  - `success` (boolean): Whether the clipboard write succeeded.
  - `content` (string): The text payload attempted.
  - `error` (Error|undefined): The rejection reason if the write failed.

## Connection and PCB Markers

Edges use `kind`, `direction` (`none`, `forward`, `reverse`, `both`), and
`design.marker.role` (`none`, `flow`, `gate`) to declare marker semantics.

- `flow` is a trace-colored rectangle with a graph-background arrow cutout. It
  appears only on directed primary edges and uses the longest safe routed segment.
- `gate` is an explicit square on a directed primary edge. The library never
  infers it from layout or assigns it randomly.
- Containment, reference, association, secondary, and non-directional edges have
  no edge-local marker.
- Circular junctions are derived from real containment branches. Routes must
  share the same `(from, out)` connector and a common trunk before splitting;
  authoring `design.marker.role: junction` on an edge has no effect. Nested or
  equal junction candidates within the same group are coalesced using a spatial
  hash when their circles intersect, while non-nested overlapping junctions
  remain distinct.

`projectConnectionMarkerGeometry()` is the shared geometry projection for SVG
and Canvas renderers. The animated focus-transition ball remains independent of
the marker lifecycle.

- Connection markers are hidden when their rendered footprint intersects an
  unrelated, higher-priority focused route. Owner routes are always exempt.
- Priority is selected, active, then ordinary or dimmed. Equal-priority
  markers remain visible.
- SVG uses the focused path's rendered width and toggles
  `data-collision-hidden`. Canvas uses its focused trace width and caches the
  result until graph geometry or selection changes; viewport-only transforms
  do not repeat collision detection.
## Package Boundary

`symbiote-ui` owns Web Components, UI/layout primitives, manifests, schemas, rules, tokens, themes, locale helpers, provider-facing graph metadata, WebMCP metadata, and `custom-elements.json`.

Runtime workflow execution, persistence, server commands, handler packs, and process lifecycle belong in `symbiote-engine`.
