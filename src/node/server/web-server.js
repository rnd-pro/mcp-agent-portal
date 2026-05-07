// @ctx web-server.ctx
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerService } from './local-gateway.js';
import { MCPProxyManager } from '../proxy/mcp-proxy.js';
import { createRoutes, dispatch } from './api-routes.js';
import { createProjectRoutes } from './api-routes-projects.js';
import { discoverOpenCodeModels } from '../adapters/index.js';
import { createMcpHttpHandler } from '../proxy/mcp-http-handler.js';

let __dirname = path.dirname(fileURLToPath(import.meta.url));
let ROOT_DIR = path.join(__dirname, '..', '..', '..');
let WEB_DIR = path.join(ROOT_DIR, 'web');
let PACKAGES_DIR = path.join(ROOT_DIR, 'packages');

/** @type {Record<string, string>} */
let MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * Serve a static file from WEB_DIR or packages/.
 * @param {string} reqPath
 * @param {http.ServerResponse} res
 */
function serveStaticFile(reqPath, res) {
  let normalizedPath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
  // Route /packages/<name>/... to packages/<name>/...
  let pkgMatch = normalizedPath.match(/^[/\\]?packages[/\\]([^/\\]+)[/\\]?(.*)/);
  // Route /vendor/symbiote/... to node_modules/@symbiotejs/symbiote/...
  let vendorMatch = normalizedPath.match(/^[/\\]?vendor[/\\]([^/\\]+)[/\\]?(.*)/);

  let targetPath;
  if (pkgMatch) {
    let pkgName = pkgMatch[1];
    let restPath = pkgMatch[2] || 'index.js';
    targetPath = path.join(PACKAGES_DIR, pkgName, restPath);
  } else if (vendorMatch) {
    let vendorName = vendorMatch[1];
    let restPath = vendorMatch[2] || 'index.js';
    if (vendorName === 'symbiote') {
      targetPath = path.join(ROOT_DIR, 'node_modules', '@symbiotejs', 'symbiote', restPath);
    } else {
      res.writeHead(403);
      res.end('Forbidden vendor');
      return;
    }
  } else {
    targetPath = path.join(WEB_DIR, normalizedPath === '/' ? 'index.html' : normalizedPath);
  }

  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
    targetPath = path.join(targetPath, 'index.html');
  }

  if (!fs.existsSync(targetPath)) {
    console.error(`🔴 404: reqPath=${reqPath}, targetPath=${targetPath}`);
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  let ext = path.extname(targetPath);
  let mime = MIME_TYPES[ext] || 'application/octet-stream';
  let content = fs.readFileSync(targetPath);
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache, no-store, must-revalidate' });
  res.end(content);
}

/**
 * Proxy an API request to a backend MCP server (fallback for unknown /api/ routes).
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {URL} url
 * @param {MCPProxyManager} proxyManager
 */
function proxyToBackend(req, res, url, proxyManager) {
  let serverName = url.searchParams.get('server') || 'project-graph';
  let serverDef = proxyManager.servers.get(serverName);
  let backendPort = serverDef ? serverDef.port : null;

  if (!backendPort && serverName === 'project-graph') {
    try {
      let bgDir = path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.local-gateway', 'backends');
      if (fs.existsSync(bgDir)) {
        let files = fs.readdirSync(bgDir).filter((f) => f.endsWith('.json'));
        for (let f of files) {
          let b = JSON.parse(fs.readFileSync(path.join(bgDir, f), 'utf8'));
          if (b.name === 'project-graph-mcp' || b.project.includes('project-graph')) {
            try { process.kill(b.pid, 0); backendPort = b.port; break; } catch (e) { /* process dead */ }
          }
        }
      }
    } catch (e) { /* backend discovery failed — will return 404 */ }
  }

  if (backendPort) {
    let options = {
      hostname: '127.0.0.1',
      port: backendPort,
      path: url.pathname + url.search,
      method: req.method,
      headers: { ...req.headers, host: `localhost:${backendPort}` },
    };
    let proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', () => {
      res.writeHead(502);
      res.end(JSON.stringify({ error: 'Backend unavailable' }));
    });
    req.pipe(proxyReq);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unknown API endpoint or server not found' }));
}

/**
 * Start the web server with HTTP API + static file serving.
 * @param {string} projectRoot
 * @returns {{ server: http.Server, proxyManager: MCPProxyManager }}
 */
export function startWebServer(projectRoot) {
  let proxyManager = new MCPProxyManager(projectRoot);
  proxyManager.initStateSync();
  let routes = createRoutes({ proxyManager, projectRoot });
  let projectRoutes = createProjectRoutes();
  let allRoutes = { ...routes, ...projectRoutes };

  // ── MCP HTTP Gateway ──────────────────────────────────
  // Spawned sub-agents connect here instead of launching isolated stdio MCP.
  // All tool calls are routed through the same proxyManager as the stdio multiplexer.
  let mcpHttpHandler = null;
  // Deferred init: tools aren't available until servers start (~3s)
  function getMcpHandler() {
    if (mcpHttpHandler) return mcpHttpHandler;
    // Lazy-create with live tools from proxy manager
    mcpHttpHandler = createMcpHttpHandler({
      getTools: async () => {
        return await _collectAllTools(proxyManager);
      },
      onToolCall: async (name, args) => {
        return _routeToolCall(proxyManager, name, args);
      },
      onResourcesList: async () => {
        return _aggregateResources(proxyManager);
      },
    });
    return mcpHttpHandler;
  }

  let server = http.createServer((req, res) => {
    let url = new URL(req.url, 'http://localhost');

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id',
        'Access-Control-Expose-Headers': 'Mcp-Session-Id',
      });
      res.end();
      return;
    }

    // MCP Streamable HTTP endpoint
    if (url.pathname === '/mcp' || url.pathname === '/mcp/message') {
      getMcpHandler()(req, res);
      return;
    }

    // Route map dispatch — one-liner routing (CIT pattern)
    if (dispatch(allRoutes, req, res)) return;

    // Fallback: proxy unknown /api/ to backend MCP servers
    if (url.pathname.startsWith('/api/')) {
      proxyToBackend(req, res, url, proxyManager);
      return;
    }

    // Static files
    serveStaticFile(url.pathname, res);
  });

  server.on('upgrade', (req, socket, head) => {
    if (proxyManager.handleUpgrade(req, socket, head)) {
      return;
    }
    socket.destroy();
  });

  server.listen(0, '127.0.0.1', () => {
    let port = server.address().port;
    let projectName = path.basename(projectRoot);
    let gateway = registerService('portal', port, {
      projectName,
      projectPath: projectRoot,
    });

    setTimeout(() => {
      console.error(`\n  ⬡ mcp-agent-portal`);
      console.error('  ─────────────────────────────');
      console.error(`  → ${gateway.url}`);
      console.error(`  → ${gateway.directUrl}  (direct)\n`);
    }, 200);

    // Fire-and-forget: populate OpenCode model cache
    discoverOpenCodeModels().catch(() => {});
  });

  function shutdown() {
    console.error('\n🟡 Shutting down mcp-agent-portal...');
    proxyManager.stopAll();
    server.close();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, proxyManager };
}

export default startWebServer;

// ═══════════════════════════════════════════════════════
//  MCP HTTP Gateway helpers
// ═══════════════════════════════════════════════════════

/** @type {Map<string, {tools: Array, ts: number}>} Cached tool lists per server */
const _toolCache = new Map();
const TOOL_CACHE_TTL = 10_000; // 10s

/**
 * Collect all tools from all child MCP servers.
 * Returns a flat array of MCP tool definitions.
 */
async function _collectAllTools(proxyManager) {
  let allTools = [];
  for (let serverName of proxyManager.servers.keys()) {
    let cached = _toolCache.get(serverName);
    if (cached && Date.now() - cached.ts < TOOL_CACHE_TTL) {
      allTools.push(...cached.tools);
    }
  }
  // If cache is empty, trigger async refresh and AWAIT IT
  if (allTools.length === 0) {
    await _refreshToolCache(proxyManager).catch(() => {});
    
    // Collect tools again after refresh
    for (let serverName of proxyManager.servers.keys()) {
      let cached = _toolCache.get(serverName);
      if (cached && Date.now() - cached.ts < TOOL_CACHE_TTL) {
        allTools.push(...cached.tools);
      }
    }
  }
  return allTools;
}

async function _refreshToolCache(proxyManager) {
  for (let serverName of proxyManager.servers.keys()) {
    try {
      let result = await proxyManager.requestFromChild(serverName, 'tools/list', {});
      // console.log(`[DEBUG] tools/list from ${serverName}:`, result ? Object.keys(result) : 'null');
      if (result?.tools) {
        _toolCache.set(serverName, { tools: result.tools, ts: Date.now() });
      } else {
        console.warn(`[MCP Gateway] no tools array returned from ${serverName}`);
      }
    } catch (e) { 
      console.error(`[MCP Gateway] failed to refresh tools for ${serverName}:`, e.message); 
    }
  }
}

/**
 * Route a tool call to the correct child MCP server.
 */
async function _routeToolCall(proxyManager, toolName, args) {
  let isDelegate = toolName === 'delegate_task' || toolName === 'delegate_task_readonly' ||
                   toolName === 'mcp_agent-portal_delegate_task' || toolName === 'mcp_agent-portal_delegate_task_readonly';
  if (isDelegate && args.parent_chat_id && !args.chat_id) {
    try {
      let { getStateGraph } = await import('../state-graph.js');
      let sg = getStateGraph();
      let parentMeta = sg.get(`chats/${args.parent_chat_id}`);
      let chat = sg.createChat({
        name: (args.prompt || '').substring(0, 40) + ((args.prompt || '').length > 40 ? '...' : ''),
        adapter: 'pool',
        parentChatId: args.parent_chat_id,
        projectId: parentMeta ? parentMeta.projectId : null
      }, 'mcp');
      args.chat_id = chat.id;
      proxyManager.broadcastMonitor({ jsonrpc: '2.0', method: 'patch', params: { path: 'chats.created', value: chat } });
    } catch (e) {
      console.error(`[MCP Gateway] failed to auto-create chat for delegate_task:`, e.message);
    }
  }

  // Find which server owns this tool
  for (let [serverName, cached] of _toolCache) {
    if (cached.tools.some(t => t.name === toolName)) {
      let result = await proxyManager.requestFromChild(serverName, 'tools/call', {
        name: toolName,
        arguments: args,
      }, 600_000); // 10 min timeout for long-running tools
      return result;
    }
  }

  // Cache miss — refresh and retry
  await _refreshToolCache(proxyManager);
  for (let [serverName, cached] of _toolCache) {
    if (cached.tools.some(t => t.name === toolName)) {
      let result = await proxyManager.requestFromChild(serverName, 'tools/call', {
        name: toolName,
        arguments: args,
      }, 600_000);
      return result;
    }
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
}

/**
 * Aggregate resources from all child MCP servers.
 */
async function _aggregateResources(proxyManager) {
  let allResources = [];
  for (let serverName of proxyManager.servers.keys()) {
    try {
      let result = await proxyManager.requestFromChild(serverName, 'resources/list', {});
      if (result?.resources) allResources.push(...result.resources);
    } catch { /* skip */ }
  }
  return { resources: allResources };
}