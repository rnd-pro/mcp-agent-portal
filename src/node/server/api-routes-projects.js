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

/**
 * Build project/chat/CLI route map.
 * @returns {Record<string, Function>}
 */
export function createProjectRoutes() {
  return {
    // ── Project History ───────────────────────────────────
    'GET /api/projects/history': (req, res) => {
      let sg = getStateGraph();
      json(res, {
        projects: sg.getProjectHistory(),
        activeIds: sg.getActiveProjectIds(),
      });
    },

    'POST /api/projects/open': async (req, res) => {
      try {
        let { name, path, color, cli } = await parseBody(req);
        if (!path) return json(res, { error: 'Missing path' }, 400);
        let sg = getStateGraph();
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
        let sg = getStateGraph();
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
        let sg = getStateGraph();
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
        let sg = getStateGraph();
        sg.updateProject(id, updates, 'http');
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    // ── CLI Config ────────────────────────────────────────
    'GET /api/cli/config': (req, res) => {
      let sg = getStateGraph();
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
        let sg = getStateGraph();
        if (globalCli) sg.setGlobalCli(globalCli, 'http');
        if (projectId && cli) sg.updateProject(projectId, { cli }, 'http');
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    // ── Chats ─────────────────────────────────────────────
    'GET /api/chats': (req, res) => {
      let sg = getStateGraph();
      json(res, { chats: sg.listChats() });
    },

    'POST /api/chats': async (req, res) => {
      try {
        console.log('[API] POST /api/chats called!', req.headers['referer'] || req.url);
        let opts = await parseBody(req);
        let sg = getStateGraph();
        let result = sg.createChat(opts, 'http');
        json(res, { ok: true, id: result.id });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/chats/get': async (req, res) => {
      try {
        let { id } = await parseBody(req);
        let sg = getStateGraph();
        let chat = sg.getChat(id);
        if (!chat) return json(res, { error: 'Chat not found' }, 404);
        json(res, chat);
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/chats/message': async (req, res) => {
      try {
        let { chatId, role, text } = await parseBody(req);
        if (!chatId || !role || !text) return json(res, { error: 'Missing chatId, role, or text' }, 400);
        let sg = getStateGraph();
        sg.appendChatMessage(chatId, { role, text });
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
        let sg = getStateGraph();
        sg.replaceChatMessages(chatId, cleaned);
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/chats/update': async (req, res) => {
      try {
        let { id, ...updates } = await parseBody(req);
        if (!id) return json(res, { error: 'Missing id' }, 400);
        let sg = getStateGraph();
        sg.updateChat(id, updates, 'http');
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/chats/delete': async (req, res) => {
      try {
        let { id } = await parseBody(req);
        if (!id) return json(res, { error: 'Missing id' }, 400);
        let sg = getStateGraph();
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
        let sg = getStateGraph();
        sg.updateChatSession(chatId, sessionId);
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },
  };
}
