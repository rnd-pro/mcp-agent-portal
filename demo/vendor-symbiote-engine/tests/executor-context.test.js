import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Executor } from '../Executor.js';
import { Graph } from '../Graph.js';
import { clearRegistry, registerNodeType } from '../Registry.js';

test('executor forwards host context into lifecycle handlers without serializing it into params', async () => {
  clearRegistry();
  registerNodeType({
    type: 'test/source',
    driver: { inputs: [], outputs: [{ name: 'value', type: 'string' }] },
    process: () => ({ value: 'input' }),
  });
  registerNodeType({
    type: 'test/context',
    driver: {
      inputs: [{ name: 'value', type: 'string' }],
      outputs: [{ name: 'marker', type: 'string' }],
    },
    lifecycle: {
      cacheKey: (_inputs, params) => `params:${Object.keys(params).sort().join(',')}`,
      execute: (_inputs, params) => ({
        marker: params.context?.marker,
        hasParamContext: Object.prototype.hasOwnProperty.call(params, 'context'),
      }),
    },
  });

  let graph = new Graph();
  let sourceId = graph.addNode('test/source');
  let nodeId = graph.addNode('test/context', { stable: true });
  graph.connect(sourceId, 'value', nodeId, 'value');
  let result = await new Executor().run(graph, { context: { marker: 'host-audio-context' } });

  assert.equal(result.outputs[nodeId].marker, 'host-audio-context');
  assert.equal(result.outputs[nodeId].hasParamContext, true);
});
