import {
  XR_SPATIAL_REASON,
  XR_SPATIAL_TOLERANCES,
  XR_SPATIAL_VERSIONS,
  freezeSpatialValue,
} from './spatial-contract.js';
import { checkSampleEligibility, evaluateSample, validateTarget } from './spatial-evidence.js';
import { distance, shortestAngle } from './spatial-math.js';
import { XR_SPATIAL_PROJECTION_VERSION, projectObservations } from './spatial-projection.js';

export function percentile(values, percentileValue) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  let sorted = [...values].sort((a, b) => a - b);
  let index = (sorted.length - 1) * percentileValue;
  let lower = Math.floor(index);
  let upper = Math.ceil(index);
  let weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function emptyProjections(reason) {
  return {
    version: XR_SPATIAL_PROJECTION_VERSION,
    orthographic: { status: 'UNAVAILABLE', reason, unit: 'meters', target: null, observed: null },
    axonometric: {
      status: 'UNAVAILABLE',
      reason,
      referenceOnly: true,
      metric: false,
      target: null,
      observed: null,
    },
    stereo: { status: 'UNAVAILABLE', reason, eyes: null },
  };
}

function aggregateObjectResults(target, observations, sampleResults) {
  return target.objects.map((targetObject) => {
    let samples = sampleResults.map((result, index) => ({
      frameId: observations[index].frame.id,
      ...result.objectResults.find((candidate) => candidate.id === targetObject.id),
    }));
    let maximumErrors = {};
    for (let key of ['positionMeters', 'orientationDegrees', 'cornerEdgeMeters', 'sizeMeters']) {
      maximumErrors[key] = Math.max(...samples.map((sample) => sample.errors[key]));
    }
    return {
      id: targetObject.id,
      passed: samples.every((sample) => sample.passed),
      maximumErrors,
      failedFrameIds: samples.filter((sample) => !sample.passed).map((sample) => sample.frameId),
    };
  });
}

function aggregateConstraintResults(target, observations, sampleResults) {
  return target.constraints.map((constraint) => {
    let samples = sampleResults.map((result, index) => {
      let sample = result.constraintResults.find((candidate) => candidate.id === constraint.id);
      return {
        frameId: observations[index].frame.id,
        passed: sample.passed,
        actual: sample.actual,
        limit: sample.limit,
      };
    });
    return {
      id: constraint.id,
      type: constraint.type,
      passed: samples.every((sample) => sample.passed),
      failedFrameIds: samples.filter((sample) => !sample.passed).map((sample) => sample.frameId),
      samples,
    };
  });
}

function objectStabilityMetrics(target, observations) {
  return target.objects.map((targetObject) => {
    let poses = observations.map((observation) => observation.objects.find((object) => object.id === targetObject.id).pose);
    let translationJitter = [];
    let rotationJitter = [];
    let translationDrift = [];
    let rotationDrift = [];
    for (let index = 0; index < poses.length; index += 1) {
      translationDrift.push(distance(poses[index].position, poses[0].position));
      rotationDrift.push(shortestAngle(poses[index].quaternion, poses[0].quaternion));
      if (index > 0) {
        translationJitter.push(distance(poses[index].position, poses[index - 1].position));
        rotationJitter.push(shortestAngle(poses[index].quaternion, poses[index - 1].quaternion));
      }
    }
    let metrics = {
      p95TranslationJitterMeters: percentile(translationJitter, 0.95),
      maximumTranslationDriftMeters: Math.max(...translationDrift, 0),
      p95RotationJitterDegrees: percentile(rotationJitter, 0.95),
      maximumRotationDriftDegrees: Math.max(...rotationDrift, 0),
    };
    return {
      id: targetObject.id,
      passed: (
        metrics.p95TranslationJitterMeters <= XR_SPATIAL_TOLERANCES.p95TranslationJitterMeters &&
        metrics.maximumTranslationDriftMeters <= XR_SPATIAL_TOLERANCES.maximumTranslationDriftMeters &&
        metrics.p95RotationJitterDegrees <= XR_SPATIAL_TOLERANCES.p95RotationJitterDegrees &&
        metrics.maximumRotationDriftDegrees <= XR_SPATIAL_TOLERANCES.maximumRotationDriftDegrees
      ),
      ...metrics,
    };
  });
}

function acceptedWindow(observations) {
  if (observations.length === 0) {
    return {
      frameCount: 0,
      durationMs: 0,
      firstFrameId: null,
      lastFrameId: null,
    };
  }
  let first = observations[0];
  let last = observations[observations.length - 1];
  return {
    frameCount: observations.length,
    durationMs: last.frame.time - first.frame.time,
    firstFrameId: first.frame.id,
    lastFrameId: last.frame.id,
  };
}

function summarizeRejectedSample(observation, reasons) {
  return {
    observationId: observation?.observationId || null,
    frameId: observation?.frame?.id || null,
    reasons: [...reasons],
  };
}

function buildReport(target, observations, resetReasons, lastRejectedSample) {
  let targetValidation = validateTarget(target);
  let window = acceptedWindow(observations);
  let complete = (
    window.frameCount >= XR_SPATIAL_TOLERANCES.minimumFrames &&
    window.durationMs >= XR_SPATIAL_TOLERANCES.minimumDurationMs
  );
  let objectResults = [];
  let constraintResults = [];
  let objectMetrics = [];
  let runtimeVerdict = targetValidation.valid ? 'INVALID_EVIDENCE' : 'NOT_EVALUATED';
  if (targetValidation.valid && observations.length > 0) {
    let sampleResults = observations.map((observation) => evaluateSample(target, observation));
    objectResults = aggregateObjectResults(target, observations, sampleResults);
    constraintResults = aggregateConstraintResults(target, observations, sampleResults);
    objectMetrics = objectStabilityMetrics(target, observations);
    if (complete) {
      runtimeVerdict = (
        objectResults.every((result) => result.passed) &&
        constraintResults.every((result) => result.passed) &&
        objectMetrics.every((result) => result.passed)
      ) ? 'PASS' : 'FAIL';
    }
  }
  let lastObservation = observations.at(-1) || null;
  return freezeSpatialValue({
    version: XR_SPATIAL_VERSIONS.audit,
    target,
    targetValidation: {
      verdict: targetValidation.valid ? 'VALID' : 'INVALID',
      reasons: targetValidation.reasons,
      errors: targetValidation.errors,
    },
    runtimeVerdict,
    eligibility: {
      resetReasons: [...resetReasons],
      lastRejectedSample,
      acceptedWindow: window,
    },
    observations,
    objectResults,
    constraintResults,
    stability: {
      complete,
      passed: complete && objectMetrics.every((result) => result.passed),
      minimumFrames: XR_SPATIAL_TOLERANCES.minimumFrames,
      minimumDurationMs: XR_SPATIAL_TOLERANCES.minimumDurationMs,
      frameCount: window.frameCount,
      durationMs: window.durationMs,
      objectMetrics,
    },
    projections: lastObservation ? projectObservations(target, lastObservation) : emptyProjections('missing-observation'),
  });
}

export class SpatialStabilityTracker {
  constructor(target) {
    this.target = freezeSpatialValue(target);
    this.observations = [];
    this.resetReasons = [];
    this.lastRejectedSample = null;
    this.report = buildReport(this.target, this.observations, this.resetReasons, this.lastRejectedSample);
  }

  reset(reasons, observation = null) {
    let resetReasons = Array.isArray(reasons) ? reasons : [reasons || XR_SPATIAL_REASON.invalidObservation];
    this.observations = [];
    this.resetReasons = [...resetReasons];
    this.lastRejectedSample = summarizeRejectedSample(observation, resetReasons);
    this.report = buildReport(this.target, this.observations, this.resetReasons, this.lastRejectedSample);
    return this.report;
  }

  addFrame(observation, options = {}) {
    let previousObservation = this.observations.at(-1) || null;
    let eligibility = checkSampleEligibility(this.target, observation, {
      previousObservation,
      now: options.now,
    });
    if (!eligibility.eligible) return this.reset(eligibility.reasons, observation);
    this.observations.push(freezeSpatialValue(observation));
    this.report = buildReport(this.target, this.observations, this.resetReasons, this.lastRejectedSample);
    return this.report;
  }

  getAudit() {
    return this.report;
  }
}

export function buildAuditReport(target, tracker) {
  if (!(tracker instanceof SpatialStabilityTracker)) {
    throw new TypeError('buildAuditReport requires a SpatialStabilityTracker.');
  }
  if (tracker.target.contentHash !== target?.contentHash) {
    throw new RangeError('Tracker target does not match the requested audit target.');
  }
  return tracker.getAudit();
}
