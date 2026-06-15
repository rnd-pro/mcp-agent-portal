[![npm version](https://img.shields.io/npm/v/mcp-agent-portal)](https://www.npmjs.com/package/mcp-agent-portal)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)

# mcp-agent-portal

**Unified MCP aggregator + AI agent runtime.** A single MCP server exposes Agent Portal orchestration tools and selected public child MCP tools. Internal execution servers such as `agent-pool-mcp` stay behind Agent Portal while the dashboard provides visual management, agent chat, and live monitoring.

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
 project  agent    browser        ← Child MCP servers
 -graph   -pool    -x-mcp           (stdio, auto-spawned)
```

> [!TIP]
> Add one entry to your MCP config and use Agent Portal as the orchestration gateway. Public child tools are discoverable through the gateway; Agent Pool is reserved for Agent Portal's own chat/task execution path.

## Current MCP Surface

Agent Portal is the public orchestration entrypoint. External MCP clients use
portal tools such as `create_chat`, `resume_chat`, `get_chat_task_result`,
`get_orchestrator_status`, and `get_development_map`; raw Agent Pool tools stay
internal to the portal runtime and are blocked from public discovery and
`call_tool`.

`get_development_map` returns the safe orchestration map used by the UI and
MCP responses: `subagentMap`, `activityMap`, `taskMap`, `toolMap`,
`latestTools`, usage totals, liveness, task-state errors, compatibility
`promptHints` strings, and structured `promptHintMap` suggestions. The latest
live MCP smoke for the symbiote-workspace backend exposed 51 public tools with
`get_development_map` present and raw Agent Pool tools absent.

### Singleton Architecture

Agent Portal runs as a **detached singleton backend** to prevent resource exhaustion when opening multiple IDE windows.

```
IDE Window 1 (~/project-a) ──stdio──┐      ┌───────────────────────┐
IDE Window 2 (~/project-b) ──stdio──┼─WS──▶│ Singleton Backend     │
IDE Window 3 (~/project-c) ──stdio──┘      │ (detached process)    │
                                            │                       │
                                            │ Dashboard Tabs:       │
                                            │  [project-a] [b] [c]  │
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

- **MCP Gateway** — unified Agent Portal tools plus selected public child tools from one MCP entry
- **Development Map** — orchestration responses include a bounded subagent map, task timings, latest tool usage with exact or estimated timing, runtime usage, task-state errors, and prompt hints
- **Web Dashboard** — extensible project and home sections for Agent Chat, Skills, Graph, Runtime, Settings, Marketplace, Topology, and workflow operations
- **Internal Agent Runtime** — Agent Portal runs heterogeneous CLI adapters (Antigravity, Claude, Codex, OpenCode) behind portal-owned chat orchestration
- **Plugin System** — external integrations (Telegram, Slack, GitHub) with alert dispatch
- **Distributed Mode** — master/client topology via WebSocket for multi-machine tool sharing
- **Auto-Restart** — crashed child processes respawn with exponential backoff
- **Workspace Auto-Discovery** — each IDE connection auto-registers its workspace as a project tab in the dashboard
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

That's it. On the next IDE restart the portal will download itself, spawn its child servers, and expose Agent Portal orchestration plus public child tools.

> [!TIP]
> The portal replaces individual MCP entries. `agent-pool-mcp` stays internal to Agent Portal; external clients use portal chat tools such as `create_chat` and `resume_chat`.

<details>
<summary>Where is my MCP config file?</summary>

| IDE | Config path |
|-----|------------|
| Antigravity | `~/.gemini/config/mcp_config.json` |
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

Optionally create `~/.agent-portal/agent-portal.json` to customize child servers and adapters:

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
    "antigravity": { "type": "antigravity", "enabled": true, "maxInstances": 5 },
    "claude": { "type": "claude-code", "enabled": false, "maxInstances": 2 }
  }
}
```

### Claude Gateway

Agent Portal can expose an Anthropic-compatible gateway for Claude Code at `/anthropic`. This lets Claude Code run against OpenAI-compatible backends such as DeepSeek V4 while keeping Claude Code's local tools in Claude Code.

```json
{
  "anthropicGateway": {
    "enabled": true,
    "authToken": "local-token",
    "defaultModel": "deepseek-v4-flash",
    "plannerModel": "deepseek-v4-pro",
    "providers": {
      "deepseek": {
        "type": "anthropic-compatible",
        "baseUrl": "https://api.deepseek.com/anthropic",
        "apiKeyEnv": "DEEPSEEK_API_KEY",
        "models": ["deepseek-v4-flash", "deepseek-v4-pro"]
      }
    }
  }
}
```

Then set `DEEPSEEK_API_KEY`. When this gateway is enabled, Agent Pool's `provider: "claude"` runner injects `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` automatically for spawned Claude Code workers.

### XR Diagnostics

Agent Portal serves WebXR diagnostic pages for headset testing. The reusable XR capability, panel, theme, and HTML-in-Canvas contracts live in `symbiote-ui/xr`; Agent Portal only supplies product routes and server configuration.

For browser builds that require the HTML-in-Canvas origin trial, set `AGENT_PORTAL_HTML_IN_CANVAS_ORIGIN_TRIAL_TOKEN` in the runtime environment. Static HTML responses will include it as an HTTP `Origin-Trial` header and expose only non-secret boolean diagnostics to the page and `/api/xr-diagnostics/*` logs.

The production XR demo URL is `https://playground.rnd-pro.com/demos/agent-portal-vr/#spatial?project=agent-portal&target=graph&texture=strict`. It must render through `SpatialLayout` and post production `symbiote-ui/xr` diagnostics. Strict live-texture readiness and WebXR session launch stay separated: the app may enter an immersive session for headset/session diagnostics, but strict mode must hide untextured panels and report the exact HTML-in-Canvas blocker instead of showing empty or material-fallback panels as production UI. The Quest production path is AR-only while headset texture timing is being stabilized, so `SpatialLayout` requests `immersive-ar` directly instead of switching between Auto, AR, and VR. The `xr-three-panels-baseline.html`, `xr-panels-baseline.html`, and `xr-htmltexture-minimal.html` pages are diagnostic harnesses only; they are not production demo UI.

Use `npm run xr:production-smoke` for the local production route gate and `npm run xr:three-smoke` only for the Three/WebXR harness. Public headset debugging starts after the public production smoke confirms the deployed route is current.

Quest pre-headset gate:

```bash
npm run xr:production-smoke -- --base-url https://playground.rnd-pro.com/demos/agent-portal-vr --no-start-server
```

The expected public pre-headset status is:

- URL: `https://playground.rnd-pro.com/demos/agent-portal-vr/#spatial?project=agent-portal&target=graph&texture=strict`
- `stage`: `production-spatial-ready`
- `nextAction`: `production-spatial-diagnostics-ready`
- `Surface`: `production:spatial-layout`
- `Panel content`: `portal-runtime-layout`
- `Panels live`: `4/4`
- `XR texture mode`: `strict`
- `XR launch`: `probe:immersive-ar`
- `XR gate`: `ready`
- `Three diagnostic panels`: `0`
- `pageErrorCount`: `0`
- `strict-blocked-panels-hidden`: `pass`

When HTML-in-Canvas texture upload is unavailable on the checking browser, the expected strict-mode status is `XR texture gate: blocked:html-in-canvas-unsupported` with `Three rendered panels: 0/4`. That is a valid pre-headset diagnostic state: it proves the app is not presenting empty or material-fallback panels as production UI. Headset acceptance starts only after this gate passes; the headset run is then checked with `npm run xr:headset-wait -- --base-url https://playground.rnd-pro.com/demos/agent-portal-vr`.

### Public Demo Mode

Set `AGENT_PORTAL_DEMO_MODE=1` to serve Agent Portal against safe public data instead of private local workspaces. When `AGENT_PORTAL_PUBLIC_PROJECTS_ROOT` points at synchronized public repository snapshots, demo MCP `get_skeleton` responses expose allowlisted files plus import, export, line, and asset metadata. The graph and XR spatial views consume that same skeleton through the shared `graph-model-v1` pipeline, so public demos can show real project structure without exposing secrets, ignored directories, or local machine paths.

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

Agent Portal manages the RND-PRO MCP ecosystem. `project-graph-mcp`, `agent-pool-mcp`, and `.agent-portal` are part of the core local workspace; additional MCP servers are installed through the marketplace or local configuration. Public servers are discoverable through `discover_tools`; `agent-pool-mcp` is the internal execution runtime behind Agent Portal chat orchestration.

| Server | Description | Status |
|--------|-------------|--------|
| [project-graph-mcp](https://npmjs.com/package/project-graph-mcp) | AST-based codebase analysis, navigation, documentation | ✅ Production |
| [agent-pool-mcp](https://npmjs.com/package/agent-pool-mcp) | Internal execution runtime for Agent Portal chat orchestration, resource groups, pipelines, scheduling, and peer review | ✅ Production |
| `.agent-portal` skills | Project-local skills, agents, and workflows | ✅ Production |
| Optional marketplace MCP servers | Browser, terminal, SaaS, and domain tools configured per workspace | Configurable |

### Local Development

```bash
git clone --recurse-submodules https://github.com/rnd-pro/mcp-agent-portal
cd mcp-agent-portal
npm install
npm run build
npm start
```

`npm run build` creates the production browser bundle in `dist/web`. Normal MCP/server starts use that bundle when it is present and fall back to `web/` when it is not. Use `npm run dev` for source-module development against `web/`, or set `AGENT_PORTAL_WEB_ROOT` to serve an explicit UI directory in container builds.

If `.agent-portal` is configured as a private skills submodule, set its local remote before initializing submodules:

```bash
git config submodule..agent-portal.url <private-agent-portal-skills-remote>
git submodule update --init .agent-portal
git submodule update --init packages/agent-pool-mcp packages/project-graph-mcp
```

### Agent Portal Skills (`.agent-portal/`)

Agent Portal reads project-local skills, agents, and workflows from the `.agent-portal/` directory in your project root.

The skills directory can be configured as a private submodule. Set the private remote in local Git config before initializing it:

```bash
git config submodule..agent-portal.url <private-agent-portal-skills-remote>
git submodule update --init .agent-portal
```

See `.agent-portal/README.md` when project-local skills are installed.

## Related Projects

- [project-graph-mcp](https://github.com/rnd-pro/project-graph-mcp) — AST-based codebase analysis for AI agents
- [agent-pool-mcp](https://github.com/rnd-pro/agent-pool-mcp) — Internal execution runtime used by Agent Portal orchestration
- [Symbiote.js](https://github.com/symbiotejs/symbiote.js) — Isomorphic Reactive Web Components framework
- [symbiote-ui](https://github.com/RND-PRO/symbiote-ui) — Provider UI, graph, layout, XR, theme, and WebMCP contracts
- [symbiote-engine](https://github.com/RND-PRO/symbiote-engine) — Runtime execution, CLI, registry, persistence, and handlers

## License

MIT © [RND-PRO.com](https://rnd-pro.com)

---

**Made with ❤️ by the RND-PRO team**
