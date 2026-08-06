# Agent UI Construction Principles

`symbiote-ui` is a provider UI library for agents that construct professional
interfaces at runtime. The agent is not limited to returning text or opening a
static page: it can choose components, bind data, compose layouts, update the
workspace, and keep the browser session alive while the task evolves.

These principles describe the UX contract that hosts, agents, and component
metadata should follow when building dynamic workspaces with `symbiote-ui`.

## Related Runtime Project

`symbiote-engine` is the related execution project for workflows, runtime
commands, handlers, persistence, and server-side orchestration. `symbiote-ui`
owns browser-facing components, layouts, themes, manifests, WebMCP metadata,
and agent-visible UI contracts; `symbiote-engine` owns the work that runs behind
those surfaces.

When a scenario needs execution state, logs, task progress, workflow results, or
runtime commands, the UI should represent engine state without importing engine
internals into reusable browser components. Hosts connect the two layers through
approved adapters, WebMCP tools, events, or runtime intent contracts.

## Intended Construction Scenarios

Agents can use the same component and layout contracts across different product
domains. The exact host policy changes, but the UI construction model stays the
same.

| Scenario | Typical workspace | Required UI roles |
|---|---|---|
| Automation and workflow operations | Runbooks, task queues, approvals, schedules, logs, metrics, generated controls | command surface, status, event feed, form controls, confirmation gates |
| Agentic software development | Project tree, source editor, markdown/docs viewer, graph view, tests, review notes, runtime status | file navigation, code editing, preview, dependency graph, chat, diagnostics |
| Media generation | Prompt controls, model settings, asset browser, variant comparison, approval history, output preview | prompt editor, parameter controls, gallery, inspector, provenance, export |
| Video editing | Timeline, clip bin, preview monitor, captions/transcript, effects inspector, render queue | timeline, preview, asset list, transcript editor, inspector, progress monitor |
| Data analysis and research | Tables, charts, notebook-like outputs, citations, filters, query history, evidence panels | data grid, visualization, source viewer, filter controls, markdown summary |
| Knowledge and document authoring | Outline, markdown/source editor, rendered viewer, references, comments, export state | outline/tree, editor, viewer, comments, citation/source panels |
| Graph and node automation design | Editable node canvas, connection routing, simulation state, node inspector, generated code | node canvas, sockets, edge routing, inspector, runtime preview |
| Operations and observability | Service map, alerts, traces, logs, incident actions, remediation state | graph map, timeline, log viewer, alert list, action gates |
| Spatial and XR workspaces | 3D graph, floating panels, pointer/voice control, 2D fallback, selected object inspector | spatial graph, panel projection, voice controls, focus/selection, fallback layout |
| Education and simulation | Scenario graph, live explanation, controls, generated exercises, progress feedback | guided layout, graph state, markdown lesson, controls, progress indicators |

## UX Principles

### 1. Model the task before choosing widgets

An agent must start from the user's task model, not from a component catalog.
The first decision is the workspace structure: which surfaces are needed, which
data each surface owns, and which actions are safe to expose. Components are
chosen only after the workspace roles are clear.

### 2. Use professional tool UX by default

`symbiote-ui` is optimized for studio, IDE, automation, and operations tools.
Default layouts should be dense, scannable, and stable. Avoid marketing-style
hero sections, decorative card stacks, and large empty areas when the user is
working inside a tool.

### 3. Compose work modes, not pages

Layout groups represent work modes: build, inspect, chat, preview, automate,
review, spatial. Tabs and side navigation switch those groups while preserving
the user's context. A layout group should explain what the user can do next, not
only which component is visible.

### 4. Keep host ownership explicit

Components render data and emit intents. Hosts own persistence, permissions,
routes, transport, secrets, project state, and irreversible operations. Agent
metadata must describe component capability without implying that a reusable
component owns product policy.

Product context is the host-owned layer that turns reusable component contracts
into an agent-readable product. It names the product, views, domain entities,
allowed actions, componentRef links, and live event state. `symbiote-ui`
normalizes that context and can create WebMCP descriptors from it, while the
host remains the owner of execution, permissions, persistence, and product
semantics. A reusable component such as `sn-kanban-board` can expose selection
and move intents; a host product decides whether those intents mean release
planning, editorial workflow, support triage, or another domain.

### 5. Separate source, preview, graph, controls, and status

A generated workspace should make the construction loop visible:

1. Source or intent: code, prompt, markdown, JSON, schema, or command.
2. Preview: rendered result, media, markdown, data table, or UI component.
3. Graph: dependency, workflow, node, file, service, or spatial relation.
4. Controls: parameters, actions, voice, filters, and permission gates.
5. Status: runtime state, logs, events, progress, errors, and recovery actions.

Not every scenario needs all five surfaces, but missing roles should be an
intentional host decision rather than accidental UI omission.

### 6. Make the construction loop inspectable

Agents should expose how the UI was produced: selected component descriptor,
input schema, bound data, generated source when available, WebMCP action names,
and runtime state. This is especially important when a chat agent constructs a
panel around itself while the conversation continues.

### 7. Use cascade theme once, then inherit

Theme, typography, density, outlines, motion, scrollbars, node styles, chat
surfaces, and spatial panels should inherit from the highest stable owner.
Component-local theme application is only for isolated previews, embedded
experiments, or explicit subtree overrides.

Agents change design through a protocol patch, not by writing component-local
CSS. Use `theme.recipe` for direction, `theme.params` for bounded controls,
`theme.relations` for derived formula modifiers, and sparse `theme.overrides`
only when a concrete public `--sn-*` token is the right escape hatch. Validate
the patch with design policy rules before applying it; blocked patches return
diagnostics and suggested fixes instead of silently clamping values.

### 8. Prefer Light DOM and shared provider components

Use Symbiote Light DOM, `rootStyles`, slots, context, provider tokens, and
component composition as the default. Use Shadow DOM only for real isolation:
third-party CSS containment, hostile or unknown markup, embedded previews, or
browser API encapsulation.

### 9. Keep dynamic UI reversible and auditable

Agent-created panels and components need clear lifecycle semantics. Temporary
UI can be closed or removed; host-owned panels should not be destructively
removed unless the host marks them removable. Runtime operations should support
dry-run, validation, rollback where possible, and explicit permission gates for
irreversible actions.
Hidden layout groups must suspend active work without destroying state. Use
`suspendLayoutSubtree()` and `resumeLayoutSubtree()` from `symbiote-ui/layout`
when switching workspace groups; components or host adapters that own animation,
voice capture, TTS, timers, subscriptions, or network streams should expose
`suspendLayout()` and `resumeLayout()` methods for that traversal.

### 10. Design for 2D, responsive, and spatial continuity

The same task model should survive across desktop panels, narrow/mobile
layouts, and spatial/XR projections. Layout behavior must describe minimum
sizes, collapse priority, scroll policy, and mobile stack or drawer projection
so agents can adapt the workspace instead of guessing. Use drawer projection
when a central work surface should remain primary while start/end panels slide
over it through gestures without rebuilding the layout tree.

## Agent Construction Flow

1. Read the host task and constraints.
2. Discover component and WebMCP metadata from `symbiote-ui/manifest` or
   `symbiote-ui discover`.
3. Choose workspace roles before choosing individual components.
4. Compose a layout group with explicit panel behavior and host-owned data.
5. Bind component state through descriptors, schemas, or approved host adapters.
6. Emit reversible runtime intents for create, update, close, remove, and action
   execution.
7. Keep source, preview, graph, controls, and status inspectable when the task
   benefits from them.
8. Propose and validate theme/design patches before applying or persisting
   them.
9. Apply cascade theme at the workspace owner and let components inherit.
10. Persist portable theme params, relations, overrides, and subtree scopes in
   host/workspace config rather than product-local CSS.
11. Verify responsive, keyboard, voice, and spatial fallbacks when those modes
   are part of the host.

## Data Display Selection Guidelines

When presenting datasets, agents must choose the appropriate display surface based on the nature of the data:

1. **List (`sn-list-item`, `sn-listbox`)**:
   - Best for: Homogeneous flat lists, sequential options, simple navigations, or small item counts.
   - When to avoid: Multi-dimensional tabular data, hierarchies, or datasets requiring complex sorting/filtering across columns.

2. **Table (`sn-data-table`)**:
   - Best for: Multi-column structured data, pipelines, metrics comparisons, where sorting by columns, multi-row selection, or expandable detail views are required.
   - When to avoid: Deeply nested hierarchy trees, single-column flat lists, or long key-value detail lists.

3. **Tree (`tree-view`, `tree-panel`)**:
   - Best for: Hierarchical relationships, folder/file systems, nested organizations, and parent-child navigation.
   - When to avoid: Chronological linear events or wide tabular data with multiple independent properties per node.

4. **Timeline (`sn-timeline`)**:
   - Best for: Chronological event logs, run history, audit trails, and versioning sequences.
   - When to avoid: Key-value definitions or non-temporal hierarchical groupings.

5. **Description List (`sn-description-list`)**:
   - Best for: Key-value details of a single object (e.g., metadata inspector, package info, single item detail summary).
   - When to avoid: Multi-row datasets or collections of multiple similar entities.

## Component Metadata Requirements

Agent-facing component descriptions should answer these questions:

- What workspace role does this component serve?
- Which data is host-owned, component-owned, or transient?
- Which actions are emitted as intents instead of performed directly?
- Which SSR, hydration, WebMCP, voice, keyboard, and spatial constraints apply?
- Which layout behavior is appropriate when space is limited?
- Which component should be used instead when the task asks for a related but
  different role?

This keeps agents from assembling visually plausible but semantically wrong
workspaces.

## Voice Layer and Runtime Boundaries

`symbiote-ui` includes a reusable browser-level voice runtime (`VoiceRuntime` in `chat/voice-runtime.js`, exported exclusively via `ui/index.js` to ensure the root package remains Node-safe) to provide built-in speech recognition and audio capture. Product-specific routing, auth, persistence, and irreversible permissions remain owned by the host app.

Composer action entry points use `setLeadingControls()` for compact controls
before the text input. The composer emits `chat-composer-leading-control` and
`chat-workspace` forwards it as `chat-workspace-leading-intent`; hosts decide
which menu, goal, attachment, or plugin action that intent opens. The event can
include `anchorRect` so hosts can position their own popovers beside the
originating control without querying composer internals.

The voice capability boundary operates through a cascade of cancelable intent events, allowing hosts to intercept intents or let the library fall back to native browser capabilities:

### 1. Capability Detection
Hosts and components inspect `VoiceRuntime.isAvailable` to check for browser audio capability, and `VoiceRuntime.hasSpeechRecognition` to determine if native Web Speech API recognition is supported.

### 2. Permissions (`chat-composer-permission-intent`)
When voice capture starts, the composer dispatches a cancelable `chat-composer-permission-intent` event.
- If a host handles this event and calls `event.preventDefault()`, the host owns the permission check and notification flow.
- If not prevented, the library queries browser permissions (`navigator.permissions.query`) and requests audio stream access (`navigator.mediaDevices.getUserMedia`) directly.

### 3. Audio Recording and Speech Recognition (`chat-composer-recorder-intent`)
The composer dispatches a cancelable `chat-composer-recorder-intent` event during start, stop, and cancel transitions.
- If prevented, the host owns the recording lifecycle, transcription, and stream management.
- If not prevented, the library falls back to browser-level capture. If native speech recognition is available, transcription updates are emitted in real-time. If only raw media capture is supported, the library records audio chunks and dispatches a `chat-composer-audio-captured` event with the resulting raw audio blob so the host can process or transcribe it.

### 4. Transcription Preview and Send (`chat-composer-transcription-intent`)
The composer dispatches a cancelable `chat-composer-transcription-intent` event when the user approves, cancels, or sends the current voice result.
- If prevented, the host manages the transcription preview actions.
- If not prevented, the library falls back to standard behavior (e.g. appending text to composer input, clearing preview states, or triggering standard message submit events).
