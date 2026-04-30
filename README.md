[![npm version](https://img.shields.io/npm/v/mcp-agent-portal)](https://www.npmjs.com/package/mcp-agent-portal)
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

## Features

- **MCP Aggregation** — unified `tools/list`, `resources/list`, `prompts/list` from all child servers
- **Web Dashboard** — 10 panels: Marketplace, AI Chat, Graph, Code Explorer, Topology, Monitor, and more
- **Agent Pool** — heterogeneous CLI adapters (Gemini, Claude, OpenCode) running in parallel
- **Plugin System** — external integrations (Telegram, Slack, GitHub) with alert dispatch
- **Distributed Mode** — master/client topology via WebSocket for multi-machine tool sharing
- **Auto-Restart** — crashed child processes respawn with exponential backoff
- **Local Gateway** — `portal.local` DNS-like service discovery for all projects

## Quick Start

**Prerequisites:** Node.js >= 20.

Add to your IDE's MCP configuration:

```json
{
  "mcpServers": {
    "agent-portal": {
      "command": "npx",
      "args": ["-y", "mcp-agent-portal"]
    }
  }
}
```

That's it. On the next IDE restart the portal will download itself, spawn its child servers, and expose all tools.

> [!TIP]
> The portal replaces individual `project-graph-mcp` and `agent-pool-mcp` entries in your MCP config — you only need this single entry.

<details>
<summary>Where is my MCP config file?</summary>

| IDE | Config path |
|-----|------------|
| Antigravity | `~/.gemini/antigravity/mcp_config.json` |
| Gemini CLI | `~/.gemini/settings.json` |
| Cursor | `.cursor/mcp.json` |
| Windsurf | `.windsurf/mcp.json` |
| Claude Code | Run: `claude mcp add agent-portal npx -y mcp-agent-portal` |

</details>

### CLI

```bash
npx mcp-agent-portal                  # Start MCP stdio server (IDE mode)
npx mcp-agent-portal config           # Generate MCP config for your IDE
npx mcp-agent-portal status           # Show servers, adapters, config
npx mcp-agent-portal help             # All commands
```

### Configuration

Optionally create `~/.gemini/agent-portal.json` to customize child servers and adapters:

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

### Operating Modes

```bash
npx mcp-agent-portal                       # standalone (default)
npx mcp-agent-portal --master              # master — aggregates remote clients
npx mcp-agent-portal --connect wss://...   # client — joins a master node
```

| Mode | What it does |
|------|-------------|
| **Standalone** | Spawns local child MCP servers, serves web UI, provides stdio MCP to IDE |
| **Client** | Connects to a master via WebSocket, registers its local tools |
| **Master** | Aggregates tools from local children AND remote client nodes |

## MCP Ecosystem

Agent Portal aggregates the RND-PRO MCP ecosystem:

| Server | Description | Status |
|--------|-------------|--------|
| [project-graph-mcp](https://npmjs.com/package/project-graph-mcp) | AST-based codebase analysis, navigation, documentation | ✅ Production |
| [agent-pool-mcp](https://npmjs.com/package/agent-pool-mcp) | Multi-agent delegation, pipelines, scheduling, peer review | ✅ Production |
| browser-x-mcp | Browser automation, form testing | 🟡 Beta |
| terminal-x-mcp | Multi-terminal automation with security validation | 🔴 Alpha |
| context-x-mcp | Context enrichment with auto-topic detection | 🔴 Alpha |

### Local Development

```bash
git clone https://github.com/rnd-pro/mcp-agent-portal
cd mcp-agent-portal
npm install
node index.js
```

## Related Projects

- [project-graph-mcp](https://github.com/rnd-pro/project-graph-mcp) — AST-based codebase analysis for AI agents
- [agent-pool-mcp](https://github.com/rnd-pro/agent-pool-mcp) — Multi-agent orchestration via Gemini CLI
- [Symbiote.js](https://github.com/symbiotejs/symbiote.js) — Isomorphic Reactive Web Components framework
- [symbiote-node](https://github.com/RND-PRO/symbiote-node) — Studio UX framework with node graph editor

## License

MIT © [RND-PRO.com](https://rnd-pro.com)

---

**Made with ❤️ by the RND-PRO team**
