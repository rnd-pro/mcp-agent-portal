import { XR_SPATIAL_VERSIONS } from './spatial-contract.js';
import {
  getOBBWorldCorners,
  isFiniteMatrix4,
  isFiniteVector,
  multiplyMatrices,
  multiplyMatrixVector4,
} from './spatial-math.js';

export const XR_SPATIAL_PROJECTION_VERSION = XR_SPATIAL_VERSIONS.projection;

function metricPoint(u, v) {
  return { u, v };
}

export function projectTop(point, anchor = [0, 0, 0]) {
  return metricPoint(point[0] - anchor[0], -(point[2] - anchor[2]));
}

export function projectFront(point, anchor = [0, 0, 0]) {
  return metricPoint(point[0] - anchor[0], -(point[1] - anchor[1]));
}

export function projectRight(point, anchor = [0, 0, 0]) {
  return metricPoint(-(point[2] - anchor[2]), -(point[1] - anchor[1]));
}

export function projectAxonometric(point, anchor = [0, 0, 0]) {
  let x = point[0] - anchor[0];
  let y = point[1] - anchor[1];
  let z = point[2] - anchor[2];
  return metricPoint((x - z) * Math.sqrt(3) / 2, -y + (x + z) / 2);
}

function projectionBounds(points) {
  let horizontal = points.map((point) => point.u);
  let vertical = points.map((point) => point.v);
  return {
    minU: Math.min(...horizontal),
    maxU: Math.max(...horizontal),
    minV: Math.min(...vertical),
    maxV: Math.max(...vertical),
  };
}

function orthographicObject(object, anchor, project) {
  let corners = getOBBWorldCorners(object.pose.position, object.pose.quaternion, object.size);
  let projectedCorners = corners.map((corner) => project(corner, anchor));
  return {
    id: object.id,
    center: project(object.pose.position, anchor),
    bounds: projectionBounds(projectedCorners),
    corners: projectedCorners,
  };
}

function createOrthographicSet(objects, anchor) {
  return {
    top: objects.map((object) => orthographicObject(object, anchor, projectTop)),
    front: objects.map((object) => orthographicObject(object, anchor, projectFront)),
    right: objects.map((object) => orthographicObject(object, anchor, projectRight)),
  };
}

function createAxonometricSet(objects, anchor) {
  return objects.map((object) => orthographicObject(object, anchor, projectAxonometric));
}

function validViewport(viewport) {
  return Boolean(
    viewport &&
    Number.isFinite(viewport.x) &&
    Number.isFinite(viewport.y) &&
    Number.isFinite(viewport.width) &&
    Number.isFinite(viewport.height) &&
    viewport.x >= 0 &&
    viewport.y >= 0 &&
    viewport.width > 0 &&
    viewport.height > 0
  );
}

export function projectPointWebGL(point, viewMatrix, projectionMatrix, viewport) {
  if (!isFiniteVector(point, 3) || !isFiniteMatrix4(viewMatrix) || !isFiniteMatrix4(projectionMatrix)) {
    return { status: 'UNAVAILABLE', reason: 'invalid-projection-matrix', point: null };
  }
  if (!validViewport(viewport)) {
    return { status: 'UNAVAILABLE', reason: 'invalid-viewport', point: null };
  }
  let clip = multiplyMatrixVector4(multiplyMatrices(projectionMatrix, viewMatrix), [...point, 1]);
  if (!Number.isFinite(clip[3]) || clip[3] <= 0) {
    return { status: 'UNAVAILABLE', reason: 'clip-w-non-positive', point: null };
  }
  let ndc = clip.slice(0, 3).map((component) => component / clip[3]);
  if (!ndc.every(Number.isFinite)) {
    return { status: 'UNAVAILABLE', reason: 'clip-coordinate-non-finite', point: null };
  }
  if (ndc[2] < -1 || ndc[2] > 1) {
    return { status: 'UNAVAILABLE', reason: 'clip-depth-out-of-range', point: null };
  }
  return {
    status: 'READY',
    reason: null,
    point: {
      x: viewport.x + (ndc[0] + 1) * viewport.width / 2,
      y: viewport.y + (1 - ndc[1]) * viewport.height / 2,
      depth: ndc[2],
    },
  };
}

function stereoObject(object, view) {
  let corners = getOBBWorldCorners(object.pose.position, object.pose.quaternion, object.size);
  let projections = corners.map((corner) => projectPointWebGL(
    corner,
    view.viewMatrix,
    view.projectionMatrix,
    view.viewport,
  ));
  let unavailable = projections.find((projection) => projection.status !== 'READY');
  return {
    id: object.id,
    status: unavailable ? 'UNAVAILABLE' : 'READY',
    reason: unavailable?.reason || null,
    corners: projections.map((projection) => projection.point),
  };
}

function createStereoSet(targetObjects, observedObjects, views) {
  let eyes = {};
  for (let eye of ['left', 'right']) {
    let view = views.find((candidate) => candidate.eye === eye);
    if (!view || !isFiniteMatrix4(view.viewMatrix) || !isFiniteMatrix4(view.projectionMatrix) || !validViewport(view.viewport)) {
      return {
        status: 'UNAVAILABLE',
        reason: `missing-${eye}-view-evidence`,
        eyes: null,
      };
    }
    eyes[eye] = {
      viewport: { ...view.viewport },
      target: targetObjects.map((object) => stereoObject(object, view)),
      observed: observedObjects.map((object) => stereoObject(object, view)),
    };
  }
  let unavailable = Object.values(eyes).flatMap((eye) => [...eye.target, ...eye.observed])
    .find((object) => object.status !== 'READY');
  return {
    status: unavailable ? 'UNAVAILABLE' : 'READY',
    reason: unavailable?.reason || null,
    eyes,
  };
}

function targetObjects(target) {
  return (target?.objects || []).map((object) => ({
    id: object.id,
    pose: object.expectedPose,
    size: object.size,
  }));
}

function observedObjects(observation) {
  return (observation?.objects || []).map((object) => ({
    id: object.id,
    pose: object.pose,
    size: object.size,
  }));
}

export function projectObservations(target, observation) {
  let expected = targetObjects(target);
  let observed = observedObjects(observation);
  let complete = [...expected, ...observed].every((object) => (
    object.id &&
    object.pose &&
    isFiniteVector(object.pose.position, 3) &&
    isFiniteVector(object.pose.quaternion, 4) &&
    isFiniteVector(object.size, 3) &&
    object.size.every((value) => value > 0)
  ));
  if (!complete) {
    return {
      version: XR_SPATIAL_PROJECTION_VERSION,
      orthographic: { status: 'UNAVAILABLE', reason: 'missing-object-evidence', unit: 'meters', target: null, observed: null },
      axonometric: {
        status: 'UNAVAILABLE',
        reason: 'missing-object-evidence',
        referenceOnly: true,
        metric: false,
        target: null,
        observed: null,
      },
      stereo: { status: 'UNAVAILABLE', reason: 'missing-object-evidence', eyes: null },
    };
  }
  let anchor = [0, 0, 0];
  return {
    version: XR_SPATIAL_PROJECTION_VERSION,
    orthographic: {
      status: 'READY',
      reason: null,
      unit: 'meters',
      axes: {
        top: { horizontal: '+x', vertical: '-z' },
        front: { horizontal: '+x', vertical: '-y' },
        right: { horizontal: '-z', vertical: '-y' },
      },
      target: createOrthographicSet(expected, anchor),
      observed: createOrthographicSet(observed, anchor),
    },
    axonometric: {
      status: 'READY',
      reason: null,
      referenceOnly: true,
      metric: false,
      target: createAxonometricSet(expected, anchor),
      observed: createAxonometricSet(observed, anchor),
    },
    stereo: createStereoSet(expected, observed, observation?.views || []),
  };
}
