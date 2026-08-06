# Runtime UI Construction

## Browser Registration

```js
import { defineModule, listModules } from 'symbiote-ui/ui';

defineModule('chat-composer');
defineModule('cascade-theme-editor');

console.log(listModules());
```

The root package and Node-safe entry points must import without creating DOM globals. Import safety does not mean every exported helper is useful without host data, a DOM adapter, browser hydration, or runtime-provided objects. Browser-only custom elements and module definition helpers belong behind `symbiote-ui/ui`.

## Agent UI Construction

Agents should start from the public manifest, choose a component by its
agent-facing description, then ask the host to bind data and insert the
component into an approved layout surface:

```js
import { listAgentComponentDescriptions } from 'symbiote-ui/manifest';

let catalog = listAgentComponentDescriptions();
let graphSurface = catalog.find((item) => item.tagName === 'node-canvas');
console.log(graphSurface.componentDescription);
console.log(graphSurface.webmcp.toolNames);
```

Component contracts stay reusable and product-neutral. Hosts add product
meaning through product context: identity, views, domain entities, allowed
actions, componentRef links, and live event state. WebMCP descriptors created
from product context describe host-owned product intents; they do not move
permission policy or persistence into reusable components.

```js
import { createProductContextAgentView } from 'symbiote-ui/runtime/product-context';
import { createProductContextToolDescriptors } from 'symbiote-ui/webmcp';

let productContext = {
  product: {
    id: 'automation-release-demo',
    name: 'Automation release flow',
    category: 'automation',
  },
  views: [{ id: 'kanban-board', label: 'Kanban board', route: '#automation/kanban-board' }],
  componentRefs: [{ id: 'release-board', component: 'sn-kanban-board', viewId: 'kanban-board' }],
  entities: [{ id: 'publish-pages', type: 'release-task', label: 'Publish GitHub Pages' }],
  actions: [{ id: 'select-release-card', title: 'Select release card', componentRefs: ['release-board'] }],
};

console.log(createProductContextAgentView(productContext));
console.log(createProductContextToolDescriptors(productContext));
```

Browser hosts register custom elements through the public UI entrypoint:

```js
import { defineModule } from 'symbiote-ui/ui';

defineModule('panel-layout');
defineModule('chat-sidebar-shell');
defineModule('chat-composer');
defineModule('graph-explorer-shell');
defineModule('node-canvas');
defineModule('canvas-graph');
defineModule('graph-node');
```

`NodeCanvas` is the low-level constructor surface for node/edge previews.
When a host uses it directly, it must also register `graph-node`; this keeps
the canvas reusable while node rendering stays in its own component contract.
Use `symbiote-ui/core` for the host-owned editor model and `symbiote-ui/ui` for
browser registration, not unexported package file paths.

`canvas-graph` is not the primary node/edge constructor surface. Use it when an
agent needs a read/overview graph renderer with semantic clusters, focus,
selection, and layout snapshots. Use `node-canvas` when the agent is actively
constructing editable nodes, sockets, edges, frames, or document-flow previews.
Both components keep graph data host-owned and emit intent events; hosts own
navigation, persistence, and permission policy.

```js
import { Node, NodeEditor, Output, Socket } from 'symbiote-ui/core';
import {
  createGraphViewModeController,
  defineModule,
} from 'symbiote-ui/ui';

defineModule('node-canvas');
defineModule('canvas-graph');
defineModule('graph-node');

let editor = new NodeEditor();
let socket = new Socket('flow');
let node = new Node('Generated view', { id: 'generated-view', type: 'agent' });
node.addOutput('next', new Output(socket, 'next'));
editor.addNode(node);

let canvas = document.querySelector('node-canvas');
canvas.setEditor(editor);
canvas.setPathStyle('pcb');
canvas.applyLayout({ algorithm: 'flow', nodeIds: [node.id], direction: 'vertical', scroll: true });

let graphView = createGraphViewModeController({
  shell: document.querySelector('graph-explorer-shell'),
  structuredCanvas: canvas,
  flatGraph: document.querySelector('canvas-graph'),
  structuredEditor: editor,
  flatModel: {
    nodes: [
      { id: 'group/generated', label: 'Generated', type: 'data', children: ['generated-view'] },
      { id: 'generated-view', label: 'Generated view', type: 'data' },
    ],
    edges: [],
    groups: [{ id: 'group/generated', nodeIds: ['generated-view'] }],
  },
});

graphView.setMode(new URLSearchParams(location.search).get('mode'));
graphView.focusNode({ nodeId: 'generated-view', flatNodeIds: ['generated-view'] });
```

For flat overview demos, keep the nodes that should be visible together at the
root of the `canvas-graph` model and pass `flatNodeIds` to
`focusNode()`. The older `flatNodeId` field focuses a single node and may enter
that node's parent group when the model is hierarchical. Focus changes in flat
mode queue the next active node through the graph deactivation cycle, and
`canvas-graph` renders a small route marker along the available node links so
the viewer keeps visual continuity between selections.
Hosts that replay parallel orchestration or tool activity can call
`queueTransitionMarkers(fromId, toIds, { transitionMarkerMs })` to fan out
animated route markers from one source node to multiple target nodes without
changing the host-owned graph model.
Use `fitNodes(ids, { viewportEase })` or `fitView({ viewportEase })` when a
live replay should track a changing area of interest with a slower camera path
than ordinary user-initiated focus.
Use `getViewport()` to capture the current `{ zoom, panX, panY }` camera and
`setViewport({ zoom, panX, panY, animate })` to restore or project an absolute
camera state. `setViewport()` clamps zoom through the graph's normal viewport
rules and cancels stale immediate-camera targets, so deterministic replay must
prefer it over writing graph fields directly.
During incremental model growth, `canvas-graph` seeds entering node positions
near linked visible nodes, starts them with a small effective collision size,
and restarts the force layout with low initial heat, so live process replay can
grow without a full random recomposition.
`setForceLayoutOptions({ layoutAlgorithm })` accepts `organic`, `oil-cloud`,
`crystal`, or `spring`: use `organic` for the default grouped force model,
`oil-cloud` for slower cloud-body separation, `crystal` for deterministic
topology shells around the graph center of mass, and `spring` as a plain
force-directed baseline.
`setVisualOptions({ activeNodeScale, infoPanelScale })` adjusts the selected
node target scale and active-node info panel scale; the equivalent attributes
are `active-node-scale` and `info-panel-scale`.
Use `resetLayoutState()` before replaying the same process graph from the
beginning when old node positions should not seed the next force-layout run.

`canvas-graph.enableDeviceOrientationParallax()` enables sensor-driven layer
parallax as a progressive enhancement. Call it from a user gesture; browsers
that require `DeviceOrientationEvent.requestPermission()` need that activation,
and unsupported or insecure contexts return a structured disabled result.

`canvas-graph` consumes the global cascade theme through public aliases such as
`--sn-canvas-graph-panel-bg`, `--sn-canvas-graph-panel-border`,
`--sn-canvas-graph-ghost`, and the `--sn-graph-type-*` node type aliases. Hosts
should set semantic node `type` values and let the library theme derive the
viewer colors; avoid product-local canvas color constants.

Semantic overview groups can be declared with top-level `groups`, `node.children`,
`node.parentId`, or `node.group`. `canvas-graph` normalizes those groups, passes
them into the force layout, and derives group gravity weights from group size,
link density, and cross-group links. Hosts should provide the semantic model, not
product-local physics constants.

`node-canvas.applyLayout()` is the agent-facing layout entrypoint. Use
`algorithm: 'auto'` for grouped graph auto-layout, `algorithm: 'tree'` for
structured directory/tree layouts, and `algorithm: 'flow'` for document-like
previews. Flat graph seed positions from `computeInitialGraphPositions()` are
stable by default; pass `random: Math.random` only when a non-deterministic demo
is intentional.

`panel-layout` owns reusable split and panel behavior only. Product routes,
transport, persistence, and permission checks remain host policy:

Use `LayoutTree.createSplit(..., behavior, { lockRatio: true })` when responsive
priority compression may resize surrounding branches but must preserve that
split's authored ratio. A later `LayoutTree.resizeSplit()` call updates the
authored ratio that remains locked.

For deterministic CanvasGraph continuation, call `getRenderSnapshot()` only
after the layout is settled. `setRenderSnapshot()` accepts snapshot v3 only on
an equivalent backing-store size, CSS size, and device-pixel ratio; it validates
the complete state atomically and invalidates any older layout worker. CanvasGraph
animation uses elapsed frame time, so capture cadence does not change motion
speed.

Media Studio normal playback uses an encoded `workspace-virtual-sequence-v1`
proxy. Project producer-validated data through an injected path resolver, render
the preview, then hydrate its video clock. The projection exposes scrub chunks,
sprites, audio, active layers, and affected ranges without importing the
producer package. WebCodecs is reserved for bounded precision scrub and
frame-step windows; callers supply demuxed chunks and the decoder closes all
frames it owns.

```js
import {
  createMediaStudioVirtualSequence,
  hydrateMediaStudioPreviewPanel,
} from 'symbiote-ui/ui';

let projection = createMediaStudioVirtualSequence(sequence, { resolvePath });
let hydration = hydrateMediaStudioPreviewPanel(previewRoot, {
  projection,
  timeline,
  onFrame: ({ frame, tick }) => updatePlaybackState({ frame, tick }),
});

hydration.dispose();
```

```js
layout.registerPanelType('chat', {
  title: 'Chat',
  icon: 'forum',
  component: 'chat-composer',
});
layout.openPanel('chat', {
  direction: 'horizontal',
  ratio: 0.42,
  uiInvoked: true,
  source: 'agent-constructor',
});
```

Theme updates should mutate the cascade target once and let components inherit
tokens:

```js
import { applyCascadeTheme, createCascadeTheme } from 'symbiote-ui';

let theme = createCascadeTheme({ mode: 'dark', brightness: 8, contrast: 64 });
applyCascadeTheme(document.documentElement, theme.state);
```

Use `cascade-theme-widget` for shell-level quick controls and
`cascade-theme-editor` for the full layout panel. Keep both components on the
same `storage-key` and `target-selector`; the widget emits
`cascade-theme-open-full`, and the host opens a registered `panel-layout`
panel:

```html
<section id="app-shell">
  <header>
    <cascade-theme-widget
      storage-key="my-app:cascade-theme"
      target-selector="#app-shell"
    ></cascade-theme-widget>
  </header>
  <panel-layout id="workspace-layout"></panel-layout>
</section>
```

```js
import { defineModule } from 'symbiote-ui/ui';

defineModule('cascade-theme-widget');
defineModule('cascade-theme-editor');
defineModule('panel-layout');

class AppThemePanel extends HTMLElement {
  connectedCallback() {
    if (this.ready) return;
    this.ready = true;
    this.innerHTML = `
      <cascade-theme-editor
        storage-key="my-app:cascade-theme"
        target-selector="#app-shell"
      ></cascade-theme-editor>
    `;
  }
}

customElements.define('app-theme-panel', AppThemePanel);

let layout = document.querySelector('#workspace-layout');
layout.registerPanelType('theme-editor', {
  title: 'Theme',
  icon: 'palette',
  component: 'app-theme-panel',
});

document.addEventListener('cascade-theme-open-full', () => {
  layout.openPanel('theme-editor', {
    uiInvoked: true,
    source: 'cascade-theme-widget',
  });
});
```

For chat construction, use `chat-workspace` when the host needs the complete
reusable shell: sidebar, transcript, composer, footer controls, voice-control
intents, and animated `cell-bg` lifecycle. `chat-sidebar-shell` and
`chat-composer` remain lower-level primitives for custom composition. The host
owns actual chat transport, model/provider policy, speech recognition, routes,
and storage.
Use `setLeadingControls()` for compact inline entry points before the text
input, such as a host-owned action menu. `chat-composer-leading-control`
reports those product-neutral intents back to the host with an optional
`anchorRect` for host-owned popover positioning. Use
`setFooterControls()` for structured provider/model/agent/resource/settings
controls; `chat-composer-footer-control` and
`chat-composer-footer-control-change` report product-neutral intents back to the
host. Voice controls emit cancelable primary events and granular
`chat-composer-permission-intent`, `chat-composer-recorder-intent`, and
`chat-composer-transcription-intent` stages so hosts can override microphone
permission, recorder lifecycle, and transcription providers without those
policies leaking into the component. If the host does not call
`event.preventDefault()`, the library falls back to its built-in browser-level
voice runtime (`VoiceRuntime` in `chat/voice-runtime.js`, exported via
`symbiote-ui/ui` and `symbiote-ui/chat/voice-runtime.js`, but NOT the root entry
point to remain Node-safe). `VoiceRuntime`
manages capability detection, checks/requests permissions through native browser
APIs, and captures/transcribes input using native Web Speech Recognition. If
SpeechRecognition is unsupported but recording is active, it records audio
chunks and dispatches a `chat-composer-audio-captured` event with the resulting
raw audio blob so the host can process or transcribe it. Use
`symbiote-ui/chat/voice-input-defaults.js` for shared wake/send/cancel/delete/off
phrases, command parsing, and matching when hosts need Agent Portal-compatible
voice command behavior. `VoiceController` in
`symbiote-ui/chat/voice-controller.js` coordinates browser wake listening,
pause/resume while recording or speaking, wake-command matching, and response
speech lifecycle while leaving settings, transcription providers, persistence,
and routing to the host. It also exports product-neutral wake/capture error
helpers such as `voiceWakeStartErrorMessage()` and
`voiceStartErrorMessage()` so hosts can show the same microphone-denied and
unsupported-browser messages across mic and wake-listen controls. It is also
exported through `symbiote-ui/ui` for browser hosts. `setFooterHtml()`
remains available only for trusted host-rendered footer markup.
`extractChatTitleFromAgentText()` provides a product-neutral parser for
standalone `<chat-title>...</chat-title>` responses; any prompt instruction that
asks an agent to produce that tag remains host policy.

For live agent construction, `symbiote-ui/runtime` provides the Node-safe
`runtime-ui-v1` adapter:

```js
import {
  applyRuntimeLayoutAction,
  createRuntimeUiController,
} from 'symbiote-ui/runtime';

let controller = createRuntimeUiController({
  document,
  allowedMethods: ['setData'],
  onIntent(intent) {
    hostActions.dispatch(intent.action, intent.detail);
  },
});

let panel = controller.create({
  id: 'agent-kpi-panel',
  component: 'sn-data-table',
  state: {
    methods: {
      setData: [{
        columns: [{ key: 'metric', label: 'Metric' }],
        rows: [{ metric: 'Latency' }],
      }],
    },
  },
  events: {
    'row-open': 'metrics.open',
  },
});

target.append(panel.element);
controller.update('agent-kpi-panel', {
  props: { density: 'compact' },
  attrs: { 'data-live': true },
});

applyRuntimeLayoutAction(layout, {
  type: 'open-panel',
  panelType: 'agent-kpi-panel',
  options: { uiInvoked: true, source: 'agent-constructor' },
});
```

The runtime adapter never stores layouts, chat history, theme presets, or
automation results. Hosts persist the `runtime-ui-v1` tree, constructed
component state, intent mappings, and layout snapshots in their own project
store. `destroy()` tears down listeners and removes dynamic elements when the
host closes or removes UI-invoked panels. Hosts should pass `allowedMethods` or
`allowMethod()` when applying agent-authored `state.methods`; use the component
registry or a project policy allowlist to approve method calls.

## Localization

`symbiote-ui/locale` supports English, Russian, and Spanish catalogs with an
`auto` mode that resolves browser language preferences by default. Browser hosts
can use the UI entrypoint helper once during startup and pass product-owned
messages without reimplementing locale detection:

```js
import { configureBrowserLocalization, translate } from 'symbiote-ui/ui';

configureBrowserLocalization({
  messages: {
    ru: { 'app.title': 'Проект' },
    es: { 'app.title': 'Proyecto' },
    en: { 'app.title': 'Project' },
  },
});

document.title = translate('app.title');
```

Node-safe hosts can call `configureAutoLocalization()` from `symbiote-ui/locale`
with explicit `preferences` or a supplied `navigator` object. The helper sets
`document.documentElement.lang` when a document is available.
