export const GRAPH_LAYOUT_QUALITY_VERSION = 'graph-layout-quality-v1';
export const GRAPH_LAYOUT_QUALITY_SCHEMA_ID =
  'https://rnd-pro.github.io/symbiote-ui/schemas/graph-layout-quality-v1.json';

export const GRAPH_LAYOUT_QUALITY_DEFAULT_POLICY = Object.freeze({
  maxEdgeLengthRatio: 4,
  maxNearestNeighborDistanceRatio: 4,
  maxParentDistanceRatio: 2.5,
  maxStabilityShiftRatio: 0.75,
  minRenderedNodeSize: 24,
  overlapTolerance: 0,
  maxPairChecks: 100000,
  idealEdgeLength: null,
});

export const GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN = Object.freeze({
  coordinateMaximum: 1e150,
  sizeMinimum: 1e-150,
  sizeMaximum: 1e150,
  boundsInvariant: 'x + width > x and y + height > y in IEEE-754 arithmetic',
  derivedValueInvariant: 'non-zero derived center deltas, areas, ratios, fit scales, rendered sizes, and aggregate ratios that materialize as zero make analysis incomplete',
});

const SNAPSHOT_VERSION = 'graph-layout-snapshot-v1';
const MAX_SAFE_COUNT = Number.MAX_SAFE_INTEGER;
const ORIENTATION_ERROR_FACTOR = Number.EPSILON * 4;
const FLOAT64_BUFFER = new ArrayBuffer(8);
const FLOAT64_VIEW = new DataView(FLOAT64_BUFFER);
const FLOAT64_FRACTION_MASK = (1n << 52n) - 1n;
const FLOAT64_HIDDEN_BIT = 1n << 52n;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeId(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
    ? value
    : null;
}

function normalizeBounds(value) {
  if (!value || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)
    || Math.abs(value.x) > GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.coordinateMaximum
    || Math.abs(value.y) > GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.coordinateMaximum
    || !isFiniteNumber(value.width)
    || value.width < GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMinimum
    || value.width > GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMaximum
    || !isFiniteNumber(value.height)
    || value.height < GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMinimum
    || value.height > GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMaximum
    || !isFiniteNumber(value.x + value.width) || value.x + value.width <= value.x
    || !isFiniteNumber(value.y + value.height) || value.y + value.height <= value.y) return null;
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}

function normalizePoint(value) {
  return value && isFiniteNumber(value.x) && isFiniteNumber(value.y)
    && Math.abs(value.x) <= GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.coordinateMaximum
    && Math.abs(value.y) <= GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.coordinateMaximum
    ? { x: value.x, y: value.y }
    : null;
}

function resolvePolicy(value) {
  let policy = { ...GRAPH_LAYOUT_QUALITY_DEFAULT_POLICY };
  if (value === undefined) {
    return { policy, errors: [] };
  }
  if (value === null) {
    let errors = [{
      ruleId: 'policy.invalid',
      actual: null,
      limit: 'object',
      message: 'Policy must be an object.',
    }];
    return { policy, errors };
  }
  let errors = [];
  if (typeof value !== 'object' || Array.isArray(value)) {
    errors.push({
      ruleId: 'policy.invalid',
      actual: typeof value,
      limit: 'object',
      message: 'Policy must be an object.',
    });
    return { policy, errors };
  }

  let defaultKeys = Object.keys(GRAPH_LAYOUT_QUALITY_DEFAULT_POLICY);
  for (let key of Object.keys(value)) {
    if (!defaultKeys.includes(key)) {
      errors.push({
        ruleId: 'policy.unknown-field',
        actual: key,
        limit: defaultKeys.join(', '),
        message: `Unknown policy field "${key}".`,
      });
      continue;
    }
    let val = value[key];
    if (key === 'idealEdgeLength') {
      if (val !== null && val !== undefined && (
        !isFiniteNumber(val)
        || val < GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMinimum
        || val > GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMaximum
      )) {
        errors.push({
          ruleId: 'policy.invalid-field',
          actual: val,
          limit: 'nullable number inside the published numeric domain',
          message: `Policy field "${key}" must be null or inside the published numeric domain.`,
        });
      } else if (isFiniteNumber(val)) {
        policy[key] = val;
      }
    } else if (key === 'maxPairChecks') {
      if (!isFiniteNumber(val) || val < 0 || !Number.isSafeInteger(val)) {
        errors.push({
          ruleId: 'policy.invalid-field',
          actual: val,
          limit: 'non-negative safe integer',
          message: `Policy field "${key}" must be a non-negative safe integer.`,
        });
      } else {
        policy[key] = val;
      }
    } else {
      if (!isFiniteNumber(val) || val < 0) {
        errors.push({
          ruleId: 'policy.invalid-field',
          actual: val,
          limit: 'non-negative number',
          message: `Policy field "${key}" must be a non-negative number.`,
        });
      } else {
        policy[key] = val;
      }
    }
  }
  return { policy, errors };
}

function round(value) {
  if (!isFiniteNumber(value)) return null;
  return value === 0 ? value : Number(value.toPrecision(12));
}

function roundPositive(value) {
  let rounded = round(value);
  return rounded > 0 ? rounded : value;
}

function median(values) {
  if (!values.length) return 0;
  let sorted = [...values].sort((a, b) => a - b);
  let middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function nonnegativeMean(values) {
  if (!values.length) return { value: 0, underflow: false, operands: [] };
  let maximumValue = maximum(values);
  if (maximumValue === 0) return { value: 0, underflow: false, operands: [] };
  let normalizedSum = 0;
  let correction = 0;
  let normalizedValues = values.map((value) => value / maximumValue)
    .sort((left, right) => left - right);
  for (let value of normalizedValues) {
    let corrected = value - correction;
    let next = normalizedSum + corrected;
    correction = (next - normalizedSum) - corrected;
    normalizedSum = next;
  }
  let average = maximumValue * (normalizedSum / values.length);
  return {
    value: average,
    underflow: average === 0,
    operands: [maximumValue, values.length],
  };
}

function maximum(values) {
  let result = 0;
  for (let value of values) result = Math.max(result, value);
  return result;
}

function center(bounds) {
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function overlapDimensions(a, b) {
  let width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  let height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? { width, height, area: width * height } : null;
}

function dyadic(value) {
  if (value === 0) return { coefficient: 0n, exponent: 0 };
  FLOAT64_VIEW.setFloat64(0, value, false);
  let bits = FLOAT64_VIEW.getBigUint64(0, false);
  let negative = (bits >> 63n) === 1n;
  let exponentBits = Number((bits >> 52n) & 0x7ffn);
  let fraction = bits & FLOAT64_FRACTION_MASK;
  let coefficient = exponentBits === 0 ? fraction : FLOAT64_HIDDEN_BIT | fraction;
  return {
    coefficient: negative ? -coefficient : coefficient,
    exponent: exponentBits === 0 ? -1074 : exponentBits - 1075,
  };
}

function subtractDyadic(left, right) {
  let exponent = Math.min(left.exponent, right.exponent);
  return {
    coefficient: (left.coefficient << BigInt(left.exponent - exponent))
      - (right.coefficient << BigInt(right.exponent - exponent)),
    exponent,
  };
}

function addDyadic(left, right) {
  let exponent = Math.min(left.exponent, right.exponent);
  return {
    coefficient: (left.coefficient << BigInt(left.exponent - exponent))
      + (right.coefficient << BigInt(right.exponent - exponent)),
    exponent,
  };
}

function roundBigIntRight(value, shift) {
  if (shift <= 0) return value << BigInt(-shift);
  let divisor = 1n << BigInt(shift);
  let quotient = value >> BigInt(shift);
  let remainder = value & (divisor - 1n);
  let halfway = divisor >> 1n;
  return remainder > halfway || (remainder === halfway && (quotient & 1n) === 1n)
    ? quotient + 1n
    : quotient;
}

function dyadicToNumber(value) {
  if (value.coefficient === 0n) return 0;
  let negative = value.coefficient < 0n;
  let coefficient = negative ? -value.coefficient : value.coefficient;
  let bitLength = coefficient.toString(2).length;
  let topExponent = value.exponent + bitLength - 1;
  let result;

  if (topExponent < -1022) {
    let units = roundBigIntRight(coefficient, -1074 - value.exponent);
    result = Number(units) * Number.MIN_VALUE;
  } else {
    let shift = Math.max(0, bitLength - 53);
    let significand = roundBigIntRight(coefficient, shift);
    result = Number(significand) * (2 ** (value.exponent + shift));
  }
  return negative ? -result : result;
}

function exactCenterAxisDelta(fromPosition, fromSize, toPosition, toSize) {
  let sizeDelta = subtractDyadic(dyadic(toSize), dyadic(fromSize));
  sizeDelta.exponent -= 1;
  return addDyadic(
    subtractDyadic(dyadic(toPosition), dyadic(fromPosition)),
    sizeDelta
  );
}

function centerAxisDelta(fromPosition, fromSize, toPosition, toSize) {
  let positionDelta = toPosition - fromPosition;
  let sizeDelta = (toSize - fromSize) / 2;
  let approximate = positionDelta + sizeDelta;
  let errorBound = Number.EPSILON * 4 * (Math.abs(positionDelta) + Math.abs(sizeDelta));
  if (Math.abs(approximate) > errorBound) {
    return { value: approximate, underflow: false };
  }
  let exact = exactCenterAxisDelta(fromPosition, fromSize, toPosition, toSize);
  let value = dyadicToNumber(exact);
  return { value, underflow: exact.coefficient !== 0n && value === 0 };
}

function centerDelta(fromBounds, toBounds) {
  let x = centerAxisDelta(fromBounds.x, fromBounds.width, toBounds.x, toBounds.width);
  let y = centerAxisDelta(fromBounds.y, fromBounds.height, toBounds.y, toBounds.height);
  return {
    x: x.value,
    y: y.value,
    distance: Math.hypot(x.value, y.value),
    underflow: x.underflow || y.underflow,
  };
}

function positiveBoundsDifferences(left, right, fallback) {
  let differences = [
    Math.abs(right.x - left.x),
    Math.abs(right.y - left.y),
    Math.abs(right.width - left.width),
    Math.abs(right.height - left.height),
  ].filter((value) => value > 0);
  differences.push(fallback);
  return differences;
}

function representableMedian(values) {
  if (!values.length) return { value: 0, underflow: false, operands: [] };
  let sorted = [...values].sort((a, b) => a - b);
  let middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) {
    return { value: sorted[middle], underflow: false, operands: [] };
  }
  let exact = addDyadic(dyadic(sorted[middle - 1]), dyadic(sorted[middle]));
  exact.exponent -= 1;
  let value = dyadicToNumber(exact);
  let operands = [Math.abs(sorted[middle - 1]), Math.abs(sorted[middle])]
    .filter((item) => item > 0);
  if (operands.length < 2) operands.push(2);
  return { value, underflow: exact.coefficient !== 0n && value === 0, operands };
}

function multiplyDyadic(left, right) {
  return {
    coefficient: left.coefficient * right.coefficient,
    exponent: left.exponent + right.exponent,
  };
}

function exactOrientation(a, b, c) {
  let abX = subtractDyadic(dyadic(b.x), dyadic(a.x));
  let abY = subtractDyadic(dyadic(b.y), dyadic(a.y));
  let acX = subtractDyadic(dyadic(c.x), dyadic(a.x));
  let acY = subtractDyadic(dyadic(c.y), dyadic(a.y));
  let determinant = subtractDyadic(
    multiplyDyadic(abX, acY),
    multiplyDyadic(abY, acX)
  ).coefficient;
  return determinant < 0n ? -1 : determinant > 0n ? 1 : 0;
}

function orientation(a, b, c) {
  let determinantLeft = (b.x - a.x) * (c.y - a.y);
  let determinantRight = (b.y - a.y) * (c.x - a.x);
  let determinant = determinantLeft - determinantRight;
  let errorBound = ORIENTATION_ERROR_FACTOR
    * (Math.abs(determinantLeft) + Math.abs(determinantRight));
  return Math.abs(determinant) > errorBound
    ? Math.sign(determinant)
    : exactOrientation(a, b, c);
}

function onSegment(a, b, point) {
  return point.x >= Math.min(a.x, b.x)
    && point.x <= Math.max(a.x, b.x)
    && point.y >= Math.min(a.y, b.y)
    && point.y <= Math.max(a.y, b.y);
}

function segmentsIntersect(a, b, c, d) {
  let abC = orientation(a, b, c);
  let abD = orientation(a, b, d);
  let cdA = orientation(c, d, a);
  let cdB = orientation(c, d, b);
  if (abC !== abD && cdA !== cdB) return true;
  return (abC === 0 && onSegment(a, b, c))
    || (abD === 0 && onSegment(a, b, d))
    || (cdA === 0 && onSegment(c, d, a))
    || (cdB === 0 && onSegment(c, d, b));
}

function pointInsideBounds(point, bounds) {
  return point.x > bounds.x
    && point.x < bounds.x + bounds.width
    && point.y > bounds.y
    && point.y < bounds.y + bounds.height;
}

function segmentIntersectsBoundsInterior(a, b, bounds) {
  if (pointInsideBounds(a, bounds) || pointInsideBounds(b, bounds)) return true;

  let left = bounds.x;
  let right = bounds.x + bounds.width;
  let top = bounds.y;
  let bottom = bounds.y + bounds.height;
  if (Math.max(a.x, b.x) <= left || Math.min(a.x, b.x) >= right
    || Math.max(a.y, b.y) <= top || Math.min(a.y, b.y) >= bottom) {
    return false;
  }

  let hasPositive = false;
  let hasNegative = false;
  for (let corner of [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ]) {
    let side = orientation(a, b, corner);
    hasPositive ||= side > 0;
    hasNegative ||= side < 0;
  }
  return hasPositive && hasNegative;
}

function pointsEqual(left, right) {
  return left.x === right.x && left.y === right.y;
}

function segmentsCrossRemotely(s1, s2, sharedEndpoints) {
  if (!segmentsIntersect(...s1, ...s2)) return false;
  for (let pt of sharedEndpoints) {
    let s1Close0 = pointsEqual(s1[0], pt);
    let s1Close1 = pointsEqual(s1[1], pt);
    let s2Close0 = pointsEqual(s2[0], pt);
    let s2Close1 = pointsEqual(s2[1], pt);
    if ((s1Close0 || s1Close1) && (s2Close0 || s2Close1)) {
      let u = s1Close0 ? s1[1] : s1[0];
      let v = s2Close0 ? s2[1] : s2[0];
      let ux = u.x - pt.x, uy = u.y - pt.y;
      let vx = v.x - pt.x, vy = v.y - pt.y;
      if (orientation(pt, u, v) === 0) {
        let sameDirection = ux !== 0
          ? Math.sign(ux) === Math.sign(vx)
          : uy !== 0 && Math.sign(uy) === Math.sign(vy);
        if (sameDirection) {
          return true;
        }
      }
      return false;
    }
  }
  return true;
}

function polylineLength(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1], points[index]);
    if (!isFiniteNumber(total)) return null;
  }
  return total;
}

function layoutBounds(nodes) {
  if (!nodes.length) return null;
  let left = nodes[0].bounds.x;
  let top = nodes[0].bounds.y;
  let right = nodes[0].bounds.x + nodes[0].bounds.width;
  let bottom = nodes[0].bounds.y + nodes[0].bounds.height;
  for (let index = 1; index < nodes.length; index += 1) {
    let bounds = nodes[index].bounds;
    left = Math.min(left, bounds.x);
    top = Math.min(top, bounds.y);
    right = Math.max(right, bounds.x + bounds.width);
    bottom = Math.max(bottom, bounds.y + bounds.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function createFinding(ruleId, severity, ids, actual, limit, message) {
  return {
    ruleId,
    severity,
    ...ids,
    actual: actual ?? null,
    limit: limit ?? null,
    message,
  };
}

function createNumericUnderflowFinding(metric, ids, operands, message) {
  return createFinding('layout.numeric-underflow', 'error', ids, {
    metric,
    operands,
    roundedValue: 0,
  }, 'non-zero representable IEEE-754 result', message);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) {
    return `array:${value.length}:${value.map((item) => {
      let encoded = canonicalValue(item);
      return `${encoded.length}:${encoded}`;
    }).join('')}`;
  }
  if (typeof value === 'object') {
    let keys = Object.keys(value).sort(compareText);
    return `object:${keys.length}:${keys.map((key) => {
      let encodedValue = canonicalValue(value[key]);
      return `${key.length}:${key}${encodedValue.length}:${encodedValue}`;
    }).join('')}`;
  }
  let encoded = typeof value === 'number' && Object.is(value, -0) ? '-0' : String(value);
  return `${typeof value}:${encoded.length}:${encoded}`;
}

function findingSortKey(finding) {
  return canonicalValue([
    finding.ruleId,
    [...(finding.nodeIds || [])].sort(compareText),
    [...(finding.edgeIds || [])].sort(compareText),
    finding.actual,
    finding.limit,
    finding.message,
  ]);
}

function findingIdSegment(label, values) {
  return values.length
    ? `:${label}=${values.map((value) => encodeURIComponent(JSON.stringify(value))).join(',')}`
    : '';
}

function sortFindings(findings) {
  return findings.sort((left, right) => compareText(findingSortKey(left), findingSortKey(right)));
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : MAX_SAFE_COUNT;
}

function addCounts(left, right) {
  return left > MAX_SAFE_COUNT - right ? MAX_SAFE_COUNT : left + right;
}

function multiplyCounts(left, right) {
  if (!left || !right) return 0;
  return left > MAX_SAFE_COUNT / right ? MAX_SAFE_COUNT : left * right;
}

function entityPairCount(length) {
  return safeCount(length * (length - 1) / 2);
}

export function analyzeGraphLayout(snapshot = {}) {
  let findings = [];
  let incomplete = false;

  let { policy, errors: policyErrors } = resolvePolicy(snapshot?.policy);
  for (let err of policyErrors) {
    incomplete = true;
    findings.push(createFinding(err.ruleId, 'error', {}, err.actual, err.limit, err.message));
  }

  let sourceNodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
  let sourceEdges = Array.isArray(snapshot?.edges) ? snapshot.edges : [];
  let nodes = [];
  let nodeMap = new Map();
  let skippedNodeIds = [];
  let skippedNodeCount = 0;
  let unidentifiedNodeCount = 0;

  if (snapshot?.version !== SNAPSHOT_VERSION) {
    incomplete = true;
    findings.push(createFinding('input.invalid-version', 'error', {}, snapshot?.version ?? null,
      SNAPSHOT_VERSION, `Expected snapshot version "${SNAPSHOT_VERSION}".`));
  }
  if (!Array.isArray(snapshot?.nodes)) {
    incomplete = true;
    findings.push(createFinding('input.invalid-nodes', 'error', {}, snapshot?.nodes ?? null,
      'array', 'Snapshot nodes must be an array.'));
  }
  if (snapshot?.edges !== undefined && !Array.isArray(snapshot.edges)) {
    incomplete = true;
    findings.push(createFinding('input.invalid-edges', 'error', {}, snapshot.edges,
      'array', 'Snapshot edges must be an array.'));
  }

  let nodeGroupMap = new Map();
  let invalidNodes = [];

  for (let source of sourceNodes) {
    let id = normalizeId(source?.id);
    if (!id) {
      invalidNodes.push({ source });
    } else {
      if (!nodeGroupMap.has(id)) {
        nodeGroupMap.set(id, []);
      }
      nodeGroupMap.get(id).push({ source });
    }
  }

  let sortedIds = Array.from(nodeGroupMap.keys()).sort(compareText);

  invalidNodes.sort((left, right) => compareText(
    canonicalValue(left.source?.id), canonicalValue(right.source?.id)
  ));
  unidentifiedNodeCount = invalidNodes.length;
  skippedNodeCount += invalidNodes.length;
  for (let item of invalidNodes) {
    incomplete = true;
    findings.push(createFinding('node.invalid-id', 'error',
      { nodeIds: [] }, item.source?.id ?? null, 'unique canonical non-empty string',
      'Node does not have a unique valid ID.'));
  }

  for (let id of sortedIds) {
    let occurrences = nodeGroupMap.get(id);
    if (occurrences.length > 1) {
      incomplete = true;
      skippedNodeIds.push(id);
      skippedNodeCount += occurrences.length;
      findings.push(createFinding('node.duplicate-id', 'error',
        { nodeIds: [id] }, occurrences.length, 1, `Node ID "${id}" is duplicate.`));
      continue;
    }

    let item = occurrences[0];
    let bounds = normalizeBounds(item.source?.bounds);

    let rawParentId = item.source?.parentId;
    let parentId;
    if (rawParentId !== undefined) {
      parentId = normalizeId(rawParentId);
      if (!parentId) {
        incomplete = true;
        findings.push(createFinding('parent.invalid', 'error', { nodeIds: [id] },
          rawParentId, 'canonical non-empty string', `Node "${id}" has a malformed parentId.`));
      }
    }

    if (!bounds) {
      incomplete = true;
      skippedNodeIds.push(id);
      skippedNodeCount += 1;
      findings.push(createFinding('node.invalid-geometry', 'error', { nodeIds: [id] },
        item.source?.bounds ?? null,
        'bounds inside the numeric domain with representable right and bottom extents',
        `Node "${id}" has invalid geometry.`));
      continue;
    }

    let node = { id, parentId, bounds };
    nodes.push(node);
    nodeMap.set(id, node);
  }

  nodes.sort((left, right) => compareText(left.id, right.id));
  skippedNodeIds.sort(compareText);

  for (let node of nodes) {
    if (!node.parentId || nodeMap.has(node.parentId)) continue;
    incomplete = true;
    findings.push(createFinding('parent.invalid', 'error',
      { nodeIds: [node.id, node.parentId].sort(compareText) }, node.parentId, 'existing node ID',
      `Node "${node.id}" references a missing parent.`));
  }

  let parentCycles = [];
  let parentState = new Map();
  for (let node of nodes) {
    if (parentState.get(node.id) === 'done') continue;
    let current = node;
    let path = [];
    let pathIndex = new Map();
    while (current && current.parentId && nodeMap.has(current.parentId)) {
      if (parentState.get(current.id) === 'done') break;
      if (pathIndex.has(current.id)) {
        parentCycles.push(path.slice(pathIndex.get(current.id)));
        break;
      }
      pathIndex.set(current.id, path.length);
      path.push(current.id);
      current = nodeMap.get(current.parentId);
    }
    for (let id of path) {
      parentState.set(id, 'done');
    }
  }

  parentCycles = parentCycles.map((cycle) => [...cycle].sort(compareText))
    .sort((left, right) => compareText(left[0], right[0]));
  for (let cycle of parentCycles) {
    incomplete = true;
    findings.push(createFinding('parent.cycle', 'error',
      { nodeIds: [...cycle].sort(compareText) }, cycle, 'acyclic hierarchy',
      `Parent cycle detected containing: ${cycle.join(', ')}.`));
  }

  let normalizationUnit = 1;
  let normalizationBasis = 'empty-layout-default';

  if (policy.idealEdgeLength !== null && policy.idealEdgeLength !== undefined) {
    normalizationUnit = policy.idealEdgeLength;
    normalizationBasis = 'ideal-edge-length-override';
  } else if (nodes.length) {
    normalizationUnit = median(nodes.map((node) => Math.hypot(node.bounds.width, node.bounds.height)));
    normalizationBasis = 'median-node-diagonal';
  }
  if (normalizationUnit <= 0) {
    normalizationUnit = 1;
  }

  let normalization = {
    basis: normalizationBasis,
    unit: roundPositive(normalizationUnit),
  };

  let baselineTotal = 0;
  let baselineAnalyzedIds = [];
  let baselineSkippedIds = [];
  let baselineSkippedCount = 0;
  let baselineUnidentifiedCount = 0;
  let baselineMap = new Map();

  if (snapshot?.baseline !== undefined) {
    let baseline = snapshot.baseline;
    if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) {
      incomplete = true;
      findings.push(createFinding('baseline.invalid', 'error', {}, baseline,
        'object', 'Baseline must be an object.'));
    } else if (baseline.nodes === undefined) {
      incomplete = true;
      findings.push(createFinding('baseline.invalid', 'error', {}, baseline,
        'object with nodes', 'Baseline must contain nodes.'));
    } else {
      let nodesVal = baseline.nodes;
      let occurrences = new Map();
      let invalidEntries = [];

      if (Array.isArray(nodesVal)) {
        for (let source of nodesVal) {
          baselineTotal++;
          if (!source || typeof source !== 'object' || Array.isArray(source)) {
            invalidEntries.push({ source, reason: 'Baseline node must be an object.' });
            continue;
          }
          let id = normalizeId(source?.id);
          if (!id) {
            invalidEntries.push({ source: source?.id, reason: 'Baseline node is missing a valid ID.' });
            continue;
          }
          let bounds = normalizeBounds(source?.bounds || source);
          if (!occurrences.has(id)) occurrences.set(id, []);
          occurrences.get(id).push({ bounds, rawBounds: source?.bounds || source });
        }
      } else if (nodesVal && typeof nodesVal === 'object') {
        for (let [idKey, source] of Object.entries(nodesVal)) {
          baselineTotal++;
          let id = normalizeId(idKey);
          if (!id) {
            invalidEntries.push({ source: idKey, reason: 'Baseline node key is invalid.' });
            continue;
          }
          let bounds = normalizeBounds(source?.bounds || source);
          if (!occurrences.has(id)) occurrences.set(id, []);
          occurrences.get(id).push({ bounds, rawBounds: source?.bounds || source });
        }
      } else {
        incomplete = true;
        findings.push(createFinding('baseline.invalid', 'error', {}, nodesVal,
          'array or object', 'Baseline nodes must be an array or object.'));
      }

      invalidEntries.sort((left, right) => compareText(
        [left.reason, canonicalValue(left.source)].join('\0'),
        [right.reason, canonicalValue(right.source)].join('\0')
      ));
      baselineUnidentifiedCount += invalidEntries.length;
      baselineSkippedCount += invalidEntries.length;
      for (let entry of invalidEntries) {
        incomplete = true;
        findings.push(createFinding('baseline.invalid', 'error', {}, entry.source,
          'valid node', entry.reason));
      }

      let sortedOccurrences = Array.from(occurrences.entries())
        .sort((left, right) => compareText(left[0], right[0]));
      for (let [id, items] of sortedOccurrences) {
        if (items.length > 1) {
          incomplete = true;
          baselineSkippedIds.push(id);
          baselineSkippedCount += items.length;
          findings.push(createFinding('baseline.duplicate-id', 'error', { nodeIds: [id] },
            items.length, 1, `Baseline node ID "${id}" is duplicate.`));
        } else {
          let item = items[0];
          if (!item.bounds) {
            incomplete = true;
            baselineSkippedIds.push(id);
            baselineSkippedCount += 1;
            findings.push(createFinding('baseline.invalid', 'error', { nodeIds: [id] }, item.rawBounds,
              'valid geometry', `Baseline node "${id}" has invalid geometry.`));
          } else {
            baselineMap.set(id, item.bounds);
            baselineAnalyzedIds.push(id);
          }
        }
      }
    }
  }

  baselineAnalyzedIds.sort(compareText);
  baselineSkippedIds.sort(compareText);

  let edgeGroupMap = new Map();
  let invalidEdges = [];
  let skippedEdgeIds = [];
  let skippedEdgeCount = 0;
  let unidentifiedEdgeCount = 0;
  let edges = [];

  for (let source of sourceEdges) {
    let id = normalizeId(source?.id);
    if (!id) {
      invalidEdges.push({ source });
    } else {
      if (!edgeGroupMap.has(id)) {
        edgeGroupMap.set(id, []);
      }
      edgeGroupMap.get(id).push({ source });
    }
  }

  let sortedEdgeIds = Array.from(edgeGroupMap.keys()).sort(compareText);

  invalidEdges.sort((left, right) => compareText(
    canonicalValue(left.source?.id), canonicalValue(right.source?.id)
  ));
  unidentifiedEdgeCount = invalidEdges.length;
  skippedEdgeCount += invalidEdges.length;
  for (let item of invalidEdges) {
    incomplete = true;
    findings.push(createFinding('edge.invalid-id', 'error',
      { edgeIds: [] }, item.source?.id ?? null, 'unique canonical non-empty string',
      'Edge does not have a unique valid ID.'));
  }

  for (let id of sortedEdgeIds) {
    let occurrences = edgeGroupMap.get(id);
    if (occurrences.length > 1) {
      incomplete = true;
      skippedEdgeIds.push(id);
      skippedEdgeCount += occurrences.length;
      findings.push(createFinding('edge.duplicate-id', 'error',
        { edgeIds: [id] }, occurrences.length, 1, `Edge ID "${id}" is duplicate.`));
      continue;
    }

    let item = occurrences[0];
    let sourceId = normalizeId(item.source?.sourceId);
    let targetId = normalizeId(item.source?.targetId);
    if (!sourceId || !targetId || !nodeMap.has(sourceId) || !nodeMap.has(targetId)) {
      incomplete = true;
      skippedEdgeIds.push(id);
      skippedEdgeCount += 1;
      findings.push(createFinding('edge.invalid-endpoint', 'error', { edgeIds: [id] },
        { sourceId, targetId }, 'existing node IDs', `Edge "${id}" has an invalid endpoint.`));
      continue;
    }

    if (sourceId === targetId) {
      incomplete = true;
      skippedEdgeIds.push(id);
      skippedEdgeCount += 1;
      findings.push(createFinding('edge.invalid-endpoint', 'error', { edgeIds: [id] },
        { sourceId, targetId }, 'distinct source and target node IDs', `Edge "${id}" has identical source and target.`));
      continue;
    }

    let points;
    let implicitRouteLength = null;
    if (item.source?.points !== undefined) {
      points = Array.isArray(item.source.points) ? item.source.points.map(normalizePoint) : [];
      if (points.length < 2 || points.some((point) => !point)) {
        incomplete = true;
        skippedEdgeIds.push(id);
        skippedEdgeCount += 1;
        findings.push(createFinding('edge.invalid-points', 'error', { edgeIds: [id] },
          item.source.points, 'at least two points inside the published numeric domain',
          `Edge "${id}" has invalid route points.`));
        continue;
      }
    } else {
      let sourceBounds = nodeMap.get(sourceId).bounds;
      let targetBounds = nodeMap.get(targetId).bounds;
      let sourceCenter = center(sourceBounds);
      let targetCenter = center(targetBounds);
      let delta = centerDelta(sourceBounds, targetBounds);
      let materializedX = targetCenter.x - sourceCenter.x;
      let materializedY = targetCenter.y - sourceCenter.y;
      let collapsedAxis = (materializedX === 0 && delta.x !== 0)
        || (materializedY === 0 && delta.y !== 0);
      if (delta.underflow || collapsedAxis) {
        incomplete = true;
        skippedEdgeIds.push(id);
        skippedEdgeCount += 1;
        findings.push(createNumericUnderflowFinding('implicit-edge-center-route',
          { edgeIds: [id] },
          positiveBoundsDifferences(sourceBounds, targetBounds, normalizationUnit),
          `Edge "${id}" has a center delta that collapses in its materialized route.`));
        continue;
      }
      points = [sourceCenter, targetCenter];
      implicitRouteLength = delta.distance;
    }

    let segments = [];
    for (let i = 0; i < points.length - 1; i++) {
      segments.push([points[i], points[i + 1]]);
    }

    let routeLength = implicitRouteLength ?? polylineLength(points);
    let lengthRatio = routeLength === null ? null : routeLength / normalizationUnit;
    if (routeLength > 0 && lengthRatio === 0) {
      incomplete = true;
      skippedEdgeIds.push(id);
      skippedEdgeCount += 1;
      findings.push(createNumericUnderflowFinding('edge-length-ratio',
        { edgeIds: [id] }, [routeLength, normalizationUnit],
        `Edge "${id}" has a positive normalized length that rounds to zero.`));
      continue;
    }
    if (!isFiniteNumber(lengthRatio)) {
      incomplete = true;
      skippedEdgeIds.push(id);
      skippedEdgeCount += 1;
      findings.push(createFinding('edge.invalid-points', 'error', { edgeIds: [id] }, {
        pointCount: points.length,
        reason: 'normalized route length is not representable',
      }, 'route length inside the published numeric domain',
      `Edge "${id}" has a route outside the published numeric domain.`));
      continue;
    }
    edges.push({ id, sourceId, targetId, points, lengthRatio, segments });
    if (lengthRatio > policy.maxEdgeLengthRatio) {
      findings.push(createFinding('edge.too-long', 'warning', { edgeIds: [id] },
        lengthRatio, policy.maxEdgeLengthRatio,
        `Edge "${id}" exceeds the normalized length limit.`));
    }
  }

  edges.sort((left, right) => compareText(left.id, right.id));
  skippedEdgeIds.sort(compareText);

  let unrelatedNodeCount = Math.max(0, nodes.length - 2);
  let nodePairCount = entityPairCount(nodes.length);
  let edgePairCount = entityPairCount(edges.length);
  let edgeNodePairCount = safeCount(edges.length * unrelatedNodeCount);

  let requiredChecks = {
    nodePairs: nodePairCount,
    edgeNodePairs: edgeNodePairCount,
    edgePairs: edgePairCount,
  };
  let requiredCosts = {
    nodePairs: nodePairCount,
    edgeNodePairs: 0,
    edgePairs: 0,
  };
  let precedingSegments = 0;
  for (let edge of edges) {
    requiredCosts.edgeNodePairs = addCounts(
      requiredCosts.edgeNodePairs,
      multiplyCounts(edge.segments.length, unrelatedNodeCount)
    );
    requiredCosts.edgePairs = addCounts(
      requiredCosts.edgePairs,
      multiplyCounts(precedingSegments, edge.segments.length)
    );
    precedingSegments = addCounts(precedingSegments, edge.segments.length);
  }
  let remainingBudget = policy.maxPairChecks;
  let enabledChecks = {};
  for (let key of ['nodePairs', 'edgeNodePairs', 'edgePairs']) {
    enabledChecks[key] = requiredCosts[key] <= remainingBudget;
    if (enabledChecks[key]) remainingBudget -= requiredCosts[key];
    else if (requiredChecks[key]) incomplete = true;
  }
  let totalRequired = Object.values(requiredCosts).reduce(addCounts, 0);
  if (totalRequired > policy.maxPairChecks) {
    findings.push(createFinding('layout.analysis-budget-exceeded', 'error', {}, totalRequired,
      policy.maxPairChecks,
      'The deterministic geometry-comparison budget is too small for this layout.'));
  }

  let overlaps = 0;
  let nearest = new Map(nodes.map((node) => [node.id, Number.POSITIVE_INFINITY]));
  if (enabledChecks.nodePairs) {
    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        let leftNode = nodes[left];
        let rightNode = nodes[right];
        let overlap = overlapDimensions(leftNode.bounds, rightNode.bounds);
        if (overlap?.area === 0) {
          incomplete = true;
          findings.push(createNumericUnderflowFinding('node-overlap-area', {
            nodeIds: [leftNode.id, rightNode.id],
          }, [overlap.width, overlap.height],
          'A positive node overlap area rounds to zero.'));
        } else if (overlap && overlap.area > policy.overlapTolerance) {
          overlaps += 1;
          findings.push(createFinding('node.overlap', 'error',
            { nodeIds: [leftNode.id, rightNode.id] }, overlap.area, policy.overlapTolerance,
            'Node bounds overlap.'));
        }
        let delta = centerDelta(leftNode.bounds, rightNode.bounds);
        if (delta.underflow) {
          incomplete = true;
          findings.push(createNumericUnderflowFinding('nearest-neighbor-ratio', {
            nodeIds: [leftNode.id, rightNode.id],
          }, positiveBoundsDifferences(leftNode.bounds, rightNode.bounds, normalizationUnit),
          'A non-zero nearest-neighbor center delta materializes as zero.'));
          continue;
        }
        let nodeDistance = delta.distance;
        let ratio = nodeDistance / normalizationUnit;
        if (nodeDistance > 0 && ratio === 0) {
          incomplete = true;
          findings.push(createNumericUnderflowFinding('nearest-neighbor-ratio', {
            nodeIds: [leftNode.id, rightNode.id],
          }, [nodeDistance, normalizationUnit],
          'A positive nearest-neighbor ratio rounds to zero.'));
          continue;
        }
        nearest.set(leftNode.id, Math.min(nearest.get(leftNode.id), ratio));
        nearest.set(rightNode.id, Math.min(nearest.get(rightNode.id), ratio));
      }
    }
  }
  let nearestValues = [];
  for (let node of nodes) {
    let value = nearest.get(node.id);
    if (!Number.isFinite(value)) continue;
    nearestValues.push(value);
    if (value > policy.maxNearestNeighborDistanceRatio) {
      findings.push(createFinding('node.too-distant', 'warning', { nodeIds: [node.id] },
        value, policy.maxNearestNeighborDistanceRatio,
        `Node "${node.id}" is too far from its nearest neighbor.`));
    }
  }

  let nodeIntersections = 0;
  if (enabledChecks.edgeNodePairs) {
    for (let edge of edges) {
      for (let node of nodes) {
        if (node.id === edge.sourceId || node.id === edge.targetId) continue;
        if (edge.segments.some(([a, b]) => segmentIntersectsBoundsInterior(a, b, node.bounds))) {
          nodeIntersections += 1;
          findings.push(createFinding('edge.node-intersection', 'error',
            { nodeIds: [node.id], edgeIds: [edge.id] }, 1, 0,
            `Edge "${edge.id}" crosses unrelated node "${node.id}".`));
        }
      }
    }
  }

  let crossings = 0;
  if (enabledChecks.edgePairs) {
    for (let left = 0; left < edges.length; left += 1) {
      for (let right = left + 1; right < edges.length; right += 1) {
        let leftEdge = edges[left];
        let rightEdge = edges[right];
        let sharesEndpoint = leftEdge.sourceId === rightEdge.sourceId
          || leftEdge.sourceId === rightEdge.targetId
          || leftEdge.targetId === rightEdge.sourceId
          || leftEdge.targetId === rightEdge.targetId;

        let sharedEndpoints = [];
        if (sharesEndpoint) {
          if (leftEdge.sourceId === rightEdge.sourceId || leftEdge.sourceId === rightEdge.targetId) {
            sharedEndpoints.push(leftEdge.points[0]);
          }
          if (leftEdge.targetId === rightEdge.sourceId || leftEdge.targetId === rightEdge.targetId) {
            sharedEndpoints.push(leftEdge.points[leftEdge.points.length - 1]);
          }
        }

        let crosses = false;
        for (let leftSeg of leftEdge.segments) {
          for (let rightSeg of rightEdge.segments) {
            if (sharesEndpoint) {
              if (segmentsCrossRemotely(leftSeg, rightSeg, sharedEndpoints)) {
                crosses = true;
                break;
              }
            } else {
              if (segmentsIntersect(...leftSeg, ...rightSeg)) {
                crosses = true;
                break;
              }
            }
          }
          if (crosses) break;
        }

        if (crosses) {
          crossings += 1;
          findings.push(createFinding('edge.crossing', 'warning',
            { edgeIds: [leftEdge.id, rightEdge.id] }, 1, 0, 'Unrelated edges cross.'));
        }
      }
    }
  }

  let parentRatios = [];
  for (let node of nodes) {
    if (!node.parentId || !nodeMap.has(node.parentId)) continue;
    let parentBounds = nodeMap.get(node.parentId).bounds;
    let delta = centerDelta(node.bounds, parentBounds);
    if (delta.underflow) {
      incomplete = true;
      findings.push(createNumericUnderflowFinding('parent-distance-ratio', {
        nodeIds: [node.id, node.parentId].sort(compareText),
      }, positiveBoundsDifferences(node.bounds, parentBounds, normalizationUnit),
      `Node "${node.id}" has a non-zero parent-center delta that materializes as zero.`));
      continue;
    }
    let parentDistance = delta.distance;
    let ratio = parentDistance / normalizationUnit;
    if (parentDistance > 0 && ratio === 0) {
      incomplete = true;
      findings.push(createNumericUnderflowFinding('parent-distance-ratio', {
        nodeIds: [node.id, node.parentId].sort(compareText),
      }, [parentDistance, normalizationUnit],
      `Node "${node.id}" has a positive parent-distance ratio that rounds to zero.`));
      continue;
    }
    parentRatios.push(ratio);
    if (ratio > policy.maxParentDistanceRatio) {
      findings.push(createFinding('parent.too-distant', 'warning',
        { nodeIds: [node.id, node.parentId].sort(compareText) }, ratio,
        policy.maxParentDistanceRatio, `Node "${node.id}" is too far from its parent.`));
    }
  }

  let bounds = layoutBounds(nodes);
  let viewportMetrics = { provided: false, fitScale: null, minRenderedNodeSize: null };
  if (snapshot?.viewport !== undefined) {
    let viewport = snapshot.viewport;
    let width = viewport?.width;
    let height = viewport?.height;
    let padding = viewport?.padding !== undefined ? viewport?.padding : 0;

    if (!isFiniteNumber(width)
      || width < GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMinimum
      || width > GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMaximum
      || !isFiniteNumber(height)
      || height < GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMinimum
      || height > GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMaximum
      || !isFiniteNumber(padding) || padding < 0
      || padding > GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMaximum
      || padding * 2 >= width || padding * 2 >= height) {
      incomplete = true;
      findings.push(createFinding('viewport.invalid', 'error', {}, viewport,
        'positive dimensions and usable padding', 'Viewport geometry is invalid.'));
    } else {
      let fitScale = bounds ? Math.min(
        (viewport.width - padding * 2) / bounds.width,
        (viewport.height - padding * 2) / bounds.height,
        1
      ) : 1;
      if (bounds && fitScale === 0) {
        incomplete = true;
        findings.push(createNumericUnderflowFinding('viewport-fit-scale', {}, [
          Math.min(viewport.width - padding * 2, viewport.height - padding * 2),
          Math.max(bounds.width, bounds.height),
        ], 'A positive viewport fit scale rounds to zero.'));
      }
      let renderedSizes = nodes.map(
        (node) => Math.min(node.bounds.width, node.bounds.height) * fitScale
      );
      viewportMetrics = {
        provided: true,
        width: viewport.width,
        height: viewport.height,
        padding,
        fitScale: round(fitScale),
        minRenderedNodeSize: renderedSizes.length
          ? round(renderedSizes.reduce((minimum, value) => Math.min(minimum, value)))
          : null,
      };
      for (let [index, node] of nodes.entries()) {
        if (Math.min(node.bounds.width, node.bounds.height) > 0
          && fitScale > 0 && renderedSizes[index] === 0) {
          incomplete = true;
          findings.push(createNumericUnderflowFinding('viewport-rendered-node-size', {
            nodeIds: [node.id],
          }, [Math.min(node.bounds.width, node.bounds.height), fitScale],
          `Node "${node.id}" has a positive rendered size that rounds to zero.`));
        }
        if (renderedSizes[index] < policy.minRenderedNodeSize) {
          findings.push(createFinding('viewport.node-too-small', 'warning',
            { nodeIds: [node.id] }, renderedSizes[index], policy.minRenderedNodeSize,
            `Node "${node.id}" would render below the readability limit.`));
        }
      }
    }
  }

  let shifts = [];
  for (let node of nodes.filter((item) => baselineMap.has(item.id))) {
    let previousBounds = baselineMap.get(node.id);
    let delta = centerDelta(previousBounds, node.bounds);
    if (delta.underflow) {
      incomplete = true;
      findings.push(createNumericUnderflowFinding('stability-shift-ratio', {
        nodeIds: [node.id],
      }, positiveBoundsDifferences(previousBounds, node.bounds, normalizationUnit),
      `Node "${node.id}" has a non-zero baseline center delta that materializes as zero.`));
      continue;
    }
    shifts.push({ id: node.id, x: delta.x, y: delta.y });
  }
  let translationX = representableMedian(shifts.map((shift) => shift.x));
  let translationY = representableMedian(shifts.map((shift) => shift.y));
  if (translationX.underflow) {
    incomplete = true;
    findings.push(createNumericUnderflowFinding('stability-translation-x', {},
      translationX.operands, 'The translation-aligned baseline x median rounds to zero.'));
  }
  if (translationY.underflow) {
    incomplete = true;
    findings.push(createNumericUnderflowFinding('stability-translation-y', {},
      translationY.operands, 'The translation-aligned baseline y median rounds to zero.'));
  }
  let translation = {
    x: translationX.value,
    y: translationY.value,
  };
  let shiftRatios = [];
  for (let shift of shifts) {
    let shiftDistance = Math.hypot(
      shift.x - translation.x,
      shift.y - translation.y
    );
    let ratio = shiftDistance / normalizationUnit;
    if (shiftDistance > 0 && ratio === 0) {
      incomplete = true;
      findings.push(createNumericUnderflowFinding('stability-shift-ratio', {
        nodeIds: [shift.id],
      }, [shiftDistance, normalizationUnit],
      `Node "${shift.id}" has a positive stability-shift ratio that rounds to zero.`));
      continue;
    }
    shiftRatios.push({ id: shift.id, ratio });
  }
  for (let shift of shiftRatios) {
    if (shift.ratio > policy.maxStabilityShiftRatio) {
      findings.push(createFinding('layout.unstable', 'warning', { nodeIds: [shift.id] },
        shift.ratio, policy.maxStabilityShiftRatio,
        `Node "${shift.id}" moved relative to the baseline layout.`));
    }
  }

  let edgeRatios = edges.map((edge) => edge.lengthRatio);
  let averageMetrics = {
    edgeLength: nonnegativeMean(edgeRatios),
    nearestNeighbor: nonnegativeMean(nearestValues),
    parentDistance: nonnegativeMean(parentRatios),
    stabilityShift: nonnegativeMean(shiftRatios.map((shift) => shift.ratio)),
  };
  for (let [key, metric, message] of [
    ['edgeLength', 'edge-average-length-ratio', 'The positive average edge-length ratio rounds to zero.'],
    ['nearestNeighbor', 'nearest-neighbor-average-ratio', 'The positive average nearest-neighbor ratio rounds to zero.'],
    ['parentDistance', 'parent-average-distance-ratio', 'The positive average parent-distance ratio rounds to zero.'],
    ['stabilityShift', 'stability-average-shift-ratio', 'The positive average stability-shift ratio rounds to zero.'],
  ]) {
    if (!averageMetrics[key].underflow) continue;
    incomplete = true;
    findings.push(createNumericUnderflowFinding(metric, {},
      averageMetrics[key].operands, message));
  }
  let objectiveFailure = findings.some((item) => [
    'node.overlap',
    'edge.node-intersection',
  ].includes(item.ruleId));
  let warning = findings.some((item) => item.severity === 'warning');
  let complete = !incomplete;
  let status = !complete ? 'incomplete' : objectiveFailure ? 'fail' : warning ? 'warn' : 'pass';

  let sortedFindings = sortFindings(findings);
  let idCounts = new Map();
  for (let finding of sortedFindings) {
    let nodeIds = finding.nodeIds || [];
    let edgeIds = finding.edgeIds || [];
    nodeIds = [...nodeIds].sort(compareText);
    edgeIds = [...edgeIds].sort(compareText);
    if (finding.nodeIds) finding.nodeIds = nodeIds;
    if (finding.edgeIds) finding.edgeIds = edgeIds;

    let baseIdStr = finding.ruleId
      + findingIdSegment('nodes', nodeIds)
      + findingIdSegment('edges', edgeIds);

    let count = idCounts.get(baseIdStr) || 0;
    idCounts.set(baseIdStr, count + 1);
    finding.id = count === 0 ? baseIdStr : `${baseIdStr}:${count}`;
  }

  return {
    version: GRAPH_LAYOUT_QUALITY_VERSION,
    status,
    pass: complete && !objectiveFailure,
    complete,
    normalization,
    policy,
    metrics: {
      nodes: { total: sourceNodes.length, analyzed: nodes.length, overlaps },
      edges: {
        total: sourceEdges.length,
        analyzed: edges.length,
        nodeIntersections,
        crossings,
        averageLengthRatio: round(averageMetrics.edgeLength.value),
        maxLengthRatio: round(maximum(edgeRatios)),
      },
      bounds,
      nearestNeighborDistance: {
        count: nearestValues.length,
        averageRatio: round(averageMetrics.nearestNeighbor.value),
        maxRatio: round(maximum(nearestValues)),
      },
      viewport: viewportMetrics,
      locality: {
        count: parentRatios.length,
        averageDistanceRatio: round(averageMetrics.parentDistance.value),
      },
      stability: {
        count: shiftRatios.length,
        translation: { x: round(translation.x), y: round(translation.y) },
        averageShiftRatio: round(averageMetrics.stabilityShift.value),
        maxShiftRatio: round(maximum(shiftRatios.map((shift) => shift.ratio))),
      },
    },
    coverage: {
      nodes: {
        total: sourceNodes.length,
        analyzedIds: nodes.map((node) => node.id),
        skippedIds: skippedNodeIds,
        skippedCount: skippedNodeCount,
        unidentifiedCount: unidentifiedNodeCount,
      },
      edges: {
        total: sourceEdges.length,
        analyzedIds: edges.map((edge) => edge.id),
        skippedIds: skippedEdgeIds,
        skippedCount: skippedEdgeCount,
        unidentifiedCount: unidentifiedEdgeCount,
      },
      baseline: {
        total: baselineTotal,
        analyzedIds: baselineAnalyzedIds,
        skippedIds: baselineSkippedIds,
        skippedCount: baselineSkippedCount,
        unidentifiedCount: baselineUnidentifiedCount,
      },
      checks: Object.fromEntries(Object.keys(requiredChecks).map((key) => [
        key,
        {
          required: requiredChecks[key],
          status: enabledChecks[key] ? 'complete' : 'skipped-budget',
          budgetCost: requiredCosts[key],
        },
      ])),
    },
    findings: sortedFindings,
  };
}
