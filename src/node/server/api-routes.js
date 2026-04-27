/**
 * API route map — declarative HTTP routing for agent-portal.
 * Each handler receives (req, res, ctx) where ctx provides proxyManager etc.
 *
 * Pattern from cloud-images-toolkit: cmdMap[cmd]?.(data) — one-liner dispatch.
 *
 * @module api-routes
 */
import { readConfig, writeConfig } from '../config-store.js';
import { lintFile } from './lint-service.js';
import { listAdapterTypes } from '../adapters/index.js';
import { REGISTRY, getRegistryByCategory, findInRegistry } from './marketplace-registry.js';

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

  /** @type {Record<string, (req: any, res: any) => void | Promise<void>>} */
  let routes = {
    'GET /api/instances': (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(proxyManager.getInstances()));
    },

    'GET /api/project-info': (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        name: 'agent-portal',
        path: projectRoot,
        agents: proxyManager.servers.size,
        pid: process.pid,
      }));
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

    'GET /api/adapter/status': (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(proxyManager.adapterPool?.getStatus() || { adapters: {} }));
    },

    'GET /api/adapter/types': (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ types: listAdapterTypes() }));
    },

    'POST /api/stop': (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      setTimeout(() => process.exit(0), 200);
    },

    'POST /api/restart': (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, message: 'Restarting...' }));
      setTimeout(() => process.exit(2), 500);
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
