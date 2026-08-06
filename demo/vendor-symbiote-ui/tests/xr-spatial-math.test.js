import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  eulerToQuaternion,
  getAABBForOBB,
  getOBBWorldCorners,
  invertMatrix,
  makeTransform,
  makeTransformEuler,
  makeTranslation,
  multiplyMatrices,
  multiplyMatrixVector,
  multiplyMatrixVector4,
  normalizeQuaternion,
  normalizeVector,
  poseFromMatrix,
  relativeMatrix,
  shortestAngle,
} from '../xr/spatial-math.js';

function closeTo(actual, expected, tolerance = 1e-9) {
  assert.equal(actual.length, expected.length);
  for (let index = 0; index < actual.length; index += 1) {
    assert.ok(Math.abs(actual[index] - expected[index]) <= tolerance, `${actual[index]} != ${expected[index]}`);
  }
}

test('column-major transforms preserve WebXR vector convention', () => {
  let translation = makeTranslation(1, 2, 3);
  assert.deepEqual(multiplyMatrixVector(translation, [4, 5, 6]), [5, 7, 9]);
  assert.deepEqual(multiplyMatrixVector4(translation, [4, 5, 6, 0]), [4, 5, 6, 0]);

  let rotationAndTranslation = makeTransformEuler([1, 2, 3], Math.PI / 2, 0, 0);
  closeTo(multiplyMatrixVector(rotationAndTranslation, [0, 1, 0]), [1, 2, 4]);

  let world = makeTranslation(10, 2, -3);
  let root = makeTranslation(10, 0, 0);
  assert.deepEqual(relativeMatrix(root, world), makeTranslation(0, 2, -3));
  closeTo(multiplyMatrices(invertMatrix(root), world), makeTranslation(0, 2, -3));
});

test('invalid homogeneous and normalization inputs fail closed', () => {
  assert.equal(normalizeVector([0, 0, 0]), null);
  assert.equal(normalizeQuaternion([0, 0, 0, 0]), null);
  assert.equal(invertMatrix(new Array(16).fill(0)), null);
  assert.throws(
    () => multiplyMatrixVector(new Array(16).fill(0), [1, 2, 3]),
    /invalid homogeneous coordinate/,
  );
  assert.throws(() => multiplyMatrices([1, 2, 3], makeTranslation(0, 0, 0)), TypeError);
});

test('quaternion round trips and shortest-angle handling are deterministic', () => {
  let quaternion = eulerToQuaternion(0.2, -0.4, 0.6);
  let matrix = makeTransform([1, 2, 3], quaternion);
  let pose = poseFromMatrix(matrix);
  closeTo(pose.position, [1, 2, 3]);
  assert.ok(shortestAngle(quaternion, pose.quaternion) < 1e-6);
  assert.ok(shortestAngle([0, 0, 0, 1], [0, 0, Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)]) - 30 < 1e-9);
  assert.ok(shortestAngle(quaternion, quaternion.map((value) => -value)) < 1e-6);
});

test('OBB corners and enclosing AABB retain ordered metric dimensions', () => {
  let corners = getOBBWorldCorners([10, 10, 10], [0, 0, 0, 1], [2, 4, 6]);
  assert.equal(corners.length, 8);
  assert.deepEqual(getAABBForOBB([10, 10, 10], [0, 0, 0, 1], [2, 4, 6]), {
    min: [9, 8, 7],
    max: [11, 12, 13],
    center: [10, 10, 10],
    size: [2, 4, 6],
  });
  assert.throws(() => getOBBWorldCorners([0, 0, 0], [0, 0, 0, 1], [1, 0, 1]), TypeError);
});
