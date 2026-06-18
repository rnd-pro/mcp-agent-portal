import { getStateGraph } from '../../state-graph.js';
import { createWorkflowBoardService } from '../../workflow-board-service.js';
import { json, parseBody } from './http.js';

function routeError(res, error) {
  json(res, { ok: false, error: error.message }, 400);
}

function queryValue(req, name) {
  let url = new URL(req.url, 'http://localhost');
  return url.searchParams.get(name);
}

export function createWorkflowBoardRoutes(ctx = {}) {
  let resolveService = () => createWorkflowBoardService({
    stateGraph: ctx.stateGraph ?? ctx.proxyManager?.stateGraph ?? getStateGraph(),
    now: ctx.now,
    makeId: ctx.makeId,
    projectRoot: ctx.projectRoot ?? ctx.proxyManager?.projectRoot,
    proxyManager: ctx.proxyManager,
  });

  let requestTransition = async (req, res) => {
    try {
      let body = await parseBody(req);
      let result = resolveService().requestTransition(body);
      json(res, { ok: true, result });
    } catch (error) {
      routeError(res, error);
    }
  };

  return {
    'GET /api/workflow-board': (req, res) => {
      try {
        let service = resolveService();
        let projection = service.getBoardProjection({
          boardId: queryValue(req, 'boardId'),
          projectId: queryValue(req, 'projectId') ?? queryValue(req, 'project'),
        });
        json(res, { ok: true, projection });
      } catch (error) {
        routeError(res, error);
      }
    },

    'POST /api/workflow-board/cards': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = resolveService().createOrUpdateCard(body);
        json(res, { ok: true, ...result });
      } catch (error) {
        routeError(res, error);
      }
    },

    'POST /api/workflow-board/transition': requestTransition,
    'POST /api/workflow-board/transitions': requestTransition,

    'POST /api/workflow-board/orchestrate': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = await resolveService().orchestrateWorkItem(body, { proxyManager: ctx.proxyManager });
        json(res, { ok: true, result });
      } catch (error) {
        routeError(res, error);
      }
    },

    'POST /api/workflow-board/control': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = await resolveService().controlWorkItem(body, { proxyManager: ctx.proxyManager });
        json(res, { ok: true, result });
      } catch (error) {
        routeError(res, error);
      }
    },

    'GET /api/workflow-board/events': (req, res) => {
      try {
        let events = resolveService().listEvents({
          boardId: queryValue(req, 'boardId'),
          cardId: queryValue(req, 'cardId'),
          limit: queryValue(req, 'limit'),
        });
        json(res, { ok: true, events });
      } catch (error) {
        routeError(res, error);
      }
    },

    'GET /api/workflow-board/recovery': (req, res) => {
      try {
        let recovery = resolveService().getRecoveryState({
          boardId: queryValue(req, 'boardId'),
          projectId: queryValue(req, 'projectId') ?? queryValue(req, 'project'),
        });
        json(res, { ok: true, recovery });
      } catch (error) {
        routeError(res, error);
      }
    },

    'POST /api/workflow-board/recovery/reconcile': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = await resolveService().reconcileWorkflowRecovery(body, { proxyManager: ctx.proxyManager });
        json(res, { ok: true, ...result });
      } catch (error) {
        routeError(res, error);
      }
    },

    'POST /api/workflow-board/markdown/import': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = await resolveService().importWorkflowWorkItems(body);
        json(res, { ok: true, ...result });
      } catch (error) {
        routeError(res, error);
      }
    },

    'POST /api/workflow-board/markdown/export': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = await resolveService().exportWorkflowWorkItem(body);
        json(res, { ok: true, ...result });
      } catch (error) {
        routeError(res, error);
      }
    },
  };
}
