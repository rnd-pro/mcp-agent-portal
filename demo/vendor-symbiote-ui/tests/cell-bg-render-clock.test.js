import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';

import { installRenderClock } from '../core/render-clock.js';
import {
  cellBgRenderFrame,
  cellBgRenderHash,
  createCellBgRenderState,
  seekCellBgRenderState,
} from '../effects/CellBg/cell-bg-render-state.js';

const renderOptions = {
  seed: 'proof-seed',
  cols: 18,
  rows: 12,
  stepMs: 75,
  minRadius: 2,
  maxRadius: 4,
  fadeRate: 0.04,
};

function stateAt(timeMs) {
  return seekCellBgRenderState(createCellBgRenderState(renderOptions), timeMs, renderOptions);
}

test('CellBg deterministic state is independent of wall time and presentation cadence', () => {
  let direct = stateAt(5000);
  let sequential = createCellBgRenderState(renderOptions);
  for (let timeMs = 0; timeMs <= 5000; timeMs += 25) {
    sequential = seekCellBgRenderState(sequential, timeMs, renderOptions);
  }
  sequential = seekCellBgRenderState(sequential, 5000, renderOptions);

  assert.equal(direct.stepIndex, Math.floor(5000 / renderOptions.stepMs));
  assert.equal(sequential.stepIndex, direct.stepIndex);
  assert.equal(cellBgRenderHash(sequential), cellBgRenderHash(direct));

  let firstHash = cellBgRenderHash(direct, cellBgRenderFrame(direct));
  let secondHash = cellBgRenderHash(direct, cellBgRenderFrame(direct));
  assert.equal(secondHash, firstHash);
});

test('CellBg deterministic state rewinds and rebuilds dimensions from time zero', () => {
  let advanced = stateAt(9000);
  let rewound = seekCellBgRenderState(advanced, 1200, renderOptions);
  assert.equal(cellBgRenderHash(rewound), cellBgRenderHash(stateAt(1200)));

  let resizedOptions = { ...renderOptions, cols: 10, rows: 24 };
  let resized = seekCellBgRenderState(createCellBgRenderState(resizedOptions), 1200, resizedOptions);
  let resizedAgain = seekCellBgRenderState(createCellBgRenderState(resizedOptions), 1200, resizedOptions);
  assert.equal(cellBgRenderHash(resized), cellBgRenderHash(resizedAgain));
  assert.notEqual(cellBgRenderHash(resized), cellBgRenderHash(rewound));
});

test('CellBg external frame driver is synchronous and restores live scheduling', async () => {
  let { window } = parseHTML('<html><body></body></html>');
  let globalKeys = [
    'window',
    'document',
    'HTMLElement',
    'customElements',
    'CustomEvent',
    'Event',
    'EventTarget',
    'Node',
    'CSSStyleSheet',
    'requestAnimationFrame',
    'cancelAnimationFrame',
  ];
  let descriptors = new Map(globalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (let key of globalKeys.slice(0, -3)) {
    Object.defineProperty(globalThis, key, { configurable: true, value: window[key] || window });
  }
  Object.defineProperty(globalThis, 'CSSStyleSheet', {
    configurable: true,
    value: class CSSStyleSheet { replaceSync() {} },
  });
  let requestedFrames = [];
  let canceledFrames = [];
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback) => {
      requestedFrames.push(callback);
      return requestedFrames.length;
    },
  });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    value: (id) => canceledFrames.push(id),
  });
  let logicalTimeMs = 0;
  let disposeClock = installRenderClock({ now: () => logicalTimeMs });
  try {
    let { CellBg } = await import('../effects/CellBg/CellBg.js');
    let background = Object.create(CellBg.prototype);
    Object.defineProperty(background, '$', {
      configurable: true,
      value: { active: true, autoTrigger: true, pulseDuration: 10000 },
    });
    background._available = true;
    background._toggled = true;
    background.running = true;
    background.isAnimating = true;
    background.currentSpeed = 1;
    background._frameRequest = null;
    background._externalFrameDrive = false;
    background._externalRenderState = null;
    background._externalRenderFrame = null;
    background._externalRestoreState = null;
    background._cellSize = 10;
    background._minRadius = 2;
    background._maxRadius = 4;
    background._stepMs = 75;
    background._fadeRate = 0.04;
    background._bgFill = '#000';
    background.palette = ['#111', '#fff'];
    background.getAttribute = () => null;
    background.dispatchEvent = () => true;
    background._buildPalette = () => {};
    background.canvas = {
      parentElement: { clientWidth: 100, clientHeight: 60 },
      width: 0,
      height: 0,
      _w: 0,
      _h: 0,
    };
    background.ctx = {
      setTransform() {},
      clearRect() {},
      fillRect() {},
      beginPath() {},
      arc() {},
      fill() {},
      set fillStyle(value) {},
    };

    assert.equal(background.setFrameDriver('external'), 'external');
    assert.equal(requestedFrames.length, 0);
    logicalTimeMs = 1000;
    assert.equal(background.presentFrame(), true);
    let first = background.getFramePresentation();
    assert.equal(first.timeMs, 1000);
    assert.equal(first.stepIndex, Math.floor(1000 / 75));
    assert.equal(background.presentFrame(), true);
    assert.equal(background.getFramePresentation().gridHash, first.gridHash);
    background.renderLoop();
    assert.equal(requestedFrames.length, 0);

    background.stop();
    assert.equal(background.setFrameDriver('self'), 'self');
    assert.equal(requestedFrames.length, 0);
    assert.equal(background.running, false);
    let liveGrid = background.grid;
    assert.equal(background.presentFrame(), true);
    assert.equal(background.grid, liveGrid);

    assert.equal(background.setFrameDriver('external'), 'external');
    background.start();
    assert.equal(background.setFrameDriver('self'), 'self');
    assert.equal(requestedFrames.length, 1);
    assert.equal(background.running, true);
    assert.deepEqual(canceledFrames, []);
  } finally {
    disposeClock();
    for (let key of globalKeys) {
      let descriptor = descriptors.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
