import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { routePortalBridgePath } from '../layout/CrossLayoutPortalBridge/portal-bridge-routing.js';

test('portal bridge PCB routing keeps compact direct traces for nearby endpoints', () => {
  const path = routePortalBridgePath({
    style: 'pcb',
    start: { x: 100, y: 120 },
    end: { x: 116, y: 120 },
    sourceRect: { left: 80, top: 100, width: 20, height: 40 },
    targetRect: { left: 116, top: 100, width: 20, height: 40 },
    sourceSide: 'right',
    targetSide: 'left',
    grid: 10,
    stub: 28,
    clearance: 28,
    chamfer: 8,
  });

  assert.equal(path, 'M 100 120 H 116');
});

test('portal bridge PCB routing uses shared router around obstacles', () => {
  const path = routePortalBridgePath({
    style: 'pcb',
    start: { x: 100, y: 120 },
    end: { x: 320, y: 120 },
    sourceRect: { left: 80, top: 100, width: 20, height: 40 },
    targetRect: { left: 320, top: 100, width: 20, height: 40 },
    sourceSide: 'right',
    targetSide: 'left',
    grid: 10,
    stub: 28,
    clearance: 28,
    chamfer: 8,
    obstacles: [
      { id: 'middle-obstacle', x: 180, y: 80, w: 60, h: 80 },
    ],
  });

  assert.notEqual(path, 'M 100 120 H 320');
  assert.match(path, /[VL]/);
});

test('portal bridge preserves bezier rendering mode', () => {
  const path = routePortalBridgePath({
    style: 'bezier',
    start: { x: 10, y: 20 },
    end: { x: 110, y: 60 },
    sourceRect: { left: 0, top: 0, width: 20, height: 40 },
    targetRect: { left: 110, top: 40, width: 20, height: 40 },
  });

  assert.match(path, /^M 10 20 C /);
});
