import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addDirectoryFrames,
  setGraphLayerVisible,
  toggleLayerButtonState,
} from '../../web/panels/dep-graph-frames.js';

test('addDirectoryFrames creates bounded frames for multi-file directories', () => {
  class TestFrame {
    constructor(label, options) {
      this.label = label;
      this.options = options;
    }
  }

  const frames = [];
  const editor = {
    addFrame(frame) {
      frames.push(frame);
    },
  };
  const fileMap = new Map([
    ['src/a.js', 'node-a'],
    ['src/b.js', 'node-b'],
    ['test/a.test.js', 'node-test'],
  ]);
  const dirFiles = new Map([
    ['src/', ['src/a.js', 'src/b.js']],
    ['test/', ['test/a.test.js']],
  ]);
  const positions = {
    'node-a': { x: 10, y: 20 },
    'node-b': { x: 210, y: 120 },
    'node-test': { x: 500, y: 500 },
  };

  addDirectoryFrames({
    editor,
    fileMap,
    dirFiles,
    positions,
    FrameClass: TestFrame,
    colors: ['rgba(1, 2, 3, 0.4)'],
  });

  assert.equal(frames.length, 1);
  assert.equal(frames[0].label, 'src');
  assert.deepEqual(frames[0].options, {
    x: -20,
    y: -10,
    width: 380,
    height: 240,
    color: 'rgba(1, 2, 3, 0.4)',
  });
});

test('setGraphLayerVisible toggles zone frame display', () => {
  const frames = [{ style: {} }, { style: {} }];
  const canvas = {
    querySelectorAll(selector) {
      assert.equal(selector, 'graph-frame');
      return frames;
    },
  };

  setGraphLayerVisible(canvas, 'zones', false);
  assert.deepEqual(frames.map((frame) => frame.style.display), ['none', 'none']);

  setGraphLayerVisible(canvas, 'zones', true);
  assert.deepEqual(frames.map((frame) => frame.style.display), ['', '']);
});

test('setGraphLayerVisible toggles via visibility attribute', () => {
  const attrs = new Set();
  const canvas = {
    setAttribute(name, value) {
      attrs.add(`${name}:${value}`);
    },
    removeAttribute(name) {
      for (const attr of [...attrs]) {
        if (attr.startsWith(`${name}:`)) attrs.delete(attr);
      }
    },
    querySelectorAll() {
      return [];
    },
  };

  setGraphLayerVisible(canvas, 'vias', false);
  assert.equal(attrs.has('data-hide-vias:'), true);

  setGraphLayerVisible(canvas, 'vias', true);
  assert.equal(attrs.has('data-hide-vias:'), false);
});

test('toggleLayerButtonState flips active and hidden attributes', () => {
  const attrs = new Set(['data-active']);
  const button = {
    hasAttribute(name) {
      return attrs.has(name);
    },
    setAttribute(name) {
      attrs.add(name);
    },
    removeAttribute(name) {
      attrs.delete(name);
    },
  };

  assert.equal(toggleLayerButtonState(button), false);
  assert.equal(attrs.has('data-active'), false);
  assert.equal(attrs.has('data-hidden'), true);

  assert.equal(toggleLayerButtonState(button), true);
  assert.equal(attrs.has('data-active'), true);
  assert.equal(attrs.has('data-hidden'), false);
});
