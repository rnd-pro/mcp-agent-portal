/**
 * API route map — declarative HTTP routing for mcp-agent-portal.
 * Each handler receives (req, res, ctx) where ctx provides proxyManager etc.
 *
 * Pattern from cloud-images-toolkit: cmdMap[cmd]?.(data) — one-liner dispatch.
 *
 * @module api-routes
 */
import {
  getAgentPortalConfig,
  getAnthropicGatewayConfig,
  readConfig,
  setAgentPortalConfig,
  setAnthropicGatewayConfig,
} from '../config-store.js';
import { getStateGraph } from '../state-graph.js';
import { getFlywheelStats } from '../mlops/flywheel.js';
import { lintFile } from './lint-service.js';
import { listAdapterTypes, discoverOpenCodeModels, getCLIModels, getAgentList, setPortalRoot } from '../adapters/index.js';
import { REGISTRY, getRegistryByCategory, findInRegistry } from './marketplace-registry.js';
import { validateProjectGraphMetadata } from '../../iso/project-graph-metadata.js';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let __dirname = path.dirname(fileURLToPath(import.meta.url));

function getProjectGraphMetadataPath(root) {
  return path.join(path.resolve(root), '.portal', 'project-graph.json');
}

function resolveProjectGraphMetadataRoot(projectRoot, requestedRoot) {
  let baseRoot = path.resolve(projectRoot);
  let root = !requestedRoot || requestedRoot === '.' ? baseRoot : path.resolve(requestedRoot);
  if (root !== baseRoot) {
    throw new Error('Invalid project graph metadata path: projectPath must match the portal project root');
  }
  return baseRoot;
}

async function writeJsonAtomic(filePath, data) {
  let dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  let tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function getAgentPortalRoot(projectRoot) {
  return path.join(path.resolve(projectRoot), '.agent-portal');
}

function getOpenLibraryRoot() {
  let configured = getAgentPortalConfig().openLibraryPath || process.env.AGENT_PORTAL_OPEN_LIBRARY_DIR || '';
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
    throw new Error('Open Library source is not configured. Set agentPortal.openLibraryPath or AGENT_PORTAL_OPEN_LIBRARY_DIR.');
  }
  let cleanPath = String(relativePath || '').replace(/^[/\\]+/, '');
  let targetPath = path.resolve(root, cleanPath);
  if (targetPath !== root && !targetPath.startsWith(root + path.sep)) {
    throw new Error('Path must stay inside Open Library');
  }
  return { root, targetPath, cleanPath };
}

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
const WRITABLE_AGENT_PORTAL_DIRS = new Set(['agents', 'skills', 'workflows']);
const WRITABLE_AGENT_PORTAL_EXTS = new Set(['.md', '.json']);
const TREE_MAX_DEPTH = 8;
const TREE_MAX_NODES = 1000;

function isPublicAgentPortalPath(relativePath = '') {
  let [first] = String(relativePath || '').split(/[\\/]+/).filter(Boolean);
  return !first || !LOCAL_AGENT_PORTAL_NAMES.has(first);
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
        children: await listAgentPortalTree(root, path.join(dir, entry.name), state, depth + 1)
      });
    } else if (entry.isFile()) {
      nodes.push({
        name: entry.name,
        path: relPath,
        type: 'file',
        ext: path.extname(entry.name).slice(1)
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
        children: await listPublicTree(root, path.join(dir, entry.name), state, depth + 1)
      });
    } else if (entry.isFile()) {
      nodes.push({
        name: entry.name,
        path: relPath,
        type: 'file',
        ext: path.extname(entry.name).slice(1)
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

/**
 * Parse JSON body from request.
 * @param {import('node:http').IncomingMessage} req
 * @param {number} [maxBytes]
 * @returns {Promise<any>}
 */
function parseBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c.toString();
      if (body.length > maxBytes) {
        req.destroy(new Error('Payload Too Large'));
        reject(new Error('Payload Too Large'));
      }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (err) { reject(err); }
    });
  });
}



/**
 * Build the route map. Accepts context once at init time.
 * @param {{ proxyManager: any, projectRoot: string }} ctx
 * @returns {Record<string, (req: any, res: any) => void | Promise<void>>}
 */
export function createRoutes(ctx) {
  let { proxyManager, projectRoot } = ctx;
  setPortalRoot(projectRoot);

  /** @type {Record<string, (req: any, res: any) => void | Promise<void>>} */
  let routes = {
    'GET /api/instances': (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(proxyManager.getInstances()));
    },

    'GET /api/project-info': (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        name: 'mcp-agent-portal',
        path: projectRoot,
        agents: proxyManager.servers.size,
        pid: process.pid,
      }));
    },

    'GET /api/project-graph-metadata': async (req, res) => {
      try {
        let url = new URL(req.url, 'http://localhost');
        let requestedRoot = resolveProjectGraphMetadataRoot(
          projectRoot,
          url.searchParams.get('projectPath') || url.searchParams.get('path'),
        );
        let sidecarPath = getProjectGraphMetadataPath(requestedRoot);
        let text;
        try {
          text = await fs.readFile(sidecarPath, 'utf8');
        } catch (err) {
          if (err.code === 'ENOENT') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, found: false, path: sidecarPath, metadata: { version: 1 } }));
            return;
          }
          throw err;
        }
        let metadata = validateProjectGraphMetadata(JSON.parse(text));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, found: true, path: sidecarPath, metadata }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    },

    'POST /api/project-graph-metadata': async (req, res) => {
      try {
        let body = await parseBody(req, 2 * 1024 * 1024);
        let requestedRoot = resolveProjectGraphMetadataRoot(projectRoot, body.projectPath || body.path);
        let metadata = validateProjectGraphMetadata(body.metadata || body);
        let sidecarPath = getProjectGraphMetadataPath(requestedRoot);
        await writeJsonAtomic(sidecarPath, metadata);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, path: sidecarPath, metadata }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    },

    'GET /api/server-status': (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        uptime: Math.round(process.uptime()),
        agents: proxyManager.servers.size,
        monitors: proxyManager.monitors.size,
        shutdownAt: null,
      }));
    },

    'GET /api/marketplace': (req, res) => {
      let config = readConfig();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        installed: config.mcpServers || {},
        available: REGISTRY,
        categories: getRegistryByCategory(),
      }));
    },

    'GET /api/health': (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(proxyManager.getHealthStatus()));
    },

    'GET /api/adapter/status': (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(proxyManager.adapterPool?.getStatus() || { adapters: {} }));
    },

    'POST /api/state/tasks': async (req, res) => {
      try {
        let { taskIds, parentChatId } = await parseBody(req);
        let sg = getStateGraph();
        let tasks = {};
        for (let id of (taskIds || [])) {
          let task = sg.get(`tasks/${id}`) || null;
          // Return only meta — no raw events (server-authoritative model)
          if (task) {
            tasks[id] = {
              status: task.status || task.type || 'running',
              updatedAt: task.updatedAt || null,
              startedAt: task.startedAt || null,
              eventCount: task.events?.length || 0,
            };
          } else {
            tasks[id] = null;
          }
        }
        // Resolve chatId for each task — find chats with matching pendingTaskId
        let allChats = sg.listChats?.() || [];
        for (let id of (taskIds || [])) {
          if (!tasks[id]) tasks[id] = {};
          let linkedChat = allChats.find(c => c.pendingTaskId === id);
          if (linkedChat) {
            tasks[id].chatId = linkedChat.id;
            tasks[id].chatName = linkedChat.name;
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ tasks }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    },

    'GET /api/flywheel/stats': (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getFlywheelStats()));
    },

    'GET /api/settings': (req, res) => {
      let sg = getStateGraph();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ...sg.getSettings(),
        agentPortal: getAgentPortalConfig(),
        anthropicGateway: getAnthropicGatewayConfig(),
      }));
    },

    'GET /api/ui': (req, res) => {
      let sg = getStateGraph();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sg.get('ui') || {}));
    },

    'POST /api/ui': async (req, res) => {
      try {
        let { path, value } = await parseBody(req);
        if (!path || (!path.startsWith('ui/') && !path.startsWith('layouts/'))) {
          throw new Error('Invalid UI state path');
        }
        let sg = getStateGraph();
        sg.set(path, value, 'http');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    },

    'POST /api/settings': async (req, res) => {
      try {
        let settings = await parseBody(req);
        let sg = getStateGraph();
        sg.setSettings(settings, 'http');
        if (Object.prototype.hasOwnProperty.call(settings, 'anthropicGateway')) {
          setAnthropicGatewayConfig(settings.anthropicGateway);
        }
        if (Object.prototype.hasOwnProperty.call(settings, 'agentPortal')) {
          setAgentPortalConfig(settings.agentPortal);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    },

    'GET /api/adapter/types': (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(listAdapterTypes()));
    },

    'GET /api/agents': (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ agents: getAgentList() }));
    },

    'GET /api/agent-portal/tree': async (req, res) => {
      try {
        let activeProjectRoot = resolveRequestProjectRoot(req, projectRoot);
        let root = getAgentPortalRoot(activeProjectRoot);
        let tree = await listAgentPortalTree(root);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, root, tree }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    },

    'GET /api/agent-portal/open-library/tree': async (req, res) => {
      try {
        let root = getOpenLibraryRoot();
        if (!root) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, configured: false, root: null, tree: [] }));
          return;
        }
        let tree = await listPublicTree(root);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, configured: true, root, tree }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
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
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, root, path: cleanPath, content }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
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
        await writeTextAtomic(target.targetPath, content);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, sourcePath: source.cleanPath, targetPath: target.cleanPath }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
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
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, root, path: cleanPath, content }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
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
        await writeTextAtomic(targetPath, body.content);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, root, path: cleanPath }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    },

    'GET /api/settings/models': (req, res) => {
      let sg = getStateGraph();
      let userModels = sg.getAllProviderModels();
      let cliModels = getCLIModels();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ userModels, cliModels }));
    },

    'POST /api/settings/models': async (req, res) => {
      try {
        let { provider, models } = await parseBody(req);
        if (!provider || !Array.isArray(models)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing provider or models array' }));
          return;
        }
        let sg = getStateGraph();
        sg.setProviderModels(provider, models, 'http');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    },

    'POST /api/settings/models/refresh': async (req, res) => {
      try {
        let models = await discoverOpenCodeModels();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, count: models.length, models }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    },

    'POST /api/stop': (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      setTimeout(() => process.exit(0), 200);
    },

    'POST /api/restart': (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, message: 'Restarting...' }));
      setTimeout(async () => {
        let { removePortFile } = await import('./backend-lifecycle.js');
        let { unlinkSync, openSync } = await import('node:fs');
        let { homedir } = await import('node:os');
        let backendScript = path.join(__dirname, 'backend.js');
        // 1. Stop child MCP servers
        proxyManager.stopAll();
        // 2. Remove port file and gateway.pid
        removePortFile(projectRoot);
        let gwDir = path.join(homedir(), '.local-gateway');
        try { unlinkSync(path.join(gwDir, 'gateway.pid')); } catch {}
        // 3. Close our HTTP server to release port 80 (gateway runs in-process)
        //    Use a wrapper script that waits before starting, so port 80 is free
        let logFile = path.join(gwDir, 'restart.log');
        let logFd = openSync(logFile, 'a');
        // Spawn with a shell wrapper that sleeps 2s to let old process fully exit
        spawn('/bin/sh', ['-c', `sleep 2 && exec ${JSON.stringify(process.execPath)} ${JSON.stringify(backendScript)} ${JSON.stringify(path.resolve(projectRoot))}`], {
          detached: true,
          stdio: ['ignore', logFd, logFd],
          env: { ...process.env, PORTAL_BACKEND: '1' },
        }).unref();
        // 4. Exit immediately — the spawned shell waits 2s before starting new backend
        setTimeout(() => process.exit(0), 300);
      }, 200);
    },

    'POST /api/mcp-call': async (req, res) => {
      try {
        let { serverName, method, params } = await parseBody(req);
        if (!serverName || !method) {
          res.writeHead(400);
          res.end('Missing serverName or method');
          return;
        }
        let result = await proxyManager.requestFromChild(serverName, method, params || {});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    },

    'POST /api/marketplace/install': async (req, res) => {
      try {
        let { name } = await parseBody(req);
        if (!name) throw new Error('Missing server name');
        let entry = findInRegistry(name);
        if (!entry) throw new Error(`"${name}" not found in registry`);
        proxyManager.addServer(name, { command: entry.command, args: entry.args });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, name, hot: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    },

    'POST /api/marketplace/install-custom': async (req, res) => {
      try {
        let { name, command, args, env } = await parseBody(req);
        if (!name || !command) throw new Error('Missing name or command');
        let def = { command, args: args || [], ...(env ? { env } : {}) };
        proxyManager.addServer(name, def);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, name, hot: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    },

    'POST /api/marketplace/remove': async (req, res) => {
      try {
        let { name } = await parseBody(req);
        if (!name) throw new Error('Missing server name');
        proxyManager.removeServer(name);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, name, hot: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    },

    'POST /api/lint-file': async (req, res) => {
      try {
        let { filePath } = await parseBody(req);
        if (!filePath) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing filePath' }));
          return;
        }
        let results = await lintFile(filePath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(results));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    },

    'POST /api/adapter/run': async (req, res) => {
      try {
        let { type, prompt, cwd, model, timeout } = await parseBody(req, 10 * 1024 * 1024);
        if (!type || !prompt) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing type or prompt' }));
          return;
        }
        let adapter = proxyManager.adapterPool?.acquire(type);
        if (!adapter) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Adapter ${type} not available or at capacity.` }));
          return;
        }
        try {
          let result = await adapter.run({ prompt, cwd, model, timeout });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } finally {
          proxyManager.adapterPool.release(adapter);
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    },

    // ── State Graph ───────────────────────────────────────

    'GET /api/state': (req, res) => {
      let sg = getStateGraph();
      let url = new URL(req.url, 'http://localhost');
      let p = url.searchParams.get('path') || '';
      let sinceParam = url.searchParams.get('since');

      res.writeHead(200, { 'Content-Type': 'application/json' });

      // Delta sync via ?since=N
      if (sinceParam) {
        let sinceVersion = parseInt(sinceParam, 10);
        let patches = sg.getPatches(sinceVersion);
        if (patches) {
          res.end(JSON.stringify({ ok: true, v: sg.version, patches }));
        } else {
          // Too old — send full snapshot
          res.end(JSON.stringify({ ok: true, ...sg.getSnapshot() }));
        }
        return;
      }

      // Path query or full snapshot
      if (p) {
        res.end(JSON.stringify({ ok: true, v: sg.version, path: p, value: sg.get(p) }));
      } else {
        res.end(JSON.stringify({ ok: true, ...sg.getSnapshot() }));
      }
    },

    'POST /api/state/commit': async (req, res) => {
      try {
        let body = await parseBody(req);
        let ops = body.ops;
        if (!Array.isArray(ops) || ops.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing ops array' }));
          return;
        }
        let sg = getStateGraph();
        let v = sg.commit(ops, body.source || 'http');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, v }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    },
  };

  return routes;
}

/**
 * Dispatch a request to the matching route handler.
 * @param {Record<string, Function>} routes
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @returns {boolean} true if handled
 */
export function dispatch(routes, req, res) {
  let url = new URL(req.url, 'http://localhost');
  let key = `${req.method} ${url.pathname}`;
  let handler = routes[key];
  if (handler) {
    handler(req, res);
    return true;
  }
  return false;
}
