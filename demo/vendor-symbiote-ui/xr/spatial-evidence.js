import {
  XR_SPATIAL_REASON,
  XR_SPATIAL_TOLERANCES,
  XR_SPATIAL_TRANSFORM_CONVENTION,
  XR_SPATIAL_VERSIONS,
} from './spatial-contract.js';
import {
  distance,
  getAABBFromCorners,
  getOBBWorldCorners,
  isFiniteMatrix4,
  isFiniteVector,
  isNormalizedQuaternion,
  makeTransform,
  maximumCornerEdgeError,
  shortestAngle,
} from './spatial-math.js';
import { projectObservations } from './spatial-projection.js';

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function recordError(errors, code, path) {
  if (!errors.some((error) => error.code === code && error.path === path)) {
    errors.push({ code, path });
  }
}

function sameRecord(actual, expected) {
  if (!actual || typeof actual !== 'object') return false;
  let expectedKeys = Object.keys(expected);
  return Object.keys(actual).length === expectedKeys.length && expectedKeys.every((key) => actual[key] === expected[key]);
}

function hasExactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  let actual = Object.keys(value).sort();
  let expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function sameMatrix(a, b, tolerance = 1e-6) {
  return isFiniteMatrix4(a) && isFiniteMatrix4(b) && a.every((value, index) => Math.abs(value - b[index]) <= tolerance);
}

function validPose(pose) {
  return Boolean(
    pose &&
    hasExactKeys(pose, ['position', 'quaternion']) &&
    isFiniteVector(pose.position, 3) &&
    isNormalizedQuaternion(pose.quaternion)
  );
}

function validPoseMatrix(matrix, pose) {
  return validPose(pose) && sameMatrix(matrix, makeTransform(pose.position, pose.quaternion));
}

function validSize(size) {
  return isFiniteVector(size, 3) && size.every((value) => value > 0);
}

function validateTargetProvenance(provenance, errors) {
  if (
    !hasExactKeys(provenance, ['kind', 'sourceId', 'commitId', 'derivedFromHash']) ||
    !['approved', 'committed'].includes(provenance.kind) ||
    !nonEmptyString(provenance.sourceId)
  ) {
    recordError(errors, XR_SPATIAL_REASON.missingProvenance, 'provenance');
    return;
  }
  if (provenance.kind === 'approved' && (provenance.commitId !== null || provenance.derivedFromHash !== null)) {
    recordError(errors, XR_SPATIAL_REASON.invalidTarget, 'provenance');
  }
  if (provenance.kind === 'committed' && (!nonEmptyString(provenance.commitId) || !nonEmptyString(provenance.derivedFromHash))) {
    recordError(errors, XR_SPATIAL_REASON.invalidTarget, 'provenance');
  }
}

function validateConstraint(constraint, objectIds, errors, index) {
  let path = `constraints.${index}`;
  if (!constraint || !nonEmptyString(constraint.id)) {
    recordError(errors, XR_SPATIAL_REASON.invalidTarget, path);
    return;
  }
  let references = [];
  if (constraint.type === 'datum') {
    references = [constraint.objectId];
    if (
      !hasExactKeys(constraint, ['id', 'type', 'objectId', 'axis', 'expectedCoordinate', 'tolerance']) ||
      !['x', 'y', 'z'].includes(constraint.axis) ||
      !Number.isFinite(constraint.expectedCoordinate) ||
      !Number.isFinite(constraint.tolerance) || constraint.tolerance < 0
    ) recordError(errors, XR_SPATIAL_REASON.invalidTarget, path);
  } else if (constraint.type === 'alignment') {
    references = [constraint.objectAId, constraint.objectBId];
    if (
      !hasExactKeys(constraint, ['id', 'type', 'objectAId', 'objectBId', 'axis', 'expectedOffset', 'tolerance']) ||
      !['x', 'y', 'z'].includes(constraint.axis) ||
      !Number.isFinite(constraint.expectedOffset) ||
      !Number.isFinite(constraint.tolerance) || constraint.tolerance < 0
    ) recordError(errors, XR_SPATIAL_REASON.invalidTarget, path);
  } else if (constraint.type === 'clearance') {
    references = [constraint.objectAId, constraint.objectBId];
    if (
      !hasExactKeys(constraint, ['id', 'type', 'objectAId', 'objectBId', 'minimumDistance']) ||
      !Number.isFinite(constraint.minimumDistance) || constraint.minimumDistance < 0
    ) {
      recordError(errors, XR_SPATIAL_REASON.invalidTarget, path);
    }
  } else if (constraint.type === 'containment') {
    references = [constraint.innerObjectId, constraint.outerObjectId];
    if (
      !hasExactKeys(constraint, ['id', 'type', 'innerObjectId', 'outerObjectId', 'margin']) ||
      !Number.isFinite(constraint.margin) || constraint.margin < 0
    ) {
      recordError(errors, XR_SPATIAL_REASON.invalidTarget, path);
    }
  } else if (constraint.type === 'safety-state') {
    references = [constraint.objectId];
    if (
      !hasExactKeys(constraint, ['id', 'type', 'objectId', 'requiredState']) ||
      !nonEmptyString(constraint.requiredState)
    ) recordError(errors, XR_SPATIAL_REASON.invalidTarget, path);
  }
  else {
    recordError(errors, XR_SPATIAL_REASON.invalidTarget, `${path}.type`);
    return;
  }
  if (references.some((id) => !nonEmptyString(id) || !objectIds.has(id))) {
    recordError(errors, XR_SPATIAL_REASON.invalidTarget, path);
  }
}

export function validateTarget(target) {
  let errors = [];
  if (!target || typeof target !== 'object') {
    recordError(errors, XR_SPATIAL_REASON.invalidTarget, 'target');
    return { valid: false, reasons: [XR_SPATIAL_REASON.invalidTarget], errors };
  }
  if (target.version !== XR_SPATIAL_VERSIONS.target) {
    recordError(errors, XR_SPATIAL_REASON.unsupportedVersion, 'version');
  }
  if (!hasExactKeys(target, [
    'version',
    'targetId',
    'contentHash',
    'provenance',
    'units',
    'transformConvention',
    'tolerances',
    'requiredEvidenceProfile',
    'objects',
    'constraints',
  ])) recordError(errors, XR_SPATIAL_REASON.invalidTarget, 'target');
  for (let [path, value] of [['targetId', target.targetId], ['contentHash', target.contentHash]]) {
    if (!nonEmptyString(value)) recordError(errors, XR_SPATIAL_REASON.invalidTarget, path);
  }
  validateTargetProvenance(target.provenance, errors);
  if (target.units !== 'meters') recordError(errors, XR_SPATIAL_REASON.invalidTarget, 'units');
  if (!sameRecord(target.transformConvention, XR_SPATIAL_TRANSFORM_CONVENTION)) {
    recordError(errors, XR_SPATIAL_REASON.invalidTarget, 'transformConvention');
  }
  if (!sameRecord(target.tolerances, XR_SPATIAL_TOLERANCES)) {
    recordError(errors, XR_SPATIAL_REASON.invalidTarget, 'tolerances');
  }
  let profile = target.requiredEvidenceProfile;
  if (
    !profile ||
    !hasExactKeys(profile, ['profileId', 'stereoRequired', 'inputProof', 'maximumSampleAgeMs']) ||
    !nonEmptyString(profile.profileId) ||
    profile.stereoRequired !== true ||
    !['captured-only', 'interaction-proof'].includes(profile.inputProof) ||
    !Number.isFinite(profile.maximumSampleAgeMs) ||
    profile.maximumSampleAgeMs <= 0
  ) {
    recordError(errors, XR_SPATIAL_REASON.invalidTarget, 'requiredEvidenceProfile');
  }
  if (!Array.isArray(target.objects) || target.objects.length === 0) {
    recordError(errors, XR_SPATIAL_REASON.invalidTarget, 'objects');
  }
  let objectIds = new Set();
  for (let [index, object] of (target.objects || []).entries()) {
    let path = `objects.${index}`;
    if (!hasExactKeys(object, ['id', 'expectedPose', 'expectedMatrix', 'size'])) {
      recordError(errors, XR_SPATIAL_REASON.invalidTarget, path);
    }
    if (!nonEmptyString(object?.id)) recordError(errors, XR_SPATIAL_REASON.invalidTarget, `${path}.id`);
    if (objectIds.has(object?.id)) recordError(errors, XR_SPATIAL_REASON.duplicateObjectId, `${path}.id`);
    objectIds.add(object?.id);
    if (!validPose(object?.expectedPose)) recordError(errors, XR_SPATIAL_REASON.invalidQuaternion, `${path}.expectedPose`);
    if (!validPoseMatrix(object?.expectedMatrix, object?.expectedPose)) recordError(errors, XR_SPATIAL_REASON.invalidMatrix, `${path}.expectedMatrix`);
    if (!validSize(object?.size)) recordError(errors, XR_SPATIAL_REASON.missingObjectSize, `${path}.size`);
  }
  if (!Array.isArray(target.constraints)) recordError(errors, XR_SPATIAL_REASON.invalidTarget, 'constraints');
  let constraintIds = new Set();
  for (let [index, constraint] of (target.constraints || []).entries()) {
    if (constraintIds.has(constraint?.id)) recordError(errors, XR_SPATIAL_REASON.invalidTarget, `constraints.${index}.id`);
    constraintIds.add(constraint?.id);
    validateConstraint(constraint, objectIds, errors, index);
  }
  let reasons = [...new Set(errors.map((error) => error.code))];
  return { valid: errors.length === 0, reasons, errors };
}

function validObservationProvenance(provenance) {
  return Boolean(
    provenance &&
    nonEmptyString(provenance.runtimeId) &&
    nonEmptyString(provenance.runtimeVersion) &&
    nonEmptyString(provenance.appId) &&
    nonEmptyString(provenance.buildHash) &&
    nonEmptyString(provenance.deviceId) &&
    ['headset', 'desktop', 'emulator'].includes(provenance.deviceKind) &&
    ['native', 'iwer', 'none'].includes(provenance.emulation)
  );
}

function addReason(reasons, reason) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function validateFrameMembers(observation, reasons) {
  let frameId = observation.frame?.id;
  for (let view of observation.views || []) {
    if (view?.frameId !== frameId) addReason(reasons, XR_SPATIAL_REASON.mixedFrame);
  }
  for (let object of observation.objects || []) {
    if (object?.frameId !== frameId) addReason(reasons, XR_SPATIAL_REASON.mixedFrame);
  }
  for (let input of observation.inputs || []) {
    if (input?.frameId !== frameId) addReason(reasons, XR_SPATIAL_REASON.mixedFrame);
  }
}

function validateViews(observation, target, reasons) {
  if (!Array.isArray(observation.views) || observation.views.length !== 2) {
    addReason(reasons, XR_SPATIAL_REASON.missingView);
    return;
  }
  let eyes = observation.views.map((view) => view?.eye);
  if (new Set(eyes).size !== eyes.length) addReason(reasons, XR_SPATIAL_REASON.duplicateEye);
  if (!eyes.includes('left') || !eyes.includes('right')) addReason(reasons, XR_SPATIAL_REASON.missingView);
  for (let view of observation.views) {
    if (!isFiniteMatrix4(view?.viewMatrix) || !isFiniteMatrix4(view?.projectionMatrix)) {
      addReason(reasons, XR_SPATIAL_REASON.invalidProjection);
    }
    let viewport = view?.viewport;
    if (
      !viewport ||
      ![viewport.x, viewport.y, viewport.width, viewport.height].every(Number.isFinite) ||
      viewport.x < 0 || viewport.y < 0 || viewport.width <= 0 || viewport.height <= 0
    ) {
      addReason(reasons, XR_SPATIAL_REASON.invalidViewport);
    }
  }
  if (target.requiredEvidenceProfile?.stereoRequired && observation.views.length !== 2) {
    addReason(reasons, XR_SPATIAL_REASON.missingView);
  }
}

function validateObjects(observation, target, reasons) {
  if (!Array.isArray(observation.objects)) {
    addReason(reasons, XR_SPATIAL_REASON.objectSetMismatch);
    return;
  }
  let expectedIds = target.objects.map((object) => object.id).sort();
  let observedIds = observation.objects.map((object) => object?.id).sort();
  if (new Set(observedIds).size !== observedIds.length) addReason(reasons, XR_SPATIAL_REASON.duplicateObjectId);
  if (expectedIds.length !== observedIds.length || expectedIds.some((id, index) => id !== observedIds[index])) {
    addReason(reasons, XR_SPATIAL_REASON.objectSetMismatch);
  }
  for (let object of observation.objects) {
    if (!object?.visible) addReason(reasons, XR_SPATIAL_REASON.objectInvisible);
    if (!validPose(object?.pose)) addReason(reasons, XR_SPATIAL_REASON.missingObjectPose);
    if (!validPoseMatrix(object?.matrix, object?.pose)) addReason(reasons, XR_SPATIAL_REASON.invalidMatrix);
    if (!validSize(object?.size)) addReason(reasons, XR_SPATIAL_REASON.missingObjectSize);
  }
}

function validateInputs(observation, target, reasons) {
  if (!Array.isArray(observation.inputs)) {
    addReason(reasons, XR_SPATIAL_REASON.missingInputProof);
    return;
  }
  let interactionInputs = observation.inputs.filter((input) => (
    ['controller', 'hand'].includes(input?.kind) &&
    nonEmptyString(input?.sourceId) &&
    isFiniteMatrix4(input?.targetRay?.matrix) &&
    isFiniteVector(input?.targetRay?.origin, 3) &&
    isFiniteVector(input?.targetRay?.direction, 3)
  ));
  if (target.requiredEvidenceProfile?.inputProof === 'interaction-proof' && interactionInputs.length === 0) {
    addReason(reasons, XR_SPATIAL_REASON.missingInputProof);
  }
  for (let input of observation.inputs) {
    if (!nonEmptyString(input?.sourceId)) addReason(reasons, XR_SPATIAL_REASON.missingInputSource);
    if (!['controller', 'hand', 'gaze', 'screen'].includes(input?.kind)) addReason(reasons, XR_SPATIAL_REASON.missingInputProof);
    if (!['left', 'right', 'none'].includes(input?.handedness) || !Array.isArray(input?.profiles)) {
      addReason(reasons, XR_SPATIAL_REASON.missingInputProof);
    }
    if (input?.targetRay !== null && (
      !isFiniteMatrix4(input?.targetRay?.matrix) ||
      !isFiniteVector(input?.targetRay?.origin, 3) ||
      !isFiniteVector(input?.targetRay?.direction, 3)
    )) {
      addReason(reasons, XR_SPATIAL_REASON.missingInputProof);
    }
    if (input?.grip !== null && !isFiniteMatrix4(input?.grip?.matrix)) {
      addReason(reasons, XR_SPATIAL_REASON.invalidMatrix);
    }
  }
}

function validateContinuity(previous, observation, reasons) {
  if (!previous) return;
  if (observation.session?.id !== previous.session?.id) addReason(reasons, XR_SPATIAL_REASON.sessionMismatch);
  if (observation.referenceSpace?.id !== previous.referenceSpace?.id || observation.referenceSpace?.type !== previous.referenceSpace?.type) {
    addReason(reasons, XR_SPATIAL_REASON.referenceSpaceMismatch);
  }
  if (observation.referenceSpace?.resetEpoch !== previous.referenceSpace?.resetEpoch) {
    addReason(reasons, XR_SPATIAL_REASON.referenceEpochMismatch);
  }
  if (observation.root?.id !== previous.root?.id) addReason(reasons, XR_SPATIAL_REASON.rootMismatch);
  if (observation.root?.commitId !== previous.root?.commitId) addReason(reasons, XR_SPATIAL_REASON.rootCommitMismatch);
  let sequence = observation.frame?.sequence;
  let previousSequence = previous.frame?.sequence;
  if (sequence === previousSequence) addReason(reasons, XR_SPATIAL_REASON.duplicateSequence);
  else if (sequence < previousSequence) addReason(reasons, XR_SPATIAL_REASON.outOfOrderSequence);
  else if (sequence !== previousSequence + 1) addReason(reasons, XR_SPATIAL_REASON.sequenceGap);
  if (
    observation.frame?.time <= previous.frame?.time ||
    observation.frame?.predictedDisplayTime <= previous.frame?.predictedDisplayTime ||
    observation.frame?.captureTime <= previous.frame?.captureTime
  ) {
    addReason(reasons, XR_SPATIAL_REASON.nonMonotonicTime);
  }
}

export function checkSampleEligibility(target, observation, context = {}) {
  let reasons = [];
  let targetValidation = validateTarget(target);
  if (!targetValidation.valid) {
    return { eligible: false, reasons: [XR_SPATIAL_REASON.invalidTarget] };
  }
  if (!observation || typeof observation !== 'object') {
    addReason(reasons, XR_SPATIAL_REASON.invalidObservation);
    return { eligible: false, reasons };
  }
  if (observation.version !== XR_SPATIAL_VERSIONS.observation) addReason(reasons, XR_SPATIAL_REASON.unsupportedVersion);
  if (observation.targetHash !== target?.contentHash) addReason(reasons, XR_SPATIAL_REASON.targetHashMismatch);
  if (!nonEmptyString(observation.observationId) || !validObservationProvenance(observation.provenance)) {
    addReason(reasons, XR_SPATIAL_REASON.missingProvenance);
  }
  if (!nonEmptyString(observation.session?.id) || !['immersive-ar', 'immersive-vr', 'inline'].includes(observation.session?.mode)) {
    addReason(reasons, XR_SPATIAL_REASON.invalidObservation);
  }
  if (observation.session?.visibility === 'hidden') addReason(reasons, XR_SPATIAL_REASON.hidden);
  if (observation.session?.visibility === 'visible-blurred') addReason(reasons, XR_SPATIAL_REASON.visibleBlurred);
  let frame = observation.frame;
  if (
    !nonEmptyString(frame?.id) ||
    !Number.isInteger(frame?.sequence) || frame.sequence < 0 ||
    ![frame?.time, frame?.predictedDisplayTime, frame?.captureTime].every(Number.isFinite)
  ) {
    addReason(reasons, XR_SPATIAL_REASON.invalidObservation);
  }
  if (
    !nonEmptyString(observation.referenceSpace?.id) ||
    !nonEmptyString(observation.referenceSpace?.type) ||
    !Number.isInteger(observation.referenceSpace?.resetEpoch) ||
    observation.referenceSpace.resetEpoch < 0
  ) {
    addReason(reasons, XR_SPATIAL_REASON.referenceSpaceMismatch);
  }
  if (!nonEmptyString(observation.root?.id)) addReason(reasons, XR_SPATIAL_REASON.rootMismatch);
  if (!nonEmptyString(observation.root?.commitId)) addReason(reasons, XR_SPATIAL_REASON.rootCommitMismatch);
  if (!validPoseMatrix(observation.root?.matrix, observation.root?.pose)) addReason(reasons, XR_SPATIAL_REASON.missingRootPose);
  if (observation.posePhase !== 'committed') addReason(reasons, XR_SPATIAL_REASON.posePhaseMismatch);
  if (!validPoseMatrix(observation.viewerPose?.matrix, observation.viewerPose?.pose)) {
    addReason(reasons, XR_SPATIAL_REASON.missingViewerPose);
  }
  if (!observation.activeGrab || observation.activeGrab.active !== false || observation.activeGrab.sourceId !== null || observation.activeGrab.objectId !== null) {
    addReason(reasons, XR_SPATIAL_REASON.activeGrab);
  }
  validateViews(observation, target, reasons);
  validateObjects(observation, target, reasons);
  validateInputs(observation, target, reasons);
  validateFrameMembers(observation, reasons);
  validateContinuity(context.previousObservation || null, observation, reasons);
  let maximumAge = target?.requiredEvidenceProfile?.maximumSampleAgeMs;
  if (Number.isFinite(maximumAge) && !Number.isFinite(context.now)) {
    addReason(reasons, XR_SPATIAL_REASON.staleTimestamp);
  }
  if (
    Number.isFinite(maximumAge) &&
    Number.isFinite(context.now) &&
    (!Number.isFinite(frame?.captureTime) || context.now - frame.captureTime > maximumAge || context.now < frame.captureTime)
  ) {
    addReason(reasons, XR_SPATIAL_REASON.staleTimestamp);
  }
  if (
    Number.isFinite(maximumAge) &&
    Number.isFinite(frame?.captureTime) &&
    Number.isFinite(frame?.predictedDisplayTime) &&
    Math.abs(frame.captureTime - frame.predictedDisplayTime) > maximumAge
  ) {
    addReason(reasons, XR_SPATIAL_REASON.staleTimestamp);
  }
  return { eligible: reasons.length === 0, reasons };
}

function objectResult(targetObject, observedObject) {
  let expectedCorners = getOBBWorldCorners(
    targetObject.expectedPose.position,
    targetObject.expectedPose.quaternion,
    targetObject.size,
  );
  let observedCorners = getOBBWorldCorners(
    observedObject.pose.position,
    observedObject.pose.quaternion,
    observedObject.size,
  );
  let errors = {
    positionMeters: distance(targetObject.expectedPose.position, observedObject.pose.position),
    orientationDegrees: shortestAngle(targetObject.expectedPose.quaternion, observedObject.pose.quaternion),
    cornerEdgeMeters: maximumCornerEdgeError(expectedCorners, observedCorners),
    sizeMeters: Math.max(...targetObject.size.map((value, axis) => Math.abs(value - observedObject.size[axis]))),
  };
  let checks = {
    position: errors.positionMeters <= XR_SPATIAL_TOLERANCES.positionMeters,
    orientation: errors.orientationDegrees <= XR_SPATIAL_TOLERANCES.orientationDegrees,
    cornerEdge: errors.cornerEdgeMeters <= XR_SPATIAL_TOLERANCES.cornerEdgeMeters,
    size: errors.sizeMeters <= XR_SPATIAL_TOLERANCES.sizeMeters,
  };
  return { id: targetObject.id, passed: Object.values(checks).every(Boolean), errors, checks };
}

function aabbForObject(object, poseKey) {
  let pose = object[poseKey];
  return getAABBFromCorners(getOBBWorldCorners(pose.position, pose.quaternion, object.size));
}

function aabbClearance(a, b) {
  let gaps = a.min.map((minimum, axis) => Math.max(0, b.min[axis] - a.max[axis], minimum - b.max[axis]));
  return Math.hypot(...gaps);
}

function evaluateConstraint(constraint, objects) {
  let first = objects.get(constraint.objectId || constraint.objectAId || constraint.innerObjectId);
  let second = objects.get(constraint.objectBId || constraint.outerObjectId);
  let passed = false;
  let actual = null;
  let limit = null;
  if (constraint.type === 'datum') {
    let axis = { x: 0, y: 1, z: 2 }[constraint.axis];
    actual = Math.abs(first.pose.position[axis] - constraint.expectedCoordinate);
    limit = constraint.tolerance;
    passed = actual <= limit;
  } else if (constraint.type === 'alignment') {
    let axis = { x: 0, y: 1, z: 2 }[constraint.axis];
    actual = Math.abs((second.pose.position[axis] - first.pose.position[axis]) - constraint.expectedOffset);
    limit = constraint.tolerance;
    passed = actual <= limit;
  } else if (constraint.type === 'clearance') {
    actual = aabbClearance(aabbForObject(first, 'pose'), aabbForObject(second, 'pose'));
    limit = constraint.minimumDistance;
    passed = actual >= limit;
  } else if (constraint.type === 'containment') {
    let inner = aabbForObject(first, 'pose');
    let outer = aabbForObject(second, 'pose');
    let margins = inner.min.map((minimum, axis) => Math.min(minimum - outer.min[axis], outer.max[axis] - inner.max[axis]));
    actual = Math.min(...margins);
    limit = constraint.margin;
    passed = actual >= limit;
  } else if (constraint.type === 'safety-state') {
    actual = first.state;
    limit = constraint.requiredState;
    passed = actual === limit;
  }
  return { id: constraint.id, type: constraint.type, passed, actual, limit };
}

export function evaluateSample(target, observation) {
  let eligibility = checkSampleEligibility(target, observation, { now: observation?.frame?.captureTime });
  if (!eligibility.eligible) {
    return { eligible: false, passed: false, reasons: eligibility.reasons, objectResults: [], constraintResults: [] };
  }
  let observed = new Map(observation.objects.map((object) => [object.id, object]));
  let objectResults = target.objects.map((object) => objectResult(object, observed.get(object.id)));
  let constraintResults = target.constraints.map((constraint) => evaluateConstraint(constraint, observed));
  return {
    eligible: true,
    passed: objectResults.every((result) => result.passed) && constraintResults.every((result) => result.passed),
    reasons: [],
    objectResults,
    constraintResults,
  };
}

function equivalentValue(actual, expected) {
  if (Object.is(actual, expected)) return true;
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      Array.isArray(expected) &&
      actual.length === expected.length &&
      actual.every((value, index) => equivalentValue(value, expected[index]))
    );
  }
  if (!actual || !expected || typeof actual !== 'object' || typeof expected !== 'object') return false;
  let actualKeys = Object.keys(actual).sort();
  let expectedKeys = Object.keys(expected).sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => (
      key === expectedKeys[index] && equivalentValue(actual[key], expected[key])
    ))
  );
}

function auditPercentile(values, percentile) {
  if (values.length === 0) return 0;
  let sorted = [...values].sort((a, b) => a - b);
  let index = (sorted.length - 1) * percentile;
  let lower = Math.floor(index);
  let upper = Math.ceil(index);
  let weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function expectedObjectResults(target, observations, sampleResults) {
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

function expectedConstraintResults(target, observations, sampleResults) {
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

function expectedStabilityMetrics(target, observations) {
  return target.objects.map((targetObject) => {
    let poses = observations.map((observation) => (
      observation.objects.find((object) => object.id === targetObject.id).pose
    ));
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
      p95TranslationJitterMeters: auditPercentile(translationJitter, 0.95),
      maximumTranslationDriftMeters: Math.max(...translationDrift, 0),
      p95RotationJitterDegrees: auditPercentile(rotationJitter, 0.95),
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

function expectedAuditValue(expected, key, actual, reasons) {
  if (Object.hasOwn(expected, key) && !equivalentValue(actual, expected[key])) {
    addReason(reasons, `expected-${key}-mismatch`);
  }
}

/**
 * Verifies that a spatial audit is internally consistent and bound to the
 * caller's expected capture identity. This verifier does not trust the
 * audit's reported verdict or aggregate values.
 */
export function verifyXRSpatialAuditEnvelope(audit, expected = {}) {
  let reasons = [];
  if (!audit || typeof audit !== 'object') {
    return { ok: false, reasons: ['invalid-audit'] };
  }
  if (audit.version !== XR_SPATIAL_VERSIONS.audit) addReason(reasons, 'invalid-audit-version');
  if (!hasExactKeys(audit, [
    'version',
    'target',
    'targetValidation',
    'runtimeVerdict',
    'eligibility',
    'observations',
    'objectResults',
    'constraintResults',
    'stability',
    'projections',
  ])) addReason(reasons, 'invalid-audit-shape');

  let targetValidation = validateTarget(audit.target);
  let reportedTargetValidation = {
    verdict: targetValidation.valid ? 'VALID' : 'INVALID',
    reasons: targetValidation.reasons,
    errors: targetValidation.errors,
  };
  if (!equivalentValue(audit.targetValidation, reportedTargetValidation)) {
    addReason(reasons, 'target-validation-mismatch');
  }
  expectedAuditValue(expected, 'targetId', audit.target?.targetId, reasons);
  expectedAuditValue(expected, 'targetHash', audit.target?.contentHash, reasons);

  let observations = Array.isArray(audit.observations) ? audit.observations : [];
  if (!Array.isArray(audit.observations)) addReason(reasons, 'invalid-observations');
  let first = observations[0] || null;
  let previous = null;
  let observationsEligible = targetValidation.valid;
  for (let [index, observation] of observations.entries()) {
    let eligibility = checkSampleEligibility(audit.target, observation, {
      previousObservation: previous,
      now: observation?.frame?.captureTime,
    });
    if (!eligibility.eligible) {
      observationsEligible = false;
      for (let reason of eligibility.reasons) addReason(reasons, `observation-${index}-${reason}`);
    }
    if (first && !equivalentValue(observation.provenance, first.provenance)) {
      addReason(reasons, `observation-${index}-provenance-mismatch`);
    }
    if (first && observation.session?.mode !== first.session?.mode) {
      addReason(reasons, `observation-${index}-session-mode-mismatch`);
    }
    if (first && !sameMatrix(observation.root?.matrix, first.root?.matrix)) {
      addReason(reasons, `observation-${index}-root-transform-mismatch`);
    }
    previous = observation;
  }

  let bindings = {
    sessionId: first?.session?.id,
    referenceSpaceId: first?.referenceSpace?.id,
    resetEpoch: first?.referenceSpace?.resetEpoch,
    rootId: first?.root?.id,
    rootCommitId: first?.root?.commitId,
    runtimeId: first?.provenance?.runtimeId,
    runtimeVersion: first?.provenance?.runtimeVersion,
    appId: first?.provenance?.appId,
    buildHash: first?.provenance?.buildHash,
    deviceId: first?.provenance?.deviceId,
    deviceKind: first?.provenance?.deviceKind,
    emulation: first?.provenance?.emulation,
  };
  for (let [key, value] of Object.entries(bindings)) expectedAuditValue(expected, key, value, reasons);

  let last = observations.at(-1) || null;
  let window = {
    frameCount: observations.length,
    durationMs: first && last ? last.frame.time - first.frame.time : 0,
    firstFrameId: first?.frame?.id || null,
    lastFrameId: last?.frame?.id || null,
  };
  if (!equivalentValue(audit.eligibility?.acceptedWindow, window)) addReason(reasons, 'accepted-window-mismatch');
  let resetReasons = audit.eligibility?.resetReasons;
  let lastRejected = audit.eligibility?.lastRejectedSample;
  if (!Array.isArray(resetReasons)) {
    addReason(reasons, 'invalid-reset-reasons');
  } else if (resetReasons.length === 0 && lastRejected !== null) {
    addReason(reasons, 'rejected-sample-mismatch');
  } else if (resetReasons.length > 0 && !equivalentValue(lastRejected?.reasons, resetReasons)) {
    addReason(reasons, 'rejected-sample-mismatch');
  }

  let complete = (
    window.frameCount >= XR_SPATIAL_TOLERANCES.minimumFrames &&
    window.durationMs >= XR_SPATIAL_TOLERANCES.minimumDurationMs
  );
  if (
    audit.stability?.minimumFrames !== XR_SPATIAL_TOLERANCES.minimumFrames ||
    audit.stability?.minimumDurationMs !== XR_SPATIAL_TOLERANCES.minimumDurationMs ||
    audit.stability?.frameCount !== window.frameCount ||
    audit.stability?.durationMs !== window.durationMs ||
    audit.stability?.complete !== complete
  ) {
    addReason(reasons, 'stability-window-mismatch');
  }
  if (Number.isInteger(expected.minimumFrameCount) && window.frameCount < expected.minimumFrameCount) {
    addReason(reasons, 'expected-minimumFrameCount-not-met');
  }
  if (Number.isFinite(expected.minimumDurationMs) && window.durationMs < expected.minimumDurationMs) {
    addReason(reasons, 'expected-minimumDurationMs-not-met');
  }

  let sampleResults = observationsEligible
    ? observations.map((observation) => evaluateSample(audit.target, observation))
    : [];
  let objectResults = sampleResults.length > 0
    ? expectedObjectResults(audit.target, observations, sampleResults)
    : [];
  let constraintResults = sampleResults.length > 0
    ? expectedConstraintResults(audit.target, observations, sampleResults)
    : [];
  let objectMetrics = sampleResults.length > 0
    ? expectedStabilityMetrics(audit.target, observations)
    : [];
  if (!equivalentValue(audit.objectResults, objectResults)) addReason(reasons, 'object-results-mismatch');
  if (!equivalentValue(audit.constraintResults, constraintResults)) addReason(reasons, 'constraint-results-mismatch');
  if (!equivalentValue(audit.stability?.objectMetrics, objectMetrics)) addReason(reasons, 'stability-metrics-mismatch');

  let stabilityPassed = complete && objectMetrics.every((result) => result.passed);
  if (audit.stability?.passed !== stabilityPassed) addReason(reasons, 'stability-verdict-mismatch');
  let expectedVerdict = targetValidation.valid ? 'INVALID_EVIDENCE' : 'NOT_EVALUATED';
  if (targetValidation.valid && observationsEligible && complete) {
    expectedVerdict = (
      objectResults.every((result) => result.passed) &&
      constraintResults.every((result) => result.passed) &&
      objectMetrics.every((result) => result.passed)
    ) ? 'PASS' : 'FAIL';
  }
  if (audit.runtimeVerdict !== expectedVerdict) addReason(reasons, 'runtime-verdict-mismatch');
  expectedAuditValue(expected, 'runtimeVerdict', audit.runtimeVerdict, reasons);

  let expectedProjections = last ? projectObservations(audit.target, last) : {
    version: XR_SPATIAL_VERSIONS.projection,
    orthographic: {
      status: 'UNAVAILABLE',
      reason: 'missing-observation',
      unit: 'meters',
      target: null,
      observed: null,
    },
    axonometric: {
      status: 'UNAVAILABLE',
      reason: 'missing-observation',
      referenceOnly: true,
      metric: false,
      target: null,
      observed: null,
    },
    stereo: { status: 'UNAVAILABLE', reason: 'missing-observation', eyes: null },
  };
  if (!equivalentValue(audit.projections, expectedProjections)) addReason(reasons, 'projection-mismatch');
  if (audit.runtimeVerdict === 'PASS' && (
    audit.projections?.orthographic?.status !== 'READY' ||
    audit.projections?.stereo?.status !== 'READY'
  )) {
    addReason(reasons, 'pass-without-ready-projections');
  }

  let maximumAgeMs = Number.isFinite(expected.maximumAgeMs)
    ? expected.maximumAgeMs
    : audit.target?.requiredEvidenceProfile?.maximumSampleAgeMs;
  if (Number.isFinite(expected.now) && last && Number.isFinite(maximumAgeMs)) {
    let age = expected.now - last.frame.captureTime;
    if (age < 0 || age > maximumAgeMs) addReason(reasons, 'audit-stale');
  }
  return { ok: reasons.length === 0, reasons };
}
