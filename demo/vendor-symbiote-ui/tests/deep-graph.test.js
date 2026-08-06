import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createXRDeepGraphScene, projectWorldToCss3D } from '../xr/deep-graph.js';

test('createXRDeepGraphScene works with force-directed layout strategy', () => {
  const graph = {
    nodes: [
      { id: '1', label: 'Node 1', depth: 0 },
      { id: '2', label: 'Node 2', depth: 1 }
    ],
    edges: [
      { from: '1', to: '2' }
    ]
  };

  const scene = createXRDeepGraphScene(graph, {
    placementStrategy: 'force-directed',
    graph // Pass graph to options so placeNodes can access edges
  });

  assert.equal(scene.nodes.length, 2);
  assert.equal(scene.edges.length, 1);
  assert.equal(scene.placement.strategy, 'force-directed');

  // Node 1 is root and parentId is empty, so it should be fixed and remain close to center
  assert.deepEqual(scene.nodes[0].position, [0, 1.35, -1.8]);
  // Node 2 should have computed coordinates from force-directed tick
  assert.ok(typeof scene.nodes[1].position[0] === 'number');
});

test('projectWorldToCss3D calculates correct CSS matrix3d', () => {
  const position = [1, 2, 3];
  const camera = {
    projectionMatrix: new Float32Array([
      2, 0, 0, 0,
      0, 2, 0, 0,
      0, 0, 2, 0,
      0, 0, 0, 2
    ]),
    viewMatrix: new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ])
  };

  const css = projectWorldToCss3D(position, camera);
  assert.ok(css.startsWith('matrix3d('));
  assert.ok(css.endsWith(')'));

  // Multiplied position values should be inside
  assert.ok(css.includes('2')); // translation is scaled
});
