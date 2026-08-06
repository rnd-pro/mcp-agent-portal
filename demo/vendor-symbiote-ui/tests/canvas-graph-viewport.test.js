import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';

test('CanvasGraph exposes clamped absolute viewport projection', async () => {
  let { window } = parseHTML('<html><body></body></html>');
  let globalKeys = ['window', 'document', 'HTMLElement', 'customElements', 'CustomEvent', 'Event', 'EventTarget', 'Node', 'CSSStyleSheet'];
  let descriptors = new Map(globalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (let key of globalKeys.slice(0, -1)) {
    Object.defineProperty(globalThis, key, { configurable: true, value: window[key] || window });
  }
  Object.defineProperty(globalThis, 'CSSStyleSheet', {
    configurable: true,
    value: class CSSStyleSheet { replaceSync() {} },
  });
  try {
    let { CanvasGraph } = await import('../canvas/CanvasGraph/CanvasGraph.js');
    let graph = Object.create(CanvasGraph.prototype);
    let wakeCount = 0;
    graph.canvas = { getBoundingClientRect: () => ({ width: 800, height: 600 }) };
    graph.zoom = 0.5;
    graph.panX = 10;
    graph.panY = 20;
    graph._targetZoom = 0.5;
    graph._targetPanX = null;
    graph._targetPanY = null;
    graph._clampZoom = (zoom) => Math.max(0.25, Math.min(2, zoom));
    graph._wakeLoop = () => { wakeCount += 1; };

    assert.deepEqual(graph.getViewport(), { zoom: 0.5, panX: 10, panY: 20 });
    assert.deepEqual(graph.setViewport({ zoom: 4, panX: 100, panY: 120 }), {
      zoom: 2,
      panX: 100,
      panY: 120,
    });
    assert.equal(graph._targetPanX, null);
    assert.equal(graph._targetPanY, null);
    assert.equal(wakeCount, 1);

    assert.deepEqual(graph.setViewport({ zoom: 1.25, panX: 40, panY: 60, animate: true }), {
      zoom: 2,
      panX: 100,
      panY: 120,
    });
    assert.equal(graph._targetZoom, 1.25);
    assert.equal(graph._targetPanX, 40);
    assert.equal(graph._targetPanY, 60);
    assert.equal(wakeCount, 2);
    assert.throws(() => graph.setViewport({ zoom: Number.NaN, panX: 0, panY: 0 }), /finite zoom/);
  } finally {
    for (let key of globalKeys) {
      let descriptor = descriptors.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('CanvasViewport grid LOD keeps dots legible across deep zoom', async () => {
  const { resolveGridLOD } = await import('../canvas/CanvasViewport.js');

  const zooms = [1, 0.5, 0.49, 0.24, 0.170527, 0.08, 0.0742262, 0.001];
  const expectedScales = {
    '1': 1,
    '0.5': 1,
    '0.49': 2,
    '0.24': 4,
    '0.170527': 4,
    '0.08': 8,
    '0.0742262': 8,
    '0.001': 512,
  };

  for (const zoom of zooms) {
    const scale = resolveGridLOD(zoom);
    const expectedScale = expectedScales[String(zoom)];
    assert.equal(scale, expectedScale, `zoom ${zoom} expected scale ${expectedScale} but got ${scale}`);

    const finalScreenScale = zoom * scale;
    assert.ok(
      finalScreenScale >= 0.5 && finalScreenScale <= 1.0,
      `zoom ${zoom} with scale ${scale} gave screen scale ${finalScreenScale} outside [0.5, 1]`
    );
  }

  for (const invalidZoom of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(resolveGridLOD(invalidZoom), 1);
  }
});
