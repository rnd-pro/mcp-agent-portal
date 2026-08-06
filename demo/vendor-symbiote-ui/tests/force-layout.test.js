import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSimulation,
  forceCenter3D,
  forceLink3D,
  forceManyBody3D,
  forceCluster3D
} from '../xr/force-layout.js';

test('createSimulation initializes node coordinates and speeds', () => {
  const nodes = [{ id: 'A' }, { id: 'B' }];
  const sim = createSimulation(nodes);

  const simNodes = sim.nodes();
  assert.equal(simNodes.length, 2);
  assert.ok(typeof simNodes[0].x === 'number');
  assert.ok(typeof simNodes[0].vx === 'number');
});

test('forceCenter3D centers the nodes around the target', () => {
  const nodes = [
    { id: 'A', x: 10, y: 10, z: 10 },
    { id: 'B', x: 20, y: 20, z: 20 },
  ];
  const sim = createSimulation(nodes);
  sim.velocityDecay(1); // no decay for simpler testing
  sim.alphaDecay(0); // constant alpha

  sim.force('center', forceCenter3D(0, 0, 0));
  sim.tick();

  const simNodes = sim.nodes();
  const cx = (simNodes[0].x + simNodes[1].x) / 2;
  const cy = (simNodes[0].y + simNodes[1].y) / 2;
  const cz = (simNodes[0].z + simNodes[1].z) / 2;

  // The center should be exactly at 0, 0, 0
  assert.ok(Math.abs(cx) < 1e-6);
  assert.ok(Math.abs(cy) < 1e-6);
  assert.ok(Math.abs(cz) < 1e-6);
});

test('forceLink3D pulls connected nodes closer', () => {
  const nodes = [
    { id: 'A', x: 0, y: 0, z: 0 },
    { id: 'B', x: 10, y: 0, z: 0 },
  ];
  const links = [{ source: 'A', target: 'B', strength: 1, distance: 2 }];

  const sim = createSimulation(nodes);
  sim.force('link', forceLink3D(links));

  // Run a tick. The nodes should move toward each other
  sim.tick();

  const simNodes = sim.nodes();
  // Node A is at 0, B is at 10. Link target distance is 2. They should move closer.
  assert.ok(simNodes[0].x > 0);
  assert.ok(simNodes[1].x < 10);
});

test('forceManyBody3D pushes nodes apart', () => {
  const nodes = [
    { id: 'A', x: 1, y: 1, z: 1 },
    { id: 'B', x: 1.1, y: 1.1, z: 1.1 },
  ];

  const sim = createSimulation(nodes);
  sim.force('charge', forceManyBody3D().strength(-10));
  sim.tick();

  const simNodes = sim.nodes();
  // Repulsion should move A and B further apart
  const dxInitial = 0.1;
  const dxFinal = simNodes[1].x - simNodes[0].x;
  assert.ok(dxFinal > dxInitial);
});

test('forceCluster3D groups nodes by category', () => {
  const nodes = [
    { id: 'A', category: 'cat1', x: 0, y: 0, z: 0 },
    { id: 'B', category: 'cat1', x: 2, y: 2, z: 2 },
    { id: 'C', category: 'cat2', x: 10, y: 10, z: 10 },
  ];

  const sim = createSimulation(nodes);
  sim.force('cluster', forceCluster3D().strength(1));
  sim.tick();

  const simNodes = sim.nodes();
  // A and B should move towards each other, C shouldn't move towards them
  const distABBefore = Math.sqrt(3 * 4); // ~3.46
  const distABAfter = Math.sqrt(
    Math.pow(simNodes[1].x - simNodes[0].x, 2) +
    Math.pow(simNodes[1].y - simNodes[0].y, 2) +
    Math.pow(simNodes[1].z - simNodes[0].z, 2)
  );

  assert.ok(distABAfter < distABBefore);
});
