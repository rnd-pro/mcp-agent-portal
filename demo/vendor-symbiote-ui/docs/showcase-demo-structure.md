# Showcase Demo Structure

This document is the working structure for the public `symbiote-ui` showcase
demo. It describes what the demo should communicate before implementation
details are chosen.

## Primary Goal

The demo must show the breadth of `symbiote-ui` as a runtime UI construction
library for agents. It should not look like a random component gallery. It
should show that one provider contract can compose different professional
workspaces in real time.

## Navigation Model

### Global Shell

Every page in the showcase uses the same outer shell:

1. Topbar with the library identity, active project type, theme access, and
   global actions.
2. Top tabs that switch project type and replace the active layout group.
3. Project-scoped left sidebar whose menu belongs only to the active top tab.
4. Central workspace where sidebar items render their layouts.
5. Right-side collapsed agent chat layout panel, always present on every page.

The right chat layout panel follows the studio page-agent pattern: it starts collapsed,
can open into an agent chat panel, and remains connected to the current project
type and active sidebar item. It is not a replacement for the `Chat` project
tab. The global rail is the assistant that helps with the current page; the
`Chat` tab is the full chat-oriented workspace scenario. It renders one
full-size chat layout only; the reusable right-side page-agent panel is used by
the other project-type tabs and expands to its own minimum assistant size.

### Top Tabs

Top tabs are global project types. Switching a tab switches the whole layout
group and its sidebar.

Candidate tabs:

| Tab | Purpose |
|---|---|
| Symbiote UI | General map of the library, contracts, components, themes, WebMCP, and runtime construction model |
| Chat | Agent chat as a workspace with messages, voice, markdown/code, runtime panels, and actions |
| Multi-Agent Dev | Agentic software development with project tree, source editor, docs, dependency graph, tests, reviews, and handoffs |
| Automation | Workflow and operations builder with graph, forms, approvals, logs, schedules, and engine state |
| Media Generation | Prompt-driven media workspace with parameters, variants, preview, provenance, and export |
| Video Editor | Timeline workspace with clips, preview, transcript, effects inspector, render queue, and automation |
| Data / Research | Research workspace with queries, tables, charts, citations, source panels, and generated reports |
| Node Studio | Editable node and graph workspace with sockets, routing, inspectors, simulation, and generated code |
| Spatial / XR | 3D graph and spatial panel workspace with pointer, voice, theme bridge, and 2D fallback |

### Sidebar

The sidebar belongs to the active top tab. Every project type has its own menu.
Changing the top tab changes the sidebar items.

Sidebar items are not raw components. Each item represents a user-facing
workspace view or construction scenario.

Sidebar item rules:

- The active sidebar item defines the central workspace layout.
- The same sidebar label may exist in different top tabs, but it can map to a
  different layout because the project type is different.
- Sidebar state is preserved per top tab when possible.
- Sidebar actions should be project-scoped and must not mutate other top-tab
  layouts unless the user or host explicitly triggers a global operation.

### Showcase Unit

Each sidebar item should render a complete showcase unit:

1. Live layout: working component or composed workspace.
2. Description layout: markdown explanation of the scenario.
3. Code layout: minimal usage or construction example when useful.
4. Metadata layout: component descriptor, WebMCP tools, schema, or theme tokens
   when useful.
5. Runtime/status layout: engine state, logs, events, progress, or validation
   when useful.

Not every item needs all five layouts, but every omission should be intentional.

## Workspace Layout Patterns

The showcase should reuse a small set of layout patterns instead of inventing a
different composition for every sidebar item.

| Pattern | Use when | Typical panels |
|---|---|---|
| Overview | A project type needs orientation | markdown description, component map, role matrix, live preview |
| Constructor | The user or agent builds something | source/intent, live preview, controls, status |
| Inspector | The user studies an object or component | object view, metadata, schema, related actions |
| Graph workspace | The scenario has relationships or execution flow | editable graph, overview graph, inspector, status |
| Media workspace | The scenario has assets or timeline output | asset list, preview, inspector, render/status |
| Research workspace | The scenario has evidence and generated conclusions | query, table/chart, sources, report |
| Spatial workspace | The scenario projects the same model into 3D/XR | 3D preview, selected object inspector, 2D fallback, controls |

## Tab Details

## Symbiote UI

Purpose: explain what the library is and how agents use it to construct UI.

Sidebar candidates:

- Overview
- Component roles
- Layout groups
- Cascade theme
- Manifest and WebMCP
- Runtime UI
- Symbiote Engine integration
- SSR and browser registration
- Spatial bridge
- Agent chat layout panel

Expected views:

- Library map: layout, chat, graph, source, markdown, theme, runtime, manifest,
  WebMCP, XR.
- Component role matrix: when to use `node-canvas`, `canvas-graph`,
  `source-editor`, `source-viewer`, `chat-composer`, `panel-layout`, etc.
- Theme cascade example that affects controls, chat, graph, scrollbars, and
  spatial preview consistently.
- WebMCP descriptor example that shows how an agent discovers what a component
  does.
- Right collapsed chat layout panel visible while the library map stays in the central
  workspace.

Suggested structure:

| Sidebar item | Central layout | Description/code/metadata |
|---|---|---|
| Overview | Library map plus role matrix | markdown explanation of `symbiote-ui` and related `symbiote-engine` |
| Component roles | Component matrix plus live examples | code snippets for selecting components from manifest |
| Layout groups | Top tabs/sidebar/layout group preview | layout JSON and behavior contract |
| Cascade theme | Theme editor plus affected surfaces | token metadata and inheritance notes |
| Manifest and WebMCP | Descriptor browser | WebMCP tool descriptor example |
| Runtime UI | Runtime intent preview | code example for create/update/close/remove |
| Symbiote Engine integration | Engine status adapter mock | boundary note: UI displays state, engine executes |
| SSR and browser registration | import/registration panel | SSR-safe vs browser-only entrypoints |
| Spatial bridge | 2D/3D projection preview | XR/spatial fallback contract |

## Chat

Purpose: show chat as an agent-owned workspace, not just a message list.

Sidebar candidates:

- Conversation
- Voice controls
- Markdown and code
- Runtime panels
- Tool calls
- Chat history
- Theme response

Expected views:

- Chat transcript with markdown, code, tool status, and voice controls.
- Composer with compact responsive controls.
- Sidebar mock data follows the public Agent Portal playground pattern: parent
  chat, child audit/smoke chats, user request, thinking summary, tool card, and
  agent response.
- Voice controls use `symbiote-ui/chat/voice-input-defaults.js` for shared
  wake/send/cancel/delete/off command matching. The showcase demo implements
  a functional local voice preview flow using the browser's native `VoiceRuntime`
  when capability is detected. Hosts still own product-level permission configuration,
  routing, persistence, and custom transcription adapters; if no host override is
  provided, the library falls back to its default browser-level SpeechRecognition/MediaRecorder
  capture flow, or a simulated mock flow if no microphone capability exists.
- Runtime-created panel opened from a chat action.
- Animated background controlled by cascade theme and motion state.
- The `Chat` tab renders one full-size chat workspace. The right page-scoped
  assistant layout panel is reserved for the other project-type tabs and must
  not duplicate the chat transcript inside the Chat tab.

Suggested structure:

| Sidebar item | Central layout | Description/code/metadata |
|---|---|---|
| Conversation | Transcript, composer, tool status | markdown for chat-as-workspace concept |
| Voice controls | Composer and voice control variants | voice intent events and accessibility states |
| Markdown and code | Message renderer and code block viewer | markdown/source rendering example |
| Runtime panels | Chat action opens UI-invoked panel | runtime layout action snippet |
| Tool calls | Event feed and command chips | WebMCP command metadata |
| Chat history | Chat list/sidebar shell | host ownership and persistence boundary |
| Theme response | Chat background, markdown, controls | cascade theme and motion state |

## Multi-Agent Dev

Purpose: show a real development workspace that an agent can assemble around a
project.

Sidebar candidates:

- Project overview
- File tree
- Source editor
- Markdown/docs viewer
- Dependency graph
- Tests and status
- Review and handoffs
- Runtime UI actions
- Page-scoped assistant layout panel

Expected views:

- Separate focused layouts for project tree, source editor, markdown/docs, and dependency graph.
- Dependency or file graph.
- Test/status/event feed.
- Agent handoff or review panel.
- Code sample that creates or updates a layout through runtime intents.

Suggested structure:

| Sidebar item | Central layout | Description/code/metadata |
|---|---|---|
| Project overview | Project tree, summary, graph, status | markdown on agentic development workspace |
| File tree | Tree plus selected file viewer | tree data contract and selection events |
| Source editor | Editor, preview, diagnostics | source editor registration and state example |
| Markdown/docs viewer | Markdown source plus rendered viewer | markdown formatter/source viewer example |
| Dependency graph | Canvas graph and inspector | graph metadata and host-owned navigation |
| Tests and status | Event feed, test result cards, logs | engine/test adapter state |
| Review and handoffs | Findings list and handoff notes | agent ownership and non-overlap rules |
| Runtime UI actions | Intent builder plus live panel | runtime intent schema and rollback semantics |

## Automation

Purpose: show workflows, approvals, and operational automation.

Sidebar candidates:

- Workflow graph
- Form controls
- Approvals
- Schedule
- Execution logs
- Engine state
- Recovery actions
- Page-scoped assistant layout panel

Expected views:

- Node/workflow graph with editable steps.
- Parameter form and approval controls.
- Event feed/log viewer.
- `symbiote-engine` execution status represented through UI adapters.

Suggested structure:

| Sidebar item | Central layout | Description/code/metadata |
|---|---|---|
| Workflow graph | Editable workflow graph plus inspector | graph/node construction code |
| Form controls | Parameter form plus validation state | component metadata for forms |
| Approvals | Approval gates and audit log | irreversible action policy |
| Schedule | Calendar/list and next runs | schedule state adapter |
| Execution logs | Log/event feed plus status | engine event stream adapter |
| Engine state | Runtime state cards and progress | `symbiote-engine` boundary |
| Recovery actions | Error state plus retry/rollback controls | recovery intent contract |

## Media Generation

Purpose: show prompt-driven media construction and result comparison.

Sidebar candidates:

- Prompt builder
- Model parameters
- Variants
- Preview
- Provenance
- Export
- Page-scoped assistant layout panel

Expected views:

- Prompt/source panel.
- Parameter controls using cascade theme.
- Variant gallery or comparison grid.
- Metadata/provenance viewer.

Suggested structure:

| Sidebar item | Central layout | Description/code/metadata |
|---|---|---|
| Prompt builder | Prompt editor plus generated intent | prompt/source editing pattern |
| Model parameters | Controls, sliders, presets | tokenized controls and validation |
| Variants | Gallery/comparison grid | data ownership and selection events |
| Preview | Rendered media preview | preview metadata and safe loading |
| Provenance | Metadata/source history viewer | provenance schema |
| Export | Export settings and status | host-owned export policy |

## Video Editor

Purpose: show timeline-style editing and media automation.

Related project: `symbiote-video`. The final implementation should reuse the
layout structure from that project, update it to the new `symbiote-ui` layout
contract, and move server/runtime execution concerns to `symbiote-engine`. This
is intentionally last in the implementation order because it depends on the
general showcase shell, layout groups, right chat layout panel, engine boundary, and
media workspace patterns being stable first.

Sidebar candidates:

- Timeline
- Clip bin
- Preview monitor
- Transcript
- Effects inspector
- Render queue
- Automation graph
- Page-scoped assistant layout panel

Expected views:

- Timeline layout with clips and markers.
- Preview surface.
- Transcript/caption editor.
- Effects inspector and render queue status.
- `symbiote-video` layout structure migrated to the reusable layout group model
  only after the base showcase is validated.

Suggested structure:

| Sidebar item | Central layout | Description/code/metadata |
|---|---|---|
| Timeline | Timeline, tracks, markers, playhead | migrated `symbiote-video` layout contract |
| Clip bin | Asset list plus selected clip inspector | asset metadata and selection events |
| Preview monitor | Preview, transport controls, status | media preview safe-loading contract |
| Transcript | Transcript/caption editor plus preview | text/media synchronization |
| Effects inspector | Effects stack and parameter controls | effect parameter schema |
| Render queue | Queue, progress, logs | `symbiote-engine` render execution state |
| Automation graph | Workflow graph for editing automation | graph automation pattern |

## Data / Research

Purpose: show analysis, evidence, and reporting.

Sidebar candidates:

- Query
- Table
- Chart
- Sources
- Citations
- Report
- Graph
- Page-scoped assistant layout panel

Expected views:

- Query or prompt panel.
- Data table and chart.
- Source/citation viewer.
- Markdown report viewer.
- Evidence graph.

Suggested structure:

| Sidebar item | Central layout | Description/code/metadata |
|---|---|---|
| Query | Query/prompt panel plus status | query state and host adapter |
| Table | Data table and filters | table component metadata |
| Chart | Chart/visual preview and controls | visualization role contract |
| Sources | Source viewer and evidence list | citation/source ownership |
| Citations | Citation inspector and markdown references | citation schema |
| Report | Markdown report editor/viewer | generated report construction loop |
| Graph | Evidence graph and relation inspector | graph overview role |

## Node Studio

Purpose: show graph and node construction as a first-class agent workspace.

Sidebar candidates:

- Editable canvas
- PCB routing
- Node variants
- Inspector
- Simulation
- Generated code
- Overview graph
- Page-scoped assistant layout panel

Expected views:

- `node-canvas` with editable nodes, sockets, and routed edges.
- `canvas-graph` as read/overview graph renderer.
- Node inspector and generated code.
- Routing/performance status.

Suggested structure:

| Sidebar item | Central layout | Description/code/metadata |
|---|---|---|
| Editable canvas | `node-canvas`, inspector, controls | node editor model code |
| PCB routing | Routed edges and diagnostics | routing mode metadata |
| Node variants | Shape/node gallery and inspector | component role descriptions |
| Inspector | Selected node details and schema | host-owned selected object state |
| Simulation | Flow state, animation, metrics | runtime/simulation status |
| Generated code | Source editor/viewer | code generation example |
| Overview graph | `canvas-graph` overview | read-only graph renderer role |

## Spatial / XR

Purpose: show that the same workspace model can project into spatial
interfaces.

Sidebar candidates:

- 3D graph
- Spatial panels
- Pointer and drag
- Voice controls
- Theme bridge
- 2D fallback
- Page-scoped assistant layout panel

Expected views:

- Spherical or force-directed 3D graph preview.
- Panel projection model.
- Pointer/drag state.
- Theme values translated into spatial material state.

Suggested structure:

| Sidebar item | Central layout | Description/code/metadata |
|---|---|---|
| 3D graph | Spherical/force graph preview | spatial graph model |
| Spatial panels | Panel projection preview | layout projection metadata |
| Pointer and drag | Drag state and selected object inspector | pointer/ray contract |
| Voice controls | Voice controls plus spatial target state | voice command mapping |
| Theme bridge | 2D theme controls and 3D material preview | theme-to-material mapping |
| 2D fallback | Same model in normal layout | responsive/spatial continuity |

## Demo Completion Matrix

This matrix describes the expected coverage for a complete public showcase.

| Tab | Own sidebar | Live layout | Markdown explanation | Code example | Metadata/WebMCP | Engine/runtime state | Right chat layout panel |
|---|---:|---:|---:|---:|---:|---:|---:|
| Symbiote UI | yes | yes | yes | yes | yes | partial | yes |
| Chat | yes | yes | yes | yes | yes | yes | yes |
| Multi-Agent Dev | yes | yes | yes | yes | yes | yes | yes |
| Automation | yes | yes | yes | yes | yes | yes | yes |
| Media Generation | yes | yes | yes | yes | partial | partial | yes |
| Video Editor | yes | yes | yes | yes | partial | yes | yes |
| Data / Research | yes | yes | yes | yes | partial | partial | yes |
| Node Studio | yes | yes | yes | yes | yes | yes | yes |
| Spatial / XR | yes | yes | yes | yes | yes | partial | yes |

## Implementation Order

1. Establish the global shell: top tabs, per-tab sidebar, central workspace, and
   right collapsed chat layout panel.
2. Build the `Symbiote UI` tab as the map of library roles and contracts.
3. Build reusable showcase unit patterns: overview, constructor, inspector,
   graph workspace, media workspace, research workspace, spatial workspace.
4. Fill `Chat`, `Multi-Agent Dev`, `Automation`, and `Node Studio` because they
   exercise the core library primitives most directly.
5. Fill `Media Generation`, `Data / Research`, and `Spatial / XR`.
6. Migrate `symbiote-video` layout structure into the `Video Editor` tab and
   update runtime/server concerns to `symbiote-engine`.
7. Add browser smoke tests for navigation, sidebar switching, right chat layout panel,
   theme cascade, responsive behavior, and representative views.

## Shared Rules

- Top tabs switch project type and global layout group.
- Sidebar items are scoped to the active project type.
- Every page has a right collapsed agent chat layout panel.
- Every visible view should answer what the agent is constructing and why.
- Prefer composed workflows over isolated single-component samples.
- Use `symbiote-ui` components through public exports and metadata.
- Represent `symbiote-engine` state through adapters or runtime intents, not by
  importing engine internals into reusable UI.
- Keep theme, typography, density, motion, and scrollbars inherited from the
  cascade owner.
- Include markdown and code only when they clarify the construction scenario.
- Keep demo data generic and public; do not include private project names,
  local paths, credentials, or agent logs.

## Open Questions

- Which tabs are mandatory for the first public version?
- Should Node Studio be a standalone tab or part of Automation / Multi-Agent Dev?
- Should Data / Research and Media Generation be separate first-version tabs?
- Which sidebar items need live runtime status from `symbiote-engine`?
- Which views should show WebMCP descriptors directly?
- Which views should be browser-smoke tested first?
- Which `symbiote-video` layouts are stable enough to migrate as the video
  editor reference?
