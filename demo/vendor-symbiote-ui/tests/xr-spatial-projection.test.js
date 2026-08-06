import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  projectAxonometric,
  projectFront,
  projectObservations,
  projectPointWebGL,
  projectRight,
  projectTop,
} from '../xr/spatial-projection.js';
import {
  XR_TEST_IDENTITY,
  XR_TEST_PROJECTION,
  createSpatialObservation,
  createSpatialTarget,
} from './xr-spatial-fixtures.js';

test('metric orthographic and nonmetric axonometric projections are deterministic', () => {
  let anchor = [1, 2, 3];
  let point = [2, 4, 1];
  assert.deepEqual(projectTop(point, anchor), { u: 1, v: 2 });
  assert.deepEqual(projectFront(point, anchor), { u: 1, v: -2 });
  assert.deepEqual(projectRight(point, anchor), { u: 2, v: -2 });
  let axonometric = projectAxonometric(point, anchor);
  assert.ok(Math.abs(axonometric.u - 3 * Math.sqrt(3) / 2) < 1e-12);
  assert.equal(axonometric.v, -2.5);
  assert.deepEqual(projectAxonometric(anchor, anchor), { u: 0, v: 0 });
});

test('WebGL projection returns explicit unavailable reasons', () => {
  let viewport = { x: 10, y: 20, width: 200, height: 100 };
  assert.deepEqual(projectPointWebGL([-0.5, 0.5, 0], XR_TEST_IDENTITY, XR_TEST_IDENTITY, viewport), {
    status: 'READY',
    reason: null,
    point: { x: 60, y: 45, depth: 0 },
  });
  assert.deepEqual(projectPointWebGL([0, 0, -2], [1, 2, 3], XR_TEST_PROJECTION, viewport), {
    status: 'UNAVAILABLE',
    reason: 'invalid-projection-matrix',
    point: null,
  });
  assert.equal(projectPointWebGL([0, 0, -2], XR_TEST_IDENTITY, XR_TEST_PROJECTION, {
    ...viewport,
    width: 0,
  }).reason, 'invalid-viewport');
  assert.equal(projectPointWebGL([0, 0, 2], XR_TEST_IDENTITY, XR_TEST_PROJECTION, viewport).reason, 'clip-w-non-positive');
  assert.equal(projectPointWebGL([0, 0, -0.05], XR_TEST_IDENTITY, XR_TEST_PROJECTION, viewport).reason, 'clip-depth-out-of-range');
});

test('projection envelope separates metric, stereo, and reference-only panes', () => {
  let target = createSpatialTarget();
  let observation = createSpatialObservation();
  let projections = projectObservations(target, observation);
  assert.equal(projections.orthographic.status, 'READY');
  assert.deepEqual(projections.orthographic.axes, {
    top: { horizontal: '+x', vertical: '-z' },
    front: { horizontal: '+x', vertical: '-y' },
    right: { horizontal: '-z', vertical: '-y' },
  });
  assert.equal(projections.stereo.status, 'READY');
  assert.equal(projections.axonometric.status, 'READY');
  assert.equal(projections.axonometric.referenceOnly, true);
  assert.equal(projections.axonometric.metric, false);
  assert.equal(projections.axonometric.target.length, 1);

  let missingRight = createSpatialObservation();
  missingRight.views = missingRight.views.filter((view) => view.eye === 'left');
  let partial = projectObservations(target, missingRight);
  assert.equal(partial.orthographic.status, 'READY');
  assert.equal(partial.axonometric.status, 'READY');
  assert.equal(partial.stereo.status, 'UNAVAILABLE');
  assert.equal(partial.stereo.reason, 'missing-right-view-evidence');

  let missingObject = createSpatialObservation();
  missingObject.objects[0].pose = null;
  let unavailable = projectObservations(target, missingObject);
  assert.equal(unavailable.orthographic.status, 'UNAVAILABLE');
  assert.equal(unavailable.axonometric.status, 'UNAVAILABLE');
  assert.equal(unavailable.axonometric.metric, false);
  assert.equal(unavailable.stereo.status, 'UNAVAILABLE');
});
