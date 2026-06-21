// @ctx web-server.ctx
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerService } from './local-gateway.js';
import { MCPProxyManager } from '../proxy/mcp-proxy.js';
import { createRoutes, dispatch } from './api-routes.js';
import { createProjectRoutes } from './api-routes-projects.js';
import { createRuntimeRoutes } from './api-routes-runtime.js';
import { discoverOpenCodeModels } from '../adapters/index.js';
import { createMcpHttpHandler } from '../proxy/mcp-http-handler.js';
import { META_TOOLS, resumeChatTool } from '../proxy/mcp-multiplexer.js';
import { handlePortalGoalTool, isPortalGoalTool } from '../proxy/portal-goal-tools.js';
import {
  handlePortalOrchestratorTool,
  isPortalOrchestratorTool,
} from '../proxy/portal-orchestrator-tools.js';
import { resolveChatCreationAgent } from '../proxy/chat-delegate-routing.js';
import {
  internalMcpToolBlockedResult,
  isInternalMcpToolName,
  isPublicMcpToolServer,
  splitMcpHealthStatus,
} from '../proxy/mcp-tool-visibility.js';
import {
  buildDevelopmentMap,
  compactDevelopmentMap,
  parseTaskStateResult,
} from '../proxy/orchestration-development-map.js';
import { createAnthropicGatewayHandler } from './anthropic-gateway.js';
import { createNetworkAccessStatus, getNetworkAccessConfig, resolveRequestedPort } from './network-access.js';
import { createNetworkAuthController } from './network-auth.js';
import { createServerDemoMode } from './demo-mode.js';

let __dirname = path.dirname(fileURLToPath(import.meta.url));
let ROOT_DIR = path.join(__dirname, '..', '..', '..');
let WEB_DIR = path.join(ROOT_DIR, 'web');
let DIST_WEB_DIR = path.join(ROOT_DIR, 'dist', 'web');
let PACKAGES_DIR = path.join(ROOT_DIR, 'packages');
let NODE_MODULE_PACKAGE_NAMES = new Set(['symbiote-ui', 'symbiote-engine']);
const INTERNAL_TASK_STATE_TIMEOUT_MS = 5_000;

function jsonTextResult(value, extra = {}) {
  return {
    ...extra,
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  };
}

async function readInternalTaskState(proxyManager) {
  if (!proxyManager?.requestFromChild) return { tasks: [], staleProcesses: [] };
  try {
    let result = await proxyManager.requestFromChild('agent-pool', 'tools/call', {
      name: 'list_tasks',
      arguments: {},
    }, INTERNAL_TASK_STATE_TIMEOUT_MS);
    return parseTaskStateResult(result);
  } catch (error) {
    return { tasks: [], staleProcesses: [], error: error.message };
  }
}

function summarizeStaleProcesses(staleProcesses = []) {
  let items = Array.isArray(staleProcesses) ? staleProcesses : [];
  return {
    count: items.length,
    taskIds: items.map((item) => item?.taskId).filter(Boolean).slice(0, 20),
  };
}

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

export const HTML_IN_CANVAS_ORIGIN_TRIAL_ENV = 'AGENT_PORTAL_HTML_IN_CANVAS_ORIGIN_TRIAL_TOKEN';

export function resolveHtmlInCanvasOriginTrialToken(env = process.env) {
  let token = String(env[HTML_IN_CANVAS_ORIGIN_TRIAL_ENV] || '').trim();
  return token || null;
}

export function createStaticFileHeaders(targetPath, options = {}) {
  let env = options.env || process.env;
  let ext = path.extname(targetPath);
  let mime = MIME_TYPES[ext] || 'application/octet-stream';
  let headers = {
    'Content-Type': mime,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  };
  let htmlInCanvasToken = resolveHtmlInCanvasOriginTrialToken(env);
  if (ext === '.html' && htmlInCanvasToken) {
    headers['Origin-Trial'] = htmlInCanvasToken;
    headers['X-Agent-Portal-Origin-Trial'] = 'html-in-canvas';
  }
  return headers;
}

export function resolveWebRoot(options = {}) {
  let env = options.env || process.env;
  let webDir = options.webDir || WEB_DIR;
  let distWebDir = options.distWebDir || DIST_WEB_DIR;
  if (env.AGENT_PORTAL_WEB_ROOT) {
    return path.resolve(String(env.AGENT_PORTAL_WEB_ROOT));
  }
  if (options.dev || env.AGENT_PORTAL_DEV_WEB === '1' || process.argv.includes('--dev')) {
    return webDir;
  }
  let distIndexPath = path.join(distWebDir, 'index.html');
  return fs.existsSync(distIndexPath) ? distWebDir : webDir;
}

export function resolveStaticFileTarget(reqPath, options = {}) {
  let rootDir = options.rootDir || ROOT_DIR;
  let webRoot = options.webRoot || WEB_DIR;
  let packagesDir = options.packagesDir || PACKAGES_DIR;
  let normalizedPath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
  // Route /packages/<name>/... to packages/<name>/...
  let pkgMatch = normalizedPath.match(/^[/\\]?packages[/\\]([^/\\]+)[/\\]?(.*)/);
  // Route reviewed browser vendor modules from node_modules.
  let vendorMatch = normalizedPath.match(/^[/\\]?vendor[/\\]([^/\\]+)[/\\]?(.*)/);
  // Route shared DOM-free helpers used by both Node and browser code.
  let isoMatch = normalizedPath.match(/^[/\\]?src[/\\]iso[/\\]?(.*)/);

  if (pkgMatch) {
    let pkgName = pkgMatch[1];
    let restPath = pkgMatch[2] || 'index.js';
    return NODE_MODULE_PACKAGE_NAMES.has(pkgName)
      ? path.join(rootDir, 'node_modules', pkgName, restPath)
      : path.join(packagesDir, pkgName, restPath);
  }
  if (vendorMatch) {
    let vendorName = vendorMatch[1];
    let restPath = vendorMatch[2] || 'index.js';
    if (vendorName === 'symbiote') {
      return path.join(rootDir, 'node_modules', '@symbiotejs', 'symbiote', restPath);
    } else if (vendorName === 'iwer') {
      return path.join(rootDir, 'node_modules', 'iwer', restPath);
    } else if (vendorName === 'iwer-devui') {
      return path.join(rootDir, 'node_modules', '@iwer', 'devui', restPath);
    } else if (vendorName === 'three') {
      return path.join(rootDir, 'node_modules', 'three', restPath);
    }
    return null;
  }
  if (isoMatch) {
    let restPath = isoMatch[1] || '';
    return path.join(rootDir, 'src', 'iso', restPath);
  }
  return path.join(webRoot, normalizedPath === '/' ? 'index.html' : normalizedPath);
}

/**
 * Serve a static file from WEB_DIR, packages/, reviewed vendors, or shared iso helpers.
 * @param {string} reqPath
 * @param {string} method
 * @param {http.ServerResponse} res
 */
function serveStaticFile(reqPath, method, res, options = {}) {
  let targetPath = resolveStaticFileTarget(reqPath, options);
  if (!targetPath) {
    res.writeHead(403);
    res.end('Forbidden vendor');
    return;
  }

  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
    targetPath = path.join(targetPath, 'index.html');
  }

  if (!fs.existsSync(targetPath)) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  let content = fs.readFileSync(targetPath);
  res.writeHead(200, createStaticFileHeaders(targetPath));
  res.end(method === 'HEAD' ? undefined : content);
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
      let gwRoot = process.env.PORTAL_LOCAL_GATEWAY_DIR
        || path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.local-gateway');
      let bgDir = path.join(gwRoot, 'backends');
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
  let webRoot = resolveWebRoot();
  let networkAccess = getNetworkAccessConfig();
  let requestedPort = resolveRequestedPort();
  let networkAccessStatus = { ...networkAccess, localUrl: null, lanUrls: [] };
  let networkAuth = createNetworkAuthController();
  let serverDemoMode = createServerDemoMode({ projectRoot });
  let proxyManager = new MCPProxyManager(projectRoot);
  proxyManager.initStateSync();
  let routes = createRoutes({
    proxyManager,
    projectRoot,
    networkAuth,
    getNetworkAccessStatus: () => networkAccessStatus,
    getServerAddress: () => server.address(),
  });
  routes = { ...routes, ...networkAuth.routes() };
  let projectRoutes = createProjectRoutes({ proxyManager });
  let runtimeRoutes = createRuntimeRoutes({ proxyManager, projectRoot });
  let allRoutes = { ...routes, ...projectRoutes, ...runtimeRoutes };
  if (serverDemoMode.enabled) {
    allRoutes = { ...allRoutes, ...serverDemoMode.routes };
  }
  let anthropicGatewayHandler = createAnthropicGatewayHandler();

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

    if (networkAccess.lanEnabled && networkAccess.networkAuthRequired !== false
      && !networkAuth.requireNetworkAuthorization(req, res)) {
      return;
    }

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, X-Api-Key, Anthropic-Version, Mcp-Session-Id',
        'Access-Control-Expose-Headers': 'Mcp-Session-Id',
      });
      res.end();
      return;
    }

    if (serverDemoMode.enabled && (url.pathname === '/mcp' || url.pathname === '/mcp/message' || url.pathname.startsWith('/anthropic/'))) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unavailable in public demo mode' }));
      return;
    }

    // MCP Streamable HTTP endpoint
    if (url.pathname === '/mcp' || url.pathname === '/mcp/message') {
      getMcpHandler()(req, res);
      return;
    }

    // Anthropic-compatible LLM gateway for Claude Code:
    // set ANTHROPIC_BASE_URL=http://<portal>/anthropic
    if (url.pathname.startsWith('/anthropic/')) {
      anthropicGatewayHandler(req, res);
      return;
    }

    // Route map dispatch — one-liner routing (CIT pattern)
    if (dispatch(allRoutes, req, res)) return;

    // Fallback: proxy unknown /api/ to backend MCP servers
    if (url.pathname.startsWith('/api/')) {
      if (serverDemoMode.enabled) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unknown public demo API endpoint' }));
        return;
      }
      proxyToBackend(req, res, url, proxyManager);
      return;
    }

    // Static files
    serveStaticFile(url.pathname, req.method, res, { webRoot });
  });

  server.on('upgrade', (req, socket, head) => {
    if (networkAccess.lanEnabled && networkAccess.networkAuthRequired !== false
      && !networkAuth.hasAuthorizedUpgrade(req)) {
      socket.destroy();
      return;
    }
    if (serverDemoMode.handleUpgrade(req, socket, head)) {
      return;
    }
    if (proxyManager.handleUpgrade(req, socket, head)) {
      return;
    }
    socket.destroy();
  });

  server.listen(requestedPort, networkAccess.bindHost, () => {
    let port = server.address().port;
    let projectName = path.basename(projectRoot);
    Object.assign(networkAccessStatus, createNetworkAccessStatus(port, networkAccess));
    let gateway = registerService('portal', port, {
      projectName,
      projectPath: projectRoot,
      host: networkAccessStatus.bindHost,
    });
    // Fire-and-forget: populate OpenCode model cache
    discoverOpenCodeModels().catch(() => {});
  });

  function shutdown() {
    proxyManager.stopAll();
    server.close();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, proxyManager, networkAccess: networkAccessStatus };
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
 * @param {MCPProxyManager} proxyManager
 * @returns {Promise<Array<object>>}
 */
async function _collectAllTools(proxyManager) {
  let allTools = [...META_TOOLS];
  for (let serverName of proxyManager.servers.keys()) {
    if (!isPublicMcpToolServer(serverName)) continue;
    let cached = _toolCache.get(serverName);
    if (cached && Date.now() - cached.ts < TOOL_CACHE_TTL) {
      allTools.push(...cached.tools);
    }
  }
  // If cache is empty, trigger async refresh and AWAIT IT
  if (allTools.length === META_TOOLS.length) {
    await _refreshToolCache(proxyManager).catch(() => {});
    
    // Collect tools again after refresh
    for (let serverName of proxyManager.servers.keys()) {
      if (!isPublicMcpToolServer(serverName)) continue;
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
    if (!isPublicMcpToolServer(serverName)) {
      _toolCache.delete(serverName);
      continue;
    }
    try {
      let result = await proxyManager.requestFromChild(serverName, 'tools/list', {});
      if (result?.tools) {
        _toolCache.set(serverName, { tools: result.tools, ts: Date.now() });
      }
    } catch {}
  }
}

/**
 * Route a tool call to the correct child MCP server.
 * @param {MCPProxyManager} proxyManager
 * @param {string} toolName
 * @param {object} args
 * @returns {Promise<object>}
 */
async function _routeToolCall(proxyManager, toolName, args) {
  if (META_TOOLS.some(t => t.name === toolName)) {
    return _routePortalToolCall(proxyManager, toolName, args);
  }

  if (isInternalMcpToolName(toolName)) {
    return internalMcpToolBlockedResult(toolName);
  }

  // Find which server owns this tool
  for (let [serverName, cached] of _toolCache) {
    if (!isPublicMcpToolServer(serverName)) continue;
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
    if (!isPublicMcpToolServer(serverName)) continue;
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

async function _routePortalToolCall(proxyManager, toolName, args = {}) {
  if (toolName === 'discover_tools') {
    let tools = await _collectChildTools(proxyManager);
    let query = (args.query || '').toLowerCase();
    let serverFilter = (args.server || '').toLowerCase();
    let results = [];
    for (let { tool, server } of tools) {
      let text = `${tool.name} ${tool.description || ''}`.toLowerCase();
      if (query && !text.includes(query)) continue;
      if (serverFilter && !server.toLowerCase().includes(serverFilter)) continue;
      results.push({ name: tool.name, description: tool.description || '', server });
    }
    return { content: [{ type: 'text', text: JSON.stringify({ tools: results, total: tools.length }, null, 2) }] };
  }

  if (toolName === 'call_tool') {
    let realToolName = args.name;
    if (!realToolName) {
      return { content: [{ type: 'text', text: 'Missing "name" argument — specify which tool to call' }], isError: true };
    }
    return _routeToolCall(proxyManager, realToolName, args.arguments || {});
  }

  if (toolName === 'get_portal_status') {
    let tools = await _collectChildTools(proxyManager);
    let servers = [...proxyManager.servers.keys()].filter(isPublicMcpToolServer);
    let { publicHealth, internalHealth } = splitMcpHealthStatus(proxyManager.getHealthStatus());
    let sg = proxyManager.stateGraph;
    if (!sg) {
      let { getStateGraph } = await import('../state-graph.js');
      sg = getStateGraph();
    }
    let taskState = await readInternalTaskState(proxyManager);
    let developmentMap = buildDevelopmentMap({ sg, taskState });
    return jsonTextResult({
      servers: servers.map(name => ({ name })),
      health: publicHealth,
      internalHealth,
      totalTools: tools.length,
      mode: process.env.PORTAL_MODE || 'standalone',
      systemLoad: developmentMap.system,
      developmentMap: args?.detail === 'full' ? developmentMap : compactDevelopmentMap(developmentMap),
      staleProcesses: summarizeStaleProcesses(taskState.staleProcesses),
    });
  }

  if (toolName === 'create_chat') {
    let { getStateGraph } = await import('../state-graph.js');
    let sg = getStateGraph();
    let projectId = args.projectId || null;
    if (!projectId && args.parentChatId) {
      let parentMeta = sg.get(`chats/${args.parentChatId}`);
      if (parentMeta) projectId = parentMeta.projectId || null;
    }
    let resourceGroup = args.resource_group || null;
    let chat = sg.createChat({
      name: args.name,
      adapter: args.adapter || 'pool',
      agent: resolveChatCreationAgent(args),
      provider: resourceGroup && resourceGroup !== 'none' ? null : (args.provider || null),
      model: resourceGroup && resourceGroup !== 'none' ? null : (args.model || null),
      approval_mode: args.approval_mode || null,
      resource_group: resourceGroup,
      chatType: args.chatType || null,
      parentChatId: args.parentChatId || null,
      projectId,
      agentIcon: args.agentIcon || null,
      agentColor: args.agentColor || null,
    }, 'mcp');
    proxyManager.broadcastMonitor({ jsonrpc: '2.0', method: 'patch', params: { path: 'chats.created', value: chat } });
    let fullChat = sg.getChat(chat.id) || { id: chat.id };
    return jsonTextResult({
      ok: true,
      chatId: chat.id,
      chat: fullChat,
      developmentMap: buildDevelopmentMap({ sg, chatId: chat.id }),
    });
  }

  if (toolName === 'send_chat_message') {
    let { getStateGraph } = await import('../state-graph.js');
    let sg = getStateGraph();
    sg.appendChatMessage(args.chatId, {
      role: args.role || 'agent',
      text: args.text,
    });
    let chat = sg.getChat(args.chatId) || { id: args.chatId };
    proxyManager.broadcastMonitor({ jsonrpc: '2.0', method: 'patch', params: { path: 'chats.updated', value: args.chatId } });
    return jsonTextResult({
      ok: true,
      chatId: args.chatId,
      messageCount: Array.isArray(chat.messages) ? chat.messages.length : chat.messageCount || null,
      chat,
      developmentMap: buildDevelopmentMap({ sg, chatId: args.chatId }),
    });
  }

  if (toolName === 'resume_chat') {
    return resumeChatTool(proxyManager, args);
  }

  if (isPortalOrchestratorTool(toolName)) {
    return handlePortalOrchestratorTool(proxyManager, toolName, args, 'mcp-http');
  }

  if (isPortalGoalTool(toolName)) {
    return handlePortalGoalTool(proxyManager, toolName, args, 'mcp-http');
  }

  if (toolName === 'remember') {
    let { remember } = await import('../memory-store.js');
    return { content: [{ type: 'text', text: remember(args.key, args.value) }] };
  }

  if (toolName === 'recall') {
    let { recall } = await import('../memory-store.js');
    return { content: [{ type: 'text', text: JSON.stringify(recall(args.query), null, 2) }] };
  }

  return { content: [{ type: 'text', text: `Unknown portal tool: ${toolName}` }], isError: true };
}

async function _collectChildTools(proxyManager) {
  await _refreshToolCache(proxyManager);
  let tools = [];
  for (let [server, cached] of _toolCache) {
    if (!isPublicMcpToolServer(server)) continue;
    for (let tool of cached.tools) tools.push({ tool, server });
  }
  return tools;
}

/**
 * Aggregate resources from all child MCP servers.
 * @param {MCPProxyManager} proxyManager
 * @returns {Promise<{ resources: Array<object> }>}
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
