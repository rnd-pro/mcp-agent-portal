// @ctx mcp-http-handler.ctx
//
// Streamable HTTP MCP Server endpoint for /mcp
//
// This is the agent-portal's HTTP MCP gateway. Spawned sub-agents connect
// here instead of launching isolated stdio MCP processes.
//
// Architecture: "Group Chat" model
// All agents (browser, Gemini CLI, OpenCode) connect to this single endpoint.
// Tool calls are routed to child MCP servers (agent-pool, project-graph, etc.)
// via the same MCPProxyManager used by the stdio multiplexer.
//
// Usage:
//   import { createMcpHttpHandler } from './mcp-http-handler.js';
//   let handler = createMcpHttpHandler({ tools, onToolCall, onResourcesList });
//   // In HTTP server: if (pathname === '/mcp') handler(req, res);

import crypto from 'node:crypto';

/**
 * @typedef {Object} McpHttpOptions
 * @property {Array<{name:string, description:string, inputSchema:object}>} tools - Available tools
 * @property {(name:string, args:object) => Promise<object>} onToolCall - Tool call handler
 * @property {() => Promise<{resources:Array}>} [onResourcesList] - Resources list handler
 */

const SERVER_INFO = { name: 'mcp-agent-portal', version: '2.0.0' };
const PROTOCOL_VERSION = '2025-06-18';

/**
 * Active session store
 * @type {Map<string, { clientInfo: object, createdAt: number }>}
 */
const sessions = new Map();

// Session TTL: 1 hour
const SESSION_TTL = 60 * 60 * 1000;

// Cleanup stale sessions every 10 min
setInterval(() => {
  let now = Date.now();
  for (let [id, sess] of sessions) {
    if (now - sess.createdAt > SESSION_TTL) sessions.delete(id);
  }
}, 10 * 60 * 1000).unref();

/**
 * Create a Streamable HTTP MCP handler.
 *
 * @param {McpHttpOptions} opts
 * @returns {(req: import('http').IncomingMessage, res: import('http').ServerResponse) => void}
 */
export function createMcpHttpHandler(opts) {
  return function mcpHandler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'DELETE') {
      handleDelete(req, res);
      return;
    }

    if (req.method === 'GET') {
      handleGet(req, res);
      return;
    }

    if (req.method === 'POST') {
      handlePost(req, res, opts);
      return;
    }

    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
  };
}

/**
 * DELETE /mcp — close session
 */
function handleDelete(req, res) {
  let sessionId = req.headers['mcp-session-id'];
  if (sessionId && sessions.has(sessionId)) {
    sessions.delete(sessionId);
  }
  res.writeHead(204);
  res.end();
}

/**
 * GET /mcp — Open standard SSE stream
 */
function handleGet(req, res) {
  let sessionId = crypto.randomUUID();
  let urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let chatId = urlObj.searchParams.get('chatId');

  sessions.set(sessionId, {
    clientInfo: {},
    createdAt: Date.now(),
    res: res, // Store response to push server-to-client messages if needed
    chatId: chatId,
  });
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Send the endpoint event as required by MCP SSE spec
  // OpenCode will send POST requests to this URL
  // We use a relative URL to completely avoid origin mismatch issues behind reverse proxies.
  let endpointUrl = `/mcp/message?sessionId=${sessionId}`;
  
  res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);

  let keepAlive = setInterval(() => res.write(':ping\n\n'), 15000);
  
  req.on('close', () => {
    clearInterval(keepAlive);
    sessions.delete(sessionId);
  });
}

/**
 * POST /mcp or /mcp/message — JSON-RPC request handling
 *
 * Supports two flows:
 *  1. SSE-first:   GET /mcp → SSE stream, POST /mcp/message?sessionId=... → 202 + SSE push
 *  2. Streamable HTTP: POST /mcp with initialize (no session) → inline JSON + Mcp-Session-Id header
 */
function handlePost(req, res, opts) {
  let url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let sessionId = url.searchParams.get('sessionId');

  // Streamable HTTP continues sessions via the Mcp-Session-Id header.
  if (!sessionId) {
    sessionId = req.headers['mcp-session-id'];
  }

  let body = [];
  req.on('data', chunk => body.push(chunk));
  req.on('end', async () => {
    let raw = Buffer.concat(body).toString();
    let msg;

    try {
      msg = JSON.parse(raw);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
      return;
    }

    // ── Streamable HTTP: initialize without session → create session inline ──
    let singleMsg = Array.isArray(msg) ? msg[0] : msg;
    if (!sessionId && singleMsg?.method === 'initialize') {
      sessionId = crypto.randomUUID();
      sessions.set(sessionId, {
        clientInfo: singleMsg.params?.clientInfo || {},
        createdAt: Date.now(),
        res: null, // no SSE stream for Streamable HTTP mode
        chatId: url.searchParams.get('chatId'),
      });
    }

    if (!sessionId || !sessions.has(sessionId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32600, message: 'Missing or invalid session' } }));
      return;
    }

    let sess = sessions.get(sessionId);

    // ── SSE mode: push responses via SSE stream ──
    if (sess.res) {
      // Acknowledge the POST request immediately per MCP SSE spec
      res.writeHead(202);
      res.end();

      let sendToSse = (data) => {
        sess.res.write(`event: message\ndata: ${JSON.stringify(data)}\n\n`);
      };

      if (Array.isArray(msg)) {
        for (let m of msg) {
          let result = await processMessage(m, req, opts, sessionId);
          if (result) sendToSse(result);
        }
      } else {
        let result = await processMessage(msg, req, opts, sessionId);
        if (result) sendToSse(result);
      }
      return;
    }

    // ── Streamable HTTP mode: return JSON response inline with session header ──
    if (Array.isArray(msg)) {
      let results = [];
      for (let m of msg) {
        let result = await processMessage(m, req, opts, sessionId);
        if (result) results.push(result);
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Mcp-Session-Id': sessionId,
      });
      res.end(JSON.stringify(results.length === 1 ? results[0] : results));
    } else {
      let result = await processMessage(msg, req, opts, sessionId);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Mcp-Session-Id': sessionId,
      });
      res.end(JSON.stringify(result || { jsonrpc: '2.0', id: msg.id, result: {} }));
    }
  });
}

/**
 * Process a single JSON-RPC message
 * @param {object} msg
 * @param {import('node:http').IncomingMessage} req
 * @param {object} opts
 * @param {string} sessionId
 * @returns {Promise<object|null>}
 */
async function processMessage(msg, req, opts, sessionId) {
  if (!msg.jsonrpc || msg.jsonrpc !== '2.0') {
    return { jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32600, message: 'Invalid JSON-RPC version' } };
  }

  if (msg.id === undefined) return null; // Notification

  sessions.get(sessionId).lastActivity = Date.now();
  let method = msg.method;

  if (method === 'initialize') {
    if (msg.params?.clientInfo) {
      sessions.get(sessionId).clientInfo = msg.params.clientInfo;
    }
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: true }, resources: {} },
        serverInfo: SERVER_INFO,
      }
    };
  }

  if (method === 'tools/list') {
    let tools = [];
    if (typeof opts.getTools === 'function') {
      tools = await opts.getTools();
    } else {
      tools = opts.tools || [];
    }
    
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: { tools: tools },
    };
  }

  if (method === 'tools/call') {
    let toolName = msg.params?.name;
    let args = msg.params?.arguments || {};

    let sess = sessions.get(sessionId);
    let isDelegate = toolName === 'delegate_task' || toolName === 'delegate_task_readonly' ||
                     toolName === 'mcp_agent-portal_delegate_task' || toolName === 'mcp_agent-portal_delegate_task_readonly';
    if (sess && sess.chatId && isDelegate) {
      if (!args.parent_chat_id) {
        args.parent_chat_id = sess.chatId;
      }
    }

    // Validate tool exists using dynamic tool loading (same source as tools/list)
    let tools = [];
    if (typeof opts.getTools === 'function') {
      tools = await opts.getTools();
    } else {
      tools = opts.tools || [];
    }
    let tool = tools.find(t => t.name === toolName);
    if (!tool) {
      return {
        jsonrpc: '2.0',
        id: msg.id,
        result: { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true },
      };
    }

    try {
      let result = await opts.onToolCall(toolName, args);
      return { jsonrpc: '2.0', id: msg.id, result };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          content: [{ type: 'text', text: `Tool error: ${err.message}` }],
          isError: true,
        },
      };
    }
  }

  // ── Resources List ──
  if (method === 'resources/list') {
    let result = opts.onResourcesList ? await opts.onResourcesList() : { resources: [] };
    return { jsonrpc: '2.0', id: msg.id, result };
  }

  // ── Ping ──
  if (method === 'ping') {
    return { jsonrpc: '2.0', id: msg.id, result: {} };
  }

  // ── Unknown ──
  return {
    jsonrpc: '2.0',
    id: msg.id,
    error: { code: -32601, message: `Unknown method: ${method}` },
  };
}

export default createMcpHttpHandler;
