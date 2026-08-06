import { CONNECTION_MARKER_METRICS } from '../tokens/scale.js';

const NON_MARKER_KINDS = new Set([
  'association',
  'containment',
  'reference',
  'secondary',
]);

export function resolveConnectionMarker(points, conn, options = {}) {
  const requestedRole = conn.design?.marker?.role || 'none';
  const kind = conn.kind || conn.type || '';
  const direction = conn.direction;
  const isDirected = direction === 'forward' || direction === 'reverse' || direction === 'both';
  const isPrimary = !NON_MARKER_KINDS.has(kind);
  const role = isDirected && isPrimary && (requestedRole === 'flow' || requestedRole === 'gate')
    ? requestedRole
    : 'none';

  const portClearance = options.portClearance ?? CONNECTION_MARKER_METRICS.portClearance;
  const bendClearance = options.bendClearance ?? CONNECTION_MARKER_METRICS.bendClearance;
  const labelClearance = options.labelClearance ?? CONNECTION_MARKER_METRICS.labelClearance;
  const configuredMinMarkerLength = options.minMarkerLength ?? CONNECTION_MARKER_METRICS.minMarkerLength;
  const markerFootprint = role === 'flow'
    ? CONNECTION_MARKER_METRICS.flowWidth
    : role === 'gate'
      ? CONNECTION_MARKER_METRICS.gateSize
      : 0;
  const minMarkerLength = Math.max(configuredMinMarkerLength, markerFootprint);

  const hasLabel = Boolean(conn.label || conn.metadata?.label);

  const dists = [0];
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    totalLength += d;
    dists.push(totalLength);
  }

  const labelCenter = totalLength * 0.5;

  let bestSegmentIndex = -1;
  let bestSafeInterval = null;
  let bestSafeLength = -1;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const segmentLength = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (segmentLength < 1e-3) continue;

    let startSafe = 0;
    let endSafe = segmentLength;

    if (i === 0) {
      startSafe = Math.max(startSafe, portClearance);
    }
    if (i === points.length - 2) {
      endSafe = Math.min(endSafe, segmentLength - portClearance);
    }

    if (i > 0) {
      startSafe = Math.max(startSafe, bendClearance);
    }
    if (i < points.length - 2) {
      endSafe = Math.min(endSafe, segmentLength - bendClearance);
    }

    if (hasLabel) {
      const segStartDist = dists[i];
      const segEndDist = dists[i + 1];
      if (labelCenter >= segStartDist && labelCenter <= segEndDist) {
        const labelLocal = labelCenter - segStartDist;
        const leftLen = Math.max(0, (labelLocal - labelClearance) - startSafe);
        const rightLen = Math.max(0, endSafe - (labelLocal + labelClearance));
        if (leftLen >= rightLen && leftLen > 0) {
          endSafe = labelLocal - labelClearance;
        } else if (rightLen > 0) {
          startSafe = labelLocal + labelClearance;
        } else {
          startSafe = endSafe;
        }
      }
    }

    const safeLength = endSafe - startSafe;
    if (safeLength + 1e-5 >= minMarkerLength) {
      const localMid = (startSafe + endSafe) * 0.5;
      const midDistAlongRoute = dists[i] + localMid;
      const distToCenter = Math.abs(midDistAlongRoute - totalLength * 0.5);

      let isBetter = false;
      if (bestSegmentIndex === -1) {
        isBetter = true;
      } else if (safeLength > bestSafeLength + 1e-5) {
        isBetter = true;
      } else if (Math.abs(safeLength - bestSafeLength) < 1e-5) {
        const bestLocalMid = (bestSafeInterval.start + bestSafeInterval.end) * 0.5;
        const bestMidDist = dists[bestSegmentIndex] + bestLocalMid;
        const bestDistToCenter = Math.abs(bestMidDist - totalLength * 0.5);
        if (distToCenter < bestDistToCenter - 1e-5) {
          isBetter = true;
        } else if (Math.abs(distToCenter - bestDistToCenter) < 1e-5) {
          if (i < bestSegmentIndex) {
            isBetter = true;
          }
        }
      }

      if (isBetter) {
        bestSegmentIndex = i;
        bestSafeInterval = { start: startSafe, end: endSafe };
        bestSafeLength = safeLength;
      }
    }
  }

  const drawModel = {
    type: 'none',
    x: 0,
    y: 0,
    angle: 0,
    direction: conn.direction || 'none',
  };

  if (role !== 'none') {
    if (bestSegmentIndex !== -1) {
      const p1 = points[bestSegmentIndex];
      const p2 = points[bestSegmentIndex + 1];
      const localMid = (bestSafeInterval.start + bestSafeInterval.end) * 0.5;
      const segmentLength = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const ratio = localMid / segmentLength;

      drawModel.type = role;
      drawModel.x = p1.x + (p2.x - p1.x) * ratio;
      drawModel.y = p1.y + (p2.y - p1.y) * ratio;

      let angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      if (conn.direction === 'reverse') {
        angle += Math.PI;
      }
      drawModel.angle = angle;
    }
  }

  return drawModel;
}

export function resolveContainmentJunctions(connections, routePointsById, options = {}) {
  const minTrunk = Math.max(
    options.minTrunk ?? CONNECTION_MARKER_METRICS.minTrunk,
    CONNECTION_MARKER_METRICS.junctionRadius,
  );
  const minTail = Math.max(
    options.minTail ?? CONNECTION_MARKER_METRICS.minTail,
    CONNECTION_MARKER_METRICS.junctionRadius,
  );

  const getPoints = (id) => {
    if (routePointsById instanceof Map) return routePointsById.get(id);
    if (routePointsById && typeof routePointsById === 'object') return routePointsById[id];
    return null;
  };

  const groups = new Map();
  for (const conn of connections) {
    const kind = conn.kind || conn.type || '';
    if (kind !== 'containment') continue;

    const from = conn.from || conn.source?.nodeId;
    const out = conn.out || conn.source?.portId || 'out';
    if (!from) continue;

    const key = `${from}::${out}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(conn);
  }

  const junctions = [];

  for (const [groupKey, groupConns] of groups.entries()) {
    if (groupConns.length < 2) continue;

    groupConns.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const candidates = [];

    for (let i = 0; i < groupConns.length; i++) {
      for (let j = i + 1; j < groupConns.length; j++) {
        const cA = groupConns[i];
        const cB = groupConns[j];
        const ptsA = getPoints(cA.id);
        const ptsB = getPoints(cB.id);
        if (!ptsA || ptsA.length < 2 || !ptsB || ptsB.length < 2) continue;

        const D = findMaxSharedTrunk(ptsA, ptsB);
        if (D < minTrunk) continue;

        const pBranch = getPointAtDistance(ptsA, D);
        candidates.push({ D, x: pBranch.x, y: pBranch.y, connections: [cA, cB] });
      }
    }

    const uniqueJunctions = [];
    for (const cand of candidates) {
      const sharing = [];
      for (const conn of groupConns) {
        const pts = getPoints(conn.id);
        if (!pts || pts.length < 2) continue;

        const pAtD = getPointAtDistance(pts, cand.D);
        if (Math.hypot(pAtD.x - cand.x, pAtD.y - cand.y) < 0.5) {
          const len = getRouteLength(pts);
          if (len - cand.D >= minTail) {
            sharing.push({ conn, pts });
          }
        }
      }

      if (sharing.length < 2) continue;

      if (!hasAtLeastTwoDistinctTangents(sharing.map(s => s.pts), cand.D)) {
        continue;
      }

      const connectionIds = sharing.map(s => String(s.conn.id)).sort();
      const ownerId = connectionIds[0];
      const duplicate = uniqueJunctions.find(j => Math.hypot(j.x - cand.x, j.y - cand.y) < 1.0);
      if (!duplicate) {
        uniqueJunctions.push({
          branchDistance: cand.D,
          ownerId,
          connectionIds,
          type: 'junction',
          x: cand.x,
          y: cand.y,
          angle: 0,
        });
      }
    }

    let resolvedJunctions = coalesceNestedJunctions(uniqueJunctions);

    let occurrences = new Map();
    for (let junction of resolvedJunctions) {
      let signature = `${groupKey}\u001e${junction.connectionIds.join('\u001f')}`;
      let occurrence = occurrences.get(signature) || 0;
      occurrences.set(signature, occurrence + 1);
      let result = { ...junction };
      delete result.branchDistance;
      junctions.push({
        ...result,
        key: `junction::${encodeURIComponent(signature)}::${occurrence}`,
      });
    }
  }

  return junctions;
}

function coalesceNestedJunctions(junctions) {
  let cellSize = CONNECTION_MARKER_METRICS.junctionRadius * 2;
  let collisionDistanceSq = cellSize * cellSize;
  let candidates = [...junctions].sort(compareJunctionPriority);
  let representatives = [];
  let spatialHash = new Map();

  for (let candidate of candidates) {
    let cellX = Math.floor(candidate.x / cellSize);
    let cellY = Math.floor(candidate.y / cellSize);
    let representative = findNestedRepresentative(
      spatialHash,
      candidate,
      cellX,
      cellY,
      collisionDistanceSq,
    );

    if (representative) {
      let connectionIds = [...new Set([
        ...representative.junction.connectionIds,
        ...candidate.connectionIds,
      ])].sort();
      representative.junction.connectionIds = connectionIds;
      representative.junction.ownerId = connectionIds[0];
      continue;
    }

    let entry = {
      junction: {
        ...candidate,
        connectionIds: [...candidate.connectionIds],
      },
      priority: representatives.length,
    };
    representatives.push(entry);

    let key = `${cellX},${cellY}`;
    let entries = spatialHash.get(key);
    if (!entries) {
      entries = [];
      spatialHash.set(key, entries);
    }
    entries.push(entry);
  }

  return representatives
    .map(entry => entry.junction)
    .sort(compareJunctionPosition);
}

function findNestedRepresentative(spatialHash, candidate, cellX, cellY, collisionDistanceSq) {
  let best = null;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      let entries = spatialHash.get(`${cellX + dx},${cellY + dy}`);
      if (!entries) continue;

      for (let entry of entries) {
        if (!isSortedSubset(candidate.connectionIds, entry.junction.connectionIds)) continue;

        let distanceSq = (entry.junction.x - candidate.x) ** 2
          + (entry.junction.y - candidate.y) ** 2;
        if (distanceSq >= collisionDistanceSq) continue;
        if (!best || entry.priority < best.priority) {
          best = entry;
        }
      }
    }
  }

  return best;
}

function isSortedSubset(subset, superset) {
  let subsetIndex = 0;
  let supersetIndex = 0;

  while (subsetIndex < subset.length && supersetIndex < superset.length) {
    if (subset[subsetIndex] === superset[supersetIndex]) {
      subsetIndex++;
      supersetIndex++;
    } else if (subset[subsetIndex] > superset[supersetIndex]) {
      supersetIndex++;
    } else {
      return false;
    }
  }

  return subsetIndex === subset.length;
}

function compareJunctionPriority(a, b) {
  return b.connectionIds.length - a.connectionIds.length
    || compareJunctionPosition(a, b);
}

function compareJunctionPosition(a, b) {
  return a.branchDistance - b.branchDistance
    || a.x - b.x
    || a.y - b.y
    || a.connectionIds.join('\u001f').localeCompare(b.connectionIds.join('\u001f'));
}

function getRouteLength(points) {
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) {
    len += Math.hypot(points[i+1].x - points[i].x, points[i+1].y - points[i].y);
  }
  return len;
}

function getPointAtDistance(points, d) {
  if (points.length === 0) return { x: 0, y: 0 };
  if (d <= 0) return { x: points[0].x, y: points[0].y };
  let accum = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (accum + segLen >= d) {
      const ratio = (d - accum) / segLen;
      return {
        x: p1.x + (p2.x - p1.x) * ratio,
        y: p1.y + (p2.y - p1.y) * ratio,
      };
    }
    accum += segLen;
  }
  return { x: points[points.length - 1].x, y: points[points.length - 1].y };
}

function getVertexDistances(points) {
  const dists = [0];
  let accum = 0;
  for (let i = 0; i < points.length - 1; i++) {
    accum += Math.hypot(points[i+1].x - points[i].x, points[i+1].y - points[i].y);
    dists.push(accum);
  }
  return dists;
}

function findMaxSharedTrunk(pointsA, pointsB) {
  const pA0 = pointsA[0];
  const pB0 = pointsB[0];
  if (Math.hypot(pA0.x - pB0.x, pA0.y - pB0.y) > 1.0) {
    return 0;
  }

  const distsA = getVertexDistances(pointsA);
  const distsB = getVertexDistances(pointsB);
  const lenA = distsA[distsA.length - 1];
  const lenB = distsB[distsB.length - 1];

  const allDists = [...new Set([...distsA, ...distsB])].sort((a, b) => a - b);
  let D = 0;
  for (let i = 1; i < allDists.length; i++) {
    const d = allDists[i];
    if (d > Math.min(lenA, lenB) + 1e-3) break;

    const pA = getPointAtDistance(pointsA, d);
    const pB = getPointAtDistance(pointsB, d);
    if (Math.hypot(pA.x - pB.x, pA.y - pB.y) < 0.5) {
      D = d;
    } else {
      break;
    }
  }
  return D;
}

function getOutgoingTangent(points, D) {
  const sampleDist = D + 5;
  const pBranch = getPointAtDistance(points, D);
  const pAhead = getPointAtDistance(points, sampleDist);
  const dx = pAhead.x - pBranch.x;
  const dy = pAhead.y - pBranch.y;
  const len = Math.hypot(dx, dy);
  return len > 1e-3 ? { x: dx / len, y: dy / len } : { x: 0, y: 0 };
}

function hasAtLeastTwoDistinctTangents(routes, D) {
  const tangents = routes.map(r => getOutgoingTangent(r, D));
  for (let i = 0; i < tangents.length; i++) {
    for (let j = i + 1; j < tangents.length; j++) {
      const dot = tangents[i].x * tangents[j].x + tangents[i].y * tangents[j].y;
      if (dot < 0.95) { // cosine of ~18 degrees
        return true;
      }
    }
  }
  return false;
}


export function projectConnectionMarkerGeometry(marker) {
  if (!marker || marker.type === 'none') return [];

  if (marker.type === 'flow') {
    const width = CONNECTION_MARKER_METRICS.flowWidth;
    const height = CONNECTION_MARKER_METRICS.flowHeight;
    const primitives = [{
      type: 'rect',
      x: -width / 2,
      y: -height / 2,
      width,
      height,
      fill: 'trace',
    }];

    if (marker.direction === 'both') {
      const tip = CONNECTION_MARKER_METRICS.flowBidirectionalTipX;
      const base = CONNECTION_MARKER_METRICS.flowBidirectionalBaseX;
      const halfHeight = CONNECTION_MARKER_METRICS.flowBidirectionalHalfHeight;
      primitives.push(
        {
          type: 'polygon',
          points: [[-tip, 0], [-base, -halfHeight], [-base, halfHeight]],
          fill: 'background',
        },
        {
          type: 'polygon',
          points: [[tip, 0], [base, -halfHeight], [base, halfHeight]],
          fill: 'background',
        }
      );
    } else {
      primitives.push({
        type: 'polygon',
        points: [
          [CONNECTION_MARKER_METRICS.flowArrowTailX, -CONNECTION_MARKER_METRICS.flowArrowHalfHeight],
          [CONNECTION_MARKER_METRICS.flowArrowTipX, 0],
          [CONNECTION_MARKER_METRICS.flowArrowTailX, CONNECTION_MARKER_METRICS.flowArrowHalfHeight],
        ],
        fill: 'background',
      });
    }
    return primitives;
  }

  if (marker.type === 'junction') {
    return [
      {
        type: 'circle',
        x: 0,
        y: 0,
        radius: CONNECTION_MARKER_METRICS.junctionRadius,
        fill: 'trace',
      },
      {
        type: 'circle',
        x: 0,
        y: 0,
        radius: CONNECTION_MARKER_METRICS.junctionInnerRadius,
        fill: 'background',
      },
    ];
  }

  if (marker.type === 'gate') {
    const size = CONNECTION_MARKER_METRICS.gateSize;
    return [{
      type: 'rect',
      x: -size / 2,
      y: -size / 2,
      width: size,
      height: size,
      fill: 'trace',
    }];
  }

  return [];
}

export function drawCanvasMarker(ctx, marker, traceColor, bgColor) {
  const primitives = projectConnectionMarkerGeometry(marker);
  if (primitives.length === 0) return;

  ctx.save();
  ctx.translate(marker.x, marker.y);
  ctx.rotate(marker.angle);
  ctx.strokeStyle = traceColor;

  for (const primitive of primitives) {
    ctx.fillStyle = primitive.fill === 'background' ? bgColor : traceColor;
    if (primitive.type === 'rect') {
      ctx.fillRect(primitive.x, primitive.y, primitive.width, primitive.height);
    } else if (primitive.type === 'circle') {
      ctx.beginPath();
      ctx.arc(primitive.x, primitive.y, primitive.radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (primitive.type === 'polygon') {
      ctx.beginPath();
      ctx.moveTo(primitive.points[0][0], primitive.points[0][1]);
      for (const point of primitive.points.slice(1)) {
        ctx.lineTo(point[0], point[1]);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.restore();
}

function orientation(px, py, qx, qy, rx, ry) {
  const val = (qy - py) * (rx - qx) - (qx - px) * (ry - qy);
  if (Math.abs(val) < 1e-9) return 0;
  return (val > 0) ? 1 : 2;
}

function onSegment(px, py, qx, qy, rx, ry) {
  return px <= Math.max(qx, rx) && px >= Math.min(qx, rx) &&
         py <= Math.max(qy, ry) && py >= Math.min(qy, ry);
}

function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const o1 = orientation(ax, ay, bx, by, cx, cy);
  const o2 = orientation(ax, ay, bx, by, dx, dy);
  const o3 = orientation(cx, cy, dx, dy, ax, ay);
  const o4 = orientation(cx, cy, dx, dy, bx, by);

  if (o1 !== o2 && o3 !== o4) return true;

  if (o1 === 0 && onSegment(cx, cy, ax, ay, bx, by)) return true;
  if (o2 === 0 && onSegment(dx, dy, ax, ay, bx, by)) return true;
  if (o3 === 0 && onSegment(ax, ay, cx, cy, dx, dy)) return true;
  if (o4 === 0 && onSegment(bx, by, cx, cy, dx, dy)) return true;

  return false;
}

function lineSegmentIntersectsBox(x1, y1, x2, y2, xmin, xmax, ymin, ymax) {
  if (x1 >= xmin && x1 <= xmax && y1 >= ymin && y1 <= ymax) return true;
  if (x2 >= xmin && x2 <= xmax && y2 >= ymin && y2 <= ymax) return true;

  if (segmentsIntersect(x1, y1, x2, y2, xmin, ymin, xmax, ymin)) return true;
  if (segmentsIntersect(x1, y1, x2, y2, xmax, ymin, xmax, ymax)) return true;
  if (segmentsIntersect(x1, y1, x2, y2, xmax, ymax, xmin, ymax)) return true;
  if (segmentsIntersect(x1, y1, x2, y2, xmin, ymax, xmin, ymin)) return true;

  return false;
}

function pointToSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) {
    return Math.hypot(px - ax, py - ay);
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function isConnectionMarkerOccluded(marker, ownerIds, markerPriority, protectedRoutes) {
  if (!marker || marker.type === 'none') {
    return false;
  }

  const isOwner = (routeId) => {
    if (!ownerIds) return false;
    if (typeof ownerIds.has === 'function') return ownerIds.has(routeId);
    if (typeof ownerIds.includes === 'function') return ownerIds.includes(routeId);
    return ownerIds === routeId;
  };

  for (const route of protectedRoutes) {
    if (isOwner(route.id)) continue;
    if (route.priority <= markerPriority) continue;

    const points = route.points;
    if (!points || points.length < 2) continue;

    if (marker.type === 'junction') {
      const radius = CONNECTION_MARKER_METRICS.junctionRadius;
      const limit = radius + route.halfWidth;
      for (let i = 0; i < points.length - 1; i++) {
        const d = pointToSegmentDistance(marker.x, marker.y, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
        if (d <= limit) {
          return true;
        }
      }
    } else if (marker.type === 'flow' || marker.type === 'gate') {
      const width = marker.type === 'flow' ? CONNECTION_MARKER_METRICS.flowWidth : CONNECTION_MARKER_METRICS.gateSize;
      const height = marker.type === 'flow' ? CONNECTION_MARKER_METRICS.flowHeight : CONNECTION_MARKER_METRICS.gateSize;
      const r = route.halfWidth;
      const xmin = -width / 2 - r;
      const xmax = width / 2 + r;
      const ymin = -height / 2 - r;
      const ymax = height / 2 + r;

      const cos = Math.cos(marker.angle);
      const sin = Math.sin(marker.angle);

      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];

        const dx1 = p1.x - marker.x;
        const dy1 = p1.y - marker.y;
        const lx1 = dx1 * cos + dy1 * sin;
        const ly1 = -dx1 * sin + dy1 * cos;

        const dx2 = p2.x - marker.x;
        const dy2 = p2.y - marker.y;
        const lx2 = dx2 * cos + dy2 * sin;
        const ly2 = -dx2 * sin + dy2 * cos;

        if (lineSegmentIntersectsBox(lx1, ly1, lx2, ly2, xmin, xmax, ymin, ymax)) {
          return true;
        }
      }
    }
  }

  return false;
}
