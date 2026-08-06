# Entry Points

- `symbiote-ui` - Node-safe core primitives, including the versioned cascade-theme share codec and insert-only user preset store.
- `symbiote-ui/core` - graph editor data primitives.
- `symbiote-ui/layout` - SSR-safe layout, behavior, and lifecycle helpers.
- `symbiote-ui/graph` - provider graph normalization, projection, and deterministic layout-quality analysis.
- `symbiote-ui/manifest` - component, schema, rule, theme, and provider catalogs.
- `symbiote-ui/runtime` - Node-safe agent UI construction helpers.
- `symbiote-ui/runtime/product-context` - Node-safe product context normalization for host-owned agent views.
- `symbiote-ui/ui` - browser Web Component registration and UI runtime, including `cascade-theme-widget`, `cascade-theme-editor`, and the hydrate-only `sn-theme-import-dialog`.
- `symbiote-ui/ui/screencast-recorder.js` - browser Screen Capture API hotkey controller for host-owned screencast recording; default toggle hotkey is `Alt+Shift+R`, captured tab/display audio is requested by default, and no built-in indicator UI is rendered.
- `symbiote-ui/webmcp` - WebMCP descriptor helpers and registration utilities.
- `symbiote-ui/xr` - WebXR provider helpers, spatial evidence contracts, native panel compilation/rendering, 3D graph layout, and multi-view coordination.
- `symbiote-ui/xr/native-panel-layout` - Node-safe native-panel plane projection, deterministic primitive compiler, absolute-size anchor reflow, and normalized hit resolver.
- `symbiote-ui/xr/three-native-panel-renderer` - browser Three adapter for compiled native panels; host injects the `THREE` namespace; previews resize shells without scaling content, honors additive resolved per-primitive styles from measured snapshots, and exposes a renderer-neutral `native-panel-appearance-v1` neutral-state sample via `getAppearanceReport()`.
- `symbiote-ui/xr/spatial-snapshot` - Node-safe `spatial-snapshot-v1` normalization and validation for browser-measured spatial UI snapshots.
- `symbiote-ui/xr/spatial-snapshot-compile` - Node-safe compiler from measured snapshots to the existing native-panel scene; geometry derives from measured boxes only.
- `symbiote-ui/xr/spatial-parity` - Node-safe deterministic parity report (geometry edges, text, resolved styles, action coverage, diagnostics) between a snapshot and its compiled scene.
- `symbiote-ui/xr/spatial-visual-parity` - Node-safe `spatial-visual-parity-v1` visual parity report between a measured snapshot and the renderer `native-panel-appearance-v1` sample (transparent controls, surface/style and text/icon colors, coverage, unknown visible boxes).
- `symbiote-ui/xr/dom-spatial-capture` - browser-only adapter-registry DOM capture of a bounded `panel-layout` subtree into a spatial snapshot; evaluation-safe to import in Node.
- `symbiote-ui/xr/spatial-contract` - versions, transform convention, metric tolerances, and placement verification limits.
- `symbiote-ui/xr/spatial-math` - column-major transforms and root-relative geometry helpers.
- `symbiote-ui/xr/spatial-projection` - metric top/front/right and reference-only axonometric projections plus stereo projection.
- `symbiote-ui/xr/spatial-evidence` - target validation, sample evaluation, and audit-envelope verification.
- `symbiote-ui/xr/spatial-stability` - consecutive-frame stability tracking and audit construction.
- `symbiote-ui/xr/pointer` - strict content hit maps, trusted panel select receipts, and pre-root placement receipts.
- `symbiote-ui/locale` - Node-safe locale catalogs and translation helpers.
- `symbiote-ui/contracts/resource-tree` - Node-safe `buildResourceTreeFromEntries` re-export from the engine contract, without the broad contracts catalog.
- `symbiote-ui/canvas/graph-explorer.js` - Node-safe graph-view helper constants and menu descriptors.
- `symbiote-ui/layout/LayoutTree` - Node-safe BSP layout tree model and behavior normalization helpers.
- `symbiote-ui/ui/locale.js` - browser localization helpers for navigator detection and configuration.
- `symbiote-ui/icons/material-symbols` - browser Material Symbols host control for ligature font loading.
- `symbiote-ui/ui/host-adapters.js` - browser host-adapter helpers for list-item and tree-panel host surfaces.
- `symbiote-ui/ui/media` - media provider registry with built-in image and YouTube adapters plus the self-registering `sn-media-host` element.
- `symbiote-ui/canvas/canvas-graph` - direct browser component entrypoint that registers `canvas-graph`.
- `symbiote-ui/layout/panel-layout` - direct browser component entrypoint that registers `panel-layout`.
- `symbiote-ui/control/segmented-control` - direct browser component entrypoint that registers `sn-segmented-control`.
- `symbiote-ui/discover` - provider discovery JSON API used by the CLI.
- `symbiote-ui/chat/voice-input-defaults.js` - Node-safe wake/send/action voice command defaults and matching helpers.
- `symbiote-ui/chat/voice-controller.js` - browser wake listening and response speech orchestration for chat hosts.
- `symbiote-ui/chat/voice-arbitration.js` - Node-safe shared speaking-channel lock so notification narration yields to chat voice and never overlaps the microphone.
- `symbiote-ui/chat/notification-phrases.js` - Node-safe localized, randomized notification phrase bank with terse/chatty depth.
- `symbiote-ui/chat/notification-narrator.js` - browser `speechSynthesis` narration primitive that speaks phrase-bank phrases through the arbitration channel.
- `symbiote-ui/chat/dialogue-stage.js` - multi-voice dialogue engine: each persona speaks through its own hidden-iframe `speechSynthesis` so voices can overlap, with `setLocale`, pause/resume, and a one-shot gesture unlock; spoken text is sanitized for TTS by default.
- `symbiote-ui/chat/dialogue-timeline.js` - `playDialogueTimeline` and `buildAlternatingTimeline`: sequence dialogue turns with per-turn cues and overlap, building round-robin alternating conversations from plain lines.
- `symbiote-ui/chat/dialogue-player.js` - `createDialoguePlayer` transport controller over a stage and timeline: `play`/`pause`/`resume`/`prev`/`next`/`seek`/`stop`, `index`/`total`/`isPlaying`/`isPaused` getters, a `done` promise, and settable `onCue`/`onIndexChange`/`onStateChange`.
- `symbiote-ui/chat/presenter-cursor.js` - `createPresenterCursor` renders a human-paced animated arrow cursor that drag-selects an edge-aware padded area around any element with a Windows marching-ants marquee and travels between checkpoints along a curved path (`moveTo`/`clear`/`dispose`, Node-safe at import); `playCursorScenario` plays an agent-authored `{ steps: [{ target, holdMs?, gesture?, label? }] }` scenario with a host `resolveTarget`, per-step `onStep`, and `AbortSignal` support.
- `ChatMessageItem` / message-model custom-content parts - messages now carry an `actions` part (`{ type: 'actions', actions: [{ id, label, icon, variant }] }`) that renders inline action buttons and emits `chat-message-action` / `chat-workspace-action` `{ id, actionId, payload }`, and an `embed` part (`{ type: 'embed', key }`) that renders a keyed slot so `ChatTranscript` can emit `chat-transcript-embeds-ready` / `chat-workspace-embeds-ready` `{ embeds: [{ key, slot }] }` for the host to mount and re-attach a live widget.
- `symbiote-ui/custom-elements.json` - Custom Elements manifest.
- `symbiote-ui/schemas/*`, `symbiote-ui/tokens/*`, `symbiote-ui/rules/*` - machine-readable provider contracts.
- `symbiote-ui/display/*` - reusable display utilities exposed by package export map.

For the complete export map and provider catalog, run:

```sh
symbiote-ui discover
```

Use `symbiote-node` only as the terminal migration facade for older consumers.
