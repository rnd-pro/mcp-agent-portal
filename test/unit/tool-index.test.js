import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ToolIndex } from '../../src/node/proxy/tool-index.js';

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

  it('search by server filters correctly', () => {
    let index = makeIndex();
    let result = index.search({ server: 'agent-pool' });
    assert.strictEqual(result.tools.length, 2);
    assert.ok(result.tools.every(t => t.server === 'agent-pool'));
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
    assert.strictEqual(result.tools.length, 4);
    assert.strictEqual(result.total, 4);
  });

  it('get returns entry for known tool', () => {
    let index = makeIndex();
    let entry = index.get('delegate_task');
    assert.ok(entry);
    assert.strictEqual(entry.server, 'agent-pool');
  });

  it('get returns null for unknown tool', () => {
    let index = makeIndex();
    let entry = index.get('nonexistent');
    assert.strictEqual(entry, null);
  });

  it('getServers returns correct counts', () => {
    let index = makeIndex();
    let servers = index.getServers();
    assert.strictEqual(servers.length, 2);
    let pg = servers.find(s => s.name === 'project-graph');
    let ap = servers.find(s => s.name === 'agent-pool');
    assert.strictEqual(pg.toolCount, 2);
    assert.strictEqual(ap.toolCount, 2);
  });

  it('getAvailableTags returns tag names', () => {
    let index = makeIndex();
    index.setTags({ 'nav': ['get_skeleton'], 'delegate': ['delegate_task'] });
    let tags = index.getAvailableTags();
    assert.deepStrictEqual(tags.sort(), ['delegate', 'nav']);
  });
});
