/**
 * GraphServer.js - WebSocket + HTTP server for symbiote-engine *
 * Provides real-time graph synchronization between server and UI clients.
 * Supports file-based workflow watching, handler hot-reload, and server-side execution.
 *
 * Protocol messages follow SPEC.md P23 Agent Bridge specification.
 *
 * @module symbiote-engine/GraphServer */

import { createServer as createHttpServer } from 'node:http';
import { readFile, writeFile, watch as fsWatch } from 'node:fs/promises';
import { resolve } from 'node:path';
import { WebSocketServer } from 'ws';

import { Graph } from './Graph.js';
import { Executor } from './Executor.js';
import { listDrivers } from './Registry.js';
import { loadHandlers, watchHandlers } from './HandlerLoader.js';
import { deserialize } from './Persistence.js';

/**
 * @typedef {object} ServerOptions
 * @property {number} [port=3100] - HTTP/WebSocket port
 * @property {string} [handlersDir] - Directory for .handler.js files
 * @property {string} [workflowFile] - Path to .workflow.json
 * @property {boolean} [watchFiles=true] - Enable file watching
 * @property {boolean} [verbose=false] - Verbose logging
 */

/**
 * @param {Object} [options]
 * @param {number} [options.port]
 * @param {string} [options.handlersDir]
 * @param {string} [options.workflowFile]
 * @param {boolean} [options.watchFiles]
 * @param {boolean} [options.verbose]
 * @returns {Promise<{server: import('http').Server, wss: WebSocketServer, graph: Graph, close: () => Promise<void>}>}
 */
export async function createServer(options = {}) {
  let { port = 3100, handlersDir, workflowFile, watchFiles = true, verbose = false } = options;

  let graph = new Graph();
  let executor = new Executor();
  let watchers = [];
  let log = verbose ? console.log.bind(console) : () => {};


  if (workflowFile) {
    try {
      let json = await readFile(resolve(workflowFile), 'utf-8');
      graph = deserialize(json);
      log(`📄 Loaded workflow: ${workflowFile} (${graph.nodes.size} nodes)`);
    } catch (err) {
      log(`⚠️  Could not load workflow: ${err.message}`);
    }
  }


  if (handlersDir) {
    let dir = resolve(handlersDir);
    let registered = await loadHandlers(dir);
    log(`🔧 Loaded ${registered.length} handler(s) from ${handlersDir}`);

    if (watchFiles) {
      let handlerWatcher = watchHandlers(dir, {
        onRegister: (type) => {
          log(`♻️  Handler reloaded: ${type}`);
          broadcast({ type: 'registry:add', payload: { type, category: type.split('/')[0] } });
        },
      });
      watchers.push(() => handlerWatcher.close());
    }
  }


  let httpServer = createHttpServer(async (req, res) => {
    let url = new URL(req.url, `http://localhost:${port}`);


    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      if (url.pathname === '/api/graph' && req.method === 'GET') {
        let data = graph.toJSON();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
        return;
      }

      if (url.pathname === '/api/graph' && req.method === 'POST') {
        let body = await readBody(req);
        let data = JSON.parse(body);
        graph = new Graph();
        graph.fromJSON(data);
        broadcast({ type: 'graph:update', payload: graph.toJSON() });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (url.pathname === '/api/graph/execute' && req.method === 'POST') {
        await executeGraph(req, res);
        return;
      }

      if (url.pathname === '/api/registry' && req.method === 'GET') {
        let drivers = listDrivers();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(drivers));
        return;
      }


      if (url.pathname === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', nodes: graph.nodes.size }));
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });


  let wss = new WebSocketServer({ server: httpServer });
  /** @type {Set<import('ws').WebSocket>} */
  let clients = new Set();

  wss.on('connection', (ws) => {
    clients.add(ws);
    log(`🔌 Client connected (${clients.size} total)`);


    ws.send(JSON.stringify({ type: 'graph:update', payload: graph.toJSON() }));

    ws.on('message', async (data) => {
      try {
        let msg = JSON.parse(data.toString());
        await handleWsMessage(msg, ws);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', payload: { message: err.message } }));
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      log(`🔌 Client disconnected (${clients.size} total)`);
    });
  });

  /**
   * Broadcast message to all connected clients
   * @param {object} msg
   * @param {import('ws').WebSocket} [exclude] - Client to exclude
   */
  function broadcast(msg, exclude) {
    let json = JSON.stringify(msg);
    for (const client of clients) {
      if (client !== exclude && client.readyState === 1) {
        client.send(json);
      }
    }
  }


  let UI_PASSTHROUGH = new Set([
    'ui:layout',
    'ui:focus',
    'ui:select',
    'ui:navigate',
    'ui:playback',
    'ui:notify',
    'ui:cursor',
  ]);

  let graphActionMap = {
    addNode: (payload, ws) => {
      let { data } = payload;
      let id = graph.addNode(data.type, data.params, data.options);
      broadcast({ type: 'graph:update', payload: graph.toJSON() }, ws);
      ws.send(
        JSON.stringify({ type: 'graph:actionResult', payload: { action: 'addNode', nodeId: id } })
      );
    },
    removeNode: (payload, ws) => {
      graph.removeNode(payload.nodeId);
      broadcast({ type: 'graph:update', payload: graph.toJSON() }, ws);
    },
    connect: (payload, ws) => {
      let { from, out, to, in: inp } = payload.data;
      graph.connect(from, out, to, inp);
      broadcast({ type: 'graph:update', payload: graph.toJSON() }, ws);
    },
    updateParams: (payload, ws) => {
      graph.updateParams(payload.nodeId, payload.data.params);
      broadcast({ type: 'graph:update', payload: graph.toJSON() }, ws);
    },
    execute: async (_payload, ws) => {
      let ac = new AbortController();
      let abort = () => ac.abort(new Error('WebSocket client disconnected'));
      ws.once('close', abort);
      try {
        await executeAndStream({ signal: ac.signal });
      } finally {
        ws.off('close', abort);
      }
    },
  };

  let cmdMap = {
    'graph:action': (payload, ws) => {
      let handler = graphActionMap[payload.action];
      if (handler) return handler(payload, ws);
      ws.send(
        JSON.stringify({ type: 'error', payload: { message: `Unknown action: ${payload.action}` } })
      );
    },
  };

  /**
   * @param {{type: string, payload: object}} msg
   * @param {import('ws').WebSocket} ws
   * @returns {Promise<void>}
   */
  async function handleWsMessage(msg, ws) {
    let { type, payload } = msg;


    if (UI_PASSTHROUGH.has(type)) {
      broadcast(msg, ws);
      return;
    }

    let handler = cmdMap[type];
    if (handler) return handler(payload, ws);

    ws.send(
      JSON.stringify({ type: 'error', payload: { message: `Unknown message type: ${type}` } })
    );
  }

  /**
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   * @param {number} [options.deadline]
   * @returns {Promise<object>}
   */
  async function executeAndStream(options = {}) {
    let result = await executor.run(graph, {
      signal: options.signal,
      deadline: options.deadline,
      onNodeStart: (nodeId) => {
        broadcast({ type: 'node:progress', payload: { nodeId, progress: 0, phase: 'start' } });
      },
      onNodeComplete: (nodeId, output, timeMs) => {
        let cached = !!(output && output._fromCache);
        broadcast({ type: 'node:result', payload: { nodeId, status: 'done', cached, timeMs } });
      },
      onNodeSkipped: (nodeId) => {
        broadcast({ type: 'node:result', payload: { nodeId, status: 'skipped' } });
      },
    });

    broadcast({
      type: 'graph:executed',
      payload: { totalTime: result.totalTime, log: result.log },
    });


    if (workflowFile) {
      try {
        await writeFile(resolve(workflowFile), JSON.stringify(graph.toJSON(), null, 2));
      } catch (err) {
        log(`⚠️  Could not save workflow: ${err.message}`);
      }
    }

    return result;
  }

  /**
   * Execute graph via HTTP and return result
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   */
  async function executeGraph(req, res) {
    let ac = new AbortController();
    let abort = () => {
      if (!res.writableEnded) ac.abort(new Error('HTTP client disconnected'));
    };
    req.on('close', abort);
    try {
      let result = await executeAndStream({ signal: ac.signal });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          totalTime: result.totalTime,
          outputs: result.outputs,
          log: result.log,
        })
      );
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    } finally {
      req.off('close', abort);
    }
  }


  if (watchFiles && workflowFile) {
    let wfPath = resolve(workflowFile);
    let debounce = null;
    let ac = new AbortController();

    (async () => {
      try {
        let watcher = fsWatch(wfPath, { signal: ac.signal });
        for await (const event of watcher) {
          void event;
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(async () => {
            try {
              let json = await readFile(wfPath, 'utf-8');
              let data = JSON.parse(json);
              graph = deserialize(data);
              broadcast({ type: 'graph:update', payload: data });
              log(`📄 Workflow reloaded: ${workflowFile}`);
            } catch (err) {
              log(`⚠️  Workflow reload error: ${err.message}`);
            }
          }, 200);
        }
      } catch (err) {
        if (err.name !== 'AbortError') log(`⚠️  Workflow watch error: ${err.message}`);
      }
    })();

    watchers.push(() => ac.abort());
  }


  await new Promise((resolve) => httpServer.listen(port, resolve));
  log(`🚀 symbiote-engine server on http://localhost:${port}`);
  async function close() {
    for (const stop of watchers) {
      if (typeof stop === 'function') stop();
    }
    for (const client of clients) {
      client.close();
    }
    wss.close();
    await new Promise((resolve) => httpServer.close(resolve));
    log('🛑 Server stopped');
  }

  return { server: httpServer, wss, graph, executor, broadcast, close };
}

/**
 * Read HTTP request body
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<string>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
