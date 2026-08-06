import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

import {
  GRAPH_LAYOUT_QUALITY_DEFAULT_POLICY,
  GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN,
  GRAPH_LAYOUT_QUALITY_SCHEMA_ID,
  GRAPH_LAYOUT_QUALITY_VERSION,
  analyzeGraphLayout,
} from '../graph/layout-quality.js';
import {
  GRAPH_ANALYSIS_CATALOG,
  GRAPH_LAYOUT_QUALITY_POLICY_FIELDS,
  GRAPH_LAYOUT_QUALITY_REPORT_INVARIANTS,
  GRAPH_LAYOUT_QUALITY_RULES,
  GRAPH_LAYOUT_QUALITY_SCHEMA,
  getGraphAnalysisOperation,
  listGraphAnalysisOperations,
} from '../manifest/graph-analysis-catalog.js';

const schemaValidator = new Ajv2020({ allErrors: true, strict: true });
const validateReport = schemaValidator.compile(GRAPH_LAYOUT_QUALITY_SCHEMA);
const validateInput = schemaValidator.getSchema(
  `${GRAPH_LAYOUT_QUALITY_SCHEMA_ID}#/$defs/input`
);

function node(id, x, y, width = 10, height = 10, parentId) {
  return {
    id,
    bounds: { x, y, width, height },
    ...(parentId ? { parentId } : {}),
  };
}

function snapshot(nodes, edges = [], extras = {}) {
  return {
    version: 'graph-layout-snapshot-v1',
    nodes,
    edges,
    ...extras,
  };
}

function findings(report, ruleId) {
  return report.findings.filter((finding) => finding.ruleId === ruleId);
}

function assertValidReport(report) {
  assert.equal(validateReport(report), true, JSON.stringify(validateReport.errors, null, 2));
}

function assertInvalidReport(report) {
  assert.equal(validateReport(report), false, 'Expected the mutated report to be rejected.');
}

function assertCoverageInvariants(report) {
  for (let collection of [report.coverage.nodes, report.coverage.edges, report.coverage.baseline]) {
    assert.equal(collection.total, collection.analyzedIds.length + collection.skippedCount);
    assert.ok(collection.unidentifiedCount <= collection.skippedCount);
  }
  for (let check of Object.values(report.coverage.checks)) {
    assert.ok(['complete', 'skipped-budget'].includes(check.status));
    if (check.status === 'skipped-budget') assert.ok(check.required > 0);
  }
}

function nextDown(value) {
  let buffer = new ArrayBuffer(8);
  let view = new DataView(buffer);
  view.setFloat64(0, value, false);
  view.setBigUint64(0, view.getBigUint64(0, false) - 1n, false);
  return view.getFloat64(0, false);
}

test('a clean layout produces a complete deterministic pass report without mutating input', () => {
  let input = snapshot(
    [node('a', 0, 0), node('b', 30, 0)],
    [{ id: 'a-b', sourceId: 'a', targetId: 'b' }]
  );
  let before = structuredClone(input);
  let report = analyzeGraphLayout(input);

  assert.deepEqual(input, before);
  assert.equal(report.version, GRAPH_LAYOUT_QUALITY_VERSION);
  assert.equal(report.status, 'pass');
  assert.equal(report.pass, true);
  assert.equal(report.complete, true);
  assert.deepEqual(report.policy, GRAPH_LAYOUT_QUALITY_DEFAULT_POLICY);
  assert.equal(report.normalization.basis, 'median-node-diagonal');
  assert.equal(report.metrics.nodes.overlaps, 0);
  assert.equal(report.metrics.edges.nodeIntersections, 0);
  assert.equal(report.metrics.edges.crossings, 0);
  assert.deepEqual(report.findings, []);
});

test('empty and one-node layouts are valid', () => {
  let empty = analyzeGraphLayout(snapshot([]));
  let emptyWithViewport = analyzeGraphLayout(snapshot([], [], {
    viewport: { width: 100, height: 80, padding: 10 },
  }));
  let single = analyzeGraphLayout(snapshot([node('only', 4, 8, 12, 16)]));

  assert.equal(empty.status, 'pass');
  assert.equal(empty.complete, true);
  assert.equal(empty.normalization.basis, 'empty-layout-default');
  assert.equal(empty.metrics.nodes.total, 0);
  assert.equal(emptyWithViewport.metrics.viewport.provided, true);
  assert.equal(emptyWithViewport.metrics.viewport.fitScale, 1);
  assert.equal(emptyWithViewport.metrics.viewport.minRenderedNodeSize, null);
  assert.equal(single.status, 'pass');
  assert.equal(single.normalization.unit, 20);
  assert.equal(single.metrics.nearestNeighborDistance.count, 0);
});

test('node overlaps are objective failures with exact node ids', () => {
  let report = analyzeGraphLayout(snapshot([
    node('right', 5, 0),
    node('left', 0, 0),
  ]));
  let overlap = findings(report, 'node.overlap')[0];

  assert.equal(report.status, 'fail');
  assert.equal(report.pass, false);
  assert.deepEqual(overlap.nodeIds, ['left', 'right']);
  assert.equal(overlap.actual, 50);
  assert.equal(overlap.limit, 0);
});

test('overlap tolerance is measured in the same area units as the finding', () => {
  let nodes = [node('left', 0, 0), node('right', 5, 0)];
  let tolerated = analyzeGraphLayout(snapshot(nodes, [], {
    policy: { overlapTolerance: 50 },
  }));
  let rejected = analyzeGraphLayout(snapshot(nodes, [], {
    policy: { overlapTolerance: 49 },
  }));

  assert.deepEqual(findings(tolerated, 'node.overlap'), []);
  assert.equal(findings(rejected, 'node.overlap')[0].actual, 50);
  assert.equal(findings(rejected, 'node.overlap')[0].limit, 49);
});

test('small positive overlap findings preserve an actual value above the limit', () => {
  let report = analyzeGraphLayout(snapshot([
    node('a', 0, 0, 1e-4, 1e-4),
    node('b', 5e-5, 0, 1e-4, 1e-4),
  ]));
  let overlap = findings(report, 'node.overlap')[0];

  assert.equal(report.status, 'fail');
  assert.ok(overlap.actual > overlap.limit);
  assert.ok(Math.abs(overlap.actual - 5e-9) < 1e-20);
});

test('an edge crossing an unrelated node is an objective failure', () => {
  let report = analyzeGraphLayout(snapshot(
    [node('source', 0, 0), node('obstacle', 20, 0), node('target', 40, 0)],
    [{ id: 'route', sourceId: 'source', targetId: 'target' }]
  ));
  let intersection = findings(report, 'edge.node-intersection')[0];

  assert.equal(report.status, 'fail');
  assert.deepEqual(intersection.nodeIds, ['obstacle']);
  assert.deepEqual(intersection.edgeIds, ['route']);
  assert.equal(intersection.actual, 1);
  assert.equal(intersection.limit, 0);
});

test('a route tangent to node bounds is not an interior intersection', () => {
  let report = analyzeGraphLayout(snapshot(
    [
      node('source', -20, 0, 5, 5),
      node('obstacle', 0, 0),
      node('target', 20, 0, 5, 5),
    ],
    [{
      id: 'route',
      sourceId: 'source',
      targetId: 'target',
      points: [{ x: -15, y: 10 }, { x: 25, y: 10 }],
    }]
  ));

  assert.deepEqual(findings(report, 'edge.node-intersection'), []);
});

test('edge-node topology distinguishes strict interior from boundary-only contact', () => {
  let cases = [
    ['corner tangent', [{ x: -5, y: 5 }, { x: 5, y: -5 }], false],
    ['boundary travel', [{ x: -5, y: 0 }, { x: 15, y: 0 }], false],
    ['diagonal through corners', [{ x: -5, y: -5 }, { x: 15, y: 15 }], true],
    ['boundary endpoint inward', [{ x: 0, y: 5 }, { x: 5, y: 5 }], true],
    ['boundary endpoint outward', [{ x: -5, y: 5 }, { x: 0, y: 5 }], false],
    ['degenerate interior', [{ x: 5, y: 5 }, { x: 5, y: 5 }], true],
    ['degenerate boundary', [{ x: 0, y: 5 }, { x: 0, y: 5 }], false],
    ['degenerate exterior', [{ x: -1, y: 5 }, { x: -1, y: 5 }], false],
  ];

  for (let [label, points, expected] of cases) {
    let report = analyzeGraphLayout(snapshot(
      [
        node('source', -100, 100),
        node('obstacle', 0, 0),
        node('target', 100, 100),
      ],
      [{ id: label, sourceId: 'source', targetId: 'target', points }]
    ));
    assert.equal(findings(report, 'edge.node-intersection').length > 0, expected, label);
  }
});

test('edge-node intersection detection is invariant across long route scales', () => {
  let report = analyzeGraphLayout(snapshot(
    [
      node('left', -1e12, 0),
      node('middle', 0, 0),
      node('right', 1e12, 0),
    ],
    [{
      id: 'long-route',
      sourceId: 'left',
      targetId: 'right',
      points: [{ x: -1e12, y: 5 }, { x: 1e12, y: 5 }],
    }]
  ));

  assert.equal(report.status, 'fail');
  assert.equal(findings(report, 'edge.node-intersection').length, 1);
  assert.deepEqual(findings(report, 'edge.node-intersection')[0].nodeIds, ['middle']);
});

test('edge-node intersection survives extreme coordinate and obstacle scale differences', () => {
  let report = analyzeGraphLayout(snapshot(
    [
      node('source', -100, 100),
      node('obstacle', 0, 0, 1e-149, 1e-149),
      node('target', 100, 100),
    ],
    [{
      id: 'extreme-route',
      sourceId: 'source',
      targetId: 'target',
      points: [{ x: -1e150, y: 5e-150 }, { x: 1e150, y: 5e-150 }],
    }]
  ));

  assert.equal(report.status, 'fail');
  assert.deepEqual(findings(report, 'edge.node-intersection')[0].nodeIds, ['obstacle']);
});

test('extreme-scale routes tangent to obstacle bounds stay non-intersecting', () => {
  let report = analyzeGraphLayout(snapshot(
    [
      node('source', -100, 100),
      node('obstacle', 0, 0, 1e-149, 1e-149),
      node('target', 100, 100),
    ],
    [{
      id: 'extreme-tangent',
      sourceId: 'source',
      targetId: 'target',
      points: [{ x: -1e150, y: 0 }, { x: 1e150, y: 0 }],
    }]
  ));

  assert.deepEqual(findings(report, 'edge.node-intersection'), []);
});

test('distinct edge crossings warn while shared endpoints do not count as crossings', () => {
  let report = analyzeGraphLayout(snapshot(
    [
      node('a', 0, 0),
      node('b', 30, 0),
      node('c', 0, 30),
      node('d', 30, 30),
    ],
    [
      { id: 'diagonal-a', sourceId: 'a', targetId: 'd' },
      { id: 'diagonal-b', sourceId: 'b', targetId: 'c' },
      { id: 'shared', sourceId: 'a', targetId: 'b' },
    ]
  ));
  let crossings = findings(report, 'edge.crossing');

  assert.equal(report.status, 'warn');
  assert.equal(report.pass, true);
  assert.equal(crossings.length, 1);
  assert.deepEqual(crossings[0].edgeIds, ['diagonal-a', 'diagonal-b']);
  assert.equal(crossings[0].severity, 'warning');
});

test('adaptive orientation rejects a large near-collinear false crossing', () => {
  let report = analyzeGraphLayout(snapshot(
    [
      node('a', 0, -1000),
      node('b', 30, -1000),
      node('c', 60, -1000),
      node('d', 90, -1000),
    ],
    [
      {
        id: 'ab',
        sourceId: 'a',
        targetId: 'b',
        points: [{ x: 0, y: 0 }, { x: 100000001, y: 100000000 }],
      },
      {
        id: 'cd',
        sourceId: 'c',
        targetId: 'd',
        points: [
          { x: 100000000, y: 99999999 },
          { x: 99999999, y: 99999998 },
        ],
      },
    ]
  ));

  assert.equal(report.metrics.edges.crossings, 0);
  assert.equal(findings(report, 'edge.crossing').length, 0);
});

test('edges with a shared graph endpoint still report a remote route crossing', () => {
  let report = analyzeGraphLayout(snapshot(
    [node('a', 0, 0, 5, 5), node('b', 20, 0, 5, 5), node('c', 0, 20, 5, 5)],
    [
      {
        id: 'a-b',
        sourceId: 'a',
        targetId: 'b',
        points: [{ x: 2.5, y: 2.5 }, { x: 10, y: 10 }, { x: 22.5, y: 2.5 }],
      },
      {
        id: 'a-c',
        sourceId: 'a',
        targetId: 'c',
        points: [
          { x: 2.5, y: 2.5 },
          { x: 5, y: 15 },
          { x: 10, y: 10 },
          { x: 2.5, y: 22.5 },
        ],
      },
    ]
  ));

  assert.deepEqual(findings(report, 'edge.crossing')[0].edgeIds, ['a-b', 'a-c']);
});

test('long edges and distant nearest neighbors include normalized actual and limit values', () => {
  let report = analyzeGraphLayout(snapshot(
    [node('a', 0, 0), node('b', 100, 0)],
    [{ id: 'long', sourceId: 'a', targetId: 'b' }]
  ));
  let longEdge = findings(report, 'edge.too-long')[0];
  let distantNodes = findings(report, 'node.too-distant');

  assert.equal(report.status, 'warn');
  assert.equal(longEdge.actual > longEdge.limit, true);
  assert.equal(longEdge.limit, GRAPH_LAYOUT_QUALITY_DEFAULT_POLICY.maxEdgeLengthRatio);
  assert.deepEqual(longEdge.edgeIds, ['long']);
  assert.equal(distantNodes.length, 2);
  assert.equal(distantNodes.every((finding) => finding.actual > finding.limit), true);
});

test('ideal edge length overrides normalization and malformed policy is incomplete', () => {
  let normalized = analyzeGraphLayout(snapshot(
    [node('a', 0, 0), node('b', 100, 0)],
    [{ id: 'a-b', sourceId: 'a', targetId: 'b' }],
    { policy: { idealEdgeLength: 200 } }
  ));
  let invalid = analyzeGraphLayout(snapshot([node('a', 0, 0)], [], {
    policy: { idealEdgeLength: 0, unknownField: 1 },
  }));
  let nullPolicy = analyzeGraphLayout({
    ...snapshot([node('a', 0, 0)]),
    policy: null,
  });

  assert.equal(normalized.normalization.basis, 'ideal-edge-length-override');
  assert.equal(normalized.normalization.unit, 200);
  assert.equal(findings(normalized, 'edge.too-long').length, 0);
  assert.equal(invalid.status, 'incomplete');
  assert.equal(findings(invalid, 'policy.invalid-field').length, 1);
  assert.equal(findings(invalid, 'policy.unknown-field').length, 1);
  assert.equal(nullPolicy.status, 'incomplete');
  assert.equal(findings(nullPolicy, 'policy.invalid').length, 1);
});

test('parent distance warns and missing parents make the analysis incomplete', () => {
  let distant = analyzeGraphLayout(snapshot([
    node('parent', 0, 0),
    node('child', 40, 0, 10, 10, 'parent'),
  ]));
  let missing = analyzeGraphLayout(snapshot([
    node('child', 0, 0, 10, 10, 'missing'),
  ]));

  assert.equal(distant.status, 'warn');
  assert.deepEqual(findings(distant, 'parent.too-distant')[0].nodeIds, ['child', 'parent']);
  assert.equal(missing.status, 'incomplete');
  assert.equal(missing.complete, false);
  assert.deepEqual(findings(missing, 'parent.invalid')[0].nodeIds, ['child', 'missing']);
});

test('self, cyclic, and malformed parent references are explicit without hiding node geometry', () => {
  let self = analyzeGraphLayout(snapshot([
    node('self', 0, 0, 10, 10, 'self'),
  ]));
  let cycle = analyzeGraphLayout(snapshot([
    node('a', 0, 0, 10, 10, 'b'),
    node('b', 30, 0, 10, 10, 'a'),
  ]));
  let malformed = analyzeGraphLayout(snapshot([
    { id: 'bad-parent', parentId: 42, bounds: { x: 0, y: 0, width: 10, height: 10 } },
    node('overlap', 5, 0),
  ]));

  assert.deepEqual(findings(self, 'parent.cycle')[0].nodeIds, ['self']);
  assert.deepEqual(findings(cycle, 'parent.cycle')[0].nodeIds, ['a', 'b']);
  assert.equal(malformed.status, 'incomplete');
  assert.deepEqual(malformed.coverage.nodes.analyzedIds, ['bad-parent', 'overlap']);
  assert.equal(findings(malformed, 'parent.invalid').length, 1);
  assert.equal(findings(malformed, 'node.overlap').length, 1);
});

test('viewport fit reports nodes that would render below the readability limit', () => {
  let report = analyzeGraphLayout(snapshot(
    [node('left', 0, 0), node('right', 990, 0)],
    [],
    { viewport: { width: 100, height: 100, padding: 0 } }
  ));
  let unreadable = findings(report, 'viewport.node-too-small');

  assert.equal(report.metrics.viewport.fitScale, 0.1);
  assert.equal(report.metrics.viewport.minRenderedNodeSize, 1);
  assert.equal(unreadable.length, 2);
  assert.equal(unreadable.every((finding) => finding.limit === 24), true);
});

test('invalid viewport padding cannot be silently normalized', () => {
  let negative = analyzeGraphLayout(snapshot([node('a', 0, 0)], [], {
    viewport: { width: 100, height: 100, padding: -1 },
  }));
  let unusable = analyzeGraphLayout(snapshot([node('a', 0, 0)], [], {
    viewport: { width: 100, height: 100, padding: 50 },
  }));

  assert.equal(negative.status, 'incomplete');
  assert.equal(unusable.status, 'incomplete');
  assert.equal(findings(negative, 'viewport.invalid').length, 1);
  assert.equal(findings(unusable, 'viewport.invalid').length, 1);
  assert.equal(negative.metrics.viewport.provided, false);
});

test('stability ignores identical and uniformly translated layouts but finds relative movement', () => {
  let baseline = {
    nodes: [node('a', 0, 0), node('b', 30, 0), node('c', 60, 0)],
  };
  let identical = analyzeGraphLayout(snapshot(baseline.nodes, [], { baseline }));
  let translated = analyzeGraphLayout(snapshot(
    [node('a', 100, 50), node('b', 130, 50), node('c', 160, 50)],
    [],
    { baseline }
  ));
  let moved = analyzeGraphLayout(snapshot(
    [node('a', 100, 50), node('b', 130, 50), node('c', 175, 50)],
    [],
    { baseline }
  ));

  assert.equal(identical.metrics.stability.maxShiftRatio, 0);
  assert.equal(translated.metrics.stability.maxShiftRatio, 0);
  assert.deepEqual(findings(identical, 'layout.unstable'), []);
  assert.deepEqual(findings(translated, 'layout.unstable'), []);
  assert.deepEqual(findings(moved, 'layout.unstable')[0].nodeIds, ['c']);
});

test('baseline supports array and ID-map shapes and rejects ambiguous duplicate geometry', () => {
  let current = [node('a', 10, 20), node('b', 40, 20)];
  let arrayBaseline = analyzeGraphLayout(snapshot(current, [], {
    baseline: {
      nodes: [
        { id: 'a', x: 0, y: 0, width: 10, height: 10 },
        { id: 'b', bounds: { x: 30, y: 0, width: 10, height: 10 } },
      ],
    },
  }));
  let mapBaseline = analyzeGraphLayout(snapshot(current, [], {
    baseline: {
      nodes: {
        a: { x: 0, y: 0, width: 10, height: 10 },
        b: { bounds: { x: 30, y: 0, width: 10, height: 10 } },
      },
    },
  }));
  let duplicate = analyzeGraphLayout(snapshot([node('a', 0, 0)], [], {
    baseline: {
      nodes: [
        node('a', 0, 0),
        node('a', 20, 0),
      ],
    },
  }));
  let missingNodes = analyzeGraphLayout(snapshot([], [], { baseline: {} }));

  assert.equal(arrayBaseline.metrics.stability.maxShiftRatio, 0);
  assert.deepEqual(mapBaseline, arrayBaseline);
  assert.deepEqual(duplicate.coverage.baseline.analyzedIds, []);
  assert.deepEqual(duplicate.coverage.baseline.skippedIds, ['a']);
  assert.equal(findings(duplicate, 'baseline.duplicate-id')[0].actual, 2);
  assert.equal(missingNodes.status, 'incomplete');
  assert.equal(findings(missingNodes, 'baseline.invalid').length, 1);
});

test('malformed node geometry returns an incomplete report instead of a partial pass', () => {
  let report = analyzeGraphLayout(snapshot([
    node('valid', 0, 0),
    node('invalid', 20, 0, 0, 10),
  ]));

  assert.equal(report.status, 'incomplete');
  assert.equal(report.pass, false);
  assert.equal(report.complete, false);
  assert.deepEqual(report.coverage.nodes.analyzedIds, ['valid']);
  assert.deepEqual(report.coverage.nodes.skippedIds, ['invalid']);
  assert.deepEqual(findings(report, 'node.invalid-geometry')[0].nodeIds, ['invalid']);
});

test('tiny and large geometry stay representable inside the published numeric domain', () => {
  let tiny = analyzeGraphLayout(snapshot([
    node('tiny-a', 0, 0, 1e-149, 1e-149),
    node('tiny-b', 3e-149, 0, 1e-149, 1e-149),
  ]));
  let large = analyzeGraphLayout(snapshot([
    node('large-a', -1e149, 0, 1e148, 1e148),
    node('large-b', 1e149, 0, 1e148, 1e148),
  ]));

  assert.ok(tiny.normalization.unit > 0);
  assert.ok(Number.isFinite(tiny.normalization.unit));
  assert.ok(large.metrics.bounds.width > 0);
  assert.ok(Number.isFinite(large.metrics.bounds.width));
  assert.doesNotThrow(() => JSON.stringify(tiny));
  assert.doesNotThrow(() => JSON.stringify(large));
});

test('positive overlap areas that underflow cannot produce a clean pass', () => {
  let size = GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMinimum;
  let position = nextDown(size);
  let report = analyzeGraphLayout(snapshot([
    node('a', 0, 0, size, size),
    node('b', position, position, size, size),
  ]));
  let underflow = findings(report, 'layout.numeric-underflow')[0];

  assert.equal(report.status, 'incomplete');
  assert.equal(report.pass, false);
  assert.equal(underflow.actual.metric, 'node-overlap-area');
  assert.ok(underflow.actual.operands.every((value) => value > 0));
  assert.equal(underflow.actual.roundedValue, 0);
  assertValidReport(report);
});

test('positive normalized route lengths that underflow cannot produce a clean pass', () => {
  let size = GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMinimum;
  let report = analyzeGraphLayout(snapshot(
    [node('a', 0, 0, size, size), node('b', 1e-149, 0, size, size)],
    [{
      id: 'subnormal-route',
      sourceId: 'a',
      targetId: 'b',
      points: [{ x: 0, y: 0 }, { x: Number.MIN_VALUE, y: 0 }],
    }],
    {
      policy: {
        idealEdgeLength: GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMaximum,
        maxEdgeLengthRatio: 0,
        maxNearestNeighborDistanceRatio: 1e308,
      },
    }
  ));
  let underflow = findings(report, 'layout.numeric-underflow')[0];

  assert.equal(report.status, 'incomplete');
  assert.equal(report.pass, false);
  assert.equal(underflow.actual.metric, 'edge-length-ratio');
  assert.deepEqual(underflow.edgeIds, ['subnormal-route']);
  assert.equal(report.coverage.edges.skippedCount, 1);
  assertValidReport(report);
});

test('center rounding cannot hide nearest-neighbor or parent distance', () => {
  let size = GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMinimum;
  let report = analyzeGraphLayout(snapshot([
    node('a', 0, 0, size, size),
    node('b', Number.MIN_VALUE, 0, size, size, 'a'),
  ], [], {
    policy: {
      idealEdgeLength: GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMaximum,
      overlapTolerance: 1,
      maxNearestNeighborDistanceRatio: 0,
      maxParentDistanceRatio: 0,
    },
  }));
  let metrics = findings(report, 'layout.numeric-underflow')
    .map((finding) => finding.actual.metric);

  assert.equal(report.status, 'incomplete');
  assert.deepEqual(metrics, ['parent-distance-ratio', 'nearest-neighbor-ratio']);
  assertValidReport(report);
});

test('distinct implicit edge centers cannot collapse into a zero-length route', () => {
  let size = GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMinimum;
  let report = analyzeGraphLayout(snapshot([
    node('a', 0, 0, size, size),
    node('b', Number.MIN_VALUE, 0, size, size),
  ], [{ id: 'a-b', sourceId: 'a', targetId: 'b' }], {
    policy: {
      idealEdgeLength: 1,
      overlapTolerance: 1,
      maxNearestNeighborDistanceRatio: 1,
    },
  }));
  let underflow = findings(report, 'layout.numeric-underflow')[0];

  assert.equal(report.status, 'incomplete');
  assert.equal(underflow.actual.metric, 'implicit-edge-center-route');
  assert.deepEqual(underflow.edgeIds, ['a-b']);
  assert.equal(report.coverage.edges.skippedCount, 1);
  assertValidReport(report);
});

test('implicit edge routes reject a collapsed axis even when another axis stays visible', () => {
  let size = GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMinimum;
  let report = analyzeGraphLayout(snapshot([
    node('a', 0, 0, size, 1),
    node('b', Number.MIN_VALUE, 2, size, 1),
  ], [{ id: 'a-b', sourceId: 'a', targetId: 'b' }], {
    policy: { idealEdgeLength: 1, maxNearestNeighborDistanceRatio: 1e308 },
  }));
  let underflow = findings(report, 'layout.numeric-underflow')[0];

  assert.equal(report.status, 'incomplete');
  assert.equal(underflow.actual.metric, 'implicit-edge-center-route');
  assert.deepEqual(underflow.edgeIds, ['a-b']);
  assertValidReport(report);
});

test('different bounds with exactly equal centers do not trigger numeric underflow', () => {
  let report = analyzeGraphLayout(snapshot([
    node('a', 0, 0, 2, 2),
    node('b', 0.5, 0.5, 1, 1, 'a'),
  ], [{ id: 'a-b', sourceId: 'a', targetId: 'b' }], {
    policy: {
      idealEdgeLength: 1,
      overlapTolerance: 10,
      maxEdgeLengthRatio: 0,
      maxNearestNeighborDistanceRatio: 0,
      maxParentDistanceRatio: 0,
    },
  }));

  assert.equal(report.status, 'pass');
  assert.equal(findings(report, 'layout.numeric-underflow').length, 0);
  assertValidReport(report);
});

test('center rounding cannot hide non-uniform baseline motion', () => {
  let size = GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMinimum;
  let audit = (shift) => analyzeGraphLayout(snapshot([
    node('a', shift, 0, size, size),
    node('b', size * 2, 0, size, size),
  ], [], {
    baseline: {
      nodes: [
        node('a', 0, 0, size, size),
        node('b', size * 2, 0, size, size),
      ],
    },
    policy: {
      idealEdgeLength: GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMaximum,
      maxNearestNeighborDistanceRatio: 1e308,
      maxStabilityShiftRatio: 0,
    },
  }));
  let reports = [audit(Number.MIN_VALUE), audit(-Number.MIN_VALUE)];

  for (let report of reports) {
    let metrics = findings(report, 'layout.numeric-underflow')
      .map((finding) => finding.actual.metric);
    assert.equal(report.status, 'incomplete');
    assert.deepEqual(metrics, ['stability-shift-ratio', 'stability-translation-x']);
    assertValidReport(report);
  }
});

test('opposing subnormal baseline shifts have an exact zero translation', () => {
  let size = GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMinimum;
  let report = analyzeGraphLayout(snapshot([
    node('a', -Number.MIN_VALUE, 0, size, size),
    node('b', Number.MIN_VALUE, 0, size, size),
  ], [], {
    baseline: {
      nodes: [
        node('a', 0, 0, size, size),
        node('b', 0, 0, size, size),
      ],
    },
    policy: {
      idealEdgeLength: 1,
      overlapTolerance: 1,
      maxNearestNeighborDistanceRatio: 1,
      maxStabilityShiftRatio: 1,
    },
  }));

  assert.equal(report.status, 'pass');
  assert.deepEqual(report.metrics.stability.translation, { x: 0, y: 0 });
  assert.equal(findings(report, 'layout.numeric-underflow').length, 0);
  assertValidReport(report);
});

test('a positive aggregate ratio that underflows cannot produce a clean pass', () => {
  let nodes = [
    node('a', 0, 0),
    node('b', 30, 0),
    node('c', 60, 0),
    node('d', 90, 0),
  ];
  let audit = (zeroId, minimumId) => analyzeGraphLayout(snapshot(nodes, [
    {
      id: zeroId,
      sourceId: 'a',
      targetId: 'b',
      points: [{ x: 10, y: 0 }, { x: 10, y: 0 }],
    },
    {
      id: minimumId,
      sourceId: 'c',
      targetId: 'd',
      points: [{ x: 0, y: 0 }, { x: Number.MIN_VALUE, y: 0 }],
    },
  ], {
    policy: { idealEdgeLength: 1, maxNearestNeighborDistanceRatio: 1e308 },
  }));
  let reports = [audit('a-zero', 'z-min'), audit('z-zero', 'a-min')];

  for (let report of reports) {
    let underflow = findings(report, 'layout.numeric-underflow')[0];
    assert.equal(report.status, 'incomplete');
    assert.equal(underflow.actual.metric, 'edge-average-length-ratio');
    assert.equal(report.metrics.edges.averageLengthRatio, 0);
    assert.equal(report.metrics.edges.maxLengthRatio, Number.MIN_VALUE);
    assertValidReport(report);
  }
});

test('positive rendered node sizes that underflow cannot produce a clean pass', () => {
  let sizeMinimum = GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMinimum;
  let sizeMaximum = GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMaximum;
  let report = analyzeGraphLayout(snapshot([
    node('tiny', -sizeMinimum, -sizeMinimum, sizeMinimum, sizeMinimum),
    node('large', 0, 0, sizeMaximum, sizeMaximum),
  ], [], {
    viewport: { width: sizeMinimum, height: sizeMinimum, padding: 0 },
    policy: { minRenderedNodeSize: 0 },
  }));
  let underflow = findings(report, 'layout.numeric-underflow')[0];

  assert.equal(report.status, 'incomplete');
  assert.equal(report.pass, false);
  assert.equal(underflow.actual.metric, 'viewport-rendered-node-size');
  assert.deepEqual(underflow.nodeIds, ['tiny']);
  assert.ok(underflow.actual.operands.every((value) => value > 0));
  assertValidReport(report);
});

test('structural numeric bounds report unrepresentable derived extents as incomplete', () => {
  let collapsedBounds = { x: 1e150, y: 0, width: 1e-150, height: 1 };
  let input = snapshot([{ id: 'collapsed', bounds: collapsedBounds }], [], {
    baseline: { nodes: [{ id: 'collapsed', bounds: collapsedBounds }] },
  });
  let report = analyzeGraphLayout(input);

  assert.equal(validateInput(input), true, JSON.stringify(validateInput.errors, null, 2));
  assert.equal(report.status, 'incomplete');
  assert.equal(findings(report, 'node.invalid-geometry').length, 1);
  assert.equal(findings(report, 'baseline.invalid').length, 1);
  assert.match(findings(report, 'node.invalid-geometry')[0].limit, /representable/);
  assert.match(GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.boundsInvariant, /x \+ width > x/);
  assertValidReport(report);
});

test('non-canonical whitespace IDs are rejected consistently', () => {
  let report = analyzeGraphLayout(snapshot([
    node('canonical parent', 0, 0),
    node('child', 30, 0, 10, 10, 'canonical parent'),
    node(' padded ', 60, 0),
  ]));

  assert.equal(report.status, 'incomplete');
  assert.deepEqual(report.coverage.nodes.analyzedIds, ['canonical parent', 'child']);
  assert.equal(report.coverage.nodes.unidentifiedCount, 1);
  assert.equal(findings(report, 'parent.invalid').length, 0);
  assert.equal(findings(report, 'node.invalid-id').length, 1);
});

test('malformed baseline values stay JSON-safe and never collide with valid IDs', () => {
  let report = analyzeGraphLayout(snapshot([
    node('#invalid-1', 0, 0),
    { id: null },
  ], [], {
    baseline: {
      nodes: [node('#invalid-1', 0, 0), {}],
    },
  }));
  let baselineFinding = findings(report, 'baseline.invalid')[0];

  assert.equal(report.coverage.nodes.unidentifiedCount, 1);
  assert.deepEqual(report.coverage.nodes.analyzedIds, ['#invalid-1']);
  assert.deepEqual(report.coverage.nodes.skippedIds, []);
  assert.equal(report.coverage.baseline.unidentifiedCount, 1);
  assert.deepEqual(report.coverage.baseline.analyzedIds, ['#invalid-1']);
  assert.deepEqual(report.coverage.baseline.skippedIds, []);
  assert.equal(baselineFinding.actual, null);
  assert.ok(Object.hasOwn(baselineFinding, 'actual'));
  assert.ok(JSON.stringify(report).includes('"actual":null'));
});

test('permuting input arrays does not change the report', () => {
  let nodes = [
    node('a', 0, 0),
    node('b', 30, 0),
    node('c', 60, 0, 10, 10, 'b'),
  ];
  let edges = [
    { id: 'a-b', sourceId: 'a', targetId: 'b' },
    { id: 'b-c', sourceId: 'b', targetId: 'c' },
  ];
  let baselineNodes = [node('a', 0, 0), node('b', 30, 0), node('c', 60, 0)];
  let first = analyzeGraphLayout(snapshot(nodes, edges, {
    baseline: { nodes: baselineNodes },
  }));
  let second = analyzeGraphLayout(snapshot(
    [...nodes].reverse(),
    [...edges].reverse(),
    { baseline: { nodes: [...baselineNodes].reverse() } }
  ));

  assert.deepEqual(second, first);
});

test('duplicate and tied malformed findings are deterministic under permutation', () => {
  let duplicateNodes = [node('duplicate', 0, 0), node('duplicate', 20, 0)];
  let duplicateEdges = [
    { id: 'duplicate-edge', sourceId: 'duplicate', targetId: 'duplicate' },
    { id: 'duplicate-edge', sourceId: 'duplicate', targetId: 'duplicate' },
  ];
  let duplicateBaseline = [node('baseline', 0, 0), node('baseline', 20, 0)];
  let first = analyzeGraphLayout(snapshot(duplicateNodes, duplicateEdges, {
    baseline: { nodes: duplicateBaseline },
  }));
  let second = analyzeGraphLayout(snapshot(
    [...duplicateNodes].reverse(),
    [...duplicateEdges].reverse(),
    { baseline: { nodes: [...duplicateBaseline].reverse() } }
  ));
  let malformedFirst = analyzeGraphLayout({
    version: 'graph-layout-snapshot-v1',
    nodes: [{ id: null }, node('valid', 0, 0), { id: 42 }],
    edges: [{ id: null }, { id: 42 }],
    baseline: { nodes: [null, node('valid', 0, 0), { id: 42 }] },
    policy: { zeta: 1, alpha: 2 },
  });
  let malformedSecond = analyzeGraphLayout({
    version: 'graph-layout-snapshot-v1',
    nodes: [{ id: 42 }, { id: null }, node('valid', 0, 0)],
    edges: [{ id: 42 }, { id: null }],
    baseline: { nodes: [{ id: 42 }, node('valid', 0, 0), null] },
    policy: { alpha: 2, zeta: 1 },
  });

  assert.deepEqual(second, first);
  assert.deepEqual(malformedSecond, malformedFirst);
  assert.equal(findings(first, 'node.duplicate-id')[0].actual, 2);
  assert.equal(findings(first, 'edge.duplicate-id')[0].actual, 2);
  assert.equal(findings(first, 'baseline.duplicate-id')[0].actual, 2);
});

test('malformed canonical-value collisions stay deterministic under permutation', () => {
  let malformedNodes = [
    { id: ['a,string:b'] },
    { id: ['a', 'b'] },
    { id: -0 },
    { id: 0 },
  ];
  let first = analyzeGraphLayout(snapshot(malformedNodes));
  let second = analyzeGraphLayout(snapshot([...malformedNodes].reverse()));

  assert.deepEqual(second, first);
  assert.equal(findings(first, 'node.invalid-id').length, 4);
});

test('finding IDs are stable and unique for delimiter, control, and Unicode node IDs', () => {
  let ids = ['a,b', 'a:b', 'nul\0id', 'é', '😀', '\ud800'];
  let nodes = ids.map((id) => node(id, 0, 0));
  let first = analyzeGraphLayout(snapshot(nodes));
  let second = analyzeGraphLayout(snapshot([...nodes].reverse()));
  let findingIds = first.findings.map((finding) => finding.id);

  assert.deepEqual(second, first);
  assert.equal(new Set(findingIds).size, findingIds.length);
  assert.equal(findings(first, 'node.overlap').length, ids.length * (ids.length - 1) / 2);
});

test('pair-check budget exhaustion is explicit and can never silently pass', () => {
  let report = analyzeGraphLayout(snapshot(
    [node('a', 0, 0), node('b', 30, 0), node('c', 60, 0)],
    [],
    { policy: { maxPairChecks: 2 } }
  ));
  let budget = findings(report, 'layout.analysis-budget-exceeded')[0];

  assert.equal(report.status, 'incomplete');
  assert.equal(report.complete, false);
  assert.equal(report.pass, false);
  assert.equal(budget.actual, 3);
  assert.equal(budget.limit, 2);
  assert.equal(report.coverage.checks.nodePairs.status, 'skipped-budget');
});

test('pair-check budget reserves worst-case polyline segment comparisons', { timeout: 500 }, () => {
  let nodes = [
    node('a', 0, 0),
    node('b', 20, 0),
    node('c', 40, 0),
    node('d', 60, 0),
  ];
  let points = (y) => Array.from({ length: 1001 }, (_, index) => ({ x: index, y }));
  let report = analyzeGraphLayout(snapshot(nodes, [
    { id: 'ab', sourceId: 'a', targetId: 'b', points: points(100) },
    { id: 'cd', sourceId: 'c', targetId: 'd', points: points(200) },
  ], {
    policy: { maxPairChecks: 4006 },
  }));

  assert.equal(report.status, 'incomplete');
  assert.equal(report.coverage.checks.nodePairs.budgetCost, 6);
  assert.equal(report.coverage.checks.edgeNodePairs.budgetCost, 4000);
  assert.equal(report.coverage.checks.edgePairs.required, 1);
  assert.equal(report.coverage.checks.edgePairs.budgetCost, 1000000);
  assert.equal(report.coverage.checks.edgePairs.status, 'skipped-budget');
  assert.equal(findings(report, 'layout.analysis-budget-exceeded')[0].actual, 1004006);
});

test('large parent and edge sets stop before quadratic checks', { timeout: 1500 }, () => {
  let nodes = Array.from({ length: 10000 }, (_, index) => node(
    `n${index}`,
    index * 20,
    0,
    10,
    10,
    index ? `n${index - 1}` : undefined
  ));
  let edges = nodes.slice(1).map((item, index) => ({
    id: `e${index}`,
    sourceId: nodes[index].id,
    targetId: item.id,
  }));
  let report = analyzeGraphLayout(snapshot(nodes, edges, {
    policy: { maxPairChecks: 0 },
  }));

  assert.equal(report.status, 'incomplete');
  assert.equal(report.metrics.nodes.analyzed, nodes.length);
  assert.equal(report.metrics.edges.analyzed, edges.length);
  assert.equal(report.coverage.checks.nodePairs.status, 'skipped-budget');
  assert.equal(report.coverage.checks.edgeNodePairs.status, 'skipped-budget');
  assert.equal(report.coverage.checks.edgePairs.status, 'skipped-budget');
});

test('every published rule has a schema-valid runtime fixture', () => {
  let edgeNodes = [node('a', 0, 0), node('b', 100, 0)];
  let reports = [
    analyzeGraphLayout(snapshot([], [], { policy: null })),
    analyzeGraphLayout(snapshot([], [], {
      policy: { unknownField: 1, maxPairChecks: -1 },
    })),
    analyzeGraphLayout({ version: 'wrong', nodes: {}, edges: {} }),
    analyzeGraphLayout(snapshot([
      { id: null, bounds: { x: 0, y: 0, width: 10, height: 10 } },
      node('duplicate', 0, 0),
      node('duplicate', 20, 0),
      node('bad-geometry', 40, 0, 0, 10),
      node('missing-parent', 60, 0, 10, 10, 'absent'),
      node('cycle', 80, 0, 10, 10, 'cycle'),
      node('parent', 0, 100),
      node('child', 200, 100, 10, 10, 'parent'),
    ])),
    analyzeGraphLayout(snapshot([node('a', 0, 0)], [], {
      baseline: { nodes: [{}, node('a', 0, 0), node('a', 20, 0)] },
    })),
    analyzeGraphLayout(snapshot(edgeNodes, [
      { id: null, sourceId: 'a', targetId: 'b' },
      { id: 'duplicate', sourceId: 'a', targetId: 'b' },
      { id: 'duplicate', sourceId: 'a', targetId: 'b' },
      { id: 'missing', sourceId: 'a', targetId: 'absent' },
      { id: 'points', sourceId: 'a', targetId: 'b', points: [{ x: 0, y: 0 }] },
    ])),
    analyzeGraphLayout(snapshot(
      [node('a', 0, 0), node('b', 1000, 0)],
      [{ id: 'long', sourceId: 'a', targetId: 'b' }]
    )),
    analyzeGraphLayout(snapshot(
      [node('a', 0, 0), node('middle', 50, 0), node('b', 100, 0)],
      [{ id: 'intersects', sourceId: 'a', targetId: 'b' }]
    )),
    analyzeGraphLayout(snapshot(
      [node('a', 0, 0), node('b', 100, 100), node('c', 0, 100), node('d', 100, 0)],
      [
        { id: 'ab', sourceId: 'a', targetId: 'b' },
        { id: 'cd', sourceId: 'c', targetId: 'd' },
      ]
    )),
    analyzeGraphLayout(snapshot(
      [node('a', 0, 0), node('b', 30, 0), node('c', 60, 0)],
      [],
      { policy: { maxPairChecks: 2 } }
    )),
    analyzeGraphLayout(snapshot([
      node('a', 0, 0, GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMinimum,
        GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMinimum),
      node('b', nextDown(GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMinimum),
        nextDown(GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMinimum),
        GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMinimum,
        GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN.sizeMinimum),
    ])),
    analyzeGraphLayout(snapshot([node('a', 0, 0), node('b', 5, 0)])),
    analyzeGraphLayout(snapshot([node('a', 0, 0)], [], {
      viewport: { width: 0, height: 100 },
    })),
    analyzeGraphLayout(snapshot([node('a', 0, 0, 100, 100)], [], {
      viewport: { width: 10, height: 10 },
    })),
    analyzeGraphLayout(snapshot([node('a', 0, 0), node('b', 100, 0)], [], {
      baseline: { nodes: [node('a', 0, 0), node('b', 0, 0)] },
    })),
  ];
  let observedRuleIds = new Set();

  for (let report of reports) {
    assertValidReport(report);
    assertCoverageInvariants(report);
    for (let finding of report.findings) observedRuleIds.add(finding.ruleId);
  }

  assert.deepEqual(
    GRAPH_LAYOUT_QUALITY_RULES.map((rule) => rule.id)
      .filter((ruleId) => !observedRuleIds.has(ruleId)),
    []
  );
});

test('schema rejects rule, status, payload, and coverage contradictions', () => {
  let pass = analyzeGraphLayout(snapshot([]));
  let fail = analyzeGraphLayout(snapshot([node('a', 0, 0), node('b', 5, 0)]));
  let overlapIndex = fail.findings.findIndex((finding) => finding.ruleId === 'node.overlap');
  let contradictions = [];

  let passWithFinding = structuredClone(pass);
  passWithFinding.findings.push({
    id: 'contradiction',
    ruleId: 'node.overlap',
    severity: 'warning',
    actual: {},
    limit: null,
    message: 'Contradictory finding.',
  });
  contradictions.push(passWithFinding);

  let wrongSeverity = structuredClone(fail);
  wrongSeverity.findings[overlapIndex].severity = 'warning';
  contradictions.push(wrongSeverity);

  let wrongActual = structuredClone(fail);
  wrongActual.findings[overlapIndex].actual = {};
  contradictions.push(wrongActual);

  let wrongLimit = structuredClone(fail);
  wrongLimit.findings[overlapIndex].limit = null;
  contradictions.push(wrongLimit);

  let wrongStatus = structuredClone(fail);
  wrongStatus.status = 'pass';
  wrongStatus.pass = true;
  contradictions.push(wrongStatus);

  let ghostCoverage = structuredClone(pass);
  ghostCoverage.coverage.nodes.analyzedIds.push('ghost');
  contradictions.push(ghostCoverage);

  let impossibleSkippedCheck = structuredClone(pass);
  impossibleSkippedCheck.coverage.checks.nodePairs.status = 'skipped-budget';
  contradictions.push(impossibleSkippedCheck);

  for (let report of contradictions) assertInvalidReport(report);
});

test('schema and agent catalog stay aligned with the runtime contract', async () => {
  let diskSchema = JSON.parse(await readFile(
    new URL('../schemas/graph-layout-quality-v1.json', import.meta.url),
    'utf8'
  ));
  let operation = getGraphAnalysisOperation('graph.layout.audit');

  assert.deepEqual(GRAPH_LAYOUT_QUALITY_SCHEMA, diskSchema);
  assert.equal(GRAPH_LAYOUT_QUALITY_SCHEMA.$id, GRAPH_LAYOUT_QUALITY_SCHEMA_ID);
  assert.equal(GRAPH_LAYOUT_QUALITY_SCHEMA.properties.version.const, GRAPH_LAYOUT_QUALITY_VERSION);
  assert.ok(GRAPH_LAYOUT_QUALITY_SCHEMA.$defs.input);
  assert.equal(operation.function, 'analyzeGraphLayout');
  assert.equal(operation.specifier, 'symbiote-ui/graph');
  assert.equal(operation.runtime, 'node-safe');
  assert.equal(operation.inputVersion, 'graph-layout-snapshot-v1');
  assert.equal(operation.reportVersion, GRAPH_LAYOUT_QUALITY_VERSION);
  assert.equal(operation.schemas.input, 'schemas/graph-layout-quality-v1.json#/$defs/input');
  assert.equal(operation.schemas.output, 'schemas/graph-layout-quality-v1.json');
  assert.equal(operation.annotations.readOnlyHint, true);
  assert.equal(operation.annotations.destructiveHint, false);
  assert.equal(operation.annotations.idempotentHint, true);
  assert.equal(operation.cli.command, 'layout-audit');
  assert.deepEqual(operation.defaultPolicy, GRAPH_LAYOUT_QUALITY_DEFAULT_POLICY);
  assert.deepEqual(operation.policyFields, GRAPH_LAYOUT_QUALITY_POLICY_FIELDS);
  assert.deepEqual(operation.numericDomain, GRAPH_LAYOUT_QUALITY_NUMERIC_DOMAIN);
  assert.deepEqual(operation.reportInvariants, GRAPH_LAYOUT_QUALITY_REPORT_INVARIANTS);
  assert.deepEqual(operation.rules, GRAPH_LAYOUT_QUALITY_RULES);
  assert.ok(GRAPH_LAYOUT_QUALITY_RULES.every((rule) => (
    rule.payload?.actual?.type && rule.payload?.actual?.unit
      && rule.payload?.actual?.schema
      && rule.payload?.limit?.type && rule.payload?.limit?.unit
      && rule.payload?.limit?.schema
  )));
  assert.deepEqual(
    GRAPH_LAYOUT_QUALITY_SCHEMA.$defs.finding.properties.ruleId.enum,
    GRAPH_LAYOUT_QUALITY_RULES.map((rule) => rule.id)
  );
  assert.deepEqual(
    GRAPH_LAYOUT_QUALITY_SCHEMA.$defs.resolvedPolicy.required,
    Object.keys(GRAPH_LAYOUT_QUALITY_DEFAULT_POLICY)
  );
  assert.equal(
    GRAPH_LAYOUT_QUALITY_SCHEMA.$defs.input.properties.baseline
      .properties.nodes.anyOf[1].additionalProperties.$ref,
    '#/$defs/baselineMapNode'
  );
  assert.deepEqual(listGraphAnalysisOperations(), GRAPH_ANALYSIS_CATALOG);
  assert.throws(
    () => getGraphAnalysisOperation('missing'),
    /Unknown graph analysis operation "missing".*graph\.layout\.audit/
  );
});
