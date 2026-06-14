/**
 * API routes for project history, chat management, and CLI configuration.
 * All data operations go through StateGraph (single source of truth).
 * @module api-routes-projects
 */
import { getStateGraph } from '../state-graph.js';

/**
 * Parse JSON body from request.
 * @param {import('node:http').IncomingMessage} req
 * @param {number} [maxBytes]
 * @returns {Promise<any>}
 */
function parseBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => {
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

/** JSON response helper */
function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseOptionalInteger(value, name, { min = 0 } = {}) {
  if (value === undefined || value === null) return { value: undefined };
  let num = Number(value);
  if (!Number.isInteger(num) || num < min) {
    return { error: `${name} must be an integer >= ${min}` };
  }
  return { value: num };
}

/**
 * Build project/chat/CLI route map.
 * @param {{ proxyManager?: { broadcastMonitor?: Function }, stateGraph?: any }} [deps]
 * @returns {Record<string, Function>}
 */
export function createProjectRoutes(deps = {}) {
  let { proxyManager = null, stateGraph = null } = deps;
  let getGraph = () => stateGraph || getStateGraph();
  let broadcastChatUpdate = (chatId) => {
    proxyManager?.broadcastMonitor?.({
      jsonrpc: '2.0',
      method: 'patch',
      params: { path: 'chats.updated', value: chatId },
    });
  };
  let broadcastChatCreated = (chat) => {
    proxyManager?.broadcastMonitor?.({
      jsonrpc: '2.0',
      method: 'patch',
      params: { path: 'chats.created', value: chat },
    });
  };
  let broadcastGoalUpdate = (goal) => {
    proxyManager?.broadcastMonitor?.({
      jsonrpc: '2.0',
      method: 'patch',
      params: { path: 'goals.updated', value: goal },
    });
    if (goal?.chatId) broadcastChatUpdate(goal.chatId);
  };

  return {
    // ── Project History ───────────────────────────────────
    'GET /api/projects/history': (req, res) => {
      let sg = getGraph();
      json(res, {
        projects: sg.getProjectHistory(),
        activeIds: sg.getActiveProjectIds(),
      });
    },

    'POST /api/projects/open': async (req, res) => {
      try {
        let { name, path, color, cli } = await parseBody(req);
        if (!path) return json(res, { error: 'Missing path' }, 400);
        let sg = getGraph();
        let result = sg.addProject({ name, path, color, cli }, 'http');

        // Also mark as open tab
        sg.setProjectOpen(result.id, true, 'http');
        json(res, { ok: true, id: result.id });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/projects/close': async (req, res) => {
      try {
        let { id } = await parseBody(req);
        if (!id) return json(res, { error: 'Missing id' }, 400);
        let sg = getGraph();
        sg.setProjectOpen(id, false, 'http');
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/projects/remove': async (req, res) => {
      try {
        let { id } = await parseBody(req);
        if (!id) return json(res, { error: 'Missing id' }, 400);
        let sg = getGraph();
        sg.removeProject(id, 'http');
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/projects/update': async (req, res) => {
      try {
        let { id, ...updates } = await parseBody(req);
        if (!id) return json(res, { error: 'Missing id' }, 400);
        let sg = getGraph();
        sg.updateProject(id, updates, 'http');
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    // ── CLI Config ────────────────────────────────────────
    'GET /api/cli/config': (req, res) => {
      let sg = getGraph();
      let projects = sg.getProjectHistory();
      let projectCli = {};
      for (let p of projects) {
        if (p.cli) projectCli[p.id] = p.cli;
      }
      json(res, {
        global: sg.getGlobalCli(),
        projects: projectCli,
      });
    },

    'POST /api/cli/config': async (req, res) => {
      try {
        let { global: globalCli, projectId, cli } = await parseBody(req);
        let sg = getGraph();
        if (globalCli) sg.setGlobalCli(globalCli, 'http');
        if (projectId && cli) sg.updateProject(projectId, { cli }, 'http');
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    // ── Chats ─────────────────────────────────────────────
    'GET /api/chats': (req, res) => {
      let sg = getGraph();
      json(res, { chats: sg.listChats() });
    },

    'GET /api/goals': (req, res) => {
      let url = new URL(req.url, 'http://localhost');
      let sg = getGraph();
      json(res, {
        goals: sg.listChatGoals({
          chatId: url.searchParams.get('chatId') || null,
          projectId: url.searchParams.get('projectId') || null,
          status: url.searchParams.get('status') || null,
        }),
      });
    },

    'POST /api/goals': async (req, res) => {
      try {
        let body = await parseBody(req);
        if (!body.title) return json(res, { error: 'Missing title' }, 400);
        let sg = getGraph();
        let goal = sg.createChatGoal(body, 'http');
        broadcastGoalUpdate(goal);
        json(res, { ok: true, goal });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/goals/get': async (req, res) => {
      try {
        let { goalId, id } = await parseBody(req);
        let sg = getGraph();
        let goal = sg.getChatGoal(goalId || id);
        if (!goal) return json(res, { error: 'Goal not found' }, 404);
        json(res, { ok: true, goal });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/goals/select': async (req, res) => {
      try {
        let { chatId, goalId } = await parseBody(req);
        if (!chatId) return json(res, { error: 'Missing chatId' }, 400);
        let sg = getGraph();
        let goal = sg.selectChatGoal(chatId, goalId || null, 'http');
        if (goal) broadcastGoalUpdate(goal);
        else broadcastChatUpdate(chatId);
        json(res, { ok: true, goal });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/goals/block': async (req, res) => {
      try {
        let { goalId, id, reason } = await parseBody(req);
        if (!(goalId || id) || !reason) return json(res, { error: 'Missing goalId or reason' }, 400);
        let sg = getGraph();
        let goal = sg.updateChatGoal(goalId || id, { status: 'blocked', reason }, 'http');
        if (!goal) return json(res, { error: 'Goal not found' }, 404);
        broadcastGoalUpdate(goal);
        json(res, { ok: true, goal });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/goals/pause': async (req, res) => {
      try {
        let { goalId, id, reason } = await parseBody(req);
        if (!(goalId || id)) return json(res, { error: 'Missing goalId' }, 400);
        let sg = getGraph();
        let goal = sg.updateChatGoal(goalId || id, { status: 'paused', reason: reason || 'Paused by user' }, 'http');
        if (!goal) return json(res, { error: 'Goal not found' }, 404);
        broadcastGoalUpdate(goal);
        json(res, { ok: true, goal });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/goals/resume': async (req, res) => {
      try {
        let { goalId, id } = await parseBody(req);
        if (!(goalId || id)) return json(res, { error: 'Missing goalId' }, 400);
        let sg = getGraph();
        let goal = sg.updateChatGoal(goalId || id, { status: 'active' }, 'http');
        if (!goal) return json(res, { error: 'Goal not found' }, 404);
        broadcastGoalUpdate(goal);
        json(res, { ok: true, goal });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/goals/stop': async (req, res) => {
      try {
        let { goalId, id, reason } = await parseBody(req);
        if (!(goalId || id)) return json(res, { error: 'Missing goalId' }, 400);
        let sg = getGraph();
        let goal = sg.updateChatGoal(goalId || id, { status: 'completed', reason: reason || 'Stopped by user' }, 'http');
        if (!goal) return json(res, { error: 'Goal not found' }, 404);
        broadcastGoalUpdate(goal);
        json(res, { ok: true, goal });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/goals/complete': async (req, res) => {
      try {
        let { goalId, id, reason } = await parseBody(req);
        if (!(goalId || id)) return json(res, { error: 'Missing goalId' }, 400);
        let sg = getGraph();
        let goal = sg.updateChatGoal(goalId || id, { status: 'completed', reason }, 'http');
        if (!goal) return json(res, { error: 'Goal not found' }, 404);
        broadcastGoalUpdate(goal);
        json(res, { ok: true, goal });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/goals/delete': async (req, res) => {
      try {
        let { goalId, id } = await parseBody(req);
        if (!(goalId || id)) return json(res, { error: 'Missing goalId' }, 400);
        let sg = getGraph();
        let goal = sg.deleteChatGoal(goalId || id, 'http');
        if (!goal) return json(res, { error: 'Goal not found' }, 404);
        broadcastGoalUpdate(goal);
        json(res, { ok: true, goal });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/goals/queue': async (req, res) => {
      try {
        let { goalId, id, text, delivery, status } = await parseBody(req);
        if (!(goalId || id) || !text) return json(res, { error: 'Missing goalId or text' }, 400);
        let sg = getGraph();
        let result = sg.enqueueChatGoalMessage(goalId || id, {
          text,
          delivery: delivery || 'after',
          status: status || 'queued',
          createdBy: 'http',
        }, 'http');
        if (!result) return json(res, { error: 'Goal not found or message empty' }, 404);
        broadcastGoalUpdate(result.goal);
        json(res, { ok: true, goal: result.goal, message: result.item });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/goals/queue/list': async (req, res) => {
      try {
        let { goalId, id, delivery, status } = await parseBody(req);
        if (!(goalId || id)) return json(res, { error: 'Missing goalId' }, 400);
        let sg = getGraph();
        let messages = sg.listChatGoalQueue(goalId || id, {
          delivery: delivery || null,
          status: status || 'queued',
        });
        if (!messages) return json(res, { error: 'Goal not found' }, 404);
        json(res, { ok: true, messages });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/goals/queue/apply': async (req, res) => {
      try {
        let { goalId, id, messageId, message_id } = await parseBody(req);
        if (!(goalId || id) || !(messageId || message_id)) {
          return json(res, { error: 'Missing goalId or messageId' }, 400);
        }
        let sg = getGraph();
        let result = sg.updateChatGoalQueueMessage(
          goalId || id,
          messageId || message_id,
          { status: 'applied' },
          'http',
        );
        if (!result) return json(res, { error: 'Queued goal message not found' }, 404);
        broadcastGoalUpdate(result.goal);
        json(res, { ok: true, goal: result.goal, message: result.item });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/goals/queue/clear': async (req, res) => {
      try {
        let { goalId, id, status } = await parseBody(req);
        if (!(goalId || id)) return json(res, { error: 'Missing goalId' }, 400);
        let sg = getGraph();
        let result = sg.clearChatGoalQueue(goalId || id, { status: status || 'queued' }, 'http');
        if (!result) return json(res, { error: 'Goal not found' }, 404);
        broadcastGoalUpdate(result.goal);
        json(res, { ok: true, goal: result.goal, cleared: result.cleared });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/chats': async (req, res) => {
      try {
        let opts = await parseBody(req);
        let sg = getGraph();
        let result = sg.createChat(opts, 'http');
        let chat = sg.getChat(result.id);
        if (chat) broadcastChatCreated(chat);
        json(res, { ok: true, id: result.id });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/chats/get': async (req, res) => {
      try {
        let { id, includeMessages = true } = await parseBody(req);
        let sg = getGraph();
        let chat = sg.getChat(id);
        if (!chat) return json(res, { error: 'Chat not found' }, 404);
        if (chat.activeGoalId) chat.activeGoal = sg.getChatGoal(chat.activeGoalId);
        if (includeMessages === false) {
          let { messages = [], ...meta } = chat;
          return json(res, { ...meta, messageCount: messages.length });
        }
        json(res, chat);
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/chats/messages/page': async (req, res) => {
      try {
        let { chatId, id, offset, before, limit } = await parseBody(req);
        let targetChatId = chatId || id;
        if (!targetChatId) return json(res, { error: 'Missing chatId' }, 400);
        let parsedOffset = parseOptionalInteger(offset, 'offset');
        if (parsedOffset.error) return json(res, { error: parsedOffset.error }, 400);
        let parsedBefore = parseOptionalInteger(before, 'before');
        if (parsedBefore.error) return json(res, { error: parsedBefore.error }, 400);
        let parsedLimit = parseOptionalInteger(limit, 'limit', { min: 1 });
        if (parsedLimit.error) return json(res, { error: parsedLimit.error }, 400);
        let sg = getGraph();
        let page = sg.getChatMessagePage(targetChatId, {
          offset: parsedOffset.value,
          before: parsedBefore.value,
          limit: parsedLimit.value,
        });
        if (!page) return json(res, { error: 'Chat not found' }, 404);
        json(res, { ok: true, ...page });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/chats/message': async (req, res) => {
      try {
        let { chatId, role, text } = await parseBody(req);
        if (!chatId || !role || !text) return json(res, { error: 'Missing chatId, role, or text' }, 400);
        let sg = getGraph();
        sg.appendChatMessage(chatId, { role, text });
        broadcastChatUpdate(chatId);
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'PUT /api/chats/messages': async (req, res) => {
      try {
        let { chatId, messages } = await parseBody(req);
        if (!chatId || !Array.isArray(messages)) return json(res, { error: 'Missing chatId or messages array' }, 400);
        // Strip transient system status messages before persisting
        let cleaned = messages.filter(m => {
          if (m.role !== 'system') return true;
          let t = m.text || '';
          return !t.startsWith('⏳') && !t.startsWith('✅') && !t.startsWith('⚠️') && t !== 'Processing...';
        });
        let sg = getGraph();
        sg.replaceChatMessages(chatId, cleaned);
        broadcastChatUpdate(chatId);
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/chats/update': async (req, res) => {
      try {
        let { id, ...updates } = await parseBody(req);
        if (!id) return json(res, { error: 'Missing id' }, 400);
        let sg = getGraph();
        sg.updateChat(id, updates, 'http');
        broadcastChatUpdate(id);
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/chats/delete': async (req, res) => {
      try {
        let { id } = await parseBody(req);
        if (!id) return json(res, { error: 'Missing id' }, 400);
        let sg = getGraph();
        sg.deleteChat(id, 'http');
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/chats/session': async (req, res) => {
      try {
        let { chatId, sessionId } = await parseBody(req);
        if (!chatId || !sessionId) return json(res, { error: 'Missing chatId or sessionId' }, 400);
        let sg = getGraph();
        sg.updateChatSession(chatId, sessionId);
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },
  };
}
