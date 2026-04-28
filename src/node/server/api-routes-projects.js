/**
 * API routes for project history, chat management, and CLI configuration.
 * @module api-routes-projects
 */
import {
  getProjectHistory, addProject, removeProject, updateProject,
  getActiveProjectIds, setActiveProjectIds,
  getGlobalCli, setGlobalCli,
  listChats, getChat, createChat, appendChatMessage, deleteChat,
} from '../config-store.js';

/**
 * Parse JSON body from request.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<any>}
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c.toString(); });
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
      json(res, {
        projects: getProjectHistory(),
        activeIds: getActiveProjectIds(),
      });
    },

    'POST /api/projects/open': async (req, res) => {
      try {
        let { name, path, color, cli } = await parseBody(req);
        if (!path) return json(res, { error: 'Missing path' }, 400);
        let result = addProject({ name, path, color, cli });

        // Also add to active tabs
        let active = getActiveProjectIds();
        if (!active.includes(result.id)) {
          active.push(result.id);
          setActiveProjectIds(active);
        }
        json(res, { ok: true, id: result.id });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/projects/close': async (req, res) => {
      try {
        let { id } = await parseBody(req);
        if (!id) return json(res, { error: 'Missing id' }, 400);
        let active = getActiveProjectIds().filter(i => i !== id);
        setActiveProjectIds(active);
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/projects/remove': async (req, res) => {
      try {
        let { id } = await parseBody(req);
        if (!id) return json(res, { error: 'Missing id' }, 400);
        removeProject(id);
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/projects/update': async (req, res) => {
      try {
        let { id, ...updates } = await parseBody(req);
        if (!id) return json(res, { error: 'Missing id' }, 400);
        updateProject(id, updates);
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    // ── CLI Config ────────────────────────────────────────
    'GET /api/cli/config': (req, res) => {
      let projects = getProjectHistory();
      let projectCli = {};
      for (let p of projects) {
        if (p.cli) projectCli[p.id] = p.cli;
      }
      json(res, {
        global: getGlobalCli(),
        projects: projectCli,
      });
    },

    'POST /api/cli/config': async (req, res) => {
      try {
        let { global: globalCli, projectId, cli } = await parseBody(req);
        if (globalCli) setGlobalCli(globalCli);
        if (projectId && cli) updateProject(projectId, { cli });
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    // ── Chats ─────────────────────────────────────────────
    'GET /api/chats': (req, res) => {
      json(res, { chats: listChats() });
    },

    'POST /api/chats': async (req, res) => {
      try {
        let opts = await parseBody(req);
        let result = createChat(opts);
        json(res, { ok: true, id: result.id });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/chats/get': async (req, res) => {
      try {
        let { id } = await parseBody(req);
        let chat = getChat(id);
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
        appendChatMessage(chatId, { role, text });
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'POST /api/chats/delete': async (req, res) => {
      try {
        let { id } = await parseBody(req);
        if (!id) return json(res, { error: 'Missing id' }, 400);
        deleteChat(id);
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },
  };
}
