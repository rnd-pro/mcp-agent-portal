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
      name: 'mcp-agent-portal',
      path: '/home/dev/mcp-agent-portal',
      color: '#4c8bf5',
      lastOpened: Date.now() - 60_000,
    },
    {
      id: 'proj-video',
      name: 'symbiote-video',
      path: '/home/dev/symbiote-video',
      color: '#e8710a',
      lastOpened: Date.now() - 3600_000,
    },
    {
      id: 'proj-1sim',
      name: '1sim-app',
      path: '/home/dev/1sim-app',
      color: '#34a853',
      lastOpened: Date.now() - 7200_000,
    },
    {
      id: 'proj-ml',
      name: 'ml-pipeline',
      path: '/home/dev/ml-pipeline',
      color: '#fbbc04',
      lastOpened: Date.now() - 86400_000,
    },
    {
      id: 'proj-docs',
      name: 'docs-portal',
      path: '/home/dev/docs-portal',
      color: '#9334e6',
      lastOpened: Date.now() - 172800_000,
    },
    {
      id: 'proj-trading',
      name: 'trading-engine',
      path: '/home/dev/trading-engine',
      color: '#ea4335',
      lastOpened: Date.now() - 604800_000,
    },
  ],
  activeIds: ['proj-portal', 'proj-video'],
};

// ── Chats ────────────────────────────────────────────────────────

export const chats = [
  // ── Showcase chat: project overview with ALL message types ─────
  {
    id: 'chat-1',
    name: 'What is Agent Portal?',
    adapter: 'pool',
    provider: 'gemini',
    model: 'gemini-2.5-pro',
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
      { role: 'agent', text: "## Multi-Agent Delegation Flow\n\nThe orchestrator delegates tasks to specialized sub-agents via `delegate_task`. Each sub-agent runs independently with its own CLI adapter:\n\n```\nOrchestrator (gemini-2.5-pro)\n  ├── delegate_task → Coder (gemini-2.5-flash)\n  ├── delegate_task → Reviewer (claude-sonnet-4)\n  └── consult_peer → Research (deepseek-v4)\n```\n\nThe delegation board tracks each sub-task with live status updates. When all sub-agents complete, the orchestrator synthesizes their results.\n\n### Quick Start\n\nOne entry in your MCP config gives you access to every tool:\n\n```json\n{\n  \"mcpServers\": {\n    \"agent-portal\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"mcp-agent-portal\"]\n    }\n  }\n}\n```\n\n### Operating Modes\n\n| Mode | Description |\n|---|---|\n| **Standalone** | Spawns local child MCP servers, serves web UI, provides stdio MCP to IDE |\n| **Client** | Connects to a master via WebSocket, registers its local tools |\n| **Master** | Aggregates tools from local children AND remote client nodes |\n\n---\n\n*Built with [Symbiote.js](https://github.com/symbiotejs/symbiote.js) and the [symbiote-node](https://github.com/rnd-pro/symbiote-node) layout framework. MIT © [RND-PRO.com](https://rnd-pro.com)*" },

      // 11. System message
      { role: 'system', text: '⏱ Session completed in 42s · 2 sub-agents · 11 tool calls · $0.0738 total' },
    ],
  },

  // ── Chat 2: Debug with diff ──────────────────────────────────
  {
    id: 'chat-2',
    name: 'Debug WebSocket reconnection',
    adapter: 'pool',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    agent: 'single',
    createdAt: Date.now() - 86400_000,
    updatedAt: Date.now() - 43200_000,
    projectId: 'proj-portal',
    messages: [
      { role: 'user', text: 'The WebSocket connection drops after ~30 seconds of inactivity. Can you find the root cause?' },
      { role: 'thinking', elapsed: 6, done: true, meta: { tools: 2, tokens: 3200 } },
      { role: 'tool', name: 'get_skeleton', input: { path: '/home/dev/project/src/ws' }, result: '{ files: ["server.js", "client.js", "heartbeat.js"], exports: 8 }' },
      { role: 'agent', text: "Found the issue! The heartbeat interval is set to **60 seconds** but the server's idle timeout is **30 seconds**.\n\n```diff\n// heartbeat.js\n-const HEARTBEAT_INTERVAL = 60_000;\n+const HEARTBEAT_INTERVAL = 15_000;\n\n// server.js  \n-server.timeout = 30_000;\n+server.timeout = 0; // Disable — heartbeat handles liveness\n```\n\nThe fix is to either:\n1. Reduce heartbeat to 15s (recommended)\n2. Increase server timeout\n\nI've applied option 1 since aggressive keepalive prevents proxy timeouts too." },
    ],
  },

  // ── Chat 3: Simple single-agent ──────────────────────────────
  {
    id: 'chat-3',
    name: 'Add dark mode toggle',
    adapter: 'pool',
    provider: 'opencode',
    model: 'claude-sonnet-4',
    agent: 'single',
    createdAt: Date.now() - 172800_000,
    updatedAt: Date.now() - 172800_000,
    projectId: 'proj-video',
    messages: [
      { role: 'user', text: 'Add a dark/light mode toggle to the settings panel.' },
      { role: 'thinking', elapsed: 3, done: true, meta: { mode: 'normal', tools: 1, tokens: 1800, cost: 0.0054 } },
      { role: 'tool', name: 'search_context', input: { query: 'theme toggle dark mode CSS custom properties', scope: 'web/' }, result: 'Found 3 matches:\n  web/style.css:12 — :root { --bg: #1a1a2e; ... }\n  web/style.css:45 — [data-theme="light"] { --bg: #f5f5f5; ... }\n  web/panels/SettingsPanel/SettingsPanel.js:8' },
      { role: 'agent', text: "Implementation complete:\n- Added toggle switch in SettingsPanel\n- Stores preference in `localStorage`\n- Applies `data-theme=\"light\"` attribute on `<html>`\n- Smooth 200ms transition on all color properties\n\n> The existing CSS custom properties already define both dark and light palettes — I just wired up the toggle UI." },
    ],
  },

  // ── Chat 4: Performance with tables ──────────────────────────
  {
    id: 'chat-4',
    name: 'Performance audit',
    adapter: 'pool',
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    agent: 'orchestrator',
    createdAt: Date.now() - 259200_000,
    updatedAt: Date.now() - 259200_000,
    projectId: 'proj-portal',
    parentChatId: null,
    messages: [
      { role: 'user', text: 'Run a performance audit on the frontend. Focus on bundle size and initial load time.' },
      { role: 'thinking', elapsed: 18, done: true, meta: { tools: 6, tokens: 15200, cost: 0.0456 } },
      { role: 'tool', name: 'analyze', input: { action: 'full_analysis', path: '/home/dev/project' }, result: '{ totalFiles: 142, totalLines: 28450, avgComplexity: 3.2 }' },
      { role: 'tool', name: 'delegate_task', input: { prompt: 'Profile bundle sizes and identify code-split opportunities', agent: 'researcher' }, result: 'Task delegated → task-perf-001' },
      { role: 'board', taskIds: ['task-perf-001'], streaming: false },
      { role: 'agent', text: "## Performance Audit Results\n\n| Metric | Value | Status |\n|---|---|---|\n| Total JS size | 847 KB | ⚠️ |\n| Largest module | dep-graph.js (75 KB) | 🔴 |\n| Initial load (3G) | 2.1s | ✅ |\n| Component count | 32 | ✅ |\n| Unused exports | 14 | ⚠️ |\n\n### Recommendations\n1. **Code-split** `dep-graph.js` — it's only used in the Graph section\n2. **Tree-shake** 14 unused exports (mostly in utils/)\n3. **Lazy-load** Marketplace and PeerReview panels\n\nEstimated savings: **~180 KB** (21% reduction)." },
    ],
  },

  // ── Chat 5: CI with YAML code block ──────────────────────────
  {
    id: 'chat-5',
    name: 'Setup CI pipeline',
    adapter: 'pool',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
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
    model: 'gemini-2.5-pro',
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
    './': ['index.js', 'package.json', 'README.md', 'ARCHITECTURE.md'],
    'src/node/server/': ['web-server.js', 'api-routes.js', 'api-routes-projects.js', 'local-gateway.js'],
    'src/node/proxy/': ['mcp-proxy.js', 'task-router.js', 'mcp-http-handler.js'],
    'src/node/adapters/': ['index.js', 'gemini-runner.js', 'opencode-runner.js'],
    'web/': ['app.js', 'state.js', 'state-sync.js', 'router-registry.js', 'dashboard-state.js', 'style.css', 'index.html'],
    'web/panels/': ['AgentChat/', 'ActionBoard/', 'ProjectList/', 'Topology/', 'ToolExplorer/', 'SettingsPanel/', 'SkillManager/'],
    'web/components/': ['ChatSidebar/', 'ProjectTabs/', 'AgentBoard/'],
    'web/services/': ['chat-ws-client.js', 'chat-autocomplete.js', 'skeleton-parser.js'],
  },
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
            { val: 'gemini-2.5-pro', text: 'Gemini 2.5 Pro' },
            { val: 'gemini-2.5-flash', text: 'Gemini 2.5 Flash' },
            { val: 'gemini-2.5-flash-lite-preview', text: 'Gemini 2.5 Flash Lite' },
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
    defaultModel: 'gemini-2.5-pro',
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
