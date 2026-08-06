/**
 * @file xr/spatial-drag-controller.js
 * @description Pure math functions for ray/sphere hit testing and pointer drag projection.
 */

function numberOr(value, fallback = 0) {
  let n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function vector3(value, fallback = [0, 0, 0]) {
  return [
    numberOr(value?.[0], fallback[0]),
    numberOr(value?.[1], fallback[1]),
    numberOr(value?.[2], fallback[2]),
  ];
}

function normalizeVector3(value, fallback = [0, 0, -1]) {
  let v = vector3(value, fallback);
  let length = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
  if (!length) return [...fallback];
  return [v[0] / length, v[1] / length, v[2] / length];
}

function addVector3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scaleVector3(value, scale) {
  return [value[0] * scale, value[1] * scale, value[2] * scale];
}

function subtractVector3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dotVector3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function createPointerRecord(pointer) {
  return {
    kind: pointer.kind,
    origin: [...pointer.origin],
    direction: [...pointer.direction],
  };
}

/**
 * Normalizes mouse, ray, controller, and hand input into a shared pointer ray.
 *
 * @param {Object} pointer
 * @param {Object} [options]
 * @returns {Object|null}
 */
export function normalizeSpatialPointer(pointer = {}, options = {}) {
  if (!pointer || typeof pointer !== 'object') return null;

  let kind = pointer.kind || pointer.type || options.kind || 'ray';
  if (pointer.origin && pointer.direction) {
    return {
      kind,
      origin: vector3(pointer.origin),
      direction: normalizeVector3(pointer.direction),
    };
  }

  if (kind === 'mouse' || 'x' in pointer || 'clientX' in pointer) {
    let viewport = pointer.viewport || options.viewport || {};
    let width = numberOr(viewport.width, 1);
    let height = numberOr(viewport.height, 1);
    let x = numberOr(pointer.x ?? pointer.clientX, width / 2);
    let y = numberOr(pointer.y ?? pointer.clientY, height / 2);
    let camera = pointer.camera || options.camera || {};
    let origin = vector3(camera.position || pointer.origin, [0, 0, 0]);
    let forward = normalizeVector3(camera.forward, [0, 0, -1]);
    let right = normalizeVector3(camera.right, [1, 0, 0]);
    let up = normalizeVector3(camera.up, [0, 1, 0]);
    let fov = numberOr(camera.fov ?? options.fov, 60) * Math.PI / 180;
    let aspect = width / Math.max(height, 1);
    let nx = (x / Math.max(width, 1)) * 2 - 1;
    let ny = 1 - (y / Math.max(height, 1)) * 2;
    let tan = Math.tan(fov / 2);
    let direction = normalizeVector3(addVector3(
      addVector3(forward, scaleVector3(right, nx * aspect * tan)),
      scaleVector3(up, ny * tan)
    ));

    return { kind: 'mouse', origin, direction };
  }

  return null;
}

/**
 * Perform a ray-sphere intersection check.
 *
 * @param {Array<number>} origin - Ray origin [x, y, z].
 * @param {Array<number>} direction - Ray direction unit vector [x, y, z].
 * @param {Array<number>} center - Sphere center [x, y, z].
 * @param {number} radius - Sphere radius.
 * @returns {number|null} Distance to closest intersection, or null if no hit.
 */
export function intersectRaySphere(origin, direction, center, radius) {
  let rayOrigin = vector3(origin);
  let rayDirection = normalizeVector3(direction);
  let sphereCenter = vector3(center);
  let sphereRadius = numberOr(radius, 0);
  let vx = sphereCenter[0] - rayOrigin[0];
  let vy = sphereCenter[1] - rayOrigin[1];
  let vz = sphereCenter[2] - rayOrigin[2];

  let tc = vx * rayDirection[0] + vy * rayDirection[1] + vz * rayDirection[2];
  if (tc < 0) return null;

  let v2 = vx * vx + vy * vy + vz * vz;
  let d2 = v2 - tc * tc;
  let r2 = sphereRadius * sphereRadius;

  if (d2 > r2) return null;

  let t1 = Math.sqrt(r2 - d2);
  return tc - t1;
}

/**
 * Finds the closest node intersecting with a pointer ray.
 *
 * @param {Array} nodes - Spatial nodes.
 * @param {Object} pointer - Pointer state.
 * @param {Array<number>} pointer.origin - Ray origin [x, y, z].
 * @param {Array<number>} pointer.direction - Ray direction unit vector [x, y, z].
 * @param {Object} [options]
 * @returns {Object|null} Intersected node with data and distance, or null.
 */
export function hitTestSpatialNode(nodes, pointer, options = {}) {
  let normalizedPointer = normalizeSpatialPointer(pointer, options);
  if (!normalizedPointer) return null;
  let origin = normalizedPointer.origin;
  let direction = normalizedPointer.direction;

  let closestNode = null;
  let minDistance = Infinity;

  for (let node of nodes) {
    let nodePos = node.position || [node.x ?? 0, node.y ?? 0, node.z ?? 0];
    let nodeRadius = node.radius ?? 0.08;
    let dist = intersectRaySphere(origin, direction, nodePos, nodeRadius);

    if (dist !== null && dist < minDistance) {
      minDistance = dist;
      closestNode = node;
    }
  }

  return closestNode ? { node: closestNode, distance: minDistance } : null;
}

/**
 * Projects a ray onto a plane.
 * Plane is defined by a point on the plane and its normal vector.
 *
 * @param {Object} pointer
 * @param {Array<number>} pointer.origin - Ray origin [x, y, z].
 * @param {Array<number>} pointer.direction - Ray direction unit vector [x, y, z].
 * @param {Object} plane
 * @param {Array<number>} plane.point - Point on plane [x, y, z].
 * @param {Array<number>} plane.normal - Plane normal unit vector [x, y, z].
 * @param {Object} [options]
 * @returns {Array<number>|null} [x, y, z] intersection point on the plane, or null.
 */
export function projectPointerToDragPlane(pointer, plane, options = {}) {
  let normalizedPointer = normalizeSpatialPointer(pointer, options);
  if (!normalizedPointer) return null;
  let origin = normalizedPointer.origin;
  let direction = normalizedPointer.direction;
  let p0 = vector3(plane.point);
  let normal = normalizeVector3(plane.normal, [0, 0, 1]);

  let denom = dotVector3(direction, normal);

  if (Math.abs(denom) < 1e-6) return null;

  let num = (p0[0] - origin[0]) * normal[0] + (p0[1] - origin[1]) * normal[1] + (p0[2] - origin[2]) * normal[2];
  let t = num / denom;

  if (t < 0) return null;

  return [
    origin[0] + direction[0] * t,
    origin[1] + direction[1] * t,
    origin[2] + direction[2] * t
  ];
}

/**
 * Interaction controller that computes node position adjustments during drag.
 * Does not depend on DOM or renderer elements directly.
 */
export function createSpatialDragController(options = {}) {
  let activeDragNode = null;
  let dragPlane = null;
  let dragOffset = null; // offset between intersection point and node center
  let dragDepth = 0;
  let dragMode = options.mode || options.dragMode || 'drag-plane';
  let lastPointer = null;
  let lastPosition = null;

  function makeRecord(node, phase, position, pointer) {
    return {
      type: 'spatial-node-drag',
      nodeId: String(node.id),
      phase,
      position: [...position],
      pointer: createPointerRecord(pointer),
    };
  }

  function resetDrag() {
    activeDragNode = null;
    dragPlane = null;
    dragOffset = null;
    dragDepth = 0;
    lastPointer = null;
    lastPosition = null;
  }

  function resolveDepthLockedPosition(pointer) {
    let basePoint = addVector3(pointer.origin, scaleVector3(pointer.direction, dragDepth));
    return addVector3(basePoint, dragOffset || [0, 0, 0]);
  }

  function startDrag(node, pointer) {
    let normalizedPointer = normalizeSpatialPointer(pointer, options);
    if (!normalizedPointer) return null;
    if (node.fixed && options.allowFixedDrag !== true) return null;

    activeDragNode = node;
    let nodePos = vector3(node.position || [node.x ?? 0, node.y ?? 0, node.z ?? 0]);

    let planeNormal = options.dragPlaneNormal
      ? normalizeVector3(options.dragPlaneNormal)
      : scaleVector3(normalizedPointer.direction, -1);

    dragPlane = {
      point: [...nodePos],
      normal: planeNormal,
    };

    let intersect = dragMode === 'depth-lock'
      ? addVector3(normalizedPointer.origin, scaleVector3(normalizedPointer.direction, dotVector3(subtractVector3(nodePos, normalizedPointer.origin), normalizedPointer.direction)))
      : projectPointerToDragPlane(normalizedPointer, dragPlane);

    if (intersect) {
      dragOffset = subtractVector3(nodePos, intersect);
    } else {
      dragOffset = [0, 0, 0];
    }

    dragDepth = Math.max(0, dotVector3(subtractVector3(nodePos, normalizedPointer.origin), normalizedPointer.direction));
    lastPointer = normalizedPointer;
    lastPosition = [...nodePos];

    return makeRecord(node, 'start', nodePos, normalizedPointer);
  }

  function moveDrag(pointer) {
    if (!activeDragNode || !dragPlane || !dragOffset) return null;

    let normalizedPointer = normalizeSpatialPointer(pointer, options);
    if (!normalizedPointer) return null;

    let nextPos;
    if (dragMode === 'depth-lock') {
      nextPos = resolveDepthLockedPosition(normalizedPointer);
    } else {
      let intersect = projectPointerToDragPlane(normalizedPointer, dragPlane);
      if (!intersect) return null;
      nextPos = addVector3(intersect, dragOffset);
    }

    lastPointer = normalizedPointer;
    lastPosition = [...nextPos];
    return makeRecord(activeDragNode, 'move', nextPos, normalizedPointer);
  }

  function endDrag() {
    if (!activeDragNode) return null;
    let prevNode = activeDragNode;
    let pointer = lastPointer || { kind: 'ray', origin: [0, 0, 0], direction: [0, 0, -1] };
    let position = lastPosition || vector3(prevNode.position || [prevNode.x ?? 0, prevNode.y ?? 0, prevNode.z ?? 0]);
    let record = makeRecord(prevNode, 'end', position, pointer);
    resetDrag();
    return record;
  }

  function cancelDrag(pointer = lastPointer) {
    if (!activeDragNode) return null;
    let prevNode = activeDragNode;
    let normalizedPointer = normalizeSpatialPointer(pointer, options) || lastPointer || {
      kind: 'ray',
      origin: [0, 0, 0],
      direction: [0, 0, -1],
    };
    let position = lastPosition || vector3(prevNode.position || [prevNode.x ?? 0, prevNode.y ?? 0, prevNode.z ?? 0]);
    let record = makeRecord(prevNode, 'cancel', position, normalizedPointer);
    resetDrag();
    return record;
  }

  return {
    startDrag,
    moveDrag,
    endDrag,
    cancelDrag,
    get activeNode() { return activeDragNode; },
    get mode() { return dragMode; },
  };
}
