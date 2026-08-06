import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOctree } from '../xr/spatial-index.js';

test('createOctree creates an empty octree with default options', () => {
  const tree = createOctree();
  assert.equal(tree.size, 0);
  assert.equal(tree.bounds, null);
  assert.equal(tree.root, null);
});

test('createOctree insert and size tracking', () => {
  const tree = createOctree();
  const p1 = { x: 1, y: 2, z: 3 };
  const p2 = { x: 10, y: 20, z: 30 };

  assert.ok(tree.insert(p1));
  assert.equal(tree.size, 1);
  assert.ok(tree.insert(p2));
  assert.equal(tree.size, 2);

  // Check bounds
  const bounds = tree.bounds;
  assert.ok(bounds);
  assert.ok(bounds.x0 <= 1);
  assert.ok(bounds.x1 >= 10);
});

test('createOctree insertAll inserts multiple elements', () => {
  const tree = createOctree();
  const points = [
    { x: 1, y: 1, z: 1 },
    { x: 2, y: 2, z: 2 },
    { x: 3, y: 3, z: 3 },
  ];
  tree.insertAll(points);
  assert.equal(tree.size, 3);
});

test('createOctree nearest neighbor search', () => {
  const tree = createOctree();
  const points = [
    { id: 'A', x: 1, y: 1, z: 1 },
    { id: 'B', x: 5, y: 5, z: 5 },
    { id: 'C', x: 10, y: 10, z: 10 },
  ];
  tree.insertAll(points);

  const nearest = tree.nearest(4, 4, 4);
  assert.ok(nearest);
  assert.equal(nearest.data.id, 'B');

  // Test with max distance limit
  const nearestLimit = tree.nearest(0, 0, 0, 1); // too far from any point
  assert.equal(nearestLimit, null);

  const nearestLimitOk = tree.nearest(0, 0, 0, 2); // close enough to A (dist ~1.73)
  assert.ok(nearestLimitOk);
  assert.equal(nearestLimitOk.data.id, 'A');
});

test('createOctree queryBox retrieves points inside boundaries', () => {
  const tree = createOctree();
  const points = [
    { id: 'A', x: 1, y: 1, z: 1 },
    { id: 'B', x: 3, y: 3, z: 3 },
    { id: 'C', x: 5, y: 5, z: 5 },
  ];
  tree.insertAll(points);

  const inBox = tree.queryBox(2, 2, 2, 4, 4, 4);
  assert.equal(inBox.length, 1);
  assert.equal(inBox[0].id, 'B');
});

test('createOctree remove deletes elements', () => {
  const tree = createOctree();
  const p1 = { x: 1, y: 1, z: 1 };
  const p2 = { x: 5, y: 5, z: 5 };

  tree.insert(p1);
  tree.insert(p2);
  assert.equal(tree.size, 2);

  assert.ok(tree.remove(p1));
  assert.equal(tree.size, 1);

  // Trying to remove again or non-existent returns false
  assert.ok(!tree.remove(p1));
});

test('createOctree visit and visitAfter traversals', () => {
  const tree = createOctree();
  const points = [
    { x: 1, y: 1, z: 1 },
    { x: 5, y: 5, z: 5 },
  ];
  tree.insertAll(points);

  let visitedCount = 0;
  tree.visit(() => {
    visitedCount++;
  });
  assert.ok(visitedCount > 0);

  let visitedAfterCount = 0;
  tree.visitAfter(() => {
    visitedAfterCount++;
  });
  assert.ok(visitedAfterCount > 0);
  assert.equal(visitedCount, visitedAfterCount);
});
