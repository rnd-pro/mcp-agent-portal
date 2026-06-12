// @ctx mcp-http-transport tests
// Streamable HTTP MCP endpoint at /mcp

import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mcpCall } from '../../web/common/mcp-call.js';

function mcpRequest(port, body, { method = 'POST', headers = {}, path: reqPath = '/mcp' } = {}) {
  return new Promise((resolve, reject) => {
    let data = typeof body === 'string' ? body : JSON.stringify(body);
    let req = http.request({
      hostname: '127.0.0.1',
      port,
      path: reqPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...headers,
      },
    }, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let raw = Buffer.concat(chunks).toString();
        let contentType = res.headers['content-type'] || '';
        resolve({
          status: res.statusCode,
          headers: res.headers,
          raw,
          json: contentType.includes('json') ? JSON.parse(raw) : null,
          contentType,
        });
      });
    });
    req.on('error', reject);
    if (method !== 'GET' && method !== 'DELETE') req.write(data);
    req.end();
  });
}

describe('MCP HTTP Transport — /mcp endpoint', () => {
  let server;
  let port;

  before(async () => {
    // Dynamic import to handle the module
    let { createMcpHttpHandler } = await import('../../src/node/proxy/mcp-http-handler.js');
    let handler = createMcpHttpHandler({
      // Mock proxy manager providing tool routing
      tools: [
        { name: 'test_echo', description: 'Echo back input', inputSchema: { type: 'object', properties: { msg: { type: 'string' } } } },
        { name: 'test_add', description: 'Add two numbers', inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } } },
        { name: 'call_tool', description: 'Proxy a tool', inputSchema: { type: 'object', properties: { name: { type: 'string' }, arguments: { type: 'object' } } } },
        { name: 'delegate_task_readonly', description: 'Delegate readonly task', inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, parent_chat_id: { type: 'string' } } } },
        { name: 'create_goal', description: 'Create a goal', inputSchema: { type: 'object', properties: { title: { type: 'string' }, chatId: { type: 'string' } } } },
        { name: 'enqueue_goal_message', description: 'Queue a goal message', inputSchema: { type: 'object', properties: { goalId: { type: 'string' }, text: { type: 'string' }, chatId: { type: 'string' } } } },
      ],
      onToolCall: async (name, args) => {
        if (name === 'test_echo') return { content: [{ type: 'text', text: args.msg || 'empty' }] };
        if (name === 'test_add') return { content: [{ type: 'text', text: String((args.a || 0) + (args.b || 0)) }] };
        if (name === 'call_tool') return { content: [{ type: 'text', text: JSON.stringify(args) }] };
        if (name === 'delegate_task_readonly') return { content: [{ type: 'text', text: JSON.stringify(args) }] };
        if (name === 'create_goal') return { content: [{ type: 'text', text: JSON.stringify(args) }] };
        if (name === 'enqueue_goal_message') return { content: [{ type: 'text', text: JSON.stringify(args) }] };
        throw new Error(`Unknown tool: ${name}`);
      },
      onResourcesList: async () => ({ resources: [] }),
    });

    server = http.createServer((req, res) => {
      let url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/mcp') {
        handler(req, res);
        return;
      }
      res.writeHead(404);
      res.end('Not Found');
    });

    await new Promise(r => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
  });

  after(() => {
    server?.close();
  });

  it('POST /mcp with initialize returns capabilities and session ID', async () => {
    let res = await mcpRequest(port, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0' },
      },
    });

    assert.equal(res.status, 200);
    assert.ok(res.json, 'Response should be JSON');
    assert.equal(res.json.id, 1);
    assert.ok(res.json.result, 'Should have result');
    assert.ok(res.json.result.capabilities, 'Should have capabilities');
    assert.ok(res.json.result.serverInfo, 'Should have serverInfo');
    assert.equal(res.json.result.serverInfo.name, 'mcp-agent-portal');
    let sessionId = res.headers['mcp-session-id'];
    assert.ok(sessionId, 'Should return Mcp-Session-Id header');
  });

  it('POST /mcp with tools/list returns tool list', async () => {
    let initRes = await mcpRequest(port, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
    });
    let sessionId = initRes.headers['mcp-session-id'];

    let res = await mcpRequest(port, {
      jsonrpc: '2.0', id: 2, method: 'tools/list', params: {},
    }, { headers: { 'mcp-session-id': sessionId } });

    assert.equal(res.status, 200);
    assert.ok(res.json.result.tools, 'Should have tools array');
    assert.ok(res.json.result.tools.length >= 2, 'Should have at least 2 tools');
    let names = res.json.result.tools.map(t => t.name);
    assert.ok(names.includes('test_echo'), 'Should include test_echo');
    assert.ok(names.includes('test_add'), 'Should include test_add');
  });

  it('POST /mcp notification returns no JSON-RPC response body', async () => {
    let initRes = await mcpRequest(port, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
    });
    let sessionId = initRes.headers['mcp-session-id'];

    let res = await mcpRequest(port, {
      jsonrpc: '2.0', method: 'notifications/initialized', params: {},
    }, { headers: { 'mcp-session-id': sessionId } });

    assert.equal(res.status, 202);
    assert.equal(res.raw, '');
    assert.equal(res.json, null);
  });

  it('POST /mcp with tools/call routes to handler and returns result', async () => {
    let initRes = await mcpRequest(port, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
    });
    let sessionId = initRes.headers['mcp-session-id'];

    let res = await mcpRequest(port, {
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'test_echo', arguments: { msg: 'hello world' } },
    }, { headers: { 'mcp-session-id': sessionId } });

    assert.equal(res.status, 200);
    assert.ok(res.json.result, 'Should have result');
    assert.equal(res.json.result.content[0].text, 'hello world');
  });

  it('injects session chatId into chat-scoped goal tool calls', async () => {
    let initRes = await mcpRequest(port, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
    }, { path: '/mcp?chatId=chat-goal-1' });
    let sessionId = initRes.headers['mcp-session-id'];

    let res = await mcpRequest(port, {
      jsonrpc: '2.0', id: 33, method: 'tools/call',
      params: { name: 'create_goal', arguments: { title: 'Ship goals' } },
    }, { headers: { 'mcp-session-id': sessionId } });

    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(res.json.result.content[0].text), {
      title: 'Ship goals',
      chatId: 'chat-goal-1',
    });
  });

  it('injects session chatId into chat-scoped goal queue tool calls', async () => {
    let initRes = await mcpRequest(port, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
    }, { path: '/mcp?chatId=chat-goal-queue-1' });
    let sessionId = initRes.headers['mcp-session-id'];

    let res = await mcpRequest(port, {
      jsonrpc: '2.0', id: 34, method: 'tools/call',
      params: {
        name: 'enqueue_goal_message',
        arguments: { goalId: 'goal-1', text: 'Queue this.' },
      },
    }, { headers: { 'mcp-session-id': sessionId } });

    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(res.json.result.content[0].text), {
      goalId: 'goal-1',
      text: 'Queue this.',
      chatId: 'chat-goal-queue-1',
    });
  });

  it('injects session chatId into nested call_tool delegate calls', async () => {
    let initRes = await mcpRequest(port, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
    }, { path: '/mcp?chatId=parent-chat-1' });
    let sessionId = initRes.headers['mcp-session-id'];

    let res = await mcpRequest(port, {
      jsonrpc: '2.0', id: 35, method: 'tools/call',
      params: {
        name: 'call_tool',
        arguments: {
          name: 'delegate_task',
          arguments: { prompt: 'Sub task' },
        },
      },
    }, { headers: { 'mcp-session-id': sessionId } });

    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(res.json.result.content[0].text), {
      name: 'delegate_task',
      arguments: {
        prompt: 'Sub task',
        parent_chat_id: 'parent-chat-1',
      },
    });
  });

  it('injects session chatId into direct delegate tool calls', async () => {
    let initRes = await mcpRequest(port, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
    }, { path: '/mcp?chatId=direct-parent-chat-1' });
    let sessionId = initRes.headers['mcp-session-id'];

    let res = await mcpRequest(port, {
      jsonrpc: '2.0', id: 36, method: 'tools/call',
      params: {
        name: 'delegate_task_readonly',
        arguments: { prompt: 'Direct sub task' },
      },
    }, { headers: { 'mcp-session-id': sessionId } });

    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(res.json.result.content[0].text), {
      prompt: 'Direct sub task',
      parent_chat_id: 'direct-parent-chat-1',
    });
  });

  it('tools/call with test_add returns sum', async () => {
    let initRes = await mcpRequest(port, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
    });
    let sessionId = initRes.headers['mcp-session-id'];

    let res = await mcpRequest(port, {
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'test_add', arguments: { a: 7, b: 3 } },
    }, { headers: { 'mcp-session-id': sessionId } });

    assert.equal(res.status, 200);
    assert.equal(res.json.result.content[0].text, '10');
  });

  it('tools/call with unknown tool returns error', async () => {
    let initRes = await mcpRequest(port, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
    });
    let sessionId = initRes.headers['mcp-session-id'];

    let res = await mcpRequest(port, {
      jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: { name: 'nonexistent_tool', arguments: {} },
    }, { headers: { 'mcp-session-id': sessionId } });

    assert.equal(res.status, 200);
    assert.ok(res.json.error || res.json.result?.isError, 'Should return error for unknown tool');
  });

  it('POST /mcp with invalid JSON returns 400', async () => {
    let res = await mcpRequest(port, 'not json at all {{{', {
      headers: { 'Content-Type': 'application/json' },
    });

    assert.ok([400, 415].includes(res.status), `Should return 400 or 415, got ${res.status}`);
  });

  it('PUT /mcp returns 405', async () => {
    let res = await mcpRequest(port, '{}', { method: 'PUT' });
    assert.equal(res.status, 405, 'PUT should return 405 Method Not Allowed');
  });

  it('tools/list without session returns 400', async () => {
    let res = await mcpRequest(port, {
      jsonrpc: '2.0', id: 8, method: 'tools/list', params: {},
    });

    assert.ok([400, 404].includes(res.status), `Should reject sessionless non-init request, got ${res.status}`);
  });

  it('DELETE /mcp closes session', async () => {
    let initRes = await mcpRequest(port, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
    });
    let sessionId = initRes.headers['mcp-session-id'];
    assert.ok(sessionId);

    let res = await mcpRequest(port, '', {
      method: 'DELETE',
      headers: { 'mcp-session-id': sessionId },
    });

    assert.ok([200, 204].includes(res.status), `DELETE should return 200 or 204, got ${res.status}`);
  });
});

let oldFetch = global.fetch;

describe('mcpCall response parsing', () => {
  afterEach(() => {
    global.fetch = oldFetch;
  });

  it('preserves empty string result content instead of falling through', async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        result: { content: [{ text: '' }] },
        text: 'fallback',
      }),
    });

    let result = await mcpCall('agent-pool', 'empty_result', {});

    assert.equal(result, '');
  });

  it('preserves zero text payloads instead of replacing them', async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        text: 0,
        response: 'fallback',
      }),
    });

    let result = await mcpCall('agent-pool', 'zero_result', {});

    assert.equal(result, 0);
  });
});
