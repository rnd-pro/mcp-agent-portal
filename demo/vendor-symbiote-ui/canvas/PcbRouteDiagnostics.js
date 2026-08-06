const DEFAULT_RULE_COUNTS = {
  nodeIntersection: 0,
  reversal: 0,
  longDiagonal: 0,
  selfIntersection: 0,
  inefficient: 0,
  sharedChannel: 0,
  endpointOverlap: 0,
};

export const PCB_ROUTE_HARD_RULES = Object.freeze([
  'nodeIntersection',
  'reversal',
  'longDiagonal',
  'selfIntersection',
]);

export const PCB_ROUTE_SOFT_RULES = Object.freeze([
  'inefficient',
  'sharedChannel',
  'endpointOverlap',
]);

function pickRuleCounts(byRule, rules) {
  const counts = {};
  for (const rule of rules) {
    counts[rule] = byRule?.[rule] || 0;
  }
  return counts;
}

function sumRuleCounts(byRule, rules) {
  return rules.reduce((total, rule) => total + (byRule?.[rule] || 0), 0);
}

export function summarizePcbRouteQuality(summary) {
  const byRule = { ...DEFAULT_RULE_COUNTS, ...(summary?.byRule || {}) };
  const hardFailures = sumRuleCounts(byRule, PCB_ROUTE_HARD_RULES);
  const softWarnings = sumRuleCounts(byRule, PCB_ROUTE_SOFT_RULES);
  const classified = hardFailures + softWarnings;
  const total = Number(summary?.total) || Object.values(byRule).reduce((sum, count) => sum + count, 0);
  return {
    pass: hardFailures === 0,
    hardFailures,
    softWarnings,
    unclassified: Math.max(0, total - classified),
    total,
    hardRules: pickRuleCounts(byRule, PCB_ROUTE_HARD_RULES),
    softRules: pickRuleCounts(byRule, PCB_ROUTE_SOFT_RULES),
  };
}

function rectX(rect) {
  return Number(rect?.x) || 0;
}

function rectY(rect) {
  return Number(rect?.y) || 0;
}

function rectW(rect) {
  return Number(rect?.w ?? rect?.width) || 0;
}

function rectH(rect) {
  return Number(rect?.h ?? rect?.height) || 0;
}

function normalizeRect(rect) {
  return {
    ...rect,
    id: rect?.id,
    x: rectX(rect),
    y: rectY(rect),
    w: rectW(rect),
    h: rectH(rect),
  };
}

function addViolation(violations, rule, details = {}) {
  violations.push({ rule, ...details });
}

function summarize(violations) {
  const byRule = { ...DEFAULT_RULE_COUNTS };
  for (const violation of violations) {
    byRule[violation.rule] = (byRule[violation.rule] || 0) + 1;
  }
  return {
    total: violations.length,
    byRule,
  };
}

export function parsePcbPathPoints(path) {
  const commands = String(path || '').match(/[MLHV][^MLHV]*/gi) || [];
  let x = 0;
  let y = 0;
  const points = [];

  for (const command of commands) {
    const type = command[0].toUpperCase();
    const values = command.slice(1).trim().split(/[ ,]+/).filter(Boolean).map(Number);
    if (type === 'M' || type === 'L') {
      [x, y] = values;
    } else if (type === 'H') {
      [x] = values;
    } else if (type === 'V') {
      [y] = values;
    }
    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push({ x, y });
    }
  }

  return points;
}

export function routeLength(points) {
  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    length += Math.abs(points[index + 1].x - points[index].x) + Math.abs(points[index + 1].y - points[index].y);
  }
  return length;
}

export function segmentDirections(points) {
  const directions = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    directions.push(Math.abs(dx) >= Math.abs(dy)
      ? { axis: 'x', sign: Math.sign(dx), length: Math.abs(dx) }
      : { axis: 'y', sign: Math.sign(dy), length: Math.abs(dy) });
  }
  return directions;
}

export function countBends(points) {
  const directions = segmentDirections(points);
  let bends = 0;
  for (let index = 1; index < directions.length; index += 1) {
    if (directions[index].axis !== directions[index - 1].axis) bends += 1;
  }
  return bends;
}

export function countReversals(points, grid = 10) {
  const directions = segmentDirections(points);
  let reversals = 0;
  for (let index = 1; index < directions.length; index += 1) {
    const prev = directions[index - 1];
    const curr = directions[index];
    if (prev.axis === curr.axis && prev.sign === -curr.sign) {
      reversals += 1;
    }
    const before = directions[index - 2];
    if (
      before &&
      before.axis === curr.axis &&
      before.sign === -curr.sign &&
      prev.length <= grid * 2
    ) {
      reversals += 1;
    }
  }
  return reversals;
}

function pointInRect(point, rect, pad = 0) {
  return (
    point.x >= rect.x - pad &&
    point.x <= rect.x + rect.w + pad &&
    point.y >= rect.y - pad &&
    point.y <= rect.y + rect.h + pad
  );
}

function rectsOverlap(a, b, pad = 0) {
  return !(
    a.x + a.w + pad < b.x - pad ||
    b.x + b.w + pad < a.x - pad ||
    a.y + a.h + pad < b.y - pad ||
    b.y + b.h + pad < a.y - pad
  );
}

function orientation(a, b, c) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 0.5) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(a, b, c) {
  return (
    b.x <= Math.max(a.x, c.x) + 0.5 &&
    b.x >= Math.min(a.x, c.x) - 0.5 &&
    b.y <= Math.max(a.y, c.y) + 0.5 &&
    b.y >= Math.min(a.y, c.y) - 0.5
  );
}

function segmentsIntersect(a1, a2, b1, b2) {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a1, b1, a2)) return true;
  if (o2 === 0 && onSegment(a1, b2, a2)) return true;
  if (o3 === 0 && onSegment(b1, a1, b2)) return true;
  if (o4 === 0 && onSegment(b1, a2, b2)) return true;
  return false;
}

function segmentIntersectsRect(a, b, rect, pad = 0) {
  const expanded = {
    x: rect.x - pad,
    y: rect.y - pad,
    w: rect.w + pad * 2,
    h: rect.h + pad * 2,
  };
  if (pointInRect(a, expanded) || pointInRect(b, expanded)) return true;

  const left = expanded.x;
  const right = expanded.x + expanded.w;
  const top = expanded.y;
  const bottom = expanded.y + expanded.h;
  const edges = [
    [{ x: left, y: top }, { x: right, y: top }],
    [{ x: right, y: top }, { x: right, y: bottom }],
    [{ x: right, y: bottom }, { x: left, y: bottom }],
    [{ x: left, y: bottom }, { x: left, y: top }],
  ];

  return edges.some(([edgeStart, edgeEnd]) => segmentsIntersect(a, b, edgeStart, edgeEnd));
}

function segmentCrossesRectInterior(a, b, rect, inset = 3) {
  const inner = {
    x: rect.x + inset,
    y: rect.y + inset,
    w: rect.w - inset * 2,
    h: rect.h - inset * 2,
  };
  if (inner.w <= 0 || inner.h <= 0) return false;
  return segmentIntersectsRect(a, b, inner, 0);
}

function pointOnRectBoundary(point, rect, tolerance = 0.25) {
  const withinX = point.x >= rect.x - tolerance && point.x <= rect.x + rect.w + tolerance;
  const withinY = point.y >= rect.y - tolerance && point.y <= rect.y + rect.h + tolerance;
  if (!withinX || !withinY) return false;
  return (
    Math.abs(point.x - rect.x) <= tolerance ||
    Math.abs(point.x - (rect.x + rect.w)) <= tolerance ||
    Math.abs(point.y - rect.y) <= tolerance ||
    Math.abs(point.y - (rect.y + rect.h)) <= tolerance
  );
}

function countLongDiagonals(points, maxLength) {
  let count = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const dx = Math.abs(points[index + 1].x - points[index].x);
    const dy = Math.abs(points[index + 1].y - points[index].y);
    if (dx > 0.5 && dy > 0.5 && Math.hypot(dx, dy) > maxLength) {
      count += 1;
    }
  }
  return count;
}

function countRouteLongDiagonals(routePoints, renderedPoints, maxLength, straightLineAllowance) {
  if (routePoints.length <= 2 && routeLength(routePoints) <= straightLineAllowance) {
    return 0;
  }
  return countLongDiagonals(renderedPoints, maxLength);
}

function samePoint(a, b) {
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
}

function countSelfIntersections(points) {
  let count = 0;
  for (let aIndex = 0; aIndex < points.length - 1; aIndex += 1) {
    for (let bIndex = aIndex + 2; bIndex < points.length - 1; bIndex += 1) {
      const a1 = points[aIndex];
      const a2 = points[aIndex + 1];
      const b1 = points[bIndex];
      const b2 = points[bIndex + 1];
      if (samePoint(a2, b1)) continue;
      if (aIndex === 0 && bIndex === points.length - 2 && samePoint(a1, b2)) continue;
      if (segmentsIntersect(a1, a2, b1, b2)) count += 1;
    }
  }
  return count;
}

function sharedOrthogonalLength(a1, a2, b1, b2) {
  if (Math.abs(a1.x - a2.x) < 0.5 && Math.abs(b1.x - b2.x) < 0.5 && Math.abs(a1.x - b1.x) < 0.5) {
    const aMin = Math.min(a1.y, a2.y);
    const aMax = Math.max(a1.y, a2.y);
    const bMin = Math.min(b1.y, b2.y);
    const bMax = Math.max(b1.y, b2.y);
    return Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin));
  }

  if (Math.abs(a1.y - a2.y) < 0.5 && Math.abs(b1.y - b2.y) < 0.5 && Math.abs(a1.y - b1.y) < 0.5) {
    const aMin = Math.min(a1.x, a2.x);
    const aMax = Math.max(a1.x, a2.x);
    const bMin = Math.min(b1.x, b2.x);
    const bMax = Math.max(b1.x, b2.x);
    return Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin));
  }

  return 0;
}

export function maxSharedMiddleSegmentLength(aPoints, bPoints) {
  let max = 0;
  for (let aIndex = 1; aIndex < aPoints.length - 2; aIndex += 1) {
    for (let bIndex = 1; bIndex < bPoints.length - 2; bIndex += 1) {
      max = Math.max(max, sharedOrthogonalLength(
        aPoints[aIndex],
        aPoints[aIndex + 1],
        bPoints[bIndex],
        bPoints[bIndex + 1]
      ));
    }
  }
  return max;
}

export function analyzePcbRoute({
  id = '',
  path = '',
  points = [],
  fromRect = null,
  toRect = null,
  rects = [],
  grid = 10,
  pad = 1,
  maxDiagonal = 12,
  straightLineAllowance = 80,
  maxLengthRatio = 2.4,
} = {}) {
  const routePoints = points.length ? points : parsePcbPathPoints(path);
  const renderedPoints = path ? parsePcbPathPoints(path) : routePoints;
  const normalizedRects = rects.map(normalizeRect);
  const sourceId = fromRect?.id;
  const targetId = toRect?.id;
  const normalizedSource = normalizedRects.find((rect) => rect.id === sourceId) || (fromRect ? normalizeRect(fromRect) : null);
  const normalizedTarget = normalizedRects.find((rect) => rect.id === targetId) || (toRect ? normalizeRect(toRect) : null);
  const endpointsOverlap = normalizedSource && normalizedTarget && rectsOverlap(normalizedSource, normalizedTarget, pad);
  const violations = [];

  if (endpointsOverlap) {
    addViolation(violations, 'endpointOverlap', { routeId: id, rectIds: [sourceId, targetId].filter(Boolean) });
  }

  for (let index = 0; index < routePoints.length - 1; index += 1) {
    for (const rect of normalizedRects) {
      if (endpointsOverlap && (rect.id === sourceId || rect.id === targetId)) continue;
      const crossesEndpointInterior = segmentCrossesRectInterior(routePoints[index], routePoints[index + 1], rect);
      const nearSourceEndpoint = rect.id === sourceId && index <= 1;
      const nearTargetEndpoint = rect.id === targetId && index >= routePoints.length - 3;
      const endpointEdgeSegment =
        (nearSourceEndpoint || nearTargetEndpoint) &&
        !crossesEndpointInterior &&
        (pointOnRectBoundary(routePoints[index], rect) || pointOnRectBoundary(routePoints[index + 1], rect));
      if (endpointEdgeSegment) continue;
      const sourceStub = rect.id === sourceId && index === 0 && !crossesEndpointInterior;
      const targetStub = rect.id === targetId && index === routePoints.length - 2 && !crossesEndpointInterior;
      if (sourceStub || targetStub) continue;
      if (segmentIntersectsRect(routePoints[index], routePoints[index + 1], rect, pad)) {
        addViolation(violations, 'nodeIntersection', { routeId: id, rectId: rect.id, segmentIndex: index });
      }
    }
  }

  const reversals = countReversals(routePoints, grid);
  for (let index = 0; index < reversals; index += 1) {
    addViolation(violations, 'reversal', { routeId: id });
  }

  const longDiagonals = countRouteLongDiagonals(routePoints, renderedPoints, maxDiagonal, straightLineAllowance);
  for (let index = 0; index < longDiagonals; index += 1) {
    addViolation(violations, 'longDiagonal', { routeId: id });
  }

  const selfIntersections = countSelfIntersections(routePoints);
  for (let index = 0; index < selfIntersections; index += 1) {
    addViolation(violations, 'selfIntersection', { routeId: id });
  }

  if (routePoints.length >= 2 && Number.isFinite(maxLengthRatio)) {
    const start = routePoints[0];
    const end = routePoints.at(-1);
    const shortest = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
    const length = routeLength(routePoints);
    const inefficientLimit = Math.max(shortest * maxLengthRatio, shortest + straightLineAllowance * 2);
    if (shortest > 0 && length > inefficientLimit) {
      addViolation(violations, 'inefficient', {
        routeId: id,
        ratio: length / shortest,
        length,
        shortest,
      });
    }
  }

  return {
    id,
    metrics: {
      length: routeLength(routePoints),
      bends: countBends(routePoints),
      reversals,
      longDiagonals,
      selfIntersections,
    },
    violations,
    summary: summarize(violations),
  };
}

export function analyzePcbRouteSet(routes = [], options = {}) {
  const routeResults = routes.map((route) => analyzePcbRoute({ ...options, ...route }));
  const sharedViolations = [];
  const maxSharedMiddleSegment = options.maxSharedMiddleSegment ?? 1;

  for (let aIndex = 0; aIndex < routes.length - 1; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < routes.length; bIndex += 1) {
      const aPoints = routes[aIndex].points?.length ? routes[aIndex].points : parsePcbPathPoints(routes[aIndex].path);
      const bPoints = routes[bIndex].points?.length ? routes[bIndex].points : parsePcbPathPoints(routes[bIndex].path);
      const length = maxSharedMiddleSegmentLength(aPoints, bPoints);
      if (length > maxSharedMiddleSegment) {
        sharedViolations.push({
          rule: 'sharedChannel',
          routeIds: [routes[aIndex].id, routes[bIndex].id],
          length,
        });
      }
    }
  }

  const violations = [
    ...routeResults.flatMap((result) => result.violations),
    ...sharedViolations,
  ];

  return {
    routes: routeResults,
    sharedViolations,
    violations,
    summary: summarize(violations),
  };
}
