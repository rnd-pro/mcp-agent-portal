// @ctx web-server.ctx
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerService } from './local-gateway.js';
import { MCPProxyManager } from '../proxy/mcp-proxy.js';
import { lintFile } from './lint-service.js';
import { listAdapterTypes } from '../adapters/index.js';

let __dirname = path.dirname(fileURLToPath(import.meta.url));
let ROOT_DIR = path.join(__dirname, '..', '..', '..');
let WEB_DIR = path.join(ROOT_DIR, 'web');
let PACKAGES_DIR = path.join(ROOT_DIR, 'packages');

/** @type {Record<string, string>} */
const MIME_TYPES = {
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
 * Start the web server with HTTP API + static file serving.
 * @param {string} projectRoot
 * @returns {{ server: http.Server, proxyManager: MCPProxyManager }}
 */
export function startWebServer(projectRoot) {
  let proxyManager = new MCPProxyManager();

  let server = http.createServer((req, res) => {
    let url = new URL(req.url, 'http://localhost');

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/api/mcp-call') {
      let body = '';
      req.on('data', (c) => (body += c.toString()));
      req.on('end', async () => {
        try {
          let payload = JSON.parse(body);
          let { serverName, method, params } = payload;
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
      });
      return;
    }

    // Portal provides its own list of instances
    if (url.pathname === '/api/instances') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(proxyManager.getInstances()));
      return;
    }

    if (url.pathname === '/api/project-info') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        name: 'agent-portal',
        path: projectRoot,
        agents: proxyManager.servers.size,
        pid: process.pid,
      }));
      return;
    }

    if (url.pathname === '/api/server-status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        uptime: Math.round(process.uptime()),
        agents: proxyManager.servers.size,
        monitors: proxyManager.monitors.size,
        shutdownAt: null,
      }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/stop') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      setTimeout(() => process.exit(0), 200);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/restart') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, message: 'Restarting...' }));
      setTimeout(() => process.exit(2), 500);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/lint-file') {
      let body = '';
      req.on('data', (c) => (body += c.toString()));
      req.on('end', async () => {
        try {
          let { filePath } = JSON.parse(body);
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
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/adapter/run') {
      let body = '';
      req.on('data', (c) => {
        body += c.toString();
        if (body.length > 10 * 1024 * 1024) {
          req.destroy(new Error('Payload Too Large'));
        }
      });
      req.on('end', async () => {
        try {
          const { type, prompt, cwd, model, timeout } = JSON.parse(body);
          if (!type || !prompt) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing type or prompt' }));
            return;
          }
          
          const adapter = proxyManager.adapterPool?.acquire(type);
          if (!adapter) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Adapter ${type} not available or at capacity.` }));
            return;
          }
          
          try {
            const result = await adapter.run({ prompt, cwd, model, timeout });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } finally {
            proxyManager.adapterPool.release(adapter);
          }
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/adapter/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(proxyManager.adapterPool?.getStatus() || { adapters: {} }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/adapter/types') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ types: listAdapterTypes() }));
      return;
    }

    if (url.pathname.startsWith('/api/')) {
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
                try { process.kill(b.pid, 0); backendPort = b.port; break; } catch {}
              }
            }
          }
        } catch {}
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
      return;
    }

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
    let gateway = registerService('portal', port);

    setTimeout(() => {
      console.error(`\n  ⬡ agent-portal`);
      console.error('  ─────────────────────────────');
      console.error(`  → ${gateway.url}`);
      console.error(`  → ${gateway.directUrl}  (direct)\n`);
    }, 200);
  });

  return { server, proxyManager };
}

export default startWebServer;