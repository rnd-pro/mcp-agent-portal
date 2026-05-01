[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)

# mcp-agent-portal

**Unified MCP aggregator + AI agent runtime.** A single MCP server that proxies any number of child MCP servers — your IDE sees one `tools/list` combined from all of them. Runs a web dashboard in parallel for visual management, agent chat, and live monitoring.

```
┌─────────────────────────────────┐
│  IDE Agent                      │  ← Claude, GPT, Gemini, etc.
│  (Antigravity / Cursor / ...)   │
└────────────┬────────────────────┘
             │ MCP (stdio)
┌────────────▼────────────────────┐
│  mcp-agent-portal               │  ← This server
│  (MCP aggregator + web UI)      │
└──┬────────┬────────┬────────────┘
   │        │        │
   ▼        ▼        ▼
 project  agent    browser        ← Child MCP servers
 -graph   -pool    -x-mcp           (stdio, auto-spawned)
```

> [!TIP]
> Add one entry to your MCP config and get access to every tool from every child server — no per-server configuration in the IDE.

### Singleton Architecture

Agent Portal runs as a **detached singleton backend** to prevent resource exhaustion when opening multiple IDE windows.

```
IDE Window 1 ──stdio──┐                 ┌───────────────────────┐
IDE Window 2 ──stdio──┼───WebSocket────▶│ Singleton Backend     │
IDE Window 3 ──stdio──┘                 │ (detached process)    │
                                        └──┬────────┬───────────┘
                                           │        │
                                           ▼        ▼
                                       project-   agent-
                                       graph      pool
```

1. **First IDE window**: Spawns the detached backend process, then connects via WebSocket.
2. **Subsequent IDE windows**: Detect the backend via `~/.local-gateway/backends/` port files and connect via WebSocket.
3. **Zero-Zombie**: The backend outlives the IDE windows and manages all child processes in detached process groups. On shutdown, it cleans up all children automatically.

### Workspace Registration

When an IDE connects, the MCP `initialize` message carries `params.roots` — the workspace directories the IDE has open. The portal extracts these roots and automatically:

1. Creates a project entry in `~/.gemini/agent-portal.json` (deduplication by path)
2. Adds it to the active project tabs
3. Broadcasts `projects.opened` to the web UI for real-time tab creation

This means each IDE window registers its **own workspace**, not the portal's install directory. Multiple IDE windows editing different projects all appear as separate tabs in the dashboard.

### Dual Mode

Agent Portal provides two interfaces to the same singleton backend:

| Mode | Transport | What you see |
|------|-----------|-------------|
| **IDE** | stdio (JSON-RPC) | Unified `tools/list`, `resources/list`, `prompts/list` from all children |
| **Web** | HTTP + WebSocket | Dashboard, Marketplace, AI Chat, Graph, live monitoring |

The IDE connects to the portal's `/mcp-ws` endpoint. The web UI runs on a random port, accessible via `http://portal.local` (local gateway).

### MCP Aggregation

When your IDE sends `initialize { params: { roots: [...] } }`:

1. Portal extracts workspace roots and registers them as dashboard project tabs
2. Portal responds with its capabilities (`tools`, `resources`)
3. Portal broadcasts `initialize` to all child MCP servers

When your IDE sends `tools/call { name: "get_skeleton" }`:

1. Portal looks up `get_skeleton` in its `toolsMap` → `project-graph`
2. Rewrites the request ID and forwards it to the child's stdin
3. Child processes the call, responds on stdout
4. Portal rewrites the ID back and sends the response to the IDE over WebSocket

The browser uses the same mechanism via `POST /api/mcp-call`.

### Heterogeneous Agent Pool

> [!NOTE]
> The adapter pool infrastructure (`src/node/adapters/`) is fully implemented with `BaseAdapter`, `AdapterPool` (acquire/release), and three functional adapters: `gemini`, `claude`, and `opencode`. All three use stream-json parsing with timeout and process group management.

Multiple CLI agents will run **in parallel** — not just one at a time. The pool is heterogeneous: different providers handle different tasks simultaneously.

```
┌───────────────────────────────────────────────────────┐
│                AGENT POOL (parallel)                  │
│                                                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │ Gemini#1 │ │ Gemini#2 │ │ Claude#1 │ │OpenCode │ │
│  │ codegen  │ │ refactor │ │ review   │ │ research│ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬────┘ │
│       └──────┬─────┴──────┬─────┴──────┬──────┘     │
│              ▼            ▼            ▼             │
│  ┌─────────────────────────────────────────────────┐ │
│  │  MCP Tool Router — shared across all agents     │ │
│  │  local tools + proxied tools + remote tools     │ │
│  └─────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

Each adapter type will have configurable capacity limits. The orchestrator can auto-select the best provider for a task:

- **Code generation** → Gemini (fast, good with code)
- **Architecture review** → Claude (deep reasoning)
- **Sensitive data** → OpenCode (local, no cloud)
- **Bulk analysis** → OpenRouter/Qwen (cheap, parallel)

### Three Operating Modes

> [!NOTE]
> **Standalone** and **Client** modes are fully implemented. **Master** mode accepts remote client connections via WebSocket (`/ws/client`) and aggregates their tools.

```
node index.js                  # standalone (default, implemented)
node index.js --connect wss:// # client — joins a master node (planned)
node index.js --master         # master — orchestrates client nodes (planned)
```

| Mode | What it does | Status |
|------|-------------|--------|
| **Standalone** | Spawns local child MCP servers, serves web UI, provides stdio MCP to IDE | ✅ Implemented |
| **Client** | Connects to a master via WebSocket, registers its local tools, executes delegated tasks | ✅ Implemented |
| **Master** | Aggregates tools from local children AND remote client nodes. IDE sees everything. | ✅ Implemented |

```
IDE ──stdio──→ Portal (master)
                ├── local: project-graph, agent-pool
                ├──WSS──→ Client A (machine-1): browser-x, crypto
                └──WSS──→ Client B (cloud-vm): terminal-x, context-x
```

> [!IMPORTANT]
> In master mode, `tools/list` will include tools from all connected clients. Routing is transparent — the IDE won't know which machine handles the call.

### Web Dashboard

Built-in web UI with extensible section registry:

| Section | Hash | Icon | Description |
|---------|------|------|-------------|
| Dashboard | `#dashboard` | `dashboard` | Server list, action board, agent chat |
| AI Chat | `#chat` | `smart_toy` | Full-screen agent chat with adapter selection |
| Marketplace | `#marketplace` | `storefront` | MCP server management — status, start/stop, tool explorer |
| Topology | `#topology` | `hub` | Network visualization of connected nodes (local + remote) |
| Tool Explorer | `#tool-explorer` | `build` | Browse `tools/list` per server with input schema viewer |
| Explorer | `#explorer` | `folder_open` | File browser with code viewer and docs |
| Graph | `#graph` | `developer_board` | Force-directed dependency graph (canvas) |
| Follow | `#follow` | `smart_toy` | Combined graph + code + monitor view for live agent tracking |
| Analysis | `#analysis` | `analytics` | Code quality health dashboard |
| Monitor | `#monitor` | `monitor_heart` | Live event stream from all MCP servers |
| Settings | `#settings` | `settings` | Portal configuration |

New sections are registered via `RouterRegistry` — MCP servers can inject their own UI panels at runtime.

### Marketplace

Discover and manage MCP servers. The Marketplace panel shows all configured servers with live status, PID, and tool count. Planned features:

- Add/remove servers via UI (edits `mcp-agent-portal.json`)
- Tool explorer — browse `tools/list` per server
- Start/stop/restart individual servers
- Public registry (ClawHub-inspired)

### CLI Adapters

> [!NOTE]
> **Dual Execution Architecture:** The portal features two ways to execute CLI agents:
> 1. **Direct Adapters (`src/node/adapters/`)**: Native adapters for Gemini and Claude that run directly within the portal process. These act as direct execution fallbacks.
> 2. **Pool Orchestrator (`agent-pool-mcp`)**: The primary and recommended execution path. All providers (Gemini, Claude, OpenCode, OpenRouter) are natively implemented inside the `agent-pool-mcp` server. The `AgentChat` UI delegates tasks to the pool by default (via `adapter: "pool"` and `provider: "..."`), allowing the pool to manage parallel streams, detached process groups, and task scheduling.

Abstract interface for any direct CLI agent runtime (in `src/node/adapters/`):

```javascript
class BaseAdapter {
  async start() {}
  async chat(prompt) {}
  async *stream(prompt) {}
  async stop() {}
  getBuiltinTools() { return []; }
  getStatus() { return { id, type, status }; }
}
```

Concrete direct adapters in portal (fallbacks):

| Adapter | CLI | Status |
|---------|-----|--------|
| `gemini-adapter` | `gemini -p "prompt" --output-format stream-json` | ✅ Functional |
| `claude-adapter` | `claude -p "prompt" --output-format stream-json` | ✅ Functional |

The `AdapterPool` will manage direct adapter instances — `acquire(type)` gets an idle adapter or spawns a new one, `release()` returns it to the pool.

## Plugin Architecture (External Integrations)

> [!NOTE]
> Plugin architecture is implemented: `PluginLoader` scans and initializes plugins, supports `{ init, destroy, onAlert }` interface. Telegram bot plugin is functional. Error alerting (crash → plugin dispatch) is wired.

The Agent Portal will support a modular **Plugin System** designed to bridge the portal's unified agent pool and MCP tools to external platforms (e.g., Telegram, Slack, GitHub). 

Based on our reference implementations (like the local `telegram-llm-bot`), a plugin is an autonomous integration module that connects external channels to the portal's reasoning engine.

### Core Responsibilities of a Plugin

1. **Channel Transport**: Manages the connection to the external service (e.g., Telegraf for Telegram bots, Webhooks for Slack).
2. **Context Synchronization**: Maintains conversation state. While standalone bots might use local XML/JSON files for context windows, Portal plugins can leverage the centralized context management to store and retrieve multi-day conversation histories.
3. **Agent Delegation**: Instead of calling LLM APIs directly, plugins route user messages through the Portal's `AdapterPool`. The plugin asks the portal to execute a task, and the portal routes it to the appropriate CLI adapter (Gemini, Claude, or OpenCode).
4. **Action Interception (Inline Tools)**: Plugins can parse special output directives from the agents. For legacy agents or environments where strict JSON-RPC MCP isn't available, the agent can output text-based markers (e.g., `||readFile||/path/to/file||` or `||sendMessage||...`). The plugin intercepts these markers, executes the corresponding local action (like reading a file uploaded to the chat), and injects the result back into the agent's context without exposing the raw markup to the end user.

### Example: Telegram Bot Plugin

A Telegram plugin running within the portal operates as follows:
- **Input**: Listens for `@bot_name` mentions, direct messages, or document uploads.
- **Context**: Formats the recent chat history into the agent's context prompt.
- **Execution**: Sends the prompt to the Portal Orchestrator (e.g., targeting the `opencode-adapter` for secure local execution).
- **Tooling**: If a user uploads a document, the plugin saves it locally. If the agent needs to read it, it outputs `||readFile||/path/to/doc.txt||`. The plugin reads the file, appends its content to the context, and re-prompts the agent seamlessly.
- **Output**: Formats the final text (handling Markdown code blocks properly for Telegram's specific syntax) and sends it back to the chat.

By keeping plugins loosely coupled, the Agent Portal acts as the central brain, while plugins serve as the sensory inputs and outputs across different communication platforms.

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

Create `~/.gemini/mcp-agent-portal.json`:

```json
{
  "mode": "standalone",
  "mcpServers": {
    "project-graph": {
      "command": "npx",
      "args": ["-y", "project-graph-mcp"]
    },
    "agent-pool": {
      "command": "npx",
      "args": ["-y", "agent-pool-mcp"]
    }
  },
  "adapters": {
    "gemini": { "type": "gemini", "enabled": true, "maxInstances": 5 },
    "claude": { "type": "claude-code", "enabled": false, "maxInstances": 2 }
  }
}
```

## MCP Ecosystem

Agent Portal aggregates the full RND-PRO MCP ecosystem:

| Server | Description | Status |
|--------|-------------|--------|
| [project-graph-mcp](https://npmjs.com/package/project-graph-mcp) | AST-based codebase analysis, navigation, documentation | ✅ Production |
| [agent-pool-mcp](https://npmjs.com/package/agent-pool-mcp) | Multi-agent delegation, pipelines, scheduling, peer review | ✅ Production |
| browser-x-mcp | Browser automation, form testing | 🟡 Beta |
| terminal-x-mcp | Multi-terminal automation with security validation | 🔴 Alpha |
| context-x-mcp | Context enrichment with auto-topic detection | 🔴 Alpha |
| crypto-mcp | Crypto market analysis, trend lines, auto-trading | 🟡 Beta |

> [!IMPORTANT]
> Each child server runs as an independent process. The singleton backend manages their lifecycle — auto-start on boot, log anomalies on crash, graceful shutdown on exit. Auto-restart on crash is supported.

## HTTP API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/mcp-call` | POST | Proxy an MCP call to a child server |
| `/api/instances` | GET | List all registered MCP servers with status |
| `/api/project-info` | GET | Portal metadata |
| `/api/server-status` | GET | Uptime, server count, monitor count |
| `/api/stop` | POST | Graceful shutdown |
| `/api/restart` | POST | Restart portal (spawn-before-exit) |
| `/api/*` | * | Fallback HTTP proxy to local-gateway backends |

## Project Structure

```
mcp-agent-portal/
├── bin/mcp-agent-portal.js           # CLI entry point + exit(2) respawn fallback
├── index.js                     # Entry point: web server + stdio MCP
├── package.json
├── eslint.config.js             # Flat ESLint config for IDE highlighting
├── packages/                    # Git submodules
│   ├── symbiote-node/           # UI framework (layout, canvas, themes)
│   ├── project-graph-mcp/       # Codebase analysis MCP
│   └── agent-pool-mcp/          # Agent orchestration MCP
├── src/node/
│   ├── config-store.js          # Config read/write utility (DRY)
│   ├── server/
│   │   ├── web-server.js        # HTTP server + route dispatch + static files
│   │   ├── api-routes.js        # Declarative API route map (CIT pattern)
│   │   ├── lint-service.js      # ESLint integration for server-side linting
│   │   ├── local-gateway.js     # DNS-like service discovery
│   │   └── web-server.ctx       # ← colocated documentation
│   ├── proxy/
│   │   ├── mcp-proxy.js         # MCPProxyManager (child lifecycle + auto-restart)
│   │   ├── mcp-multiplexer.js   # MCPMultiplexer (stdio ↔ children)
│   │   ├── mcp-proxy.ctx
│   │   └── mcp-multiplexer.ctx
│   ├── adapters/
│   │   ├── index.js             # resolveAdapter() registry
│   │   ├── base.js              # BaseAdapter interface
│   │   ├── gemini.js            # Gemini CLI adapter
│   │   ├── claude.js            # Claude Code CLI adapter
│   │   ├── opencode.js          # OpenCode/Crush adapter
│   │   └── pool.js              # AdapterPool (acquire/release)
│   ├── plugins/
│   │   ├── plugin-loader.js     # Plugin discovery + lifecycle + alert dispatch
│   │   ├── telegram/index.js    # Telegram bot plugin (chat + alerts)
│   │   ├── slack/index.js       # Slack webhook plugin (Block Kit alerts)
│   │   └── github/index.js      # GitHub Issues plugin (crash → issue)
│   └── discovery/
│       └── ws-client.js         # WebSocket client for --connect mode
├── web/                         # Frontend SPA
│   ├── app.js                   # Main app (RouterRegistry)
│   ├── router-registry.js       # Extensible section/panel registry
│   ├── state.js                 # Reactive state store + WS connection
│   ├── WsClient.js              # Static WS singleton (CIT pattern)
│   ├── components/              # code-block (with lint overlay), canvas-graph
│   └── panels/                  # 9 panel dirs + 6 standalone panels
├── test/
│   ├── unit/                    # node --test unit tests
│   └── integration/             # node --test API tests
└── tmp/                         # Drafts (gitignored)
```

> [!TIP]
> **Colocated `.ctx`** — documentation files live next to their source (`parser.ctx` beside `parser.js`), not in a separate `.context/` tree. This ensures agents see the `file ↔ docs` pairing immediately when listing a directory, without needing to know about a separate documentation tree.

## Observability & Monitoring

Since Agent Portal acts as an aggregation hub for multiple child processes and parallel agents, observability is a core concern:

### Implemented

1. **Process Lifecycle Tracking**: 
   The `MCPProxyManager` spawns child servers and tracks their PID and process state.

2. **Log Multiplexing & Live Telemetry**: 
   Standard error (stderr) streams from all child servers are logged to the portal's console. JSON-RPC messages from children are broadcast to connected WebSocket clients via `broadcastMonitor()`. The Web Dashboard's **Monitor** panel subscribes to this feed, providing a real-time event stream.

3. **Auto-Restart on Crash**: 
   Crashed child processes are automatically respawned with exponential backoff (1s → 2s → 4s → ... → 30s max). Crash counter resets after 10s of stable uptime. Crash events are broadcast to WebSocket monitors and dispatched to plugins.

4. **Error Notifications & Alerting**:
   Crash events trigger `pluginLoader.dispatchAlert()`, which forwards alerts to all plugins implementing `onAlert()`. The Telegram plugin sends alerts to a configured `alertChatId`.

## UI Error Highlighting (Server-Side Linting)

Server-side linting is fully implemented:

1. **Backend Integration**: The `/api/lint-file` endpoint runs Node.js-based ESLint (`lint-service.js`) against the local file system using the project's `eslint.config.js`.
2. **UI Component (`code-block.js`)**: The `code-viewer.js` panel calls `_lintCurrentFile()` on every file load, passing results to `code-block.setDiagnostics()`. The `_renderSquiggles()` method renders absolutely positioned wavy underlines (red for errors, yellow for warnings) with hover tooltips showing rule IDs and messages.

## Roadmap

Implementation phases in strict execution order. Each phase depends on the previous one being complete.

### Phase 0 — Cross-Project Best Practices Refactoring ✅ (this repo)

> [!IMPORTANT]
> This phase is **prerequisite** for all feature work. Without it, new code will inherit inconsistent patterns from upstream projects.

Align **all related repositories** to the unified coding standard defined in [BEST-PRACTICES.md](./BEST-PRACTICES.md):

| # | Project | Key Refactoring | Priority |
|---|---------|-----------------|----------|
| 0.1 | **mcp-agent-portal** (this repo) | `iso/node/ui/` source layout; `let`-first; single quotes; JSDoc `@type` on all exports | 🔴 Critical |
| 0.2 | **project-graph-mcp** | Code style audit (let/const, arrow conventions); generate `.ctx` docs for every `src/` file | 🔴 Critical |
| 0.3 | **agent-pool-mcp** | Same code style audit; `.ctx` docs generation; verify plain-object patterns (no unnecessary classes) | 🔴 Critical |
| 0.4 | **symbiote-node** | Verify Triple-File Partitioning; audit token-based theming; ensure `iso/node/ui/` boundary compliance | 🟡 High |
| 0.5 | **browser-x-mcp** | Code style pass; add `.ctx` docs | 🟢 Normal |
| 0.6 | **terminal-x-mcp** | Code style pass; add `.ctx` docs | 🟢 Normal |

**Per-project checklist** (from BEST-PRACTICES §10):
- [ ] `let` over `const` (const only for true constants: `CONFIG_FILE`, `REQUIRED_FIELDS`)
- [ ] Single quotes + semicolons + 2-space indent
- [ ] Arrow functions for callbacks; `function` only for named exports and hoisted helpers
- [ ] Max 30 lines per utility file; split if larger
- [ ] Plain objects for adapters/connectors — no class hierarchies
- [ ] `resolveX()` registry pattern with error messages listing valid options
- [ ] JSDoc `@type` inline casts; full `@param`/`@returns` blocks on public exports only
- [ ] Emoji log prefixes (✅🟡🔴🔄)
- [ ] Dual exports (named + default) on every module
- [ ] **Colocated `.ctx`** — documentation generated next to source files (`src/proxy/mcp-proxy.ctx`), not in `.context/`
- [ ] `node --test` — no test framework dependency (no Jest/Mocha/Vitest)
- [ ] `eslint.config.js` matching conventional style for IDE highlighting only

**Deliverable**: All repos pass a unified style audit. `.ctx` docs generated. Ready for feature work.

---

### Phase 1 — Portal Core Stabilization ✅

Harden the implemented MCP aggregator core:

| # | Task | Scope |
|---|------|-------|
| 1.1 | **Auto-restart on crash** | `mcp-proxy.js`: add respawn logic with exponential backoff in `child.on('exit')` |
| 1.2 | **Exit code 2 = restart** | `index.js`: wrap in bin entry point that restarts on code 2 (config change via UI) |
| 1.3 | **Config validation** | `mcp-proxy.js`: fail-fast with clear messages on missing `command`/`args` fields |
| 1.4 | **`/api/lint-file` endpoint** | `web-server.js`: integrate ESLint for server-side linting |
| 1.5 | **Code viewer error overlay** | `code-block.js`: squiggles/tooltips from lint results |
| 1.6 | **`.ctx` docs panel** | Verify `ctx-panel.js` works with generated `.ctx` files from Phase 0 |

**Deliverable**: Rock-solid single-node portal with auto-healing, config validation, and error visualization.

---

### Phase 2 — CLI Adapter Pool ✅ (core)

Implement the heterogeneous agent pool:

| # | Task | Scope |
|---|------|-------|
| 2.1 | **`src/adapters/` directory** | Create with `index.js` registry (plain-object `resolveAdapter()` pattern) |
| 2.2 | **gemini-adapter** | Port from `agent-pool-mcp` — `gemini` CLI wrapper |
| 2.3 | **claude-adapter** | Port from `agent2agent` — `claude-code` CLI wrapper |
| 2.4 | **opencode-adapter migration** | Migrate OpenCode integration exclusively into `agent-pool-mcp` orchestrator |
| 2.5 | **AdapterPool** | `acquire(type)` / `release()` lifecycle, capacity limits from config |
| 2.6 | **AgentChat integration** | Wire `AgentChat` panel to use `AdapterPool` instead of direct API calls |

**Deliverable**: Agent chat works with multiple LLM backends. Config `adapters` section is functional.

---

### Phase 3 — Plugin System ✅

External integrations via loosely coupled plugins:

| # | Task | Scope |
|---|------|-------|
| 3.1 | **Plugin loader** | Scan `plugins/` directory, load and register plugins at startup |
| 3.2 | **Plugin interface** | `{ name, init(portal), destroy() }` — portal injects API surface |
| 3.3 | **Telegram plugin** | Port and adapt `telegram-llm-bot` as first reference plugin |
| 3.4 | **Error alerting via plugins** | Connect Observability alerts → plugin dispatch (Telegram, Slack) |

**Deliverable**: Working Telegram bot that routes messages through Portal's adapter pool. Error alerts in Telegram.

---

### Phase 4 — Distributed Mode ✅ (core)

Multi-node topology (client/master):

| # | Task | Scope |
|---|------|-------|
| 4.1 | **CLI argument parsing** | `--connect`, `--master` flags in `index.js` |
| 4.2 | **`src/discovery/`** | WebSocket client for connecting to master node |
| 4.3 | **Master aggregation** | Extend `MCPMultiplexer` to accept remote tool registrations |
| 4.4 | **Topology panel** | New `#topology` section — network visualization of connected nodes |

**Deliverable**: IDE on machine A uses tools from machine B transparently.

---

### Phase 5 — Marketplace & Public Registry ✅ (local)

| # | Task | Scope |
|---|------|-------|
| 5.1 | **Add/remove servers via UI** | Marketplace edits `mcp-agent-portal.json` + triggers exit(2) restart |
| 5.2 | **Tool explorer** | Browse `tools/list` per server with input playground |
| 5.3 | **Public registry API** | ClawHub-inspired server discovery and one-click install |

**Deliverable**: Fully self-service MCP server management.

## Related Projects

- [project-graph-mcp](https://github.com/rnd-pro/project-graph-mcp) — AST-based codebase analysis for AI agents
- [agent-pool-mcp](https://github.com/rnd-pro/agent-pool-mcp) — Multi-agent orchestration via Gemini CLI
- [Symbiote.js](https://github.com/symbiotejs/symbiote.js) — Isomorphic Reactive Web Components framework
- [symbiote-node](https://github.com/RND-PRO/symbiote-node) — Studio UX framework with node graph editor

## License

MIT © [RND-PRO.com](https://rnd-pro.com)

---

**Made with ❤️ by the RND-PRO team**
