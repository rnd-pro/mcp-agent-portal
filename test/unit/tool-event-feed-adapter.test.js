import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toToolEventFeedItem, toToolEventFeedItems } from '../../web/common/tool-event-feed-adapter.js';

describe('tool event feed adapter', () => {
  it('maps tool calls to provider event feed call records', () => {
    let item = toToolEventFeedItem({
      type: 'tool_call',
      tool: 'default_api:list_dir',
      ts: 1000,
      args: { path: '.' },
    });

    assert.equal(item.direction, 'call');
    assert.equal(item.tool, 'default_api:list_dir');
    assert.deepEqual(item.args, { path: '.' });
    assert.deepEqual(item.preview, { type: 'empty' });
  });

  it('maps list and graph results to structured preview records', () => {
    let [list, graph] = toToolEventFeedItems([
      {
        type: 'tool_result',
        tool: 'default_api:list_dir',
        ts: 1000,
        duration_ms: 12,
        success: true,
        output: JSON.stringify([{ label: 'web', kind: 'dir' }]),
      },
      {
        type: 'tool_result',
        tool: 'default_api:mcp_project-graph_get_skeleton',
        ts: 1000,
        duration_ms: 20,
        success: true,
        output: JSON.stringify({ n: { A: { label: 'A' } }, e: [] }),
      },
    ]);

    assert.equal(list.preview.type, 'list');
    assert.equal(list.durationText, '12ms');
    assert.deepEqual(list.preview.value, [{ label: 'web', kind: 'dir' }]);
    assert.equal(graph.preview.type, 'graph');
    assert.deepEqual(graph.preview.value.nodes, [{ id: 'A', label: 'A', kind: 'node', description: '' }]);
  });

  it('maps failed results to error previews without leaking undefined text', () => {
    let item = toToolEventFeedItem({
      type: 'tool_result',
      tool: 'default_api:list_dir',
      success: false,
    });

    assert.equal(item.direction, 'result');
    assert.equal(item.success, false);
    assert.deepEqual(item.preview, { type: 'error', value: 'Error' });
  });
});
