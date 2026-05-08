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

  // ── Chat 1 Sub-Task 1: Architecture Analysis ──
  {
    id: 'task-arch-analysis',
    name: 'Analyze the delegation architecture',
    adapter: 'pool',
    provider: 'gemini',
    model: 'gemini-3.1-pro-preview',
    agent: 'researcher',
    createdAt: Date.now() - 7100_000,
    updatedAt: Date.now() - 7000_000,
    projectId: 'proj-portal',
    parentChatId: 'chat-1',
    messages: [
      { role: 'user', text: 'Analyze the delegation architecture: task-router.js, agent-pool-mcp tools, and chat-ws-server.js' },
      { role: 'thinking', elapsed: 14, done: true, meta: { tools: 4, tokens: 9200, cost: 0.0276 } },
      { role: 'tool', name: 'search_context', input: { query: 'delegate_task', scope: 'packages/agent-pool-mcp' }, result: 'Found 3 files matching "delegate_task"' },
      { role: 'agent', text: '### Delegation Architecture Analysis\n\n1. **`task-router.js`**: Intercepts `delegate_task` tool calls from the orchestrator.\n2. **`agent-pool-mcp tools`**: Defines the `delegate_task` schema and creates new isolated Agent contexts.\n3. **`chat-ws-server.js`**: Streams live telemetry via WebSockets to the `EventFeed` and `ActionBoard`.\n\nThe system runs sub-agents in independent detached processes to guarantee zero zombie lockups.' },
      { role: 'system', text: '✅ Task completed and returned to orchestrator.' }
    ]
  },

  // ── Chat 1 Sub-Task 2: UI Audit ──
  {
    id: 'task-ui-audit',
    name: 'Audit the Agent Chat UI',
    adapter: 'pool',
    provider: 'claude',
    model: 'claude-sonnet-4',
    agent: 'reviewer',
    createdAt: Date.now() - 7050_000,
    updatedAt: Date.now() - 6900_000,
    projectId: 'proj-portal',
    parentChatId: 'chat-1',
    messages: [
      { role: 'user', text: 'Audit the Agent Chat UI: message types, rendering pipeline, live status indicators' },
      { role: 'thinking', elapsed: 21, done: true, meta: { tools: 6, tokens: 11400, cost: 0.0342 } },
      { role: 'tool', name: 'get_skeleton', input: { path: 'web/panels/AgentChat' }, result: 'Found files: AgentChat.js, AgentChat.tpl.js, AgentChat.css.js' },
      { role: 'agent', text: '### UI Audit Complete\n\nThe UI pipeline supports 6 core message types. The `chat-messages` container properly renders all types natively using the Symbiote layout engine.\n\nThe delegation board (`role: board`) relies on the `chat.subTasks` structure injected via WebSocket polling.' },
      { role: 'system', text: '✅ Task completed and returned to orchestrator.' }
    ]
  }
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
      ".windsurfrules",
      "ARCHITECTURE.md",
      "README.md",
      "eslint.config.js",
      "index.js",
      "package-lock.json",
      "package.json"
    ],
    ".github/workflows/": [
      "demo.yml"
    ],
    "bin/": [
      "mcp-agent-portal.js"
    ],
    "demo/": [
      "build.js",
      "demo-adapter.js",
      "index.html",
      "mock-data.js"
    ],
    "packages/": [
      "agent-pool-mcp",
      "project-graph-mcp",
      "symbiote-node"
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
    "src/iso/": [
      "README.md"
    ],
    "src/node/": [
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
      "live-monitor.js",
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
