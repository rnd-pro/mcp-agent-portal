[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)

# mcp-agent-portal

**Unified MCP gateway + AI agent runtime.** A single MCP server exposes Agent Portal orchestration tools and selected public child MCP tools. Internal execution servers such as `agent-pool-mcp` stay behind Agent Portal instead of appearing as external MCP tools. Runs a web dashboard in parallel for visual management, agent chat, and live monitoring.

```
┌─────────────────────────────────┐
│  IDE Agent                      │  ← Claude, GPT, Antigravity, etc.
│  (Antigravity / Cursor / ...)   │
└────────────┬────────────────────┘
             │ MCP (stdio)
┌────────────▼────────────────────┐
│  mcp-agent-portal               │  ← This server
│  (MCP aggregator + web UI)      │
└──┬────────┬────────┬────────────┘
   │        │        │
   ▼        ▼        ▼
 project  agent    context        ← Child MCP servers
 -graph   -pool    -x-mcp           (stdio, auto-spawned)
```

> [!TIP]
> Add one entry to your MCP config and use Agent Portal as the orchestration gateway. Public child tools are discoverable through the gateway; Agent Pool is reserved for Agent Portal's own chat/task execution path.

## Singleton Architecture

Agent Portal runs as a **detached singleton backend** shared by all IDE instances. This is the fundamental design principle — one backend, many thin proxies.

```
IDE Window 1 ──stdio→ index.js ──WebSocket──┐
IDE Window 2 ──stdio→ index.js ──WebSocket──┼──→ Singleton Backend (detached)
IDE Window 3 ──stdio→ index.js ──WebSocket──┘    port: random, pid in port file
                                                  │
           Web Dashboard ◀──HTTP/WS──────────────┘
             http://portal.local/                  │
                                              ┌────┴─────┐
                                              ▼          ▼
                                          project-    agent-
                                          graph       pool
```

### Lifecycle

1. **First IDE window**: `index.js` runs `ensureBackend()` → no port file found → spawns detached `backend.js` → waits for port file → connects thin stdio↔WS proxy.
2. **Subsequent IDE windows**: `ensureBackend()` finds port file in `~/.local-gateway/backends/` → validates PID is alive AND port accepts TCP → connects proxy.
3. **Backend restart**: Only triggered by explicit `--force` flag or npm version mismatch. **Source file changes never trigger restart** — this is critical for multi-instance stability.
4. **Zero-Zombie**: The backend outlives IDE windows. On SIGTERM/SIGINT, it removes its port file and stops all child processes.

### Restart Safety Rules

> [!IMPORTANT]
> The `ensureBackend()` function follows strict safety rules to prevent cascade failures:
> - **Never kills a running backend due to source file changes** — other IDE instances depend on it.
> - **TCP health check** before returning a port — prevents connecting to a dead/initializing backend.
> - **PID liveness check** via `process.kill(pid, 0)` — cleans up stale port files from crashed backends.
> - Version `0.0.0` (dev mode) is never treated as a mismatch — prevents restart loops during development.

### Port File Protocol

Each backend writes a JSON port file to `~/.local-gateway/backends/portal-<hash>.json`:

```json
{
  "port": 63288,
  "pid": 87544,
  "project": "/path/to/workspace",
  "name": "mcp-agent-portal",
  "version": "1.0.0",
  "startedAt": 1777723454556
}
```

The hash is derived from `md5(absoluteProjectPath).slice(0, 8)`. Multiple workspaces can have independent backends.

### Workspace Registration

When an IDE connects, the MCP `initialize` message carries `params.roots` — the workspace directories the IDE has open. The portal extracts these roots and automatically:

1. Creates a project entry in `~/.agent-portal/agent-portal.json` (deduplication by path)
2. Adds it to the active project tabs
3. Broadcasts `projects.opened` to the web UI for real-time tab creation

This means each IDE window registers its **own workspace**, not the portal's install directory.

## Dual Mode

Agent Portal provides two interfaces to the same singleton backend:

| Mode | Transport | What you see |
|------|-----------|-------------|
| **IDE** | stdio (JSON-RPC over stdin/stdout) | Agent Portal tools plus selected public child MCP tools |
| **Web** | HTTP + WebSocket | Dashboard, Marketplace, AI Chat, live monitoring |

### IDE Mode (stdin/stdout)

When `process.stdin.isTTY === false` (launched by IDE):

1. `console.log` is redirected to `stderr` (stdout is reserved for JSON-RPC)
2. `ensureBackend()` finds or spawns the singleton backend
3. `startStdioProxy(port)` creates a raw TCP→WebSocket bridge to `/mcp-ws`
4. IDE JSON-RPC flows: `stdin → maskAndFrame → WS → backend → WS frame → stdout`

### Terminal Mode (attached)

When `process.stdin.isTTY === true` (run from terminal):

- Backend runs directly (attached, not detached)
- Supports `--master` and `--connect` flags for distributed mode
- Web UI starts on the same process

## MCP Smart Gateway

The portal does **not** expose all child tools directly. Instead, it presents a **Smart Gateway** with meta-tools:

| Meta-Tool | Description |
|-----------|-------------|
| `discover_tools` | Search public child tools by keyword, tag, or server name |
| `call_tool` | Proxy a call to a public child tool by name |
| `get_portal_status` | Health, server list, tool counts, available tags |
| `create_chat` | Create an Agent Chat session in the web UI |
| `send_chat_message` | Send a message to an existing chat session |
| `resume_chat` | Continue a chat and start a portal-managed orchestration run |
| `list_chats`, `get_chat`, `get_chat_messages` | Inspect portal-owned chat state |
| `update_chat`, `delete_chat`, `set_chat_session` | Manage chat routing and session metadata |
| `cancel_chat_task`, `finish_chat_task` | Control a chat's active task through Agent Portal |
| `create_goal`, `list_goals`, `select_goal`, `complete_goal`, ... | Manage orchestrator goal lifecycle |
| `get_orchestrator_status` | Orchestrator state, public MCP surface, and internal runtime health |
| `remember` | Save key-value pair to persistent memory |
| `recall` | Query persistent memory by key substring |

When an IDE sends `tools/list`, it receives Agent Portal meta-tools with dynamic hints about available public child tools. The `call_tool` meta-tool routes only to public child servers using `ToolIndex`; `agent-pool-mcp` is filtered at the server boundary and is not indexed for external MCP discovery or calls. Agent Portal still owns orchestration controls for chats, goals, active tasks, and status through portal-named tools.

`get_portal_status` reports public servers separately from internal runtime health. Internal execution servers are never presented as public MCP servers or public child tool owners.

### MCP Aggregation Flow

```
IDE → tools/call { name: "call_tool", arguments: { name: "get_skeleton", arguments: {...} } }
  → MCPMultiplexer → ToolIndex.get("get_skeleton") → "project-graph"
  → proxyManager.sendToChild("project-graph", { method: "tools/call", params: { name: "get_skeleton", ... } })
  → child stdout → handleChildMessage → rewrite ID → sendToIde → stdout → IDE
```

## Heterogeneous Agent Pool

Multiple CLI agents run **in parallel** via the `agent-pool-mcp` package. The pool is heterogeneous: different providers handle different tasks simultaneously.

```
┌───────────────────────────────────────────────────────┐
│                AGENT POOL (parallel)                  │
│                                                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌────────┐ │
│  │ Antigrav │ │ Antigrav │ │ Claude#1 │ │OpenCode │ │ Codex  │ │
│  │ codegen  │ │ refactor │ │ review   │ │ research│ │ agent  │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬────┘ └───┬────┘ │
│       └──────┬─────┴──────┬─────┴──────┬──────┬──────┘ │
│              ▼            ▼            ▼             │
│  ┌─────────────────────────────────────────────────┐ │
│  │  MCP Tool Router — shared across all agents     │ │
│  │  local tools + proxied tools + remote tools     │ │
│  └─────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

### Dual Execution Architecture

> [!NOTE]
> The portal features two execution paths for CLI agents:
> 1. **Direct Adapters (`src/node/adapters/`)**: Native adapters for Antigravity, Claude, and Codex that run directly within the portal process. Fallback execution path.
> 2. **Pool Orchestrator (`agent-pool-mcp`)**: Primary execution path. All providers (Antigravity, Claude, Codex, OpenCode, OpenRouter) are natively implemented inside the `agent-pool-mcp` server. The `AgentChat` UI delegates via `adapter: "pool"`.

## Three Operating Modes

```
node index.js                  # standalone (default)
node index.js --connect wss:// # client — joins a master node
node index.js --master         # master — orchestrates client nodes
```

| Mode | What it does | Status |
|------|-------------|--------|
| **Standalone** | Spawns local child MCP servers, serves web UI, provides stdio MCP to IDE | ✅ Production |
| **Client** | Connects to a master via WebSocket, registers its local tools | ✅ Implemented |
| **Master** | Aggregates tools from local children AND remote client nodes | ✅ Implemented |

```
IDE ──stdio──→ Portal (master)
                ├── local: project-graph, agent-pool
                ├──WSS──→ Client A (machine-1): browser-x, crypto
                └──WSS──→ Client B (cloud-vm): terminal-x, browser-x
```

## Web Dashboard

Built-in SPA with extensible section registry (`RouterRegistry` + `LayoutTree` from the public `symbiote-ui/ui` provider entrypoint):

| Section | Hash | Panel Components |
|---------|------|-----------------|
| Dashboard | `#dashboard` | project-list with global agent-chat |
| Agent Chat | `#agent-chat` | Full-screen agent chat with adapter/model selection |
| Action Board | `#action-board` | action-board with global agent-chat |
| Marketplace | `#marketplace` | MCP server management — install, remove, status |
| Topology | `#topology` | Network visualization of connected nodes |
| Tool Explorer | `#tool-explorer` | Per-server tool schema browser |
| Active Tasks | `#orchestration` | Running agent task monitor |
| Workflows | `#workflows` | Workflow discovery and execution |
| Pipelines | `#pipelines` | Multi-step pipeline orchestration |
| Resource Groups | `#resource-groups` | Agent group management |
| Skills | `#skills` | `.agent-portal` tree, open library, editor, metadata |
| Peer Review | `#peer-review` | Agent peer review interface |
| Explorer | `#explorer` | file-tree, active-context, code-viewer, ctx-panel |
| Graph | `#graph` | file-tree, dependency graph, graph flows |
| Follow | `#follow` | file-tree, graph, code-viewer, monitor |
| Analysis | `#analysis` | health-panel (code quality dashboard) |
| Monitor | `#monitor` | Live operations/event monitor |
| Runtime | `#runtime` | Runtime control and status |
| Settings | `#settings` | Portal configuration, Telegram token, model management |

Additional panels registered but composed within sections:
- `ActiveContext` — live context tracking data
- `GraphFlows` — workflow and media-flow views for graph-backed project data
- `RuntimeControl` — local runtime controls and health
- `SkillManager` / `SkillMetadata` — skill editing and metadata views
- `ChatList` — chat session management

New sections are registered via `registerSection()`. MCP servers can inject their own UI panels at runtime via `registerPanelType()`.

### UI Provider Boundary

Agent Portal is a product adapter over `symbiote-ui` and `symbiote-engine` provider contracts. Reusable graph, layout, theme, display, chat, list, tree, and browser UI primitives are consumed through public `symbiote-ui` package exports such as `symbiote-ui/ui`, `symbiote-ui/layout`, `symbiote-ui/graph`, `symbiote-ui/manifest`, `symbiote-ui/tokens/*`, `symbiote-ui/rules/*`, `symbiote-ui/schemas/*`, and `symbiote-ui/custom-elements.json`. Runtime execution contracts are consumed through `symbiote-engine`. Portal code must not deep-import provider implementation paths.

Host-level product policy remains in `web/` and `src/`: route composition, project selection, adapter orchestration, API endpoints, persistence, and MCP proxying. Provider metadata is discoverable with `npx symbiote-ui discover`; `symbiote-engine` owns runtime graph execution and handler packs.

## Plugin Architecture

> [!NOTE]
> Plugin architecture is implemented: `PluginLoader` scans and initializes plugins, supports `{ init, destroy, onAlert }` interface. Telegram bot plugin is functional.

### Implemented Plugins

| Plugin | Path | Description |
|--------|------|-------------|
| **Telegram** | `src/node/plugins/telegram/` | Chat bot + alert notifications |
| Slack | `src/node/plugins/slack/` | Block Kit webhook alerts |
| GitHub | `src/node/plugins/github/` | Crash → GitHub Issue |

### Gateway Layer

The Telegram integration also has a dedicated **Gateway** (`src/node/gateways/telegram.js`) that provides deeper integration than the plugin — it routes messages through the portal's adapter pool and manages conversation state.

## Quick Start

**Prerequisites:** Node.js >= 20.

```bash
git clone https://github.com/rnd-pro/mcp-agent-portal
cd mcp-agent-portal
npm install
```

Add to your IDE's MCP configuration:

```json
{
  "mcpServers": {
    "mcp-agent-portal": {
      "command": "node",
      "args": ["/path/to/mcp-agent-portal/index.js"]
    }
  }
}
```

### Configuration

Portal configuration is stored at `~/.agent-portal/agent-portal.json`:

```json
{
  "mcpServers": {
    "project-graph": {
      "command": "node",
      "args": ["/path/to/project-graph-mcp/src/network/server.js"]
    },
    "agent-pool": {
      "command": "node",
      "args": ["packages/agent-pool-mcp/index.js"]
    }
  },
  "projects": [],
  "activeProjectIds": [],
  "settings": {
    "telegramToken": "",
    "telegramChatId": ""
  },
  "providerModels": {}
}
```

## MCP Ecosystem

Agent Portal manages the RND-PRO MCP ecosystem. The core workspace owns `project-graph-mcp`, `agent-pool-mcp`, and `.agent-portal`; optional servers are added through marketplace or local configuration.

| Server | Description | Status |
|--------|-------------|--------|
| [project-graph-mcp](https://npmjs.com/package/project-graph-mcp) | AST-based codebase analysis, navigation, documentation | ✅ Production |
| [agent-pool-mcp](https://npmjs.com/package/agent-pool-mcp) | Multi-agent delegation, pipelines, scheduling, peer review, file tracking, workflow discovery | ✅ Production |
| Optional marketplace MCP servers | Browser, terminal, SaaS, and domain tools configured per workspace | Configurable |

> [!IMPORTANT]
> Each child server runs as an independent process. The singleton backend manages their lifecycle — auto-start on boot, auto-restart on crash (exponential backoff: 1s → 2s → 4s → ... → 30s max), graceful shutdown on exit.
> `agent-pool-mcp` is an internal Agent Portal execution server. External MCP clients use Agent Portal chat orchestration tools such as `create_chat` and `resume_chat`; they do not discover or call `delegate_task` directly.

## HTTP API

### Core

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/instances` | GET | List all registered MCP servers with status, PID, tool count |
| `/api/project-info` | GET | Portal metadata (name, path, version) |
| `/api/server-status` | GET | Uptime, server count, monitor count |
| `/api/health` | GET | Health check for all child servers |
| `/api/mcp-call` | POST | Proxy an MCP call to a child server `{ serverName, method, params }` |
| `/api/stop` | POST | Graceful shutdown |
| `/api/restart` | POST | Restart portal (spawn-before-exit) |

### Marketplace

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/marketplace` | GET | List available MCP servers from registry |
| `/api/marketplace/install` | POST | Install a server from registry |
| `/api/marketplace/install-custom` | POST | Install a custom MCP server |
| `/api/marketplace/remove` | POST | Remove an installed server |

### Settings & Models

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/settings` | GET | Read portal settings |
| `/api/settings` | POST | Update portal settings |
| `/api/settings/models` | GET | Get configured provider models |
| `/api/settings/models` | POST | Save provider model configuration |
| `/api/settings/models/refresh` | POST | Re-discover models from providers |
| `/api/adapter/status` | GET | Adapter pool status |
| `/api/adapter/types` | GET | Available adapter types |
| `/api/adapter/run` | POST | Run a prompt through an adapter |

### Projects & Chats

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/projects/history` | GET | List all known projects |
| `/api/projects/open` | POST | Open/activate a project |
| `/api/projects/close` | POST | Close/deactivate a project |
| `/api/projects/remove` | POST | Remove a project from history |
| `/api/projects/update` | POST | Update project metadata |
| `/api/chats` | GET | List all chat sessions |
| `/api/chats` | POST | Create a new chat session |
| `/api/chats/get` | POST | Get a specific chat; pass `includeMessages:false` for metadata with `messageCount` only |
| `/api/chats/messages/page` | POST | Get a bounded chat message page with `offset`, `before`, and `limit` |
| `/api/chats/message` | POST | Append a message to a chat |
| `/api/chats/update` | POST | Update chat metadata |
| `/api/chats/delete` | POST | Delete a chat session |
| `/api/chats/session` | POST | Manage chat adapter sessions |

### State & Observability

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/state` | GET | Read from StateGraph `?path=projects.list` |
| `/api/state/commit` | POST | Write to StateGraph |
| `/api/lint-file` | POST | Server-side ESLint for a file |
| `/api/flywheel/stats` | GET | MLOps flywheel statistics |
| `/api/cli/config` | GET/POST | CLI adapter configuration |

## WebSocket Channels

| Path | Protocol | Description |
|------|----------|-------------|
| `/mcp-ws` | MCP JSON-RPC | IDE stdio proxy endpoint. MCPMultiplexer handles `initialize`, `tools/list`, `tools/call` |
| `/ws/client` | Custom JSON | Remote client registration (master/client mode) |
| `/ws/chat` | Custom JSON | Real-time chat streaming for AgentChat UI |
| `/ws/state` | Custom JSON | StateGraph live sync for reactive UI |
| `/<server>/ws/monitor` | Custom JSON | Per-server live event stream (JSON-RPC broadcasts) |

## Project Structure

```
mcp-agent-portal/
├── bin/mcp-agent-portal.js           # CLI entry point + exit(2) respawn
├── index.js                          # Entry: IDE mode (proxy) or terminal mode (attached)
├── package.json
├── eslint.config.js
├── packages/                         # Git submodules
│   ├── project-graph-mcp/            # Codebase analysis MCP server
│   └── agent-pool-mcp/               # Agent orchestration MCP server
├── src/node/
│   ├── config-store.js               # Config read/write (projects, chats, settings)
│   ├── state-graph.js                # Reactive state graph with version tracking
│   ├── memory-store.js               # Persistent key-value memory for agents
│   ├── server/
│   │   ├── backend.js                # Backend entry point (spawned detached)
│   │   ├── backend-lifecycle.js      # ensureBackend, startStdioProxy, port file mgmt
│   │   ├── web-server.js             # HTTP server + upgrade dispatch + static files
│   │   ├── api-routes.js             # Declarative API route map (core)
│   │   ├── api-routes-projects.js    # Project & chat API routes
│   │   ├── context-injector.js       # Workspace rules sync (.cursorrules, etc.)
│   │   ├── lint-service.js           # ESLint integration
│   │   ├── local-gateway.js          # DNS-like service discovery (portal.local)
│   │   ├── marketplace-registry.js   # MCP server registry for marketplace
│   │   └── mdns.js                   # Bonjour/Avahi/mDNS announcements
│   ├── proxy/
│   │   ├── mcp-proxy.js              # MCPProxyManager (child lifecycle + WS channels)
│   │   ├── mcp-multiplexer.js        # Smart Gateway (meta-tools + tool routing)
│   │   └── tool-index.js             # ToolIndex (search, tags, server mapping)
│   ├── adapters/
│   │   ├── index.js                  # resolveAdapter() registry
│   │   ├── base.js                   # BaseAdapter interface
│   │   ├── antigravity.js            # Antigravity CLI adapter
│   │   ├── claude.js                 # Claude Code CLI adapter (stream-json)
│   │   ├── codex.js                  # OpenAI Codex CLI adapter (exec --json)
│   │   ├── opencode.js               # OpenCode/Crush adapter
│   │   └── pool.js                   # AdapterPool (acquire/release)
│   ├── gateways/
│   │   └── telegram.js               # Telegram bot gateway (deep integration)
│   ├── plugins/
│   │   ├── plugin-loader.js          # Plugin discovery + lifecycle + alert dispatch
│   │   ├── telegram/index.js         # Telegram plugin (alerts)
│   │   ├── slack/index.js            # Slack webhook plugin
│   │   └── github/index.js           # GitHub Issues plugin
│   ├── mlops/
│   │   ├── flywheel.js               # Agent performance tracking
│   │   └── trajectory-compressor.js  # Token trajectory compression
│   └── discovery/
│       └── ws-client.js              # WebSocket client for --connect mode
├── web/                              # Frontend SPA
│   ├── app.js                        # Main app (routing, project switching)
│   ├── router-registry.js            # Extensible section/panel registry
│   ├── state-sync.js                 # Reactive state sync via WS
│   ├── common/
│   │   └── mcp-call.js               # Shared MCP call helper
│   ├── components/
│   │   ├── ProjectTabs/              # Multi-project tab bar
│   │   └── ...                       # code-block, canvas-graph, etc.
│   └── panels/                       # Product panel adapters and section surfaces
│       ├── ActionBoard/              # Dashboard action cards
│       ├── ActiveContext/            # Live context tracking
│       ├── ActiveTasks/              # Running agent tasks
│       ├── AgentChat/                # AI chat with adapter selection
│       ├── ChatList/                 # Chat session list
│       ├── GroupManager/             # Agent group management
│       ├── Marketplace/              # MCP server marketplace
│       ├── PeerReview/               # Agent peer review
│       ├── PipelineManager/          # Multi-step pipelines
│       ├── ProjectItem/              # Single project card
│       ├── ProjectList/              # Project list view
│       ├── SettingsPanel/            # Configuration UI
│       ├── SkillManager/             # Skill/workflow manager
│       ├── ToolExplorer/             # Tool schema browser
│       ├── Topology/                 # Network topology viz
│       └── WorkflowExplorer/         # Workflow discovery
├── test/
│   ├── unit/                         # node --test unit tests
│   └── integration/                  # node --test API tests
└── tmp/                              # Drafts (gitignored)
```

> [!TIP]
> **Colocated `.ctx`** — documentation files live next to their source (`parser.ctx` beside `parser.js`), not in a separate tree. This ensures agents see the `file ↔ docs` pairing immediately.

## Observability & Monitoring

### Implemented

1. **Process Lifecycle Tracking**: 
   `MCPProxyManager` spawns child servers and tracks PID, process state, crash count.

2. **Log Multiplexing & Live Telemetry**: 
   Stderr from all children is logged to portal console. JSON-RPC messages are broadcast to WebSocket monitors via `broadcastMonitor()`. The **Monitor** panel subscribes to this feed.

3. **Auto-Restart on Crash**: 
   Crashed children are respawned with exponential backoff (1s → 30s max). Crash counter resets after 10s of stable uptime.

4. **Error Notifications & Alerting**:
   Crash events trigger `pluginLoader.dispatchAlert()` → Telegram/Slack/GitHub.

5. **MLOps Flywheel**:
   `src/node/mlops/flywheel.js` tracks agent performance metrics. `trajectory-compressor.js` handles token trajectory compression for cost analysis.

6. **StateGraph**:
   `src/node/state-graph.js` provides a versioned, reactive state store with persistence. The web UI subscribes via `/ws/state` for live updates.

## Configuration Paths

| Path | Purpose |
|------|---------|
| `~/.agent-portal/agent-portal.json` | Main config: servers, projects, settings |
| `~/.local-gateway/backends/portal-<hash>.json` | Backend port file (singleton discovery) |
| `~/.local-gateway/gateway.json` | Local gateway routing table |
| `~/.agent-portal/memory.json` | Persistent agent memory (remember/recall) |

## Related Projects

- [project-graph-mcp](https://github.com/rnd-pro/project-graph-mcp) — AST-based codebase analysis for AI agents
- [agent-pool-mcp](https://github.com/rnd-pro/agent-pool-mcp) — Multi-agent orchestration, file tracking, and workflow discovery
- [Symbiote.js](https://github.com/symbiotejs/symbiote.js) — Isomorphic Reactive Web Components framework
- [symbiote-ui](https://github.com/RND-PRO/symbiote-ui) — Provider UI, graph, layout, XR, theme, and WebMCP contracts
- [symbiote-engine](https://github.com/RND-PRO/symbiote-engine) — Runtime execution, CLI, registry, persistence, and handlers

## License

MIT © [RND-PRO.com](https://rnd-pro.com)

---

**Made with ❤️ by the RND-PRO team**
