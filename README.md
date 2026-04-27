[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)

# agent-portal

**Unified MCP aggregator + AI agent runtime.** A single MCP server that proxies any number of child MCP servers — your IDE sees one `tools/list` combined from all of them. Runs a web dashboard in parallel for visual management, agent chat, and live monitoring.

```
┌─────────────────────────────────┐
│  IDE Agent                      │  ← Claude, GPT, Gemini, etc.
│  (Antigravity / Cursor / ...)   │
└────────────┬────────────────────┘
             │ MCP (stdio)
┌────────────▼────────────────────┐
│  agent-portal                   │  ← This server
│  (MCP aggregator + web UI)      │
└──┬────────┬────────┬────────────┘
   │        │        │
   ▼        ▼        ▼
 project  agent    browser        ← Child MCP servers
 -graph   -pool    -x-mcp           (stdio, auto-spawned)
```

> [!TIP]
> Add one entry to your MCP config and get access to every tool from every child server — no per-server configuration in the IDE.

### Dual Mode

Agent Portal works in **two modes simultaneously**:

| Mode | Transport | What you see |
|------|-----------|-------------|
| **IDE** | stdio (JSON-RPC) | Unified `tools/list`, `resources/list`, `prompts/list` from all children |
| **Web** | HTTP + WebSocket | Dashboard, Marketplace, AI Chat, Graph, live monitoring |

The IDE talks to agent-portal as a normal MCP server. The web UI runs in the background on a random port, accessible via `portal.local` (local gateway).

### MCP Aggregation

When your IDE sends `tools/call { name: "get_skeleton" }`:

1. Portal looks up `get_skeleton` in its `toolsMap` → `project-graph`
2. Rewrites the request ID and forwards it to the child's stdin
3. Child processes the call, responds on stdout
4. Portal rewrites the ID back and sends the response to the IDE

The browser uses the same mechanism via `POST /api/mcp-call`.

### Heterogeneous Agent Pool

> [!NOTE]
> **Roadmap** — designed but not yet implemented. Currently the portal aggregates MCP tools only; the adapter pool is the next major milestone.

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
> Only **Standalone** mode is currently implemented. Client and Master modes are on the roadmap.

```
node index.js                  # standalone (default, implemented)
node index.js --connect wss:// # client — joins a master node (planned)
node index.js --master         # master — orchestrates client nodes (planned)
```

| Mode | What it does | Status |
|------|-------------|--------|
| **Standalone** | Spawns local child MCP servers, serves web UI, provides stdio MCP to IDE | ✅ Implemented |
| **Client** | Connects to a master via WebSocket, registers its local tools, executes delegated tasks | 🔮 Planned |
| **Master** | Aggregates tools from local children AND remote client nodes. IDE sees everything. | 🔮 Planned |

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
| Explorer | `#explorer` | `folder_open` | File browser with code viewer and docs |
| Graph | `#graph` | `developer_board` | Force-directed dependency graph (canvas) |
| Follow | `#follow` | `smart_toy` | Combined graph + code + monitor view for live agent tracking |
| Analysis | `#analysis` | `analytics` | Code quality health dashboard |
| Monitor | `#monitor` | `monitor_heart` | Live event stream from all MCP servers |
| Settings | `#settings` | `settings` | Portal configuration |

New sections are registered via `RouterRegistry` — MCP servers can inject their own UI panels at runtime.

### Marketplace

Discover and manage MCP servers. The Marketplace panel shows all configured servers with live status, PID, and tool count. Planned features:

- Add/remove servers via UI (edits `agent-portal.json`)
- Tool explorer — browse `tools/list` per server
- Start/stop/restart individual servers
- Public registry (ClawHub-inspired)

### CLI Adapters

> [!NOTE]
> **Roadmap** — adapter interfaces are designed, implementation pending. The `src/adapters/` directory will be created when work begins.

Planned abstract interface for any CLI agent runtime:

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

Concrete adapters to be built from existing projects:

| Adapter | Source project | CLI |
|---------|---------------|-----|
| `gemini-adapter` | agent-pool-mcp | `gemini --model X -p "prompt"` |
| `claude-adapter` | agent2agent | `@anthropic-ai/claude-code` |
| `opencode-adapter` | agicoder | OpenCode/Crush MCP host |
| `openrouter-adapter` | AgentAggregator | Direct API calls |

The `AdapterPool` will manage instances — `acquire(type)` gets an idle adapter or spawns a new one, `release()` returns it to the pool.

## Plugin Architecture (External Integrations) — Planned

> [!NOTE]
> **Roadmap** — plugin architecture is designed based on reference implementations. No plugin loader exists yet.

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
git clone https://github.com/rnd-pro/agent-portal
cd agent-portal
npm install
```

Add to your IDE's MCP configuration:

```json
{
  "mcpServers": {
    "agent-portal": {
      "command": "node",
      "args": ["/path/to/agent-portal/index.js"]
    }
  }
}
```

### Configuration

Create `~/.gemini/agent-portal.json`:

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

> [!IMPORTANT]
> Each child server runs as an independent process. Portal manages their lifecycle — auto-start on boot, log anomalies on crash, graceful shutdown on exit. Auto-restart on crash is planned but not yet implemented.

## HTTP API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/mcp-call` | POST | Proxy an MCP call to a child server |
| `/api/instances` | GET | List all registered MCP servers with status |
| `/api/project-info` | GET | Portal metadata |
| `/api/server-status` | GET | Uptime, server count, monitor count |
| `/api/stop` | POST | Graceful shutdown |
| `/api/restart` | POST | Restart portal |
| `/api/*` | * | Fallback HTTP proxy to local-gateway backends |

## Project Structure

```
agent-portal/
├── index.js                          # Entry point: web server + stdio MCP
├── bin/agent-portal.js               # CLI wrapper with exit(2) restart
├── package.json
├── packages/                         # Git submodules
│   ├── symbiote-node/                # UI framework (layout, canvas, themes)
│   ├── project-graph-mcp/            # Codebase analysis MCP
│   └── agent-pool-mcp/               # Agent orchestration MCP
├── src/
│   ├── iso/                          # Isomorphic: runs in both Node.js and browser
│   ├── node/
│   │   ├── server/web-server.js      # HTTP API + static file serving
│   │   ├── server/web-server.ctx     # ← colocated documentation
│   │   ├── server/local-gateway.js   # DNS-like service discovery (minified)
│   │   ├── server/mdns.js            # mDNS service registration helper
│   │   ├── proxy/mcp-proxy.js        # MCPProxyManager (child process mgmt)
│   │   ├── proxy/mcp-proxy.ctx       # ← colocated documentation
│   │   ├── proxy/mcp-multiplexer.js  # MCPMultiplexer (stdio ↔ children)
│   │   └── proxy/mcp-multiplexer.ctx
│   └── discovery/                    # (reserved for distributed mode)
├── web/                              # Frontend SPA (browser tier)
│   ├── app.js                        # Main app (RouterRegistry)
│   ├── router-registry.js            # Extensible section/panel registry
│   ├── components/                   # Shared UI components (canvas-graph, code-block, etc.)
│   └── panels/                       # UI panels (Marketplace, AgentChat, etc.)
```

> [!TIP]
> **Colocated `.ctx`** — documentation files live next to their source (`parser.ctx` beside `parser.js`), not in a separate `.context/` tree. This ensures agents see the `file ↔ docs` pairing immediately when listing a directory, without needing to know about a separate documentation tree.

## Observability & Monitoring

Since Agent Portal acts as an aggregation hub for multiple child processes and parallel agents, observability is a core concern:

### Implemented

1. **Process Lifecycle Tracking**: 
   The `MCPProxyManager` spawns child servers and tracks their PID and process state. On crash, the manager logs the exit event and cleans up the process reference.

2. **Log Multiplexing & Live Telemetry**: 
   Standard error (stderr) streams from all child servers are logged to the portal's console. JSON-RPC messages from children are broadcast to connected WebSocket clients via `broadcastMonitor()`. The Web Dashboard's **Monitor** panel subscribes to this feed, providing a real-time event stream.

### Planned

3. **Auto-Restart on Crash**: 
   Automatic respawning of crashed child processes with exponential backoff and anomaly counting. Currently the exit handler only nullifies the process reference.

4. **Error Notifications & Alerting**:
   Critical system events (e.g., repeated child process crashes, adapter exhaustion, or unhandled exceptions) will trigger internal alerts. By coupling the monitoring system with the **Plugin Architecture**, these alerts can be pushed to external channels (e.g., a DevOps Telegram group via the Telegram plugin).

## UI Error Highlighting (Server-Side Linting) — Planned

> [!NOTE]
> ESLint is in `devDependencies` but the API endpoint and UI overlay are not yet implemented.

To maintain a lightweight UI bundle without pulling in heavy tools like ESLint to the browser, the Agent Portal will implement **Server-Side Linting for IDE parity**:
1. **Backend Integration**: A minimal `/api/lint-file` endpoint will run Node.js-based ESLint directly against the local file system. This ensures the UI uses the exact same flat config (`eslint.config.js`) that the IDE and `npm run lint` use.
2. **UI Component (`code-block.js`)**: The frontend will fetch the error arrays asynchronously and render absolutely positioned overlay markers (squiggles/tooltips) over the highlighted source code.

## Roadmap

Implementation phases in strict execution order. Each phase depends on the previous one being complete.



### Phase 1 — Portal Core Stabilization

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

### Phase 2 — CLI Adapter Pool

Implement the heterogeneous agent pool:

| # | Task | Scope |
|---|------|-------|
| 2.1 | **`src/adapters/` directory** | Create with `index.js` registry (plain-object `resolveAdapter()` pattern) |
| 2.2 | **gemini-adapter** | Port from `agent-pool-mcp` — `gemini` CLI wrapper |
| 2.3 | **claude-adapter** | Port from `agent2agent` — `claude-code` CLI wrapper |
| 2.4 | **opencode-adapter** | Port from `agicoder` — OpenCode/Crush MCP host |
| 2.5 | **AdapterPool** | `acquire(type)` / `release()` lifecycle, capacity limits from config |
| 2.6 | **AgentChat integration** | Wire `AgentChat` panel to use `AdapterPool` instead of direct API calls |

**Deliverable**: Agent chat works with multiple LLM backends. Config `adapters` section is functional.

---

### Phase 3 — Plugin System

External integrations via loosely coupled plugins:

| # | Task | Scope |
|---|------|-------|
| 3.1 | **Plugin loader** | Scan `plugins/` directory, load and register plugins at startup |
| 3.2 | **Plugin interface** | `{ name, init(portal), destroy() }` — portal injects API surface |
| 3.3 | **Telegram plugin** | Port and adapt `telegram-llm-bot` as first reference plugin |
| 3.4 | **Error alerting via plugins** | Connect Observability alerts → plugin dispatch (Telegram, Slack) |

**Deliverable**: Working Telegram bot that routes messages through Portal's adapter pool. Error alerts in Telegram.

---

### Phase 4 — Distributed Mode

Multi-node topology (client/master):

| # | Task | Scope |
|---|------|-------|
| 4.1 | **CLI argument parsing** | `--connect`, `--master` flags in `index.js` |
| 4.2 | **`src/discovery/`** | WebSocket client for connecting to master node |
| 4.3 | **Master aggregation** | Extend `MCPMultiplexer` to accept remote tool registrations |
| 4.4 | **Topology panel** | New `#topology` section — network visualization of connected nodes |

**Deliverable**: IDE on machine A uses tools from machine B transparently.

---

### Phase 5 — Marketplace & Public Registry

| # | Task | Scope |
|---|------|-------|
| 5.1 | **Add/remove servers via UI** | Marketplace edits `agent-portal.json` + triggers exit(2) restart |
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
