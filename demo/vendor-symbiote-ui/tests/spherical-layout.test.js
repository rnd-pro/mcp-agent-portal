import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSphericalGraphLayout } from '../xr/spherical-layout.js';

test('createSphericalGraphLayout sphere mode with single and multiple nodes', () => {
  const nodes = [{ id: '1' }, { id: '2' }];
  const layout = createSphericalGraphLayout(nodes, [], { mode: 'sphere', radius: 2 });

  assert.equal(layout.nodes.length, 2);
  assert.equal(layout.diagnostics.nodeCount, 2);
  assert.equal(layout.diagnostics.mode, 'sphere');

  // Verify distance from center (0, 1.55, 0)
  for (const node of layout.nodes) {
    const dx = node.position[0] - 0;
    const dy = node.position[1] - 1.55;
    const dz = node.position[2] - 0;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    assert.ok(Math.abs(dist - 2) < 1e-6);
  }
});

test('createSphericalGraphLayout shell mode distributes across layers', () => {
  const nodes = [{ id: '1' }, { id: '2' }, { id: '3' }];
  const layout = createSphericalGraphLayout(nodes, [], { mode: 'shell', radius: 2 });

  assert.equal(layout.nodes.length, 3);
  assert.equal(layout.diagnostics.mode, 'shell');

  // Shell radius variations (layer 0: 2*0.75=1.5, layer 1: 2*1=2, layer 2: 2*1.25=2.5)
  const distances = layout.nodes.map((node) => {
    const dx = node.position[0] - 0;
    const dy = node.position[1] - 1.55;
    const dz = node.position[2] - 0;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  });

  assert.ok(distances.some((d) => Math.abs(d - 1.5) < 1e-6));
  assert.ok(distances.some((d) => Math.abs(d - 2) < 1e-6));
  assert.ok(distances.some((d) => Math.abs(d - 2.5) < 1e-6));
});

test('createSphericalGraphLayout clustered-shell groups by category', () => {
  const nodes = [
    { id: '1', category: 'cat1' },
    { id: '2', category: 'cat1' },
    { id: '3', category: 'cat2' },
  ];
  const layout = createSphericalGraphLayout(nodes, [], { mode: 'clustered-shell', radius: 2 });

  assert.equal(layout.nodes.length, 3);
  assert.equal(layout.diagnostics.mode, 'clustered-shell');

  // Node 1 and Node 2 should be in the same cluster (near each other)
  // Node 3 should be far from them
  const dist12 = Math.sqrt(
    Math.pow(layout.nodes[0].position[0] - layout.nodes[1].position[0], 2) +
    Math.pow(layout.nodes[0].position[1] - layout.nodes[1].position[1], 2) +
    Math.pow(layout.nodes[0].position[2] - layout.nodes[1].position[2], 2)
  );

  const dist13 = Math.sqrt(
    Math.pow(layout.nodes[0].position[0] - layout.nodes[2].position[0], 2) +
    Math.pow(layout.nodes[0].position[1] - layout.nodes[2].position[1], 2) +
    Math.pow(layout.nodes[0].position[2] - layout.nodes[2].position[2], 2)
  );

  assert.ok(dist12 < dist13);
});

test('createSphericalGraphLayout preserves fixed nodes', () => {
  const nodes = [
    { id: '1', fixed: true, position: [10, 10, 10] },
    { id: '2' },
  ];

  const layout = createSphericalGraphLayout(nodes, [], { mode: 'sphere', radius: 2 });
  assert.deepEqual(layout.nodes[0].position, [10, 10, 10]);
});

test('createSphericalGraphLayout is deterministic', () => {
  const nodes = [{ id: '1' }, { id: '2' }, { id: '3' }];

  const layout1 = createSphericalGraphLayout(nodes, [], { mode: 'sphere' });
  const layout2 = createSphericalGraphLayout(nodes, [], { mode: 'sphere' });

  assert.deepEqual(layout1.nodes, layout2.nodes);
});
