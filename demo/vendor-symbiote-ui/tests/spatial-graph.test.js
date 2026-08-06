import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSpatialGraphModel,
  updateSpatialNodePosition,
  selectSpatialNode,
  focusSpatialNode,
  pinSpatialNode,
  unpinSpatialNode
} from '../xr/spatial-graph.js';

test('createSpatialGraphModel normalizes raw inputs', () => {
  const rawInput = {
    nodes: [
      { id: '1', label: 'Node 1', x: 5, y: 6, z: 7, metadata: { extra: true } }
    ],
    links: [
      { id: 'l1', source: '1', target: '2', strength: 0.5 }
    ]
  };

  const model = createSpatialGraphModel(rawInput);
  assert.equal(model.version, 'spatial-graph-v1');
  assert.equal(model.nodes.length, 1);
  assert.equal(model.nodes[0].id, '1');
  assert.deepEqual(model.nodes[0].position, [5, 6, 7]);
  assert.equal(model.nodes[0].radius, 0.08);
  assert.equal(model.nodes[0].fixed, false);
  assert.equal(model.nodes[0].metadata.extra, true);

  assert.equal(model.links.length, 1);
  assert.equal(model.links[0].id, 'l1');
  assert.equal(model.links[0].source, '1');
  assert.equal(model.links[0].target, '2');
  assert.equal(model.links[0].strength, 0.5);
});

test('updateSpatialNodePosition updates node coordinates', () => {
  let model = createSpatialGraphModel({
    nodes: [{ id: '1', position: [0, 0, 0] }]
  });

  model = updateSpatialNodePosition(model, '1', [10, 20, 30]);
  assert.deepEqual(model.nodes[0].position, [10, 20, 30]);
});

test('selectSpatialNode and focusSpatialNode update selection', () => {
  let model = createSpatialGraphModel({
    nodes: [{ id: '1' }]
  });

  model = selectSpatialNode(model, '1');
  assert.equal(model.selection.activeNodeId, '1');

  model = focusSpatialNode(model, '1');
  assert.equal(model.selection.focusedNodeId, '1');

  model = selectSpatialNode(model, null);
  assert.equal(model.selection.activeNodeId, null);
});

test('pinSpatialNode and unpinSpatialNode pin/unpin node', () => {
  let model = createSpatialGraphModel({
    nodes: [{ id: '1', position: [0, 0, 0] }]
  });

  model = pinSpatialNode(model, '1', [5, 5, 5]);
  assert.equal(model.nodes[0].fixed, true);
  assert.deepEqual(model.nodes[0].position, [5, 5, 5]);

  model = unpinSpatialNode(model, '1');
  assert.equal(model.nodes[0].fixed, false);
});
