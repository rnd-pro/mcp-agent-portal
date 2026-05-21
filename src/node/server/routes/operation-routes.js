import { spawn } from 'node:child_process';
import { openSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintFile } from '../lint-service.js';
import { findInRegistry } from '../marketplace-registry.js';
import { json, parseBody } from './http.js';

let __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {{ proxyManager: any, projectRoot: string }} ctx
 * @returns {Record<string, (req: any, res: any) => void | Promise<void>>}
 */
export function createOperationRoutes(ctx) {
  let { proxyManager, projectRoot } = ctx;

  return {
    'POST /api/stop': (_req, res) => {
      json(res, { ok: true });
      setTimeout(() => process.exit(0), 200);
    },

    'POST /api/restart': (_req, res) => {
      json(res, { ok: true, message: 'Restarting...' });
      setTimeout(async () => {
        let { removePortFile } = await import('../backend-lifecycle.js');
        let backendScript = path.join(__dirname, '..', 'backend.js');
        proxyManager.stopAll();
        removePortFile(projectRoot);
        let gwDir = path.join(homedir(), '.local-gateway');
        try { unlinkSync(path.join(gwDir, 'gateway.pid')); } catch {}
        let logFile = path.join(gwDir, 'restart.log');
        let logFd = openSync(logFile, 'a');
        let restartCommand = [
          'sleep 2 && exec',
          JSON.stringify(process.execPath),
          JSON.stringify(backendScript),
          JSON.stringify(path.resolve(projectRoot)),
        ].join(' ');
        spawn('/bin/sh', ['-c', restartCommand], {
          detached: true,
          stdio: ['ignore', logFd, logFd],
          env: { ...process.env, PORTAL_BACKEND: '1' },
        }).unref();
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
        json(res, result);
      } catch (err) {
        json(res, { error: err.message }, 500);
      }
    },

    'POST /api/marketplace/install': async (req, res) => {
      try {
        let { name } = await parseBody(req);
        if (!name) throw new Error('Missing server name');
        let entry = findInRegistry(name);
        if (!entry) throw new Error(`"${name}" not found in registry`);
        proxyManager.addServer(name, { command: entry.command, args: entry.args });
        json(res, { ok: true, name, hot: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/marketplace/install-custom': async (req, res) => {
      try {
        let { name, command, args, env } = await parseBody(req);
        if (!name || !command) throw new Error('Missing name or command');
        let def = { command, args: args || [], ...(env ? { env } : {}) };
        proxyManager.addServer(name, def);
        json(res, { ok: true, name, hot: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/marketplace/remove': async (req, res) => {
      try {
        let { name } = await parseBody(req);
        if (!name) throw new Error('Missing server name');
        proxyManager.removeServer(name);
        json(res, { ok: true, name, hot: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/lint-file': async (req, res) => {
      try {
        let { filePath } = await parseBody(req);
        if (!filePath) {
          json(res, { error: 'Missing filePath' }, 400);
          return;
        }
        let results = await lintFile(filePath);
        json(res, results);
      } catch (err) {
        json(res, { error: err.message }, 500);
      }
    },

    'POST /api/adapter/run': async (req, res) => {
      try {
        let { type, prompt, cwd, model, timeout } = await parseBody(req, 10 * 1024 * 1024);
        if (!type || !prompt) {
          json(res, { error: 'Missing type or prompt' }, 400);
          return;
        }
        let adapter = proxyManager.adapterPool?.acquire(type);
        if (!adapter) {
          json(res, { error: `Adapter ${type} not available or at capacity.` }, 503);
          return;
        }
        try {
          let result = await adapter.run({ prompt, cwd, model, timeout });
          json(res, result);
        } finally {
          proxyManager.adapterPool.release(adapter);
        }
      } catch (err) {
        json(res, { error: err.message }, 500);
      }
    },
  };
}
