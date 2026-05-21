import { getStateGraph } from '../../state-graph.js';
import { json, parseBody } from './http.js';

export function createStateRoutes() {
  return {
    'POST /api/state/tasks': async (req, res) => {
      try {
        let { taskIds } = await parseBody(req);
        let sg = getStateGraph();
        let tasks = {};
        for (let id of (taskIds || [])) {
          let task = sg.get(`tasks/${id}`) || null;
          if (task) {
            tasks[id] = {
              status: task.status || task.type || 'running',
              updatedAt: task.updatedAt || null,
              startedAt: task.startedAt || null,
              eventCount: task.events?.length || 0,
            };
          } else {
            tasks[id] = null;
          }
        }
        let allChats = sg.listChats?.() || [];
        for (let id of (taskIds || [])) {
          if (!tasks[id]) tasks[id] = {};
          let linkedChat = allChats.find(c => c.pendingTaskId === id);
          if (linkedChat) {
            tasks[id].chatId = linkedChat.id;
            tasks[id].chatName = linkedChat.name;
          }
        }
        json(res, { tasks });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },

    'GET /api/state': (req, res) => {
      let sg = getStateGraph();
      let url = new URL(req.url, 'http://localhost');
      let p = url.searchParams.get('path') || '';
      let sinceParam = url.searchParams.get('since');

      res.writeHead(200, { 'Content-Type': 'application/json' });

      if (sinceParam) {
        let sinceVersion = parseInt(sinceParam, 10);
        let patches = sg.getPatches(sinceVersion);
        if (patches) {
          res.end(JSON.stringify({ ok: true, v: sg.version, patches }));
        } else {
          res.end(JSON.stringify({ ok: true, ...sg.getSnapshot() }));
        }
        return;
      }

      if (p) {
        res.end(JSON.stringify({ ok: true, v: sg.version, path: p, value: sg.get(p) }));
      } else {
        res.end(JSON.stringify({ ok: true, ...sg.getSnapshot() }));
      }
    },

    'POST /api/state/commit': async (req, res) => {
      try {
        let body = await parseBody(req);
        let ops = body.ops;
        if (!Array.isArray(ops) || ops.length === 0) {
          json(res, { error: 'Missing ops array' }, 400);
          return;
        }
        let sg = getStateGraph();
        let v = sg.commit(ops, body.source || 'http');
        json(res, { ok: true, v });
      } catch (err) {
        json(res, { error: err.message }, 400);
      }
    },
  };
}
