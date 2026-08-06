# Changelog

All notable changes to `symbiote-ui` will be documented in this file.

## [0.3.0-alpha.71] - 2026-08-02

### Fixed

- Added C++ fenced-code syntax highlighting to the reusable Markdown and code-block renderers.

## [0.3.0-alpha.69] - 2026-07-26

### Added

- Added narrow public entrypoints so consumers can import only what they use instead of the full `symbiote-ui/ui` catalog: `symbiote-ui/contracts/resource-tree` (Node-safe resource-tree builder), `symbiote-ui/ui/locale.js`, `symbiote-ui/canvas/graph-explorer.js`, `symbiote-ui/icons/material-symbols`, `symbiote-ui/ui/host-adapters.js`, `symbiote-ui/ui/media` (registry, built-in image/YouTube adapters, and `sn-media-host`), `symbiote-ui/canvas/canvas-graph`, `symbiote-ui/layout/LayoutTree`, `symbiote-ui/layout/panel-layout`, and `symbiote-ui/control/segmented-control`. `ui/media/**/*.js` is now declared side-effectful, and component registry, discover, and Custom Elements metadata advertise the narrowest public specifier for `sn-segmented-control`, `cascade-theme-widget`, `cascade-theme-editor`, `sn-theme-import-dialog`, `sn-tree-panel`, `sn-tree-view`, `node-canvas`, `canvas-graph`, `panel-layout`, `source-viewer`, and `sn-media-host`.

- Added the native spatial panel toolchain for XR: deterministic layout compilation, DOM capture, versioned snapshots and parity checks, Three/WebGL rendering, public `symbiote-ui/xr` exports, and the standalone Native Panels WebGL lab.
- Added strict XR spatial target, same-frame observation, stable audit, immutable content hit-map, and pre-root placement-receipt schemas. The Node-safe XR surface now includes column-major/root-relative math, metric top/front/right and stereo projections, a reference-only nonmetric axonometric pane, exact target/sample/audit verification, 30-frame/750-ms stability tracking, freshness-bound placement and panel select receipts, and Three.js adapter capabilities for world-locked root commit, trusted content selection, and spatial audit capture.
- Added `xr/chrome-theme.js` to derive concrete XR chrome colors and typography from the live default-provider theme instead of hardcoded values.
- Added `easeOutCubic` and `createXRScaleFadeTween`, plus an optional `panelTransitions` session setting for scale/fade panel transitions without changing store or receipt settlement.
- Added `createXRHapticsBridge`, renderer-neutral portable panel state and receipts, frame timing, retained final-session snapshots, and matching discover/schema/package contracts.
- Added a fullscreen control to each portable WebXR panel frame. It emits a host-owned `xr-panel-fullscreen-intent-v1` toggle intent, matching the existing `layout-node` fullscreen contract without adding viewport policy to persisted spatial pose state.

### Changed

- Three WebXR adapter chrome defaults now resolve from provider design tokens; explicit adapter color options still win.
- Portable panel state uses nested `canonical` and `current` sub-states.

### Fixed

- Aligned the HTML-in-Canvas WebGL and WebGPU adapters with the current Chromium contracts: WebGL native arity 3 with an optional fourth config argument, the four supported sized formats, grouped config members, a canonical flag-era tuple, and the WebGPU two-dictionary copy signature. Invalid signatures and configurations now fail before native upload with bounded receipts. Synchronized the experimental origin-trial metadata with the official milestone range 148-150.
- Fixed portable panel receipts, deterministic sequence/layout revisions, paired interaction frames, select-end settlement, root-relative move/resize math, unscaled chrome coordinates, nominal frame-rate validation, final snapshot ownership, and resize settlement during panel transitions.
- Fixed native visual parity for transparent CSS borders and compound surface/text nodes: zero-alpha chrome remains hit-only, compound primitives keep unique identities, and appearance checks no longer report child-icon color as a missing control fill.

## [0.3.0-alpha.68] - 2026-07-23

### Added

- Added `docs/xr-html-in-canvas.md` documenting the current-behavior contract of the experimental HTML-in-Canvas path in `symbiote-ui/xr`: the structured WebGL upload receipt, the same-canvas ownership gate, capability failure reporting, and the explicit semantic fallback expectation.

### Changed

- Prepared provider release metadata for the audited HTML-in-Canvas ownership behavior. No runtime behavior changes: the shared-canvas ownership gate, the `xr-html-canvas-upload-receipt-v1` structured upload receipt, and the 3/4-versus-6-argument `texElementImage2D` signature detection ship exactly as audited.
- `renderPanel` in webgl mode now has a documented receipt contract: every call returns a bounded receipt carrying `version` (`xr-html-canvas-upload-receipt-v1`), `panelId`, `mode`, `rendered`/`uploaded` status booleans, `canvasMatch`, optional `width`/`height`, `signature` (`current` or `flag-era`), and a machine-readable `reason` plus `errorName` on failure — never a thrown control-flow error for capability or ownership failures.
- Documented the same-canvas gate: a panel element must remain a direct child of the canvas that owns the WebGL context, otherwise the upload is skipped before the native call and the receipt reports `reason: 'canvas-mismatch'` (or `'missing-prepared-canvas'` / `'missing-context-canvas'`).
- Documented capability failure as data: missing APIs surface as `reason: 'unsupported'` or `'unsupported-signature'` receipts and diagnostics, and hosts are expected to render the declared semantic fallback (`dom-overlay` / provider material fallback) instead of treating failure as an exception.
- Documented that HTML-in-Canvas remains an experimental, flagged Chromium capability (origin trial, `CanvasDrawElement` flag, Chrome milestone range 148-150) and must never be the only rendering path.

## [0.3.0-alpha.67] - 2026-07-19

### Fixed

- The narrow `symbiote-ui/canvas/node-canvas` entrypoint now self-registers its internal `graph-node` dependency and re-exports `configureMaterialSymbols`, so composition-only hosts get fully upgraded graph nodes without importing the full UI bundle.
- A connected `node-canvas` now installs the system token cascade (`ensureSystemCascade`), so node card visuals (surface, border, radius, shadow) resolve on pages that never call `applyTheme`; the cascade stays visually inert on already-themed surfaces.

## [0.3.0-alpha.66] - 2026-07-18

### Added

- Added Node-safe sharing codec (`encodeCascadeThemeShare`, `decodeCascadeThemeShare`) and insert-only user preset store helpers (`insertCascadeThemeUserPreset`, `getCascadeThemeUserPreset`, `listCascadeThemeUserPresets`) to `symbiote-ui` root entrypoint.
- Added `<sn-theme-import-dialog>` (`CascadeThemeImportDialog`) component for browser hosts to preview, cancel, and apply shared theme tokens with zero-storage previews and rollback support.
- Added theme share actions and `share-label`/`shareLabel` properties to `cascade-theme-widget` and `cascade-theme-editor`, which dispatch a composed, bubbling `cascade-theme-share-request` event containing the detached theme state snapshot.

## [0.3.0-alpha.65] - 2026-07-18

### Fixed

- Kept compact composer parameters on the same action row at narrow widths.
- Preserved full native select hit areas and explicit accessible names when footer controls collapse to icon-only presentation.

## [0.3.0-alpha.64] - 2026-07-18

### Added

- Added `destructiveHint: true` under `annotations` on the descriptor for destructive action descriptors.
- Added a `bundle` option to `registerProductContextTools()` so products can register the exact executable descriptors already used to construct their adapter and consumer.

### Fixed

- Removed the unused legacy `createNativeToolDescriptor()` export now that
  registration uses canonical executable plain descriptors directly.
- Fixed `registerWebMcpTool` to register and return the same canonical plain executable descriptor passed by the product bundle, preserving exact descriptor identity before and after refresh.
- Fixed registration signal lifecycle using an internal `AbortController` that properly cleans up external listeners on all exits, supports idempotent unregistration, and handles undefined native disposers.
- Fixed native capability check to read active `modelContext` markers (`nativeActive` and `supportsNativeToolDescriptor`) directly, removing public options bag overrides.
- Fixed native options forwarding to pass exactly `signal` and `exposedTo` options to `registerTool`.
- Fixed product registration options resolver to correctly identify options bags containing `signal` or `exposedTo`.
- Fixed `createProductWebMcpBundle` to bind all allowed actions to their own executable plain descriptor closures, preserving action/descriptor pairing through filtering and refresh in-place, and forwarding out-of-band context arguments.
- Fixed tool validation to fail fast with tool/action identity before the first native registration, rolling back previous registrations on partial failure.
- Fixed runtime-context property publication to restore prior property state exactly and made producer refresh publication replacement atomic.

## [0.3.0-alpha.63] - 2026-07-17

- Keep cascade-theme control foregrounds above WCAG AA after browser RGB quantization.
- Updated the presenter projection contract to support idle cursor visibility, completed/motorActive states, validation priority, and completed residue coexistence.
- Preserve idle cursor visibility and endpoint position after travel is completed.
- Preserve completed stroke cursor and rest projection to keep completed ink/frame residue visible.
- Compute presenter projections first, then validate mutual exclusion conflicts on actual active motor phases (`ERR_MUTUALLY_EXCLUSIVE_LAYERS`), ensuring ordered active layer names.
- Allowed future layers and completed residue (including idle cursors) to coexist with active gestures.
- Sequence cursor travel before focus reveal and use the annotation projector as the sole drawing motor for live presenter actions.
- Publish the canonical caption presentation track v2 identifier consistently in live captions, media studio markup, and renderer diagnostics.
- Require explicit non-empty `cueId` values for live and tour captions, reject
  legacy `id`/`index` aliases, and preserve the canonical v2 identity through
  live, preview, and rendered caption consumers; update `symbiote-engine` to
  `0.3.0-alpha.13`.
- Status badges now keep a 12px minimum font size across standalone, default,
  dark, and cascade themes so compact state labels remain presentation-readable.
- Live captions now apply the canonical cue-level font size and line height
  chosen by the collision planner, so a narrowly adapted caption renders with
  the same readable typography in the browser and final ASS/MP4 output.

- Presenter focus frames now reveal from their initial drag point over the shared
  30 FPS clock and expose reveal/handle geometry to deterministic render proof.
  Handwritten markers use a slower, more legible high-opacity stroke in live and
  rendered playback. Compact ovals reserve enough perimeter for their animated
  marker nib and natural jitter without crossing protected target content.
- Added `applyPresenterTextSelection()` as a browser-only native text emphasis
  primitive for exact or whitespace-normalized quotes and explicit ranges across
  DOM text nodes, inputs, and textareas, with portable receipts, ambiguity
  failures, and deterministic clear/restore handles.
- Programmatic chat composer updates now resize and scroll the input to the
  newest text without stealing focus, while changed drafts and real typing
  refresh the workspace's existing background activity.
- Unified timed live-caption segmentation with rendered captions. Authored live
  speech now keeps exact text and word timing while using the same bounded
  five-word cue cadence, so large vertical captions remain readable instead of
  failing on a full spoken turn.
- Added synchronous `presentFocusFrame()` projection with separate cursor and
  frame modes, media-time-driven marching ants, and returned target/frame
  geometry so live capture and offline rendering share the same focus pixels.

### Added

- Added `LiveCaptionController` and `createLiveCaptionTrack` for the same
  engine-resolved caption profile and collision-aware placement contract in
  live presentations, Media Studio previews, and deterministic canvas renders;
  cue hooks now fire after DOM projection and support evidence-only capture
  without painting caption pixels. Resolved profile font weights now match ASS
  output, and cue hooks include measured line/container overflow evidence so
  clipped live text fails verification.
- Added a registry-derived provider conformance atlas covering every declared
  component event, component input, native HTML input type, and WebMCP tool
  input variant, with executable action, result, and reset receipts.

## [0.3.0-alpha.62] - 2026-07-15

### Changed

- Set the reusable Classic cascade default contrast to 100 across library
  defaults, ThemeFactory presets, static derived tokens, the theme catalog,
  documentation, and agent-facing theme references.
- Updated the default-provider category, type, and syntax HSL tokens derived
  from the Contrast 100 state.

## [0.3.0-alpha.61] - 2026-07-15

### Fixed

- Aligned `sn-media-host` teardown with the native delayed Symbiote lifecycle,
  preserving active providers across synchronous DOM reparenting while still
  releasing them after a terminal disconnect without public layout-move APIs.

## [0.3.0-alpha.60] - 2026-07-15

### Changed

- Preserved active media hosts across layout-managed reparenting, while making
  aborted moves and terminal disconnect/reconnect cycles teardown-safe.
- Resized PCB flow-diode bodies and their arrow cutouts to the final themed
  proportions while keeping SVG, Canvas, placement, and occlusion geometry aligned.
- Replaced the graph media activation glyph with an opaque themed play control
  whose triangle is a transparent mask cutout over the poster.
- Coalesced intersecting nested containment junctions within each source-port
  group while preserving independent branch semantics.
- Hid lower-priority connection markers when their projected footprint
  overlaps an unrelated focused route, without repeating collision work during
  Canvas viewport transforms.

## [0.3.0-alpha.59] - 2026-07-14

### Added

- Added deterministic PCB marker semantics for directed primary graph edges,
  with shared SVG/Canvas geometry for flow diodes, explicit gates, and derived
  containment junctions.

### Changed

- Fixed context-menu pointer handling across document realms and kept late or
  long menu content inside narrow viewports.
- Extended graph models, schemas, and provider metadata with connection kind,
  direction, and marker-role contracts.

## [0.3.0-alpha.58] - 2026-07-14

### Added
- Added mode-aware fixed aliases `--sn-chat-cell-base-alpha` and `--sn-chat-cell-alpha-span` for chat background independence.
- Added internal power-of-two level-of-detail (LOD) grid calculation for CanvasViewport.

### Changed
- Default cascade `Pattern` to 100 for library defaults and both variant reset presets.
- Fixed graph context menus to use viewport coordinates and remain inside the visible browser area.

## [0.3.0-alpha.57] - 2026-07-14

### Added

- Added the Node-safe `analyzeGraphLayout()` contract and
  `graph-layout-quality-v1` schema for deterministic node overlap,
  edge/node intersection, edge crossing, distance, viewport readability,
  parent locality, and translation-aligned stability diagnostics. The same
  read-only operation is agent-discoverable through `manifest.graphAnalysis`
  with canonical-ID and numeric-domain constraints, per-rule payload metadata,
  explicit non-zero-derived-value underflow reporting, exact coverage/budget
  accounting, and executable through `symbiote-ui layout-audit <snapshot.json>`.
- Added a Node-safe media descriptor contract (`normalizeMediaDescriptor`,
  `isMediaDescriptor`, `MEDIA_DESCRIPTOR_SCHEMA_ID`) exported from
  `symbiote-ui`/`symbiote-ui/graph`, plus `schemas/media-descriptor-v1.json` and
  a shared `media` definition in `graph-model-v1`/`graph-v1`. A node's
  `params.media` is normalized to `{ kind, poster, alt, fit, activation:
  { provider, ... }, targetIds }`; a missing `activation.provider` is rejected.
- Extended `graph-node` to render a lightweight poster plus a readable media-kind
  badge for activatable media, and to emit a bubbling, composed
  `sn-media-activate` intent (`detail: { descriptor, nodeId }`) on keyboard or
  pointer activation. The graph never mounts a player during render, pan, or zoom.
- Added a browser media provider registry (`registerMediaProvider`,
  `getMediaProvider`, `hasMediaProvider`, `listMediaProviders`,
  `unregisterMediaProvider`) with fixed provider keys and explicit
  `{ mount, unmount }` adapters, plus built-in `image` and privacy-hardened
  `youtube` adapters (`youtube-nocookie.com`, `loading=lazy`, minimal `allow`,
  sandboxed, `referrerpolicy=strict-origin-when-cross-origin`).
- Added the accessible `sn-media-host` Web Component (`symbiote-ui/ui`) that
  mounts exactly one active adapter on user activation, unmounts on descriptor
  replacement and disconnect, and degrades to poster plus external link on an
  unknown provider or adapter failure without throwing.
- Added a reusable canvas poster/badge path so `CanvasGraph` draws the same
  `node.params.media` poster (clipped to the node dot, `cover`/`contain` fit)
  and a media-kind badge, with lazy image caching and icon fallback and without
  mounting any player. New `symbiote-ui/ui` exports: `getCanvasGraphNodeMedia`,
  `CanvasGraphMediaImages`, `drawCanvasGraphNodeMedia`, `drawCanvasGraphImageFit`,
  `drawCanvasGraphMediaBadge`, and `CANVAS_MEDIA_IMAGE_STATUS`.
- Added a generic rendered-content slot seam to `code-block` and `source-viewer`.
  A safe standalone markdown directive `:::content-slot <key>` (constrained key
  charset `[A-Za-z0-9_-]`; malformed, quoted, raw-HTML, or extra-attribute
  payloads stay inert escaped text) emits a library-owned placeholder inside the
  rendered markdown body. `renderContentSlots(composer)` invokes
  `composer(hostElement, slotKey)` once for every rendered slot in document order
  and returns the composed host elements; `clearContentSlots()` drops the
  composer. Composition is binding-driven: a scoped `MutationObserver` on the
  innerHTML-bound `.cb-md` markdown root re-composes after each markdown
  replacement (surviving repeated content swaps on the same block) with no
  timer/rAF, no observer feedback loop, and no duplicate composition.
  `scrollToFragment(id, options)` still scrolls the rendered flow to an element by
  id (reduced-motion aware, no-op for a missing id). The seam carries no HTML
  strings or media/route concepts, so real article players live semantically
  between the markdown paragraphs while graph media nodes stay lightweight
  posters.
- Made `sn-media-host.activate()` readiness-safe: an activation requested before
  the provider stage/refs are ready is remembered as a single pending request and
  fulfilled from the Symbiote render lifecycle (`renderCallback`), not a timer.
  A descriptor replacement or disconnect cancels a stale pending request, so a
  rapid reselect never mounts the previous host late and exactly one current host
  activates.
- Added `lockRatio` split options to `LayoutTree.createSplit()` so hosts can
  preserve authored panel proportions while surrounding branches use responsive
  priority compression.
- Added versioned `CanvasGraph.getRenderSnapshot()` and
  `setRenderSnapshot()` contracts for atomic render continuation across
  deterministic workers, including full-precision layout, camera, focus,
  interaction, transition, pulse, group-orbit, and info-panel state.
- Added a shared elapsed-time frame clock for CanvasGraph easing and procedural
  motion, keeping animation speed stable when capture cadence changes.
- Added exact annotation path samples and a public geometry safety analyzer for
  deterministic presenter collision checks against protected targets, captions,
  controls, and cursor bounds; oval annotations now trace a compact external
  rounded perimeter, active drawing uses the marker nib's actual bounds, and
  live/offline hosts share the public annotation duration contract.
- Added public `CanvasGraph.getViewport()` and `setViewport()` camera contracts
  for clamped absolute live and deterministic viewport projection.
- Added ordered v3 interaction-cue planning through
  `createWebMcpTourTurnActionPlans`; presentation tools now consume cue bindings
  directly and preserve strict tool input schemas.
- Added exact `workspace-virtual-sequence-v1` projection, encoded playback and
  scrub proxy selection, sprite/audio/layer indexes, and affected-range lookups
  without importing the producer package.
- Added video-first Media Studio preview with `requestVideoFrameCallback`
  timeline hydration and a bounded WebCodecs precision decoder for scrub and
  frame-step windows; bitmap caching remains limited to sprites and thumbnails.
- Added synchronous, seed-driven `presentAnnotationFrame` projection to the
  presenter cursor so offline render workers can reproduce all marker and symbol
  gestures without wall-clock or prior-frame state.

### Fixed

- Media fallback links now accept only HTTP(S) and safely resolved relative
  URLs, preventing executable URL schemes from reaching browser navigation
  sinks.
- Added `scrollToTop(options)` to `code-block` and `source-viewer` so hosts can
  reset the owned article viewport during document navigation without querying
  component internals, while preserving reduced-motion and explicit scroll
  behavior.
- Media Studio preview now prefers an encoded playback proxy over cached bitmap
  frames, reports rVFC and secure WebCodecs capabilities honestly, and closes or
  cancels every decoder, frame, listener, and video-frame callback it owns.
- Narrow ChatComposer layouts now place footer and voice controls on stable
  rows without clipping or overflow, and the showcase host handles the distinct
  stream-stop event.
- Cascade theme primary action text now retains WCAG 4.5 contrast after browser
  color quantization.
- Manual viewport input now cancels competing focus-camera motion and defers
  virtualization until interaction settles, preventing repeated connection
  rebuilds during wheel and pan gestures.
- Medium graph LOD now preserves node bounds and connector anchors while hiding
  expensive visual details, avoiding ResizeObserver-driven connection refreshes.
- Focus-transition markers now share a stall-safe animation clock and use live
  connector endpoints without flattening the sampled route shape.
- `CanvasGraph.getRenderSnapshot()`/`setRenderSnapshot()` (snapshot v3) now use
  the visible graph projection for identity checks, reject unsettled layouts and
  semantically invalid animation state, stop stale layout workers on restore,
  and require an equivalent backing/CSS/DPR render surface for deterministic
  continuation.
- `registerWebMcpTool()` now forwards native registration options, including
  `AbortSignal` and origin exposure, to `document.modelContext.registerTool()`.

## [0.3.0-alpha.52] - 2026-07-10

### Added

- Added bounded, cancellation-aware Media Studio frame-sequence playback,
  caption overlays, and external-clock timeline controls for synchronized
  audio, seek, pause, and resume workflows.
- Added a Node-safe installable render clock for deterministic UI animation,
  plus decoded-byte-bounded LRU proxy-frame caching with explicit bitmap release.
- Added seekable CanvasGraph pulses through `pulseNode(..., { startTime })` and
  `clearPulses()` for deterministic offline frame projection.
- Added `CanvasGraph.setFrameDriver()` and `presentFrame()` for synchronous
  externally driven canvas presentation without a competing animation-frame loop.
- Added cascade theme variants (`modern`, `classic`) and project tab shape
  controls (`frame`, `ear`, `classic-ear`) so hosts can restore the older Agent
  Portal tab geometry without product-local CSS.
- Added an independent `tabRadius` cascade control and public active-tab color
  tokens, and removed the experimental tab-strip separator line.
- Added an independent `cellRadius` cascade control so animated `cell-bg` dot
  sizes are no longer coupled to UI corner radius.
- Added `createDialogueStage`, `playDialogueTimeline`, `buildAlternatingTimeline`,
  and `createDialoguePlayer` for multi-voice narrated tours — overlapping
  per-persona speechSynthesis, a cue-driven timeline, and a play/pause/seek
  transport controller; plus `sanitizeVoiceResponseText` now runs inside the
  dialogue stage so spoken text is markdown/symbol-free.
- Added `createPresenterCursor` and `playCursorScenario`
  (`symbiote-ui/chat/presenter-cursor.js`) — an animated arrow cursor that
  drag-selects any element with a marching-ants marquee and travels between
  checkpoints along a curved path (`moveTo`/`clear`/`dispose`, Node-safe at
  import), plus a player for agent-authored
  `{ steps: [{ target, holdMs?, gesture?, label? }] }` scenarios with a host
  `resolveTarget`, per-step `onStep`, configurable `defaultHoldMs`, and
  `AbortSignal` support; separate focus frames,
  handwritten freehand/underline/oval annotations, expanding click feedback,
  and exactly-once semantic activation on a deterministic 30 FPS projector.
- Added `actions` and `embed` custom-content message parts to `ChatMessageItem`
  and the message model: an `actions` part
  (`{ type: 'actions', actions: [{ id, label, icon, variant }] }`) renders inline
  action buttons and emits `chat-message-action` / `chat-workspace-action`
  `{ id, actionId, payload }`, while an `embed` part (`{ type: 'embed', key }`)
  renders a keyed slot so `ChatTranscript` emits `chat-transcript-embeds-ready` /
  `chat-workspace-embeds-ready` `{ embeds: [{ key, slot }] }` for hosts to mount
  and re-attach live widgets.

### Fixed

- Fixed cascade theme widget/editor slider rows staying stale or failing to
  apply range input after switching theme variants, and tuned the `classic`
  preset to sharp, no-outline chrome while keeping its lightness and chroma
  controls fully live.
- Added themed content insets for `sn-description-list` and `sn-scroll-area`,
  and centered collapsed `layout-sidebar` items so library-composed workspaces
  do not need local padding fixes.

## [0.3.0-alpha.50] - 2026-06-27

### Fixed

- Kept markdown table row hover backgrounds on the active theme background
  instead of using the dark overlay/backdrop token.

## [0.3.0-alpha.49] - 2026-06-27

### Fixed

- Aligned the canvas graph info panel background with the global canvas
  background and prevented dark fallback panels in light cascade themes.

## [0.3.0-alpha.48] - 2026-06-27

### Fixed

- Kept the full cascade theme editor controls in separate grid rows after the
  geometry register toggle was added, preventing overlap in narrow layout
  panels.

## [0.3.0-alpha.46] - 2026-06-20

### Changed

- Expanded `llms.txt` into a current agent-facing resource map aligned with
  the public README, docs, skills, schemas, and component catalog.
- Updated the `symbiote-engine` dependency to `0.3.0-alpha.12`.
- Aligned the public README and package description with the shared
  jsda-kit-style package presentation.
- Split long README reference material into focused docs for entry points,
  runtime UI construction, cascade theming, layout/spatial contracts, and
  integration boundaries.

### Fixed

- Included the CLI audit module in the published package so `symbiote-ui
  discover` works from installed npm bin shims.

## [0.3.0-alpha.44] - 2026-06-11

### Added

- Added product-neutral `VoiceController` error helpers for shared
  microphone-denied and unsupported wake-listening messages.

## [0.3.0-alpha.43] - 2026-06-11

### Added

- Added `radius` as a cascade theme parameter with WebMCP/schema coverage and
  `--sn-theme-radius-scale` token output.

### Fixed

- Kept cascade theme radius recipe overrides relative to the global radius
  scale instead of only density.
- Improved cascade theme button text selection so light recipe primary actions
  keep readable contrast.
- Updated browser smoke coverage for the current showcase video workspace route
  and valid presentation/table design-policy parameters.

## [0.3.0-alpha.23] - 2026-06-08

### Added

- Added reusable base controls and display primitives for rating, segmented
  selection, native selection controls, sliders, and tooltips.
- Expanded agent-facing component metadata, Custom Elements output, and
  discovery coverage for the broader component catalog.
- Added segmented browser smoke execution so visual/layout scenarios run as
  independent release gates.

### Changed

- Hardened reusable buttons, fields, list items, tables, menus, project tabs,
  cards, banners, metrics, empty states, and loading overlays with stronger
  state, ARIA, keyboard, and intent contracts.
- Synchronized package test execution through the suite runner and lock helper
  so browser and non-browser tests do not collide.

### Fixed

- Made browser smoke tests require Chrome for Testing, Chromium, or an explicit
  `CHROME_BIN` instead of silently launching the unsupported macOS Chrome app
  wrapper.
- Tightened CDP page readiness checks so browser tests only pass after the
  expected URL and document body are present.

## [0.3.0-alpha.22] - 2026-06-08

### Added

- Added `canvas-graph` multi-node focus via `fitNodes()`, `flyToNodes()`,
  and `focusNodes()`, including WebMCP/discovery metadata for
  `canvas_graph_focus_nodes`.
- Extended `createGraphViewModeController().focusNode()` with `flatNodeIds` so
  flat graph demos can fit several visible nodes without drilling into a parent
  group.
- Added a main-thread `ForceLayout` fallback so bundled hosts still render
  `canvas-graph` when the standalone worker file is not served.

### Fixed

- Kept flat graph selection emphasis scoped to the selected node by default so
  multi-node focus does not fan out repeated pulse waves across every fitted
  neighbor.
- Refreshed cached `canvas-graph` drawing colors on `cascade-theme-change` and
  root/component theme mutations so flat canvas nodes, edges, and backgrounds
  inherit the active cascade theme without host-local redraw hacks.

## [0.3.0-alpha.20] - 2026-06-08

### Changed

- Updated the `symbiote-engine` dependency to `0.3.0-alpha.11` so browser-safe video packs stay on the published browser runtime contract.

## [0.3.0-alpha.19] - 2026-06-08

### Changed

- Updated the `symbiote-engine` dependency to `0.3.0-alpha.10` for the browser-safe engine runtime entrypoint.

## [0.3.0-alpha.18] - 2026-06-08

### Added

- Added `node-canvas` multi-node focus via `flyToNodes()` and `focusNodes()`,
  including WebMCP/discovery metadata for `node_canvas_focus_nodes`.

## [0.3.0-alpha.17] - 2026-06-08

### Fixed

- Kept repeated `node-canvas` drag gestures continuous in flow-scroll layouts by
  updating native scroll state instead of viewport pan transform state.

## [0.3.0-alpha.16] - 2026-06-08

### Fixed

- Added cascade theme `--sn-grid-dot` and `--sn-grid-size` output so `node-canvas` background dots inherit from the provider theme and respond to the pattern control.

## [0.3.0-alpha.12] - 2026-06-06

### Added

- Added the reusable `cascade-theme-editor` browser module for layout-hosted cascade theme editing.
- Added copy parameters, reset defaults, and automatic `localStorage` persistence for cascade theme controls.
- Added `componentDescription` and agent-facing WebMCP context to component descriptors and discovery output.
- Added `createComponentToolDescriptor()` for explicit WebMCP tools with component context.
- Added the reusable browser `VoiceRuntime` package contract to packed output and `symbiote-ui/ui`.
- Added the public `symbiote-ui/canvas` entrypoint for graph, PCB routing, diagnostics, project graph, and HTML-in-canvas helpers.

### Changed

- Updated the cascade theme lab to show the editor as a layout panel instead of owning local toolbar controls.
- Hardened `VoiceRuntime` for Agent Portal host adapters with instance capability getters, callback hooks, media-recorder start, and blob-to-base64 conversion.
- Extended `withGlobalPanel()` to carry panel behavior and split behavior into generated layout trees.

## [0.3.0-alpha.11] - 2026-06-04

### Fixed

- Extended the cascade theme contract to write the public Symbiote theme aliases for the background, text, node, panel, and context-menu surfaces plus `--sn-button-bg` and `--sn-field-control-bg` (flat aliases since removed by the wave-3 rename sweep).
- Documented the alias coverage so downstream apps can apply `applyCascadeTheme()` once at the root instead of duplicating theme formulas or component-local theme setters.

## [0.3.0-alpha.10] - 2026-06-04

### Added

- Added a reusable cascade theme contract with `createCascadeTheme()` and `applyCascadeTheme()`.
- Exposed cascade theme controls and WebMCP metadata through provider discovery.

### Changed

- Updated the cascade theme lab to consume the library API instead of owning local theme formulas.

## [0.3.0-alpha.6] - 2026-06-03

### Changed

- Updated package metadata to point at the standalone `symbiote-ui` repository.
- Updated the `symbiote-engine` dependency to `0.3.0-alpha.6`.

## [0.3.0-alpha.5] - 2026-06-03

### Fixed

- Kept browser UI exports off the `symbiote-engine` barrel so browser bundlers do not pull Node-only engine modules into UI builds.

## [0.3.0-alpha.4] - 2026-06-03

### Added

- Split UI/provider ownership from the former `symbiote-node` monolith.
- Added `symbiote-ui/webmcp` for explicit WebMCP descriptors and registration helpers.
- Added `component-descriptor-v2` with SSR and WebMCP contract metadata.
- Added provider discovery through `symbiote-ui/discover` and the `symbiote-ui discover` CLI command.

### Changed

- UI/provider imports now belong under `symbiote-ui`.
- Runtime execution imports now belong under `symbiote-engine`.
- `symbiote-node` remains only as the terminal migration facade.

## [0.3.0-alpha.0] — 2026-04-18

### Fixed
- **Memory leak**: zombie `setTimeout` loops in SubgraphNode preview rendering — replaced with on-demand redraws
- **Memory leak**: event listener accumulation in `NodeCanvas.setEditor()` — added explicit unsubscribe on context switch
- **Memory leak**: incorrect `cancelAnimationFrame` cleanup for `setTimeout` IDs in `NodeViewManager.removeView()`
- **Layout overlap**: nodes measured as 4px height (DOM not ready) caused overlap — enforced minimum `nodeHeight` floor in `getSize()`
- **Inspector z-index**: panel header overlapped toolbar buttons — removed header, added toolbar-aware padding

### Added
- `Editor.removeAllListeners()` — clean teardown method for editor event system
- `computeTreeLayout()` — directory-hierarchy-aware tree layout with indent levels
- Shape primitives: `CircleShape`, `DiamondShape`, `PillShape`, `RectShape`
- PCB dark theme enhancements: improved node styling, copper trace connections

### Breaking
- `InspectorPanel` no longer renders a title header bar — consumers relying on `.insp-header` CSS should update

## [0.2.1] — 2026-04-13

- Initial open-source release
- Node graph editor with Symbiote.js web components
- Sugiyama-based auto layout (`computeAutoLayout`)
- PCB/Carbon theming system
- Inspector panel with resize handle
- Subgraph navigation (drill-down/drill-up)
- Execution engine with topological sorting
