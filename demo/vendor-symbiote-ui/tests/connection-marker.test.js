import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import {
  drawCanvasMarker,
  projectConnectionMarkerGeometry,
  resolveConnectionMarker,
  resolveContainmentJunctions,
  isConnectionMarkerOccluded,
} from '../canvas/ConnectionMarker.js';
import {
  isCanvasConnectionPathCacheValid,
  shouldRenderConnectionDetail,
} from '../canvas/CanvasConnectionRenderer.js';
import {
  ConnectionRenderer,
  reconcileSvgJunctionMarkers,
  renderConnectionBatch,
  updateSvgMarker,
} from '../canvas/ConnectionRenderer.js';
import { normalizeGraphEdge } from '../graph/model.js';
import { getGraphSchema } from '../manifest/graph-schema.js';
import { CONNECTION_MARKER_METRICS } from '../tokens/scale.js';

test('resolveConnectionMarker flow placement on longest straight segment', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 100, y: 0 }, // Seg 1: L=100
    { x: 100, y: 50 }, // Seg 2: L=50
  ];
  const conn = {
    id: 'test-flow',
    direction: 'forward',
    design: {
      marker: {
        role: 'flow'
      }
    }
  };

  const marker = resolveConnectionMarker(points, conn, {
    portClearance: 10,
    bendClearance: 5,
    minMarkerLength: 10,
  });

  // Longest segment is Seg 1 (length 100)
  // Safe interval after excluding portClearance (10) from start, and bendClearance (5) from end:
  // [10, 95] -> midpoint = (10 + 95) / 2 = 52.5
  assert.equal(marker.type, 'flow');
  assert.equal(marker.x, 52.5);
  assert.equal(marker.y, 0);
  assert.equal(marker.angle, 0);
  assert.equal(marker.direction, 'forward');
});

test('resolveConnectionMarker reverse rotates angle', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];
  const conn = {
    id: 'test-reverse-flow',
    direction: 'reverse',
    design: {
      marker: {
        role: 'flow'
      }
    }
  };

  const marker = resolveConnectionMarker(points, conn, {
    portClearance: 10,
    bendClearance: 5,
    minMarkerLength: 10,
  });

  assert.equal(marker.type, 'flow');
  assert.equal(marker.angle, Math.PI);
});

test('resolveConnectionMarker too short route gets none', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 20, y: 0 }, // L=20
  ];
  const conn = {
    id: 'test-short',
    direction: 'forward',
    design: {
      marker: {
        role: 'flow'
      }
    }
  };

  // With portClearance = 15 on both sides, the segment has no safe space.
  const marker = resolveConnectionMarker(points, conn, {
    portClearance: 15,
    minMarkerLength: 5,
  });

  assert.equal(marker.type, 'none');
});

test('resolveContainmentJunctions at split branch', () => {
  const conn1 = {
    id: 'conn1',
    from: 'nodeA',
    kind: 'containment',
  };

  const conn2 = {
    id: 'conn2',
    from: 'nodeA',
    kind: 'containment',
  };

  const pts1 = [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 50 },
  ];
  const pts2 = [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 100, y: 0 },
  ];

  const connectionPoints = new Map([
    ['conn1', pts1],
    ['conn2', pts2],
  ]);

  const junctions = resolveContainmentJunctions([conn1, conn2], connectionPoints);

  assert.equal(junctions.length, 1);
  assert.equal(junctions[0].type, 'junction');
  assert.equal(junctions[0].x, 50);
  assert.equal(junctions[0].y, 0);
  assert.deepEqual(junctions[0].connectionIds, ['conn1', 'conn2']);
  assert.equal(junctions[0].ownerId, 'conn1');
});

test('Connection serialization round-trip table-driven', async () => {
  const { default: NodeEditor } = await import('../core/Editor.js');
  const { default: Node } = await import('../core/Node.js');
  const { default: Connection } = await import('../core/Connection.js');
  const { Output, Input, Socket } = await import('../core/Socket.js');

  const cases = [
    {
      id: 'conn-1',
      from: 'node-A',
      out: 'out-1',
      to: 'node-B',
      in: 'in-1',
      kind: 'has-media',
      direction: 'forward',
      design: { marker: { role: 'flow' } }
    },
    {
      id: 'conn-2',
      from: 'node-A',
      out: 'out-1',
      to: 'node-B',
      in: 'in-2',
      kind: 'uses',
      direction: 'forward',
      design: { marker: { role: 'gate' } }
    },
    {
      id: 'conn-3',
      from: 'node-A',
      out: 'out-1',
      to: 'node-B',
      in: 'in-3',
      kind: undefined,
      direction: undefined,
      design: undefined
    }
  ];

  const editor = new NodeEditor();
  const nodeA = new Node();
  nodeA.id = 'node-A';
  nodeA.addOutput('out-1', new Output(new Socket('any')));
  const nodeB = new Node();
  nodeB.id = 'node-B';
  nodeB.addInput('in-1', new Input(new Socket('any')));
  nodeB.addInput('in-2', new Input(new Socket('any')));
  nodeB.addInput('in-3', new Input(new Socket('any')));
  editor.addNode(nodeA);
  editor.addNode(nodeB);

  for (const tc of cases) {
    const conn = new Connection(nodeA, tc.out, nodeB, tc.in);
    conn.id = tc.id;
    if (tc.kind !== undefined) conn.kind = tc.kind;
    if (tc.direction !== undefined) conn.direction = tc.direction;
    if (tc.design !== undefined) conn.design = tc.design;
    editor.addConnection(conn);
  }

  const json = editor.toJSON();

  const newEditor = new NodeEditor();
  const newNodeA = new Node();
  newNodeA.id = 'node-A';
  newNodeA.addOutput('out-1', new Output(new Socket('any')));
  const newNodeB = new Node();
  newNodeB.id = 'node-B';
  newNodeB.addInput('in-1', new Input(new Socket('any')));
  newNodeB.addInput('in-2', new Input(new Socket('any')));
  newNodeB.addInput('in-3', new Input(new Socket('any')));
  newEditor.addNode(newNodeA);
  newEditor.addNode(newNodeB);

  newEditor.fromJSON(json);

  const conns = Array.from(newEditor.connections.values());
  assert.equal(conns.length, 3);

  for (const tc of cases) {
    const conn = newEditor.connections.get(tc.id);
    assert.ok(conn, `connection ${tc.id} not found`);
    assert.equal(conn.from, tc.from);
    assert.equal(conn.out, tc.out);
    assert.equal(conn.to, tc.to);
    assert.equal(conn.in, tc.in);
    assert.equal(conn.kind, tc.kind);
    assert.equal(conn.direction, tc.direction);
    assert.deepEqual(conn.design, tc.design);
  }
});

test('resolveConnectionMarker flow validation table-driven', () => {
  const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }];

  const testCases = [
    {
      name: 'Valid flow',
      conn: { direction: 'forward', kind: 'uses', design: { marker: { role: 'flow' } } },
      expectedType: 'flow'
    },
    {
      name: 'Flow with direction none',
      conn: { direction: 'none', kind: 'uses', design: { marker: { role: 'flow' } } },
      expectedType: 'none'
    },
    {
      name: 'Flow with unspecified direction',
      conn: { kind: 'uses', design: { marker: { role: 'flow' } } },
      expectedType: 'none'
    },
    {
      name: 'Flow with containment relation',
      conn: { direction: 'forward', kind: 'containment', design: { marker: { role: 'flow' } } },
      expectedType: 'none'
    },
    {
      name: 'Flow with reference relation',
      conn: { direction: 'forward', kind: 'reference', design: { marker: { role: 'flow' } } },
      expectedType: 'none'
    },
    {
      name: 'Flow with association relation',
      conn: { direction: 'forward', kind: 'association', design: { marker: { role: 'flow' } } },
      expectedType: 'none'
    },
    {
      name: 'Flow with secondary relation',
      conn: { direction: 'forward', kind: 'secondary', design: { marker: { role: 'flow' } } },
      expectedType: 'none'
    },
    {
      name: 'Unknown role becomes none',
      conn: { direction: 'forward', kind: 'uses', design: { marker: { role: 'invalid-role' } } },
      expectedType: 'none'
    },
    {
      name: 'Edge-local junction is ignored',
      conn: { direction: 'forward', kind: 'uses', design: { marker: { role: 'junction' } } },
      expectedType: 'none'
    },
    {
      name: 'Explicit gate on a primary directed edge',
      conn: { direction: 'forward', kind: 'uses', design: { marker: { role: 'gate' } } },
      expectedType: 'gate'
    },
    {
      name: 'Gate on a non-directional edge is ignored',
      conn: { direction: 'none', kind: 'uses', design: { marker: { role: 'gate' } } },
      expectedType: 'none'
    },
    {
      name: 'Gate on a secondary edge is ignored',
      conn: { direction: 'forward', kind: 'secondary', design: { marker: { role: 'gate' } } },
      expectedType: 'none'
    }
  ];

  for (const tc of testCases) {
    const marker = resolveConnectionMarker(points, tc.conn, {
      portClearance: 10,
      bendClearance: 5,
      minMarkerLength: 10,
    });
    assert.equal(marker.type, tc.expectedType, `${tc.name}: expected ${tc.expectedType}, got ${marker.type}`);
  }
});

test('resolveContainmentJunctions canonical owner and order-reversal stability', () => {
  const connA = { id: 'connA', from: 'nodeSource', kind: 'containment' };
  const connB = { id: 'connB', from: 'nodeSource', kind: 'containment' };
  const pts = [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 100, y: 0 }
  ];
  const ptsFork = [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 50 }
  ];
  const connectionPoints = new Map([
    ['connA', pts],
    ['connB', ptsFork]
  ]);

  const junctions = resolveContainmentJunctions([connA, connB], connectionPoints);
  assert.equal(junctions.length, 1);
  assert.equal(junctions[0].ownerId, 'connA');
  assert.deepEqual(junctions[0].connectionIds, ['connA', 'connB']);

  // Order-reversal check
  const junctionsRev = resolveContainmentJunctions([connB, connA], connectionPoints);
  assert.equal(junctionsRev.length, 1);
  assert.equal(junctionsRev[0].ownerId, 'connA');
});

test('resolveContainmentJunctions handles unequal segmentation shared trunk', () => {
  const connA = { id: 'connA', from: 'nodeSource', kind: 'containment' };
  const connB = { id: 'connB', from: 'nodeSource', kind: 'containment' };

  const ptsA = [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 100, y: 0 }
  ];
  const ptsB = [
    { x: 0, y: 0 },
    { x: 25, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 50 }
  ];

  const connectionPoints = new Map([
    ['connA', ptsA],
    ['connB', ptsB]
  ]);

  const junctions = resolveContainmentJunctions([connA, connB], connectionPoints);
  assert.equal(junctions.length, 1);
  assert.equal(junctions[0].type, 'junction');
  assert.equal(junctions[0].x, 50);
  assert.equal(junctions[0].y, 0);
});

test('resolveContainmentJunctions comprehensive coverage (siblings, outputs, identical, missing, frozen)', () => {
  const connA = Object.freeze({ id: 'connA', from: 'nodeSource', out: 'outPort', kind: 'containment' });
  const connB = Object.freeze({ id: 'connB', from: 'nodeSource', out: 'outPort', kind: 'containment' });
  const connC = Object.freeze({ id: 'connC', from: 'nodeSource', out: 'outPort', kind: 'containment' });

  const ptsA = Object.freeze([
    Object.freeze({ x: 0, y: 0 }),
    Object.freeze({ x: 50, y: 0 }),
    Object.freeze({ x: 100, y: 0 })
  ]);
  const ptsB = Object.freeze([
    Object.freeze({ x: 0, y: 0 }),
    Object.freeze({ x: 50, y: 0 }),
    Object.freeze({ x: 50, y: 50 })
  ]);
  const ptsC = Object.freeze([
    Object.freeze({ x: 0, y: 0 }),
    Object.freeze({ x: 50, y: 0 }),
    Object.freeze({ x: 0, y: 50 })
  ]);

  const connectionPointsMap = new Map([
    ['connA', ptsA],
    ['connB', ptsB],
    ['connC', ptsC]
  ]);

  const junctions = resolveContainmentJunctions([connA, connB, connC], connectionPointsMap);
  assert.equal(junctions.length, 1);
  assert.deepEqual(junctions[0].connectionIds, ['connA', 'connB', 'connC']);
  assert.equal(junctions[0].ownerId, 'connA');

  const connectionPointsObj = {
    connA: ptsA,
    connB: ptsB,
    connC: ptsC
  };
  const junctionsObj = resolveContainmentJunctions([connA, connB, connC], connectionPointsObj);
  assert.equal(junctionsObj.length, 1);
  assert.deepEqual(junctionsObj[0].connectionIds, ['connA', 'connB', 'connC']);

  const connDiffPort = { id: 'connB', from: 'nodeSource', out: 'anotherPort', kind: 'containment' };
  const junctionsDiff = resolveContainmentJunctions([connA, connDiffPort], connectionPointsMap);
  assert.equal(junctionsDiff.length, 0);

  const junctionsMissing = resolveContainmentJunctions([connA, connB], new Map([['connA', ptsA]]));
  assert.equal(junctionsMissing.length, 0);

  const junctionsIdentical = resolveContainmentJunctions([connA, connB], new Map([
    ['connA', ptsA],
    ['connB', ptsA]
  ]));
  assert.equal(junctionsIdentical.length, 0);
});

test('resolveContainmentJunctions assigns unique stable keys to nested branches', () => {
  const connections = ['a', 'b', 'c'].map((id) => ({
    id,
    from: 'source',
    out: 'out',
    kind: 'containment',
  }));
  const points = new Map([
    ['a', [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }]],
    ['b', [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }]],
    ['c', [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: -50 }]],
  ]);

  const forward = resolveContainmentJunctions(connections, points);
  const reverse = resolveContainmentJunctions([...connections].reverse(), points);

  assert.equal(forward.length, 2);
  assert.equal(new Set(forward.map((junction) => junction.key)).size, 2);
  assert.deepEqual(forward, reverse);
  assert.deepEqual(forward.map(({ x, y }) => ({ x, y })), [
    { x: 20, y: 0 },
    { x: 50, y: 0 },
  ]);
});

function createMockCanvasContext() {
  const calls = [];
  return {
    calls,
    save() { calls.push({ name: 'save' }); },
    restore() { calls.push({ name: 'restore' }); },
    translate(x, y) { calls.push({ name: 'translate', args: [x, y] }); },
    rotate(angle) { calls.push({ name: 'rotate', args: [angle] }); },
    fillRect(x, y, w, h) { calls.push({ name: 'fillRect', args: [x, y, w, h] }); },
    beginPath() { calls.push({ name: 'beginPath' }); },
    closePath() { calls.push({ name: 'closePath' }); },
    moveTo(x, y) { calls.push({ name: 'moveTo', args: [x, y] }); },
    lineTo(x, y) { calls.push({ name: 'lineTo', args: [x, y] }); },
    arc(x, y, r, sa, ea) { calls.push({ name: 'arc', args: [x, y, r, sa, ea] }); },
    fill() { calls.push({ name: 'fill' }); },
    set fillStyle(val) { calls.push({ name: 'fillStyle', val }); },
    get fillStyle() { return '#fff'; },
    set strokeStyle(val) { calls.push({ name: 'strokeStyle', val }); },
    get strokeStyle() { return '#fff'; },
  };
}

test('CONNECTION_MARKER_METRICS and renderer-neutral projection parity (Canvas and SVG)', () => {
  assert.equal(Object.isFrozen(CONNECTION_MARKER_METRICS), true);
  assert.deepEqual(CONNECTION_MARKER_METRICS, {
    portClearance: 24,
    bendClearance: 16,
    labelClearance: 30,
    minMarkerLength: 15,
    minTrunk: 10,
    minTail: 10,
    flowWidth: 28.8,
    flowHeight: 16,
    flowArrowTailX: -7.2,
    flowArrowTipX: 6,
    flowArrowHalfHeight: 5,
    flowBidirectionalTipX: 10.8,
    flowBidirectionalBaseX: 2.4,
    flowBidirectionalHalfHeight: 4,
    junctionRadius: 14,
    junctionInnerRadius: 6,
    gateSize: 32,
    protectedRouteHalfWidth: 1.5,
  });
  assert.deepEqual(projectConnectionMarkerGeometry({ type: 'flow', direction: 'forward' }), [
    { type: 'rect', x: -14.4, y: -8, width: 28.8, height: 16, fill: 'trace' },
    { type: 'polygon', points: [[-7.2, -5], [6, 0], [-7.2, 5]], fill: 'background' },
  ]);
  assert.deepEqual(projectConnectionMarkerGeometry({ type: 'flow', direction: 'both' }), [
    { type: 'rect', x: -14.4, y: -8, width: 28.8, height: 16, fill: 'trace' },
    { type: 'polygon', points: [[-10.8, 0], [-2.4, -4], [-2.4, 4]], fill: 'background' },
    { type: 'polygon', points: [[10.8, 0], [2.4, -4], [2.4, 4]], fill: 'background' },
  ]);
  assert.deepEqual(projectConnectionMarkerGeometry({ type: 'junction' }), [
    { type: 'circle', x: 0, y: 0, radius: 14, fill: 'trace' },
    { type: 'circle', x: 0, y: 0, radius: 6, fill: 'background' },
  ]);
  assert.deepEqual(projectConnectionMarkerGeometry({ type: 'gate' }), [
    { type: 'rect', x: -16, y: -16, width: 32, height: 32, fill: 'trace' },
  ]);
  const cases = [
    { type: 'flow', direction: 'forward', x: 10, y: 20, angle: Math.PI / 4 },
    { type: 'flow', direction: 'both', x: 30, y: 40, angle: 0 },
    { type: 'junction', x: 50, y: 60, angle: 0 },
    { type: 'gate', x: 70, y: 80, angle: 0 },
  ];

  for (const marker of cases) {
    const primitives = projectConnectionMarkerGeometry(marker);
    const canvas = createMockCanvasContext();
    drawCanvasMarker(canvas, marker, '#123456', '#abcdef');

    assert.deepEqual(canvas.calls.find((call) => call.name === 'translate').args, [marker.x, marker.y]);
    assert.equal(canvas.calls.filter((call) => call.name === 'fillRect').length,
      primitives.filter((primitive) => primitive.type === 'rect').length);
    assert.equal(canvas.calls.filter((call) => call.name === 'arc').length,
      primitives.filter((primitive) => primitive.type === 'circle').length);
    assert.equal(canvas.calls.filter((call) => call.name === 'moveTo').length,
      primitives.filter((primitive) => primitive.type === 'polygon').length);
    assert.deepEqual(
      canvas.calls.filter((call) => call.name === 'fillStyle').map((call) => call.val),
      primitives.map((primitive) => primitive.fill === 'background' ? '#abcdef' : '#123456'),
    );

    const { document } = parseHTML('<!doctype html><html><body></body></html>');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    updateSvgMarker('test-conn', marker, svg, '#123456');
    const markerEl = svg.querySelector('[data-conn-marker="test-conn"]');

    assert.equal(markerEl.getAttribute('data-type'), marker.type);
    assert.equal(markerEl.style.getPropertyValue('--sn-conn-marker-color'), '#123456');
    assert.equal(markerEl.children.length, primitives.length);
    primitives.forEach((primitive, index) => {
      const element = markerEl.children[index];
      assert.equal(element.localName, primitive.type);
      assert.equal(
        element.getAttribute('fill'),
        primitive.fill === 'background'
          ? 'var(--sn-canvas-graph-bg, var(--sn-sys-surface))'
          : 'currentColor',
      );
      if (primitive.type === 'rect') {
        assert.equal(Number(element.getAttribute('x')), primitive.x);
        assert.equal(Number(element.getAttribute('y')), primitive.y);
        assert.equal(Number(element.getAttribute('width')), primitive.width);
        assert.equal(Number(element.getAttribute('height')), primitive.height);
      } else if (primitive.type === 'circle') {
        assert.equal(Number(element.getAttribute('r')), primitive.radius);
      } else {
        assert.equal(element.getAttribute('points'),
          primitive.points.map((point) => point.join(',')).join(' '));
      }
    });
  }
});

test('updateSvgMarker inherits late-rendered connection state', () => {
  const { document } = parseHTML('<!doctype html><html><body></body></html>');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('data-conn-id', 'active-conn');
  path.setAttribute('data-active-conn', '');
  svg.append(path);

  const marker = {
    type: 'flow',
    direction: 'forward',
    x: 0,
    y: 0,
    angle: 0,
  };
  updateSvgMarker('active-conn', marker, svg, '#999999');

  const markerElement = svg.querySelector('[data-conn-marker="active-conn"]');
  assert.equal(markerElement.hasAttribute('data-active-conn'), true);
  assert.equal(markerElement.hasAttribute('data-dimmed'), false);

  path.removeAttribute('data-active-conn');
  path.setAttribute('data-dimmed', '');
  updateSvgMarker('active-conn', marker, svg, '#999999');
  assert.equal(markerElement.hasAttribute('data-active-conn'), false);
  assert.equal(markerElement.hasAttribute('data-dimmed'), true);
});

test('resolveConnectionMarker requires enough room for the rendered marker footprint', () => {
  const conn = {
    direction: 'forward',
    kind: 'uses',
    design: { marker: { role: 'flow' } },
  };

  const requiredFlowRoute = CONNECTION_MARKER_METRICS.portClearance * 2
    + CONNECTION_MARKER_METRICS.flowWidth;
  assert.equal(resolveConnectionMarker([
    { x: 0, y: 0 },
    { x: requiredFlowRoute - 0.1, y: 0 },
  ], conn, { minMarkerLength: 1 }).type, 'none');

  assert.equal(resolveConnectionMarker([
    { x: 0, y: 0 },
    { x: requiredFlowRoute, y: 0 },
  ], conn, { minMarkerLength: 1 }).type, 'flow');

  const gateConn = {
    direction: 'forward',
    kind: 'uses',
    design: { marker: { role: 'gate' } },
  };
  assert.equal(resolveConnectionMarker([
    { x: 0, y: 0 },
    { x: 79, y: 0 },
  ], gateConn, { minMarkerLength: 1 }).type, 'none');
  assert.equal(resolveConnectionMarker([
    { x: 0, y: 0 },
    { x: 80, y: 0 },
  ], gateConn, { minMarkerLength: 1 }).type, 'gate');
});

test('resolveContainmentJunctions requires trunk and tails to contain the junction radius', () => {
  const connections = [
    { id: 'short-a', from: 'source', kind: 'containment' },
    { id: 'short-b', from: 'source', kind: 'containment' },
  ];
  const routes = new Map([
    ['short-a', [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 40 }]],
    ['short-b', [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: -40 }]],
  ]);

  assert.deepEqual(resolveContainmentJunctions(connections, routes, {
    minTrunk: 1,
    minTail: 1,
  }), []);
});

test('LOD: normal/low zoom suppression in Canvas rendering', () => {
  assert.equal(shouldRenderConnectionDetail(0.4, false), false);
  assert.equal(shouldRenderConnectionDetail(0.4, true), true);
  assert.equal(shouldRenderConnectionDetail(0.6, false), true);
});

test('Canvas semantic cache invalidation (cold vs warm redraw)', () => {
  const cached = {
    pathStyle: 'pcb',
    kind: 'containment',
    direction: 'forward',
    role: 'flow'
  };

  const connSame = {
    kind: 'containment',
    direction: 'forward',
    design: { marker: { role: 'flow' } }
  };
  assert.equal(isCanvasConnectionPathCacheValid(cached, connSame, 'pcb'), true);

  const connNewRole = {
    kind: 'containment',
    direction: 'forward',
    design: { marker: { role: 'gate' } }
  };
  assert.equal(isCanvasConnectionPathCacheValid(cached, connNewRole, 'pcb'), false);

  const connNewDir = {
    kind: 'containment',
    direction: 'both',
    design: { marker: { role: 'flow' } }
  };
  assert.equal(isCanvasConnectionPathCacheValid(cached, connNewDir, 'pcb'), false);
  assert.equal(isCanvasConnectionPathCacheValid(cached, connSame, 'pcb-drag-proxy'), false);
});

test('connection render batches reconcile derived junctions once', () => {
  const order = [];
  const count = renderConnectionBatch(
    ['a', 'b', 'c'],
    (id) => order.push(`render:${id}`),
    () => order.push('reconcile'),
  );

  assert.equal(count, 3);
  assert.deepEqual(order, ['render:a', 'render:b', 'render:c', 'reconcile']);
});

test('graph normalization rejects authored junction markers', () => {
  const edge = normalizeGraphEdge({
    id: 'edge-1',
    kind: 'containment',
    direction: 'forward',
    design: { marker: { role: 'junction' } },
    source: { nodeId: 'a', port: 'out' },
    target: { nodeId: 'b', port: 'in' },
  });

  assert.equal(edge.design.marker.role, 'none');
});

test('provider schemas expose only authored edge-marker roles', () => {
  const v1Roles = getGraphSchema('v1').$defs.connection
    .properties.design.properties.marker.properties.role.enum;
  const modelRoles = getGraphSchema('graph-model-v1').$defs.edge
    .properties.design.properties.marker.properties.role.enum;

  assert.deepEqual(v1Roles, ['none', 'flow', 'gate']);
  assert.deepEqual(modelRoles, ['none', 'flow', 'gate']);
});

test('SVG derived junctions reconciliation lifecycle (route update & owner removal)', () => {
  const { document } = parseHTML('<!doctype html><html><body></body></html>');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const connections = ['a', 'b', 'c'].map((id) => ({
    id,
    from: 'source',
    out: 'out',
    kind: 'containment',
  }));
  const points = new Map([
    ['a', [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }]],
    ['b', [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }]],
    ['c', [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: -50 }]],
  ]);
  for (const id of ['a', 'b', 'c']) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('data-conn-id', id);
    svg.append(path);
  }
  svg.querySelector('[data-conn-id="b"]').setAttribute('data-selected', '');
  svg.querySelector('[data-conn-id="c"]').setAttribute('data-active-conn', '');

  const editor = {
    getNode: () => ({ outputs: { out: { socket: { color: '#123456' } } } }),
  };
  const initial = reconcileSvgJunctionMarkers(svg, connections, points, editor);
  const initialElements = svg.querySelectorAll('g[data-conn-marker^="junction::"]');
  assert.equal(initial.length, 2);
  assert.equal(initialElements.length, 2);
  assert.equal(initialElements[0].style.getPropertyValue('--sn-conn-marker-color'), '#123456');
  assert.equal(Array.from(initialElements).some((element) => element.hasAttribute('data-selected')), true);
  assert.equal(Array.from(initialElements).some((element) => element.hasAttribute('data-active-conn')), true);

  const previousKeys = new Set(initial.map((junction) => junction.key));
  const survivingConnections = connections.slice(1);
  points.delete('a');
  const surviving = reconcileSvgJunctionMarkers(svg, survivingConnections, points, editor);
  const survivingElement = svg.querySelector('g[data-conn-marker^="junction::"]');
  assert.equal(surviving.length, 1);
  assert.equal(previousKeys.has(surviving[0].key), false);
  assert.equal(survivingElement.hasAttribute('data-selected'), true);
  assert.equal(survivingElement.hasAttribute('data-active-conn'), true);

  svg.querySelector('[data-conn-id="c"]').removeAttribute('data-active-conn');
  svg.querySelector('[data-conn-id="b"]').setAttribute('data-dimmed', '');
  reconcileSvgJunctionMarkers(svg, survivingConnections, points, editor);
  assert.equal(svg.querySelector('g[data-conn-marker^="junction::"]').hasAttribute('data-dimmed'), true);

  reconcileSvgJunctionMarkers(svg, [connections[2]], points, editor);
  assert.equal(svg.querySelectorAll('g[data-conn-marker^="junction::"]').length, 0);
});

function createNestedJunctionFixture(branchGap) {
  let connections = [
    { id: 'connA', from: 'nodeA', out: 'out', kind: 'containment' },
    { id: 'connB', from: 'nodeA', out: 'out', kind: 'containment' },
    { id: 'connC', from: 'nodeA', out: 'out', kind: 'containment' },
  ];
  let secondBranchX = 20 + branchGap;
  let points = new Map([
    ['connA', [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: secondBranchX, y: 0 }, { x: 100, y: 0 }]],
    ['connB', [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: secondBranchX, y: 0 }, { x: 100, y: 50 }]],
    ['connC', [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: -50 }]],
  ]);
  return { connections, points };
}

test('resolveContainmentJunctions coalesces intersecting nested branches', () => {
  let { connections, points } = createNestedJunctionFixture(5);
  let junctions = resolveContainmentJunctions(connections, points);

  assert.equal(junctions.length, 1);
  assert.equal(junctions[0].x, 20);
  assert.equal(junctions[0].y, 0);
  assert.deepEqual(junctions[0].connectionIds, ['connA', 'connB', 'connC']);
  assert.equal(junctions[0].ownerId, 'connA');
});

test('resolveContainmentJunctions preserves tangential nested branches', () => {
  let { connections, points } = createNestedJunctionFixture(
    CONNECTION_MARKER_METRICS.junctionRadius * 2,
  );
  let junctions = resolveContainmentJunctions(connections, points);

  assert.deepEqual(junctions.map(junction => junction.x), [20, 48]);
});

test('resolveContainmentJunctions coalescing is stable across input order', () => {
  let { connections, points } = createNestedJunctionFixture(5);
  let forward = resolveContainmentJunctions(connections, points);
  let reversed = resolveContainmentJunctions([...connections].reverse(), points);

  assert.deepEqual(reversed, forward);
});

test('resolveContainmentJunctions preserves intersecting non-nested branches', () => {
  let connections = [
    { id: 'connA', from: 'nodeA', out: 'out', kind: 'containment' },
    { id: 'connB', from: 'nodeA', out: 'out', kind: 'containment' },
    { id: 'connC', from: 'nodeA', out: 'out', kind: 'containment' },
    { id: 'connD', from: 'nodeA', out: 'out', kind: 'containment' },
  ];
  let points = new Map([
    ['connA', [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 70, y: 0 }]],
    ['connB', [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 50 }]],
    ['connC', [{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 25, y: 20 }, { x: 75, y: 20 }]],
    ['connD', [{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 25, y: 20 }, { x: 25, y: 70 }]],
  ]);
  let junctions = resolveContainmentJunctions(connections, points);

  assert.equal(junctions.length, 2);
  assert.deepEqual(junctions.map(junction => junction.connectionIds), [
    ['connA', 'connB'],
    ['connC', 'connD'],
  ]);
  assert.ok(Math.hypot(
    junctions[0].x - junctions[1].x,
    junctions[0].y - junctions[1].y,
  ) < CONNECTION_MARKER_METRICS.junctionRadius * 2);
});

test('resolveContainmentJunctions keeps coincident source-port groups isolated', () => {
  let connections = [
    { id: 'a1', from: 'nodeA', out: 'outA', kind: 'containment' },
    { id: 'a2', from: 'nodeA', out: 'outA', kind: 'containment' },
    { id: 'b1', from: 'nodeA', out: 'outB', kind: 'containment' },
    { id: 'b2', from: 'nodeA', out: 'outB', kind: 'containment' },
  ];
  let points = new Map([
    ['a1', [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 70, y: 0 }]],
    ['a2', [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 50 }]],
    ['b1', [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 70, y: 0 }]],
    ['b2', [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: -50 }]],
  ]);
  let junctions = resolveContainmentJunctions(connections, points);

  assert.equal(junctions.length, 2);
  assert.deepEqual(junctions.map(junction => junction.connectionIds), [
    ['a1', 'a2'],
    ['b1', 'b2'],
  ]);
  assert.deepEqual(junctions.map(junction => [junction.x, junction.y]), [[20, 0], [20, 0]]);
});

test('isConnectionMarkerOccluded - flow at 8 units hidden / 9 visible using the scaled footprint', () => {
  const marker = {
    type: 'flow',
    x: 0,
    y: 0,
    angle: 0,
  };
  const ownerIds = ['owner-route'];
  const markerPriority = 0;

  const protectedRoutesHidden = [{
    id: 'other-route',
    points: [{ x: -50, y: 8 }, { x: 50, y: 8 }],
    priority: 1,
    halfWidth: 0.5,
  }];
  assert.equal(isConnectionMarkerOccluded(marker, ownerIds, markerPriority, protectedRoutesHidden), true);

  const protectedRoutesVisible = [{
    id: 'other-route',
    points: [{ x: -50, y: 9 }, { x: 50, y: 9 }],
    priority: 1,
    halfWidth: 0.5,
  }];
  assert.equal(isConnectionMarkerOccluded(marker, ownerIds, markerPriority, protectedRoutesVisible), false);
});

test('isConnectionMarkerOccluded - rotated flow', () => {
  const marker = {
    type: 'flow',
    x: 0,
    y: 0,
    angle: Math.PI / 2,
  };
  const ownerIds = ['owner-route'];
  const markerPriority = 0;

  const protectedRoutes = [{
    id: 'other-route',
    points: [{ x: -50, y: 14 }, { x: 50, y: 14 }],
    priority: 1,
    halfWidth: 0.5,
  }];
  assert.equal(isConnectionMarkerOccluded(marker, ownerIds, markerPriority, protectedRoutes), true);
});

test('isConnectionMarkerOccluded - owner exemption', () => {
  const marker = {
    type: 'flow',
    x: 0,
    y: 0,
    angle: 0,
  };
  const ownerIds = ['owner-route'];
  const markerPriority = 0;

  const protectedRoutes = [{
    id: 'owner-route',
    points: [{ x: -50, y: 15 }, { x: 50, y: 15 }],
    priority: 1,
    halfWidth: 0.5,
  }];
  assert.equal(isConnectionMarkerOccluded(marker, ownerIds, markerPriority, protectedRoutes), false);
});

test('isConnectionMarkerOccluded - junction distance 13 hidden / 17 visible', () => {
  const marker = {
    type: 'junction',
    x: 0,
    y: 0,
    angle: 0,
  };
  const ownerIds = ['junction-owner'];
  const markerPriority = 0;

  const protectedRoutesHidden = [{
    id: 'other-route',
    points: [{ x: -50, y: 13 }, { x: 50, y: 13 }],
    priority: 1,
    halfWidth: 1.0,
  }];
  assert.equal(isConnectionMarkerOccluded(marker, ownerIds, markerPriority, protectedRoutesHidden), true);

  const protectedRoutesVisible = [{
    id: 'other-route',
    points: [{ x: -50, y: 17 }, { x: 50, y: 17 }],
    priority: 1,
    halfWidth: 1.0,
  }];
  assert.equal(isConnectionMarkerOccluded(marker, ownerIds, markerPriority, protectedRoutesVisible), false);
});

test('isConnectionMarkerOccluded - equal/higher priority', () => {
  const marker = {
    type: 'flow',
    x: 0,
    y: 0,
    angle: 0,
  };
  const ownerIds = ['owner-route'];

  const points = [{ x: -50, y: 8 }, { x: 50, y: 8 }];

  assert.equal(isConnectionMarkerOccluded(marker, ownerIds, 1, [{
    id: 'other',
    points,
    priority: 1,
    halfWidth: 0.5,
  }]), false);

  assert.equal(isConnectionMarkerOccluded(marker, ownerIds, 1, [{
    id: 'other',
    points,
    priority: 2,
    halfWidth: 0.5,
  }]), true);

  assert.equal(isConnectionMarkerOccluded(marker, ownerIds, 1, [{
    id: 'other',
    points,
    priority: 0,
    halfWidth: 0.5,
  }]), false);
});

test('isConnectionMarkerOccluded - multi-owner junction max state', () => {
  const marker = {
    type: 'junction',
    x: 0,
    y: 0,
    angle: 0,
    connectionIds: ['c1', 'c2'],
  };
  const ownerIds = ['c1', 'c2'];

  const protectedRoutes = [{
    id: 'other',
    points: [{ x: -50, y: 13 }, { x: 50, y: 13 }],
    priority: 1,
    halfWidth: 1.0,
  }];

  assert.equal(isConnectionMarkerOccluded(marker, ownerIds, 0, protectedRoutes), true);

  assert.equal(isConnectionMarkerOccluded(marker, ownerIds, 1, protectedRoutes), false);
});

test('ConnectionRenderer - SVG marker occlusion lifecycle (adding crossing routes and selection updates)', () => {
  const { document } = parseHTML('<!doctype html><html><body></body></html>');
  const oldDocument = globalThis.document;
  globalThis.document = document;

  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    const nodeViews = new Map();
    const createNodeView = (id, x, y) => {
      const el = document.createElement('div');
      el._position = { x, y };
      el.offsetWidth = 10;
      el.offsetHeight = 10;
      el._cachedW = 10;
      el._cachedH = 10;
      nodeViews.set(id, el);
    };
    createNodeView('nodeA', -100, 25);
    createNodeView('nodeB', 150, 25);
    createNodeView('nodeC', 20, -50);
    createNodeView('nodeD', 30, 100);

    const connRenderer = new ConnectionRenderer({
      svgLayer: svg,
      nodeViews,
      editor: {
        getNode: (id) => {
          return {
            shape: 'rectangle',
            outputs: { out: { socket: { color: '#010203', name: 'data' } } },
            inputs: { in: { socket: { color: '#010203', name: 'data' } } },
          };
        }
      },
      onConnectionClick: () => {},
      getZoom: () => 1
    });
    connRenderer.setPathStyle('straight');

    const connDimmed = {
      id: 'trace-color',
      from: 'nodeA',
      out: 'out',
      to: 'nodeB',
      in: 'in',
      direction: 'forward',
      design: { marker: { role: 'flow' } },
    };

    connRenderer.add(connDimmed);
    const traceMarker = svg.querySelector('[data-conn-marker="trace-color"]');
    assert.ok(traceMarker);
    assert.equal(traceMarker.hasAttribute('data-collision-hidden'), false);

    const connActive = {
      id: 'active-color',
      from: 'nodeC',
      out: 'out',
      to: 'nodeD',
      in: 'in',
      direction: 'forward',
      design: { marker: { role: 'flow' } },
    };
    connRenderer.add(connActive);

    const pathDimmed = svg.querySelector('[data-conn-id="trace-color"]');
    const pathActive = svg.querySelector('[data-conn-id="active-color"]');
    pathDimmed.setAttribute('data-dimmed', '');
    pathActive.setAttribute('data-active-conn', '');

    connRenderer.setSelectionState(true, new Set(['active-color']), new Set());

    assert.equal(traceMarker.hasAttribute('data-collision-hidden'), true);

    pathDimmed.removeAttribute('data-dimmed');
    pathDimmed.setAttribute('data-active-conn', '');
    connRenderer.setSelectionState(true, new Set(['active-color', 'trace-color']), new Set());

    assert.equal(traceMarker.hasAttribute('data-collision-hidden'), false);

    connRenderer.remove(connActive);

    assert.equal(traceMarker.hasAttribute('data-collision-hidden'), false);
  } finally {
    globalThis.document = oldDocument;
  }
});
