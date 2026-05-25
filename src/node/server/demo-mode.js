import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import {
  adapterTypes,
  chats as fixtureChats,
  cliConfig,
  flywheelStats,
  generateInitialEvents,
  getChatById,
  groups,
  instances,
  pipelines,
  projectHistory,
  skeleton,
  skills,
  toolsByServer,
  workflows,
} from '../../../demo/mock-data.js';
import { json, parseBody } from './routes/http.js';

const PUBLIC_ROOTS = ['ARCHITECTURE.md', 'README.md', 'demo', 'docs', 'packages', 'scripts', 'src', 'test', 'web'];
const BLOCKED_SEGMENTS = new Set(['.env', '.git', '.ssh', 'node_modules', 'secrets', 'tmp']);
const MAX_FILE_BYTES = 96 * 1024;
const DEMO_PROJECT_PATH = '/workspace/agent-portal';

function isEnabled(value) {
  return value === true || value === 'true' || value === '1' || value === 1;
}

export function isServerDemoMode(env = process.env) {
  return isEnabled(env.AGENT_PORTAL_DEMO_MODE);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function rndProReply(prompt = '') {
  let topic = String(prompt).trim();
  return [
    'Agent Portal is running here in public demo mode. This instance shows the current application UI against safe mock data, so clients can inspect the product without touching private agents, workspaces, or secrets.',
    '',
    topic ? `Your request was: "${topic.slice(0, 220)}"` : 'Ask about agent orchestration, WebXR interfaces, internal AI tooling, or production demos.',
    '',
    'RND PRO builds custom AI operations systems: agent control planes, local/private AI workflows, WebXR interfaces, automation dashboards, media pipelines, and secure demo infrastructure.',
    '',
    'Useful links:',
    '- Main site: https://rnd-pro.com/',
    '- Playground: https://playground.rnd-pro.com/',
    '- Contact and project discussion: https://rnd-pro.com/',
  ].join('\n');
}

function createDemoChats() {
  let chats = clone(fixtureChats).map((chat) => ({
    ...chat,
    messages: (chat.messages || []).map((message) => {
      if (typeof message.text !== 'string') return message;
      return {
        ...message,
        text: message.text
          .replaceAll('__README_CONTENT__', rndProReply('What is Agent Portal?'))
          .replaceAll(/__SUBREADME:[^_]+__/g, rndProReply('Show product capabilities.')),
      };
    }),
  }));
  chats.unshift({
    id: 'rnd-pro-services',
    name: 'RND PRO services',
    adapter: 'pool',
    provider: 'demo',
    model: 'server-demo',
    agent: 'orchestrator',
    createdAt: Date.now() - 30_000,
    updatedAt: Date.now() - 10_000,
    projectId: 'proj-portal',
    messages: [
      { role: 'user', text: 'What can RND PRO build for my team?' },
      { role: 'agent', text: rndProReply('What can RND PRO build for my team?') },
    ],
  });
  return chats;
}

function publicRelativePath(projectRoot, requestedPath) {
  let normalized = path.posix.normalize(String(requestedPath || '').replaceAll('\\', '/'));
  let rootAliases = [
    path.posix.normalize(projectRoot.replaceAll('\\', '/')),
    DEMO_PROJECT_PATH,
  ];
  for (let rootAlias of rootAliases) {
    if (normalized === rootAlias) return '';
    if (normalized.startsWith(`${rootAlias}/`)) {
      normalized = normalized.slice(rootAlias.length + 1);
      break;
    }
  }
  return normalized.replace(/^\/+/, '');
}

function publicPathAllowed(projectRoot, requestedPath) {
  let normalized = publicRelativePath(projectRoot, requestedPath);
  if (!normalized || normalized.startsWith('../')) return null;
  let parts = normalized.split('/');
  if (parts.some((part) => BLOCKED_SEGMENTS.has(part) || part.startsWith('.'))) return null;
  let first = parts[0];
  if (!PUBLIC_ROOTS.includes(first)) return null;
  return normalized;
}

function readPublicFile(projectRoot, requestedPath) {
  let safePath = publicPathAllowed(projectRoot, requestedPath);
  if (!safePath) return null;
  let absolutePath = path.join(projectRoot, safePath);
  if (!absolutePath.startsWith(projectRoot) || !fs.existsSync(absolutePath)) return null;
  let stat = fs.statSync(absolutePath);
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
  return fs.readFileSync(absolutePath, 'utf8');
}

function walkFiles(rootDir, relativeDir = '', out = [], limit = 5000) {
  let absoluteDir = path.join(rootDir, relativeDir);
  if (!fs.existsSync(absoluteDir)) return out;
  for (let entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (BLOCKED_SEGMENTS.has(entry.name) || entry.name.startsWith('.')) continue;
    let relPath = path.posix.join(relativeDir.replaceAll('\\', '/'), entry.name);
    if (!publicPathAllowed(rootDir, relPath)) continue;
    if (entry.isDirectory()) {
      walkFiles(rootDir, relPath, out, limit);
    } else if (entry.isFile()) {
      out.push(relPath);
    }
    if (out.length >= limit) return out;
  }
  return out;
}

function mcpContent(text) {
  return { result: { content: [{ type: 'text', text }] } };
}

function filePayload(projectRoot, requestedPath) {
  let safePath = publicPathAllowed(projectRoot, requestedPath);
  let content = safePath ? readPublicFile(projectRoot, safePath) : null;
  if (content === null) {
    return {
      path: safePath || String(requestedPath || ''),
      content: `Public demo file is unavailable: ${requestedPath || 'unknown'}`,
      raw: '',
      code: '',
      demoMode: true,
      unavailable: true,
    };
  }
  return {
    path: safePath,
    content,
    raw: content,
    code: content,
    compressed: content,
    expanded: content.length,
    decompiled: content.length,
    codeTok: Math.ceil(content.length / 4),
    ctxTok: 0,
    savings: '0%',
    demoMode: true,
  };
}

function buildPublicFileTree(projectRoot) {
  let tree = {};
  for (let filePath of walkFiles(projectRoot)) {
    let directory = path.posix.dirname(filePath);
    let key = directory === '.' ? './' : `${directory}/`;
    if (!tree[key]) tree[key] = [];
    tree[key].push(path.posix.basename(filePath));
  }
  for (let files of Object.values(tree)) files.sort();
  return Object.fromEntries(Object.entries(tree).sort(([a], [b]) => a.localeCompare(b)));
}

function buildPublicImportMap(projectRoot) {
  let imports = {};
  for (let [filePath, deps] of Object.entries(skeleton.a || {})) {
    let safePath = publicPathAllowed(projectRoot, filePath);
    if (!safePath) continue;
    let absolutePath = path.join(projectRoot, safePath);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) continue;
    imports[safePath] = deps;
  }
  return imports;
}

function publicSkeleton(projectRoot) {
  return {
    ...clone(skeleton),
    f: buildPublicFileTree(projectRoot),
    a: buildPublicImportMap(projectRoot),
  };
}

function createMcpResponse(projectRoot, body = {}) {
  let serverName = body.serverName || 'project-graph';
  let method = body.method;
  let params = body.params || {};

  if (method === 'tools/list') {
    return { tools: toolsByServer[serverName] || toolsByServer['project-graph'] || [] };
  }

  if (method !== 'tools/call') return { error: { message: 'Unsupported demo MCP method' } };

  let toolName = params.name;
  let args = params.arguments || {};
  if (toolName === 'get_skeleton') return mcpContent(JSON.stringify(publicSkeleton(projectRoot)));
  if (toolName === 'compact' || toolName === 'docs') {
    let filePath = args.file || args.path;
    return mcpContent(JSON.stringify(filePayload(projectRoot, filePath)));
  }
  if (toolName === 'analyze') {
    let files = walkFiles(projectRoot);
    return mcpContent(JSON.stringify({
      project: 'mcp-agent-portal',
      mode: 'public-demo',
      files: files.length,
      roots: PUBLIC_ROOTS,
      summary: 'Public code structure is available in demo mode. Private runtime state and secrets are not exposed.',
    }));
  }
  if (toolName === 'navigate' || toolName === 'get_ai_context') {
    return mcpContent(JSON.stringify({
      mode: 'public-demo',
      message: 'Symbol navigation is mocked in the public demo. Open source files through the project tree to inspect current code.',
    }));
  }
  if (toolName === 'delegate_task' || toolName === 'delegate_task_readonly' || toolName === 'consult_peer') {
    return mcpContent(rndProReply(args.prompt || args.question || 'Agent orchestration demo'));
  }
  if (toolName === 'get_task_result') {
    return mcpContent('Demo task completed. In production this is where delegated agent findings are streamed back.');
  }
  return mcpContent('Demo tool response.');
}

export function createServerDemoMode({ projectRoot, env = process.env } = {}) {
  let enabled = isServerDemoMode(env);
  let chats = createDemoChats();
  let chatMap = new Map(chats.map((chat) => [chat.id, chat]));
  let events = generateInitialEvents(18);
  let wsServer = new WebSocketServer({ noServer: true });

  function routeList() {
    return {
      'GET /api/instances': (_req, res) => json(res, instances),
      'GET /api/projects/history': (_req, res) => json(res, projectHistory),
      'POST /api/projects/open': async (_req, res) => json(res, { ok: true, demo: true, projectId: 'proj-portal' }),
      'POST /api/projects/close': async (_req, res) => json(res, { ok: true, demo: true }),
      'POST /api/projects/remove': async (_req, res) => json(res, { ok: true, demo: true }),
      'POST /api/projects/update': async (_req, res) => json(res, { ok: true, demo: true }),
      'GET /api/chats': (_req, res) => json(res, { chats: chats.map(({ messages, ...rest }) => rest) }),
      'POST /api/chats': async (_req, res) => {
        let id = `demo-chat-${Date.now().toString(36)}`;
        let chat = {
          id,
          name: 'RND PRO demo chat',
          adapter: 'pool',
          provider: 'demo',
          model: 'server-demo',
          agent: 'orchestrator',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          projectId: 'proj-portal',
          messages: [{ role: 'agent', text: rndProReply('New demo chat') }],
        };
        chats.unshift(chat);
        chatMap.set(id, chat);
        json(res, { ok: true, id });
      },
      'POST /api/chats/get': async (req, res) => {
        let body = await parseBody(req);
        json(res, chatMap.get(body.id) || getChatById(body.id) || { error: 'Chat not found' }, chatMap.has(body.id) || getChatById(body.id) ? 200 : 404);
      },
      'POST /api/chats/message': async (req, res) => {
        let body = await parseBody(req);
        let chat = chatMap.get(body.chatId);
        if (chat && body.text) {
          chat.messages.push({ role: body.role || 'user', text: body.text });
          chat.updatedAt = Date.now();
        }
        json(res, { ok: true, demo: true });
      },
      'PUT /api/chats/messages': async (_req, res) => json(res, { ok: true, demo: true }),
      'POST /api/chats/update': async (_req, res) => json(res, { ok: true, demo: true }),
      'POST /api/chats/delete': async (_req, res) => json(res, { ok: true, demo: true }),
      'POST /api/chats/session': async (_req, res) => json(res, { ok: true, sessionId: 'demo-session' }),
      'GET /api/project-info': (_req, res) => json(res, {
        name: 'mcp-agent-portal',
        path: '/workspace/agent-portal',
        agents: 0,
        pid: 0,
        demoMode: true,
      }),
      'GET /api/health': (_req, res) => json(res, { ok: true, demoMode: true, services: [] }),
      'GET /api/runtime': (_req, res) => json(res, { ok: true, demoMode: true, statuses: [] }),
      'GET /api/runtime/health': (_req, res) => json(res, { ok: true, demoMode: true }),
      'GET /api/adapter/types': (_req, res) => json(res, adapterTypes),
      'GET /api/cli/config': (_req, res) => json(res, cliConfig),
      'GET /api/flywheel/stats': (_req, res) => json(res, flywheelStats),
      'GET /api/skills': (_req, res) => json(res, { skills }),
      'GET /api/workflows': (_req, res) => json(res, { workflows }),
      'GET /api/pipelines': (_req, res) => json(res, { pipelines }),
      'GET /api/groups': (_req, res) => json(res, { groups }),
      'GET /api/state': (_req, res) => json(res, { state: { tasks: {}, events }, demoMode: true }),
      'POST /api/state/tasks': async (req, res) => {
        let body = await parseBody(req);
        let tasks = {};
        for (let id of body.taskIds || []) {
          tasks[id] = { status: 'done', chatId: `demo-${id}`, eventCount: 3, updatedAt: Date.now() };
        }
        json(res, { tasks });
      },
      'POST /api/state/commit': async (_req, res) => json(res, { ok: true, demo: true }),
      'POST /api/mcp-call': async (req, res) => {
        let body = await parseBody(req);
        json(res, createMcpResponse(projectRoot, body));
      },
      'POST /api/file': async (req, res) => {
        let body = await parseBody(req);
        json(res, filePayload(projectRoot, body.path || body.file));
      },
      'POST /api/raw-file': async (req, res) => {
        let body = await parseBody(req);
        json(res, filePayload(projectRoot, body.path || body.file));
      },
      'POST /api/compact-file': async (req, res) => {
        let body = await parseBody(req);
        json(res, filePayload(projectRoot, body.path || body.file));
      },
      'POST /api/expand-file': async (req, res) => {
        let body = await parseBody(req);
        json(res, filePayload(projectRoot, body.path || body.file));
      },
      'POST /api/adapter/run': async (req, res) => {
        let body = await parseBody(req);
        json(res, { response: rndProReply(body.prompt), events: [], demo: true });
      },
    };
  }

  function handleUpgrade(req, socket, head) {
    if (!enabled) return false;
    let url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname !== '/ws/chat' && url.pathname !== '/ws/state' && url.pathname !== '/ws/monitor') return false;
    wsServer.handleUpgrade(req, socket, head, (ws) => {
      ws.on('message', (buffer) => {
        let message;
        try { message = JSON.parse(String(buffer)); } catch { return; }
        if (message.method === 'chat.send') {
          let { chatId, prompt } = message.params || {};
          let chat = chatMap.get(chatId);
          if (chat) {
            chat.messages.push({ role: 'thinking', elapsed: 1, done: true, status: 'Preparing RND PRO demo response...' });
            chat.messages.push({ role: 'agent', text: rndProReply(prompt) });
            chat.updatedAt = Date.now();
          }
          ws.send(JSON.stringify({ method: 'chat.meta', params: { chatId, phase: 'thinking', messageCount: chat?.messages?.length || 0, thinkingStatus: 'Demo response' } }));
          ws.send(JSON.stringify({ method: 'chat.done', params: { chatId, taskId: 'demo-task' } }));
        } else if (message.method === 'state.subscribe') {
          ws.send(JSON.stringify({ method: 'snapshot', params: { state: { tasks: {}, events } } }));
        }
      });
      ws.send(JSON.stringify({ method: 'demo.connected', params: { ok: true } }));
    });
    return true;
  }

  return {
    enabled,
    routes: enabled ? routeList() : {},
    handleUpgrade,
  };
}
