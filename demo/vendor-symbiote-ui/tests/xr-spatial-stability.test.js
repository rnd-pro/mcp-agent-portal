import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { verifyXRSpatialAuditEnvelope } from '../xr/spatial-evidence.js';
import { SpatialStabilityTracker, percentile } from '../xr/spatial-stability.js';
import { createSpatialObservation, createSpatialTarget } from './xr-spatial-fixtures.js';

function addWindow(tracker, count, options = {}) {
  let startSequence = options.startSequence ?? 1;
  let startTime = options.startTime ?? 100;
  let interval = options.interval ?? 26;
  for (let index = 0; index < count; index += 1) {
    let observation = createSpatialObservation({
      sequence: startSequence + index,
      time: startTime + index * interval,
      objectPosition: options.objectPosition?.(index),
      objectState: options.objectState?.(index),
    });
    tracker.addFrame(observation, { now: observation.frame.captureTime });
  }
  return tracker.getAudit();
}

test('percentile interpolates the stability p95 deterministically', () => {
  assert.equal(percentile([], 0.95), 0);
  assert.equal(percentile([42], 0.95), 42);
  assert.ok(Math.abs(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95) - 9.55) < 1e-12);
});

test('30 frames spanning at least 750ms produce a complete PASS audit', () => {
  let target = createSpatialTarget();
  let audit = addWindow(new SpatialStabilityTracker(target), 30);
  assert.equal(audit.runtimeVerdict, 'PASS');
  assert.equal(audit.stability.complete, true);
  assert.equal(audit.stability.frameCount, 30);
  assert.equal(audit.stability.durationMs, 754);
  assert.equal(audit.projections.axonometric.referenceOnly, true);
  assert.equal(audit.projections.axonometric.metric, false);
  assert.deepEqual(verifyXRSpatialAuditEnvelope(audit, {
    targetHash: target.contentHash,
    sessionId: 'session-1',
    rootCommitId: 'root-commit-1',
    runtimeVerdict: 'PASS',
    minimumFrameCount: 30,
    minimumDurationMs: 750,
    now: audit.observations.at(-1).frame.captureTime,
  }), { ok: true, reasons: [] });
});

test('audit verifier treats minimum frame and duration expectations as lower bounds', () => {
  let accepted = addWindow(new SpatialStabilityTracker(createSpatialTarget()), 31);
  assert.equal(verifyXRSpatialAuditEnvelope(accepted, {
    minimumFrameCount: 30,
    minimumDurationMs: 750,
  }).ok, true);

  let short = addWindow(new SpatialStabilityTracker(createSpatialTarget()), 29);
  let result = verifyXRSpatialAuditEnvelope(short, {
    minimumFrameCount: 30,
    minimumDurationMs: 750,
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('expected-minimumFrameCount-not-met'));
  assert.ok(result.reasons.includes('expected-minimumDurationMs-not-met'));
});

test('every accepted frame contributes to constraint and jitter verdicts', () => {
  let jitterAudit = addWindow(new SpatialStabilityTracker(createSpatialTarget()), 30, {
    objectPosition(index) {
      return [index % 2 === 0 ? -0.01 : 0.01, 0, -2];
    },
  });
  assert.equal(jitterAudit.objectResults[0].passed, true);
  assert.equal(jitterAudit.stability.objectMetrics[0].passed, false);
  assert.equal(jitterAudit.runtimeVerdict, 'FAIL');

  let constraintAudit = addWindow(new SpatialStabilityTracker(createSpatialTarget()), 30, {
    objectState(index) {
      return index === 14 ? 'fault' : 'ready';
    },
  });
  assert.equal(constraintAudit.constraintResults.find((result) => result.id === 'assembly-safe').passed, false);
  assert.equal(constraintAudit.runtimeVerdict, 'FAIL');
});

test('ineligible frame resets the window and retains reset evidence after recovery', () => {
  let target = createSpatialTarget();
  let tracker = new SpatialStabilityTracker(target);
  let first = createSpatialObservation({ sequence: 1, time: 100 });
  tracker.addFrame(first, { now: 100 });
  let gap = createSpatialObservation({ sequence: 3, time: 126 });
  let resetAudit = tracker.addFrame(gap, { now: 126 });
  assert.equal(resetAudit.runtimeVerdict, 'INVALID_EVIDENCE');
  assert.ok(resetAudit.eligibility.resetReasons.includes('sequence-gap'));
  assert.equal(resetAudit.eligibility.lastRejectedSample.frameId, gap.frame.id);

  let recovered = addWindow(tracker, 30, { startSequence: 4, startTime: 200 });
  assert.equal(recovered.runtimeVerdict, 'PASS');
  assert.ok(recovered.eligibility.resetReasons.includes('sequence-gap'));
  assert.equal(recovered.eligibility.lastRejectedSample.frameId, gap.frame.id);
  assert.equal(verifyXRSpatialAuditEnvelope(recovered).ok, true);
});

test('audit verifier rejects tampered aggregates and runtime verdicts', () => {
  let audit = addWindow(new SpatialStabilityTracker(createSpatialTarget()), 30);
  let tamperedErrors = structuredClone(audit);
  tamperedErrors.objectResults[0].maximumErrors.positionMeters = 0.5;
  assert.ok(verifyXRSpatialAuditEnvelope(tamperedErrors).reasons.includes('object-results-mismatch'));

  let tamperedVerdict = structuredClone(audit);
  tamperedVerdict.runtimeVerdict = 'FAIL';
  assert.ok(verifyXRSpatialAuditEnvelope(tamperedVerdict).reasons.includes('runtime-verdict-mismatch'));
});
