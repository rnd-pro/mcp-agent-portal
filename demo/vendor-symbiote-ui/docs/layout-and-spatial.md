# Layout and Spatial Contracts

## Layout Behavior

`symbiote-ui/layout` exposes SSR-safe layout behavior helpers for hosts and
agents that compose dynamic workspaces:

```js
import {
  LayoutTree,
  resumeLayoutSubtree,
  resolveLayoutMinSize,
  resolveResponsiveLayoutState,
  suspendLayoutSubtree,
} from 'symbiote-ui/layout';

let root = LayoutTree.createSplit(
  'horizontal',
  LayoutTree.createPanel('graph', {}, { importance: 90, minInlineSize: 420 }),
  LayoutTree.createPanel('chat', {}, { importance: 40, minInlineSize: 320 }),
  0.58
);

let minSize = resolveLayoutMinSize(root);
let state = resolveResponsiveLayoutState(
  { collapse: 'auto', overflow: 'scroll-inline', responsiveMode: 'scroll-inline' },
  { inlineSize: 520, blockSize: 420, layoutMinSize: minSize }
);

suspendLayoutSubtree(workspaceEl, { reason: 'workspace-inactive' });
resumeLayoutSubtree(workspaceEl, { reason: 'workspace-active' });
```

`panel-layout` uses the same contract at runtime. Root `layoutBehavior`
is host-applied responsive policy and is not persisted into the saved layout
tree; per-panel or per-branch `behavior` belongs on layout nodes and is
persisted with the tree. `importance` decides auto-collapse order, minimum
inline/block sizes decide when panels no longer fit, `collapse` controls
whether a panel may auto-collapse, `overflow` selects collapse versus
horizontal/vertical scroll fallback, and `responsiveMode` selects mobile
preserve, vertical stack, horizontal scroll, or drawer behavior. In drawer
mode the same layout tree stays mounted: one `mobileDock: 'primary'` panel
remains central while `mobileDock: 'start'` and `mobileDock: 'end'` panels are
projected as gesture-capable side drawers. Minimum footprint resolution
accounts for split ratios, so a skewed split still reserves enough scrollable
space for both child branches.
At runtime `panel-layout` exposes resolved scroll axes through
`scroll-inline-active` and `scroll-block-active` attributes so CSS, browser
smoke tests, and agents can distinguish requested policy from active fallback.
Separate `panel-layout` roots that are adjacent in a host shell can opt into the
same `layout-peer-group`. Visible peers in the group expose root-panel collapse
controls even when each layout has a single panel; the component resolves the
collapse axis/side from peer geometry and reflects `layout-peer-active`,
`layout-peer-collapse-dir`, `layout-peer-collapse-side`, `root-collapsed`,
`root-collapse-dir`, and `root-collapse-side` for host flex/dock chrome.
Drawer projection exposes `drawer-mode-active`, `drawer-start-open`, and
`drawer-end-open` runtime attributes; opening drawers changes only presentation
state and does not save or mutate the host layout tree.
`layout-sidebar` owns only its sidebar configuration and width persistence; its
reset control clears that state and emits `layout-sidebar-reset` for host-owned
layout resets instead of clearing host storage or reloading the page.
`suspendLayoutSubtree()` and `resumeLayoutSubtree()` call public
`suspendLayout()`/`resumeLayout()` methods on reusable components and host
adapters in a hidden layout subtree. `chat-workspace`, `chat-composer`, and
`cell-bg` implement this contract so hidden workspace groups stop animated
backgrounds, wake listeners, voice capture, and UI timers without destroying
host-owned chat, route, or layout state.

## Node Canvas Layout

`node-canvas.applyLayout()` supports `auto`, `tree`, `flow`, and `crystal`.
Every algorithm returns top-left positions. Non-flow algorithms measure the
rendered node rectangles by default, batch position writes, refresh connections
once, and fit the viewport only when `fit: true` is supplied.

```js
let result = canvas.applyLayout({
  algorithm: 'crystal',
  rootNodeId: 'workspace-root',
  groups: {
    'cluster-a': ['cluster-a', 'leaf-a', 'leaf-b'],
  },
  startX: 80,
  startY: 64,
  crystalRingDistance: 120,
  crystalSpokes: 6,
  crystalAngleJitter: 0.12,
  fit: true,
});
```

Crystal layout is deterministic for equivalent node, edge, and group data.
`rootNodeId` selects the growth root and takes precedence over the
force-layout-only `activeVisualNodeId`. An invalid explicit root resolves to a
deterministic graph root instead of following transient focus. `startX` and
`startY` anchor the resolved root's top-left corner. `groups` identify generic
hub/member clusters; the layout does not infer product-specific ownership.
`crystalRingDistance` must be positive, `crystalSpokes` is normalized to 3–12,
and `crystalAngleJitter` is normalized to 0–0.22. Successive rings increase
their capacity by the configured spoke count, producing bounded hexagonal
growth instead of adding one fixed-size ring per spoke batch. Explicit groups
are authoritative layout hubs; automatic degree-based hubs are used only when
the graph supplies no groups. In a grouped graph, an explicit semantic hub
accepts only its declared members. Nodes not claimed by an explicit group or
an existing `isGroup`/`children` structural hub fall back to the root. This
keeps article/media clusters local without absorbing adjacent skills, sections,
or timeline nodes.

The Node-safe `computeCrystalTargets()` planner uses center coordinates for
force simulation. Each target also exposes `layoutParentId`: `null` for the
root, the root ID for hub targets, and the assigned hub ID for member targets.
Agents and diagnostics can therefore verify semantic ownership without
inferring it from proximity. `ForceLayout` sends those canonical targets to the
classic worker, which applies forces without maintaining a second crystal planner.
`computeCrystalLayout()` adapts the same plan to top-left node-canvas
coordinates and ignores prior node positions during explicit relayout.

## Graph Layout Quality

`symbiote-ui/graph` exposes a pure, Node-safe quality audit for settled 2D graph
geometry. It does not move nodes or choose a layout algorithm. Hosts provide a
JSON-compatible snapshot with final node bounds, connections, optional routed
points, viewport, and baseline; the analyzer returns stable finding codes with
the exact node and edge IDs that need attention.

```js
import { analyzeGraphLayout } from 'symbiote-ui/graph';

let report = analyzeGraphLayout({
  version: 'graph-layout-snapshot-v1',
  nodes: [
    { id: 'article', bounds: { x: 0, y: 0, width: 240, height: 160 } },
    {
      id: 'media',
      parentId: 'article',
      bounds: { x: 320, y: 30, width: 180, height: 120 },
    },
  ],
  edges: [
    { id: 'article-media', sourceId: 'article', targetId: 'media' },
  ],
  viewport: { width: 960, height: 640, padding: 48 },
  policy: { idealEdgeLength: 160 },
});
```

The report uses `graph-layout-quality-v1` and contains:

- `status`: `pass`, `warn`, `fail`, or `incomplete`;
- `pass` and `complete` for CI and agent gates;
- normalized node, edge, bounds, viewport, locality, and stability metrics;
- `findings[]` with `ruleId`, severity, involved IDs, actual value, and limit;
- `coverage` where every check records its `required` entity-pair count,
  `complete` or `skipped-budget` status, and worst-case primitive
  geometry-comparison `budgetCost`;
- the resolved `policy` and normalization basis needed to reproduce the result.

Overlaps above the area-valued `overlapTolerance` and connections crossing the
interior of unrelated nodes are failures. Invalid input, malformed geometry,
invalid parent or baseline data, and an exhausted geometry-comparison budget are
blocking `incomplete` results. Edge crossings, excessive distances, unreadable viewport
fit, and layout instability are warnings by default. Routed `points` enable
checks against the rendered connection path; otherwise the analyzer evaluates
a straight center-to-center segment. Boundary tangency does not count as an
interior node intersection.

Baseline nodes may be an array of `{ id, bounds }` or flat
`{ id, x, y, width, height }` records, or an ID-keyed object whose values are
bounds or `{ bounds }`. Duplicate IDs are never resolved by input order: every
ambiguous occurrence is skipped and reported.

Node and edge IDs are canonical non-empty strings without leading or trailing
whitespace. Geometry and route points stay inside the published numeric domain,
which keeps distances, areas, normalization ratios, and serialized reports
finite across very small and very large layouts. Coverage records malformed
entries through `skippedCount` and `unidentifiedCount`; it never invents IDs
that could collide with graph data. If a non-zero derived center delta, area,
ratio, fit scale, rendered size, or aggregate ratio materializes as zero in
IEEE-754, the audit returns `incomplete` with `layout.numeric-underflow`
instead of silently passing. Center differences use cancellation-stable bounds
arithmetic before distance and baseline calculations.

Agents discover the operation, exact input/output schema, report invariants,
status semantics, stable rule catalog with payload schemas, types and units,
default policy, per-field policy constraints, and numeric domain through
`symbiote-ui discover` at `manifest.graphAnalysis`. They can import the function
or run the same contract from a file:

```sh
symbiote-ui layout-audit graph-layout-snapshot.json
```

The CLI prints the JSON report and exits non-zero for `fail` or `incomplete`.
It does not persist reports, mutate graph state, or apply product-specific
article/media policy.

## Spatial Algorithms

`symbiote-ui/xr` includes a set of dependency-free spatial primitives for 3D
graph visualization, force-directed layout, spatial indexing, and multi-view
coordination. All algorithmic cores are pure JavaScript, renderer-neutral, and
Node-safe. Three.js and WebXR adapters accept runtime dependencies through
injection, never as hard imports.

The strict target/observation/audit lifecycle, pre-root placement receipts,
portable panel interaction, and deterministic 2×2 projection contract are
documented in [XR Spatial Evidence](./xr-spatial-evidence.md). The fourth
axonometric pane is reference-only and nonmetric; it never affects the runtime
verdict.

### Octree / Spatial Index

High-performance 3D octree for spatial queries and Barnes-Hut force
approximation:

```js
import { createOctree } from 'symbiote-ui/xr/spatial-index';

let tree = createOctree();
tree.insertAll([
  { x: 1, y: 2, z: 3 },
  { x: 4, y: 5, z: 6 },
  { x: 0, y: 0, z: 0 },
]);

let nearest = tree.nearest(1, 1, 1);
let box = tree.queryBox(0, 0, 0, 3, 3, 3);

tree.visit((node, x0, y0, z0, x1, y1, z1) => {
  // depth-first traversal of octants
});
```

### Spatial Graph Model

Pure functions to create and query a renderer-agnostic 3D graph model
conforming to the `spatial-graph-v1` contract:

```js
import {
  createSpatialGraphModel,
  updateSpatialNodePosition,
  selectSpatialNode,
  focusSpatialNode,
  pinSpatialNode,
  unpinSpatialNode,
} from 'symbiote-ui/xr/spatial-graph';

let model = createSpatialGraphModel({
  nodes: [
    { id: 'a', label: 'Module A', type: 'module', position: [0, 0, 0] },
    { id: 'b', label: 'Module B', type: 'module' },
  ],
  links: [
    { source: 'a', target: 'b', type: 'dependency' },
  ],
});

model = updateSpatialNodePosition(model, 'a', [1, 2, 3]);
model = selectSpatialNode(model, 'a');
model = focusSpatialNode(model, 'b');
model = pinSpatialNode(model, 'a', [1, 2, 3]);
model = unpinSpatialNode(model, 'a');
```

All functions are pure and return new model objects. Host metadata is preserved
in `node.metadata` without product-specific fields leaking into the contract.

### Force-Directed Layout

3D force simulation with Barnes-Hut many-body repulsion via the built-in
octree. No external dependencies:

```js
import {
  createSimulation,
  forceCenter3D,
  forceLink3D,
  forceManyBody3D,
  forceCluster3D,
} from 'symbiote-ui/xr/force-layout';

let nodes = [
  { id: 'a', x: 0, y: 0, z: 0, category: 'core' },
  { id: 'b', x: 1, y: 0, z: 0, category: 'core' },
  { id: 'c', x: 0, y: 1, z: 0, category: 'util' },
];

let links = [
  { source: 'a', target: 'b' },
  { source: 'b', target: 'c' },
];

let sim = createSimulation(nodes);
sim.force('center', forceCenter3D(0, 0, 0));
sim.force('charge', forceManyBody3D().strength(-3.5));
sim.force('link', forceLink3D(links));
sim.force('cluster', forceCluster3D().strength(0.15));

for (let i = 0; i < 300; i++) sim.tick();
// nodes[0].x, .y, .z now contain settled positions
```

The `createForceLayoutAdapter` bridge connects a `NodeEditor` to the 3D
simulation:

```js
import { createForceLayoutAdapter } from 'symbiote-ui/xr/force-layout-adapter';

let adapter = createForceLayoutAdapter(editor, {
  strength: -4,
  distance: 1.5,
  useCluster: true,
});

adapter.tick(); // one simulation step, syncs coordinates back to editor nodes
```

### Spherical Layout

Deterministic 3D layout using Fibonacci spiral distribution. Units are meters
for XR compatibility:

```js
import { createSphericalGraphLayout } from 'symbiote-ui/xr/spherical-layout';

let layout = createSphericalGraphLayout(
  [
    { id: 'a', type: 'module' },
    { id: 'b', type: 'module' },
    { id: 'c', type: 'util' },
  ],
  [{ source: 'a', target: 'b' }],
  {
    mode: 'clustered-shell', // 'sphere' | 'shell' | 'clustered-shell'
    radius: 1.6,
    center: [0, 1.55, 0],
    category: (d) => d.type,
  }
);

// layout.nodes[i].position → [x, y, z]
// layout.bounds → { min: [x,y,z], max: [x,y,z] }
```

Fixed nodes are preserved in place. Output is fully deterministic for stable
agent-authored layouts.

### Spatial Drag Controller

Pure ray-sphere intersection math and pointer drag projection. No DOM, Three.js,
or WebXR dependencies:

```js
import {
  intersectRaySphere,
  hitTestSpatialNode,
  projectPointerToDragPlane,
  createSpatialDragController,
} from 'symbiote-ui/xr/spatial-drag-controller';

// Ray-sphere hit test
let dist = intersectRaySphere(
  [0, 0, 5],     // ray origin
  [0, 0, -1],    // ray direction
  [0, 0, 0],     // sphere center
  0.08            // sphere radius
);

// Hit test against spatial graph nodes
let hit = hitTestSpatialNode(model.nodes, {
  origin: [0, 0, 5],
  direction: [0, 0, -1],
});

// Full drag controller
let drag = createSpatialDragController();
let startEvent = drag.startDrag(hit.node, pointer);
let moveEvent = drag.moveDrag(pointer);
let endEvent = drag.endDrag();
// Events follow the spatial-node-drag contract: { type, nodeId, phase, position }
```

### Panel Auto-Tiling

Distributes workspace panels in 3D space with arc, grid, and sphere layouts:

```js
import { autoTileXRPanels } from 'symbiote-ui/xr';

let poses = autoTileXRPanels(
  [
    { id: 'chat', width: 0.6, height: 0.8 },
    { id: 'graph', width: 0.8, height: 0.6 },
    { id: 'inspector', width: 0.4, height: 0.6 },
  ],
  { layout: 'arc', comfortDistance: 1.2 }
);

// poses[i] → { id, position, rotation, ... }
```

### Three.js Adapter

Optional renderer adapter. The host supplies the `THREE` instance to avoid
making Three.js a mandatory dependency:

```js
import { createThreeSpatialGraph } from 'symbiote-ui/xr/three-spatial-graph';

let graph3D = createThreeSpatialGraph(THREE, model);
scene.add(graph3D.group);

// On model change:
graph3D.setModel(updatedModel);

// Cleanup:
graph3D.destroy();
```

Renders spherical nodes, link lines, and selection/focus color states.
Meshes are created, updated, and disposed automatically.

### Experimental Native Panels (Three/WebGL Lab)

`symbiote-ui/xr` also ships an experimental, product-neutral pipeline for native
3D panels, exercised end-to-end by `demo/native-panels-webgl-lab.html`:

1. `projectXRPanelsToPlane(panels, options)` (pure, Node-safe) maps the
   normalized `relativeRect` produced by `projectLayoutToXR()` onto a centered
   meter-space plane with a configurable width, height, gap, and Z. Panel IDs
   and metadata pass through unchanged.
2. `compileNativePanelPrimitives(panels, familyData)` (pure, Node-safe) compiles
   projected panels plus generic family data (`list-table`, `workflow-graph`,
   `detail-actions`) into deterministic panel-local primitives on four finite Z
   layers (`surface`, `content`, `controls`, `focus`). Primitives carry stable
   IDs, semantic theme roles, bounds in local meters, hit targets/actions, and
   counts; `resolveNativePanelHit(panel, point)` resolves normalized 0..1 panel
   coordinates back to those hit targets. `resizeNativePanel()` and
   `resizeNativePanelScene()` commit an absolute meter size by recalculating
   edge anchors and full-span bounds instead of applying a transform scale.
   Unanchored primitives retain their physical spacing; bounds crossing a
   smaller window viewport are clipped, and fully excluded primitives are
   removed from hit testing. Raster source dimensions follow changed bounds,
   preserving the original pixels-per-meter density. No random or time-derived
   IDs.
3. `createThreeNativePanelRenderer(THREE, options)` is the browser adapter: the
   host injects the `THREE` namespace (the module never imports Three and never
   touches the DOM at evaluation time). It builds one root group and one group
   per panel, renders primitives as native meshes, and uses small CanvasTexture
   planes for text and icons only (not HTML-in-Canvas). Generated label/icon
   textures are sized from measured source CSS pixels × bounded DPR
   (`min(devicePixelRatio, 2)`, host-overridable, clamped to a 2048 default cap)
   — the `measured-source-css` policy — while hand-authored primitives without
   source CSS boxes use the explicit `fallback-meter-policy` (1200 px/m).
   Resize preview keeps content at scale 1, hides old primitives outside the
   smaller shell, and restores their visibility if the gesture is cancelled.
   Generated color textures are configured for linear sampling without mipmaps
   (`LinearFilter` min/mag, `generateMipmaps: false`, host anisotropy capped at
   8, `SRGBColorSpace`). Icon primitives draw Material Symbols ligatures through
   the same Canvas2D seam with a matching `createIconPlane`/`updateIconPlane`
   host hook; captured text metrics (font family/size/weight/style, line-height,
   letter-spacing, direction, ellipsis) are applied exactly, and unsupported
   Canvas2D controls are reported as data. Theme updates recolor existing
   materials and redraw label/icon textures without rebuilding the scene;
   `refreshAppearance(scene, { theme })` applies a recaptured scene in place
   keyed by primitive ids (redrawing textures and resolved styles with window
   object identity preserved) and rejects changed bounds/typography or border
   presence/width with a
   structured `geometry-invalidated` result; `refreshTextures()` is the explicit
   quality redraw for late font readiness. Layer explode offsets the four layer
   groups, stable `panelId`/`primitiveId`/`actionId` metadata rides on every
   object so recursive Raycaster hits resolve without a second coordinate
   model, `getTextQualityReport()` exposes the `native-panel-text-quality-v1`
   diagnostics (policy, source CSS size, texture dimensions, px/m, sampling,
   font readiness, unsupported controls, glyph misses, icon captured/compiled/
   drawn coverage, texture-memory estimate), and `dispose()` releases all GPU
   resources and generated canvases/textures. `getAppearanceReport()` exposes a
   renderer-neutral `native-panel-appearance-v1` plain-JSON sample of the
   mounted scene — per-primitive id/provenance, kind/control, visibility,
   color/opacity/transparent, resolved-style, scene scale, and actual border
   evidence, sampled in
   the neutral interaction state with hovered/selected ids reported separately
   — for visual parity comparison; no THREE objects leak into the report. CSS color functions THREE cannot
   parse (`oklch()`, `lab()`, `color(…)`, unresolved `var(…)`) are never
   forwarded to `THREE.Color`; they are counted in renderer diagnostics as
   `unsupportedColors` (reset per mount/theme pass).
   Window resizing is two-phase: `previewPanelSize()` moves the native chrome
   around a themed empty background while mounted content remains at scale 1.
   `replacePanel(scene, panelId)` then atomically swaps only the committed
   window group, preserving its presentation transform, pinned/closed state,
   every sibling group identity, and the shared renderer root.
   `cancelPanelSizePreview()` restores the committed shell without changing
   content.
4. `createNativePanelThemeSnapshot(root, options)` (xr/theme-bridge.js) captures
   the semantic native-panel roles (surface ladder, text/dim, outline, accent,
   success, warning, danger) and numeric layout/type metrics from the same
   computed cascade snapshot the DOM consumes, so a `cascade-theme-change` event
   re-projects the live theme into the 3D scene.

The same lab can also generate the native scene from a measured live Symbiote
layout instead of hand-authored family data:

5. `captureSpatialSnapshot(root, options)` (xr/dom-spatial-capture.js,
   browser-only, evaluation-safe in Node) measures a bounded `panel-layout`
   subtree after custom elements, fonts, and two animation frames settle. A
   plain-object adapter registry (`layout-node` panel chrome/splits/resizers,
   `sn-tree-panel` rows, `source-editor` text) plus explicit structural text
   selectors own what is captured; `resolveSpatialAdapter(tag)` throws with the
   supported list on unknown components. Output is a serializable
   `spatial-snapshot-v1` (xr/spatial-snapshot.js, schema in
   `schemas/spatial-snapshot-v1.json`): root-relative CSS-pixel boxes, resolved
   allowlisted styles, text/state/action provenance, and structured diagnostics
   for unsupported features and unknown visible boxes — never silent drops.
   Captured color styles are normalized at the seam to renderer-consumable
   `rgb()`/`rgba()` through a browser-native 1x1 Canvas 2D readback (alpha
   preserved, no custom CSS color parser), so CSS Color 4 values such as
   `oklch()` never reach the renderer; unconvertible colors drop the style key
   and surface as `unconvertible-color` diagnostics instead of claiming color
   parity. Header controls capture distinct stable intents per button
   (`SPATIAL_HEADER_CONTROLS`: `panel-collapse-toggle`, `panel-fullscreen`,
   `panel-menu` for `.panel-menu-toggle`, `panel-type-menu` for `.type-btn`);
   `resolveHeaderControlSelector(intent)` maps each intent back to its own DOM
   control so relays cannot fork. Explicit Material Symbols descendants
   (`SPATIAL_ICON_SELECTOR`: `.material-symbols-outlined`, `.sn-tree-icon`,
   `.sn-tree-toggle`) of the bounded LayoutNode/TreePanel subtrees become
   renderer-neutral icon nodes (`part: "icon"`, validated `icon: { name }`
   ligature, never `text`) parented to their owning control, row, title, or
   panel; generic structural text capture and tree title/label extraction
   exclude icon descendants so literal ligature words never leak into text,
   and invalid glyph names surface as `icon-glyph` diagnostics. Text nodes
   capture only renderer-consumed properties: color, font family, size, weight,
   style, line-height, letter-spacing, text-align, direction, white-space,
   overflow, and text-overflow. Tree rows additionally capture provider-generic
   `badge` nodes (`.sn-tree-badge` text with resolved background/color), the
   tree filter becomes a non-editable `field` proxy node (placeholder or current
   value as text, resolved background/border; the `text-input` interaction
   stays an unsupported diagnostic), and tree-host chrome (host, title row,
   toolbar) is captured as `surface` nodes with the toolbar collapse button as
   a control carrying the `sn-tree-panel-collapse` intent
   (`SPATIAL_TREE_CONTROLS`). Explicit `surfaceSelectors` opt extra structural
   surfaces into capture without dropping their child text/icons: matched
   elements become `surface` nodes and descendants with direct text resolve to
   text nodes, so opted-in subtrees leave no unknown visible boxes. Surface
   chrome evidence includes narrow uniform solid borders only: all four sides
   equal, `solid` style, one normalized color, at or below
   `SPATIAL_BORDER_MAX_WIDTH_PX` (2 px). Partial-side borders and
   pseudo-element dividers are excluded and reported as informational
   `partial-border` diagnostics; radii, shadows, caret/focus editing chrome,
   and input/IME behavior remain current non-goals and are not rendered.
6. `compileSpatialSnapshot(snapshot, options)` (pure, Node-safe) compiles the
   measured snapshot into the same `native-panel-layout-v1` scene. Panel and
   resizer geometry derives from measured boxes only (never declared ratios),
   primitives carry `spatialNodeId` provenance plus resolved styles, and hit
   targets keep stable `actionId`/`targetId`/`intent` identity. Icon nodes
   compile to `kind: "icon"` primitives on the content layer, raised a fraction
   of a layer step above their owning control/surface; measured text and icon
   primitives carry `sourcePixels` (source CSS pixel dimensions) so renderers
   can size textures from real layout instead of density heuristics, and the
   exact captured font style passes through `style.font`. The renderer
   honors resolved per-primitive styles additively; theme-role behavior for the
   manual family path is unchanged. A single predicate,
   `hasVisibleControlChrome(node)`, decides control appearance: a control
   without visible background or border evidence compiles to a transparent
   `control: "hit"` region (invisible at idle, native hover/selected accent
   affordance on interaction), while controls with visible chrome stay
   `control: "button"`. `badge` nodes compile to a resolved surface plus label,
   `field` nodes to a sunken bordered surface plus a single-line proxy label,
   and `surface` nodes to content-layer surfaces — evidence-free surfaces
   compile with an explicit `transparent: true` marker so coverage is reported
   without painting. Normalized uniform borders compile to `style.border`
   (`width` in meters, normalized `color`) and the renderer draws them as thin
   edge meshes on the owning primitive.

   One layout panel is one spatial window: the captured `panel-layout` element
   is only a transport/layout container, each leaf `layout-node[node-type="panel"]`
   compiles to exactly one independently renderable and movable native group
   (`role: "window"`) that owns its own primitives, geometry, hit state, and
   layers, and child content never leaks into a sibling window. Each measured
   window header carries the shared `drag-panel` intent. The compiler preserves
   measured geometry; presentation hosts may add a visual gap and persistent
   per-window drag offset without changing snapshot or parity data. Split
   resizers are layout controls, not user windows: they compile to
   `role: "layout-control"` groups (`panelType: "split-resizer"`) that only
   arrange the windows, even though they travel in the same generic `panels`
   transport array.
   `counts.windows` and `counts.layoutControls` report the two roles separately
   while `counts.panels` stays the total transport-group count.
7. `createSpatialParityReport(snapshot, compiled, options)` (pure, Node-safe)
   emits a deterministic `spatial-parity-v1` report: panel/resizer edge
   round-trip error in CSS px (2 px tolerance by default), title/tree/editor
   text equality (icon nodes excluded), captured/compiled icon coverage with
   glyph-name equality, resolved style equality, action/target coverage, and
   counted unsupported/unknown diagnostics.
8. `createSpatialVisualParityReport(snapshot, appearance)` (pure, Node-safe,
   xr/spatial-visual-parity.js) compares the measured snapshot against the
   renderer's `getAppearanceReport()` sample — a `native-panel-appearance-v1`
   plain-JSON neutral-state report (hovered/selected ids reported separately,
   no THREE objects) carrying per-primitive id/provenance, kind/control,
   visibility, color/opacity/transparent, resolved-style, scene scale, and
   actual border evidence. Border parity compares both color and CSS-pixel
   width after normalizing the renderer's meter-space width through that scale.
   The deterministic `spatial-visual-parity-v1` report fails with stable
   structured issue ids on expected-transparent controls rendered opaque
   (`expected-transparent-opaque`), non-transparent surface/style mismatches
   (`surface-style-mismatch`), text/icon color mismatches
   (`text-color-mismatch`, `icon-color-mismatch`), missing renderer coverage
   (`missing-renderer-coverage`), and unknown visible capture boxes
   (`unknown-visible-box`); unsupported interactions such as `text-input`
   stay informational and never fail visual parity.
9. `symbiote-ui/xr/responsive-panel-capture` owns browser-authoritative
   responsive resize for one measured window. Pointer-down records an immutable
   `responsive-panel-resize-v1` context: source snapshot and CSS size, the
   meter-per-CSS-pixel scale, theme/data revisions, and form/scroll state. It
   also prepares a same-origin, scriptless `srcdoc` iframe containing only a
   deep clone of that leaf window, the current document stylesheets/adopted
   rules, scoped computed custom properties, and component state. The markup,
   attributes, custom properties, and stylesheet descriptors are copied
   synchronously before the first asynchronous preparation step, so the packet
   represents pointer-down rather than a later live DOM state. Pointer-move
   updates only the target meter/CSS size and native shell preview; it never
   resizes the iframe or scales committed content. On release,
   `captureResponsivePanelSnapshot()` assigns the final iframe viewport, waits
   for fonts and two animation frames, verifies the panel border-box size,
   reruns browser CSS/container-query layout, and captures exactly one window.
   The host compiles it at the frozen meter scale, replaces that one scene
   panel through `replaceNativePanelScenePanel()`, and calls the renderer's
   `replacePanel()`. Theme or reactive-data revision drift discards the
   prepared host and rebuilds it from the latest live DOM before capture.
   Both one-window commits and full recaptures validate their generation and
   revisions again immediately before publication, preventing an older async
   capture from overwriting newer theme or data state. Preparation failures
   always remove their temporary iframe.
   Server rendering may prepare the markup/state packet and pure resize
   context, but final computed CSS geometry remains browser-owned.

In the lab, the measured `real-layout` source is the default and renders the
live `cascade-theme-lab.html#multi-agent-dev/source-editor` reference in a
fixed-size same-origin iframe beside the native scene; the outer lab document
loads the self-hosted Material Symbols stylesheet (it owns the raster
canvases), explicitly awaits the icon font before first draw, and issues one
late-readiness quality redraw when the font arrives after mount. Its external
scene controls consume the same system, field, slider, focus, and state-layer
roles as the provider controls. One global cascade state is owned by the outer
root and mirrored without a second notification into the reference root; a
reference-root theme change is mirrored in the other direction. The resulting
single theme transition then re-captures the reference and updates Three through
the renderer
appearance-refresh seam (dark/light recapture updates resolved colors, text,
and icon styles in place with window object identity preserved; a
`geometry-invalidated` result triggers an intentional remount); theme roles
are normalized to `rgb()`/`rgba()` before reaching Three (unconvertible roles
are dropped and reported as `unsupportedColors` in the lab report); the lab
report surfaces `fontReadiness`, `appearanceRefresh`, and the renderer
`native-panel-text-quality-v1` report; product structural surfaces reach the
capture only through the explicit generic `surfaceSelectors` option; the lab
report exposes both parity subreports — `parity.ir` (`spatial-parity-v1`
summary) and `parity.visual` (`spatial-visual-parity-v1` summary) — and the
headline `parity.ok` is their conjunction; native row/control activation
relays to the matching live DOM intent (tree select/toggle/collapse, per-button
header intents resolved through `resolveHeaderControlSelector`, tree toolbar
controls through `SPATIAL_TREE_CONTROLS`, resizer drags). Native window headers
reuse `createSpatialDragController`; the lab stores each final manual offset
above the measured position and configurable window gap, so theme recapture and
gap changes do not erase individual placement. Pointer capture keeps the drag
owned until release. During resize, the native shell previews the new bounds
without scaling text or icons; release recaptures and replaces only that
window, while cancel disposes the prepared measurement host and restores the
previous group. Reactive DOM/input changes increment a data revision and
invalidate an in-flight resize context; theme recapture reruns every
persistently resized window at its committed CSS viewport. The parity report
composes canonical and responsive per-window snapshots so intentional size
differences do not become false visual mismatches. Reset clears all manual
offsets and committed sizes. A collapsed rail remains the measured collapsed window rather
than being expanded behind the reference layout's back. Because its type control
fills the narrow rail, that control is gesture-disambiguated: a click keeps the
original action, while pointer movement grabs and moves the window.
The explicit `mock-families` source keeps the hand-authored family path
working unchanged.

The lab demo pins Three `0.180.0` through its own import map. The package also
pins Three `0.185.1` as a development dependency for conformance tests while
runtime adapters continue to require a host-injected Three namespace. The
native compiler/renderer and HTML-in-Canvas compositor remain independent
backends over shared layout, intent, and theme contracts. Captured native
header controls relay the live `panel-fullscreen` intent; portable WebXR frames
expose the same window action through the host-owned `onPanelFullscreen`
callback.

### Dual View Controller

Coordinates state between 2D canvas, 3D desktop preview, and XR immersive
modes:

```js
import { createDualViewController } from 'symbiote-ui/xr/dual-view-controller';

let dualView = createDualViewController({ initialMode: '2d' });

let unsubscribe = dualView.subscribe((state) => {
  console.log(state.mode, state.activeNodeId, state.focusedNodeId);
});

dualView.enter3DPreview();
dualView.focusNode('node-a');
dualView.selectNode('node-b');
dualView.updateNodePosition('node-a', [1, 2, 3]);

// Cleanup
dualView.destroy();
```

State is serializable. The controller does not own product routing, project
loading, or engine execution.

### Standalone Subpath Imports

Each spatial module is available as a standalone subpath export:

| Subpath | Module |
| --- | --- |
| `symbiote-ui/xr/spatial-index` | Octree spatial index |
| `symbiote-ui/xr/spatial-graph` | 3D graph model (spatial-graph-v1) |
| `symbiote-ui/xr/force-layout` | Force-directed 3D simulation |
| `symbiote-ui/xr/force-layout-adapter` | NodeEditor ↔ force-layout bridge |
| `symbiote-ui/xr/spherical-layout` | Fibonacci spherical layout |
| `symbiote-ui/xr/spatial-drag-controller` | Ray/sphere drag math |
| `symbiote-ui/xr/dual-view-controller` | 2D/3D/XR state bridge |
| `symbiote-ui/xr/three-spatial-graph` | Optional Three.js renderer adapter |
| `symbiote-ui/xr/native-panel-layout` | Pure native-panel plane projection, primitive compiler, hit resolver |
| `symbiote-ui/xr/three-native-panel-renderer` | Optional Three.js native-panel renderer adapter |
| `symbiote-ui/xr/spatial-snapshot` | Pure `spatial-snapshot-v1` normalization and validation |
| `symbiote-ui/xr/spatial-snapshot-compile` | Pure measured-snapshot → native-panel scene compiler |
| `symbiote-ui/xr/spatial-parity` | Pure deterministic snapshot ↔ scene parity report |
| `symbiote-ui/xr/spatial-visual-parity` | Pure snapshot ↔ renderer-appearance visual parity report |
| `symbiote-ui/xr/dom-spatial-capture` | Browser-only DOM/CSSOM measurement adapters (evaluation-safe in Node) |
| `symbiote-ui/xr/spatial-contract` | Spatial evidence versions, conventions, and tolerances |
| `symbiote-ui/xr/spatial-math` | Column-major and root-relative geometry |
| `symbiote-ui/xr/spatial-projection` | Metric, stereo, and reference-only axonometric projections |
| `symbiote-ui/xr/spatial-evidence` | Target, sample, and audit verification |
| `symbiote-ui/xr/spatial-stability` | Consecutive-frame stability audit tracking |
| `symbiote-ui/xr/pointer` | Hit maps and placement/content select receipts |

All modules are also re-exported from the barrel `symbiote-ui/xr`.
