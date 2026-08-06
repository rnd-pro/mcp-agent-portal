import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

class TestCSSStyleSheet {
  replaceSync(text) {
    this.cssText = text;
  }
}

let testWindow = null;
const activeTimers = new Set();
const activeRafs = new Set();

const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;

function installDom() {
  if (testWindow) {
    testWindow.document.body.innerHTML = '';
    testWindow.document.adoptedStyleSheets = [];
    return;
  }

  const { window } = parseHTML('<!doctype html><html><body></body></html>');
  testWindow = window;

  globalThis.setTimeout = (cb, delay, ...args) => {
    const handle = originalSetTimeout(() => {
      activeTimers.delete(handle);
      cb(...args);
    }, delay);
    activeTimers.add(handle);
    return handle;
  };

  globalThis.clearTimeout = (handle) => {
    activeTimers.delete(handle);
    originalClearTimeout(handle);
  };

  globalThis.setInterval = (cb, delay, ...args) => {
    const handle = originalSetInterval(() => {
      cb(...args);
    }, delay);
    activeTimers.add(handle);
    return handle;
  };

  globalThis.clearInterval = (handle) => {
    activeTimers.delete(handle);
    originalClearInterval(handle);
  };

  globalThis.requestAnimationFrame = (callback) => {
    const handle = globalThis.setTimeout(() => {
      activeRafs.delete(handle);
      callback(Date.now());
    }, 0);
    activeRafs.add(handle);
    return handle;
  };

  globalThis.cancelAnimationFrame = (id) => {
    activeRafs.delete(id);
    globalThis.clearTimeout(id);
  };

  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    customElements: window.customElements,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    MutationObserver: window.MutationObserver,
    CSSStyleSheet: TestCSSStyleSheet,
    localStorage: {
      getItem: () => null,
      setItem: () => {},
    },
    getComputedStyle: window.getComputedStyle || (() => ({ transitionDuration: '0s', animationDuration: '0s' })),
  });
  window.document.adoptedStyleSheets = [];
}

function teardownDom() {
  if (testWindow) {
    testWindow.document.body.innerHTML = '';
  }
  for (const t of activeTimers) {
    originalClearTimeout(t);
  }
  activeTimers.clear();
  for (const r of activeRafs) {
    originalClearTimeout(r);
  }
  activeRafs.clear();
}

async function nextTick() {
  await Promise.resolve();
  await new Promise((resolve) => originalSetTimeout(resolve, 0));
}

test('node-canvas narrow entrypoint exports and registers correctly', async () => {
  installDom();
  try {
    const module = await import('symbiote-ui/canvas/node-canvas');
    assert.ok(module.NodeCanvas);
    const registered = customElements.get('node-canvas');
    assert.ok(registered);
  } finally {
    teardownDom();
  }
});

test('node-canvas narrow entrypoint re-exports Material Symbols host control', async () => {
  installDom();
  try {
    const module = await import('symbiote-ui/canvas/node-canvas');
    assert.equal(typeof module.configureMaterialSymbols, 'function');
    module.configureMaterialSymbols({ autoload: false });

    const GraphNodeComponent = customElements.get('graph-node');
    assert.ok(GraphNodeComponent, 'narrow entrypoint registers graph-node');

    const node = document.createElement('graph-node');
    node._nodeData = {
      id: 'host-1',
      label: 'Host node',
      category: 'default',
      icon: '',
      shape: 'rect',
      type: 'default',
      params: {},
      inputs: {},
      outputs: {},
      controls: {},
    };
    node.setAttribute('node-id', 'host-1');
    node.setAttribute('node-label', 'Host node');
    document.body.append(node);
    await nextTick();

    assert.ok(node instanceof GraphNodeComponent, 'appended graph-node upgraded');
    assert.ok(node.querySelector('.sn-node-header'), 'graph-node rendered its header');
    assert.equal(node.$.nodeLabel, 'Host node');
    assert.equal(
      document.head.querySelector('link[data-sn-material-symbols="managed"]'),
      null,
      'no managed Material Symbols link appended while autoload is disabled',
    );

    node.remove();
    await nextTick();
  } finally {
    const module = await import('symbiote-ui/canvas/node-canvas');
    module.configureMaterialSymbols?.({ autoload: true, hrefBuilder: null });
    teardownDom();
  }
});

test('node-canvas narrow entrypoint registers its internal graph-node dependency', async () => {
  installDom();
  try {
    const module = await import('symbiote-ui/canvas/node-canvas');
    assert.ok(module.NodeCanvas);
    assert.equal(module.default, module.NodeCanvas);

    const GraphNodeComponent = customElements.get('graph-node');
    assert.ok(GraphNodeComponent, 'narrow entrypoint registers graph-node');

    const node = document.createElement('graph-node');
    node._nodeData = {
      id: 'entry-1',
      label: 'Entry node',
      category: 'default',
      icon: '',
      shape: 'rect',
      type: 'default',
      params: {
        image: 'https://cdn.example/entry.png',
        imageAlt: 'Entry cover',
        href: 'https://example.com/entry',
      },
      inputs: {},
      outputs: {},
      controls: {},
    };
    node.setAttribute('node-id', 'entry-1');
    node.setAttribute('node-label', 'Entry node');
    document.body.append(node);
    await nextTick();

    assert.ok(node instanceof GraphNodeComponent, 'appended graph-node upgraded');
    assert.ok(node.querySelector('.sn-node-header'), 'graph-node rendered its header');
    assert.equal(node.$.nodeLabel, 'Entry node');

    const image = node.querySelector('.sn-node-media-img');
    assert.equal(image?.getAttribute('src'), 'https://cdn.example/entry.png');
    const link = node.querySelector('.sn-node-link');
    assert.equal(link?.getAttribute('href'), 'https://example.com/entry');

    node.remove();
    await nextTick();
  } finally {
    teardownDom();
  }
});

test('node-canvas connection installs the system token cascade', async () => {
  installDom();
  try {
    await import('symbiote-ui/canvas/node-canvas');
    const canvas = document.createElement('node-canvas');
    document.body.append(canvas);
    await nextTick();

    const cascadeAdopted = document.adoptedStyleSheets.some(
      (sheet) => typeof sheet.cssText === 'string' && sheet.cssText.includes('--sn-sys-surface-raised'),
    );
    assert.ok(cascadeAdopted, 'connected node-canvas adopts the system cascade so node visuals resolve without the full bundle');

    canvas.remove();
    await nextTick();
  } finally {
    teardownDom();
  }
});

test('node-canvas presentation mode property, attributes, and composition behavior', async () => {
  installDom();
  try {
    const { NodeCanvas } = await import('symbiote-ui/canvas/node-canvas');
    const canvas = document.createElement('node-canvas');
    document.body.append(canvas);
    await nextTick();

    assert.equal(canvas.presentation, false);
    assert.equal(canvas.hasAttribute('presentation'), false);
    assert.equal(typeof canvas.setPresentationMode, 'function');

    const readonlyCalls = [];
    const chromeCalls = [];
    const panelsCalls = [];
    const viewportLockedCalls = [];

    canvas.setReadonly = (val) => { readonlyCalls.push(val); };
    canvas.setChrome = (val) => { chromeCalls.push(val); };
    canvas.setPanels = (val) => { panelsCalls.push(val); };
    canvas.setViewportLocked = (val) => { viewportLockedCalls.push(val); };

    canvas.setPresentationMode(true);
    assert.deepEqual(readonlyCalls, [true]);
    assert.deepEqual(chromeCalls, [false]);
    assert.deepEqual(panelsCalls, [false]);
    assert.deepEqual(viewportLockedCalls, [true]);

    canvas.setPresentationMode(false);
    assert.deepEqual(readonlyCalls, [true, false]);
    assert.deepEqual(chromeCalls, [false, true]);
    assert.deepEqual(panelsCalls, [false, true]);
    assert.deepEqual(viewportLockedCalls, [true, false]);

    canvas.setAttribute('presentation', '');
    assert.equal(canvas.presentation, true);

    canvas.removeAttribute('presentation');
    assert.equal(canvas.presentation, false);

    canvas.remove();
    await nextTick();
  } finally {
    teardownDom();
  }
});

test('node-canvas presentation mode initial render guard, declarative composition and reconnect', async () => {
  installDom();
  try {
    const { NodeCanvas } = await import('symbiote-ui/canvas/node-canvas');
    const canvas1 = document.createElement('node-canvas');
    const readonlyCalls = [];
    const chromeCalls = [];
    const panelsCalls = [];
    const viewportLockedCalls = [];

    canvas1.setReadonly = (val) => { readonlyCalls.push(val); };
    canvas1.setChrome = (val) => { chromeCalls.push(val); };
    canvas1.setPanels = (val) => { panelsCalls.push(val); };
    canvas1.setViewportLocked = (val) => { viewportLockedCalls.push(val); };

    document.body.append(canvas1);
    await nextTick();

    assert.equal(readonlyCalls.length, 0);
    assert.equal(chromeCalls.length, 0);
    assert.equal(panelsCalls.length, 0);
    assert.equal(viewportLockedCalls.length, 0);

    canvas1.remove();
    await nextTick();

    const canvas2 = document.createElement('node-canvas');
    canvas2.setAttribute('presentation', '');

    const readonlyCalls2 = [];
    const chromeCalls2 = [];
    const panelsCalls2 = [];
    const viewportLockedCalls2 = [];

    canvas2.setReadonly = (val) => { readonlyCalls2.push(val); };
    canvas2.setChrome = (val) => { chromeCalls2.push(val); };
    canvas2.setPanels = (val) => { panelsCalls2.push(val); };
    canvas2.setViewportLocked = (val) => { viewportLockedCalls2.push(val); };

    document.body.append(canvas2);
    await nextTick();

    assert.deepEqual(readonlyCalls2, [true]);
    assert.deepEqual(chromeCalls2, [false]);
    assert.deepEqual(panelsCalls2, [false]);
    assert.deepEqual(viewportLockedCalls2, [true]);

    canvas2.remove();
    await nextTick();

    document.body.append(canvas2);
    await nextTick();

    assert.equal(canvas2.presentation, true);
    assert.equal(canvas2.hasAttribute('presentation'), true);
    assert.deepEqual(readonlyCalls2, [true]);
    assert.deepEqual(chromeCalls2, [false]);
    assert.deepEqual(panelsCalls2, [false]);
    assert.deepEqual(viewportLockedCalls2, [true]);

    canvas2.remove();
    await nextTick();
  } finally {
    teardownDom();
  }
});
