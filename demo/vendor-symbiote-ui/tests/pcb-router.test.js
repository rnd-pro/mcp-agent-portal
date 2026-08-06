import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { routePcbTrace } from '../canvas/PcbRouter.js';

function assertSegmentFollowsDirection(from, to, dir, minLength = 0) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dir.dx !== 0) {
    assert.ok(Math.abs(dy) < 0.5, `expected horizontal segment, got dy=${dy}`);
    assert.equal(Math.sign(dx), dir.dx);
    assert.ok(Math.abs(dx) + 0.5 >= minLength, `expected segment length >= ${minLength}, got ${Math.abs(dx)}`);
    return;
  }
  assert.ok(Math.abs(dx) < 0.5, `expected vertical segment, got dx=${dx}`);
  assert.equal(Math.sign(dy), dir.dy);
  assert.ok(Math.abs(dy) + 0.5 >= minLength, `expected segment length >= ${minLength}, got ${Math.abs(dy)}`);
}

test('PCB router keeps facing adjacent node sockets as a direct line', () => {
  const routed = routePcbTrace({
    start: { x: 264, y: 416 },
    end: { x: 280, y: 416 },
    fromRect: { id: 'near-source', x: 80, y: 360, w: 184, h: 113 },
    toRect: { id: 'near-target', x: 280, y: 360, w: 184, h: 113 },
    fromAngle: 0,
    toAngle: 180,
    rects: [
      { id: 'near-source', x: 80, y: 360, w: 184, h: 113 },
      { id: 'near-target', x: 280, y: 360, w: 184, h: 113 },
    ],
    connections: [{ id: 'conn-facing', from: 'near-source', to: 'near-target' }],
    conn: { id: 'conn-facing', from: 'near-source', to: 'near-target' },
    grid: 10,
    stub: 28,
    clearance: 28,
    chamfer: 8,
  });

  assert.equal(routed.strategy, 'compact-direct');
  assert.equal(routed.path, 'M 264 416 H 280');
});

test('PCB router rejects direct routes that do not leave endpoints perpendicularly', () => {
  const routed = routePcbTrace({
    start: { x: 262, y: 446 },
    end: { x: 280, y: 422 },
    fromRect: { id: 'near-source', x: 80, y: 360, w: 184, h: 113 },
    toRect: { id: 'near-target', x: 280, y: 360, w: 184, h: 113 },
    fromAngle: 0,
    toAngle: 180,
    rects: [
      { id: 'near-source', x: 80, y: 360, w: 184, h: 113 },
      { id: 'near-target', x: 280, y: 360, w: 184, h: 113 },
    ],
    connections: [{ id: 'conn-near', from: 'near-source', to: 'near-target' }],
    conn: { id: 'conn-near', from: 'near-source', to: 'near-target' },
    grid: 10,
    stub: 28,
    clearance: 28,
    chamfer: 8,
  });

  assert.notEqual(routed.strategy, 'compact-direct');
  assertSegmentFollowsDirection(routed.points[0], routed.points[1], { dx: 1, dy: 0 }, 16);
  assertSegmentFollowsDirection(routed.points.at(-1), routed.points.at(-2), { dx: -1, dy: 0 }, 16);
});

test('PCB router exposes a cheap draft route before full lane routing', () => {
  const base = {
    start: { x: 120, y: 100 },
    end: { x: 620, y: 460 },
    fromRect: { id: 'source', x: 20, y: 60, w: 100, h: 80 },
    toRect: { id: 'target', x: 620, y: 420, w: 100, h: 80 },
    fromAngle: 0,
    toAngle: 180,
    rects: [
      { id: 'source', x: 20, y: 60, w: 100, h: 80 },
      { id: 'obstacle-a', x: 250, y: 150, w: 160, h: 140 },
      { id: 'obstacle-b', x: 420, y: 310, w: 120, h: 120 },
      { id: 'target', x: 620, y: 420, w: 100, h: 80 },
    ],
    connections: [{ id: 'conn-draft', from: 'source', to: 'target' }],
    conn: { id: 'conn-draft', from: 'source', to: 'target' },
    grid: 10,
    stub: 28,
    clearance: 28,
    chamfer: 8,
  };

  const draft = routePcbTrace({ ...base, quality: 'draft' });
  const full = routePcbTrace(base);

  assert.equal(draft.strategy, 'pcb-draft');
  assert.ok(draft.path.startsWith('M 120 100'));
  assert.notEqual(draft.path, full.path);
});

test('PCB router exposes renderPoints including chamfer coordinates', () => {
  const routed = routePcbTrace({
    start: { x: 120, y: 100 },
    end: { x: 300, y: 300 },
    fromRect: { id: 'source', x: 20, y: 60, w: 100, h: 80 },
    toRect: { id: 'target', x: 300, y: 260, w: 100, h: 80 },
    fromAngle: 0,
    toAngle: 180,
    rects: [
      { id: 'source', x: 20, y: 60, w: 100, h: 80 },
      { id: 'target', x: 300, y: 260, w: 100, h: 80 },
    ],
    connections: [{ id: 'conn-chamfer', from: 'source', to: 'target' }],
    conn: { id: 'conn-chamfer', from: 'source', to: 'target' },
    grid: 10,
    stub: 28,
    clearance: 28,
    chamfer: 8,
  });

  assert.ok(Array.isArray(routed.renderPoints));
  // A non-direct route with chamfers should have more renderPoints than raw points (due to chamfer corner generation)
  assert.ok(routed.renderPoints.length > routed.points.length);
  // Ensure every point has x and y
  for (const pt of routed.renderPoints) {
    assert.ok(typeof pt.x === 'number');
    assert.ok(typeof pt.y === 'number');
  }
});

test('PCB router parallel geometry is deterministic under connection-array permutation', () => {
  const base1 = {
    id: 'connA',
    from: 'source',
    to: 'target',
    kind: 'flow',
  };
  const base2 = {
    id: 'connB',
    from: 'source',
    to: 'target',
    kind: 'flow',
  };

  const pcbOpts = {
    start: { x: 120, y: 100 },
    end: { x: 300, y: 300 },
    fromRect: { id: 'source', x: 20, y: 60, w: 100, h: 80 },
    toRect: { id: 'target', x: 300, y: 260, w: 100, h: 80 },
    fromAngle: 0,
    toAngle: 180,
    rects: [
      { id: 'source', x: 20, y: 60, w: 100, h: 80 },
      { id: 'target', x: 300, y: 260, w: 100, h: 80 },
    ],
    grid: 10,
    stub: 28,
    clearance: 28,
    chamfer: 8,
  };

  const routeA_order1 = routePcbTrace({
    ...pcbOpts,
    connections: [base1, base2],
    conn: base1,
  });
  const routeB_order1 = routePcbTrace({
    ...pcbOpts,
    connections: [base1, base2],
    conn: base2,
  });

  const routeA_order2 = routePcbTrace({
    ...pcbOpts,
    connections: [base2, base1],
    conn: base1,
  });
  const routeB_order2 = routePcbTrace({
    ...pcbOpts,
    connections: [base2, base1],
    conn: base2,
  });

  assert.equal(routeA_order1.path, routeA_order2.path, 'route A geometry should be invariant to permutation');
  assert.equal(routeB_order1.path, routeB_order2.path, 'route B geometry should be invariant to permutation');
});
