/**
 * API route map — declarative HTTP routing for mcp-agent-portal.
 * Each handler receives (req, res) and closes over Portal server context.
 *
 * @module api-routes
 */
import { createAgentPortalRoutes } from './routes/agent-portal-routes.js';
import { createCoreRoutes } from './routes/core-routes.js';
import { createOperationRoutes } from './routes/operation-routes.js';
import { createProjectGraphRoutes } from './routes/project-graph-routes.js';
import { createSettingsRoutes } from './routes/settings-routes.js';
import { createAudioTranscribeRoutes } from './routes/audio-transcribe-routes.js';
import { createStateRoutes } from './routes/state-routes.js';
import { createWorkflowBoardRoutes } from './routes/workflow-board-routes.js';

/**
 * Build the Portal root route map. Accepts context once at init time.
 * @param {{ proxyManager: any, projectRoot: string }} ctx
 * @returns {Record<string, (req: any, res: any) => void | Promise<void>>}
 */
export function createRoutes(ctx) {
  return {
    ...createCoreRoutes(ctx),
    ...createProjectGraphRoutes(ctx),
    ...createSettingsRoutes(ctx),
    ...createAgentPortalRoutes(ctx),
    ...createOperationRoutes(ctx),
    ...createStateRoutes(ctx),
    ...createWorkflowBoardRoutes(ctx),
    ...createAudioTranscribeRoutes(),
  };
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
