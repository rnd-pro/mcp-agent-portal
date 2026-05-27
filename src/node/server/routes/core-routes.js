import { readConfig } from '../../config-store.js';
import { getStateGraph } from '../../state-graph.js';
import { getFlywheelStats } from '../../mlops/flywheel.js';
import { listAdapterTypes, getAgentList } from '../../adapters/index.js';
import { REGISTRY, getRegistryByCategory } from '../marketplace-registry.js';
import { getLogPath } from '../../ops/runtime.js';
import { createXrDiagnosticLogStore } from '../xr-diagnostics-log.js';
import { json, parseBody } from './http.js';

/**
 * @param {{ proxyManager: any, projectRoot: string }} ctx
 * @returns {Record<string, (req: any, res: any) => void>}
 */
export function createCoreRoutes(ctx) {
  let { proxyManager, projectRoot, getNetworkAccessStatus, env = process.env } = ctx;
  let xrDiagnosticLogStore = createXrDiagnosticLogStore({
    logFile: getLogPath('xr-diagnostics', ['events.jsonl'], { projectRoot, env }),
  });

  return {
    'GET /api/instances': (_req, res) => {
      json(res, proxyManager.getInstances());
    },

    'GET /api/project-info': (_req, res) => {
      let networkAccess = typeof getNetworkAccessStatus === 'function' ? getNetworkAccessStatus() : null;
      json(res, {
        name: 'mcp-agent-portal',
        path: projectRoot,
        agents: proxyManager.servers.size,
        pid: process.pid,
        networkAccess,
      });
    },

    'GET /api/server-status': (_req, res) => {
      json(res, {
        uptime: Math.round(process.uptime()),
        agents: proxyManager.servers.size,
        monitors: proxyManager.monitors.size,
        shutdownAt: null,
      });
    },

    'GET /api/marketplace': (_req, res) => {
      let config = readConfig();
      json(res, {
        installed: config.mcpServers || {},
        available: REGISTRY,
        categories: getRegistryByCategory(),
      });
    },

    'GET /api/health': (_req, res) => {
      json(res, proxyManager.getHealthStatus());
    },

    'GET /api/adapter/status': (_req, res) => {
      json(res, proxyManager.adapterPool?.getStatus() || { adapters: {} });
    },

    'GET /api/flywheel/stats': (_req, res) => {
      json(res, getFlywheelStats());
    },

    'GET /api/adapter/types': (_req, res) => {
      json(res, listAdapterTypes());
    },

    'GET /api/agents': (_req, res) => {
      json(res, { agents: getAgentList() });
    },

    'GET /api/xr-diagnostics/logs': (_req, res) => {
      json(res, { logs: xrDiagnosticLogStore.list() });
    },

    'GET /api/xr-diagnostics/summary': (_req, res) => {
      json(res, xrDiagnosticLogStore.summary());
    },

    'POST /api/xr-diagnostics/log': async (req, res) => {
      try {
        let body = await parseBody(req, 256 * 1024);
        let entry = xrDiagnosticLogStore.push(req, body);
        json(res, { ok: true, entry });
      } catch (error) {
        json(res, { error: error.message }, 400);
      }
    },
  };
}
