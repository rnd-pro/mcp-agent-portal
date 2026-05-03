import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';

// Helper to send a JSON-RPC request to the MCP server process
function sendRequest(serverProc, method, params, id = 1) {
  return new Promise((resolve, reject) => {
    let rawOutput = '';
    
    const onData = (data) => {
      rawOutput += data.toString();
      try {
        const responses = rawOutput.trim().split('\n').map(l => JSON.parse(l));
        for (const res of responses) {
          if (res.id === id) {
            serverProc.stdout.removeListener('data', onData);
            if (res.error) reject(res.error);
            else resolve(res.result);
          }
        }
      } catch (e) {
        // Incomplete JSON, wait for more data
      }
    };

    serverProc.stdout.on('data', onData);

    const req = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params
    }) + '\n';
    
    serverProc.stdin.write(req);
  });
}

describe('mcp-server integration', () => {
  let serverProc;

  before(() => {
    // Spawn the MCP server as a child process
    const serverPath = path.resolve('packages/context-x-mcp/src/mcp-server.js');
    serverProc = spawn('node', [serverPath], {
      env: { ...process.env, PIPELINE_RUN_ID: 'test' }
    });
    
    // We don't want tests hanging forever
    serverProc.on('error', (err) => console.error('Failed to start mcp-server:', err));
  });

  after(() => {
    if (serverProc) {
      serverProc.kill();
    }
  });

  it('initializes correctly', async () => {
    const res = await sendRequest(serverProc, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0' }
    });
    
    assert.strictEqual(res.serverInfo.name, 'context-x-mcp');
  });

  it('lists workflow tools via tools/list', async () => {
    const res = await sendRequest(serverProc, 'tools/list', {}, 2);
    const tools = res.tools.map(t => t.name);
    
    assert.ok(tools.includes('list_workflows'));
    assert.ok(tools.includes('search_by_tags'));
    assert.ok(tools.includes('get_workflow_content'));
  });

  it('list_workflows returns available workflows', async () => {
    const res = await sendRequest(serverProc, 'tools/call', {
      name: 'list_workflows',
      arguments: {}
    }, 3);
    
    assert.strictEqual(res.content[0].type, 'text');
    const workflows = JSON.parse(res.content[0].text);
    
    // Check that debug_protocol is listed (from bundled workflows)
    const debugWf = workflows.find(w => w.name === 'debug_protocol');
    assert.ok(debugWf);
    assert.ok(debugWf.steps.length > 0);
    assert.strictEqual(debugWf.entryPoint, '01-reproduce');
  });

  it('search_by_tags multiple matches returns lightweight list', async () => {
    const res = await sendRequest(serverProc, 'tools/call', {
      name: 'search_by_tags',
      arguments: { tags: ['debug'] } // debug tag is on all 7 steps
    }, 4);
    
    const data = JSON.parse(res.content[0].text);
    assert.strictEqual(data.action_required, 'get_workflow_content');
    assert.ok(data.matches.length > 1);
    
    // Lightweight list shouldn't have full content
    assert.strictEqual(data.matches[0].content, undefined);
    assert.ok(data.matches[0].name);
  });

  it('search_by_tags single match returns full content', async () => {
    const res = await sendRequest(serverProc, 'tools/call', {
      name: 'search_by_tags',
      arguments: { tags: ['debug', 'first-step'] } // only 01-reproduce has first-step
    }, 5);
    
    const data = JSON.parse(res.content[0].text);
    assert.strictEqual(data.id, '01-reproduce');
    assert.ok(data.content.includes('# Step 1: Reproduce the Error'));
    assert.deepStrictEqual(data.availableDecisions, ['reproduced', 'cannot_reproduce', 'abort']);
  });

  it('get_workflow_content returns transitions and body', async () => {
    const res = await sendRequest(serverProc, 'tools/call', {
      name: 'get_workflow_content',
      arguments: { nodeId: '03-hypothesize' }
    }, 6);
    
    const data = JSON.parse(res.content[0].text);
    assert.strictEqual(data.id, '03-hypothesize');
    assert.strictEqual(data.group, 'heavy-thinkers');
    assert.ok(data.content.includes('# Step 3: Formulate Hypothesis'));
  });
});
