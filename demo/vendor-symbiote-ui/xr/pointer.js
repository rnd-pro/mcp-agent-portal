import { createXRPanelContentViewport } from './layout-projection.js';
import {
  XR_SPATIAL_PLACEMENT_LIMITS,
  XR_SPATIAL_VERSIONS,
  freezeSpatialValue,
} from './spatial-contract.js';
import {
  distance,
  isFiniteMatrix4,
  isFiniteVector,
  isNormalizedQuaternion,
  makeTransform,
  normalizeVector,
} from './spatial-math.js';

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function normalize(v) {
  let length = Math.hypot(v[0], v[1], v[2]);
  if (!length) return [0, 0, -1];
  return [v[0] / length, v[1] / length, v[2] / length];
}

function numberOr(value, fallback) {
  let number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundMetric(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function degToRad(value) {
  return Number(value || 0) * Math.PI / 180;
}

function panelAxes(panel) {
  let rx = degToRad(panel.rotation?.[0] || 0);
  let ry = degToRad(panel.rotation?.[1] || 0);
  let rz = degToRad(panel.rotation?.[2] || 0);

  let cx = Math.cos(rx), sx = Math.sin(rx);
  let cy = Math.cos(ry), sy = Math.sin(ry);
  let cz = Math.cos(rz), sz = Math.sin(rz);

  let right = [
    cz * cy,
    sz * cy,
    -sy
  ];

  let up = [
    cz * sy * sx - sz * cx,
    sz * sy * sx + cz * cx,
    cy * sx
  ];

  let normal = normalize([
    cz * sy * cx + sz * sx,
    sz * sy * cx - cz * sx,
    cy * cx
  ]);

  return { right, up, normal };
}

export function hitTestXRPanel(ray, panel) {
  if (!ray || !panel) return null;
  let origin = ray.origin || [0, 0, 0];
  let direction = normalize(ray.direction || [0, 0, -1]);
  let center = panel.position || [0, 0, -1];
  let [width, height] = panel.size || [1, 1];
  let { right, up, normal } = panelAxes(panel);
  let denom = dot(normal, direction);
  if (Math.abs(denom) < 0.000001) return null;
  let t = dot(normal, subtract(center, origin)) / denom;
  if (t < 0) return null;

  let hitPoint = add(origin, scale(direction, t));
  let local = subtract(hitPoint, center);
  let xMeters = dot(local, right);
  let yMeters = dot(local, up);
  let x = xMeters / width + 0.5;
  let y = 0.5 - yMeters / height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;

  return {
    panelId: panel.id,
    point: { x, y },
    worldPoint: hitPoint,
    distance: t,
    panel,
  };
}

export function hitTestXRPanels(ray, panels = []) {
  return panels
    .map((panel) => hitTestXRPanel(ray, panel))
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance)[0] || null;
}

export function createXRPointerEvent(hit, input = {}, type = 'pointermove') {
  if (!hit) return null;
  let target = createXRPanelPointerTarget(hit, input);
  return {
    type,
    source: input.source || 'xr-controller',
    targetId: hit.panelId,
    point: hit.point,
    contentPoint: target.contentPoint,
    contentViewport: target.contentViewport,
    worldPoint: hit.worldPoint,
    distance: hit.distance,
    buttons: {
      primary: Boolean(input.primary),
      secondary: Boolean(input.secondary),
    },
    ray: input.ray || null,
  };
}

export function createXRPanelPointerTarget(hit, options = {}) {
  if (!hit) return null;
  let panel = options.panel || hit.panel || {};
  let point = {
    x: clamp(numberOr(hit.point?.x, 0), 0, 1),
    y: clamp(numberOr(hit.point?.y, 0), 0, 1),
  };
  let contentViewport = options.contentViewport || panel.contentViewport || createXRPanelContentViewport(panel);
  return {
    panelId: String(hit.panelId || panel.id || ''),
    targetId: String(hit.panelId || panel.id || ''),
    point,
    contentPoint: {
      x: roundMetric(point.x * contentViewport.width),
      y: roundMetric(point.y * contentViewport.height),
    },
    contentViewport,
    source: options.source || 'xr-controller',
  };
}

export function createXRPointerHit(panel, point = {}, options = {}) {
  if (!panel) return null;
  let normalizedPoint = {
    x: clamp(numberOr(point.x, 0), 0, 1),
    y: clamp(numberOr(point.y, 0), 0, 1),
  };
  return {
    panelId: panel.id,
    point: normalizedPoint,
    worldPoint: options.worldPoint || null,
    distance: numberOr(options.distance, 0),
    panel,
  };
}

export function createXRPointerHitFromDomEvent(panel, element, event, options = {}) {
  if (!panel || !element?.getBoundingClientRect || !event) return null;
  let rect = element.getBoundingClientRect();
  return createXRPointerHit(panel, {
    x: (numberOr(event.clientX, rect.left) - rect.left) / Math.max(rect.width, 1),
    y: (numberOr(event.clientY, rect.top) - rect.top) / Math.max(rect.height, 1),
  }, options);
}

export function createXRPointerRayFromDomEvent(event, element, options = {}) {
  if (!event || !element?.getBoundingClientRect) return null;
  let rect = element.getBoundingClientRect();
  let width = Math.max(numberOr(rect.width, 0), 1);
  let height = Math.max(numberOr(rect.height, 0), 1);
  let normalizedX = (numberOr(event.clientX, rect.left) - rect.left) / width - 0.5;
  let normalizedY = 0.5 - (numberOr(event.clientY, rect.top) - rect.top) / height;
  let horizontalMeters = numberOr(options.horizontalMeters, 1.4);
  let verticalMeters = numberOr(options.verticalMeters, 0.72);
  let eyeHeight = numberOr(options.eyeHeight, 1.32);
  let horizontalSkew = numberOr(options.horizontalSkew, 0.28);
  let verticalSkew = numberOr(options.verticalSkew, 0.18);

  return {
    version: 'xr-dom-pointer-ray-v1',
    source: options.source || 'dom-pointer',
    origin: [
      roundMetric(normalizedX * horizontalMeters),
      roundMetric(eyeHeight + normalizedY * verticalMeters),
      numberOr(options.originZ, 0),
    ],
    direction: normalize([
      -normalizedX * horizontalSkew,
      -normalizedY * verticalSkew,
      -1,
    ]),
    normalized: {
      x: roundMetric(normalizedX + 0.5),
      y: roundMetric(0.5 - normalizedY),
    },
  };
}

export function normalizeXRInputRay(inputSource, frame, referenceSpace) {
  let pose = frame?.getPose?.(inputSource?.targetRaySpace, referenceSpace);
  let transform = pose?.transform;
  if (!transform) return null;
  let matrix = transform.matrix;
  if (Array.isArray(matrix) || ArrayBuffer.isView(matrix)) {
    return {
      origin: [matrix[12], matrix[13], matrix[14]],
      direction: normalize([-matrix[8], -matrix[9], -matrix[10]]),
    };
  }
  return null;
}

function inputSourceKind(inputSource = {}) {
  let mode = inputSource.targetRayMode || '';
  let profiles = Array.isArray(inputSource.profiles) ? inputSource.profiles.join(' ') : '';
  if (inputSource.hand) return 'hand';
  if (mode === 'gaze') return 'gaze';
  if (mode === 'screen') return 'screen';
  if (/hand|pinch/i.test(profiles)) return 'hand';
  return 'controller';
}

export function createXRInputSourceSummary(inputSource = {}, options = {}) {
  let profiles = Array.isArray(inputSource.profiles) ? [...inputSource.profiles].map(String) : [];
  return {
    version: 'xr-input-source-summary-v1',
    id: options.id || inputSource.id || null,
    handedness: inputSource.handedness || 'none',
    targetRayMode: inputSource.targetRayMode || null,
    kind: inputSourceKind(inputSource),
    primary: options.primary === true,
    profiles,
    capabilities: {
      targetRay: Boolean(inputSource.targetRaySpace),
      grip: Boolean(inputSource.gripSpace),
      hand: Boolean(inputSource.hand),
      gamepad: Boolean(inputSource.gamepad),
      squeeze: Boolean(inputSource.gamepad || inputSource.profiles?.length),
    },
  };
}

function inputScore(summary, options = {}) {
  let score = 0;
  if (summary.targetRayMode === 'tracked-pointer') score += 40;
  if (summary.kind === 'controller') score += options.preferHands ? 8 : 20;
  if (summary.kind === 'hand') score += options.preferHands ? 24 : 12;
  if (summary.handedness === (options.dominantHand || 'right')) score += 8;
  if (summary.capabilities.targetRay) score += 8;
  if (summary.capabilities.gamepad) score += 4;
  return score;
}

export function selectPrimaryXRInputSource(inputSources = [], options = {}) {
  let sources = [...inputSources].map((source, index) => ({
    source,
    summary: createXRInputSourceSummary(source, { id: source?.id || `input-${index}` }),
  }));
  let selected = sources
    .map((item) => ({ ...item, score: inputScore(item.summary, options) }))
    .sort((a, b) => b.score - a.score)[0] || null;
  return {
    version: 'xr-primary-input-source-v1',
    selected: selected ? {
      ...selected.summary,
      primary: true,
      score: selected.score,
    } : null,
    source: selected?.source || null,
    summaries: sources.map((item) => item.summary),
    reason: selected ? 'best-target-ray-score' : 'no-input-sources',
  };
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validHitMapViewport(viewport) {
  return Boolean(
    hasExactObjectKeys(viewport, ['width', 'height']) &&
    Number.isFinite(viewport.width) &&
    Number.isFinite(viewport.height) &&
    viewport.width > 0 &&
    viewport.height > 0
  );
}

function validateHitMapTarget(target, coordinateSpace, viewport) {
  let bounds = target?.bounds;
  if (!hasExactObjectKeys(target, ['id', 'action', 'bounds'])) return false;
  if (!hasExactObjectKeys(bounds, ['x', 'y', 'width', 'height'])) return false;
  if (!nonEmptyString(target?.id) || !nonEmptyString(target?.action)) return false;
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return false;
  if (bounds.x < 0 || bounds.y < 0 || bounds.width <= 0 || bounds.height <= 0) return false;
  let maximumX = coordinateSpace === 'normalized' ? 1 : viewport.width;
  let maximumY = coordinateSpace === 'normalized' ? 1 : viewport.height;
  return bounds.x + bounds.width <= maximumX && bounds.y + bounds.height <= maximumY;
}

function validHitMapDescriptor(descriptor) {
  let capture = descriptor?.capture;
  let valid = (
    hasExactObjectKeys(descriptor, [
      'version',
      'panelId',
      'contentHash',
      'revision',
      'coordinateSpace',
      'viewport',
      'capture',
      'targets',
    ]) &&
    descriptor.version === XR_SPATIAL_VERSIONS.hitMap &&
    nonEmptyString(descriptor.panelId) &&
    nonEmptyString(descriptor.contentHash) &&
    Number.isInteger(descriptor.revision) && descriptor.revision >= 0 &&
    ['normalized', 'content-pixels'].includes(descriptor.coordinateSpace) &&
    validHitMapViewport(descriptor.viewport) &&
    hasExactObjectKeys(capture, ['sessionId', 'frameId', 'sequence', 'time']) &&
    nonEmptyString(capture.sessionId) &&
    nonEmptyString(capture.frameId) &&
    Number.isInteger(capture.sequence) && capture.sequence >= 0 &&
    Number.isFinite(capture.time) && capture.time >= 0 &&
    Array.isArray(descriptor.targets)
  );
  if (!valid) return false;
  let targetIds = new Set();
  return descriptor.targets.every((target) => {
    if (!validateHitMapTarget(target, descriptor.coordinateSpace, descriptor.viewport) || targetIds.has(target.id)) {
      return false;
    }
    targetIds.add(target.id);
    return true;
  });
}

export function createXRHitMap(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') {
    throw new TypeError('createXRHitMap requires a descriptor.');
  }
  if (!validHitMapDescriptor(descriptor)) throw new TypeError('Invalid xr-content-hit-map-v1 descriptor.');
  return freezeSpatialValue(descriptor);
}

function failedHitMap(reason, contentPoint = null) {
  return { ok: false, reason, target: null, contentPoint };
}

function mapPoint(point, hitMap, pointSpace) {
  let normalized = pointSpace === 'normalized'
    ? { x: point.x, y: point.y }
    : { x: point.x / hitMap.viewport.width, y: point.y / hitMap.viewport.height };
  let content = {
    x: normalized.x * hitMap.viewport.width,
    y: normalized.y * hitMap.viewport.height,
  };
  return {
    normalized,
    content,
    comparable: hitMap.coordinateSpace === 'normalized' ? normalized : content,
  };
}

export function resolveXRHitMap(point, hitMap, options = {}) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return failedHitMap('invalid-point');
  if (!validHitMapDescriptor(hitMap)) {
    return failedHitMap('invalid-hit-map');
  }
  if (hitMap.panelId !== options.panelId) return failedHitMap('panel-mismatch');
  if (hitMap.contentHash !== options.contentHash) return failedHitMap('content-hash-mismatch');
  if (hitMap.revision !== options.revision) return failedHitMap('revision-mismatch');
  if (hitMap.capture.sessionId !== options.sessionId) return failedHitMap('session-mismatch');
  let frame = options.frame;
  if (!frame || !Number.isInteger(frame.sequence) || !Number.isFinite(frame.time)) return failedHitMap('missing-current-frame');
  if (frame.sequence < hitMap.capture.sequence || frame.time < hitMap.capture.time) return failedHitMap('future-hit-map');
  let maximumFrameAge = Number.isInteger(options.maximumFrameAge) ? options.maximumFrameAge : 2;
  let maximumAgeMs = Number.isFinite(options.maximumAgeMs) ? options.maximumAgeMs : 150;
  if (frame.sequence - hitMap.capture.sequence > maximumFrameAge || frame.time - hitMap.capture.time > maximumAgeMs) {
    return failedHitMap('stale-hit-map');
  }
  let mapped = mapPoint(point, hitMap, options.pointSpace || 'normalized');
  if (
    mapped.normalized.x < 0 || mapped.normalized.x > 1 ||
    mapped.normalized.y < 0 || mapped.normalized.y > 1
  ) {
    return failedHitMap('point-out-of-bounds', mapped.content);
  }
  let target = hitMap.targets.find((candidate) => {
    let bounds = candidate.bounds;
    return (
      mapped.comparable.x >= bounds.x &&
      mapped.comparable.x <= bounds.x + bounds.width &&
      mapped.comparable.y >= bounds.y &&
      mapped.comparable.y <= bounds.y + bounds.height
    );
  }) || null;
  if (!target) return failedHitMap('target-not-found', mapped.content);
  return {
    ok: true,
    reason: null,
    target,
    contentPoint: mapped.content,
  };
}

function validInteractionPoint(point) {
  return Boolean(
    point &&
    Object.keys(point).length === 2 &&
    Object.hasOwn(point, 'x') &&
    Object.hasOwn(point, 'y') &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y)
  );
}

function validInteractionPhase(phase, expectedPhase) {
  let expectedKeys = [
    'version',
    'eventId',
    'phase',
    'sessionId',
    'frameId',
    'frameSequence',
    'timestamp',
    'inputSourceId',
    'inputKind',
    'handedness',
    'profiles',
    'uv',
    'contentPoint',
    'panelId',
    'targetId',
    'action',
    'contentHash',
    'revision',
    'startEventId',
    'spatialTargetHash',
    'rootCommitId',
  ];
  return Boolean(
    phase &&
    Object.keys(phase).length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(phase, key)) &&
    phase.version === XR_SPATIAL_VERSIONS.interactionPhase &&
    phase.phase === expectedPhase &&
    nonEmptyString(phase.eventId) &&
    nonEmptyString(phase.sessionId) &&
    nonEmptyString(phase.frameId) &&
    Number.isInteger(phase.frameSequence) && phase.frameSequence >= 0 &&
    Number.isFinite(phase.timestamp) && phase.timestamp >= 0 &&
    nonEmptyString(phase.inputSourceId) &&
    ['controller', 'hand'].includes(phase.inputKind) &&
    ['left', 'right', 'none'].includes(phase.handedness) &&
    Array.isArray(phase.profiles) &&
    phase.profiles.every(nonEmptyString) &&
    new Set(phase.profiles).size === phase.profiles.length &&
    validInteractionPoint(phase.uv) &&
    validInteractionPoint(phase.contentPoint) &&
    nonEmptyString(phase.panelId) &&
    nonEmptyString(phase.targetId) &&
    nonEmptyString(phase.action) &&
    nonEmptyString(phase.contentHash) &&
    Number.isInteger(phase.revision) && phase.revision >= 0 &&
    nonEmptyString(phase.spatialTargetHash) &&
    nonEmptyString(phase.rootCommitId) &&
    (expectedPhase === 'selectstart' ? phase.startEventId === null : nonEmptyString(phase.startEventId))
  );
}

function matchingInteractionPhases(start, end) {
  let keys = [
    'sessionId',
    'inputSourceId',
    'inputKind',
    'handedness',
    'panelId',
    'targetId',
    'action',
    'contentHash',
    'revision',
    'spatialTargetHash',
    'rootCommitId',
  ];
  return (
    keys.every((key) => start[key] === end[key]) &&
    JSON.stringify(start.profiles) === JSON.stringify(end.profiles) &&
    end.startEventId === start.eventId &&
    end.frameSequence >= start.frameSequence &&
    end.timestamp >= start.timestamp
  );
}

export function createXRTrustedSelectReceipt(selectStart, selectEnd) {
  if (
    !validInteractionPhase(selectStart, 'selectstart') ||
    !validInteractionPhase(selectEnd, 'selectend') ||
    selectStart.startEventId !== null ||
    !matchingInteractionPhases(selectStart, selectEnd)
  ) {
    throw new RangeError('Trusted select phases do not form an exact pair.');
  }
  return freezeSpatialValue({
    version: XR_SPATIAL_VERSIONS.trustedSelect,
    receiptId: `${selectStart.eventId}:${selectEnd.eventId}`,
    sessionId: selectStart.sessionId,
    inputSourceId: selectStart.inputSourceId,
    inputKind: selectStart.inputKind,
    handedness: selectStart.handedness,
    profiles: [...selectStart.profiles],
    panelId: selectStart.panelId,
    targetId: selectStart.targetId,
    action: selectStart.action,
    contentHash: selectStart.contentHash,
    revision: selectStart.revision,
    spatialTargetHash: selectStart.spatialTargetHash,
    rootCommitId: selectStart.rootCommitId,
    selectStart,
    selectEnd,
  });
}

export function verifyXRTrustedSelectReceipt(receipt, expected = {}) {
  let reasons = [];
  if (!receipt || receipt.version !== XR_SPATIAL_VERSIONS.trustedSelect) reasons.push('invalid-receipt-version');
  let receiptKeys = [
    'version',
    'receiptId',
    'sessionId',
    'inputSourceId',
    'inputKind',
    'handedness',
    'profiles',
    'panelId',
    'targetId',
    'action',
    'contentHash',
    'revision',
    'spatialTargetHash',
    'rootCommitId',
    'selectStart',
    'selectEnd',
  ];
  if (
    !receipt ||
    Object.keys(receipt).length !== receiptKeys.length ||
    !receiptKeys.every((key) => Object.hasOwn(receipt, key))
  ) reasons.push('invalid-receipt-shape');
  let start = receipt?.selectStart;
  let end = receipt?.selectEnd;
  if (!validInteractionPhase(start, 'selectstart')) reasons.push('invalid-selectstart');
  if (!validInteractionPhase(end, 'selectend')) reasons.push('invalid-selectend');
  if (reasons.length === 0 && !matchingInteractionPhases(start, end)) reasons.push('phase-pair-mismatch');
  let keys = [
    'sessionId',
    'inputSourceId',
    'inputKind',
    'handedness',
    'panelId',
    'targetId',
    'action',
    'contentHash',
    'revision',
    'spatialTargetHash',
    'rootCommitId',
  ];
  for (let key of keys) {
    if (receipt?.[key] !== start?.[key] || receipt?.[key] !== end?.[key]) reasons.push(`receipt-${key}-mismatch`);
    if (Object.hasOwn(expected, key) && receipt?.[key] !== expected[key]) reasons.push(`expected-${key}-mismatch`);
  }
  if (receipt?.receiptId !== `${start?.eventId}:${end?.eventId}`) reasons.push('receipt-id-mismatch');
  if (
    !Array.isArray(receipt?.profiles) ||
    JSON.stringify(receipt.profiles) !== JSON.stringify(start?.profiles) ||
    JSON.stringify(receipt.profiles) !== JSON.stringify(end?.profiles)
  ) {
    reasons.push('receipt-profiles-mismatch');
  }
  if (Object.hasOwn(expected, 'profiles') && JSON.stringify(receipt?.profiles) !== JSON.stringify(expected.profiles)) {
    reasons.push('expected-profiles-mismatch');
  }
  if (Number.isFinite(expected.maximumDurationMs) && end?.timestamp - start?.timestamp > expected.maximumDurationMs) {
    reasons.push('receipt-duration-exceeded');
  }
  if (Number.isFinite(expected.now) && Number.isFinite(expected.maximumAgeMs)) {
    if (expected.now < end?.timestamp || expected.now - end?.timestamp > expected.maximumAgeMs) {
      reasons.push('receipt-stale');
    }
  }
  if (Number.isInteger(expected.frameSequence) && Number.isInteger(expected.maximumFrameAge)) {
    if (expected.frameSequence < end?.frameSequence || expected.frameSequence - end?.frameSequence > expected.maximumFrameAge) {
      reasons.push('receipt-frame-stale');
    }
  }
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

function hasExactObjectKeys(value, expectedKeys) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(value, key))
  );
}

function sameFiniteArray(actual, expected, tolerance = 1e-6) {
  return (
    Array.isArray(actual) &&
    Array.isArray(expected) &&
    actual.length === expected.length &&
    actual.every((value, index) => (
      Number.isFinite(value) && Number.isFinite(expected[index]) && Math.abs(value - expected[index]) <= tolerance
    ))
  );
}

function validPlacementPose(hitPose) {
  if (!hasExactObjectKeys(hitPose, ['matrix', 'pose'])) return false;
  if (!isFiniteMatrix4(hitPose.matrix)) return false;
  if (!hasExactObjectKeys(hitPose.pose, ['position', 'quaternion'])) return false;
  if (!isFiniteVector(hitPose.pose.position, 3) || !isNormalizedQuaternion(hitPose.pose.quaternion)) return false;
  return sameFiniteArray(hitPose.matrix, makeTransform(hitPose.pose.position, hitPose.pose.quaternion));
}

function validSurfaceNormal(surfaceNormal, matrix) {
  if (!isFiniteVector(surfaceNormal, 3)) return false;
  let normalized = normalizeVector(surfaceNormal);
  let matrixNormal = normalizeVector([matrix[4], matrix[5], matrix[6]]);
  return Boolean(
    normalized &&
    matrixNormal &&
    sameFiniteArray(surfaceNormal, normalized) &&
    sameFiniteArray(normalized, matrixNormal)
  );
}

function validPlacementPhase(phase, expectedPhase) {
  let expectedKeys = [
    'version',
    'eventId',
    'phase',
    'sessionId',
    'frameId',
    'frameSequence',
    'timestamp',
    'referenceSpaceId',
    'inputSourceId',
    'inputKind',
    'handedness',
    'profiles',
    'hitTestResultId',
    'hitPose',
    'surfaceNormal',
    'startEventId',
  ];
  return Boolean(
    hasExactObjectKeys(phase, expectedKeys) &&
    phase.version === XR_SPATIAL_VERSIONS.placementPhase &&
    phase.phase === expectedPhase &&
    nonEmptyString(phase.eventId) &&
    nonEmptyString(phase.sessionId) &&
    nonEmptyString(phase.frameId) &&
    Number.isInteger(phase.frameSequence) && phase.frameSequence >= 0 &&
    Number.isFinite(phase.timestamp) && phase.timestamp >= 0 &&
    nonEmptyString(phase.referenceSpaceId) &&
    nonEmptyString(phase.inputSourceId) &&
    ['controller', 'hand'].includes(phase.inputKind) &&
    ['left', 'right', 'none'].includes(phase.handedness) &&
    Array.isArray(phase.profiles) &&
    phase.profiles.every(nonEmptyString) &&
    new Set(phase.profiles).size === phase.profiles.length &&
    nonEmptyString(phase.hitTestResultId) &&
    validPlacementPose(phase.hitPose) &&
    validSurfaceNormal(phase.surfaceNormal, phase.hitPose.matrix) &&
    (expectedPhase === 'selectstart' ? phase.startEventId === null : nonEmptyString(phase.startEventId))
  );
}

function matchingPlacementPhases(start, end) {
  let keys = [
    'sessionId',
    'referenceSpaceId',
    'inputSourceId',
    'inputKind',
    'handedness',
  ];
  return (
    keys.every((key) => start[key] === end[key]) &&
    JSON.stringify(start.profiles) === JSON.stringify(end.profiles) &&
    end.startEventId === start.eventId &&
    end.frameSequence >= start.frameSequence &&
    end.timestamp >= start.timestamp
  );
}

export function createXRPlacementReceipt(selectStart, selectEnd) {
  if (
    !validPlacementPhase(selectStart, 'selectstart') ||
    !validPlacementPhase(selectEnd, 'selectend') ||
    !matchingPlacementPhases(selectStart, selectEnd)
  ) {
    throw new RangeError('Spatial placement phases do not form an exact pair.');
  }
  return freezeSpatialValue({
    version: XR_SPATIAL_VERSIONS.placementReceipt,
    receiptId: `${selectStart.eventId}:${selectEnd.eventId}`,
    sessionId: selectEnd.sessionId,
    referenceSpaceId: selectEnd.referenceSpaceId,
    inputSourceId: selectEnd.inputSourceId,
    inputKind: selectEnd.inputKind,
    handedness: selectEnd.handedness,
    profiles: [...selectEnd.profiles],
    hitTestResultId: selectEnd.hitTestResultId,
    hitPose: selectEnd.hitPose,
    surfaceNormal: selectEnd.surfaceNormal,
    selectStart,
    selectEnd,
  });
}

export function verifyXRPlacementReceipt(receipt, expected = {}) {
  let reasons = [];
  let receiptKeys = [
    'version',
    'receiptId',
    'sessionId',
    'referenceSpaceId',
    'inputSourceId',
    'inputKind',
    'handedness',
    'profiles',
    'hitTestResultId',
    'hitPose',
    'surfaceNormal',
    'selectStart',
    'selectEnd',
  ];
  if (receipt?.version !== XR_SPATIAL_VERSIONS.placementReceipt) reasons.push('invalid-placement-receipt-version');
  if (!hasExactObjectKeys(receipt, receiptKeys)) reasons.push('invalid-placement-receipt-shape');
  let start = receipt?.selectStart;
  let end = receipt?.selectEnd;
  if (!validPlacementPhase(start, 'selectstart')) reasons.push('invalid-placement-selectstart');
  if (!validPlacementPhase(end, 'selectend')) reasons.push('invalid-placement-selectend');
  if (reasons.length === 0 && !matchingPlacementPhases(start, end)) reasons.push('placement-phase-pair-mismatch');

  let keys = ['sessionId', 'referenceSpaceId', 'inputSourceId', 'inputKind', 'handedness'];
  for (let key of keys) {
    if (receipt?.[key] !== end?.[key]) reasons.push(`placement-receipt-${key}-mismatch`);
    if (Object.hasOwn(expected, key) && receipt?.[key] !== expected[key]) reasons.push(`expected-${key}-mismatch`);
  }
  if (receipt?.receiptId !== `${start?.eventId}:${end?.eventId}`) reasons.push('placement-receipt-id-mismatch');
  if (receipt?.hitTestResultId !== end?.hitTestResultId) reasons.push('placement-hit-result-mismatch');
  if (
    !validPlacementPose(receipt?.hitPose) ||
    !sameFiniteArray(receipt?.hitPose?.matrix, end?.hitPose?.matrix) ||
    !sameFiniteArray(receipt?.hitPose?.pose?.position, end?.hitPose?.pose?.position) ||
    !sameFiniteArray(receipt?.hitPose?.pose?.quaternion, end?.hitPose?.pose?.quaternion)
  ) reasons.push('placement-hit-pose-mismatch');
  if (
    !validSurfaceNormal(receipt?.surfaceNormal, receipt?.hitPose?.matrix || []) ||
    !sameFiniteArray(receipt?.surfaceNormal, end?.surfaceNormal)
  ) reasons.push('placement-surface-normal-mismatch');
  if (
    !Array.isArray(receipt?.profiles) ||
    JSON.stringify(receipt.profiles) !== JSON.stringify(end?.profiles)
  ) reasons.push('placement-profiles-mismatch');

  for (let key of ['hitTestResultId', 'profiles']) {
    if (Object.hasOwn(expected, key)) {
      let matches = key === 'profiles'
        ? JSON.stringify(receipt?.[key]) === JSON.stringify(expected[key])
        : receipt?.[key] === expected[key];
      if (!matches) reasons.push(`expected-${key}-mismatch`);
    }
  }
  if (Object.hasOwn(expected, 'hitPoseMatrix') && !sameFiniteArray(receipt?.hitPose?.matrix, expected.hitPoseMatrix)) {
    reasons.push('expected-hitPoseMatrix-mismatch');
  }
  if (Object.hasOwn(expected, 'surfaceNormal') && !sameFiniteArray(receipt?.surfaceNormal, expected.surfaceNormal)) {
    reasons.push('expected-surfaceNormal-mismatch');
  }
  let duration = end?.timestamp - start?.timestamp;
  let minimumHoldMs = Number.isFinite(expected.minimumHoldMs) ? expected.minimumHoldMs : 0;
  let maximumDurationMs = Number.isFinite(expected.maximumDurationMs)
    ? expected.maximumDurationMs
    : XR_SPATIAL_PLACEMENT_LIMITS.maximumDurationMs;
  if (duration < minimumHoldMs) reasons.push('placement-hold-too-short');
  if (duration > maximumDurationMs) {
    reasons.push('placement-duration-exceeded');
  }
  let maximumAgeMs = Number.isFinite(expected.maximumAgeMs)
    ? expected.maximumAgeMs
    : XR_SPATIAL_PLACEMENT_LIMITS.maximumAgeMs;
  if (!Number.isFinite(expected.now)) {
    reasons.push('placement-current-time-required');
  } else if (expected.now < end?.timestamp || expected.now - end?.timestamp > maximumAgeMs) {
      reasons.push('placement-receipt-stale');
  }
  let maximumFrameAge = Number.isInteger(expected.maximumFrameAge)
    ? expected.maximumFrameAge
    : XR_SPATIAL_PLACEMENT_LIMITS.maximumFrameAge;
  if (!Number.isInteger(expected.frameSequence)) {
    reasons.push('placement-current-frame-required');
  } else if (expected.frameSequence < end?.frameSequence || expected.frameSequence - end?.frameSequence > maximumFrameAge) {
      reasons.push('placement-frame-stale');
  }
  if (!nonEmptyString(expected.sessionId)) reasons.push('expected-session-required');
  let maximumHitDriftMeters = Number.isFinite(expected.maximumHitDriftMeters)
    ? expected.maximumHitDriftMeters
    : XR_SPATIAL_PLACEMENT_LIMITS.maximumHitDriftMeters;
  if (
    validPlacementPose(start?.hitPose) &&
    validPlacementPose(end?.hitPose) &&
    distance(start.hitPose.pose.position, end.hitPose.pose.position) > maximumHitDriftMeters
  ) reasons.push('placement-hit-drift-exceeded');
  let maximumNormalChangeDegrees = Number.isFinite(expected.maximumNormalChangeDegrees)
    ? expected.maximumNormalChangeDegrees
    : XR_SPATIAL_PLACEMENT_LIMITS.maximumNormalChangeDegrees;
  if (isFiniteVector(start?.surfaceNormal, 3) && isFiniteVector(end?.surfaceNormal, 3)) {
    let dot = start.surfaceNormal.reduce((sum, value, index) => sum + value * end.surfaceNormal[index], 0);
    let normalChange = Math.acos(Math.min(1, Math.max(-1, dot))) * 180 / Math.PI;
    if (normalChange > maximumNormalChangeDegrees) reasons.push('placement-normal-change-exceeded');
  }
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}
