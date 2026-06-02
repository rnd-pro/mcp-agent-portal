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
import { getLogPath } from '../ops/runtime.js';
import { json, parseBody } from './routes/http.js';
import { createXrDiagnosticLogStore } from './xr-diagnostics-log.js';

const PUBLIC_ROOTS = ['ARCHITECTURE.md', 'README.md', 'bin', 'cli', 'config', 'demo', 'docs', 'index.js', 'lib', 'package.json', 'packages', 'scripts', 'src', 'test', 'web'];
const BLOCKED_SEGMENTS = new Set(['.env', '.git', '.ssh', 'node_modules', 'secrets', 'tmp']);
const MAX_FILE_BYTES = 96 * 1024;
const PUBLIC_SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx']);
const PUBLIC_ASSET_EXTENSIONS = new Set(['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico']);
const DEMO_PROJECT_PATH = '/workspace/agent-portal';
const DEMO_PUBLIC_PROJECTS_PATH = '/workspace/public-projects';
const DEMO_OPEN_LIBRARY_TREE = [
  {
    name: 'skills',
    path: 'skills',
    type: 'dir',
    children: [
      { name: 'symbiote-node-ui.md', path: 'skills/symbiote-node-ui.md', type: 'file' },
      { name: 'public-demo.md', path: 'skills/public-demo.md', type: 'file' },
    ],
  },
  {
    name: 'workflows',
    path: 'workflows',
    type: 'dir',
    children: [
      { name: 'demo-publish.md', path: 'workflows/demo-publish.md', type: 'file' },
    ],
  },
];
const DEMO_AGENT_PORTAL_TREE = [
  {
    name: 'agents',
    path: 'agents',
    type: 'dir',
    children: [
      { name: 'orchestrator.md', path: 'agents/orchestrator.md', type: 'file' },
      { name: 'reviewer.md', path: 'agents/reviewer.md', type: 'file' },
    ],
  },
  {
    name: 'skills',
    path: 'skills',
    type: 'dir',
    children: [
      { name: 'testing-discipline.md', path: 'skills/testing-discipline.md', type: 'file' },
      { name: 'ui-theming.md', path: 'skills/ui-theming.md', type: 'file' },
    ],
  },
  {
    name: 'workflows',
    path: 'workflows',
    type: 'dir',
    children: [
      { name: 'release.md', path: 'workflows/release.md', type: 'file' },
    ],
  },
];

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

function demoChatReply(prompt = '') {
  let text = String(prompt).trim();
  let preview = text.length > 260 ? `${text.slice(0, 257)}...` : text;
  return [
    preview ? `Вы написали: «${preview}».` : 'Сообщение получено.',
    '',
    'К сожалению, в публичном демо агент отключен от этого чата: я не запускаю инструменты, не создаю задачи и не изменяю проект.',
    '',
    'Демо показывает интерфейс Agent Portal и безопасные примерные данные. Для рабочего агентного диалога нужен подключенный runtime в полной версии.',
  ].join('\n');
}

function summarizeChat(chat) {
  let messages = chat.messages || [];
  let lastText = [...messages].reverse().find((message) => typeof message.text === 'string')?.text || '';
  let { messages: _messages, ...summary } = chat;
  return {
    ...summary,
    messageCount: messages.length,
    lastMessage: lastText.slice(0, 120),
  };
}

function createDemoSubagentChat(parent, index, spec) {
  let updatedAt = (parent.updatedAt || Date.now()) - ((index + 1) * 15_000);
  return {
    id: `${parent.id}--subagent-${spec.slug}`,
    name: spec.name,
    adapter: 'pool',
    provider: spec.provider,
    model: spec.model,
    agent: spec.agent,
    agentIcon: spec.icon,
    agentColor: spec.color,
    createdAt: (parent.createdAt || Date.now()) + ((index + 1) * 1_000),
    updatedAt,
    projectId: parent.projectId || 'agent-portal',
    parentChatId: parent.id,
    lastTaskStatus: spec.status,
    messages: [
      { role: 'user', text: spec.prompt },
      { role: 'thinking', elapsed: spec.elapsed, done: true, meta: { mode: 'readonly', tools: spec.tools, tokens: spec.tokens } },
      { role: 'agent', text: spec.result },
      { role: 'system', text: 'Sub-agent result returned to the orchestrator.' },
    ],
  };
}

function demoSubagentSpecs(parent) {
  let label = parent.name || 'demo chat';
  return [
    {
      slug: 'architecture',
      name: 'Architecture audit',
      agent: 'architect',
      provider: 'codex',
      model: 'gpt-5-codex',
      icon: 'account_tree',
      color: 'var(--sn-provider-rnd-pro-color)',
      status: 'done',
      elapsed: 18,
      tools: 4,
      tokens: 8400,
      prompt: `Audit the architecture context for "${label}" and identify reusable provider boundaries.`,
      result: 'Architecture audit complete: reusable UI, graph, layout, theme, and XR behavior should stay in symbiote-node, while product routing and orchestration remain in Agent Portal.',
    },
    {
      slug: 'browser',
      name: 'Browser smoke',
      agent: 'browser-reviewer',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      icon: 'smart_display',
      color: 'var(--sn-provider-google-color)',
      status: 'done',
      elapsed: 12,
      tools: 3,
      tokens: 5200,
      prompt: `Check the visible UI flow for "${label}" in public demo mode.`,
      result: 'Browser smoke complete: demo data renders without private backend access, and public routes expose only safe mock content.',
    },
  ];
}

function ensureDemoSubagentChats(chats) {
  let byParent = new Map();
  for (let chat of chats) {
    if (!chat.parentChatId) continue;
    if (!byParent.has(chat.parentChatId)) byParent.set(chat.parentChatId, []);
    byParent.get(chat.parentChatId).push(chat);
  }

  let additions = [];
  for (let chat of chats) {
    if (chat.parentChatId) continue;
    let existing = byParent.get(chat.id) || [];
    let existingIds = new Set(existing.map((child) => child.id));
    for (let [index, spec] of demoSubagentSpecs(chat).entries()) {
      let id = `${chat.id}--subagent-${spec.slug}`;
      if (!existingIds.has(id)) additions.push(createDemoSubagentChat(chat, index, spec));
    }
  }
  return chats.concat(additions);
}

function withSubChatSummaries(chat, chatMap) {
  if (!chat || chat.parentChatId) return chat;
  let subChats = [...chatMap.values()]
    .filter((item) => item.parentChatId === chat.id)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map(summarizeChat);
  return { ...chat, subChats };
}

function createGeneratedDemoChat(id, label = 'RND PRO demo chat') {
  return {
    id,
    name: label,
    adapter: 'pool',
    provider: 'demo',
    model: 'server-demo',
    agent: 'orchestrator',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    projectId: 'agent-portal',
    messages: [{ role: 'agent', text: rndProReply(label) }],
  };
}

function demoNetworkAccess() {
  return {
    lanEnabled: false,
    bindHost: '127.0.0.1',
    localUrl: 'https://playground.rnd-pro.com/demos/agent-portal-vr/#spatial?project=agent-portal&target=graph&texture=strict',
    lanUrls: [],
    availableLanUrls: ['https://playground.rnd-pro.com/demos/agent-portal-vr/#spatial?project=agent-portal&target=graph&texture=strict'],
    requiresApproval: false,
    secureContextRequired: true,
    demoMode: true,
  };
}

function sanitizeDemoVoiceCommands(value) {
  if (!value || typeof value !== 'object') return {};
  let result = {};
  for (let locale of ['en', 'ru', 'es']) {
    let command = String(value[locale] || '').trim();
    if (command) result[locale] = command.slice(0, 80);
  }
  return result;
}

function sanitizeDemoVoiceInput(value = {}) {
  if (!value || typeof value !== 'object') return {};
  let result = {};
  if ('sendByCommandEnabled' in value) {
    result.sendByCommandEnabled = Boolean(value.sendByCommandEnabled);
  }
  if ('voiceResponseEnabled' in value) {
    result.voiceResponseEnabled = Boolean(value.voiceResponseEnabled);
  }
  let languageMode = String(value.languageMode || '').trim();
  if (['auto', 'ru', 'es', 'en'].includes(languageMode)) {
    result.languageMode = languageMode;
  }
  let sendCommands = sanitizeDemoVoiceCommands(value.sendCommands);
  if (Object.keys(sendCommands).length) result.sendCommands = sendCommands;
  let wakeCommands = sanitizeDemoVoiceCommands(value.wakeCommands);
  if (Object.keys(wakeCommands).length) result.wakeCommands = wakeCommands;
  return result;
}

function sanitizeDemoSettings(updates = {}) {
  let safe = {};
  if (updates.localization && typeof updates.localization === 'object') {
    let mode = String(updates.localization.mode || '').trim();
    if (['auto', 'en', 'ru', 'es'].includes(mode)) safe.localization = { mode };
  }
  if (updates.voiceInput && typeof updates.voiceInput === 'object') {
    safe.voiceInput = sanitizeDemoVoiceInput(updates.voiceInput);
  }
  return safe;
}

function mergeDemoSettings(current = {}, updates = {}) {
  let safe = sanitizeDemoSettings(updates);
  return {
    ...current,
    ...safe,
    localization: safe.localization || current.localization,
    voiceInput: safe.voiceInput
      ? {
          ...(current.voiceInput || {}),
          ...safe.voiceInput,
          sendCommands: safe.voiceInput.sendCommands || current.voiceInput?.sendCommands,
          wakeCommands: safe.voiceInput.wakeCommands || current.voiceInput?.wakeCommands,
        }
      : current.voiceInput,
  };
}

function demoSettings(overrides = {}) {
  return {
    telegramToken: '',
    telegramChatId: '',
    mcpServers: {
      'project-graph': { command: 'npx', args: ['-y', 'project-graph-mcp'] },
      'agent-pool': { command: 'npx', args: ['-y', 'agent-pool-mcp'] },
    },
    agentPortal: {
      openLibraryPath: '/demo/open-agent-portal-library',
      teamLibraryRepo: '',
      teamLibraryBranch: 'main',
      networkAccess: { lanEnabled: false },
    },
    anthropicGateway: {
      enabled: false,
      provider: 'deepseek',
      providers: {
        deepseek: {
          type: 'anthropic-compatible',
          baseUrl: 'https://api.deepseek.com/anthropic',
          apiKeyEnv: 'DEEPSEEK_API_KEY',
          defaultModel: 'deepseek-v4-flash',
          plannerModel: 'deepseek-v4-pro',
        },
      },
    },
    ...overrides,
  };
}

function demoModels() {
  return {
    userModels: {
      opencode: ['openrouter/deepseek/deepseek-v4-pro', 'openrouter/deepseek/deepseek-v4-flash'],
      gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
      claude: ['deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-flash', 'claude-sonnet-4-6'],
      codex: ['gpt-5-codex'],
    },
    cliModels: [
      {
        id: 'openrouter/deepseek/deepseek-v4-pro',
        name: 'DeepSeek V4 Pro',
        context: 128000,
        maxOutput: 8192,
        pricePrompt: '0.27',
        priceCompletion: '1.10',
        rawPrompt: 0.27,
        rawCompletion: 1.10,
        isTools: true,
        created: 1764547200,
      },
      {
        id: 'openrouter/deepseek/deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        context: 128000,
        maxOutput: 8192,
        pricePrompt: '0.55',
        priceCompletion: '2.19',
        rawPrompt: 0.55,
        rawCompletion: 2.19,
        isTools: true,
        created: 1764547200,
      },
      {
        id: 'gemini/gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        context: 1000000,
        maxOutput: 65536,
        pricePrompt: '1.25',
        priceCompletion: '10.00',
        rawPrompt: 1.25,
        rawCompletion: 10,
        isVision: true,
        isTools: true,
        created: 1764547200,
      },
    ],
  };
}

function readJsonIfExists(filePath) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {}
  return null;
}

function normalizeProjectSource(rootPath, source) {
  if (!source?.projectId) return null;
  let sourceRoot = path.join(rootPath, source.projectId);
  if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) return null;
  let meta = readJsonIfExists(path.join(sourceRoot, '.public-source.json')) || source;
  return {
    projectId: source.projectId,
    name: meta.name || source.name || source.projectId,
    repo: meta.repo || source.repo || '',
    ref: meta.ref || source.ref || '',
    syncedAt: meta.syncedAt || null,
    rootPath: sourceRoot,
    publicPath: path.posix.join(DEMO_PUBLIC_PROJECTS_PATH, source.projectId),
  };
}

function loadPublicProjectSources(env = process.env) {
  let rootPath = env.AGENT_PORTAL_PUBLIC_PROJECTS_ROOT;
  if (!rootPath) return new Map();
  let config = readJsonIfExists(path.join(rootPath, 'sources.json'));
  let sources = Array.isArray(config?.sources)
    ? config.sources
    : fs.existsSync(rootPath)
      ? fs.readdirSync(rootPath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({ projectId: entry.name, name: entry.name }))
      : [];
  let map = new Map();
  for (let source of sources) {
    let normalized = normalizeProjectSource(rootPath, source);
    if (normalized) map.set(normalized.projectId, normalized);
  }
  return map;
}

function demoProjectHistory(publicSources) {
  let sources = [...new Set(publicSources.values())];
  if (sources.length) {
    let colors = ['#4c8bf5', '#e8710a', '#34a853', '#fbbc04', '#9334e6', '#00bcd4'];
    let projects = sources.map((source, index) => ({
      id: source.projectId,
      name: source.name,
      path: source.publicPath,
      color: colors[index % colors.length],
      lastOpened: Date.now() - (index * 3600_000),
      publicSource: {
        repo: source.repo,
        ref: source.ref,
        syncedAt: source.syncedAt,
      },
    }));
    return { projects, activeIds: projects.map((project) => project.id) };
  }

  let history = clone(projectHistory);
  history.projects = history.projects.map((project) => {
    let source = publicSources.get(project.id);
    if (!source) return project;
    return {
      ...project,
      name: source.name || project.name,
      path: source.publicPath,
      publicSource: {
        repo: source.repo,
        ref: source.ref,
        syncedAt: source.syncedAt,
      },
    };
  });
  return history;
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
    projectId: 'agent-portal',
    messages: [
      { role: 'user', text: 'What can RND PRO build for my team?' },
      { role: 'agent', text: rndProReply('What can RND PRO build for my team?') },
    ],
  });
  return ensureDemoSubagentChats(chats);
}

function publicRelativePath(projectRoot, requestedPath, aliases = []) {
  let normalized = path.posix.normalize(String(requestedPath || '').replaceAll('\\', '/'));
  let rootAliases = [
    path.posix.normalize(projectRoot.replaceAll('\\', '/')),
    DEMO_PROJECT_PATH,
    ...aliases.map((alias) => path.posix.normalize(String(alias).replaceAll('\\', '/'))),
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

function publicPathAllowed(projectRoot, requestedPath, aliases = []) {
  let normalized = publicRelativePath(projectRoot, requestedPath, aliases);
  if (!normalized || normalized.startsWith('../')) return null;
  let parts = normalized.split('/');
  if (parts.some((part) => BLOCKED_SEGMENTS.has(part) || part.startsWith('.'))) return null;
  let first = parts[0];
  if (!PUBLIC_ROOTS.includes(first)) return null;
  return normalized;
}

function readPublicFile(projectRoot, requestedPath, aliases = []) {
  let safePath = publicPathAllowed(projectRoot, requestedPath, aliases);
  if (!safePath) return null;
  let absolutePath = path.join(projectRoot, safePath);
  if (!absolutePath.startsWith(projectRoot) || !fs.existsSync(absolutePath)) return null;
  let stat = fs.statSync(absolutePath);
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
  return fs.readFileSync(absolutePath, 'utf8');
}

function walkFiles(rootDir, relativeDir = '', out = [], limit = 5000, aliases = []) {
  let absoluteDir = path.join(rootDir, relativeDir);
  if (!fs.existsSync(absoluteDir)) return out;
  for (let entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (BLOCKED_SEGMENTS.has(entry.name) || entry.name.startsWith('.')) continue;
    let relPath = path.posix.join(relativeDir.replaceAll('\\', '/'), entry.name);
    if (!publicPathAllowed(rootDir, relPath, aliases)) continue;
    if (entry.isDirectory()) {
      walkFiles(rootDir, relPath, out, limit, aliases);
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

function filePayload(projectRoot, requestedPath, options = {}) {
  let aliases = options.aliases || [];
  let safePath = publicPathAllowed(projectRoot, requestedPath, aliases);
  let content = safePath ? readPublicFile(projectRoot, safePath, aliases) : null;
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
    publicSource: options.publicSource || null,
  };
}

function buildPublicFileTree(projectRoot, aliases = []) {
  let tree = {};
  for (let filePath of walkFiles(projectRoot, '', [], 5000, aliases)) {
    let directory = path.posix.dirname(filePath);
    let key = directory === '.' ? './' : `${directory}/`;
    if (!tree[key]) tree[key] = [];
    tree[key].push(path.posix.basename(filePath));
  }
  for (let files of Object.values(tree)) files.sort();
  return Object.fromEntries(Object.entries(tree).sort(([a], [b]) => a.localeCompare(b)));
}

function flattenFileTree(fileTree) {
  let files = [];
  for (let [directory, names] of Object.entries(fileTree)) {
    let prefix = directory === './' ? '' : directory;
    for (let name of names) files.push(path.posix.join(prefix, name));
  }
  return files.sort();
}

function sourceFileAllowed(filePath) {
  return PUBLIC_SOURCE_EXTENSIONS.has(path.posix.extname(filePath).toLowerCase());
}

function assetFileAllowed(filePath) {
  return PUBLIC_ASSET_EXTENSIONS.has(path.posix.extname(filePath).toLowerCase());
}

function extractPublicImports(content) {
  let imports = new Set();
  let patterns = [
    /\bimport\s+(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+[^'"()]*?\s+from\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (let pattern of patterns) {
    for (let match of content.matchAll(pattern)) {
      let specifier = match[1];
      if (specifier?.startsWith('.') || specifier?.startsWith('/')) imports.add(specifier);
    }
  }
  return [...imports].sort();
}

function extractPublicExports(content) {
  let exports = new Set();
  let patterns = [
    /\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s*\{([^}]+)\}/g,
  ];
  for (let match of content.matchAll(patterns[0])) {
    exports.add(match[1]);
  }
  for (let match of content.matchAll(patterns[1])) {
    for (let item of match[1].split(',')) {
      let name = item.trim().split(/\s+as\s+/i).pop()?.trim();
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) exports.add(name);
    }
  }
  return [...exports].sort();
}

function buildPublicImportMap(projectRoot, files, aliases = []) {
  let imports = {};
  for (let filePath of files) {
    if (!sourceFileAllowed(filePath)) continue;
    let content = readPublicFile(projectRoot, filePath, aliases);
    if (content === null) continue;
    let deps = extractPublicImports(content);
    if (deps.length) imports[filePath] = deps;
  }
  return imports;
}

function buildPublicExportMap(projectRoot, files, aliases = []) {
  let exports = {};
  for (let filePath of files) {
    if (!sourceFileAllowed(filePath)) continue;
    let content = readPublicFile(projectRoot, filePath, aliases);
    if (content === null) continue;
    let names = extractPublicExports(content);
    if (names.length) exports[filePath] = names;
  }
  return exports;
}

function buildPublicLineMap(projectRoot, files, aliases = []) {
  let lines = {};
  for (let filePath of files) {
    if (!sourceFileAllowed(filePath)) continue;
    let content = readPublicFile(projectRoot, filePath, aliases);
    if (content === null) continue;
    lines[filePath] = content.split('\n').length;
  }
  return lines;
}

function buildPublicAssetTree(files) {
  let assets = {};
  for (let filePath of files) {
    if (!assetFileAllowed(filePath)) continue;
    let directory = path.posix.dirname(filePath);
    let key = directory === '.' ? './' : `${directory}/`;
    if (!assets[key]) assets[key] = [];
    assets[key].push(path.posix.basename(filePath));
  }
  for (let names of Object.values(assets)) names.sort();
  return Object.fromEntries(Object.entries(assets).sort(([a], [b]) => a.localeCompare(b)));
}

function publicSkeleton(projectRoot, aliases = [], source = null) {
  let fileTree = buildPublicFileTree(projectRoot, aliases);
  let files = flattenFileTree(fileTree);
  let exports = buildPublicExportMap(projectRoot, files, aliases);
  return {
    n: {},
    X: exports,
    I: buildPublicImportMap(projectRoot, files, aliases),
    L: buildPublicLineMap(projectRoot, files, aliases),
    s: {
      files: files.length,
      classes: 0,
      functions: Object.values(exports).reduce((sum, names) => sum + names.length, 0),
      publicDemo: true,
    },
    f: fileTree,
    a: buildPublicAssetTree(files),
    publicSource: source ? {
      projectId: source.projectId,
      repo: source.repo,
      ref: source.ref,
      syncedAt: source.syncedAt,
    } : null,
  };
}

function publicSourceMetadata(source) {
  if (!source) return null;
  return {
    projectId: source.projectId,
    repo: source.repo,
    ref: source.ref,
    syncedAt: source.syncedAt,
  };
}

function sourceContext(projectRoot, publicSources, requestedPath = '', projectId = '') {
  let normalized = path.posix.normalize(String(requestedPath || '').replaceAll('\\', '/'));
  let source = projectId ? publicSources.get(projectId) : null;
  if (!source) {
    for (let candidate of publicSources.values()) {
      let rootAlias = path.posix.normalize(candidate.rootPath.replaceAll('\\', '/'));
      let publicAlias = path.posix.normalize(candidate.publicPath);
      if (normalized === rootAlias || normalized.startsWith(`${rootAlias}/`) || normalized === publicAlias || normalized.startsWith(`${publicAlias}/`)) {
        source = candidate;
        break;
      }
    }
  }
  if (!source) return { root: projectRoot, aliases: [DEMO_PROJECT_PATH], source: null };
  return {
    root: source.rootPath,
    aliases: [source.publicPath],
    source,
  };
}

function demoGraphMetadata() {
  return {
    clusters: [
      {
        id: 'demo-ui',
        label: 'UI shell',
        description: 'Browser UI, panels, and Symbiote provider components.',
        paths: ['web/', 'packages/symbiote-node/'],
      },
      {
        id: 'demo-server',
        label: 'Server demo mode',
        description: 'Public mock APIs, route handling, and safe repository file exposure.',
        paths: ['src/node/server/', 'demo/'],
      },
    ],
    stories: [
      {
        id: 'public-demo-flow',
        label: 'Public demo flow',
        description: 'How the public demo serves safe project data.',
        beats: [
          {
            id: 'server-entry',
            label: 'Server demo mode',
            narrative: 'The hosted demo answers API and MCP calls with safe mock data.',
            clusterId: 'demo-server',
            focusPath: 'src/node/server/demo-mode.js',
            nodes: ['src/node/server/demo-mode.js'],
          },
          {
            id: 'ui-entry',
            label: 'Provider UI',
            narrative: 'The browser renders project files, graph, chat, skills, runtime, and XR surfaces from the mock contracts.',
            clusterId: 'demo-ui',
            focusPath: 'web/app.js',
            nodes: ['web/app.js', 'web/router-registry.js'],
          },
        ],
      },
    ],
  };
}

function demoPortalFileContent(filePath, source = 'team') {
  let pathLabel = String(filePath || 'README.md').replace(/^\.agent-portal\/?/, '');
  return [
    '---',
    `title: ${pathLabel}`,
    `source: ${source === 'open-library' ? 'open-library-demo' : 'agent-portal-demo'}`,
    '---',
    '',
    `# ${pathLabel}`,
    '',
    'This public demo shows the Agent Portal skill and workflow UI with safe mock data.',
    '',
    '- Private repository URLs, secrets, and runtime state are not exposed.',
    '- Reusable UI behavior belongs in `symbiote-node` provider components.',
    '- Product-specific orchestration remains in Agent Portal.',
  ].join('\n');
}

function demoWorkflowList() {
  return [
    {
      name: 'public-demo-release',
      description: 'Validate, deploy, and smoke-test the public demo.',
      steps: [
        { id: 'verify', name: 'Verify contracts', description: 'Run unit and provider-boundary tests.', tools: ['test'] },
        { id: 'deploy', name: 'Deploy container', description: 'Build and publish the Agent Portal demo image.', tools: ['deploy'] },
        { id: 'smoke', name: 'Browser smoke', description: 'Check routes, chat, graph, skills, and XR diagnostics.', tools: ['browser'] },
      ],
    },
    {
      name: 'symbiote-provider-audit',
      description: 'Audit UI primitives against symbiote-node provider boundaries.',
      steps: [
        { id: 'catalog', name: 'Catalog primitives', description: 'Check public component coverage.', tools: ['discover'] },
        { id: 'theme', name: 'Theme coverage', description: 'Verify cascade tokens and aliases.', tools: ['audit'] },
      ],
    },
  ];
}

function demoPipelineList() {
  return [
    {
      name: 'Public Demo Health',
      on_error: 'stop',
      steps: [
        { name: 'Contract tests', prompt: 'Run demo-mode and provider-boundary tests.', skill: 'testing', timeout: 120 },
        { name: 'Deploy smoke', prompt: 'Verify public health and demo route.', skill: 'deploy', timeout: 120 },
        { name: 'Browser audit', prompt: 'Check visible routes for missing mocks.', skill: 'reviewer', timeout: 180 },
      ],
    },
    {
      name: 'XR Preview Readiness',
      on_error: 'continue',
      steps: [
        { name: 'XR diagnostics', prompt: 'Open XR diagnostics and collect support data.', skill: 'browser', timeout: 90 },
        { name: 'Theme check', prompt: 'Verify provider theme inheritance in spatial panels.', skill: 'reviewer', timeout: 120 },
      ],
    },
  ];
}

function demoMarketplace() {
  let rndProCatalog = [
    {
      name: 'browser-x-mcp',
      category: 'rnd-pro',
      command: 'npx',
      args: ['-y', 'browser-x-mcp'],
      description: 'Browser automation tools for public UI smoke tests.',
      source: 'https://rnd-pro.com/',
    },
    {
      name: 'symbiote-node-provider',
      category: 'rnd-pro',
      command: 'npx',
      args: ['-y', 'symbiote-node'],
      description: 'UI provider contracts, layouts, themes, and XR primitives.',
      source: 'https://rnd-pro.com/',
    },
  ];

  return {
    demoMode: true,
    installed: {
      'project-graph-mcp': {
        category: 'rnd-pro',
        command: 'npx',
        args: ['-y', 'project-graph-mcp'],
        description: 'Safe project graph, file skeleton, and code structure provider.',
        source: 'https://rnd-pro.com/',
      },
      'agent-pool-mcp': {
        category: 'rnd-pro',
        command: 'npx',
        args: ['-y', 'agent-pool-mcp'],
        description: 'Parallel agent orchestration and workflow provider.',
        source: 'https://rnd-pro.com/',
      },
    },
    available: rndProCatalog,
    categories: {
      'rnd-pro': rndProCatalog,
      official: [],
      google: [],
      community: [],
    },
  };
}

function createMcpResponse(projectRoot, publicSources, body = {}) {
  let serverName = body.serverName || 'project-graph';
  let method = body.method;
  let params = body.params || {};

  if (method === 'tools/list') {
    return { tools: toolsByServer[serverName] || toolsByServer['project-graph'] || [] };
  }

  if (method !== 'tools/call') return { error: { message: 'Unsupported demo MCP method' } };

  let toolName = params.name;
  let args = params.arguments || {};
  let ctx = sourceContext(projectRoot, publicSources, args.path || args.file, args.projectId);
  if (toolName === 'get_skeleton') return mcpContent(JSON.stringify(publicSkeleton(ctx.root, ctx.aliases, ctx.source)));
  if (toolName === 'compact' || toolName === 'docs') {
    let filePath = args.file || args.path;
    return mcpContent(JSON.stringify(filePayload(ctx.root, filePath, { aliases: ctx.aliases, publicSource: publicSourceMetadata(ctx.source) })));
  }
  if (toolName === 'analyze') {
    let files = walkFiles(ctx.root, '', [], 5000, ctx.aliases);
    return mcpContent(JSON.stringify({
      project: ctx.source?.name || 'mcp-agent-portal',
      mode: 'public-demo',
      files: files.length,
      roots: PUBLIC_ROOTS,
      publicSource: publicSourceMetadata(ctx.source),
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
  if (toolName === 'list_workflows') {
    return mcpContent(JSON.stringify(demoWorkflowList()));
  }
  if (toolName === 'get_workflow_content') {
    return mcpContent(demoPortalFileContent(`workflows/${args.nodeId || 'public-demo-release'}.md`));
  }
  if (toolName === 'list_pipelines') {
    return mcpContent(JSON.stringify(demoPipelineList()));
  }
  if (toolName === 'run_pipeline') {
    return mcpContent(JSON.stringify({ ok: true, demoMode: true, pipelineId: args.pipeline_id || null }));
  }
  if (toolName === 'list_groups') {
    return mcpContent(JSON.stringify(groups));
  }
  if (toolName === 'list_tasks') {
    return mcpContent(JSON.stringify([
      { id: 'demo-task-audit', status: 'done', agent: 'reviewer', updatedAt: Date.now() - 30_000 },
      { id: 'demo-task-xr', status: 'running', agent: 'browser', updatedAt: Date.now() - 10_000 },
    ]));
  }
  if (toolName === 'get_tracked_files') {
    return mcpContent(JSON.stringify([
      { path: 'src/node/server/demo-mode.js', reason: 'Public demo server contract' },
      { path: 'packages/symbiote-node/xr/index.js', reason: 'XR provider API' },
    ]));
  }
  if (toolName === 'untrack_files') {
    return mcpContent(JSON.stringify({ ok: true, demoMode: true }));
  }
  if (toolName === 'get_task_result') {
    return mcpContent('Demo task completed. In production this is where delegated agent findings are streamed back.');
  }
  return mcpContent('Demo tool response.');
}

export function createServerDemoMode({ projectRoot, env = process.env } = {}) {
  let enabled = isServerDemoMode(env);
  let publicSources = loadPublicProjectSources(env);
  let xrDiagnosticLogStore = createXrDiagnosticLogStore({
    demoMode: true,
    logFile: getLogPath('xr-diagnostics', ['events.jsonl'], { projectRoot, env }),
  });
  let chats = createDemoChats();
  let chatMap = new Map(chats.map((chat) => [chat.id, chat]));
  let events = generateInitialEvents(18);
  let settingsState = {};
  let wsServer = new WebSocketServer({ noServer: true });

  function registerChatWithSubagents(chat) {
    chatMap.set(chat.id, chat);
    let subagents = demoSubagentSpecs(chat).map((spec, index) => createDemoSubagentChat(chat, index, spec));
    for (let child of subagents) {
      if (chatMap.has(child.id)) continue;
      chats.push(child);
      chatMap.set(child.id, child);
    }
    return chat;
  }

  function routeList() {
    return {
      'GET /api/instances': (_req, res) => json(res, instances),
      'GET /api/projects/history': (_req, res) => json(res, demoProjectHistory(publicSources)),
      'POST /api/projects/open': async (_req, res) => json(res, { ok: true, demo: true, projectId: 'agent-portal' }),
      'POST /api/projects/close': async (_req, res) => json(res, { ok: true, demo: true }),
      'POST /api/projects/remove': async (_req, res) => json(res, { ok: true, demo: true }),
      'POST /api/projects/update': async (_req, res) => json(res, { ok: true, demo: true }),
      'POST /api/stop': async (_req, res) => json(res, { ok: false, demoMode: true, error: 'Server lifecycle actions are disabled in public demo mode.' }, 403),
      'POST /api/restart': async (_req, res) => json(res, { ok: false, demoMode: true, error: 'Server lifecycle actions are disabled in public demo mode.' }, 403),
      'GET /api/chats': (_req, res) => json(res, { chats: chats.map(summarizeChat) }),
      'POST /api/chats': async (_req, res) => {
        let id = `demo-chat-${Date.now().toString(36)}`;
        let chat = createGeneratedDemoChat(id, 'New demo chat');
        chats.unshift(chat);
        registerChatWithSubagents(chat);
        json(res, { ok: true, id });
      },
      'POST /api/chats/get': async (req, res) => {
        let body = await parseBody(req);
        let chat = chatMap.get(body.id) || getChatById(body.id);
        if (!chat && /^(demo-chat-|chat-)/.test(String(body.id || ''))) {
          chat = createGeneratedDemoChat(body.id, 'Recovered public demo chat');
          chats.unshift(chat);
        }
        if (chat && !chat.parentChatId) registerChatWithSubagents(chat);
        json(res, chat ? withSubChatSummaries(chat, chatMap) : { error: 'Chat not found' }, chat ? 200 : 404);
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
        networkAccess: demoNetworkAccess(),
      }),
      'GET /api/health': (_req, res) => json(res, { ok: true, demoMode: true, services: [] }),
      'GET /api/runtime': (_req, res) => json(res, { ok: true, demoMode: true, statuses: [] }),
      'GET /api/runtime/health': (_req, res) => json(res, { ok: true, demoMode: true }),
      'GET /api/server-status': (_req, res) => json(res, { uptime: 300, agents: 2, monitors: 0, shutdownAt: null, demoMode: true }),
      'GET /api/xr-diagnostics/logs': (_req, res) => json(res, { logs: xrDiagnosticLogStore.list(), demoMode: true }),
      'GET /api/xr-diagnostics/summary': (_req, res) => json(res, { ...xrDiagnosticLogStore.summary(), demoMode: true }),
      'POST /api/xr-diagnostics/log': async (req, res) => {
        let body = await parseBody(req, 256 * 1024);
        let entry = xrDiagnosticLogStore.push(req, body);
        json(res, { ok: true, demoMode: true, entry });
      },
      'GET /api/network-auth/pending': (_req, res) => json(res, { pending: [], demoMode: true }),
      'POST /api/network-auth/approve': async (_req, res) => json(res, { ok: true, demoMode: true }),
      'POST /api/network-auth/reject': async (_req, res) => json(res, { ok: true, demoMode: true }),
      'GET /api/settings': (_req, res) => json(res, demoSettings(settingsState)),
      'POST /api/settings': async (req, res) => {
        let body = await parseBody(req);
        settingsState = mergeDemoSettings(settingsState, body);
        json(res, { ok: true, demoMode: true, settings: demoSettings(settingsState) });
      },
      'GET /api/settings/models': (_req, res) => json(res, demoModels()),
      'POST /api/settings/models': async (_req, res) => json(res, { ok: true, demoMode: true }),
      'POST /api/settings/models/refresh': async (_req, res) => json(res, { ...demoModels(), models: demoModels().cliModels, count: demoModels().cliModels.length }),
      'GET /api/adapter/types': (_req, res) => json(res, adapterTypes),
      'GET /api/cli/config': (_req, res) => json(res, cliConfig),
      'GET /api/flywheel/stats': (_req, res) => json(res, flywheelStats),
      'GET /api/skills': (_req, res) => json(res, { skills }),
      'GET /api/workflows': (_req, res) => json(res, { workflows }),
      'GET /api/pipelines': (_req, res) => json(res, { pipelines }),
      'GET /api/groups': (_req, res) => json(res, { groups }),
      'GET /api/files/list': (req, res) => {
        let url = new URL(req.url || '/', 'http://localhost');
        let ctx = sourceContext(projectRoot, publicSources, '', url.searchParams.get('project') || '');
        json(res, { files: walkFiles(ctx.root, '', [], 800, ctx.aliases), publicSource: publicSourceMetadata(ctx.source) });
      },
      'GET /api/project-graph-metadata': (_req, res) => json(res, { ok: true, demoMode: true, metadata: demoGraphMetadata() }),
      'POST /api/project-graph-metadata': async (req, res) => {
        let body = await parseBody(req);
        json(res, { ok: true, demoMode: true, metadata: body.metadata || demoGraphMetadata() });
      },
      'GET /api/agent-portal/tree': (_req, res) => json(res, { ok: true, configured: true, demoMode: true, tree: DEMO_AGENT_PORTAL_TREE }),
      'GET /api/agent-portal/file': (req, res) => {
        let url = new URL(req.url || '/', 'http://localhost');
        let filePath = url.searchParams.get('path') || 'README.md';
        json(res, { ok: true, demoMode: true, path: filePath, content: demoPortalFileContent(filePath) });
      },
      'POST /api/agent-portal/file': async (_req, res) => json(res, { ok: true, demoMode: true }),
      'GET /api/agent-portal/open-library/tree': (_req, res) => json(res, { ok: true, configured: true, root: '/demo/open-agent-portal-library', demoMode: true, tree: DEMO_OPEN_LIBRARY_TREE }),
      'GET /api/agent-portal/open-library/file': (req, res) => {
        let url = new URL(req.url || '/', 'http://localhost');
        let filePath = url.searchParams.get('path') || 'README.md';
        json(res, { ok: true, demoMode: true, path: filePath, content: demoPortalFileContent(filePath, 'open-library') });
      },
      'POST /api/agent-portal/open-library/install': async (req, res) => {
        let body = await parseBody(req);
        json(res, { ok: true, demoMode: true, targetPath: body.path || body.sourcePath || 'skills/public-demo.md' });
      },
      'GET /api/marketplace': (_req, res) => json(res, demoMarketplace()),
      'POST /api/marketplace/install': async (_req, res) => json(res, { ok: true, demoMode: true }),
      'POST /api/marketplace/remove': async (_req, res) => json(res, { ok: true, demoMode: true }),
      'POST /api/marketplace/install-custom': async (_req, res) => json(res, { ok: true, demoMode: true }),
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
        json(res, createMcpResponse(projectRoot, publicSources, body));
      },
      'POST /api/file': async (req, res) => {
        let body = await parseBody(req);
        let ctx = sourceContext(projectRoot, publicSources, body.path || body.file, body.projectId);
        json(res, filePayload(ctx.root, body.path || body.file, { aliases: ctx.aliases, publicSource: publicSourceMetadata(ctx.source) }));
      },
      'POST /api/raw-file': async (req, res) => {
        let body = await parseBody(req);
        let ctx = sourceContext(projectRoot, publicSources, body.path || body.file, body.projectId);
        json(res, filePayload(ctx.root, body.path || body.file, { aliases: ctx.aliases, publicSource: publicSourceMetadata(ctx.source) }));
      },
      'POST /api/compact-file': async (req, res) => {
        let body = await parseBody(req);
        let ctx = sourceContext(projectRoot, publicSources, body.path || body.file, body.projectId);
        json(res, filePayload(ctx.root, body.path || body.file, { aliases: ctx.aliases, publicSource: publicSourceMetadata(ctx.source) }));
      },
      'POST /api/expand-file': async (req, res) => {
        let body = await parseBody(req);
        let ctx = sourceContext(projectRoot, publicSources, body.path || body.file, body.projectId);
        json(res, filePayload(ctx.root, body.path || body.file, { aliases: ctx.aliases, publicSource: publicSourceMetadata(ctx.source) }));
      },
      'POST /api/adapter/run': async (req, res) => {
        let body = await parseBody(req);
        json(res, { response: demoChatReply(body.prompt), events: [], demo: true });
      },
    };
  }

  function handleUpgrade(req, socket, head) {
    if (!enabled) return false;
    let url = new URL(req.url || '/', 'http://localhost');
    let isMonitor = url.pathname === '/ws/monitor' || /\/[^/]+\/ws\/monitor$/.test(url.pathname);
    if (url.pathname !== '/ws/chat' && url.pathname !== '/ws/state' && !isMonitor) return false;
    wsServer.handleUpgrade(req, socket, head, (ws) => {
      ws.on('message', (buffer) => {
        let message;
        try { message = JSON.parse(String(buffer)); } catch { return; }
        if (message.method === 'chat.send') {
          let { chatId, prompt } = message.params || {};
          let chat = chatMap.get(chatId);
          if (chat) {
            chat.messages.push({ role: 'thinking', elapsed: 1, done: true, status: 'Готовлю демо-ответ...' });
            chat.messages.push({ role: 'agent', text: demoChatReply(prompt) });
            chat.updatedAt = Date.now();
          }
          ws.send(JSON.stringify({ method: 'chat.meta', params: { chatId, phase: 'thinking', messageCount: chat?.messages?.length || 0, thinkingStatus: 'Демо-ответ' } }));
          ws.send(JSON.stringify({ method: 'chat.done', params: { chatId, taskId: 'demo-task' } }));
        } else if (message.method === 'state.subscribe') {
          ws.send(JSON.stringify({ method: 'snapshot', params: { state: { tasks: {}, events } } }));
        }
      });
      ws.send(JSON.stringify({ method: 'demo.connected', params: { ok: true } }));
      if (isMonitor) {
        let match = url.pathname.match(/\/([^/]+)\/ws\/monitor$/);
        let prefix = match ? `/${match[1]}` : '';
        let instance = instances.find((item) => item.prefix === prefix) || instances[0];
        ws.send(JSON.stringify({
          method: 'snapshot',
          params: {
            state: {
              project: {
                name: instance?.projectName || instance?.name || 'public-demo',
                path: instance?.projectPath || DEMO_PROJECT_PATH,
                color: instance?.color || null,
                agents: instance?.agents || 0,
                pid: instance?.pid || null,
              },
            },
          },
        }));
      }
    });
    return true;
  }

  return {
    enabled,
    routes: enabled ? routeList() : {},
    handleUpgrade,
  };
}
