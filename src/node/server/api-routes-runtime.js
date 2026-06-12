import { listRuntimeStatuses } from '../ops/runtime.js';
import { createDevPlaneStatus } from '../dev-plane/status.js';

/** JSON response helper */
function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * @param {Map<unknown, unknown>|Set<unknown>|undefined} collection
 * @returns {number}
 */
function collectionSize(collection) {
  return collection?.size || 0;
}

/**
 * @param {any} proxyManager
 * @returns {Array<any>}
 */
function getInstances(proxyManager) {
  if (typeof proxyManager?.getInstances !== 'function') return [];
  try {
    let instances = proxyManager.getInstances();
    return Array.isArray(instances) ? instances : [];
  } catch {
    return [];
  }
}

/**
 * @param {any} proxyManager
 * @returns {Record<string, any>}
 */
function getHealthStatus(proxyManager) {
  if (typeof proxyManager?.getHealthStatus !== 'function') return {};
  try {
    let status = proxyManager.getHealthStatus();
    return status && typeof status === 'object' ? status : {};
  } catch {
    return {};
  }
}

/**
 * Build non-destructive runtime API routes.
 * @param {{ proxyManager: any, projectRoot: string, env?: NodeJS.ProcessEnv, config?: object }} ctx
 * @returns {Record<string, (req: any, res: any) => void>}
 */
export function createRuntimeRoutes(ctx) {
  let { proxyManager, projectRoot, env = process.env, config = {} } = ctx;

  return {
    'GET /api/runtime': (_req, res) => {
      let runtimeStatuses = listRuntimeStatuses({ projectRoot });
      let instances = getInstances(proxyManager);
      let health = getHealthStatus(proxyManager);
      let devPlane = createDevPlaneStatus({ projectRoot, env, config });

      json(res, {
        ok: true,
        server: {
          pid: process.pid,
          uptime: process.uptime(),
          agents: collectionSize(proxyManager?.servers),
          monitors: collectionSize(proxyManager?.monitors),
        },
        health,
        devPlane,
        runtimeStatuses,
        instances,
      });
    },

    'GET /api/runtime/health': (_req, res) => {
      let runtimeStatuses = listRuntimeStatuses({ projectRoot });

      json(res, {
        ok: true,
        uptime: process.uptime(),
        agents: collectionSize(proxyManager?.servers),
        monitors: collectionSize(proxyManager?.monitors),
        runtimeStatusCount: runtimeStatuses.length,
      });
    },
  };
}
