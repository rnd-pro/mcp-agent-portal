import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { XR_SPATIAL_REASON } from '../xr/spatial-contract.js';
import {
  checkSampleEligibility,
  evaluateSample,
  validateTarget,
} from '../xr/spatial-evidence.js';
import { SpatialStabilityTracker } from '../xr/spatial-stability.js';
import { createSpatialObservation, createSpatialTarget } from './xr-spatial-fixtures.js';

test('target validation enforces exact typed constraints and approved provenance', () => {
  assert.deepEqual(validateTarget(createSpatialTarget()), { valid: true, reasons: [], errors: [] });

  let malformedConstraint = createSpatialTarget();
  malformedConstraint.constraints[0].expectedCoordinate = '-2';
  assert.equal(validateTarget(malformedConstraint).valid, false);

  let missingReference = createSpatialTarget();
  missingReference.constraints[0].objectId = 'unknown-object';
  assert.equal(validateTarget(missingReference).valid, false);

  let invalidApprovedProvenance = createSpatialTarget();
  invalidApprovedProvenance.provenance.commitId = 'unexpected-commit';
  assert.equal(validateTarget(invalidApprovedProvenance).valid, false);

  let duplicateObject = createSpatialTarget();
  duplicateObject.objects.push(structuredClone(duplicateObject.objects[0]));
  assert.ok(validateTarget(duplicateObject).reasons.includes(XR_SPATIAL_REASON.duplicateObjectId));
});

test('sample eligibility requires same-frame stereo, interaction proof, and an explicit clock', () => {
  let target = createSpatialTarget();
  let observation = createSpatialObservation({ sequence: 1, time: 100 });
  assert.deepEqual(checkSampleEligibility(target, observation, { now: 100 }), {
    eligible: true,
    reasons: [],
  });
  assert.ok(checkSampleEligibility(target, observation).reasons.includes(XR_SPATIAL_REASON.staleTimestamp));

  let gazeOnly = createSpatialObservation();
  gazeOnly.inputs[0].kind = 'gaze';
  assert.ok(checkSampleEligibility(target, gazeOnly, { now: gazeOnly.frame.captureTime }).reasons.includes(
    XR_SPATIAL_REASON.missingInputProof,
  ));

  let missingEye = createSpatialObservation();
  missingEye.views.pop();
  assert.ok(checkSampleEligibility(target, missingEye, { now: missingEye.frame.captureTime }).reasons.includes(
    XR_SPATIAL_REASON.missingView,
  ));

  let mixedFrame = createSpatialObservation();
  mixedFrame.views[0].frameId = 'different-frame';
  assert.ok(checkSampleEligibility(target, mixedFrame, { now: mixedFrame.frame.captureTime }).reasons.includes(
    XR_SPATIAL_REASON.mixedFrame,
  ));

  let activeGrab = createSpatialObservation({
    activeGrab: { active: true, sourceId: 'controller-right', objectId: 'assembly' },
  });
  assert.ok(checkSampleEligibility(target, activeGrab, { now: activeGrab.frame.captureTime }).reasons.includes(
    XR_SPATIAL_REASON.activeGrab,
  ));
});

test('malformed targets fail eligibility, evaluation, and stability closed', () => {
  let target = createSpatialTarget();
  delete target.objects;
  let observation = createSpatialObservation({ sequence: 1, time: 100 });

  assert.deepEqual(checkSampleEligibility(target, observation, { now: 100 }), {
    eligible: false,
    reasons: [XR_SPATIAL_REASON.invalidTarget],
  });
  assert.deepEqual(evaluateSample(target, observation), {
    eligible: false,
    passed: false,
    reasons: [XR_SPATIAL_REASON.invalidTarget],
    objectResults: [],
    constraintResults: [],
  });

  let tracker = new SpatialStabilityTracker(target);
  let audit = tracker.addFrame(observation, { now: 100 });
  assert.equal(audit.targetValidation.verdict, 'INVALID');
  assert.equal(audit.runtimeVerdict, 'NOT_EVALUATED');
  assert.deepEqual(audit.eligibility.resetReasons, [XR_SPATIAL_REASON.invalidTarget]);
  assert.deepEqual(audit.objectResults, []);
  assert.deepEqual(audit.constraintResults, []);
  assert.deepEqual(audit.stability.objectMetrics, []);
});

test('sample continuity rejects sequence gaps and changed root commitments', () => {
  let target = createSpatialTarget();
  let first = createSpatialObservation({ sequence: 1, time: 100 });
  let gap = createSpatialObservation({ sequence: 3, time: 126 });
  let gapResult = checkSampleEligibility(target, gap, { previousObservation: first, now: 126 });
  assert.ok(gapResult.reasons.includes(XR_SPATIAL_REASON.sequenceGap));

  let changedRoot = createSpatialObservation({ sequence: 2, time: 126 });
  changedRoot.root.commitId = 'root-commit-2';
  let rootResult = checkSampleEligibility(target, changedRoot, { previousObservation: first, now: 126 });
  assert.ok(rootResult.reasons.includes(XR_SPATIAL_REASON.rootCommitMismatch));

  let resetReference = createSpatialObservation({ sequence: 2, time: 126, resetEpoch: 2 });
  let resetResult = checkSampleEligibility(target, resetReference, { previousObservation: first, now: 126 });
  assert.ok(resetResult.reasons.includes(XR_SPATIAL_REASON.referenceEpochMismatch));
});

test('sample evaluation applies object and typed constraint tolerances', () => {
  let target = createSpatialTarget();
  let matching = evaluateSample(target, createSpatialObservation());
  assert.equal(matching.eligible, true);
  assert.equal(matching.passed, true);
  assert.equal(matching.objectResults[0].passed, true);
  assert.ok(matching.constraintResults.every((result) => result.passed));

  let displaced = evaluateSample(target, createSpatialObservation({ objectPosition: [0.03, 0, -2] }));
  assert.equal(displaced.eligible, true);
  assert.equal(displaced.passed, false);
  assert.equal(displaced.objectResults[0].checks.position, false);

  let unsafe = evaluateSample(target, createSpatialObservation({ objectState: 'fault' }));
  assert.equal(unsafe.passed, false);
  assert.equal(unsafe.constraintResults.find((result) => result.id === 'assembly-safe').passed, false);
});
