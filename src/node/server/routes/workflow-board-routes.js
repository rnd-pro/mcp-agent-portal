import { getStateGraph } from '../../state-graph.js';
import { createWorkflowBoardService } from '../../workflow-board-service.js';
import { isLocalRequest } from '../network-auth.js';
import { derivePrincipal } from '../principal.js';
import { json, parseBody } from './http.js';

function routeError(res, error) {
  json(res, { ok: false, error: error.message }, 400);
}

function queryValue(req, name) {
  let url = new URL(req.url, 'http://localhost');
  return url.searchParams.get(name);
}

function queryBoolean(req, name, fallback = false) {
  let value = queryValue(req, name);
  if (value === null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

export function createWorkflowBoardRoutes(ctx = {}) {
  let resolveService = () => createWorkflowBoardService({
    stateGraph: ctx.stateGraph ?? ctx.proxyManager?.stateGraph ?? getStateGraph(),
    now: ctx.now,
    makeId: ctx.makeId,
    projectRoot: ctx.projectRoot ?? ctx.proxyManager?.projectRoot,
    proxyManager: ctx.proxyManager,
  });

  // Server-derived HTTP identity. A same-uid loopback request is the bootstrap human
  // (Option B); a verified LAN session (tracked by the network-auth controller) is a
  // remote human. Anything else is anonymous (defense-in-depth — such requests are
  // normally already blocked upstream by requireNetworkAuthorization). The request
  // body never supplies identity.
  let principalForRequest = (req) => {
    if (isLocalRequest(req)) return derivePrincipal({ channel: 'loopback' });
    if (ctx.networkAuth?.isAuthorized?.(req)) {
      return derivePrincipal({ channel: 'http-session', human: true, label: 'human' });
    }
    return derivePrincipal({ channel: 'unknown' });
  };

  let mutationContext = (req) => ({ proxyManager: ctx.proxyManager, principal: principalForRequest(req) });

  let requestTransition = async (req, res) => {
    try {
      let body = await parseBody(req);
      let result = await resolveService().requestWorkflowTransition(body, mutationContext(req));
      json(res, { ok: true, result });
    } catch (error) {
      routeError(res, error);
    }
  };

  return {
    // The per-root idea-realization rollup rides this existing projection response: the service stamps
    // metadata.realization onto each root card. No new query param or route.
    'GET /api/workflow-board': async (req, res) => {
      try {
        let service = resolveService();
        let projection = await service.getBoardProjectionWithRuntime({
          boardId: queryValue(req, 'boardId'),
          projectId: queryValue(req, 'projectId') ?? queryValue(req, 'project'),
          goalId: queryValue(req, 'goalId') ?? queryValue(req, 'goal'),
          chatId: queryValue(req, 'chatId') ?? queryValue(req, 'chat'),
          includeCards: queryBoolean(req, 'includeCards', true),
          includeEvents: queryBoolean(req, 'includeEvents', false),
          includeRuntime: queryBoolean(req, 'includeRuntime', false),
          compact: queryBoolean(req, 'compact', false),
          view: queryValue(req, 'view'),
          mode: queryValue(req, 'mode'),
          importMarkdown: queryBoolean(req, 'importMarkdown', false),
          reconcileRuntime: queryBoolean(req, 'reconcileRuntime', false),
        }, { proxyManager: ctx.proxyManager });
        json(res, { ok: true, projection });
      } catch (error) {
        routeError(res, error);
      }
    },

    'GET /api/workflow-board/boards': (req, res) => {
      try {
        let result = resolveService().listWorkflowBoards({
          projectId: queryValue(req, 'projectId') ?? queryValue(req, 'project'),
          scope: queryValue(req, 'scope'),
          includeArchived: queryBoolean(req, 'includeArchived', false),
          limit: queryValue(req, 'limit'),
        });
        json(res, { ok: true, ...result });
      } catch (error) {
        routeError(res, error);
      }
    },

    'POST /api/workflow-board/cards': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = await resolveService().createWorkItem(body, mutationContext(req));
        json(res, { ok: true, ...result });
      } catch (error) {
        routeError(res, error);
      }
    },

    'POST /api/workflow-board/cards/update': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = resolveService().updateWorkItem(body, mutationContext(req));
        json(res, { ok: true, ...result });
      } catch (error) {
        routeError(res, error);
      }
    },

    // Axis C human-agent collaboration surface. Server-derived-principal seam: a loopback or
    // verified-LAN request is the human, attribution is frozen from that principal, and the request body
    // never supplies identity. These are the human's only reachable entry into the comment stream and the
    // human→orchestrator reply path (the reply IS how a parked needs-decision card is answered); without
    // them the service methods are unreachable from outside an agent run.
    'POST /api/workflow-board/cards/comment': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = resolveService().addCardComment(body, mutationContext(req));
        json(res, { ok: result.ok !== false, ...result });
      } catch (error) {
        routeError(res, error);
      }
    },

    'GET /api/workflow-board/cards/comments': (req, res) => {
      try {
        let result = resolveService().listCardComments({
          boardId: queryValue(req, 'boardId'),
          cardId: queryValue(req, 'cardId') ?? queryValue(req, 'card_id'),
        });
        json(res, { ok: result.ok !== false, ...result });
      } catch (error) {
        routeError(res, error);
      }
    },

    'POST /api/workflow-board/cards/reply': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = resolveService().replyToCard(body, mutationContext(req));
        json(res, { ok: result.ok !== false, ...result });
      } catch (error) {
        routeError(res, error);
      }
    },

    // Iterative re-decomposition rides this existing route: each call bumps the parent's monotonic
    // decomposeWaveSeq and stamps it (with rootCardId) onto the wave's children — per-wave join state
    // rides the returned result, no new param or route. Per-root convergence is enforced service-side
    // at the candidate-admission gate, not here.
    'POST /api/workflow-board/decompose': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = resolveService().decomposeWorkItem(body, mutationContext(req));
        json(res, { ok: true, result });
      } catch (error) {
        routeError(res, error);
      }
    },

    'POST /api/workflow-board/transition': requestTransition,
    'POST /api/workflow-board/transitions': requestTransition,

    'POST /api/workflow-board/enqueue': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = await resolveService().enqueueWorkflowCard(body, mutationContext(req));
        json(res, { ok: true, result });
      } catch (error) {
        routeError(res, error);
      }
    },

    'POST /api/workflow-board/dependencies/link': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = resolveService().linkDependency(body, mutationContext(req));
        json(res, { ok: true, result });
      } catch (error) {
        routeError(res, error);
      }
    },

    'POST /api/workflow-board/dependencies/unlink': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = resolveService().unlinkDependency(body, mutationContext(req));
        json(res, { ok: true, result });
      } catch (error) {
        routeError(res, error);
      }
    },

    'POST /api/workflow-board/columns/define': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = resolveService().defineWorkflowColumn(body, mutationContext(req));
        json(res, { ok: true, result });
      } catch (error) {
        routeError(res, error);
      }
    },

    'POST /api/workflow-board/columns/delete': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = resolveService().deleteWorkflowColumn(body, mutationContext(req));
        json(res, { ok: true, result });
      } catch (error) {
        routeError(res, error);
      }
    },

    'POST /api/workflow-board/transitions/define': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = resolveService().defineWorkflowTransition(body, mutationContext(req));
        json(res, { ok: true, result });
      } catch (error) {
        routeError(res, error);
      }
    },

    'POST /api/workflow-board/gates/define': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = resolveService().defineWorkflowGate(body, mutationContext(req));
        json(res, { ok: true, result });
      } catch (error) {
        routeError(res, error);
      }
    },

    // An optional `subscription.wave` ordinal rides the existing body passthrough into
    // orchestrateWorkItem; the service's join reuse guard uses it to skip a retired prior-wave join and
    // mint a fresh one for the current wave. No new param at this layer.
    'POST /api/workflow-board/orchestrate': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = await resolveService().orchestrateWorkItem(body, mutationContext(req));
        json(res, { ok: true, result });
      } catch (error) {
        routeError(res, error);
      }
    },

    'POST /api/workflow-board/control': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = await resolveService().controlWorkItem(body, mutationContext(req));
        json(res, { ok: true, result });
      } catch (error) {
        routeError(res, error);
      }
    },

    'POST /api/workflow-board/delete': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = resolveService().deleteWorkItem(body, mutationContext(req));
        json(res, { ok: true, result });
      } catch (error) {
        routeError(res, error);
      }
    },

    'POST /api/workflow-board/columns/update': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = resolveService().updateWorkflowColumn(body, mutationContext(req));
        json(res, { ok: true, result });
      } catch (error) {
        routeError(res, error);
      }
    },

    // An optional `automation.rootConvergence` override rides the existing body passthrough into
    // updateWorkflowBoard, where normalizeWorkflowBoardAutomation merges it. Unlike the board budget it
    // has no opt-in gate — the per-root convergence defaults always apply, and on breach the service
    // routes the root to a terminal (needs-decision park, reject fallback) rather than looping. No new
    // param at this layer.
    'POST /api/workflow-board/automation': async (req, res) => {
      try {
        let body = await parseBody(req);
        let action = body.action ?? body.control;
        let service = resolveService();
        let result = action
          ? await service.controlWorkflowBoard(body, mutationContext(req))
          : service.updateWorkflowBoard(body, mutationContext(req));
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
          eventTypes: queryValue(req, 'eventType') ?? queryValue(req, 'eventTypes'),
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
        let result = await resolveService().reconcileWorkflowRecovery(body, mutationContext(req));
        json(res, { ok: true, ...result });
      } catch (error) {
        routeError(res, error);
      }
    },

    'POST /api/workflow-board/markdown/import': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = await resolveService().importWorkflowWorkItems(body, mutationContext(req));
        json(res, { ok: true, ...result });
      } catch (error) {
        routeError(res, error);
      }
    },

    'POST /api/workflow-board/markdown/export': async (req, res) => {
      try {
        let body = await parseBody(req);
        let result = await resolveService().exportWorkflowWorkItem(body, mutationContext(req));
        json(res, { ok: true, ...result });
      } catch (error) {
        routeError(res, error);
      }
    },
  };
}
