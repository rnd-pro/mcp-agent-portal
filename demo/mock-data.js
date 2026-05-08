/**
 * mock-data.js — Rich fixture data for the Agent Portal demo.
 * Used by demo-adapter.js to serve realistic responses without a backend.
 */

// ── Projects ────────────────────────────────────────────────────

export const instances = [
  {
    name: 'project-graph-mcp',
    prefix: '/pg',
    command: 'node',
    args: ['packages/project-graph-mcp/index.js'],
    pid: 41200,
    color: '#4c8bf5',
    agents: 0,
    projectName: 'mcp-agent-portal',
    projectPath: '/home/dev/mcp-agent-portal',
  },
  {
    name: 'agent-pool-mcp',
    prefix: '/ap',
    command: 'node',
    args: ['packages/agent-pool-mcp/index.js'],
    pid: 41205,
    color: '#e8710a',
    agents: 2,
    projectName: 'mcp-agent-portal',
    projectPath: '/home/dev/mcp-agent-portal',
  },
  {
    name: 'context-x-mcp',
    prefix: '/cx',
    command: 'node',
    args: ['packages/context-x-mcp/index.js'],
    pid: 41210,
    color: '#34a853',
    agents: 0,
    projectName: 'mcp-agent-portal',
    projectPath: '/home/dev/mcp-agent-portal',
  },
  {
    name: 'browser-x-mcp',
    prefix: '/bx',
    command: 'node',
    args: ['packages/browser-x-mcp/index.js'],
    pid: 41215,
    color: '#9334e6',
    agents: 1,
    projectName: 'symbiote-video',
    projectPath: '/home/dev/symbiote-video',
  },
  {
    name: 'terminal-x-mcp',
    prefix: '/tx',
    command: 'node',
    args: ['packages/terminal-x-mcp/index.js'],
    pid: 41220,
    color: '#ea4335',
    agents: 0,
    projectName: '1sim-app',
    projectPath: '/home/dev/1sim-app',
  },
  {
    name: 'remote-client',
    prefix: '/rc',
    command: 'remote-client',
    args: ['gpu-worker.internal:9090'],
    pid: 41225,
    color: '#fbbc04',
    agents: 3,
    projectName: 'ml-pipeline',
    projectPath: '/home/dev/ml-pipeline',
  },
];

export const projectHistory = {
  projects: [
    {
      id: 'proj-portal',
      name: 'Agent Portal',
      path: '/home/dev/mcp-agent-portal',
      color: '#4c8bf5',
      lastOpened: Date.now() - 60_000,
    },
    {
      id: 'proj-pool',
      name: 'Agent Pool MCP',
      path: '/home/dev/mcp-agent-portal',
      color: '#e8710a',
      lastOpened: Date.now() - 3600_000,
    },
    {
      id: 'proj-graph',
      name: 'Project Graph MCP',
      path: '/home/dev/mcp-agent-portal',
      color: '#34a853',
      lastOpened: Date.now() - 7200_000,
    },
    {
      id: 'proj-node',
      name: 'Symbiote Node',
      path: '/home/dev/mcp-agent-portal',
      color: '#fbbc04',
      lastOpened: Date.now() - 86400_000,
    },
    {
      id: 'proj-context',
      name: 'Context X MCP',
      path: '/home/dev/mcp-agent-portal',
      color: '#9334e6',
      lastOpened: Date.now() - 172800_000,
    },
    {
      id: 'proj-browser',
      name: 'Browser X MCP',
      path: '/home/dev/mcp-agent-portal',
      color: '#00bcd4',
      lastOpened: Date.now() - 604800_000,
    },
    {
      id: 'proj-terminal',
      name: 'Terminal X MCP',
      path: '/home/dev/mcp-agent-portal',
      color: '#ea4335',
      lastOpened: Date.now() - 604800_000,
    },
  ],
  activeIds: ['proj-portal', 'proj-pool', 'proj-graph', 'proj-node'],
};

// ── Chats ────────────────────────────────────────────────────────

export const chats = [
  // ── Showcase chat: project overview with ALL message types ─────
  {
    id: 'chat-1',
    name: 'What is Agent Portal?',
    adapter: 'pool',
    provider: 'gemini',
    model: 'gemini-3.1-pro-preview',
    agent: 'orchestrator',
    createdAt: Date.now() - 7200_000,
    updatedAt: Date.now() - 1800_000,
    projectId: 'proj-portal',
    messages: [
      // 1. User asks about the project
      { role: 'user', text: 'Give me a comprehensive overview of Agent Portal — architecture, features, and how everything fits together.' },

      // 2. Thinking block with meta chips
      { role: 'thinking', elapsed: 8, done: true, status: 'Analyzing project structure…', meta: { mode: 'yolo', exitCode: 0, sessionId: 'demo-session-00000001', tools: 3, tokens: 6200, cost: 0.0186 } },

      // 3. Tool calls — research phase
      { role: 'tool', name: 'get_skeleton', input: { path: '/home/dev/mcp-agent-portal' }, result: '{\n  "project": "mcp-agent-portal",\n  "stats": { "files": 87, "functions": 234, "lines": 12450 },\n  "dirs": ["src/node/server/", "src/node/proxy/", "web/panels/", "web/services/", "packages/"]\n}' },
      { role: 'tool', name: 'analyze', input: { action: 'full_analysis', path: '/home/dev/mcp-agent-portal' }, result: '{\n  "totalFiles": 87,\n  "totalLines": 12450,\n  "avgComplexity": 3.1,\n  "topModules": ["web-server.js", "mcp-proxy.js", "AgentChat.js", "state-sync.js"],\n  "frameworks": ["Symbiote.js", "Node.js", "MCP SDK"]\n}' },
      { role: 'tool', name: 'navigate', input: { action: 'deps', symbol: 'startWebServer', path: '/home/dev/mcp-agent-portal' }, result: 'Dependencies of startWebServer:\n  → createRoutes (api-routes.js)\n  → MCPProxyManager (mcp-proxy.js)\n  → TaskRouter (task-router.js)\n  → BackendLifecycle (backend-lifecycle.js)\n  → LocalGateway (local-gateway.js)' },

      // 4. Agent: full project overview (injected from README.md at build time)
      { role: 'agent', text: "__README_CONTENT__" },

      // 5. User asks for delegation demo
      { role: 'user', text: 'Show me how the multi-agent delegation works.' },

      // 6. Delegate analysis tasks
      { role: 'tool', name: 'delegate_task', input: { prompt: 'Analyze the delegation architecture: task-router.js, agent-pool-mcp tools, and chat-ws-server.js', agent: 'researcher', timeout: 300 }, result: 'Task delegated → task-arch-analysis' },
      { role: 'tool', name: 'delegate_task', input: { prompt: 'Audit the Agent Chat UI: message types, rendering pipeline, live status indicators', agent: 'reviewer', timeout: 300 }, result: 'Task delegated → task-ui-audit' },

      // 7. Delegation board
      { role: 'board', taskIds: ['task-arch-analysis', 'task-ui-audit'], streaming: false },

      // 8. Thinking block (research complete)
      { role: 'thinking', elapsed: 34, done: true, meta: { mode: 'yolo', exitCode: 0, tools: 8, tokens: 18400, cost: 0.0552 } },

      // 9. Tool results
      { role: 'tool', name: 'get_task_result', input: { task_id: 'task-arch-analysis' }, result: '✅ Analysis complete:\n- TaskRouter dispatches to AdapterPool based on agent type\n- delegate_task creates isolated sub-agent sessions\n- Status tracked via StateGraph with WebSocket deltas\n- Zero-Zombie process groups ensure clean shutdown' },
      { role: 'tool', name: 'consult_peer', input: { question: 'What message types does AgentChat support?', context: 'Reviewing the UI rendering pipeline' }, result: '6 message types:\n1. user — text input\n2. agent — markdown with streaming cursor\n3. tool — collapsible cards with input/result\n4. thinking — elapsed time + meta chips (mode, tokens, cost)\n5. board — delegation cards with live status polling\n6. system — status notifications' },

      // 10. Final comprehensive response
      { role: 'agent', text: "## Multi-Agent Delegation Flow\n\nThe orchestrator delegates tasks to specialized sub-agents via `delegate_task`. Each sub-agent runs independently with its own CLI adapter:\n\n```\nOrchestrator (gemini-3.1-pro-preview)\n  ├── delegate_task → Coder (gemini-3.1-flash-lite-preview)\n  ├── delegate_task → Reviewer (claude-sonnet-4)\n  └── consult_peer → Research (deepseek-v4)\n```\n\nThe delegation board tracks each sub-task with live status updates. When all sub-agents complete, the orchestrator synthesizes their results.\n\n### Quick Start\n\nOne entry in your MCP config gives you access to every tool:\n\n```json\n{\n  \"mcpServers\": {\n    \"agent-portal\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"mcp-agent-portal\"]\n    }\n  }\n}\n```\n\n### Operating Modes\n\n| Mode | Description |\n|---|---|\n| **Standalone** | Spawns local child MCP servers, serves web UI, provides stdio MCP to IDE |\n| **Client** | Connects to a master via WebSocket, registers its local tools |\n| **Master** | Aggregates tools from local children AND remote client nodes |\n\n---\n\n*Built with [Symbiote.js](https://github.com/symbiotejs/symbiote.js) and the [symbiote-node](https://github.com/rnd-pro/symbiote-node) layout framework. MIT © [RND-PRO.com](https://rnd-pro.com)*" },

      // 11. System message
      { role: 'system', text: '⏱ Session completed in 42s · 2 sub-agents · 11 tool calls · $0.0738 total' },
    ],
  },

  // ── Chat 2: agent-pool-mcp overview (README injected at build) ──
  {
    id: 'chat-2',
    name: 'What is Agent Pool?',
    adapter: 'pool',
    provider: 'gemini',
    model: 'gemini-3.1-flash-lite-preview',
    agent: 'single',
    createdAt: Date.now() - 86400_000,
    updatedAt: Date.now() - 43200_000,
    projectId: 'proj-pool',
    messages: [
      { role: 'user', text: 'Describe the agent-pool-mcp package — what it does, its tools, and how delegation works.' },
      { role: 'thinking', elapsed: 6, done: true, meta: { tools: 2, tokens: 4800, cost: 0.0072 } },
      { role: 'tool', name: 'get_skeleton', input: { path: '/home/dev/mcp-agent-portal/packages/agent-pool-mcp' }, result: '{\n  "project": "agent-pool-mcp",\n  "stats": { "files": 32, "functions": 89, "lines": 4200 },\n  "dirs": ["src/runner/", "src/tools/", "src/adapters/"]\n}' },
      { role: 'agent', text: "__SUBREADME:packages/agent-pool-mcp/README.md__" },
    ],
  },

  // ── Chat 3: project-graph-mcp overview (README injected at build) ──
  {
    id: 'chat-3',
    name: 'What is Project Graph?',
    adapter: 'pool',
    provider: 'gemini',
    model: 'gemini-3.1-pro-preview',
    agent: 'single',
    createdAt: Date.now() - 172800_000,
    updatedAt: Date.now() - 172800_000,
    projectId: 'proj-graph',
    messages: [
      { role: 'user', text: 'Describe the project-graph-mcp package — AST analysis, tools, and how it provides codebase context.' },
      { role: 'thinking', elapsed: 5, done: true, meta: { tools: 2, tokens: 3600, cost: 0.0108 } },
      { role: 'tool', name: 'get_skeleton', input: { path: '/home/dev/mcp-agent-portal/packages/project-graph-mcp' }, result: '{\n  "project": "project-graph-mcp",\n  "stats": { "files": 28, "functions": 76, "lines": 3800 },\n  "dirs": ["src/analysis/", "src/tools/", "src/rules/"]\n}' },
      { role: 'agent', text: "__SUBREADME:packages/project-graph-mcp/README.md__" },
    ],
  },

  // ── Chat 4: symbiote-node overview (README injected at build) ──
  {
    id: 'chat-4',
    name: 'What is Symbiote Node?',
    adapter: 'pool',
    provider: 'gemini',
    model: 'gemini-3-pro-preview',
    agent: 'single',
    createdAt: Date.now() - 259200_000,
    updatedAt: Date.now() - 259200_000,
    projectId: 'proj-node',
    messages: [
      { role: 'user', text: 'Describe symbiote-node — the Studio UX framework, layout engine, and node graph system.' },
      { role: 'thinking', elapsed: 7, done: true, meta: { tools: 2, tokens: 5100, cost: 0.0153 } },
      { role: 'tool', name: 'get_skeleton', input: { path: '/home/dev/mcp-agent-portal/packages/symbiote-node' }, result: '{\n  "project": "symbiote-node",\n  "stats": { "files": 45, "functions": 128, "lines": 6200 },\n  "dirs": ["layout/", "canvas/", "node/", "inspector/", "engine/"]\n}' },
      { role: 'agent', text: "__SUBREADME:packages/symbiote-node/README.md__" },
    ],
  },

  // ── Chat 5: CI with YAML code block ──────────────────────────
  {
    id: 'chat-5',
    name: 'Setup CI pipeline',
    adapter: 'pool',
    provider: 'gemini',
    model: 'gemini-3.1-flash-lite-preview',
    agent: 'single',
    createdAt: Date.now() - 604800_000,
    updatedAt: Date.now() - 604800_000,
    projectId: 'proj-portal',
    messages: [
      { role: 'user', text: 'Create a GitHub Actions CI pipeline that runs tests on PR and deploys on merge to main.' },
      { role: 'thinking', elapsed: 8, done: true, meta: { tools: 2, tokens: 5600, cost: 0.0168 } },
      { role: 'agent', text: "Created `.github/workflows/ci.yml` with:\n\n```yaml\non:\n  pull_request:\n    branches: [main]\n  push:\n    branches: [main]\n\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n      - run: npm ci\n      - run: npm test\n\n  deploy:\n    needs: test\n    if: github.ref == 'refs/heads/main'\n    # ... deployment steps\n```\n\nThe pipeline runs unit + integration tests on every PR, and deploys to production only on merge to main." },
    ],
  },

  // ── Chat 6: ML pipeline with error state ─────────────────────
  {
    id: 'chat-6',
    name: 'Fix training data loader',
    adapter: 'pool',
    provider: 'gemini',
    model: 'gemini-3.1-pro-preview',
    agent: 'single',
    createdAt: Date.now() - 432000_000,
    updatedAt: Date.now() - 432000_000,
    projectId: 'proj-ml',
    messages: [
      { role: 'user', text: 'The data loader crashes on large CSV files (>2GB). Getting OOM errors.' },
      { role: 'thinking', elapsed: 5, done: true, meta: { mode: 'normal', exitCode: 0, tools: 3, tokens: 4100 } },
      { role: 'tool', name: 'compact', input: { action: 'compact_file', path: '/home/dev/ml-pipeline/src/loader.py' }, result: 'def load_csv(path):\n    # Reads entire file into memory\n    df = pd.read_csv(path)\n    return df.to_numpy()' },
      { role: 'agent', text: "Found the root cause: `pd.read_csv()` loads the **entire file into memory**.\n\n### Fix: Chunked streaming loader\n\n```python\ndef load_csv(path, chunk_size=50_000):\n    for chunk in pd.read_csv(path, chunksize=chunk_size):\n        yield chunk.to_numpy()\n```\n\nThis reduces peak memory from **O(n)** to **O(chunk_size)**, allowing processing of arbitrarily large files.\n\n> ⚠️ Downstream consumers need to handle the generator interface instead of a single array." },
      { role: 'system', text: '✅ Fix applied and verified. Memory usage stable at ~200MB for a 4GB test file.' },
    ],
  },
];

export function getChatById(id) {
  return chats.find((c) => c.id === id) || null;
}

// ── Skeleton ─────────────────────────────────────────────────────

export const skeleton = {
  project: { name: 'mcp-agent-portal', path: '/home/dev/mcp-agent-portal' },
  n: {
    'startWebServer': { f: 'src/node/server/web-server.js', l: 136 },
    'MCPProxyManager': { f: 'src/node/proxy/mcp-proxy.js', l: 15 },
    'createRoutes': { f: 'src/node/server/api-routes.js', l: 8 },
    'AgentChat': { f: 'web/panels/AgentChat/AgentChat.js', l: 31 },
    'ActionBoard': { f: 'web/panels/ActionBoard/ActionBoard.js', l: 7 },
    'ProjectList': { f: 'web/panels/ProjectList/ProjectList.js', l: 7 },
    'TopologyPanel': { f: 'web/panels/Topology/TopologyPanel.js', l: 7 },
    'ToolExplorer': { f: 'web/panels/ToolExplorer/ToolExplorer.js', l: 6 },
    'ChatWsClient': { f: 'web/services/chat-ws-client.js', l: 5 },
    'stateSync': { f: 'web/state-sync.js', l: 205 },
    'registerSection': { f: 'web/router-registry.js', l: 56 },
  },
  f: {
    "./": [
      ".cursorrules",
      ".gitignore",
      ".gitmodules",
      ".project-graph-cache.json",
      ".windsurfrules",
      "ARCHITECTURE.md",
      "README.md",
      "error.txt",
      "eslint.config.js",
      "index.js",
      "logs.txt",
      "notify.log",
      "output.txt",
      "package.json",
      "patch.js"
    ],
    ".context/.cache/": [
      "eslint.config.json",
      "fix-templates.json",
      "index.json",
      "test-gemini-auth.json",
      "test-graph.json",
      "test-mcp-bun.json",
      "test-mcp-spawn.json",
      "test-mcp.json",
      "test-pool-result.json",
      "test-pool-workflow-long.json",
      "test-pool-workflow.json",
      "test-pool.json",
      "test-projects.json",
      "test-puppeteer-network.json",
      "test-puppeteer.json",
      "test-stats.json"
    ],
    ".context/.cache/bin/": [
      "mcp-agent-portal.json"
    ],
    ".context/.cache/packages/agent-pool-mcp/": [
      "index.json"
    ],
    ".context/.cache/packages/agent-pool-mcp/src/": [
      "cli.json",
      "server.json",
      "tool-definitions.json"
    ],
    ".context/.cache/packages/agent-pool-mcp/src/agents/": [
      "agent-resolver.json"
    ],
    ".context/.cache/packages/agent-pool-mcp/src/runner/": [
      "config.json",
      "gemini-runner.json",
      "history-cleanup.json",
      "opencode-runner.json",
      "process-manager.json",
      "provider-config.json",
      "ssh.json",
      "timeout-manager.json",
      "url-resolver.json"
    ],
    ".context/.cache/packages/agent-pool-mcp/src/scheduler/": [
      "cron.json",
      "daemon.json",
      "pipeline.json",
      "resolve-content.json",
      "run-signals.json",
      "scheduler.json"
    ],
    ".context/.cache/packages/agent-pool-mcp/src/tools/": [
      "agents.json",
      "board-store.json",
      "consult.json",
      "groups.json",
      "markdown-parser.json",
      "messaging.json",
      "results.json",
      "scripts.json",
      "skills.json"
    ],
    ".context/.cache/packages/context-x-mcp/src/": [
      "config.json",
      "file-tracker.json",
      "git-sync.json",
      "mcp-server.json",
      "script-store.json",
      "workflow-index.json"
    ],
    ".context/.cache/packages/project-graph-mcp/src/analysis/": [
      "analysis-cache.json",
      "complexity.json",
      "custom-rules.json",
      "db-analysis.json",
      "dead-code.json",
      "full-analysis.json",
      "jsdoc-checker.json",
      "jsdoc-generator.json",
      "large-files.json",
      "outdated-patterns.json",
      "similar-functions.json",
      "test-annotations.json",
      "type-checker.json",
      "undocumented.json"
    ],
    ".context/.cache/packages/project-graph-mcp/src/cli/": [
      "cli-handlers.json",
      "cli.json"
    ],
    ".context/.cache/packages/project-graph-mcp/src/compact/": [
      "ai-context.json",
      "compact-migrate.json",
      "compact.json",
      "compress.json",
      "ctx-resolver.json",
      "ctx-to-jsdoc.json",
      "doc-dialect.json",
      "expand.json",
      "framework-references.json",
      "instructions.json",
      "jsdoc-builder.json",
      "mode-config.json",
      "split-declarations.json",
      "validate-pipeline.json"
    ],
    ".context/.cache/packages/project-graph-mcp/src/core/": [
      "event-bus.json",
      "file-walker.json",
      "filters.json",
      "graph-builder.json",
      "parser.json",
      "utils.json",
      "workspace.json"
    ],
    ".context/.cache/packages/project-graph-mcp/src/lang/": [
      "lang-go.json",
      "lang-python.json",
      "lang-sql.json",
      "lang-typescript.json",
      "lang-utils.json"
    ],
    ".context/.cache/packages/project-graph-mcp/src/mcp/": [
      "mcp-server.json",
      "tool-defs.json",
      "tools.json"
    ],
    ".context/.cache/packages/project-graph-mcp/src/network/": [
      "backend-lifecycle.json",
      "server.json"
    ],
    ".context/.cache/packages/project-graph-mcp/tests/": [
      "check_canvas.json",
      "check_errors.json",
      "perf-graph-scale.json",
      "temp_debug.json"
    ],
    ".context/.cache/packages/project-graph-mcp/tests/lib/": [
      "asserts.json",
      "fixture.json",
      "mcp-client.json"
    ],
    ".context/.cache/packages/symbiote-node/": [
      "index.json"
    ],
    ".context/.cache/packages/symbiote-node/canvas/": [
      "AutoLayout.json",
      "CanvasConnectionRenderer.json",
      "CanvasViewport.json",
      "ConnectionRenderer.json",
      "FlowSimulator.json",
      "ForceLayout.json",
      "ForceWorker.json",
      "FrameManager.json",
      "LODManager.json",
      "NodeViewManager.json",
      "PinExpansion.json",
      "PseudoConnection.json",
      "SelectionSync.json",
      "SubgraphManager.json",
      "SubgraphRouter.json",
      "ViewportActions.json"
    ],
    ".context/.cache/packages/symbiote-node/canvas/Breadcrumb/": [
      "Breadcrumb.json"
    ],
    ".context/.cache/packages/symbiote-node/canvas/GraphTabs/": [
      "GraphTabs.json"
    ],
    ".context/.cache/packages/symbiote-node/canvas/Minimap/": [
      "Minimap.json"
    ],
    ".context/.cache/packages/symbiote-node/canvas/NodeCanvas/": [
      "NodeCanvas.json"
    ],
    ".context/.cache/packages/symbiote-node/canvas/NodeSearch/": [
      "NodeSearch.json"
    ],
    ".context/.cache/packages/symbiote-node/core/": [
      "Connection.json",
      "Editor.json",
      "Frame.json",
      "GraphMermaid.json",
      "GraphText.json",
      "Node.json",
      "Portal.json",
      "Socket.json",
      "SubgraphNode.json"
    ],
    ".context/.cache/packages/symbiote-node/demo/": [
      "benchmark.json",
      "demo.json"
    ],
    ".context/.cache/packages/symbiote-node/demo/AiChat/": [
      "AiChat.json"
    ],
    ".context/.cache/packages/symbiote-node/demo/EventLog/": [
      "EventLog.json"
    ],
    ".context/.cache/packages/symbiote-node/engine/": [
      "AgentUICommands.json",
      "Executor.json",
      "Graph.json",
      "GraphServer.json",
      "HandlerLoader.json",
      "History.json",
      "Lifecycle.json",
      "Persistence.json",
      "Registry.json",
      "SocketTypes.json",
      "cli.json",
      "index.json",
      "nanoid.json"
    ],
    ".context/.cache/packages/symbiote-node/engine/extensions/grok-bridge/": [
      "background.json",
      "content.json",
      "sidepanel.json",
      "websocket-interceptor.json"
    ],
    ".context/.cache/packages/symbiote-node/engine/packs/": [
      "video-pack.json"
    ],
    ".context/.cache/packages/symbiote-node/engine/packs/ai/": [
      "beat-detect.handler.json",
      "content-adapt.handler.json",
      "face-detect.handler.json",
      "grok-generate.handler.json",
      "kling-lipsync.handler.json",
      "lesson-generate.handler.json",
      "opencode.handler.json",
      "replicate-lipsync.handler.json",
      "tts.handler.json",
      "whisper.handler.json"
    ],
    ".context/.cache/packages/symbiote-node/engine/packs/data/": [
      "db-query.handler.json",
      "news-accumulate.handler.json",
      "personas.handler.json",
      "prompt-loader.handler.json",
      "roles.handler.json",
      "rss-feed.handler.json"
    ],
    ".context/.cache/packages/symbiote-node/engine/packs/debug/": [
      "inject.handler.json"
    ],
    ".context/.cache/packages/symbiote-node/engine/packs/flow/": [
      "agent.handler.json",
      "if.handler.json",
      "loop.handler.json",
      "merge.handler.json",
      "retry.handler.json",
      "switch.handler.json",
      "wait-all.handler.json"
    ],
    ".context/.cache/packages/symbiote-node/engine/packs/io/": [
      "http-request.handler.json",
      "read-file.handler.json",
      "write-file.handler.json"
    ],
    ".context/.cache/packages/symbiote-node/engine/packs/transform/": [
      "anchor-match.handler.json",
      "effects-skeleton.handler.json",
      "json-parse.handler.json",
      "lipsync-select.handler.json",
      "riopla-adapt.handler.json",
      "set.handler.json",
      "template-builder.handler.json",
      "template.handler.json",
      "timeline-build.handler.json"
    ],
    ".context/.cache/packages/symbiote-node/engine/packs/util/": [
      "delay.handler.json",
      "log.handler.json"
    ],
    ".context/.cache/packages/symbiote-node/inspector/InspectorPanel/": [
      "InspectorPanel.json"
    ],
    ".context/.cache/packages/symbiote-node/inspector/TemplatePreview/": [
      "TemplatePreview.json"
    ],
    ".context/.cache/packages/symbiote-node/interactions/": [
      "ConnectFlow.json",
      "Drag.json",
      "Selector.json",
      "SnapGrid.json",
      "Zoom.json"
    ],
    ".context/.cache/packages/symbiote-node/layout/": [
      "LayoutTree.json",
      "index.json"
    ],
    ".context/.cache/packages/symbiote-node/layout/ActionZone/": [
      "ActionZone.json"
    ],
    ".context/.cache/packages/symbiote-node/layout/Layout/": [
      "Layout.json"
    ],
    ".context/.cache/packages/symbiote-node/layout/LayoutNode/": [
      "LayoutNode.json"
    ],
    ".context/.cache/packages/symbiote-node/layout/LayoutPreview/": [
      "LayoutPreview.json"
    ],
    ".context/.cache/packages/symbiote-node/layout/LayoutRouter/": [
      "LayoutRouter.json",
      "routerSync.json"
    ],
    ".context/.cache/packages/symbiote-node/layout/LayoutSidebar/": [
      "LayoutSidebar.json",
      "SidebarSection.json"
    ],
    ".context/.cache/packages/symbiote-node/layout/PanelMenu/": [
      "PanelMenu.json"
    ],
    ".context/.cache/packages/symbiote-node/menu/ContextMenu/": [
      "ContextMenu.json"
    ],
    ".context/.cache/packages/symbiote-node/node/CtrlItem/": [
      "CtrlItem.json"
    ],
    ".context/.cache/packages/symbiote-node/node/GraphFrame/": [
      "GraphFrame.json"
    ],
    ".context/.cache/packages/symbiote-node/node/GraphNode/": [
      "GraphNode.json"
    ],
    ".context/.cache/packages/symbiote-node/node/NodeSocket/": [
      "NodeSocket.json"
    ],
    ".context/.cache/packages/symbiote-node/node/PortItem/": [
      "PortItem.json"
    ],
    ".context/.cache/packages/symbiote-node/palette/PaletteBrowser/": [
      "PaletteBrowser.json"
    ],
    ".context/.cache/packages/symbiote-node/plugins/": [
      "History.json",
      "Readonly.json"
    ],
    ".context/.cache/packages/symbiote-node/shapes/": [
      "CircleShape.json",
      "CommentShape.json",
      "DiamondShape.json",
      "NodeShape.json",
      "PillShape.json",
      "RectShape.json",
      "SVGShape.json",
      "index.json"
    ],
    ".context/.cache/packages/symbiote-node/themes/": [
      "Palette.json",
      "Skin.json",
      "Theme.json",
      "carbon.json",
      "dark.json",
      "ebook.json",
      "grey.json",
      "light.json",
      "neon.json",
      "pcb.json",
      "synthwave.json"
    ],
    ".context/.cache/packages/symbiote-node/toolbar/QuickToolbar/": [
      "QuickToolbar.json"
    ],
    ".context/.cache/src/node/": [
      "config-store.json",
      "memory-store.json",
      "state-graph.json"
    ],
    ".context/.cache/src/node/adapters/": [
      "base.json",
      "claude.json",
      "gemini.json",
      "index.json",
      "pool.json",
      "stubs.json"
    ],
    ".context/.cache/src/node/agents/": [
      "agent-parser.json"
    ],
    ".context/.cache/src/node/discovery/": [
      "ws-client.json"
    ],
    ".context/.cache/src/node/gateways/": [
      "telegram.json"
    ],
    ".context/.cache/src/node/mlops/": [
      "flywheel.json",
      "trajectory-compressor.json"
    ],
    ".context/.cache/src/node/plugins/": [
      "plugin-loader.json"
    ],
    ".context/.cache/src/node/plugins/github/": [
      "index.json"
    ],
    ".context/.cache/src/node/plugins/slack/": [
      "index.json"
    ],
    ".context/.cache/src/node/plugins/telegram/": [
      "index.json"
    ],
    ".context/.cache/src/node/proxy/": [
      "chat-ws-server.json",
      "mcp-helpers.json",
      "mcp-http-handler.json",
      "mcp-multiplexer.json",
      "mcp-proxy.json",
      "task-router.json",
      "tool-index.json"
    ],
    ".context/.cache/src/node/server/": [
      "api-routes-projects.json",
      "api-routes.json",
      "backend-lifecycle.json",
      "backend.json",
      "context-injector.json",
      "lint-service.json",
      "local-gateway.json",
      "marketplace-registry.json",
      "mdns.json",
      "web-server.json"
    ],
    ".context/.cache/test/integration/": [
      "opencode-e2e.json"
    ],
    ".context/.cache/web/": [
      "WsClient.json",
      "app.json",
      "dashboard-state.json",
      "follow-controller.json",
      "highlight.json",
      "router-registry.json",
      "state-sync.json",
      "state.json",
      "stats-format.json"
    ],
    ".context/.cache/web/common/": [
      "icons.json",
      "mcp-call.json",
      "ui-dialogs.json"
    ],
    ".context/.cache/web/common/CellBg/": [
      "CellBg.json"
    ],
    ".context/.cache/web/components/": [
      "canvas-graph.json",
      "code-block.json",
      "follow-ribbon.json",
      "quick-open.json"
    ],
    ".context/.cache/web/components/AgentBoard/": [
      "AgentBoard.json"
    ],
    ".context/.cache/web/components/ChatSidebar/": [
      "ChatSidebar.json",
      "ChatSidebarItem.json"
    ],
    ".context/.cache/web/components/LoadingOverlay/": [
      "LoadingOverlay.json"
    ],
    ".context/.cache/web/components/PgWorkspace/": [
      "PgWorkspace.json"
    ],
    ".context/.cache/web/components/ProjectTabs/": [
      "ProjectTabs.json"
    ],
    ".context/.cache/web/components/event-feed/": [
      "CodeWidget.json",
      "EventWidget.json",
      "ListWidget.json",
      "MiniGraphWidget.json"
    ],
    ".context/.cache/web/panels/": [
      "code-viewer.json",
      "ctx-panel.json",
      "dep-graph.json",
      "file-tree.json",
      "health-panel.json",
      "live-monitor.json"
    ],
    ".context/.cache/web/panels/ActionBoard/": [
      "ActionBoard.json"
    ],
    ".context/.cache/web/panels/ActiveContext/": [
      "ActiveContext.json"
    ],
    ".context/.cache/web/panels/ActiveTasks/": [
      "ActiveTasks.json"
    ],
    ".context/.cache/web/panels/AgentChat/": [
      "AgentChat.json"
    ],
    ".context/.cache/web/panels/AgentEditorPanel/": [
      "AgentEditorPanel.json"
    ],
    ".context/.cache/web/panels/AgentListPanel/": [
      "AgentListItem.json",
      "AgentListPanel.json"
    ],
    ".context/.cache/web/panels/ChatList/": [
      "ChatList.json"
    ],
    ".context/.cache/web/panels/EventItem/": [
      "EventItem.json"
    ],
    ".context/.cache/web/panels/GroupManager/": [
      "GroupManager.json"
    ],
    ".context/.cache/web/panels/Marketplace/": [
      "Marketplace.json"
    ],
    ".context/.cache/web/panels/PeerReview/": [
      "PeerReview.json"
    ],
    ".context/.cache/web/panels/PipelineManager/": [
      "PipelineManager.json"
    ],
    ".context/.cache/web/panels/ProjectItem/": [
      "ProjectItem.json"
    ],
    ".context/.cache/web/panels/ProjectList/": [
      "ProjectList.json"
    ],
    ".context/.cache/web/panels/SettingsPanel/": [
      "SettingsPanel.json"
    ],
    ".context/.cache/web/panels/SkillLibraryPanel/": [
      "SkillLibraryPanel.json",
      "SkillListItem.json"
    ],
    ".context/.cache/web/panels/SkillManager/": [
      "SkillManager.json"
    ],
    ".context/.cache/web/panels/ToolExplorer/": [
      "ToolExplorer.json"
    ],
    ".context/.cache/web/panels/Topology/": [
      "TopologyPanel.json"
    ],
    ".context/.cache/web/panels/WorkflowExplorer/": [
      "WorkflowExplorer.json"
    ],
    ".context/.cache/web/services/": [
      "chat-autocomplete.json",
      "chat-ws-client.json",
      "skeleton-parser.json"
    ],
    ".context/.cache/web/utils/": [
      "graph-layout.json",
      "markdown-formatter.json"
    ],
    ".github/workflows/": [
      "demo.yml"
    ],
    "bin/": [
      "mcp-agent-portal.js"
    ],
    "coverage/": [
      "coverage-96250-1778163130850-0.json",
      "coverage-96251-1778163134188-0.json",
      "coverage-96252-1778163130871-0.json",
      "coverage-96253-1778163162259-0.json",
      "coverage-96254-1778163133520-0.json",
      "coverage-96255-1778163135013-0.json",
      "coverage-96256-1778163134143-0.json",
      "coverage-96287-1778163162251-0.json",
      "coverage-96318-1778163130996-0.json",
      "coverage-96319-1778163133625-0.json",
      "coverage-96320-1778163131065-0.json",
      "coverage-96492-1778163134192-0.json",
      "coverage-96523-1778163131093-0.json",
      "coverage-96589-1778163131383-0.json",
      "coverage-96655-1778163135000-0.json",
      "coverage-96656-1778163131310-0.json",
      "coverage-96687-1778163134120-0.json",
      "coverage-96743-1778163134743-0.json",
      "coverage-96795-1778163134541-0.json",
      "coverage-96845-1778163133898-0.json",
      "coverage-96871-1778163133607-0.json",
      "coverage-96894-1778163134343-0.json",
      "coverage-96895-1778163131561-0.json",
      "coverage-96938-1778163161810-0.json",
      "coverage-96940-1778163131986-0.json",
      "coverage-97018-1778163135219-0.json",
      "coverage-97151-1778163132291-0.json",
      "coverage-97293-1778163132223-0.json",
      "coverage-97378-1778163132562-0.json",
      "coverage-97472-1778163132856-0.json",
      "coverage-97602-1778163132923-0.json",
      "coverage-97603-1778163132989-0.json",
      "coverage-97604-1778163133600-0.json",
      "coverage-97635-1778163133109-0.json",
      "coverage-97666-1778163133174-0.json",
      "coverage-97697-1778163133246-0.json",
      "coverage-97728-1778163133312-0.json",
      "coverage-97759-1778163133401-0.json",
      "coverage-97792-1778163133493-0.json",
      "coverage-97824-1778163133584-0.json",
      "coverage-97825-1778163133623-0.json",
      "coverage-97826-1778163133710-0.json",
      "coverage-97827-1778163133725-0.json",
      "coverage-97828-1778163133743-0.json",
      "coverage-97830-1778163134092-0.json",
      "coverage-97833-1778163133849-0.json",
      "coverage-97834-1778163133931-0.json",
      "coverage-97836-1778163133996-0.json",
      "coverage-97839-1778163134069-0.json",
      "coverage-97918-1778163161921-0.json",
      "coverage-97949-1778163161999-0.json",
      "coverage-97980-1778163162080-0.json",
      "coverage-98011-1778163162165-0.json",
      "coverage-98042-1778163162244-0.json"
    ],
    "demo/": [
      "build.js",
      "demo-adapter.js",
      "index.html",
      "mock-data.js"
    ],
    "packages/agent-pool-mcp/": [
      ".git",
      ".gitignore",
      "ARCHITECTURE.md",
      "GUIDE.md",
      "LICENSE",
      "README.md",
      "index.js",
      "package.json"
    ],
    "packages/agent-pool-mcp/examples/": [
      "code-reviewer.md",
      "parallel-work.md",
      "research-analyst.md"
    ],
    "packages/agent-pool-mcp/policies/": [
      "read-only.yaml",
      "safe-edit.yaml",
      "single-agent.yaml"
    ],
    "packages/agent-pool-mcp/skills/": [
      "code-reviewer.md",
      "doc-fixer.md",
      "group-lead.md",
      "orchestrator.md",
      "test-writer.md"
    ],
    "packages/agent-pool-mcp/src/": [
      "cli.js",
      "server.js",
      "tool-definitions.js"
    ],
    "packages/agent-pool-mcp/src/agents/": [
      "agent-resolver.js"
    ],
    "packages/agent-pool-mcp/src/runner/": [
      "config.js",
      "gemini-runner.js",
      "history-cleanup.js",
      "opencode-runner.js",
      "process-manager.js",
      "provider-config.js",
      "ssh.js",
      "timeout-manager.js",
      "url-resolver.js"
    ],
    "packages/agent-pool-mcp/src/scheduler/": [
      "cron.js",
      "daemon.js",
      "pipeline.js",
      "resolve-content.js",
      "run-signals.js",
      "scheduler.js"
    ],
    "packages/agent-pool-mcp/src/tools/": [
      "agents.js",
      "board-store.js",
      "consult.js",
      "groups.js",
      "markdown-parser.js",
      "messaging.js",
      "results.js",
      "scripts.js",
      "skills.js"
    ],
    "packages/context-x-mcp/": [
      "package.json"
    ],
    "packages/context-x-mcp/src/": [
      "config.js",
      "file-tracker.js",
      "git-sync.js",
      "mcp-server.js",
      "script-store.js",
      "workflow-index.js"
    ],
    "packages/context-x-mcp/workflows/": [
      "test-integration-workflow.md"
    ],
    "packages/context-x-mcp/workflows/debug_protocol/": [
      "01-reproduce.md",
      "02-localize.md",
      "03-hypothesize.md",
      "04-verify-hypothesis.md",
      "05-fix.md",
      "06-verify-fix.md",
      "07-complete.md"
    ],
    "packages/context-x-mcp/workflows/meta/": [
      "skill-reflect.md"
    ],
    "packages/project-graph-mcp/": [
      ".git",
      ".gitignore",
      ".gitmodules",
      ".graphignore",
      ".npmignore",
      ".pgignore",
      ".project-graph-cache.json",
      "ARCHITECTURE.md",
      "CHANGELOG.md",
      "CONFIGURATION.md",
      "GUIDE.md",
      "LICENSE",
      "README.md",
      "package.json"
    ],
    "packages/project-graph-mcp/.context/": [
      "config.json",
      "project.ctx"
    ],
    "packages/project-graph-mcp/.context/src/analysis/": [
      "analysis-cache.ctx",
      "analysis-cache.ctx.md",
      "complexity.ctx",
      "complexity.ctx.md",
      "custom-rules.ctx",
      "custom-rules.ctx.md",
      "db-analysis.ctx",
      "db-analysis.ctx.md",
      "dead-code.ctx",
      "dead-code.ctx.md",
      "full-analysis.ctx",
      "full-analysis.ctx.md",
      "jsdoc-checker.ctx",
      "jsdoc-checker.ctx.md",
      "jsdoc-generator.ctx",
      "jsdoc-generator.ctx.md",
      "large-files.ctx",
      "large-files.ctx.md",
      "outdated-patterns.ctx",
      "outdated-patterns.ctx.md",
      "similar-functions.ctx",
      "similar-functions.ctx.md",
      "test-annotations.ctx",
      "test-annotations.ctx.md",
      "type-checker.ctx",
      "type-checker.ctx.md",
      "undocumented.ctx",
      "undocumented.ctx.md"
    ],
    "packages/project-graph-mcp/.context/src/cli/": [
      "cli-handlers.ctx",
      "cli-handlers.ctx.md",
      "cli.ctx",
      "cli.ctx.md"
    ],
    "packages/project-graph-mcp/.context/src/compact/": [
      "ai-context.ctx",
      "ai-context.ctx.md",
      "compact-migrate.ctx",
      "compact-migrate.ctx.md",
      "compact.ctx",
      "compact.ctx.md",
      "compress.ctx",
      "compress.ctx.md",
      "ctx-resolver.ctx",
      "ctx-to-jsdoc.ctx",
      "ctx-to-jsdoc.ctx.md",
      "doc-dialect.ctx",
      "doc-dialect.ctx.md",
      "expand.ctx",
      "expand.ctx.md",
      "framework-references.ctx",
      "framework-references.ctx.md",
      "instructions.ctx",
      "instructions.ctx.md",
      "jsdoc-builder.ctx",
      "mode-config.ctx",
      "mode-config.ctx.md",
      "split-declarations.ctx",
      "split-declarations.ctx.md",
      "validate-pipeline.ctx",
      "validate-pipeline.ctx.md"
    ],
    "packages/project-graph-mcp/.context/src/core/": [
      "event-bus.ctx",
      "event-bus.ctx.md",
      "file-walker.ctx",
      "filters.ctx",
      "filters.ctx.md",
      "graph-builder.ctx",
      "graph-builder.ctx.md",
      "parser.ctx",
      "parser.ctx.md",
      "utils.ctx",
      "workspace.ctx",
      "workspace.ctx.md"
    ],
    "packages/project-graph-mcp/.context/src/lang/": [
      "lang-go.ctx",
      "lang-go.ctx.md",
      "lang-python.ctx",
      "lang-python.ctx.md",
      "lang-sql.ctx",
      "lang-sql.ctx.md",
      "lang-typescript.ctx",
      "lang-typescript.ctx.md",
      "lang-utils.ctx",
      "lang-utils.ctx.md"
    ],
    "packages/project-graph-mcp/.context/src/mcp/": [
      "mcp-server.ctx",
      "mcp-server.ctx.md",
      "tool-defs.ctx",
      "tools.ctx",
      "tools.ctx.md"
    ],
    "packages/project-graph-mcp/.context/src/network/": [
      "backend-lifecycle.ctx",
      "backend-lifecycle.ctx.md",
      "backend.ctx",
      "backend.ctx.md",
      "local-gateway.ctx",
      "local-gateway.ctx.md",
      "mdns.ctx",
      "mdns.ctx.md",
      "server.ctx",
      "web-server.ctx",
      "web-server.ctx.md"
    ],
    "packages/project-graph-mcp/.context/tests/": [
      "compact.test.ctx",
      "consolidated.test.ctx",
      "mcp.test.ctx",
      "orm.test.ctx",
      "parser.test.ctx",
      "roundtrip.test.ctx",
      "ws-monitor-test.ctx"
    ],
    "packages/project-graph-mcp/.context/web/": [
      "app.ctx",
      "app.ctx.md",
      "dashboard-state.ctx",
      "dashboard-state.ctx.md",
      "dashboard.ctx",
      "dashboard.ctx.md",
      "highlight.ctx",
      "highlight.ctx.md",
      "state.ctx",
      "state.ctx.md"
    ],
    "packages/project-graph-mcp/.context/web/components/": [
      "code-block.ctx",
      "code-block.ctx.md",
      "quick-open.ctx",
      "quick-open.ctx.md"
    ],
    "packages/project-graph-mcp/.context/web/panels/": [
      "code-viewer.ctx",
      "code-viewer.ctx.md",
      "ctx-panel.ctx",
      "ctx-panel.ctx.md",
      "dep-graph.ctx",
      "dep-graph.ctx.md",
      "file-tree.ctx",
      "file-tree.ctx.md",
      "health-panel.ctx",
      "health-panel.ctx.md",
      "live-monitor.ctx",
      "live-monitor.ctx.md"
    ],
    "packages/project-graph-mcp/.context/web/panels/ActionBoard/": [
      "ActionBoard.css.ctx",
      "ActionBoard.ctx",
      "ActionBoard.ctx.md",
      "ActionBoard.tpl.ctx"
    ],
    "packages/project-graph-mcp/.context/web/panels/EventItem/": [
      "EventItem.css.ctx",
      "EventItem.ctx",
      "EventItem.ctx.md",
      "EventItem.tpl.ctx"
    ],
    "packages/project-graph-mcp/.context/web/panels/ProjectItem/": [
      "ProjectItem.css.ctx",
      "ProjectItem.ctx",
      "ProjectItem.ctx.md",
      "ProjectItem.tpl.ctx"
    ],
    "packages/project-graph-mcp/.context/web/panels/ProjectList/": [
      "ProjectList.css.ctx",
      "ProjectList.ctx",
      "ProjectList.ctx.md",
      "ProjectList.tpl.ctx"
    ],
    "packages/project-graph-mcp/.context/web/panels/SettingsPanel/": [
      "SettingsPanel.css.ctx",
      "SettingsPanel.ctx",
      "SettingsPanel.ctx.md",
      "SettingsPanel.tpl.ctx"
    ],
    "packages/project-graph-mcp/docs/": [
      "AGENT_INSTRUCTIONS.md"
    ],
    "packages/project-graph-mcp/docs/examples/": [
      "AGENT_ROLE.md",
      "AGENT_ROLE_MINIMAL.md"
    ],
    "packages/project-graph-mcp/docs/img/": [
      "explorer-compact.jpg",
      "explorer-expanded.jpg"
    ],
    "packages/project-graph-mcp/rules/": [
      "express-5.json",
      "fastify-5.json",
      "nestjs-10.json",
      "nextjs-15.json",
      "node-22.json",
      "react-18.json",
      "react-19.json",
      "symbiote-2x.json",
      "symbiote-3x.json",
      "test-rules.json",
      "typescript-5.json",
      "vue-3.json"
    ],
    "packages/project-graph-mcp/scripts/": [
      "consumer-test.mjs",
      "fill-ctx-coverage.mjs",
      "fix-ctx-quality.mjs",
      "restore-ctx-params.mjs",
      "theater-test.mjs"
    ],
    "packages/project-graph-mcp/src/": [
      ".contextignore"
    ],
    "packages/project-graph-mcp/src/analysis/": [
      "analysis-cache.ctx",
      "analysis-cache.js",
      "complexity.ctx",
      "complexity.js",
      "custom-rules.ctx",
      "custom-rules.js",
      "db-analysis.ctx",
      "db-analysis.js",
      "dead-code.ctx",
      "dead-code.js",
      "full-analysis.ctx",
      "full-analysis.js",
      "jsdoc-checker.ctx",
      "jsdoc-checker.js",
      "jsdoc-generator.ctx",
      "jsdoc-generator.js",
      "large-files.ctx",
      "large-files.js",
      "outdated-patterns.ctx",
      "outdated-patterns.js",
      "similar-functions.ctx",
      "similar-functions.js",
      "test-annotations.ctx",
      "test-annotations.js",
      "type-checker.ctx",
      "type-checker.js",
      "undocumented.ctx",
      "undocumented.js"
    ],
    "packages/project-graph-mcp/src/cli/": [
      "cli-handlers.ctx",
      "cli-handlers.js",
      "cli.ctx",
      "cli.js"
    ],
    "packages/project-graph-mcp/src/compact/": [
      "ai-context.ctx",
      "ai-context.js",
      "compact-migrate.ctx",
      "compact-migrate.js",
      "compact.ctx",
      "compact.js",
      "compress.ctx",
      "compress.js",
      "ctx-resolver.ctx",
      "ctx-resolver.js",
      "ctx-to-jsdoc.ctx",
      "ctx-to-jsdoc.js",
      "doc-dialect.ctx",
      "doc-dialect.js",
      "expand.ctx",
      "expand.js",
      "framework-references.ctx",
      "framework-references.js",
      "instructions.ctx",
      "instructions.js",
      "jsdoc-builder.ctx",
      "jsdoc-builder.js",
      "mode-config.ctx",
      "mode-config.js",
      "split-declarations.ctx",
      "split-declarations.js",
      "validate-pipeline.ctx",
      "validate-pipeline.js"
    ],
    "packages/project-graph-mcp/src/core/": [
      "event-bus.ctx",
      "event-bus.js",
      "file-walker.ctx",
      "file-walker.js",
      "filters.ctx",
      "filters.js",
      "graph-builder.ctx",
      "graph-builder.js",
      "parser.ctx",
      "parser.js",
      "utils.ctx",
      "utils.js",
      "workspace.ctx",
      "workspace.js"
    ],
    "packages/project-graph-mcp/src/lang/": [
      "lang-go.ctx",
      "lang-go.js",
      "lang-python.ctx",
      "lang-python.js",
      "lang-sql.ctx",
      "lang-sql.js",
      "lang-typescript.ctx",
      "lang-typescript.js",
      "lang-utils.ctx",
      "lang-utils.js"
    ],
    "packages/project-graph-mcp/src/mcp/": [
      "mcp-server.ctx",
      "mcp-server.js",
      "tool-defs.ctx",
      "tool-defs.js",
      "tools.ctx",
      "tools.js"
    ],
    "packages/project-graph-mcp/src/network/": [
      "backend-lifecycle.ctx",
      "backend-lifecycle.js",
      "server.ctx",
      "server.js"
    ],
    "packages/project-graph-mcp/src/node/proxy/.context/": [
      "project.ctx"
    ],
    "packages/project-graph-mcp/tests/": [
      "check_canvas.js",
      "check_errors.js",
      "compact.test.js",
      "orm.test.js",
      "parser.test.js",
      "perf-graph-scale.js",
      "roundtrip.test.js",
      "temp_debug.js",
      "test_flat_edges.mjs"
    ],
    "packages/project-graph-mcp/tests/lib/": [
      "asserts.js",
      "fixture.js",
      "mcp-client.js"
    ],
    "packages/project-graph-mcp/tests/tmp-consumer-test/": [
      "package.json"
    ],
    "packages/project-graph-mcp/vendor/": [
      "acorn.mjs",
      "terser.mjs",
      "walk.mjs"
    ],
    "packages/symbiote-node/": [
      ".git",
      ".gitignore",
      ".npmignore",
      "CHANGELOG.md",
      "LICENSE",
      "README.md",
      "index.js",
      "package.json"
    ],
    "packages/symbiote-node/.agent/workflows/": [
      "symbiote-docs.md"
    ],
    "packages/symbiote-node/canvas/": [
      "AutoLayout.js",
      "CanvasConnectionRenderer.js",
      "CanvasViewport.js",
      "ConnectionRenderer.js",
      "FlowSimulator.js",
      "ForceLayout.js",
      "ForceWorker.js",
      "FrameManager.js",
      "LODManager.js",
      "NodeViewManager.js",
      "PinExpansion.js",
      "PseudoConnection.js",
      "SelectionSync.js",
      "SubgraphManager.js",
      "SubgraphRouter.js",
      "ViewportActions.js"
    ],
    "packages/symbiote-node/canvas/Breadcrumb/": [
      "Breadcrumb.css.js",
      "Breadcrumb.js",
      "Breadcrumb.tpl.js"
    ],
    "packages/symbiote-node/canvas/GraphTabs/": [
      "GraphTabs.css.js",
      "GraphTabs.js",
      "GraphTabs.tpl.js"
    ],
    "packages/symbiote-node/canvas/Minimap/": [
      "Minimap.css.js",
      "Minimap.js",
      "Minimap.tpl.js"
    ],
    "packages/symbiote-node/canvas/NodeCanvas/": [
      "NodeCanvas.css.js",
      "NodeCanvas.js",
      "NodeCanvas.tpl.js"
    ],
    "packages/symbiote-node/canvas/NodeSearch/": [
      "NodeSearch.css.js",
      "NodeSearch.js",
      "NodeSearch.tpl.js"
    ],
    "packages/symbiote-node/core/": [
      "Connection.js",
      "Editor.js",
      "Frame.js",
      "GraphMermaid.js",
      "GraphText.js",
      "Node.js",
      "Portal.js",
      "Socket.js",
      "SubgraphNode.js"
    ],
    "packages/symbiote-node/demo/": [
      "benchmark.html",
      "benchmark.js",
      "demo.js",
      "index.html",
      "tree-layout-test.html"
    ],
    "packages/symbiote-node/demo/AiChat/": [
      "AiChat.css.js",
      "AiChat.js",
      "AiChat.tpl.js"
    ],
    "packages/symbiote-node/demo/EventLog/": [
      "EventLog.css.js",
      "EventLog.js",
      "EventLog.tpl.js"
    ],
    "packages/symbiote-node/engine/": [
      "AgentUICommands.js",
      "Executor.js",
      "Graph.js",
      "GraphServer.js",
      "HandlerLoader.js",
      "History.js",
      "Lifecycle.js",
      "Persistence.js",
      "Registry.js",
      "SocketTypes.js",
      "cli.js",
      "index.js",
      "nanoid.js",
      "package.json"
    ],
    "packages/symbiote-node/engine/extensions/grok-bridge/": [
      "background.js",
      "content.js",
      "manifest.json",
      "sidepanel.html",
      "sidepanel.js",
      "websocket-interceptor.js"
    ],
    "packages/symbiote-node/engine/packs/": [
      "video-pack.js"
    ],
    "packages/symbiote-node/engine/packs/ai/": [
      "beat-detect.handler.js",
      "content-adapt.handler.js",
      "face-detect.handler.js",
      "grok-generate.handler.js",
      "kling-lipsync.handler.js",
      "lesson-generate.handler.js",
      "opencode.handler.js",
      "replicate-lipsync.handler.js",
      "tts.handler.js",
      "whisper.handler.js"
    ],
    "packages/symbiote-node/engine/packs/data/": [
      "db-query.handler.js",
      "news-accumulate.handler.js",
      "personas.handler.js",
      "prompt-loader.handler.js",
      "roles.handler.js",
      "rss-feed.handler.js"
    ],
    "packages/symbiote-node/engine/packs/debug/": [
      "inject.handler.js"
    ],
    "packages/symbiote-node/engine/packs/flow/": [
      "agent.handler.js",
      "if.handler.js",
      "loop.handler.js",
      "merge.handler.js",
      "retry.handler.js",
      "switch.handler.js",
      "wait-all.handler.js"
    ],
    "packages/symbiote-node/engine/packs/io/": [
      "http-request.handler.js",
      "read-file.handler.js",
      "write-file.handler.js"
    ],
    "packages/symbiote-node/engine/packs/transform/": [
      "anchor-match.handler.js",
      "effects-skeleton.handler.js",
      "json-parse.handler.js",
      "lipsync-select.handler.js",
      "riopla-adapt.handler.js",
      "set.handler.js",
      "template-builder.handler.js",
      "template.handler.js",
      "timeline-build.handler.js"
    ],
    "packages/symbiote-node/engine/packs/util/": [
      "delay.handler.js",
      "log.handler.js"
    ],
    "packages/symbiote-node/inspector/InspectorPanel/": [
      "InspectorPanel.css.js",
      "InspectorPanel.js",
      "InspectorPanel.tpl.js"
    ],
    "packages/symbiote-node/inspector/TemplatePreview/": [
      "TemplatePreview.css.js",
      "TemplatePreview.js",
      "TemplatePreview.tpl.js"
    ],
    "packages/symbiote-node/interactions/": [
      "ConnectFlow.js",
      "Drag.js",
      "Selector.js",
      "SnapGrid.js",
      "Zoom.js"
    ],
    "packages/symbiote-node/layout/": [
      "LayoutTree.js",
      "index.js"
    ],
    "packages/symbiote-node/layout/ActionZone/": [
      "ActionZone.css.js",
      "ActionZone.js",
      "ActionZone.tpl.js"
    ],
    "packages/symbiote-node/layout/Layout/": [
      "Layout.css.js",
      "Layout.js",
      "Layout.tpl.js"
    ],
    "packages/symbiote-node/layout/LayoutNode/": [
      "LayoutNode.css.js",
      "LayoutNode.js",
      "LayoutNode.tpl.js"
    ],
    "packages/symbiote-node/layout/LayoutPreview/": [
      "LayoutPreview.css.js",
      "LayoutPreview.js",
      "LayoutPreview.tpl.js"
    ],
    "packages/symbiote-node/layout/LayoutRouter/": [
      "LayoutRouter.js",
      "routerSync.js"
    ],
    "packages/symbiote-node/layout/LayoutSidebar/": [
      "LayoutSidebar.css.js",
      "LayoutSidebar.js",
      "LayoutSidebar.tpl.js",
      "SidebarSection.js"
    ],
    "packages/symbiote-node/layout/PanelMenu/": [
      "PanelMenu.css.js",
      "PanelMenu.js",
      "PanelMenu.tpl.js"
    ],
    "packages/symbiote-node/menu/ContextMenu/": [
      "ContextMenu.css.js",
      "ContextMenu.js",
      "ContextMenu.tpl.js"
    ],
    "packages/symbiote-node/node/CtrlItem/": [
      "CtrlItem.css.js",
      "CtrlItem.js",
      "CtrlItem.tpl.js"
    ],
    "packages/symbiote-node/node/GraphFrame/": [
      "GraphFrame.css.js",
      "GraphFrame.js",
      "GraphFrame.tpl.js"
    ],
    "packages/symbiote-node/node/GraphNode/": [
      "GraphNode.css.js",
      "GraphNode.js",
      "GraphNode.tpl.js"
    ],
    "packages/symbiote-node/node/NodeSocket/": [
      "NodeSocket.js",
      "NodeSocket.tpl.js"
    ],
    "packages/symbiote-node/node/PortItem/": [
      "PortItem.css.js",
      "PortItem.js",
      "PortItem.tpl.js"
    ],
    "packages/symbiote-node/palette/PaletteBrowser/": [
      "PaletteBrowser.css.js",
      "PaletteBrowser.js",
      "PaletteBrowser.tpl.js"
    ],
    "packages/symbiote-node/plugins/": [
      "History.js",
      "Readonly.js"
    ],
    "packages/symbiote-node/shapes/": [
      "CircleShape.js",
      "CommentShape.js",
      "DiamondShape.js",
      "NodeShape.js",
      "PillShape.js",
      "RectShape.js",
      "SVGShape.js",
      "index.js"
    ],
    "packages/symbiote-node/tests/": [
      "force-layout.test.js",
      "geometry.test.js",
      "graph-serialization.test.js",
      "isomorphic-graph.test.js"
    ],
    "packages/symbiote-node/themes/": [
      "Palette.js",
      "Skin.js",
      "Theme.js",
      "carbon.js",
      "dark.js",
      "ebook.js",
      "grey.js",
      "light.js",
      "neon.js",
      "pcb.js",
      "synthwave.js"
    ],
    "packages/symbiote-node/toolbar/QuickToolbar/": [
      "QuickToolbar.css.js",
      "QuickToolbar.js",
      "QuickToolbar.tpl.js"
    ],
    "src/iso/": [
      "README.md"
    ],
    "src/node/": [
      ".project-graph-cache.json",
      "config-store.ctx",
      "config-store.js",
      "memory-store.js",
      "state-graph.js"
    ],
    "src/node/adapters/": [
      "adapters.ctx",
      "base.js",
      "claude.js",
      "gemini.js",
      "index.js",
      "pool.js",
      "stubs.js"
    ],
    "src/node/agents/": [
      "agent-parser.js"
    ],
    "src/node/discovery/": [
      "ws-client.js"
    ],
    "src/node/gateways/": [
      "telegram.js"
    ],
    "src/node/mlops/": [
      "flywheel.js",
      "trajectory-compressor.js"
    ],
    "src/node/plugins/": [
      "plugin-loader.ctx",
      "plugin-loader.js"
    ],
    "src/node/plugins/github/": [
      "index.js"
    ],
    "src/node/plugins/slack/": [
      "index.js"
    ],
    "src/node/plugins/telegram/": [
      "index.js"
    ],
    "src/node/proxy/": [
      ".project-graph-cache.json",
      "chat-ws-server.ctx",
      "chat-ws-server.js",
      "mcp-helpers.js",
      "mcp-http-handler.js",
      "mcp-multiplexer.ctx",
      "mcp-multiplexer.js",
      "mcp-proxy.ctx",
      "mcp-proxy.js",
      "task-router.ctx",
      "task-router.js",
      "tool-index.ctx",
      "tool-index.js"
    ],
    "src/node/proxy/.context/": [
      "chat-ws-server.ctx.md",
      "project.ctx",
      "task-router.ctx.md",
      "tool-index.ctx.md"
    ],
    "src/node/proxy/.context/.cache/": [
      "chat-ws-server.json",
      "task-router.json",
      "tool-index.json"
    ],
    "src/node/server/": [
      "api-routes-projects.js",
      "api-routes.ctx",
      "api-routes.js",
      "backend-lifecycle.js",
      "backend.js",
      "context-injector.js",
      "lint-service.js",
      "local-gateway.js",
      "marketplace-registry.js",
      "mdns.js",
      "web-server.ctx",
      "web-server.js"
    ],
    "test/integration/": [
      "api.test.js",
      "chat-flow.test.js",
      "chat-params.test.js",
      "cli-e2e.test.js",
      "opencode-e2e.js",
      "ws-distributed.test.js"
    ],
    "test/unit/": [
      "adapters-pool-limit.test.js",
      "adapters-registry.test.js",
      "api-routes.test.js",
      "config-injector.test.js",
      "config-store.test.js",
      "context-tracker.test.js",
      "flywheel.test.js",
      "groups.test.js",
      "mcp-http-transport.test.js",
      "mcp-server.test.js",
      "memory-store.test.js",
      "plugin-loader.test.js",
      "resolve-content.test.js",
      "scripts.test.js",
      "task-state-cache.test.js",
      "tool-index.test.js",
      "workflow-index.test.js",
      "workspace-registration.test.js"
    ],
    "web/": [
      ".DS_Store",
      ".project-graph-cache.json",
      "WsClient.js",
      "app.js",
      "dashboard-state.js",
      "follow-controller.js",
      "highlight.js",
      "index.html",
      "router-registry.js",
      "state-sync.js",
      "state.js",
      "stats-format.js",
      "style.css"
    ],
    "web/common/": [
      "icons.js",
      "mcp-call.js",
      "ui-dialogs.js",
      "ui-shared.css.js"
    ],
    "web/common/CellBg/": [
      "CellBg.css.js",
      "CellBg.js",
      "CellBg.tpl.js"
    ],
    "web/components/": [
      "canvas-graph.js",
      "code-block.js",
      "follow-ribbon.js",
      "quick-open.js"
    ],
    "web/components/AgentBoard/": [
      "AgentBoard.css.js",
      "AgentBoard.js",
      "AgentBoard.tpl.js"
    ],
    "web/components/ChatSidebar/": [
      "ChatSidebar.js",
      "ChatSidebar.tpl.js",
      "ChatSidebarItem.js"
    ],
    "web/components/LoadingOverlay/": [
      "LoadingOverlay.css.js",
      "LoadingOverlay.js",
      "LoadingOverlay.tpl.js"
    ],
    "web/components/PgWorkspace/": [
      "PgWorkspace.js",
      "PgWorkspace.tpl.js"
    ],
    "web/components/ProjectTabs/": [
      "ProjectTabs.css.js",
      "ProjectTabs.js",
      "ProjectTabs.tpl.js"
    ],
    "web/components/event-feed/": [
      "CodeWidget.js",
      "EventWidget.js",
      "ListWidget.js",
      "MiniGraphWidget.js"
    ],
    "web/panels/": [
      "code-viewer.js",
      "ctx-panel.js",
      "dep-graph.js",
      "file-tree.js",
      "health-panel.js",
      "ops-panel.js"
    ],
    "web/panels/ActionBoard/": [
      "ActionBoard.js",
      "ActionBoard.tpl.js"
    ],
    "web/panels/ActiveContext/": [
      "ActiveContext.js",
      "ActiveContext.tpl.js"
    ],
    "web/panels/ActiveTasks/": [
      "ActiveTasks.js",
      "ActiveTasks.tpl.js"
    ],
    "web/panels/AgentChat/": [
      "AgentChat.css.js",
      "AgentChat.js",
      "AgentChat.tpl.js"
    ],
    "web/panels/AgentListPanel/": [
      "AgentListItem.css.js",
      "AgentListItem.js",
      "AgentListItem.tpl.js"
    ],
    "web/panels/ChatList/": [
      "ChatList.css.js",
      "ChatList.js",
      "ChatList.tpl.js"
    ],
    "web/panels/EventItem/": [
      "EventItem.css.js",
      "EventItem.js",
      "EventItem.tpl.js"
    ],
    "web/panels/GroupManager/": [
      "GroupManager.js",
      "GroupManager.tpl.js"
    ],
    "web/panels/Marketplace/": [
      "Marketplace.css.js",
      "Marketplace.js",
      "Marketplace.tpl.js"
    ],
    "web/panels/PeerReview/": [
      "PeerReview.js",
      "PeerReview.tpl.js"
    ],
    "web/panels/PipelineManager/": [
      "PipelineManager.js",
      "PipelineManager.tpl.js"
    ],
    "web/panels/ProjectItem/": [
      "ProjectItem.css.js",
      "ProjectItem.js",
      "ProjectItem.tpl.js"
    ],
    "web/panels/ProjectList/": [
      "ProjectList.js",
      "ProjectList.tpl.js"
    ],
    "web/panels/SettingsPanel/": [
      ".project-graph-cache.json",
      "SettingsPanel.css.js",
      "SettingsPanel.js",
      "SettingsPanel.tpl.js"
    ],
    "web/panels/SkillLibraryPanel/": [
      "SkillListItem.css.js",
      "SkillListItem.js",
      "SkillListItem.tpl.js"
    ],
    "web/panels/SkillManager/": [
      "SkillManager.js",
      "SkillManager.tpl.js"
    ],
    "web/panels/ToolExplorer/": [
      "ToolExplorer.css.js",
      "ToolExplorer.js",
      "ToolExplorer.tpl.js"
    ],
    "web/panels/Topology/": [
      "TopologyPanel.css.js",
      "TopologyPanel.js",
      "TopologyPanel.tpl.js"
    ],
    "web/panels/WorkflowExplorer/": [
      "WorkflowExplorer.css.js",
      "WorkflowExplorer.js",
      "WorkflowExplorer.tpl.js"
    ],
    "web/playground/": [
      "cell-bg.html"
    ],
    "web/services/": [
      "chat-autocomplete.js",
      "chat-ws-client.js",
      "skeleton-parser.js"
    ],
    "web/utils/": [
      "graph-layout.js",
      "markdown-formatter.js"
    ]
  }
  ,
  a: {},
  X: {},
  stats: { files: 87, functions: 234, lines: 12450, complexity: 3.1 },
};

// ── Tools ────────────────────────────────────────────────────────

export const toolsByServer = {
  'project-graph': [
    { name: 'get_skeleton', description: 'Get the project skeleton — high-level structural overview of the codebase.', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
    { name: 'compact', description: 'Compact or expand a file for efficient reading.', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['compact_file', 'expand_file'] }, path: { type: 'string' }, beautify: { type: 'boolean' } }, required: ['action', 'path'] } },
    { name: 'analyze', description: 'Run analysis on the project codebase.', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['full_analysis', 'analysis_summary'] }, path: { type: 'string' } }, required: ['action', 'path'] } },
    { name: 'navigate', description: 'Navigate code symbols — find deps, usages, call chains.', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['deps', 'usages', 'expand', 'call_chain'] }, symbol: { type: 'string' }, path: { type: 'string' } }, required: ['action'] } },
    { name: 'docs', description: 'Get or generate documentation for a file.', inputSchema: { type: 'object', properties: { action: { type: 'string' }, path: { type: 'string' }, file: { type: 'string' } } } },
    { name: 'get_ai_context', description: 'Get AI-optimized context for a symbol or file.', inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, path: { type: 'string' } } } },
  ],
  'agent-pool': [
    { name: 'delegate_task', description: 'Delegate a task to a sub-agent for parallel execution.', inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, agent: { type: 'string' }, timeout: { type: 'number' } }, required: ['prompt'] } },
    { name: 'delegate_task_readonly', description: 'Delegate a read-only task (no file writes).', inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, agent: { type: 'string' } }, required: ['prompt'] } },
    { name: 'consult_peer', description: 'Ask a peer agent for a second opinion on a design or implementation.', inputSchema: { type: 'object', properties: { question: { type: 'string' }, context: { type: 'string' } }, required: ['question'] } },
    { name: 'get_task_result', description: 'Get the result of a previously delegated task.', inputSchema: { type: 'object', properties: { task_id: { type: 'string' } }, required: ['task_id'] } },
    { name: 'list_skills', description: 'List available agent skills and policies.', inputSchema: { type: 'object', properties: {} } },
    { name: 'create_group', description: 'Create a named agent group for coordinated work.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, agents: { type: 'array' } }, required: ['name'] } },
  ],
  'context-x': [
    { name: 'search_context', description: 'Semantic search across codebase context.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, scope: { type: 'string' } }, required: ['query'] } },
    { name: 'get_related', description: 'Find related files and symbols.', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  ],
};

// ── Adapter Metadata ─────────────────────────────────────────────

export const adapterTypes = {
  metadata: {
    pool: {
      label: 'Agent Pool',
      parameters: [
        {
          id: 'agent',
          label: 'Agent',
          type: 'select',
          options: ['orchestrator', 'single', 'coder', 'reviewer'],
        },
        {
          id: 'chatType',
          label: 'Chat Type',
          type: 'select',
          options: ['chat', 'task'],
        },
      ],
    },
    gemini: {
      label: 'Gemini CLI',
      parameters: [
        {
          id: 'model',
          label: 'Model',
          type: 'select',
          options: [
            { val: 'gemini-3.1-pro-preview', text: 'Gemini 3.1 Pro' },
            { val: 'gemini-3.1-flash-lite-preview', text: 'Gemini 3.1 Flash Lite' },
            { val: 'gemini-3-pro-preview', text: 'Gemini 3.0 Pro' },
            { val: 'gemini-3-flash-preview', text: 'Gemini 3.0 Flash' },
            { val: 'gemini-2.5-pro', text: 'Gemini 2.5 Pro' },
          ],
        },
      ],
    },
    opencode: {
      label: 'OpenCode',
      parameters: [
        {
          id: 'model',
          label: 'Model',
          type: 'select',
          options: [
            { val: 'claude-sonnet-4', text: 'Claude Sonnet 4' },
            { val: 'claude-opus-4', text: 'Claude Opus 4' },
            { val: 'gpt-4.5', text: 'GPT-4.5' },
            { val: 'deepseek-v4', text: 'DeepSeek V4 Pro' },
          ],
        },
      ],
    },
  },
};

// ── CLI Config ───────────────────────────────────────────────────

export const cliConfig = {
  global: {
    defaultAdapter: 'pool',
    defaultModel: 'gemini-3.1-pro-preview',
  },
};

// ── Flywheel Stats ───────────────────────────────────────────────

export const flywheelStats = {
  total_calls: 1247,
  avg_duration_ms: 3420,
  skills_created: 18,
};

// ── Sample Events (for Action Board + Monitor) ───────────────────

const TOOL_NAMES = [
  'get_skeleton', 'compact', 'navigate', 'analyze', 'delegate_task',
  'consult_peer', 'search_context', 'get_ai_context', 'list_skills',
];
const PROJECT_NAMES = ['mcp-agent-portal', 'symbiote-video', '1sim-app', 'ml-pipeline', 'docs-portal', 'trading-engine'];
const PROJECT_PREFIXES = ['/pg', '/ap', '/cx', '/bx', '/tx', '/rc'];

export function generateEvent(idx) {
  let tool = TOOL_NAMES[idx % TOOL_NAMES.length];
  let projIdx = idx % PROJECT_NAMES.length;
  let project = PROJECT_NAMES[projIdx];
  return {
    type: 'tool_call',
    tool,
    args: { path: `/home/dev/${project}` },
    result: { ok: true },
    ts: Date.now() - idx * 4500,
    duration: 120 + Math.random() * 2000 | 0,
    _projectName: project,
    _projectPrefix: PROJECT_PREFIXES[projIdx],
  };
}

export function generateInitialEvents(count = 25) {
  let events = [];
  for (let i = 0; i < count; i++) {
    events.push(generateEvent(i));
  }
  return events;
}

// ── Skills ───────────────────────────────────────────────────────

export const skills = [
  { name: 'orchestrator', category: 'core', description: 'Multi-agent orchestrator that delegates tasks to specialized sub-agents.', file: 'skills/orchestrator.md' },
  { name: 'coder', category: 'core', description: 'Implementation specialist — writes, refactors, and debugs code.', file: 'skills/coder.md' },
  { name: 'reviewer', category: 'core', description: 'Code reviewer — analyzes PRs and provides structured feedback.', file: 'skills/reviewer.md' },
  { name: 'researcher', category: 'analysis', description: 'Deep codebase research — finds patterns, traces call chains, maps dependencies.', file: 'skills/researcher.md' },
  { name: 'testing', category: 'quality', description: 'Test generation and validation specialist.', file: 'skills/testing.md' },
  { name: 'docs-writer', category: 'documentation', description: 'Technical documentation generator.', file: 'skills/docs-writer.md' },
];

// ── Workflows ────────────────────────────────────────────────────

export const workflows = [
  { name: 'publish', path: '.agents/workflows/publish.md', description: 'Cross-project publication workflow for Git and NPM.' },
  { name: 'testing', path: '.agents/workflows/testing.md', description: 'Testing workflow and conventions.' },
  { name: 'deploy', path: '.agents/workflows/deploy.md', description: 'Production deployment pipeline.' },
];

// ── Pipelines ────────────────────────────────────────────────────

export const pipelines = [
  { id: 'pipe-1', name: 'Code Review Pipeline', status: 'idle', steps: ['lint', 'test', 'review', 'approve'], lastRun: Date.now() - 86400_000 },
  { id: 'pipe-2', name: 'Deploy Pipeline', status: 'idle', steps: ['build', 'test', 'stage', 'deploy'], lastRun: Date.now() - 172800_000 },
];

// ── Groups ───────────────────────────────────────────────────────

export const groups = [
  { id: 'grp-1', name: 'Frontend Team', agents: ['coder', 'reviewer'], status: 'active' },
  { id: 'grp-2', name: 'Research Squad', agents: ['researcher', 'docs-writer'], status: 'idle' },
];
