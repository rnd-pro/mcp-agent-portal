import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CHILD_TOOLS_LIST_TIMEOUT_MS, ToolIndex } from '../../src/node/proxy/tool-index.js';

describe('ToolIndex', () => {
  function makeIndex() {
    let index = new ToolIndex();
    // Manually populate instead of calling rebuild (no real servers)
    index.tools.set('get_skeleton', {
      tool: { name: 'get_skeleton', description: 'Get AST skeleton of a project' },
      server: 'project-graph',
    });
    index.tools.set('get_complexity', {
      tool: { name: 'get_complexity', description: 'Analyze code complexity metrics' },
      server: 'project-graph',
    });
    index.tools.set('delegate_task', {
      tool: { name: 'delegate_task', description: 'Delegate a coding task to an agent' },
      server: 'agent-pool',
    });
    index.tools.set('get_task_result', {
      tool: { name: 'get_task_result', description: 'Check status of delegated task' },
      server: 'agent-pool',
    });
    index._ready = true;
    return index;
  }

  it('search by keyword finds matching tools', () => {
    let index = makeIndex();
    let result = index.search({ query: 'skeleton' });
    assert.strictEqual(result.tools.length, 1);
    assert.strictEqual(result.tools[0].name, 'get_skeleton');
    assert.strictEqual(result.tools[0].server, 'project-graph');
  });

  it('search by server hides internal agent-pool tools', () => {
    let index = makeIndex();
    let result = index.search({ server: 'agent-pool' });
    assert.strictEqual(result.tools.length, 0);
    assert.strictEqual(result.total, 2);
  });

  it('search by tag filters correctly', () => {
    let index = makeIndex();
    index.setTags({ 'analysis': ['get_skeleton', 'get_complexity'] });
    let result = index.search({ tag: 'analysis' });
    assert.strictEqual(result.tools.length, 2);
    assert.deepStrictEqual(result.tools.map(t => t.name).sort(), ['get_complexity', 'get_skeleton']);
  });

  it('search with no params returns all tools', () => {
    let index = makeIndex();
    let result = index.search();
    assert.strictEqual(result.tools.length, 2);
    assert.strictEqual(result.total, 2);
  });

  it('get returns entry for known public tool', () => {
    let index = makeIndex();
    let entry = index.get('get_skeleton');
    assert.ok(entry);
    assert.strictEqual(entry.server, 'project-graph');
  });

  it('get hides internal agent-pool tools', () => {
    let index = makeIndex();
    let entry = index.get('delegate_task');
    assert.strictEqual(entry, null);
  });

  it('get returns null for unknown tool', () => {
    let index = makeIndex();
    let entry = index.get('nonexistent');
    assert.strictEqual(entry, null);
  });

  it('getServers returns correct counts', () => {
    let index = makeIndex();
    let servers = index.getServers();
    assert.strictEqual(servers.length, 1);
    let pg = servers.find(s => s.name === 'project-graph');
    assert.strictEqual(pg.toolCount, 2);
  });

  it('getAvailableTags returns tag names', () => {
    let index = makeIndex();
    index.setTags({ 'nav': ['get_skeleton'], 'delegate': ['delegate_task'] });
    let tags = index.getAvailableTags();
    assert.deepStrictEqual(tags.sort(), ['delegate', 'nav']);
  });

  it('records child server indexing failures without console noise', async () => {
    let index = new ToolIndex();
    let errorCalls = 0;
    let oldError = console.error;
    console.error = () => { errorCalls++; };

    try {
      let requested = [];
      await index.rebuild({
        servers: new Map([['agent-pool', {}], ['broken-server', {}]]),
        requestFromChild: async (serverName, method, params, timeoutMs) => {
          requested.push({ serverName, method, params, timeoutMs });
          throw new Error('tools/list failed');
        },
      });

      assert.strictEqual(errorCalls, 0);
      assert.deepStrictEqual(requested, [{
        serverName: 'broken-server',
        method: 'tools/list',
        params: {},
        timeoutMs: CHILD_TOOLS_LIST_TIMEOUT_MS,
      }]);
      assert.strictEqual(index.failures.length, 1);
      assert.strictEqual(index.failures[0].server, 'broken-server');
      assert.match(index.failures[0].message, /tools\/list failed/);
    } finally {
      console.error = oldError;
    }
  });

  it('clears stale indexing failures on rebuild', async () => {
    let index = new ToolIndex();
    index.failures.push({ server: 'old', message: 'old failure' });

    await index.rebuild({
      servers: new Map([['project-graph', {}]]),
      requestFromChild: async () => ({
        tools: [{ name: 'get_skeleton', description: 'Get skeleton' }],
      }),
    });

    assert.deepStrictEqual(index.failures, []);
    assert.strictEqual(index.getPublicToolCount(), 1);
  });
});
