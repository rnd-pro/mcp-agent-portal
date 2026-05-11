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
  "v": 1,
  "L": {
    "MWS": "MockWebSocket",
    "BS": "BoardStore",
    "MCP": "MCPClient",
    "BI": "BreadcrumbItem",
    "bB": "Breadcrumb",
    "CCR": "CanvasConnectionRenderer",
    "CV": "CanvasViewport",
    "CR": "ConnectionRenderer",
    "FS": "FlowSimulator",
    "FL": "ForceLayout",
    "FM": "FrameManager",
    "TI": "TabItem",
    "GT": "GraphTabs",
    "LOD": "LODManager",
    "mM": "Minimap",
    "NC": "NodeCanvas",
    "NS": "NodeSearch",
    "NVM": "NodeViewManager",
    "PE": "PinExpansion",
    "PC": "PseudoConnection",
    "SS": "SelectionSync",
    "SM": "SubgraphManager",
    "SR": "SubgraphRouter",
    "VA": "ViewportActions",
    "NE": "NodeEditor",
    "nN": "Node",
    "PM": "PortalManager",
    "sS": "Socket",
    "iI": "Input",
    "IC": "InputControl",
    "SN": "SubgraphNode",
    "AC": "AiChat",
    "EL": "EventLog",
    "eE": "Executor",
    "gG": "Graph",
    "hH": "History",
    "IP": "InspectorPanel",
    "IPI": "InspPortItem",
    "ICI": "InspCtrlItem",
    "TP": "TemplatePreview",
    "CF": "ConnectFlow",
    "dD": "Drag",
    "sS1": "Selector",
    "SG": "SnapGrid",
    "zZ": "Zoom",
    "AZ": "ActionZone",
    "lL": "Layout",
    "LN": "LayoutNode",
    "LP": "LayoutPreview",
    "LS": "LayoutSidebar",
    "SS1": "SidebarSection",
    "SSI": "SidebarSubItem",
    "PM1": "PanelMenu",
    "CI": "CtxItem",
    "CM": "ContextMenu",
    "GF": "GraphFrame",
    "GN": "GraphNode",
    "NS1": "NodeSocket",
    "PI": "PortItem",
    "PI1": "PalItem",
    "PC1": "PalCategory",
    "PB": "PaletteBrowser",
    "rR": "Readonly",
    "CS": "CircleShape",
    "CS1": "CommentShape",
    "DS": "DiamondShape",
    "NS2": "NodeShape",
    "PS": "PillShape",
    "RS": "RectShape",
    "SVG": "SVGShape",
    "QT": "QuickToolbar",
    "AP": "AdapterPool",
    "PL": "PluginLoader",
    "CWS": "ChatWsServer",
    "MCP1": "MCPMultiplexer",
    "MCP2": "MCPProxyManager",
    "TR": "TaskRouter",
    "TI1": "ToolIndex",
    "SG1": "StateGraph",
    "WC": "WsClient",
    "CB": "CellBg",
    "AB": "AgentBoard",
    "CS2": "ChatSidebar",
    "CSI": "ChatSidebarItem",
    "CSS": "ChatSidebarSubItem",
    "LO": "LoadingOverlay",
    "PW": "PgWorkspace",
    "PT": "ProjectTabs",
    "PTI": "ProjectTabItem",
    "CG": "CanvasGraph",
    "CB1": "CodeBlock",
    "CS3": "CbSquiggle",
    "CW": "CodeWidget",
    "EW": "EventWidget",
    "LW": "ListWidget",
    "MGW": "MiniGraphWidget",
    "FR": "FollowRibbon",
    "QO": "QuickOpen",
    "FC": "FollowController",
    "AB1": "ActionBoard",
    "AC1": "ActiveContext",
    "AT": "ActiveTasks",
    "AC2": "AgentChat",
    "ALI": "AgentListItem",
    "CL": "ChatList",
    "EI": "EventItem",
    "GM": "GroupManager",
    "mM1": "Marketplace",
    "PR": "PeerReview",
    "PM2": "PipelineManager",
    "PI2": "ProjectItem",
    "PL1": "ProjectList",
    "SP": "SettingsPanel",
    "SLI": "SkillListItem",
    "SM1": "SkillManager",
    "TE": "ToolExplorer",
    "TP1": "TopologyPanel",
    "WE": "WorkflowExplorer",
    "CV1": "CodeViewer",
    "CP": "CtxPanel",
    "DG": "DepGraph",
    "FT": "FileTree",
    "HP": "HealthPanel",
    "OP": "OpsPanel",
    "CA": "ChatAutocomplete",
    "CWC": "ChatWsClient",
    "mC": "mcpCall",
    "pH": "printHelp",
    "CBI": "getChatById",
    "gE": "generateEvent",
    "IE": "generateInitialEvents",
    "rA": "resolveAgent",
    "AS": "listAgentSlugs",
    "AC3": "buildAgentCatalog",
    "rC": "runCheck",
    "rI": "runInit",
    "pV": "printVersion",
    "vS": "validateStartup",
    "hC": "handleCli",
    "lC": "loadConfig",
    "gR": "getRunner",
    "rC1": "resetConfig",
    "GS": "runGeminiStreaming",
    "GS1": "listGeminiSessions",
    "HC": "runHistoryCleanup",
    "OS": "runOpencodeStreaming",
    "tC": "trackChild",
    "kG": "killGroup",
    "uC": "untrackChild",
    "kA": "killAll",
    "lC1": "listChildren",
    "SL": "getSystemLoad",
    "GE": "createGeminiEnv",
    "OCE": "createOpenCodeEnv",
    "TC2": "cleanupTmpConfig",
    "GC": "injectGeminiConfig",
    "GC1": "cleanupGeminiConfig",
    "OCC": "injectOpenCodeConfig",
    "OCC1": "cleanupOpenCodeConfig",
    "SA": "escapeShellArg",
    "SS2": "buildSshSpawn",
    "RP": "parseRemotePid",
    "RP1": "killRemoteProcess",
    "PW1": "createProcessWatchdog",
    "PU": "resolvePortalUrl",
    "APP": "findActivePortalPort",
    "pU": "probeUrl",
    "mC2": "matchesCron",
    "CR1": "nextCronRun",
    "rS1": "readSchedules",
    "cP": "createPipeline",
    "lP": "listPipelines",
    "gP": "getPipeline",
    "rP": "runPipeline",
    "gR1": "getRun",
    "sR": "saveRun",
    "lR": "listRuns",
    "cR": "cancelRun",
    "ARB": "findActiveRunByStep",
    "SC": "signalStepComplete",
    "bB1": "bounceBack",
    "wS": "writeSignal",
    "cS": "consumeSignals",
    "dS1": "deleteSignals",
    "aS1": "addSchedule",
    "rS2": "removeSchedule",
    "lS1": "listSchedules",
    "SR2": "getScheduledResults",
    "DS1": "getDaemonStatus",
    "eD": "ensureDaemon",
    "sD": "stopDaemon",
    "cS1": "createServer",
    "TD": "getToolDefinitions",
    "lA": "loadAgent",
    "BS1": "getBoardStore",
    "cP1": "consultPeer",
    "cG1": "createGroup",
    "lG1": "listGroups",
    "gG1": "getGroup",
    "dG": "deleteGroup",
    "GNM": "getGroupNextModel",
    "SY": "parseSimpleYaml",
    "sM": "sendMessage",
    "gM": "getMessages",
    "NC1": "setNotifyCallback",
    "cT": "createTask",
    "TE1": "pushTaskEvent",
    "TS": "pushTaskStderr",
    "TP2": "setTaskPid",
    "cT1": "completeTask",
    "TR2": "updateTaskResult",
    "fT": "failTask",
    "cT2": "cancelTask",
    "gT": "getTask",
    "rT": "removeTask",
    "AT1": "getActiveTasks",
    "AT2": "listAllTasks",
    "TR3": "formatTaskResult",
    "sS4": "saveScript",
    "lS2": "listScripts",
    "lS3": "listSkills",
    "fS": "findSkill",
    "cS2": "createSkill",
    "dS2": "deleteSkill",
    "iS": "installSkill",
    "pS": "provisionSkill",
    "rC2": "readConfig",
    "wC": "writeConfig",
    "tF": "trackFiles",
    "uF": "untrackFiles",
    "TF": "getTrackedFiles",
    "GR": "isGitRepo",
    "sM1": "syncMemory",
    "AP1": "saveAndPush",
    "TI2": "buildTagIndex",
    "BT": "searchByTags",
    "LL": "toLightList",
    "CH": "computeContentHash",
    "CP5": "getCachePath",
    "rC3": "readCache",
    "wC1": "writeCache",
    "CV2": "isCacheValid",
    "CF1": "analyzeComplexityFile",
    "gC": "getComplexity",
    "CR2": "getCustomRules",
    "CR3": "setCustomRule",
    "CR4": "deleteCustomRule",
    "PRS": "detectProjectRuleSets",
    "CR5": "checkCustomRules",
    "DBS": "getDBSchema",
    "TU": "getTableUsage",
    "DBD": "getDBDeadTables",
    "DC": "getDeadCode",
    "FA": "getFullAnalysis",
    "ASO": "getAnalysisSummaryOnly",
    "JSD": "checkJSDocFile",
    "JSD1": "checkJSDocConsistency",
    "JSD2": "generateJSDoc",
    "JSD3": "generateJSDocFor",
    "JSF": "findJSFiles",
    "LF": "getLargeFiles",
    "OP1": "getOutdatedPatterns",
    "SF": "getSimilarFunctions",
    "pA": "parseAnnotations",
    "AF": "getAllFeatures",
    "PT1": "getPendingTests",
    "TP3": "markTestPassed",
    "TF1": "markTestFailed",
    "TS1": "getTestSummary",
    "TS2": "resetTestState",
    "cT3": "checkTypes",
    "UF": "checkUndocumentedFile",
    "gU": "getUndocumented",
    "US": "getUndocumentedSummary",
    "CLI": "runCLI",
    "AC4": "getAiContext",
    "cM": "compactMigrate",
    "cP2": "compactProject",
    "eP": "expandProject",
    "cF3": "compressFile",
    "eC": "editCompressed",
    "CP6": "resolveCtxPath",
    "CRP": "resolveCtxRelPath",
    "CF2": "readCtxFile",
    "CF3": "parseCtxFile",
    "JSD4": "injectJSDoc",
    "JSD5": "stripJSDoc",
    "CC": "validateCtxContracts",
    "DD": "generateDocDialect",
    "CD": "readContextDocs",
    "PD": "getProjectDocs",
    "cS3": "checkStaleness",
    "CF4": "generateContextFiles",
    "eF": "expandFile",
    "FR1": "getFrameworkReference",
    "gI": "getInstructions",
    "CP7": "parseCtxParams",
    "JSD6": "buildJSDocBlock",
    "JSD7": "buildJSDocFromRaw",
    "gC1": "getConfig",
    "sC1": "setConfig",
    "MD1": "getModeDescription",
    "MW": "getModeWorkflow",
    "sD1": "splitDeclarations",
    "SLB": "isSingleLineBlob",
    "vP": "validatePipeline",
    "TC4": "emitToolCall",
    "TR4": "emitToolResult",
    "TC5": "onToolCall",
    "TR5": "onToolResult",
    "TL": "removeToolListener",
    "JSF1": "walkJSFiles",
    "gF": "getFilters",
    "sF": "setFilters",
    "aE": "addExcludes",
    "rE": "removeExcludes",
    "rF": "resetFilters",
    "pG": "parseGitignore",
    "ED": "shouldExcludeDir",
    "EF": "shouldExcludeFile",
    "mL": "minifyLegend",
    "bG": "buildGraph",
    "cS4": "createSkeleton",
    "pF3": "parseFile",
    "SP1": "discoverSubProjects",
    "pP2": "parseProject",
    "APF": "findAllProjectFiles",
    "eT": "estimateTokens",
    "sR2": "setRoots",
    "WR": "getWorkspaceRoot",
    "pG1": "parseGo",
    "pP3": "parsePython",
    "SQL": "isSQLString",
    "SQL1": "extractSQLFromString",
    "SQL2": "parseSQL",
    "SQL3": "extractSQLFromCode",
    "ORM": "extractORMFromCode",
    "TS3": "parseTypeScript",
    "SAC": "stripStringsAndComments",
    "SS3": "startStdioServer",
    "gG2": "getGraph",
    "gS": "getSkeleton",
    "FZ": "getFocusZone",
    "ex": "expand",
    "de": "deps",
    "us": "usages",
    "CC1": "getCallChain",
    "iC": "invalidateCache",
    "lB": "listBackends",
    "PF": "writePortFile",
    "PF1": "removePortFile",
    "eB": "ensureBackend",
    "SP2": "startStdioProxy",
    "aN": "assertNum",
    "aS2": "assertStr",
    "aO": "assertObj",
    "aA": "assertArr",
    "OO": "assertOneOf",
    "aS3": "assertScore",
    "sc1": "scaffold",
    "SP3": "resolveServerPath",
    "FG": "buildFileGraph",
    "AL": "computeAutoLayout",
    "TL1": "computeTreeLayout",
    "TM1": "editorToMermaid",
    "TG": "mermaidToGraph",
    "TT": "editorToText",
    "TG1": "textToGraph",
    "TE2": "textToEditor",
    "ui": "uid",
    "in": "init",
    "la": "layout",
    "fo": "focus",
    "se": "select",
    "na": "navigate",
    "pl": "playback",
    "no": "notify",
    "cu": "cursor",
    "lH1": "loadHandlers",
    "wH": "watchHandlers",
    "rL1": "runLifecycle",
    "se1": "serialize",
    "de1": "deserialize",
    "TF2": "saveToFile",
    "FF": "loadFromFile",
    "dG1": "downloadGraph",
    "NT": "registerNodeType",
    "rP2": "registerPack",
    "NT1": "getNodeType",
    "lD": "listDrivers",
    "fC": "findCompatible",
    "BC": "findByCapability",
    "NM": "getNodeMenu",
    "CD1": "registerCustomDrivers",
    "vP1": "validateParams",
    "lP1": "listPacks",
    "cR1": "clearRegistry",
    "ST1": "registerSocketType",
    "ST2": "registerSocketTypes",
    "ST3": "getSocketType",
    "AST": "getAllSocketTypes",
    "SC1": "areSocketsCompatible",
    "na1": "nanoid",
    "gI2": "generateId",
    "eP2": "extractPlaceholders",
    "VP": "registerVideoPack",
    "pQ": "parseQuery",
    "bQ": "buildQuery",
    "bH": "buildHash",
    "uP": "updateParams",
    "gR2": "getRoute",
    "DP2": "setDefaultPanel",
    "GP1": "registerGlobalParam",
    "GP2": "setGlobalParam",
    "WR1": "syncWithRouter",
    "PR1": "setupPanelRouting",
    "cP4": "createPanel",
    "cS7": "createSplit",
    "fN": "findNode",
    "fP": "findParent",
    "sP1": "splitPanel",
    "jP": "joinPanels",
    "rS3": "resizeSplit",
    "cl2": "clone",
    "AP4": "getAllPanels",
    "uN": "updateNode",
    "gN": "getNeighbors",
    "SVG1": "createSVGShape",
    "gS4": "getShape",
    "rS4": "registerShape",
    "aP": "applyPalette",
    "aS5": "applySkin",
    "aT": "applyTheme",
    "eT1": "extractTheme",
    "CA1": "createClaudeAdapter",
    "GA": "createGeminiAdapter",
    "rA1": "resolveAdapter",
    "OCM": "discoverOpenCodeModels",
    "CLI1": "getCLIModels",
    "PR2": "setPortalRoot",
    "AL1": "getAgentList",
    "AT3": "listAdapterTypes",
    "pA2": "parseAgent",
    "lA2": "loadAgents",
    "AC6": "getAgentCatalog",
    "PH": "getProjectHistory",
    "aP1": "addProject",
    "rP3": "removeProject",
    "uP1": "updateProject",
    "GS4": "getGlobalSettings",
    "GS5": "setGlobalSettings",
    "API": "getActiveProjectIds",
    "API1": "setActiveProjectIds",
    "GC2": "getGlobalCli",
    "GC3": "setGlobalCli",
    "lC3": "listChats",
    "gC2": "getChat",
    "cC3": "createChat",
    "CM1": "appendChatMessage",
    "CM2": "replaceChatMessages",
    "dC1": "deleteChat",
    "uC1": "updateChat",
    "CS6": "updateChatSession",
    "CT": "updateChatTask",
    "PM3": "getProviderModels",
    "APM": "getAllProviderModels",
    "PM4": "setProviderModels",
    "WSC": "startWSClient",
    "TG2": "startTelegramGateway",
    "rM": "readMemory",
    "wM": "writeMemory",
    "re3": "remember",
    "re4": "recall",
    "lT": "logTrajectory",
    "lF": "logFeedback",
    "FS1": "getFlywheelStats",
    "cT5": "compressTrajectories",
    "de2": "destroy",
    "oA": "onAlert",
    "TR6": "fetchTaskResult",
    "MHH": "createMcpHttpHandler",
    "PR3": "createProjectRoutes",
    "cR4": "createRoutes",
    "di": "dispatch",
    "co": "connect",
    "WR2": "syncWorkspaceRules",
    "GTR": "getGlobalTeamRules",
    "lF1": "lintFile",
    "rS5": "registerService",
    "GP3": "getGatewayPort",
    "RBC": "getRegistryByCategory",
    "IR": "findInRegistry",
    "rL2": "registerLocal",
    "WS": "startWebServer",
    "SG2": "getStateGraph",
    "PP1": "resolveProjectPath",
    "ap": "api",
    "em": "emit",
    "IH": "renderIconHtml",
    "IWH": "replaceIconsWithHtml",
    "uC2": "uiConfirm",
    "uP2": "uiPrompt",
    "uA": "uiAlert",
    "fE": "formatElapsed",
    "hi": "highlight",
    "rM1": "renderMarkdown",
    "SQL4": "highlightSQL",
    "JSO": "highlightJSON",
    "CSS1": "highlightCSS",
    "HTM": "highlightHTML",
    "YAM": "highlightYAML",
    "hS2": "highlightShell",
    "INI": "highlightINI",
    "hL": "highlightLang",
    "hP1": "highlightPlain",
    "PT4": "registerPanelType",
    "rS6": "registerSection",
    "gS5": "getSections",
    "HS": "getHomeSections",
    "PS2": "getProjectSections",
    "SFS": "getSectionsForScope",
    "gL": "getLayout",
    "hS3": "hasSection",
    "SG3": "buildStructuredGraph",
    "di1": "disconnect",
    "su": "subscribe",
    "oE": "onEvent",
    "ca": "call",
    "fS1": "formatStats",
    "DC1": "compactDisconnectedComponents",
    "eH": "escapeHtml",
    "fM": "formatMarkdown"
  },
  "s": {
    "files": 326,
    "classes": 135,
    "functions": 965,
    "tables": 0
  },
  "n": {
    "MWS": {
      "m": 4,
      "f": "demo/demo-adapter.js",
      "l": 278
    },
    "BS": {
      "m": 7,
      "f": "packages/agent-pool-mcp/src/tools/board-store.js",
      "l": 9
    },
    "MCP": {
      "m": 9,
      "f": "packages/project-graph-mcp/tests/lib/mcp-client.js",
      "l": 9
    },
    "BI": {
      "m": 1,
      "$": 5,
      "f": "packages/symbiote-node/canvas/Breadcrumb/Breadcrumb.js",
      "l": 14
    },
    "bB": {
      "m": 3,
      "$": 3,
      "f": "packages/symbiote-node/canvas/Breadcrumb/Breadcrumb.js",
      "l": 40
    },
    "CCR": {
      "m": 28,
      "f": "packages/symbiote-node/canvas/CanvasConnectionRenderer.js",
      "l": 7
    },
    "CV": {
      "m": 16,
      "f": "packages/symbiote-node/canvas/CanvasViewport.js",
      "l": 11
    },
    "CR": {
      "m": 24,
      "f": "packages/symbiote-node/canvas/ConnectionRenderer.js",
      "l": 14
    },
    "FS": {
      "m": 8,
      "f": "packages/symbiote-node/canvas/FlowSimulator.js",
      "l": 16
    },
    "FL": {
      "m": 11,
      "f": "packages/symbiote-node/canvas/ForceLayout.js",
      "l": 16
    },
    "FM": {
      "m": 6,
      "f": "packages/symbiote-node/canvas/FrameManager.js",
      "l": 13
    },
    "TI": {
      "m": 1,
      "$": 4,
      "f": "packages/symbiote-node/canvas/GraphTabs/GraphTabs.js",
      "l": 22
    },
    "GT": {
      "m": 12,
      "$": 1,
      "f": "packages/symbiote-node/canvas/GraphTabs/GraphTabs.js",
      "l": 48
    },
    "LOD": {
      "m": 6,
      "f": "packages/symbiote-node/canvas/LODManager.js",
      "l": 1
    },
    "mM": {
      "m": 9,
      "$": 1,
      "f": "packages/symbiote-node/canvas/Minimap/Minimap.js",
      "l": 16
    },
    "NC": {
      "m": 47,
      "$": 3,
      "f": "packages/symbiote-node/canvas/NodeCanvas/NodeCanvas.js",
      "l": 44
    },
    "NS": {
      "m": 9,
      "$": 4,
      "f": "packages/symbiote-node/canvas/NodeSearch/NodeSearch.js",
      "l": 15
    },
    "NVM": {
      "m": 16,
      "f": "packages/symbiote-node/canvas/NodeViewManager.js",
      "l": 17
    },
    "PE": {
      "m": 5,
      "f": "packages/symbiote-node/canvas/PinExpansion.js",
      "l": 2
    },
    "PC": {
      "m": 2,
      "f": "packages/symbiote-node/canvas/PseudoConnection.js",
      "l": 11
    },
    "SS": {
      "m": 1,
      "f": "packages/symbiote-node/canvas/SelectionSync.js",
      "l": 10
    },
    "SM": {
      "m": 11,
      "f": "packages/symbiote-node/canvas/SubgraphManager.js",
      "l": 20
    },
    "SR": {
      "m": 9,
      "f": "packages/symbiote-node/canvas/SubgraphRouter.js",
      "l": 2
    },
    "VA": {
      "m": 20,
      "f": "packages/symbiote-node/canvas/ViewportActions.js",
      "l": 12
    },
    "NE": {
      "m": 20,
      "f": "packages/symbiote-node/core/Editor.js",
      "l": 23
    },
    "nN": {
      "m": 9,
      "f": "packages/symbiote-node/core/Node.js",
      "l": 12
    },
    "PM": {
      "m": 7,
      "f": "packages/symbiote-node/core/Portal.js",
      "l": 20
    },
    "sS": {
      "m": 1,
      "f": "packages/symbiote-node/core/Socket.js",
      "l": 24
    },
    "iI": {
      "m": 2,
      "f": "packages/symbiote-node/core/Socket.js",
      "l": 79
    },
    "IC": {
      "m": 1,
      "f": "packages/symbiote-node/core/Socket.js",
      "l": 145
    },
    "SN": {
      "m": 5,
      "f": "packages/symbiote-node/core/SubgraphNode.js",
      "l": 15
    },
    "AC": {
      "m": 5,
      "$": 3,
      "f": "packages/symbiote-node/demo/AiChat/AiChat.js",
      "l": 60
    },
    "EL": {
      "m": 5,
      "$": 2,
      "f": "packages/symbiote-node/demo/EventLog/EventLog.js",
      "l": 23
    },
    "eE": {
      "m": 7,
      "f": "packages/symbiote-node/engine/Executor.js",
      "l": 16
    },
    "gG": {
      "m": 11,
      "f": "packages/symbiote-node/engine/Graph.js",
      "l": 34
    },
    "hH": {
      "m": 15,
      "f": "packages/symbiote-node/plugins/History.js",
      "l": 19
    },
    "IP": {
      "m": 3,
      "$": 15,
      "f": "packages/symbiote-node/inspector/InspectorPanel/InspectorPanel.js",
      "l": 15
    },
    "IPI": {
      "m": 0,
      "$": 3,
      "f": "packages/symbiote-node/inspector/InspectorPanel/InspectorPanel.js",
      "l": 226
    },
    "ICI": {
      "m": 3,
      "$": 5,
      "f": "packages/symbiote-node/inspector/InspectorPanel/InspectorPanel.js",
      "l": 238
    },
    "TP": {
      "m": 4,
      "$": 5,
      "f": "packages/symbiote-node/inspector/TemplatePreview/TemplatePreview.js",
      "l": 23
    },
    "CF": {
      "m": 10,
      "f": "packages/symbiote-node/interactions/ConnectFlow.js",
      "l": 20
    },
    "dD": {
      "m": 2,
      "f": "packages/symbiote-node/interactions/Drag.js",
      "l": 10
    },
    "sS1": {
      "m": 9,
      "f": "packages/symbiote-node/interactions/Selector.js",
      "l": 14
    },
    "SG": {
      "m": 4,
      "f": "packages/symbiote-node/interactions/SnapGrid.js",
      "l": 11
    },
    "zZ": {
      "m": 4,
      "f": "packages/symbiote-node/interactions/Zoom.js",
      "l": 10
    },
    "AZ": {
      "m": 7,
      "$": 6,
      "f": "packages/symbiote-node/layout/ActionZone/ActionZone.js",
      "l": 19
    },
    "lL": {
      "m": 24,
      "$": 8,
      "f": "packages/symbiote-node/layout/Layout/Layout.js",
      "l": 15
    },
    "LN": {
      "m": 14,
      "$": 24,
      "f": "packages/symbiote-node/layout/LayoutNode/LayoutNode.js",
      "l": 13
    },
    "LP": {
      "m": 4,
      "$": 5,
      "f": "packages/symbiote-node/layout/LayoutPreview/LayoutPreview.js",
      "l": 10
    },
    "LS": {
      "m": 11,
      "$": 6,
      "f": "packages/symbiote-node/layout/LayoutSidebar/LayoutSidebar.js",
      "l": 19
    },
    "SS1": {
      "m": 1,
      "$": 13,
      "f": "packages/symbiote-node/layout/LayoutSidebar/SidebarSection.js",
      "l": 13
    },
    "SSI": {
      "m": 1,
      "$": 5,
      "f": "packages/symbiote-node/layout/LayoutSidebar/SidebarSection.js",
      "l": 141
    },
    "PM1": {
      "m": 3,
      "$": 5,
      "f": "packages/symbiote-node/layout/PanelMenu/PanelMenu.js",
      "l": 9
    },
    "CI": {
      "m": 0,
      "$": 3,
      "f": "packages/symbiote-node/menu/ContextMenu/ContextMenu.js",
      "l": 14
    },
    "CM": {
      "m": 3,
      "$": 4,
      "f": "packages/symbiote-node/menu/ContextMenu/ContextMenu.js",
      "l": 27
    },
    "GF": {
      "m": 1,
      "$": 2,
      "f": "packages/symbiote-node/node/GraphFrame/GraphFrame.js",
      "l": 14
    },
    "GN": {
      "m": 2,
      "$": 5,
      "f": "packages/symbiote-node/node/GraphNode/GraphNode.js",
      "l": 31
    },
    "NS1": {
      "m": 1,
      "f": "packages/symbiote-node/node/NodeSocket/NodeSocket.js",
      "l": 13
    },
    "PI": {
      "m": 2,
      "f": "packages/symbiote-node/node/PortItem/PortItem.js",
      "l": 14
    },
    "PI1": {
      "m": 0,
      "$": 7,
      "f": "packages/symbiote-node/palette/PaletteBrowser/PaletteBrowser.js",
      "l": 15
    },
    "PC1": {
      "m": 1,
      "$": 2,
      "f": "packages/symbiote-node/palette/PaletteBrowser/PaletteBrowser.js",
      "l": 35
    },
    "PB": {
      "m": 5,
      "$": 1,
      "f": "packages/symbiote-node/palette/PaletteBrowser/PaletteBrowser.js",
      "l": 56
    },
    "rR": {
      "m": 5,
      "f": "packages/symbiote-node/plugins/Readonly.js",
      "l": 11
    },
    "CS": {
      "m": 6,
      "f": "packages/symbiote-node/shapes/CircleShape.js",
      "l": 12
    },
    "CS1": {
      "m": 5,
      "f": "packages/symbiote-node/shapes/CommentShape.js",
      "l": 13
    },
    "DS": {
      "m": 7,
      "f": "packages/symbiote-node/shapes/DiamondShape.js",
      "l": 12
    },
    "NS2": {
      "m": 7,
      "f": "packages/symbiote-node/shapes/NodeShape.js",
      "l": 11
    },
    "PS": {
      "m": 6,
      "f": "packages/symbiote-node/shapes/PillShape.js",
      "l": 12
    },
    "RS": {
      "m": 4,
      "f": "packages/symbiote-node/shapes/RectShape.js",
      "l": 12
    },
    "SVG": {
      "m": 13,
      "f": "packages/symbiote-node/shapes/SVGShape.js",
      "l": 61
    },
    "QT": {
      "m": 6,
      "$": 3,
      "f": "packages/symbiote-node/toolbar/QuickToolbar/QuickToolbar.js",
      "l": 29
    },
    "AP": {
      "m": 4,
      "f": "src/node/adapters/pool.js",
      "l": 4
    },
    "PL": {
      "m": 3,
      "f": "src/node/plugins/plugin-loader.js",
      "l": 8
    },
    "CWS": {
      "m": 8,
      "f": "src/node/proxy/chat-ws-server.js",
      "l": 6
    },
    "MCP1": {
      "m": 9,
      "f": "src/node/proxy/mcp-multiplexer.js",
      "l": 101
    },
    "MCP2": {
      "m": 27,
      "f": "src/node/proxy/mcp-proxy.js",
      "l": 51
    },
    "TR": {
      "m": 5,
      "f": "src/node/proxy/task-router.js",
      "l": 4
    },
    "TI1": {
      "m": 7,
      "f": "src/node/proxy/tool-index.js",
      "l": 8
    },
    "SG1": {
      "m": 38,
      "f": "src/node/state-graph.js",
      "l": 146
    },
    "WC": {
      "m": 7,
      "f": "web/WsClient.js",
      "l": 13
    },
    "CB": {
      "m": 13,
      "$": 1,
      "f": "web/common/CellBg/CellBg.js",
      "l": 31
    },
    "AB": {
      "m": 4,
      "$": 13,
      "f": "web/components/AgentBoard/AgentBoard.js",
      "l": 21
    },
    "CS2": {
      "m": 4,
      "$": 5,
      "f": "web/components/ChatSidebar/ChatSidebar.js",
      "l": 8
    },
    "CSI": {
      "m": 1,
      "$": 14,
      "f": "web/components/ChatSidebar/ChatSidebarItem.js",
      "l": 5
    },
    "CSS": {
      "m": 1,
      "$": 11,
      "f": "web/components/ChatSidebar/ChatSidebarItem.js",
      "l": 90
    },
    "LO": {
      "m": 3,
      "$": 4,
      "f": "web/components/LoadingOverlay/LoadingOverlay.js",
      "l": 5
    },
    "PW": {
      "m": 5,
      "$": 1,
      "f": "web/components/PgWorkspace/PgWorkspace.js",
      "l": 17
    },
    "PT": {
      "m": 7,
      "$": 4,
      "f": "web/components/ProjectTabs/ProjectTabs.js",
      "l": 8
    },
    "PTI": {
      "m": 1,
      "$": 6,
      "f": "web/components/ProjectTabs/ProjectTabs.js",
      "l": 162
    },
    "CG": {
      "m": 28,
      "$": 18,
      "f": "web/components/canvas-graph.js",
      "l": 52
    },
    "CB1": {
      "m": 6,
      "$": 8,
      "f": "web/components/code-block.js",
      "l": 4
    },
    "CS3": {
      "m": 1,
      "$": 4,
      "f": "web/components/code-block.js",
      "l": 46
    },
    "CW": {
      "m": 1,
      "$": 3,
      "f": "web/components/event-feed/CodeWidget.js",
      "l": 3
    },
    "EW": {
      "m": 4,
      "$": 7,
      "f": "web/components/event-feed/EventWidget.js",
      "l": 3
    },
    "LW": {
      "m": 2,
      "$": 1,
      "f": "web/components/event-feed/ListWidget.js",
      "l": 3
    },
    "MGW": {
      "m": 3,
      "$": 1,
      "f": "web/components/event-feed/MiniGraphWidget.js",
      "l": 3
    },
    "FR": {
      "m": 2,
      "$": 2,
      "f": "web/components/follow-ribbon.js",
      "l": 10
    },
    "QO": {
      "m": 9,
      "$": 4,
      "f": "web/components/quick-open.js",
      "l": 3
    },
    "FC": {
      "m": 13,
      "f": "web/follow-controller.js",
      "l": 20
    },
    "AB1": {
      "m": 2,
      "$": 4,
      "f": "web/panels/ActionBoard/ActionBoard.js",
      "l": 7
    },
    "AC1": {
      "m": 3,
      "$": 1,
      "f": "web/panels/ActiveContext/ActiveContext.js",
      "l": 6
    },
    "AT": {
      "m": 5,
      "$": 1,
      "f": "web/panels/ActiveTasks/ActiveTasks.js",
      "l": 7
    },
    "AC2": {
      "m": 14,
      "$": 21,
      "f": "web/panels/AgentChat/AgentChat.js",
      "l": 31
    },
    "ALI": {
      "m": 1,
      "$": 7,
      "f": "web/panels/AgentListPanel/AgentListItem.js",
      "l": 4
    },
    "CL": {
      "m": 6,
      "$": 1,
      "f": "web/panels/ChatList/ChatList.js",
      "l": 9
    },
    "EI": {
      "m": 1,
      "$": 13,
      "f": "web/panels/EventItem/EventItem.js",
      "l": 6
    },
    "GM": {
      "m": 6,
      "$": 2,
      "f": "web/panels/GroupManager/GroupManager.js",
      "l": 6
    },
    "mM1": {
      "m": 15,
      "$": 1,
      "f": "web/panels/Marketplace/Marketplace.js",
      "l": 32
    },
    "PR": {
      "m": 7,
      "$": 2,
      "f": "web/panels/PeerReview/PeerReview.js",
      "l": 6
    },
    "PM2": {
      "m": 6,
      "$": 2,
      "f": "web/panels/PipelineManager/PipelineManager.js",
      "l": 6
    },
    "PI2": {
      "m": 1,
      "$": 3,
      "f": "web/panels/ProjectItem/ProjectItem.js",
      "l": 7
    },
    "PL1": {
      "m": 2,
      "$": 2,
      "f": "web/panels/ProjectList/ProjectList.js",
      "l": 7
    },
    "SP": {
      "m": 16,
      "f": "web/panels/SettingsPanel/SettingsPanel.js",
      "l": 17
    },
    "SLI": {
      "m": 0,
      "$": 2,
      "f": "web/panels/SkillLibraryPanel/SkillListItem.js",
      "l": 4
    },
    "SM1": {
      "m": 6,
      "$": 3,
      "f": "web/panels/SkillManager/SkillManager.js",
      "l": 7
    },
    "TE": {
      "m": 4,
      "$": 1,
      "f": "web/panels/ToolExplorer/ToolExplorer.js",
      "l": 6
    },
    "TP1": {
      "m": 4,
      "$": 1,
      "f": "web/panels/Topology/TopologyPanel.js",
      "l": 7
    },
    "WE": {
      "m": 6,
      "$": 3,
      "f": "web/panels/WorkflowExplorer/WorkflowExplorer.js",
      "l": 7
    },
    "CV1": {
      "m": 8,
      "$": 9,
      "f": "web/panels/code-viewer.js",
      "l": 19
    },
    "CP": {
      "m": 4,
      "$": 2,
      "f": "web/panels/ctx-panel.js",
      "l": 3
    },
    "DG": {
      "m": 25,
      "f": "web/panels/dep-graph.js",
      "l": 209
    },
    "FT": {
      "m": 14,
      "$": 4,
      "f": "web/panels/file-tree.js",
      "l": 3
    },
    "HP": {
      "m": 3,
      "$": 2,
      "f": "web/panels/health-panel.js",
      "l": 3
    },
    "OP": {
      "m": 2,
      "$": 2,
      "f": "web/panels/ops-panel.js",
      "l": 10
    },
    "CA": {
      "m": 7,
      "f": "web/services/chat-autocomplete.js",
      "l": 3
    },
    "CWC": {
      "m": 7,
      "f": "web/services/chat-ws-client.js",
      "l": 20
    }
  },
  "X": {
    "web/common/mcp-call.js": [
      "mC"
    ],
    "packages/project-graph-mcp/src/cli/cli.js": [
      "pH",
      "CLI"
    ],
    "demo/mock-data.js": [
      "CBI",
      "gE",
      "IE"
    ],
    "packages/agent-pool-mcp/src/agents/agent-resolver.js": [
      "rA",
      "AS",
      "AC3"
    ],
    "packages/agent-pool-mcp/src/cli.js": [
      "rC",
      "rI",
      "pV",
      "vS",
      "hC"
    ],
    "packages/agent-pool-mcp/src/runner/config.js": [
      "lC",
      "gR",
      "rC1"
    ],
    "packages/agent-pool-mcp/src/runner/gemini-runner.js": [
      "GS",
      "GS1"
    ],
    "packages/agent-pool-mcp/src/runner/history-cleanup.js": [
      "HC"
    ],
    "packages/agent-pool-mcp/src/runner/opencode-runner.js": [
      "OS"
    ],
    "packages/agent-pool-mcp/src/runner/process-manager.js": [
      "tC",
      "kG",
      "uC",
      "kA",
      "lC1",
      "SL"
    ],
    "packages/agent-pool-mcp/src/runner/provider-config.js": [
      "GE",
      "OCE",
      "TC2",
      "GC",
      "GC1",
      "OCC",
      "OCC1"
    ],
    "packages/agent-pool-mcp/src/runner/ssh.js": [
      "SA",
      "SS2",
      "RP",
      "RP1"
    ],
    "packages/agent-pool-mcp/src/runner/timeout-manager.js": [
      "PW1"
    ],
    "packages/agent-pool-mcp/src/runner/url-resolver.js": [
      "PU",
      "APP",
      "pU"
    ],
    "packages/agent-pool-mcp/src/scheduler/cron.js": [
      "mC2",
      "CR1"
    ],
    "packages/agent-pool-mcp/src/scheduler/scheduler.js": [
      "rS1",
      "aS1",
      "rS2",
      "lS1",
      "SR2",
      "DS1",
      "eD",
      "sD"
    ],
    "packages/agent-pool-mcp/src/scheduler/pipeline.js": [
      "cP",
      "lP",
      "gP",
      "rP",
      "gR1",
      "sR",
      "lR",
      "cR",
      "ARB",
      "SC",
      "bB1"
    ],
    "packages/agent-pool-mcp/src/scheduler/run-signals.js": [
      "wS",
      "cS",
      "dS1"
    ],
    "packages/symbiote-node/engine/GraphServer.js": [
      "cS1"
    ],
    "packages/agent-pool-mcp/src/tool-definitions.js": [
      "TD"
    ],
    "packages/agent-pool-mcp/src/tools/agents.js": [
      "lA"
    ],
    "packages/agent-pool-mcp/src/tools/board-store.js": [
      "BS1"
    ],
    "packages/agent-pool-mcp/src/tools/consult.js": [
      "cP1"
    ],
    "packages/agent-pool-mcp/src/tools/groups.js": [
      "cG1",
      "lG1",
      "gG1",
      "dG",
      "GNM"
    ],
    "packages/agent-pool-mcp/src/tools/markdown-parser.js": [
      "SY"
    ],
    "packages/agent-pool-mcp/src/tools/messaging.js": [
      "sM",
      "gM"
    ],
    "packages/agent-pool-mcp/src/tools/results.js": [
      "NC1",
      "cT",
      "TE1",
      "TS",
      "TP2",
      "cT1",
      "TR2",
      "fT",
      "cT2",
      "gT",
      "rT",
      "AT1",
      "AT2",
      "TR3"
    ],
    "packages/agent-pool-mcp/src/script-store.js": [
      "sS4",
      "lS2"
    ],
    "packages/agent-pool-mcp/src/tools/skills.js": [
      "lS3",
      "fS",
      "cS2",
      "dS2",
      "iS",
      "pS"
    ],
    "src/node/config-store.js": [
      "rC2",
      "wC",
      "PH",
      "aP1",
      "rP3",
      "uP1",
      "GS4",
      "GS5",
      "API",
      "API1",
      "GC2",
      "GC3",
      "lC3",
      "gC2",
      "cC3",
      "CM1",
      "CM2",
      "dC1",
      "uC1",
      "CS6",
      "CT",
      "PM3",
      "APM",
      "PM4"
    ],
    "packages/agent-pool-mcp/src/file-tracker.js": [
      "tF",
      "uF",
      "TF"
    ],
    "packages/agent-pool-mcp/src/git-sync.js": [
      "GR",
      "sM1",
      "AP1"
    ],
    "packages/agent-pool-mcp/src/workflow-index.js": [
      "TI2",
      "BT",
      "LL"
    ],
    "packages/project-graph-mcp/src/analysis/analysis-cache.js": [
      "CH",
      "CP5",
      "rC3",
      "wC1",
      "CV2"
    ],
    "packages/project-graph-mcp/src/analysis/complexity.js": [
      "CF1",
      "gC"
    ],
    "packages/project-graph-mcp/src/analysis/custom-rules.js": [
      "CR2",
      "CR3",
      "CR4",
      "PRS",
      "CR5"
    ],
    "packages/project-graph-mcp/src/analysis/db-analysis.js": [
      "DBS",
      "TU",
      "DBD"
    ],
    "packages/project-graph-mcp/src/analysis/dead-code.js": [
      "DC"
    ],
    "packages/project-graph-mcp/src/analysis/full-analysis.js": [
      "FA",
      "ASO"
    ],
    "packages/project-graph-mcp/src/analysis/jsdoc-checker.js": [
      "JSD",
      "JSD1"
    ],
    "packages/project-graph-mcp/src/analysis/jsdoc-generator.js": [
      "JSD2",
      "JSD3"
    ],
    "packages/project-graph-mcp/src/core/parser.js": [
      "JSF",
      "pF3",
      "SP1",
      "pP2",
      "APF"
    ],
    "packages/project-graph-mcp/src/analysis/large-files.js": [
      "LF"
    ],
    "packages/project-graph-mcp/src/analysis/outdated-patterns.js": [
      "OP1"
    ],
    "packages/project-graph-mcp/src/analysis/similar-functions.js": [
      "SF"
    ],
    "packages/project-graph-mcp/src/analysis/test-annotations.js": [
      "pA",
      "AF",
      "PT1",
      "TP3",
      "TF1",
      "TS1",
      "TS2"
    ],
    "packages/project-graph-mcp/src/analysis/type-checker.js": [
      "cT3"
    ],
    "packages/project-graph-mcp/src/analysis/undocumented.js": [
      "UF",
      "gU",
      "US"
    ],
    "packages/project-graph-mcp/src/compact/ai-context.js": [
      "AC4"
    ],
    "packages/project-graph-mcp/src/compact/compact-migrate.js": [
      "cM"
    ],
    "packages/project-graph-mcp/src/compact/compact.js": [
      "cP2"
    ],
    "packages/project-graph-mcp/src/compact/expand.js": [
      "eP",
      "eF"
    ],
    "packages/project-graph-mcp/src/compact/compress.js": [
      "cF3",
      "eC"
    ],
    "packages/project-graph-mcp/src/compact/ctx-resolver.js": [
      "CP6",
      "CRP",
      "CF2"
    ],
    "packages/project-graph-mcp/src/compact/ctx-to-jsdoc.js": [
      "CF3",
      "JSD4",
      "JSD5",
      "CC"
    ],
    "packages/project-graph-mcp/src/compact/doc-dialect.js": [
      "DD",
      "CD",
      "PD",
      "cS3",
      "CF4"
    ],
    "packages/project-graph-mcp/src/compact/framework-references.js": [
      "FR1"
    ],
    "packages/project-graph-mcp/src/compact/instructions.js": [
      "gI"
    ],
    "packages/project-graph-mcp/src/compact/jsdoc-builder.js": [
      "CP7",
      "JSD6",
      "JSD7"
    ],
    "packages/project-graph-mcp/src/compact/mode-config.js": [
      "gC1",
      "sC1",
      "MD1",
      "MW"
    ],
    "packages/project-graph-mcp/src/compact/split-declarations.js": [
      "sD1",
      "SLB"
    ],
    "packages/project-graph-mcp/src/compact/validate-pipeline.js": [
      "vP"
    ],
    "packages/project-graph-mcp/src/core/event-bus.js": [
      "TC4",
      "TR4",
      "TC5",
      "TR5",
      "TL"
    ],
    "packages/project-graph-mcp/src/core/file-walker.js": [
      "JSF1"
    ],
    "packages/project-graph-mcp/src/core/filters.js": [
      "gF",
      "sF",
      "aE",
      "rE",
      "rF",
      "pG",
      "ED",
      "EF"
    ],
    "packages/project-graph-mcp/src/core/graph-builder.js": [
      "mL",
      "bG",
      "cS4"
    ],
    "packages/project-graph-mcp/src/core/utils.js": [
      "eT"
    ],
    "packages/project-graph-mcp/src/core/workspace.js": [
      "sR2",
      "WR"
    ],
    "packages/project-graph-mcp/src/lang/lang-go.js": [
      "pG1"
    ],
    "packages/project-graph-mcp/src/lang/lang-python.js": [
      "pP3"
    ],
    "packages/project-graph-mcp/src/lang/lang-sql.js": [
      "SQL",
      "SQL1",
      "SQL2",
      "SQL3",
      "ORM"
    ],
    "packages/project-graph-mcp/src/lang/lang-typescript.js": [
      "TS3"
    ],
    "packages/project-graph-mcp/src/lang/lang-utils.js": [
      "SAC"
    ],
    "packages/project-graph-mcp/src/mcp/mcp-server.js": [
      "SS3"
    ],
    "packages/project-graph-mcp/src/mcp/tools.js": [
      "gG2",
      "gS",
      "FZ",
      "ex",
      "de",
      "us",
      "CC1",
      "iC"
    ],
    "src/node/server/backend-lifecycle.js": [
      "lB",
      "PF",
      "PF1",
      "eB",
      "SP2"
    ],
    "packages/project-graph-mcp/tests/lib/asserts.js": [
      "aN",
      "aS2",
      "aO",
      "aA",
      "OO",
      "aS3"
    ],
    "packages/project-graph-mcp/tests/lib/fixture.js": [
      "sc1"
    ],
    "packages/project-graph-mcp/tests/lib/mcp-client.js": [
      "SP3"
    ],
    "web/services/skeleton-parser.js": [
      "FG",
      "SG3"
    ],
    "packages/symbiote-node/canvas/AutoLayout.js": [
      "AL",
      "TL1"
    ],
    "packages/symbiote-node/core/GraphMermaid.js": [
      "TM1",
      "TG"
    ],
    "packages/symbiote-node/core/GraphText.js": [
      "TT",
      "TG1",
      "TE2"
    ],
    "packages/symbiote-node/core/Socket.js": [
      "ui"
    ],
    "src/node/plugins/telegram/index.js": [
      "in",
      "de2",
      "oA"
    ],
    "packages/symbiote-node/engine/AgentUICommands.js": [
      "la",
      "fo",
      "se",
      "pl",
      "no",
      "cu"
    ],
    "packages/symbiote-node/layout/LayoutRouter/LayoutRouter.js": [
      "na",
      "pQ",
      "bQ",
      "bH",
      "uP",
      "gR2",
      "DP2",
      "GP1",
      "GP2"
    ],
    "packages/symbiote-node/engine/HandlerLoader.js": [
      "lH1",
      "wH"
    ],
    "packages/symbiote-node/engine/Lifecycle.js": [
      "rL1"
    ],
    "packages/symbiote-node/layout/LayoutTree.js": [
      "se1",
      "de1",
      "gI2",
      "cP4",
      "cS7",
      "fN",
      "fP",
      "sP1",
      "jP",
      "rS3",
      "cl2",
      "AP4",
      "uN",
      "gN"
    ],
    "packages/symbiote-node/engine/Persistence.js": [
      "TF2",
      "FF",
      "dG1"
    ],
    "packages/symbiote-node/engine/Registry.js": [
      "NT",
      "rP2",
      "NT1",
      "lD",
      "fC",
      "BC",
      "NM",
      "CD1",
      "vP1",
      "lP1",
      "cR1"
    ],
    "packages/symbiote-node/engine/SocketTypes.js": [
      "ST1",
      "ST2",
      "ST3",
      "AST",
      "SC1"
    ],
    "packages/symbiote-node/engine/nanoid.js": [
      "na1"
    ],
    "packages/symbiote-node/engine/packs/transform/template-builder.handler.js": [
      "eP2"
    ],
    "packages/symbiote-node/engine/packs/video-pack.js": [
      "VP"
    ],
    "packages/symbiote-node/layout/LayoutRouter/routerSync.js": [
      "WR1",
      "PR1"
    ],
    "packages/symbiote-node/shapes/SVGShape.js": [
      "SVG1"
    ],
    "packages/symbiote-node/shapes/index.js": [
      "gS4",
      "rS4"
    ],
    "packages/symbiote-node/themes/Palette.js": [
      "aP"
    ],
    "packages/symbiote-node/themes/Skin.js": [
      "aS5"
    ],
    "packages/symbiote-node/themes/Theme.js": [
      "aT",
      "eT1"
    ],
    "src/node/adapters/claude.js": [
      "CA1"
    ],
    "src/node/adapters/gemini.js": [
      "GA"
    ],
    "src/node/adapters/index.js": [
      "rA1",
      "OCM",
      "CLI1",
      "PR2",
      "AL1",
      "AT3"
    ],
    "src/node/agents/agent-parser.js": [
      "pA2",
      "lA2",
      "AC6"
    ],
    "src/node/discovery/ws-client.js": [
      "WSC"
    ],
    "src/node/gateways/telegram.js": [
      "TG2"
    ],
    "src/node/memory-store.js": [
      "rM",
      "wM",
      "re3",
      "re4"
    ],
    "src/node/mlops/flywheel.js": [
      "lT",
      "lF",
      "FS1"
    ],
    "src/node/mlops/trajectory-compressor.js": [
      "cT5"
    ],
    "src/node/proxy/mcp-helpers.js": [
      "TR6"
    ],
    "src/node/proxy/mcp-http-handler.js": [
      "MHH"
    ],
    "src/node/server/api-routes-projects.js": [
      "PR3"
    ],
    "src/node/server/api-routes.js": [
      "cR4",
      "di"
    ],
    "web/state.js": [
      "co",
      "di1",
      "su",
      "oE",
      "ca"
    ],
    "src/node/server/context-injector.js": [
      "WR2",
      "GTR"
    ],
    "src/node/server/lint-service.js": [
      "lF1"
    ],
    "src/node/server/local-gateway.js": [
      "rS5",
      "GP3"
    ],
    "src/node/server/marketplace-registry.js": [
      "RBC",
      "IR"
    ],
    "src/node/server/mdns.js": [
      "rL2"
    ],
    "src/node/server/web-server.js": [
      "WS"
    ],
    "src/node/state-graph.js": [
      "SG2"
    ],
    "web/app.js": [
      "PP1",
      "ap"
    ],
    "web/dashboard-state.js": [
      "em"
    ],
    "web/common/icons.js": [
      "IH",
      "IWH"
    ],
    "web/common/ui-dialogs.js": [
      "uC2",
      "uP2",
      "uA"
    ],
    "web/utils/markdown-formatter.js": [
      "fE",
      "eH",
      "fM"
    ],
    "web/highlight.js": [
      "hi",
      "rM1",
      "SQL4",
      "JSO",
      "CSS1",
      "HTM",
      "YAM",
      "hS2",
      "INI",
      "hL",
      "hP1"
    ],
    "web/router-registry.js": [
      "PT4",
      "rS6",
      "gS5",
      "HS",
      "PS2",
      "SFS",
      "gL",
      "hS3"
    ],
    "web/stats-format.js": [
      "fS1"
    ],
    "web/utils/graph-layout.js": [
      "DC1"
    ]
  },
  "e": 586,
  "o": 390,
  "d": 94,
  "f": {
    "bin/": [
      "mcp-agent-portal.js"
    ],
    "demo/": [
      "build.js"
    ],
    "./": [
      "eslint.config.js",
      "index.js"
    ],
    "packages/agent-pool-mcp/": [
      "index.js"
    ],
    "packages/agent-pool-mcp/src/scheduler/": [
      "daemon.js",
      "resolve-content.js"
    ],
    "packages/agent-pool-mcp/src/": [
      "server.js"
    ],
    "packages/agent-pool-mcp/src/tools/": [
      "scripts.js"
    ],
    "packages/agent-pool-mcp/src/": [
      "config.js",
      "mcp-server.js"
    ],
    "packages/project-graph-mcp/src/cli/": [
      "cli-handlers.js"
    ],
    "packages/project-graph-mcp/src/mcp/": [
      "tool-defs.js"
    ],
    "packages/project-graph-mcp/src/network/": [
      "backend-lifecycle.js",
      "server.js"
    ],
    "packages/project-graph-mcp/tests/": [
      "check_canvas.js",
      "check_errors.js",
      "perf-graph-scale.js",
      "temp_debug.js"
    ],
    "packages/symbiote-node/canvas/": [
      "ForceWorker.js"
    ],
    "packages/symbiote-node/core/": [
      "Connection.js",
      "Frame.js"
    ],
    "packages/symbiote-node/demo/": [
      "benchmark.js",
      "demo.js"
    ],
    "packages/symbiote-node/engine/": [
      "History.js",
      "cli.js",
      "index.js"
    ],
    "packages/symbiote-node/engine/extensions/grok-bridge/": [
      "background.js",
      "content.js",
      "sidepanel.js",
      "websocket-interceptor.js"
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
      "template.handler.js",
      "timeline-build.handler.js"
    ],
    "packages/symbiote-node/engine/packs/util/": [
      "delay.handler.js",
      "log.handler.js"
    ],
    "packages/symbiote-node/": [
      "index.js"
    ],
    "packages/symbiote-node/layout/": [
      "index.js"
    ],
    "packages/symbiote-node/node/CtrlItem/": [
      "CtrlItem.js"
    ],
    "packages/symbiote-node/themes/": [
      "carbon.js",
      "dark.js",
      "ebook.js",
      "grey.js",
      "light.js",
      "neon.js",
      "pcb.js",
      "synthwave.js"
    ],
    "src/node/adapters/": [
      "base.js",
      "stubs.js"
    ],
    "src/node/plugins/github/": [
      "index.js"
    ],
    "src/node/plugins/slack/": [
      "index.js"
    ],
    "src/node/server/": [
      "backend.js"
    ],
    "test/integration/": [
      "opencode-e2e.js"
    ],
    "web/": [
      "state-sync.js"
    ]
  },
  "a": {
    "./": [
      ".cursorrules",
      ".gitignore",
      ".gitmodules",
      ".windsurfrules",
      "ARCHITECTURE.md",
      "README.md",
      "package-lock.json",
      "package.json"
    ],
    "demo/": [
      "index.html"
    ],
    "packages/agent-pool-mcp/": [
      ".git",
      ".gitignore",
      "ARCHITECTURE.md",
      "GUIDE.md",
      "LICENSE",
      "README.md",
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
    "packages/agent-pool-mcp/": [
      "package.json"
    ],
    ".agent-portal/workflows/debug_protocol/": [
      "01-reproduce.md",
      "02-localize.md",
      "03-hypothesize.md",
      "04-verify-hypothesis.md",
      "05-fix.md",
      "06-verify-fix.md",
      "07-complete.md"
    ],
    ".agent-portal/workflows/meta/": [
      "skill-reflect.md"
    ],
    ".agent-portal/workflows/": [
      "test-integration-workflow.md"
    ],
    "packages/project-graph-mcp/": [
      ".git",
      ".gitignore",
      ".gitmodules",
      ".graphignore",
      ".npmignore",
      ".pgignore",
      "ARCHITECTURE.md",
      "CHANGELOG.md",
      "CONFIGURATION.md",
      "GUIDE.md",
      "LICENSE",
      "README.md",
      "package-lock.json",
      "package.json",
      "project.ctx"
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
      "fix-ctx-quality.mjs",
      "restore-ctx-params.mjs",
      "theater-test.mjs"
    ],
    "packages/project-graph-mcp/src/analysis/": [
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
    "packages/project-graph-mcp/src/cli/": [
      "cli-handlers.ctx",
      "cli-handlers.ctx.md",
      "cli.ctx",
      "cli.ctx.md"
    ],
    "packages/project-graph-mcp/src/compact/": [
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
    "packages/project-graph-mcp/src/core/": [
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
    "packages/project-graph-mcp/src/lang/": [
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
    "packages/project-graph-mcp/src/mcp/": [
      "mcp-server.ctx",
      "mcp-server.ctx.md",
      "tool-defs.ctx",
      "tools.ctx",
      "tools.ctx.md"
    ],
    "packages/project-graph-mcp/src/network/": [
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
    "packages/project-graph-mcp/src/node/proxy/": [
      "project.ctx"
    ],
    "packages/project-graph-mcp/tests/": [
      "compact.test.ctx",
      "consolidated.test.ctx",
      "mcp.test.ctx",
      "orm.test.ctx",
      "parser.test.ctx",
      "roundtrip.test.ctx",
      "test_flat_edges.mjs",
      "ws-monitor-test.ctx"
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
      "package.json"
    ],
    "packages/symbiote-node/canvas/Breadcrumb/": [
      "Breadcrumb.css.js",
      "Breadcrumb.tpl.js"
    ],
    "packages/symbiote-node/canvas/GraphTabs/": [
      "GraphTabs.css.js",
      "GraphTabs.tpl.js"
    ],
    "packages/symbiote-node/canvas/Minimap/": [
      "Minimap.css.js",
      "Minimap.tpl.js"
    ],
    "packages/symbiote-node/canvas/NodeCanvas/": [
      "NodeCanvas.css.js",
      "NodeCanvas.tpl.js"
    ],
    "packages/symbiote-node/canvas/NodeSearch/": [
      "NodeSearch.css.js",
      "NodeSearch.tpl.js"
    ],
    "packages/symbiote-node/demo/AiChat/": [
      "AiChat.css.js",
      "AiChat.tpl.js"
    ],
    "packages/symbiote-node/demo/EventLog/": [
      "EventLog.css.js",
      "EventLog.tpl.js"
    ],
    "packages/symbiote-node/demo/": [
      "benchmark.html",
      "index.html",
      "tree-layout-test.html"
    ],
    "packages/symbiote-node/engine/extensions/grok-bridge/": [
      "manifest.json",
      "sidepanel.html"
    ],
    "packages/symbiote-node/engine/": [
      "package.json"
    ],
    "packages/symbiote-node/inspector/InspectorPanel/": [
      "InspectorPanel.css.js",
      "InspectorPanel.tpl.js"
    ],
    "packages/symbiote-node/inspector/TemplatePreview/": [
      "TemplatePreview.css.js",
      "TemplatePreview.tpl.js"
    ],
    "packages/symbiote-node/layout/ActionZone/": [
      "ActionZone.css.js",
      "ActionZone.tpl.js"
    ],
    "packages/symbiote-node/layout/Layout/": [
      "Layout.css.js",
      "Layout.tpl.js"
    ],
    "packages/symbiote-node/layout/LayoutNode/": [
      "LayoutNode.css.js",
      "LayoutNode.tpl.js"
    ],
    "packages/symbiote-node/layout/LayoutPreview/": [
      "LayoutPreview.css.js",
      "LayoutPreview.tpl.js"
    ],
    "packages/symbiote-node/layout/LayoutSidebar/": [
      "LayoutSidebar.css.js",
      "LayoutSidebar.tpl.js"
    ],
    "packages/symbiote-node/layout/PanelMenu/": [
      "PanelMenu.css.js",
      "PanelMenu.tpl.js"
    ],
    "packages/symbiote-node/menu/ContextMenu/": [
      "ContextMenu.css.js",
      "ContextMenu.tpl.js"
    ],
    "packages/symbiote-node/node/CtrlItem/": [
      "CtrlItem.css.js",
      "CtrlItem.tpl.js"
    ],
    "packages/symbiote-node/node/GraphFrame/": [
      "GraphFrame.css.js",
      "GraphFrame.tpl.js"
    ],
    "packages/symbiote-node/node/GraphNode/": [
      "GraphNode.css.js",
      "GraphNode.tpl.js"
    ],
    "packages/symbiote-node/node/NodeSocket/": [
      "NodeSocket.tpl.js"
    ],
    "packages/symbiote-node/node/PortItem/": [
      "PortItem.css.js",
      "PortItem.tpl.js"
    ],
    "packages/symbiote-node/palette/PaletteBrowser/": [
      "PaletteBrowser.css.js",
      "PaletteBrowser.tpl.js"
    ],
    "packages/symbiote-node/toolbar/QuickToolbar/": [
      "QuickToolbar.css.js",
      "QuickToolbar.tpl.js"
    ],
    "src/iso/": [
      "README.md"
    ],
    "src/node/adapters/": [
      "adapters.ctx"
    ],
    "src/node/": [
      "config-store.ctx"
    ],
    "src/node/plugins/": [
      "plugin-loader.ctx"
    ],
    "src/node/proxy/": [
      "chat-ws-server.ctx",
      "chat-ws-server.ctx.md",
      "mcp-multiplexer.ctx",
      "mcp-proxy.ctx",
      "project.ctx",
      "task-router.ctx",
      "task-router.ctx.md",
      "tool-index.ctx",
      "tool-index.ctx.md"
    ],
    "src/node/server/": [
      "api-routes.ctx",
      "web-server.ctx"
    ],
    "web/": [
      "app.ctx",
      "app.ctx.md",
      "dashboard-state.ctx",
      "dashboard-state.ctx.md",
      "dashboard.ctx",
      "dashboard.ctx.md",
      "highlight.ctx",
      "highlight.ctx.md",
      "index.html",
      "state.ctx",
      "state.ctx.md",
      "style.css"
    ],
    "web/common/CellBg/": [
      "CellBg.css.js",
      "CellBg.tpl.js"
    ],
    "web/common/": [
      "ui-shared.css.js"
    ],
    "web/components/AgentBoard/": [
      "AgentBoard.css.js",
      "AgentBoard.tpl.js"
    ],
    "web/components/ChatSidebar/": [
      "ChatSidebar.tpl.js"
    ],
    "web/components/LoadingOverlay/": [
      "LoadingOverlay.css.js",
      "LoadingOverlay.tpl.js"
    ],
    "web/components/PgWorkspace/": [
      "PgWorkspace.tpl.js"
    ],
    "web/components/ProjectTabs/": [
      "ProjectTabs.css.js",
      "ProjectTabs.tpl.js"
    ],
    "web/components/": [
      "code-block.ctx",
      "code-block.ctx.md",
      "quick-open.ctx",
      "quick-open.ctx.md"
    ],
    "web/panels/ActionBoard/": [
      "ActionBoard.css.ctx",
      "ActionBoard.ctx",
      "ActionBoard.ctx.md",
      "ActionBoard.tpl.ctx",
      "ActionBoard.tpl.js"
    ],
    "web/panels/ActiveContext/": [
      "ActiveContext.tpl.js"
    ],
    "web/panels/ActiveTasks/": [
      "ActiveTasks.tpl.js"
    ],
    "web/panels/AgentChat/": [
      "AgentChat.css.js",
      "AgentChat.tpl.js"
    ],
    "web/panels/AgentListPanel/": [
      "AgentListItem.css.js",
      "AgentListItem.tpl.js"
    ],
    "web/panels/ChatList/": [
      "ChatList.css.js",
      "ChatList.tpl.js"
    ],
    "web/panels/EventItem/": [
      "EventItem.css.ctx",
      "EventItem.css.js",
      "EventItem.ctx",
      "EventItem.ctx.md",
      "EventItem.tpl.ctx",
      "EventItem.tpl.js"
    ],
    "web/panels/GroupManager/": [
      "GroupManager.tpl.js"
    ],
    "web/panels/Marketplace/": [
      "Marketplace.css.js",
      "Marketplace.tpl.js"
    ],
    "web/panels/PeerReview/": [
      "PeerReview.tpl.js"
    ],
    "web/panels/PipelineManager/": [
      "PipelineManager.tpl.js"
    ],
    "web/panels/ProjectItem/": [
      "ProjectItem.css.ctx",
      "ProjectItem.css.js",
      "ProjectItem.ctx",
      "ProjectItem.ctx.md",
      "ProjectItem.tpl.ctx",
      "ProjectItem.tpl.js"
    ],
    "web/panels/ProjectList/": [
      "ProjectList.css.ctx",
      "ProjectList.ctx",
      "ProjectList.ctx.md",
      "ProjectList.tpl.ctx",
      "ProjectList.tpl.js"
    ],
    "web/panels/SettingsPanel/": [
      "SettingsPanel.css.ctx",
      "SettingsPanel.css.js",
      "SettingsPanel.ctx",
      "SettingsPanel.ctx.md",
      "SettingsPanel.tpl.ctx",
      "SettingsPanel.tpl.js"
    ],
    "web/panels/SkillLibraryPanel/": [
      "SkillListItem.css.js",
      "SkillListItem.tpl.js"
    ],
    "web/panels/SkillManager/": [
      "SkillManager.tpl.js"
    ],
    "web/panels/ToolExplorer/": [
      "ToolExplorer.css.js",
      "ToolExplorer.tpl.js"
    ],
    "web/panels/Topology/": [
      "TopologyPanel.css.js",
      "TopologyPanel.tpl.js"
    ],
    "web/panels/WorkflowExplorer/": [
      "WorkflowExplorer.css.js",
      "WorkflowExplorer.tpl.js"
    ],
    "web/panels/": [
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
    "web/playground/": [
      "cell-bg.html"
    ]
  },
  "I": {
    "bin/mcp-agent-portal.js": [
      "url",
      "path",
      "child_process",
      "fs",
      "os",
      "http",
      "ws"
    ],
    "demo/build.js": [
      "node:fs",
      "node:path",
      "node:url"
    ],
    "demo/demo-adapter.js": [
      "./mock-data.js"
    ],
    "eslint.config.js": [
      "globals"
    ],
    "index.js": [
      "node:process",
      "./src/node/server/backend-lifecycle.js"
    ],
    "packages/agent-pool-mcp/index.js": [
      "./src/cli.js"
    ],
    "packages/agent-pool-mcp/src/agents/agent-resolver.js": [
      "node:fs",
      "node:path"
    ],
    "packages/agent-pool-mcp/src/cli.js": [
      "node:child_process",
      "node:fs",
      "node:path",
      "node:os",
      "./runner/config.js"
    ],
    "packages/agent-pool-mcp/src/runner/config.js": [
      "node:fs",
      "node:path",
      "node:os"
    ],
    "packages/agent-pool-mcp/src/runner/gemini-runner.js": [
      "node:child_process",
      "node:os",
      "node:path",
      "node:fs",
      "./process-manager.js",
      "./config.js",
      "./ssh.js",
      "../tools/results.js",
      "./timeout-manager.js",
      "./provider-config.js",
      "./url-resolver.js"
    ],
    "packages/agent-pool-mcp/src/runner/history-cleanup.js": [
      "node:child_process",
      "./config.js"
    ],
    "packages/agent-pool-mcp/src/runner/opencode-runner.js": [
      "node:child_process",
      "node:os",
      "node:path",
      "node:fs",
      "./process-manager.js",
      "../tools/results.js",
      "./config.js",
      "../tools/groups.js",
      "./timeout-manager.js",
      "./provider-config.js",
      "./url-resolver.js"
    ],
    "packages/agent-pool-mcp/src/runner/process-manager.js": [
      "node:child_process"
    ],
    "packages/agent-pool-mcp/src/runner/provider-config.js": [
      "node:fs",
      "node:path",
      "node:os"
    ],
    "packages/agent-pool-mcp/src/runner/timeout-manager.js": [
      "./process-manager.js"
    ],
    "packages/agent-pool-mcp/src/runner/url-resolver.js": [
      "node:fs",
      "node:path",
      "node:http"
    ],
    "packages/agent-pool-mcp/src/scheduler/daemon.js": [
      "node:fs",
      "node:child_process",
      "node:path",
      "./cron.js",
      "../tools/groups.js",
      "../runner/config.js",
      "../runner/ssh.js",
      "../runner/process-manager.js",
      "./run-signals.js"
    ],
    "packages/agent-pool-mcp/src/scheduler/pipeline.js": [
      "node:fs",
      "node:path",
      "node:crypto",
      "./scheduler.js",
      "../runner/process-manager.js",
      "./run-signals.js"
    ],
    "packages/agent-pool-mcp/src/scheduler/resolve-content.js": [
      "node:path",
      "node:url"
    ],
    "packages/agent-pool-mcp/src/scheduler/run-signals.js": [
      "node:fs",
      "node:path",
      "node:crypto"
    ],
    "packages/agent-pool-mcp/src/scheduler/scheduler.js": [
      "node:fs",
      "node:child_process",
      "node:path",
      "node:crypto",
      "node:url",
      "./cron.js"
    ],
    "packages/agent-pool-mcp/src/server.js": [
      "@modelcontextprotocol/sdk/server/index.js",
      "@modelcontextprotocol/sdk/server/stdio.js",
      "@modelcontextprotocol/sdk/types.js",
      "node:crypto",
      "./runner/gemini-runner.js",
      "./runner/opencode-runner.js",
      "./runner/config.js",
      "./runner/history-cleanup.js",
      "./runner/process-manager.js",
      "./tools/results.js",
      "./tools/skills.js",
      "./tools/consult.js",
      "./scheduler/scheduler.js",
      "./scheduler/pipeline.js",
      "./tools/groups.js",
      "./tools/messaging.js",
      "./tools/scripts.js",
      "./tools/board-store.js",
      "./agents/agent-resolver.js",
      "../../agent-pool-mcp/src/file-tracker.js",
      "./tool-definitions.js",
      "node:fs",
      "node:path",
      "node:os",
      "node:url",
      "node:child_process"
    ],
    "packages/agent-pool-mcp/src/tools/agents.js": [
      "node:fs",
      "node:path",
      "./markdown-parser.js",
      "./skills.js"
    ],
    "packages/agent-pool-mcp/src/tools/board-store.js": [
      "node:fs",
      "node:path"
    ],
    "packages/agent-pool-mcp/src/tools/consult.js": [
      "node:crypto",
      "../runner/gemini-runner.js",
      "./results.js"
    ],
    "packages/agent-pool-mcp/src/tools/groups.js": [
      "node:fs",
      "node:path"
    ],
    "packages/agent-pool-mcp/src/tools/messaging.js": [
      "node:fs",
      "node:path"
    ],
    "packages/agent-pool-mcp/src/tools/results.js": [
      "../runner/process-manager.js",
      "./board-store.js"
    ],
    "packages/agent-pool-mcp/src/tools/scripts.js": [
      "node:fs",
      "node:path"
    ],
    "packages/agent-pool-mcp/src/tools/skills.js": [
      "node:path",
      "node:fs",
      "node:os",
      "node:url",
      "./markdown-parser.js"
    ],
    "packages/agent-pool-mcp/src/config.js": [
      "node:fs",
      "node:path",
      "node:os"
    ],
    "packages/agent-pool-mcp/src/file-tracker.js": [
      "node:fs",
      "node:path"
    ],
    "packages/agent-pool-mcp/src/git-sync.js": [
      "child_process",
      "fs",
      "path"
    ],
    "packages/agent-pool-mcp/src/mcp-server.js": [
      "./config.js",
      "./git-sync.js",
      "./workflow-index.js",
      "node:fs",
      "node:path",
      "node:url",
      "child_process",
      "./script-store.js",
      "./file-tracker.js"
    ],
    "packages/agent-pool-mcp/src/script-store.js": [
      "node:fs",
      "node:path"
    ],
    "packages/agent-pool-mcp/src/workflow-index.js": [
      "node:fs",
      "node:path"
    ],
    "packages/project-graph-mcp/src/analysis/analysis-cache.js": [
      "fs",
      "path",
      "crypto"
    ],
    "packages/project-graph-mcp/src/analysis/complexity.js": [
      "fs",
      "path",
      "../../vendor/acorn.mjs",
      "../../vendor/walk.mjs",
      "../core/filters.js"
    ],
    "packages/project-graph-mcp/src/analysis/custom-rules.js": [
      "fs",
      "path",
      "url",
      "../core/filters.js"
    ],
    "packages/project-graph-mcp/src/analysis/db-analysis.js": [
      "../core/parser.js",
      "../core/graph-builder.js"
    ],
    "packages/project-graph-mcp/src/analysis/dead-code.js": [
      "fs",
      "path",
      "../../vendor/acorn.mjs",
      "../../vendor/walk.mjs",
      "../core/filters.js"
    ],
    "packages/project-graph-mcp/src/analysis/full-analysis.js": [
      "fs",
      "path",
      "./dead-code.js",
      "./undocumented.js",
      "./similar-functions.js",
      "./complexity.js",
      "./large-files.js",
      "./outdated-patterns.js",
      "./db-analysis.js",
      "./jsdoc-checker.js",
      "./analysis-cache.js",
      "../core/filters.js",
      "../core/workspace.js"
    ],
    "packages/project-graph-mcp/src/analysis/jsdoc-checker.js": [
      "fs",
      "path",
      "../../vendor/acorn.mjs",
      "../../vendor/walk.mjs",
      "../core/filters.js"
    ],
    "packages/project-graph-mcp/src/analysis/jsdoc-generator.js": [
      "fs",
      "path",
      "../../vendor/acorn.mjs",
      "../../vendor/walk.mjs",
      "../core/workspace.js"
    ],
    "packages/project-graph-mcp/src/analysis/large-files.js": [
      "fs",
      "path",
      "../../vendor/acorn.mjs",
      "../../vendor/walk.mjs",
      "../core/filters.js"
    ],
    "packages/project-graph-mcp/src/analysis/outdated-patterns.js": [
      "fs",
      "path",
      "../../vendor/acorn.mjs",
      "../../vendor/walk.mjs",
      "../core/filters.js"
    ],
    "packages/project-graph-mcp/src/analysis/similar-functions.js": [
      "fs",
      "path",
      "../../vendor/acorn.mjs",
      "../../vendor/walk.mjs",
      "../core/filters.js"
    ],
    "packages/project-graph-mcp/src/analysis/test-annotations.js": [
      "fs",
      "path"
    ],
    "packages/project-graph-mcp/src/analysis/type-checker.js": [
      "child_process",
      "fs",
      "path"
    ],
    "packages/project-graph-mcp/src/analysis/undocumented.js": [
      "fs",
      "path",
      "../../vendor/acorn.mjs",
      "../../vendor/walk.mjs",
      "../core/filters.js"
    ],
    "packages/project-graph-mcp/src/cli/cli-handlers.js": [
      "../mcp/tools.js",
      "../analysis/test-annotations.js",
      "../core/filters.js",
      "../compact/instructions.js",
      "../analysis/undocumented.js",
      "../analysis/dead-code.js",
      "../analysis/jsdoc-generator.js",
      "../analysis/similar-functions.js",
      "../analysis/complexity.js",
      "../analysis/large-files.js",
      "../analysis/outdated-patterns.js",
      "../analysis/full-analysis.js",
      "../compact/compress.js",
      "../compact/doc-dialect.js",
      "../mcp/tools.js",
      "../core/parser.js",
      "../core/workspace.js",
      "../analysis/jsdoc-checker.js",
      "../analysis/type-checker.js",
      "../compact/compact.js",
      "../compact/ctx-to-jsdoc.js",
      "../compact/mode-config.js",
      "../compact/compact-migrate.js"
    ],
    "packages/project-graph-mcp/src/cli/cli.js": [
      "./cli-handlers.js"
    ],
    "packages/project-graph-mcp/src/compact/ai-context.js": [
      "../core/utils.js",
      "path",
      "../mcp/tools.js",
      "./doc-dialect.js",
      "./compress.js",
      "../core/parser.js",
      "fs"
    ],
    "packages/project-graph-mcp/src/compact/compact-migrate.js": [
      "../core/file-walker.js",
      "fs",
      "path",
      "child_process",
      "./compact.js",
      "./validate-pipeline.js",
      "./mode-config.js"
    ],
    "packages/project-graph-mcp/src/compact/compact.js": [
      "./ctx-resolver.js",
      "../core/file-walker.js",
      "fs",
      "path",
      "../../vendor/terser.mjs"
    ],
    "packages/project-graph-mcp/src/compact/compress.js": [
      "../core/utils.js",
      "fs",
      "path",
      "../../vendor/terser.mjs",
      "../../vendor/acorn.mjs",
      "../../vendor/walk.mjs"
    ],
    "packages/project-graph-mcp/src/compact/ctx-resolver.js": [
      "fs",
      "path"
    ],
    "packages/project-graph-mcp/src/compact/ctx-to-jsdoc.js": [
      "../core/file-walker.js",
      "./ctx-resolver.js",
      "./jsdoc-builder.js",
      "fs",
      "path",
      "../../vendor/acorn.mjs",
      "../../vendor/walk.mjs"
    ],
    "packages/project-graph-mcp/src/compact/doc-dialect.js": [
      "fs",
      "path",
      "child_process",
      "crypto",
      "../analysis/analysis-cache.js",
      "../analysis/complexity.js",
      "../analysis/undocumented.js",
      "../analysis/jsdoc-checker.js"
    ],
    "packages/project-graph-mcp/src/compact/expand.js": [
      "./jsdoc-builder.js",
      "./ctx-resolver.js",
      "../core/file-walker.js",
      "fs",
      "path",
      "../../vendor/terser.mjs",
      "../../vendor/acorn.mjs",
      "../../vendor/walk.mjs"
    ],
    "packages/project-graph-mcp/src/compact/framework-references.js": [
      "fs",
      "path",
      "url",
      "../analysis/custom-rules.js"
    ],
    "packages/project-graph-mcp/src/compact/instructions.js": [
      "fs",
      "path",
      "url"
    ],
    "packages/project-graph-mcp/src/compact/mode-config.js": [
      "fs",
      "path"
    ],
    "packages/project-graph-mcp/src/compact/split-declarations.js": [
      "../../vendor/acorn.mjs"
    ],
    "packages/project-graph-mcp/src/compact/validate-pipeline.js": [
      "../core/file-walker.js",
      "../core/utils.js",
      "fs",
      "path",
      "node:child_process",
      "../../vendor/acorn.mjs",
      "./ctx-to-jsdoc.js",
      "./expand.js",
      "../core/parser.js",
      "../mcp/tools.js",
      "./doc-dialect.js",
      "../../vendor/walk.mjs",
      "./split-declarations.js"
    ],
    "packages/project-graph-mcp/src/core/event-bus.js": [
      "node:events"
    ],
    "packages/project-graph-mcp/src/core/file-walker.js": [
      "fs",
      "path"
    ],
    "packages/project-graph-mcp/src/core/filters.js": [
      "fs",
      "path"
    ],
    "packages/project-graph-mcp/src/core/parser.js": [
      "fs",
      "path",
      "../../vendor/acorn.mjs",
      "../../vendor/walk.mjs",
      "./filters.js",
      "../lang/lang-typescript.js",
      "../lang/lang-python.js",
      "../lang/lang-go.js",
      "../lang/lang-sql.js"
    ],
    "packages/project-graph-mcp/src/core/workspace.js": [
      "path",
      "url"
    ],
    "packages/project-graph-mcp/src/lang/lang-go.js": [
      "./lang-utils.js"
    ],
    "packages/project-graph-mcp/src/lang/lang-python.js": [
      "./lang-utils.js"
    ],
    "packages/project-graph-mcp/src/lang/lang-typescript.js": [
      "./lang-utils.js"
    ],
    "packages/project-graph-mcp/src/mcp/mcp-server.js": [
      "fs",
      "path",
      "url",
      "./tool-defs.js",
      "../core/event-bus.js",
      "./tools.js",
      "../analysis/test-annotations.js",
      "../core/filters.js",
      "../compact/instructions.js",
      "../analysis/undocumented.js",
      "../analysis/dead-code.js",
      "../analysis/jsdoc-generator.js",
      "../analysis/similar-functions.js",
      "../analysis/complexity.js",
      "../analysis/large-files.js",
      "../analysis/outdated-patterns.js",
      "../analysis/full-analysis.js",
      "../analysis/custom-rules.js",
      "../compact/framework-references.js",
      "../core/workspace.js",
      "../analysis/db-analysis.js",
      "../compact/compress.js",
      "../compact/doc-dialect.js",
      "./tools.js",
      "../core/parser.js",
      "../compact/ai-context.js",
      "../analysis/jsdoc-checker.js",
      "../analysis/type-checker.js",
      "../compact/compact.js",
      "../compact/expand.js",
      "../compact/validate-pipeline.js",
      "../compact/ctx-to-jsdoc.js",
      "../compact/mode-config.js",
      "fs"
    ],
    "packages/project-graph-mcp/src/mcp/tools.js": [
      "../core/parser.js",
      "../core/graph-builder.js",
      "fs",
      "child_process",
      "path"
    ],
    "packages/project-graph-mcp/src/network/backend-lifecycle.js": [
      "node:fs",
      "node:path"
    ],
    "packages/project-graph-mcp/src/network/server.js": [
      "node:path",
      "node:fs"
    ],
    "packages/project-graph-mcp/tests/lib/asserts.js": [
      "node:assert/strict"
    ],
    "packages/project-graph-mcp/tests/lib/fixture.js": [
      "fs",
      "path"
    ],
    "packages/project-graph-mcp/tests/lib/mcp-client.js": [
      "child_process",
      "fs",
      "path",
      "node:assert/strict"
    ],
    "packages/project-graph-mcp/tests/perf-graph-scale.js": [
      "../vendor/symbiote-node/core/Editor.js",
      "../vendor/symbiote-node/core/Node.js",
      "../vendor/symbiote-node/core/Connection.js",
      "../vendor/symbiote-node/core/Socket.js",
      "../vendor/symbiote-node/canvas/AutoLayout.js"
    ],
    "packages/symbiote-node/canvas/Breadcrumb/Breadcrumb.js": [
      "@symbiotejs/symbiote",
      "./Breadcrumb.tpl.js",
      "./Breadcrumb.css.js"
    ],
    "packages/symbiote-node/canvas/CanvasConnectionRenderer.js": [
      "../shapes/index.js"
    ],
    "packages/symbiote-node/canvas/ConnectionRenderer.js": [
      "../shapes/index.js"
    ],
    "packages/symbiote-node/canvas/FrameManager.js": [
      "../interactions/Drag.js"
    ],
    "packages/symbiote-node/canvas/GraphTabs/GraphTabs.js": [
      "@symbiotejs/symbiote",
      "./GraphTabs.tpl.js",
      "./GraphTabs.css.js"
    ],
    "packages/symbiote-node/canvas/Minimap/Minimap.js": [
      "@symbiotejs/symbiote",
      "./Minimap.tpl.js",
      "./Minimap.css.js"
    ],
    "packages/symbiote-node/canvas/NodeCanvas/NodeCanvas.js": [
      "@symbiotejs/symbiote",
      "./NodeCanvas.tpl.js",
      "./NodeCanvas.css.js",
      "../../interactions/Drag.js",
      "../../interactions/Zoom.js",
      "../../interactions/ConnectFlow.js",
      "../../interactions/Selector.js",
      "../../interactions/SnapGrid.js",
      "../../themes/Theme.js",
      "../../themes/Palette.js",
      "../../themes/Skin.js",
      "../NodeViewManager.js",
      "../FrameManager.js",
      "../SelectionSync.js",
      "../CanvasViewport.js",
      "../ConnectionRenderer.js",
      "../CanvasConnectionRenderer.js",
      "../PseudoConnection.js",
      "../ViewportActions.js",
      "../SubgraphManager.js",
      "../../menu/ContextMenu/ContextMenu.js",
      "../../toolbar/QuickToolbar/QuickToolbar.js",
      "../../node/GraphFrame/GraphFrame.js",
      "../../inspector/InspectorPanel/InspectorPanel.js",
      "../Minimap/Minimap.js",
      "../NodeSearch/NodeSearch.js",
      "../Breadcrumb/Breadcrumb.js",
      "../AutoLayout.js"
    ],
    "packages/symbiote-node/canvas/NodeSearch/NodeSearch.js": [
      "@symbiotejs/symbiote",
      "./NodeSearch.tpl.js",
      "./NodeSearch.css.js"
    ],
    "packages/symbiote-node/canvas/NodeViewManager.js": [
      "../interactions/Drag.js",
      "../interactions/Selector.js",
      "@symbiotejs/symbiote",
      "../shapes/index.js"
    ],
    "packages/symbiote-node/core/Connection.js": [
      "./Socket.js"
    ],
    "packages/symbiote-node/core/Editor.js": [
      "./Connection.js",
      "./Node.js",
      "./Socket.js",
      "./Frame.js"
    ],
    "packages/symbiote-node/core/Frame.js": [
      "./Socket.js"
    ],
    "packages/symbiote-node/core/Node.js": [
      "./Socket.js"
    ],
    "packages/symbiote-node/core/SubgraphNode.js": [
      "./Node.js",
      "./Editor.js",
      "./Socket.js"
    ],
    "packages/symbiote-node/demo/AiChat/AiChat.js": [
      "@symbiotejs/symbiote",
      "./AiChat.tpl.js",
      "./AiChat.css.js"
    ],
    "packages/symbiote-node/demo/EventLog/EventLog.js": [
      "@symbiotejs/symbiote",
      "./EventLog.tpl.js",
      "./EventLog.css.js"
    ],
    "packages/symbiote-node/demo/benchmark.js": [
      "../index.js",
      "../canvas/NodeCanvas/NodeCanvas.js",
      "../node/GraphNode/GraphNode.js"
    ],
    "packages/symbiote-node/demo/demo.js": [
      "../index.js",
      "../canvas/NodeCanvas/NodeCanvas.js",
      "../node/GraphNode/GraphNode.js",
      "../layout/Layout/Layout.js",
      "../palette/PaletteBrowser/PaletteBrowser.js",
      "./EventLog/EventLog.js",
      "./AiChat/AiChat.js",
      "../layout/LayoutSidebar/LayoutSidebar.js"
    ],
    "packages/symbiote-node/engine/Executor.js": [
      "./Registry.js",
      "./Graph.js",
      "./Lifecycle.js"
    ],
    "packages/symbiote-node/engine/Graph.js": [
      "./nanoid.js",
      "./Registry.js",
      "./SocketTypes.js"
    ],
    "packages/symbiote-node/engine/GraphServer.js": [
      "node:http",
      "node:fs/promises",
      "node:path",
      "ws",
      "./Graph.js",
      "./Executor.js",
      "./Registry.js",
      "./HandlerLoader.js"
    ],
    "packages/symbiote-node/engine/HandlerLoader.js": [
      "node:fs/promises",
      "node:path",
      "node:fs",
      "node:url",
      "./Registry.js"
    ],
    "packages/symbiote-node/engine/Persistence.js": [
      "./Graph.js"
    ],
    "packages/symbiote-node/engine/Registry.js": [
      "./SocketTypes.js"
    ],
    "packages/symbiote-node/engine/cli.js": [
      "node:fs/promises",
      "node:path",
      "node:url",
      "node:perf_hooks",
      "./index.js"
    ],
    "packages/symbiote-node/engine/packs/ai/beat-detect.handler.js": [
      "child_process",
      "fs",
      "path",
      "os"
    ],
    "packages/symbiote-node/engine/packs/ai/face-detect.handler.js": [
      "child_process",
      "fs",
      "path",
      "os"
    ],
    "packages/symbiote-node/engine/packs/ai/grok-generate.handler.js": [
      "fs/promises",
      "fs",
      "path"
    ],
    "packages/symbiote-node/engine/packs/ai/kling-lipsync.handler.js": [
      "crypto",
      "fs/promises",
      "fs",
      "child_process",
      "path"
    ],
    "packages/symbiote-node/engine/packs/ai/lesson-generate.handler.js": [
      "node:fs/promises",
      "node:path"
    ],
    "packages/symbiote-node/engine/packs/ai/opencode.handler.js": [
      "fs",
      "path",
      "os"
    ],
    "packages/symbiote-node/engine/packs/ai/replicate-lipsync.handler.js": [
      "fs/promises",
      "fs",
      "child_process",
      "path"
    ],
    "packages/symbiote-node/engine/packs/ai/tts.handler.js": [
      "child_process",
      "fs",
      "path",
      "os"
    ],
    "packages/symbiote-node/engine/packs/ai/whisper.handler.js": [
      "child_process",
      "fs",
      "path"
    ],
    "packages/symbiote-node/engine/packs/data/news-accumulate.handler.js": [
      "node:fs/promises",
      "node:path"
    ],
    "packages/symbiote-node/engine/packs/data/prompt-loader.handler.js": [
      "node:fs/promises",
      "node:path"
    ],
    "packages/symbiote-node/engine/packs/data/roles.handler.js": [
      "node:fs/promises",
      "node:path"
    ],
    "packages/symbiote-node/engine/packs/flow/loop.handler.js": [
      "../../Registry.js"
    ],
    "packages/symbiote-node/engine/packs/io/read-file.handler.js": [
      "fs"
    ],
    "packages/symbiote-node/engine/packs/io/write-file.handler.js": [
      "fs",
      "path"
    ],
    "packages/symbiote-node/engine/packs/video-pack.js": [
      "../index.js"
    ],
    "packages/symbiote-node/inspector/InspectorPanel/InspectorPanel.js": [
      "@symbiotejs/symbiote",
      "./InspectorPanel.tpl.js",
      "./InspectorPanel.css.js",
      "../TemplatePreview/TemplatePreview.js"
    ],
    "packages/symbiote-node/inspector/TemplatePreview/TemplatePreview.js": [
      "@symbiotejs/symbiote",
      "./TemplatePreview.tpl.js",
      "./TemplatePreview.css.js",
      "../../engine/packs/transform/template-builder.handler.js"
    ],
    "packages/symbiote-node/interactions/ConnectFlow.js": [
      "../core/Connection.js"
    ],
    "packages/symbiote-node/layout/ActionZone/ActionZone.js": [
      "@symbiotejs/symbiote",
      "./ActionZone.tpl.js",
      "./ActionZone.css.js"
    ],
    "packages/symbiote-node/layout/Layout/Layout.js": [
      "@symbiotejs/symbiote",
      "./../LayoutTree.js",
      "./Layout.tpl.js",
      "./Layout.css.js",
      "./../LayoutNode/LayoutNode.js",
      "./../LayoutPreview/LayoutPreview.js",
      "./../PanelMenu/PanelMenu.js"
    ],
    "packages/symbiote-node/layout/LayoutNode/LayoutNode.js": [
      "@symbiotejs/symbiote",
      "./LayoutNode.tpl.js",
      "./LayoutNode.css.js",
      "./../ActionZone/ActionZone.js"
    ],
    "packages/symbiote-node/layout/LayoutPreview/LayoutPreview.js": [
      "@symbiotejs/symbiote",
      "./LayoutPreview.tpl.js",
      "./LayoutPreview.css.js"
    ],
    "packages/symbiote-node/layout/LayoutRouter/LayoutRouter.js": [
      "@symbiotejs/symbiote"
    ],
    "packages/symbiote-node/layout/LayoutRouter/routerSync.js": [
      "./LayoutRouter.js"
    ],
    "packages/symbiote-node/layout/LayoutSidebar/LayoutSidebar.js": [
      "@symbiotejs/symbiote",
      "./LayoutSidebar.tpl.js",
      "./LayoutSidebar.css.js",
      "../LayoutRouter/LayoutRouter.js",
      "./SidebarSection.js"
    ],
    "packages/symbiote-node/layout/LayoutSidebar/SidebarSection.js": [
      "@symbiotejs/symbiote",
      "../LayoutRouter/LayoutRouter.js"
    ],
    "packages/symbiote-node/layout/PanelMenu/PanelMenu.js": [
      "@symbiotejs/symbiote",
      "./PanelMenu.tpl.js",
      "./PanelMenu.css.js"
    ],
    "packages/symbiote-node/menu/ContextMenu/ContextMenu.js": [
      "@symbiotejs/symbiote",
      "./ContextMenu.tpl.js",
      "./ContextMenu.css.js"
    ],
    "packages/symbiote-node/node/CtrlItem/CtrlItem.js": [
      "@symbiotejs/symbiote",
      "./CtrlItem.tpl.js",
      "./CtrlItem.css.js"
    ],
    "packages/symbiote-node/node/GraphFrame/GraphFrame.js": [
      "@symbiotejs/symbiote",
      "./GraphFrame.tpl.js",
      "./GraphFrame.css.js"
    ],
    "packages/symbiote-node/node/GraphNode/GraphNode.js": [
      "@symbiotejs/symbiote",
      "./GraphNode.tpl.js",
      "./GraphNode.css.js",
      "../PortItem/PortItem.js",
      "../CtrlItem/CtrlItem.js"
    ],
    "packages/symbiote-node/node/NodeSocket/NodeSocket.js": [
      "@symbiotejs/symbiote",
      "./NodeSocket.tpl.js"
    ],
    "packages/symbiote-node/node/PortItem/PortItem.js": [
      "@symbiotejs/symbiote",
      "./PortItem.tpl.js",
      "./PortItem.css.js"
    ],
    "packages/symbiote-node/palette/PaletteBrowser/PaletteBrowser.js": [
      "@symbiotejs/symbiote",
      "./PaletteBrowser.tpl.js",
      "./PaletteBrowser.css.js"
    ],
    "packages/symbiote-node/shapes/CircleShape.js": [
      "./NodeShape.js"
    ],
    "packages/symbiote-node/shapes/CommentShape.js": [
      "./NodeShape.js"
    ],
    "packages/symbiote-node/shapes/DiamondShape.js": [
      "./NodeShape.js"
    ],
    "packages/symbiote-node/shapes/PillShape.js": [
      "./NodeShape.js"
    ],
    "packages/symbiote-node/shapes/RectShape.js": [
      "./NodeShape.js"
    ],
    "packages/symbiote-node/shapes/SVGShape.js": [
      "./NodeShape.js"
    ],
    "packages/symbiote-node/shapes/index.js": [
      "./NodeShape.js",
      "./RectShape.js",
      "./PillShape.js",
      "./CircleShape.js",
      "./DiamondShape.js",
      "./CommentShape.js",
      "./SVGShape.js"
    ],
    "packages/symbiote-node/toolbar/QuickToolbar/QuickToolbar.js": [
      "@symbiotejs/symbiote",
      "./QuickToolbar.tpl.js",
      "./QuickToolbar.css.js"
    ],
    "src/node/adapters/claude.js": [
      "node:child_process"
    ],
    "src/node/adapters/gemini.js": [
      "node:child_process"
    ],
    "src/node/adapters/index.js": [
      "./gemini.js",
      "./claude.js",
      "../state-graph.js",
      "node:child_process",
      "node:path",
      "../agents/agent-parser.js"
    ],
    "src/node/adapters/pool.js": [
      "./index.js"
    ],
    "src/node/agents/agent-parser.js": [
      "fs",
      "path",
      "fs"
    ],
    "src/node/config-store.js": [
      "node:fs",
      "node:path",
      "node:os",
      "node:crypto"
    ],
    "src/node/discovery/ws-client.js": [
      "ws",
      "../proxy/mcp-multiplexer.js"
    ],
    "src/node/gateways/telegram.js": [
      "telegraf",
      "../state-graph.js"
    ],
    "src/node/memory-store.js": [
      "node:fs",
      "node:path",
      "node:os"
    ],
    "src/node/mlops/flywheel.js": [
      "node:fs",
      "node:path",
      "node:os"
    ],
    "src/node/mlops/trajectory-compressor.js": [
      "node:fs",
      "node:path",
      "node:os",
      "node:readline"
    ],
    "src/node/plugins/github/index.js": [
      "node:https"
    ],
    "src/node/plugins/plugin-loader.js": [
      "node:fs",
      "node:path",
      "node:url"
    ],
    "src/node/plugins/slack/index.js": [
      "node:https"
    ],
    "src/node/plugins/telegram/index.js": [
      "telegraf"
    ],
    "src/node/proxy/chat-ws-server.js": [
      "ws",
      "node:path",
      "../state-graph.js",
      "./mcp-helpers.js"
    ],
    "src/node/proxy/mcp-http-handler.js": [
      "node:crypto"
    ],
    "src/node/proxy/mcp-multiplexer.js": [
      "node:readline",
      "./tool-index.js"
    ],
    "src/node/proxy/mcp-proxy.js": [
      "node:child_process",
      "ws",
      "node:fs",
      "node:path",
      "node:os",
      "node:url",
      "../adapters/pool.js",
      "../plugins/plugin-loader.js",
      "../state-graph.js",
      "../mlops/flywheel.js",
      "../server/marketplace-registry.js",
      "./chat-ws-server.js",
      "./task-router.js"
    ],
    "src/node/proxy/task-router.js": [
      "../state-graph.js",
      "./mcp-helpers.js"
    ],
    "src/node/server/api-routes-projects.js": [
      "../state-graph.js"
    ],
    "src/node/server/api-routes.js": [
      "../config-store.js",
      "../state-graph.js",
      "../mlops/flywheel.js",
      "./lint-service.js",
      "../adapters/index.js",
      "./marketplace-registry.js",
      "node:child_process",
      "node:path",
      "node:url"
    ],
    "src/node/server/backend-lifecycle.js": [
      "node:crypto",
      "node:fs",
      "node:path",
      "node:child_process",
      "node:readline",
      "node:net",
      "node:url",
      "./context-injector.js"
    ],
    "src/node/server/backend.js": [
      "node:fs",
      "node:path",
      "node:crypto",
      "node:url",
      "./web-server.js",
      "./backend-lifecycle.js"
    ],
    "src/node/server/context-injector.js": [
      "node:fs",
      "node:path",
      "node:os"
    ],
    "src/node/server/lint-service.js": [
      "node:path"
    ],
    "src/node/server/local-gateway.js": [
      "node:http",
      "node:net",
      "node:fs",
      "node:path",
      "./mdns.js"
    ],
    "src/node/server/mdns.js": [
      "node:child_process",
      "node:dgram"
    ],
    "src/node/server/web-server.js": [
      "node:http",
      "node:fs",
      "node:path",
      "node:url",
      "./local-gateway.js",
      "../proxy/mcp-proxy.js",
      "./api-routes.js",
      "./api-routes-projects.js",
      "../adapters/index.js",
      "../proxy/mcp-http-handler.js"
    ],
    "src/node/state-graph.js": [
      "node:fs",
      "node:fs/promises",
      "node:path",
      "node:os",
      "node:crypto",
      "node:events"
    ],
    "test/integration/opencode-e2e.js": [
      "ws"
    ],
    "web/app.js": [
      "symbiote-node",
      "./router-registry.js",
      "./follow-controller.js",
      "./components/follow-ribbon.js",
      "./state.js",
      "./panels/file-tree.js",
      "./panels/code-viewer.js",
      "./panels/ctx-panel.js",
      "./panels/dep-graph.js",
      "./panels/health-panel.js",
      "./panels/ops-panel.js",
      "./components/quick-open.js",
      "./components/canvas-graph.js",
      "./panels/ActiveContext/ActiveContext.js",
      "./panels/ProjectList/ProjectList.js",
      "./panels/ActionBoard/ActionBoard.js",
      "./panels/SettingsPanel/SettingsPanel.js",
      "./panels/AgentChat/AgentChat.js",
      "./panels/Marketplace/Marketplace.js",
      "./panels/Topology/TopologyPanel.js",
      "./panels/ToolExplorer/ToolExplorer.js",
      "./panels/ActiveTasks/ActiveTasks.js",
      "./panels/PipelineManager/PipelineManager.js",
      "./panels/WorkflowExplorer/WorkflowExplorer.js",
      "./panels/GroupManager/GroupManager.js",
      "./panels/SkillManager/SkillManager.js",
      "./panels/PeerReview/PeerReview.js",
      "./components/ProjectTabs/ProjectTabs.js",
      "./dashboard-state.js",
      "./state-sync.js",
      "./common/ui-dialogs.js"
    ],
    "web/common/CellBg/CellBg.js": [
      "@symbiotejs/symbiote",
      "./CellBg.tpl.js",
      "./CellBg.css.js"
    ],
    "web/components/AgentBoard/AgentBoard.js": [
      "@symbiotejs/symbiote",
      "./AgentBoard.tpl.js",
      "./AgentBoard.css.js",
      "../../common/mcp-call.js",
      "../../state-sync.js"
    ],
    "web/components/ChatSidebar/ChatSidebar.js": [
      "@symbiotejs/symbiote",
      "../../dashboard-state.js",
      "symbiote-node",
      "./ChatSidebar.tpl.js",
      "../../state-sync.js",
      "./ChatSidebarItem.js"
    ],
    "web/components/ChatSidebar/ChatSidebarItem.js": [
      "@symbiotejs/symbiote",
      "../../dashboard-state.js",
      "symbiote-node"
    ],
    "web/components/LoadingOverlay/LoadingOverlay.js": [
      "@symbiotejs/symbiote",
      "./LoadingOverlay.tpl.js",
      "./LoadingOverlay.css.js"
    ],
    "web/components/PgWorkspace/PgWorkspace.js": [
      "@symbiotejs/symbiote",
      "symbiote-node",
      "../../router-registry.js",
      "../../dashboard-state.js",
      "./PgWorkspace.tpl.js"
    ],
    "web/components/ProjectTabs/ProjectTabs.js": [
      "@symbiotejs/symbiote",
      "../../dashboard-state.js",
      "symbiote-node",
      "./ProjectTabs.css.js",
      "./ProjectTabs.tpl.js",
      "../../common/ui-dialogs.js",
      "@symbiotejs/symbiote"
    ],
    "web/components/canvas-graph.js": [
      "@symbiotejs/symbiote"
    ],
    "web/components/code-block.js": [
      "@symbiotejs/symbiote",
      "../highlight.js",
      "../app.js"
    ],
    "web/components/event-feed/CodeWidget.js": [
      "@symbiotejs/symbiote"
    ],
    "web/components/event-feed/EventWidget.js": [
      "@symbiotejs/symbiote"
    ],
    "web/components/event-feed/ListWidget.js": [
      "@symbiotejs/symbiote"
    ],
    "web/components/event-feed/MiniGraphWidget.js": [
      "@symbiotejs/symbiote"
    ],
    "web/components/follow-ribbon.js": [
      "@symbiotejs/symbiote",
      "../app.js"
    ],
    "web/components/quick-open.js": [
      "@symbiotejs/symbiote",
      "../app.js"
    ],
    "web/panels/ActionBoard/ActionBoard.js": [
      "@symbiotejs/symbiote",
      "../../dashboard-state.js",
      "../../common/ui-shared.css.js",
      "./ActionBoard.tpl.js",
      "../EventItem/EventItem.js"
    ],
    "web/panels/ActiveContext/ActiveContext.js": [
      "@symbiotejs/symbiote",
      "../../common/mcp-call.js",
      "./ActiveContext.tpl.js",
      "../../dashboard-state.js"
    ],
    "web/panels/ActiveTasks/ActiveTasks.js": [
      "@symbiotejs/symbiote",
      "../../state-sync.js",
      "./ActiveTasks.tpl.js",
      "../../common/ui-dialogs.js",
      "../../common/ui-shared.css.js"
    ],
    "web/panels/AgentChat/AgentChat.js": [
      "@symbiotejs/symbiote",
      "../../dashboard-state.js",
      "symbiote-node",
      "./AgentChat.tpl.js",
      "./AgentChat.css.js",
      "../../common/CellBg/CellBg.js",
      "../../common/ui-dialogs.js",
      "../../common/icons.js",
      "../../utils/markdown-formatter.js",
      "../../services/chat-ws-client.js",
      "../../services/chat-autocomplete.js",
      "../../components/ChatSidebar/ChatSidebar.js"
    ],
    "web/panels/AgentListPanel/AgentListItem.js": [
      "@symbiotejs/symbiote",
      "./AgentListItem.tpl.js"
    ],
    "web/panels/ChatList/ChatList.js": [
      "@symbiotejs/symbiote",
      "../../dashboard-state.js",
      "symbiote-node",
      "./ChatList.css.js",
      "../../common/ui-shared.css.js",
      "./ChatList.tpl.js",
      "../../common/ui-dialogs.js"
    ],
    "web/panels/EventItem/EventItem.js": [
      "@symbiotejs/symbiote",
      "./EventItem.css.js",
      "./EventItem.tpl.js"
    ],
    "web/panels/GroupManager/GroupManager.js": [
      "@symbiotejs/symbiote",
      "../../common/mcp-call.js",
      "./GroupManager.tpl.js",
      "../../common/ui-shared.css.js"
    ],
    "web/panels/Marketplace/Marketplace.js": [
      "@symbiotejs/symbiote",
      "../../common/mcp-call.js",
      "./Marketplace.tpl.js",
      "../../common/ui-dialogs.js",
      "./Marketplace.css.js",
      "../../common/ui-shared.css.js"
    ],
    "web/panels/PeerReview/PeerReview.js": [
      "@symbiotejs/symbiote",
      "../../common/mcp-call.js",
      "./PeerReview.tpl.js",
      "../../common/ui-shared.css.js"
    ],
    "web/panels/PipelineManager/PipelineManager.js": [
      "@symbiotejs/symbiote",
      "../../common/mcp-call.js",
      "./PipelineManager.tpl.js",
      "../../common/ui-shared.css.js"
    ],
    "web/panels/ProjectItem/ProjectItem.js": [
      "@symbiotejs/symbiote",
      "./ProjectItem.css.js",
      "../../common/ui-shared.css.js",
      "./ProjectItem.tpl.js",
      "../../common/ui-dialogs.js"
    ],
    "web/panels/ProjectList/ProjectList.js": [
      "@symbiotejs/symbiote",
      "../../dashboard-state.js",
      "../../common/ui-shared.css.js",
      "./ProjectList.tpl.js",
      "../ProjectItem/ProjectItem.js"
    ],
    "web/panels/SettingsPanel/SettingsPanel.js": [
      "@symbiotejs/symbiote",
      "../../common/ui-shared.css.js",
      "./SettingsPanel.css.js",
      "./SettingsPanel.tpl.js",
      "../../common/ui-dialogs.js"
    ],
    "web/panels/SkillLibraryPanel/SkillListItem.js": [
      "@symbiotejs/symbiote",
      "./SkillListItem.tpl.js"
    ],
    "web/panels/SkillManager/SkillManager.js": [
      "@symbiotejs/symbiote",
      "../../common/mcp-call.js",
      "./SkillManager.tpl.js",
      "../../common/ui-dialogs.js",
      "../../common/ui-shared.css.js"
    ],
    "web/panels/ToolExplorer/ToolExplorer.js": [
      "@symbiotejs/symbiote",
      "./ToolExplorer.tpl.js",
      "./ToolExplorer.css.js",
      "../../common/ui-shared.css.js"
    ],
    "web/panels/Topology/TopologyPanel.js": [
      "@symbiotejs/symbiote",
      "./TopologyPanel.tpl.js",
      "./TopologyPanel.css.js",
      "../../common/ui-shared.css.js"
    ],
    "web/panels/WorkflowExplorer/WorkflowExplorer.js": [
      "@symbiotejs/symbiote",
      "../../common/mcp-call.js",
      "./WorkflowExplorer.tpl.js",
      "./WorkflowExplorer.css.js",
      "../../common/ui-shared.css.js"
    ],
    "web/panels/code-viewer.js": [
      "@symbiotejs/symbiote",
      "../app.js",
      "../components/code-block.js"
    ],
    "web/panels/ctx-panel.js": [
      "@symbiotejs/symbiote",
      "../app.js"
    ],
    "web/panels/dep-graph.js": [
      "@symbiotejs/symbiote",
      "symbiote-node",
      "../app.js",
      "../services/skeleton-parser.js",
      "../components/LoadingOverlay/LoadingOverlay.js"
    ],
    "web/panels/file-tree.js": [
      "@symbiotejs/symbiote",
      "../app.js"
    ],
    "web/panels/health-panel.js": [
      "@symbiotejs/symbiote",
      "../app.js"
    ],
    "web/panels/ops-panel.js": [
      "@symbiotejs/symbiote",
      "../app.js",
      "../components/event-feed/CodeWidget.js",
      "../components/event-feed/MiniGraphWidget.js",
      "../components/event-feed/ListWidget.js",
      "../components/event-feed/EventWidget.js"
    ],
    "web/router-registry.js": [
      "symbiote-node"
    ],
    "web/services/chat-autocomplete.js": [
      "../utils/markdown-formatter.js"
    ],
    "web/services/chat-ws-client.js": [
      "../common/icons.js",
      "../dashboard-state.js"
    ],
    "web/services/skeleton-parser.js": [
      "symbiote-node"
    ],
    "web/utils/markdown-formatter.js": [
      "../common/icons.js",
      "../highlight.js"
    ]
  }
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
  { name: 'publish', path: '.agent-portal/workflows/publish.md', description: 'Cross-project publication workflow for Git and NPM.' },
  { name: 'testing', path: '.agent-portal/workflows/testing.md', description: 'Testing workflow and conventions.' },
  { name: 'deploy', path: '.agent-portal/workflows/deploy.md', description: 'Production deployment pipeline.' },
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
