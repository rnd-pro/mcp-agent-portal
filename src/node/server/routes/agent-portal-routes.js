import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getAgentPortalConfig } from '../../config-store.js';
import {
  buildDevelopmentMap,
  parseTaskStateResult,
} from '../../proxy/orchestration-development-map.js';
import { getStateGraph } from '../../state-graph.js';
import { json, parseBody } from './http.js';

const LOCAL_AGENT_PORTAL_NAMES = new Set([
  'active_context.json',
  'board-state.json',
  'group-states.json',
  'groups.json',
  'messages',
  'runs',
  'schedule.json',
  'scheduled-results',
  'scheduler.pid',
  'runtime',
]);
const WRITABLE_AGENT_PORTAL_DIRS = new Set([
  'agents',
  'contexts',
  'pipelines',
  'resources',
  'rules',
  'skills',
  'workflows',
  'workspace',
]);
const WRITABLE_AGENT_PORTAL_EXTS = new Set(['.md', '.json']);
const PUBLIC_CONTENT_PATTERNS = [
  {
    label: 'private key material',
    pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/i,
  },
  {
    label: 'bearer token',
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i,
  },
  {
    label: 'secret assignment',
    pattern: /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|private[_-]?key|secret)\b\s*[:=]\s*['"]?[A-Za-z0-9._~+/=-]{16,}/i,
  },
  {
    label: 'local home path',
    pattern: /(^|[\s"'`(])(?:\/Users\/[^/\s]+|\/home\/[^/\s]+|[A-Za-z]:\\Users\\[^\\/\s]+)/,
  },
];
const TREE_MAX_DEPTH = 8;
const TREE_MAX_NODES = 1000;

function getAgentPortalRoot(projectRoot) {
  return path.join(path.resolve(projectRoot), '.agent-portal');
}

function getOpenLibraryRoot() {
  let configured = getAgentPortalConfig().openLibraryPath
    || process.env.AGENT_PORTAL_OPEN_LIBRARY_DIR
    || '';
  return configured ? path.resolve(configured) : null;
}

function resolveProjectRoot(projectRoot, projectId) {
  if (!projectId) return projectRoot;
  let project = getStateGraph().getProjectHistory().find(p => p.id === projectId);
  if (!project?.path) throw new Error(`Unknown project: ${projectId}`);
  return project.path;
}

function resolveRequestProjectRoot(req, projectRoot, body = null) {
  let url = new URL(req.url, 'http://localhost');
  return resolveProjectRoot(projectRoot, url.searchParams.get('project') || body?.projectId || null);
}

function isPublicAgentPortalPath(relativePath = '') {
  let [first] = String(relativePath || '').split(/[\\/]+/).filter(Boolean);
  return !first || !LOCAL_AGENT_PORTAL_NAMES.has(first);
}

function resolveAgentPortalPath(projectRoot, relativePath = '') {
  let root = getAgentPortalRoot(projectRoot);
  let cleanPath = String(relativePath || '').replace(/^[/\\]+/, '');
  if (!isPublicAgentPortalPath(cleanPath)) {
    throw new Error('Path is local portal state, not public .agent-portal content');
  }
  let targetPath = path.resolve(root, cleanPath);
  if (targetPath !== root && !targetPath.startsWith(root + path.sep)) {
    throw new Error('Path must stay inside .agent-portal');
  }
  return { root, targetPath, cleanPath };
}

function resolveOpenLibraryPath(relativePath = '') {
  let root = getOpenLibraryRoot();
  if (!root) {
    throw new Error(
      'Open Library source is not configured. Set agentPortal.openLibraryPath or '
      + 'AGENT_PORTAL_OPEN_LIBRARY_DIR.',
    );
  }
  let cleanPath = String(relativePath || '').replace(/^[/\\]+/, '');
  let targetPath = path.resolve(root, cleanPath);
  if (targetPath !== root && !targetPath.startsWith(root + path.sep)) {
    throw new Error('Path must stay inside Open Library');
  }
  return { root, targetPath, cleanPath };
}

function assertWritableAgentPortalPath(relativePath = '') {
  let parts = String(relativePath || '').split(/[\\/]+/).filter(Boolean);
  let [first] = parts;
  if (!first || !WRITABLE_AGENT_PORTAL_DIRS.has(first)) {
    throw new Error('Path is not editable public .agent-portal content');
  }
  if (parts.some(part => part.startsWith('.'))) {
    throw new Error('Hidden paths are not editable');
  }
  if (!WRITABLE_AGENT_PORTAL_EXTS.has(path.extname(parts.at(-1) || '').toLowerCase())) {
    throw new Error('Only markdown and JSON files are editable');
  }
}

function assertPublicAgentPortalContent(content = '') {
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(content)) {
    throw new Error('Content contains control characters');
  }
  for (let { label, pattern } of PUBLIC_CONTENT_PATTERNS) {
    if (pattern.test(content)) {
      throw new Error(`Content contains ${label}; public .agent-portal files must not store secrets or local paths`);
    }
  }
}

async function listAgentPortalTree(root, dir = '', state = { nodes: 0 }, depth = 0) {
  if (depth > TREE_MAX_DEPTH) return [];
  let targetPath = path.resolve(root, dir);
  if (targetPath !== root && !targetPath.startsWith(root + path.sep)) {
    throw new Error('Path must stay inside .agent-portal');
  }
  let entries = await fs.readdir(targetPath, { withFileTypes: true });
  let nodes = [];
  for (let entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    if (!isPublicAgentPortalPath(path.posix.join(dir.split(path.sep).join('/'), entry.name))) continue;
    state.nodes += 1;
    if (state.nodes > TREE_MAX_NODES) throw new Error('Tree is too large');
    let relPath = path.posix.join(dir.split(path.sep).join('/'), entry.name);
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: relPath,
        type: 'dir',
        children: await listAgentPortalTree(root, path.join(dir, entry.name), state, depth + 1),
      });
    } else if (entry.isFile()) {
      nodes.push({
        name: entry.name,
        path: relPath,
        type: 'file',
        ext: path.extname(entry.name).slice(1),
      });
    }
  }
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

async function listPublicTree(root, dir = '', state = { nodes: 0 }, depth = 0) {
  if (depth > TREE_MAX_DEPTH) return [];
  let targetPath = path.resolve(root, dir);
  if (targetPath !== root && !targetPath.startsWith(root + path.sep)) {
    throw new Error('Path must stay inside library root');
  }
  let entries = await fs.readdir(targetPath, { withFileTypes: true });
  let nodes = [];
  for (let entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    state.nodes += 1;
    if (state.nodes > TREE_MAX_NODES) throw new Error('Tree is too large');
    let relPath = path.posix.join(dir.split(path.sep).join('/'), entry.name);
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: relPath,
        type: 'dir',
        children: await listPublicTree(root, path.join(dir, entry.name), state, depth + 1),
      });
    } else if (entry.isFile()) {
      nodes.push({
        name: entry.name,
        path: relPath,
        type: 'file',
        ext: path.extname(entry.name).slice(1),
      });
    }
  }
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

async function writeTextAtomic(filePath, content) {
  let dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  let tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmpPath, content, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function isPathInside(root, targetPath) {
  let rel = path.relative(root, targetPath);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

async function assertRealPathInside(root, targetPath, label) {
  let [realRoot, realTarget] = await Promise.all([
    fs.realpath(root),
    fs.realpath(targetPath),
  ]);
  if (!isPathInside(realRoot, realTarget)) {
    throw new Error(`${label} must stay inside configured root`);
  }
  return realTarget;
}

async function assertSafeWriteTarget(root, targetPath) {
  await fs.mkdir(root, { recursive: true });
  let dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });
  await assertRealPathInside(root, dir, 'Path');
  try {
    let stat = await fs.lstat(targetPath);
    if (stat.isSymbolicLink()) {
      throw new Error('Refusing to write through a symbolic link');
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

async function readDevelopmentMapTaskState(proxyManager) {
  if (!proxyManager?.requestFromChild) return { tasks: [], staleProcesses: [] };
  try {
    let result = await proxyManager.requestFromChild('agent-pool', 'tools/call', {
      name: 'list_tasks',
      arguments: {},
    }, 30_000);
    return parseTaskStateResult(result);
  } catch (error) {
    return { tasks: [], staleProcesses: [], error: error.message };
  }
}

/**
 * @param {{ projectRoot: string, proxyManager?: any, stateGraph?: any }} ctx
 * @returns {Record<string, (req: any, res: any) => Promise<void>>}
 */
export function createAgentPortalRoutes(ctx) {
  let { projectRoot, proxyManager = null, stateGraph = null } = ctx;
  let getGraph = () => stateGraph || proxyManager?.stateGraph || getStateGraph();

  return {
    'GET /api/agent-portal/development-map': async (req, res) => {
      try {
        let url = new URL(req.url, 'http://localhost');
        let chatId = url.searchParams.get('chatId') || url.searchParams.get('chat') || null;
        let taskId = url.searchParams.get('taskId') || null;
        let taskState = await readDevelopmentMapTaskState(proxyManager);
        json(res, {
          ok: true,
          chatId,
          taskId,
          developmentMap: buildDevelopmentMap({
            sg: getGraph(),
            chatId,
            taskId,
            taskState,
          }),
        });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'GET /api/agent-portal/tree': async (req, res) => {
      try {
        let activeProjectRoot = resolveRequestProjectRoot(req, projectRoot);
        let root = getAgentPortalRoot(activeProjectRoot);
        let tree = await listAgentPortalTree(root);
        json(res, { ok: true, root, tree });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'GET /api/agent-portal/open-library/tree': async (_req, res) => {
      try {
        let root = getOpenLibraryRoot();
        if (!root) {
          json(res, { ok: true, configured: false, root: null, tree: [] });
          return;
        }
        let tree = await listPublicTree(root);
        json(res, { ok: true, configured: true, root, tree });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'GET /api/agent-portal/open-library/file': async (req, res) => {
      try {
        let url = new URL(req.url, 'http://localhost');
        let relPath = url.searchParams.get('path') || '';
        if (!relPath) throw new Error('Missing path');
        let { root, targetPath, cleanPath } = resolveOpenLibraryPath(relPath);
        await assertRealPathInside(root, targetPath, 'Path');
        let stat = await fs.stat(targetPath);
        if (!stat.isFile()) throw new Error('Path is not a file');
        let content = await fs.readFile(targetPath, 'utf8');
        json(res, { ok: true, root, path: cleanPath, content });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/agent-portal/open-library/install': async (req, res) => {
      try {
        let body = await parseBody(req, 5 * 1024 * 1024);
        if (!body.sourcePath) throw new Error('Missing sourcePath');
        let activeProjectRoot = resolveRequestProjectRoot(req, projectRoot, body);
        let source = resolveOpenLibraryPath(body.sourcePath);
        let targetRelPath = body.targetPath || source.cleanPath;
        assertWritableAgentPortalPath(targetRelPath);
        assertWritableAgentPortalPath(source.cleanPath);
        let target = resolveAgentPortalPath(activeProjectRoot, targetRelPath);
        await assertRealPathInside(source.root, source.targetPath, 'Source path');
        await assertSafeWriteTarget(target.root, target.targetPath);
        let stat = await fs.stat(source.targetPath);
        if (!stat.isFile()) throw new Error('Only file installation is supported');
        let content = await fs.readFile(source.targetPath, 'utf8');
        assertPublicAgentPortalContent(content);
        await writeTextAtomic(target.targetPath, content);
        json(res, { ok: true, sourcePath: source.cleanPath, targetPath: target.cleanPath });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'GET /api/agent-portal/file': async (req, res) => {
      try {
        let url = new URL(req.url, 'http://localhost');
        let relPath = url.searchParams.get('path') || '';
        if (!relPath) throw new Error('Missing path');
        let activeProjectRoot = resolveProjectRoot(projectRoot, url.searchParams.get('project') || null);
        let { root, targetPath, cleanPath } = resolveAgentPortalPath(activeProjectRoot, relPath);
        await assertRealPathInside(root, targetPath, 'Path');
        let stat = await fs.stat(targetPath);
        if (!stat.isFile()) throw new Error('Path is not a file');
        let content = await fs.readFile(targetPath, 'utf8');
        json(res, { ok: true, root, path: cleanPath, content });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/agent-portal/file': async (req, res) => {
      try {
        let body = await parseBody(req, 5 * 1024 * 1024);
        if (!body.path) throw new Error('Missing path');
        if (typeof body.content !== 'string') throw new Error('Missing content');
        let activeProjectRoot = resolveRequestProjectRoot(req, projectRoot, body);
        assertWritableAgentPortalPath(body.path);
        let { root, targetPath, cleanPath } = resolveAgentPortalPath(activeProjectRoot, body.path);
        await assertSafeWriteTarget(root, targetPath);
        assertPublicAgentPortalContent(body.content);
        await writeTextAtomic(targetPath, body.content);
        json(res, { ok: true, root, path: cleanPath });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },
  };
}
