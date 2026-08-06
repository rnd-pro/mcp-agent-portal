import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  intersectRaySphere,
  hitTestSpatialNode,
  normalizeSpatialPointer,
  projectPointerToDragPlane,
  createSpatialDragController
} from '../xr/spatial-drag-controller.js';

test('intersectRaySphere detects correct hits and misses', () => {
  const origin = [0, 0, 0];
  const direction = [0, 0, -1]; // looking down -Z axis
  const center = [0, 0, -5];
  const radius = 1;

  // Exact center hit
  const hitDist = intersectRaySphere(origin, direction, center, radius);
  assert.ok(hitDist !== null);
  assert.equal(hitDist, 4); // 5 - radius

  // Sphere is behind
  const behindHit = intersectRaySphere(origin, direction, [0, 0, 5], radius);
  assert.equal(behindHit, null);

  // Miss
  const missHit = intersectRaySphere(origin, direction, [2, 0, -5], radius);
  assert.equal(missHit, null);
});

test('hitTestSpatialNode returns closest node intersection', () => {
  const nodes = [
    { id: '1', position: [0, 0, -10], radius: 1 },
    { id: '2', position: [0, 0, -5], radius: 1 }
  ];
  const pointer = {
    origin: [0, 0, 0],
    direction: [0, 0, -1]
  };

  const hit = hitTestSpatialNode(nodes, pointer);
  assert.ok(hit);
  assert.equal(hit.node.id, '2'); // closest one
  assert.equal(hit.distance, 4);
});

test('projectPointerToDragPlane projects ray to plane coords', () => {
  const pointer = {
    origin: [0, 0, 0],
    direction: [0, 0, -1]
  };
  const plane = {
    point: [0, 0, -5],
    normal: [0, 0, 1] // plane facing camera
  };

  const point = projectPointerToDragPlane(pointer, plane);
  assert.ok(point);
  assert.deepEqual(point, [0, 0, -5]);
});

test('createSpatialDragController computes drag sequence', () => {
  const node = { id: 'A', position: [0, 0, -5], radius: 1 };
  const controller = createSpatialDragController();

  const startPointer = {
    origin: [0, 0, 0],
    direction: [0, 0, -1]
  };

  const startRecord = controller.startDrag(node, startPointer);
  assert.ok(startRecord);
  assert.equal(startRecord.phase, 'start');
  assert.equal(startRecord.nodeId, 'A');
  assert.deepEqual(startRecord.position, [0, 0, -5]);
  assert.deepEqual(startRecord.pointer, {
    kind: 'ray',
    origin: [0, 0, 0],
    direction: [0, 0, -1],
  });

  // Move drag diagonally
  const movePointer = {
    origin: [0, 0, 0],
    direction: [0.196116, 0, -0.98058] // look slightly right (atan(0.2) ~ 11.3 deg)
  };
  const moveRecord = controller.moveDrag(movePointer);
  assert.ok(moveRecord);
  assert.equal(moveRecord.phase, 'move');
  assert.equal(moveRecord.nodeId, 'A');

  // Verify it moved rightwards
  assert.ok(moveRecord.position[0] > 0);
  assert.equal(moveRecord.position[2], -5); // Z should be locked on the plane at -5

  const endRecord = controller.endDrag();
  assert.ok(endRecord);
  assert.equal(endRecord.phase, 'end');
});

test('normalizeSpatialPointer supports mouse, ray, controller, and hand inputs', () => {
  const ray = normalizeSpatialPointer({
    kind: 'controller',
    origin: [1, 2, 3],
    direction: [0, 0, -2],
  });
  assert.equal(ray.kind, 'controller');
  assert.deepEqual(ray.direction, [0, 0, -1]);

  const hand = normalizeSpatialPointer({
    kind: 'hand',
    origin: [0, 1, 0],
    direction: [0, -1, -1],
  });
  assert.equal(hand.kind, 'hand');
  assert.ok(hand.direction[1] < 0);

  const mouse = normalizeSpatialPointer({
    kind: 'mouse',
    clientX: 100,
    clientY: 100,
    viewport: { width: 200, height: 200 },
  });
  assert.equal(mouse.kind, 'mouse');
  assert.deepEqual(mouse.origin, [0, 0, 0]);
  assert.equal(mouse.direction.length, 3);
});

test('createSpatialDragController blocks fixed nodes by default and supports cancel', () => {
  const node = { id: 'fixed', fixed: true, position: [0, 0, -3], radius: 1 };
  const controller = createSpatialDragController();
  const pointer = { kind: 'ray', origin: [0, 0, 0], direction: [0, 0, -1] };

  assert.equal(controller.startDrag(node, pointer), null);

  const unlocked = createSpatialDragController({ allowFixedDrag: true });
  assert.equal(unlocked.startDrag(node, pointer).phase, 'start');

  const cancelRecord = unlocked.cancelDrag(pointer);
  assert.equal(cancelRecord.phase, 'cancel');
  assert.equal(cancelRecord.nodeId, 'fixed');
  assert.deepEqual(cancelRecord.pointer.kind, 'ray');
});

test('createSpatialDragController supports depth-lock drag mode', () => {
  const node = { id: 'depth', position: [0, 0, -5], radius: 1 };
  const controller = createSpatialDragController({ dragMode: 'depth-lock' });
  const startPointer = { kind: 'ray', origin: [0, 0, 0], direction: [0, 0, -1] };
  const movePointer = { kind: 'ray', origin: [0, 0, 0], direction: [0.2, 0, -1] };

  controller.startDrag(node, startPointer);
  const moveRecord = controller.moveDrag(movePointer);

  assert.equal(moveRecord.phase, 'move');
  assert.ok(moveRecord.position[0] > 0);
  assert.ok(Math.abs(Math.hypot(...moveRecord.position) - 5) < 1e-6);
  assert.equal(moveRecord.pointer.kind, 'ray');
});
