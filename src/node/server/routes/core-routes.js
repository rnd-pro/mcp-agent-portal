import { readConfig } from '../../config-store.js';
import { getStateGraph } from '../../state-graph.js';
import { getFlywheelStats } from '../../mlops/flywheel.js';
import { listAdapterTypes, getAgentList } from '../../adapters/index.js';
import { REGISTRY, getRegistryByCategory } from '../marketplace-registry.js';
import { json, parseBody } from './http.js';

const XR_DIAGNOSTIC_LOG_LIMIT = 80;
let xrDiagnosticLogs = [];

function readClientAddress(req) {
  return req.socket?.remoteAddress || '';
}

function normalizeXrDiagnosticLog(req, body = {}) {
  let entry = {
    id: `${Date.now().toString(36)}-${xrDiagnosticLogs.length.toString(36)}`,
    receivedAt: new Date().toISOString(),
    address: readClientAddress(req),
    host: String(req.headers.host || '').slice(0, 160),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 240),
    event: String(body.event || 'diagnostic').slice(0, 80),
    pageUrl: String(body.pageUrl || '').slice(0, 300),
    secureContext: body.secureContext === true,
    navigatorXr: body.navigatorXr === true,
    modes: body.modes && typeof body.modes === 'object'
      ? {
        inline: Boolean(body.modes.inline),
        immersiveVr: Boolean(body.modes.immersiveVr),
        immersiveAr: Boolean(body.modes.immersiveAr),
      }
      : null,
    launch: body.launch && typeof body.launch === 'object'
      ? {
        canLaunch: Boolean(body.launch.canLaunch),
        mode: body.launch.mode || null,
        reason: body.launch.reason || null,
      }
      : null,
    session: body.session || null,
    error: body.error ? String(body.error).slice(0, 300) : null,
  };
  return entry;
}

function pushXrDiagnosticLog(entry) {
  xrDiagnosticLogs.push(entry);
  if (xrDiagnosticLogs.length > XR_DIAGNOSTIC_LOG_LIMIT) {
    xrDiagnosticLogs = xrDiagnosticLogs.slice(-XR_DIAGNOSTIC_LOG_LIMIT);
  }
  console.info('[xr-diagnostics]', JSON.stringify({
    event: entry.event,
    address: entry.address,
    secureContext: entry.secureContext,
    navigatorXr: entry.navigatorXr,
    modes: entry.modes,
    launch: entry.launch,
    session: entry.session,
    error: entry.error,
  }));
  return entry;
}

/**
 * @param {{ proxyManager: any, projectRoot: string }} ctx
 * @returns {Record<string, (req: any, res: any) => void>}
 */
export function createCoreRoutes(ctx) {
  let { proxyManager, projectRoot, getNetworkAccessStatus } = ctx;

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
      json(res, { logs: xrDiagnosticLogs });
    },

    'POST /api/xr-diagnostics/log': async (req, res) => {
      try {
        let body = await parseBody(req, 64 * 1024);
        let entry = pushXrDiagnosticLog(normalizeXrDiagnosticLog(req, body));
        json(res, { ok: true, entry });
      } catch (error) {
        json(res, { error: error.message }, 400);
      }
    },
  };
}
