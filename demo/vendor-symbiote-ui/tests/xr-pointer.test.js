import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createXRHitMap,
  createXRPlacementReceipt,
  createXRTrustedSelectReceipt,
  hitTestXRPanel,
  resolveXRHitMap,
  verifyXRPlacementReceipt,
  verifyXRTrustedSelectReceipt,
} from '../xr/pointer.js';
import { eulerToQuaternion, makeTransform } from '../xr/spatial-math.js';
import {
  createHitMapDescriptor,
  createInteractionPhase,
  createPlacementPhase,
} from './xr-spatial-fixtures.js';

test('panel ray intersection supports full three-axis panel rotation', () => {
  let hit = hitTestXRPanel({ origin: [0, 0, 0], direction: [0, 0, -1] }, {
    id: 'panel-1',
    position: [0, 0, -2],
    rotation: [10, 35, -5],
    size: [2, 1],
  });
  assert.equal(hit.panelId, 'panel-1');
  assert.ok(hit.distance > 0);
  assert.ok(hit.point.x >= 0 && hit.point.x <= 1);
  assert.ok(hit.point.y >= 0 && hit.point.y <= 1);
});

test('immutable hit maps reject stale or mismatched panel evidence', () => {
  let hitMap = createXRHitMap(createHitMapDescriptor());
  assert.equal(Object.isFrozen(hitMap), true);
  assert.equal(Object.isFrozen(hitMap.targets[0]), true);
  let options = {
    panelId: 'panel-1',
    contentHash: 'sha256:panel-content',
    revision: 7,
    sessionId: 'session-1',
    frame: { id: 'session-1:1:11', sequence: 11, time: 120 },
  };
  let resolved = resolveXRHitMap({ x: 0.2, y: 0.2 }, hitMap, options);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.target.id, 'replace-action');
  assert.deepEqual(resolved.contentPoint, { x: 200, y: 120 });

  assert.equal(resolveXRHitMap({ x: 0.2, y: 0.2 }, hitMap, {
    ...options,
    contentHash: 'different-content',
  }).reason, 'content-hash-mismatch');
  assert.equal(resolveXRHitMap({ x: 0.2, y: 0.2 }, hitMap, {
    ...options,
    frame: { id: 'session-1:1:20', sequence: 20, time: 300 },
  }).reason, 'stale-hit-map');
  assert.equal(resolveXRHitMap({ x: 0.9, y: 0.9 }, hitMap, options).reason, 'target-not-found');
  assert.throws(() => createXRHitMap({ ...createHitMapDescriptor(), revision: -1 }), TypeError);
  let nested = createHitMapDescriptor();
  nested.targets[0].targets = [];
  assert.throws(() => createXRHitMap(nested), TypeError);
});

test('trusted panel select receipt binds exact start/end content evidence', () => {
  let start = createInteractionPhase('selectstart');
  let end = createInteractionPhase('selectend');
  let receipt = createXRTrustedSelectReceipt(start, end);
  assert.equal(Object.isFrozen(receipt), true);
  assert.deepEqual(verifyXRTrustedSelectReceipt(receipt, {
    sessionId: 'session-1',
    inputSourceId: 'controller-right',
    panelId: 'panel-1',
    targetId: 'replace-action',
    revision: 7,
    now: 120,
    maximumAgeMs: 50,
    frameSequence: 11,
    maximumFrameAge: 1,
  }), { ok: true, reasons: [] });

  let changedRevision = structuredClone(receipt);
  changedRevision.selectEnd.revision = 8;
  assert.equal(verifyXRTrustedSelectReceipt(changedRevision).ok, false);
  assert.throws(() => createXRTrustedSelectReceipt(start, {
    ...end,
    contentHash: 'different-content',
  }), RangeError);
});

test('pre-root placement receipt verifies current hit pose without panel or root fields', () => {
  let start = createPlacementPhase('selectstart');
  let end = createPlacementPhase('selectend');
  let receipt = createXRPlacementReceipt(start, end);
  assert.equal(Object.hasOwn(receipt, 'panelId'), false);
  assert.equal(Object.hasOwn(receipt, 'rootCommitId'), false);
  assert.equal(Object.hasOwn(receipt, 'spatialTargetHash'), false);
  assert.deepEqual(verifyXRPlacementReceipt(receipt, {
    sessionId: 'session-1',
    referenceSpaceId: 'reference-space-1',
    inputSourceId: 'controller-right',
    now: 120,
    frameSequence: 11,
    minimumHoldMs: 10,
    maximumHitDriftMeters: 0.02,
    maximumNormalChangeDegrees: 1,
  }), { ok: true, reasons: [] });

  assert.ok(verifyXRPlacementReceipt(receipt, {
    sessionId: 'session-1',
    frameSequence: 11,
  }).reasons.includes('placement-current-time-required'));
  assert.ok(verifyXRPlacementReceipt(receipt, {
    sessionId: 'different-session',
    now: 120,
    frameSequence: 11,
  }).reasons.includes('expected-sessionId-mismatch'));

  let driftedEnd = createPlacementPhase('selectend');
  driftedEnd.hitPose = {
    matrix: makeTransform([1.2, 0, -1], [0, 0, 0, 1]),
    pose: { position: [1.2, 0, -1], quaternion: [0, 0, 0, 1] },
  };
  let driftedReceipt = createXRPlacementReceipt(start, driftedEnd);
  assert.ok(verifyXRPlacementReceipt(driftedReceipt, {
    sessionId: 'session-1',
    now: 120,
    frameSequence: 11,
  }).reasons.includes('placement-hit-drift-exceeded'));

  let tiltedEnd = createPlacementPhase('selectend');
  let quaternion = eulerToQuaternion(Math.PI / 6, 0, 0);
  tiltedEnd.hitPose = {
    matrix: makeTransform([1.01, 0, -1], quaternion),
    pose: { position: [1.01, 0, -1], quaternion },
  };
  tiltedEnd.surfaceNormal = [0, Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)];
  let tiltedReceipt = createXRPlacementReceipt(start, tiltedEnd);
  assert.ok(verifyXRPlacementReceipt(tiltedReceipt, {
    sessionId: 'session-1',
    now: 120,
    frameSequence: 11,
  }).reasons.includes('placement-normal-change-exceeded'));
});
