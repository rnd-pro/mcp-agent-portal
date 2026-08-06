import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';

class TestCSSStyleSheet {
  replaceSync(text) {
    this.cssText = text;
  }
}

function installDom() {
  let { window } = parseHTML('<!doctype html><html><body></body></html>');
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
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
  });
  window.document.adoptedStyleSheets = [];
  Object.defineProperty(window.HTMLElement.prototype, 'adoptedStyleSheets', {
    configurable: true,
    get() {
      return this.__symbioteSsrSheets || [];
    },
    set(value) {
      this.__symbioteSsrSheets = value;
    },
  });
  Object.defineProperty(window.document.documentElement, 'clientWidth', {
    configurable: true,
    value: 390,
  });
  Object.defineProperty(window.document.documentElement, 'clientHeight', {
    configurable: true,
    value: 720,
  });
  globalThis.getComputedStyle = (element) => ({
    getPropertyValue(prop) {
      return element.style?.getPropertyValue?.(prop) || '';
    },
    fontFamily: 'Arial',
    fontSize: '16px',
    fontStyle: 'normal',
    fontWeight: '400',
    letterSpacing: '0px',
    lineHeight: '20px',
    paddingLeft: '0px',
    paddingRight: '0px',
    borderLeftWidth: '0px',
    borderRightWidth: '0px',
    columnGap: '0px',
    gap: '0px',
    maxInlineSize: '360px',
  });
}

async function nextRenderTick() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function setRect(element, rect) {
  element.getBoundingClientRect = () => ({
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    left: rect.left,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
  });
}

function createToolbarFixture({ panelRect = null, nodeRect = null } = {}) {
  let canvas = document.createElement('node-canvas');
  let node = document.createElement('graph-node');
  let toolbar = document.createElement('quick-toolbar');
  let panel = null;
  setRect(canvas, { left: 0, top: 0, width: 390, height: 720 });
  setRect(node, nodeRect || { left: 120, top: 180, width: 120, height: 80 });
  canvas.append(node, toolbar);
  if (panelRect) {
    panel = document.createElement('div');
    panel.className = 'panel-content';
    setRect(panel, panelRect);
    panel.append(canvas);
    document.body.append(panel);
  } else {
    document.body.append(canvas);
  }
  return { canvas, node, panel, toolbar };
}

function setToolbarSize(toolbar, { width = 180, height = 42 } = {}) {
  let toolbarEl = toolbar.querySelector('.toolbar');
  Object.defineProperty(toolbarEl, 'offsetWidth', {
    configurable: true,
    value: width,
  });
  Object.defineProperty(toolbarEl, 'offsetHeight', {
    configurable: true,
    value: height,
  });
}

installDom();
await import('../toolbar/QuickToolbar/QuickToolbar.js');

test('quick-toolbar hides after pointerdown outside its anchored canvas', async () => {
  let { toolbar, node } = createToolbarFixture();
  await nextRenderTick();

  toolbar.show('node-1', node, { sticky: true });
  await nextRenderTick();

  assert.equal(toolbar.hidden, false);

  let outside = document.createElement('button');
  document.body.append(outside);
  outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));

  assert.equal(toolbar.hidden, true);
});

test('quick-toolbar hides when its anchor leaves the viewport', async () => {
  let { toolbar, node } = createToolbarFixture();
  await nextRenderTick();

  toolbar.show('node-1', node, { sticky: true });
  await nextRenderTick();

  assert.equal(toolbar.hidden, false);

  setRect(node, { left: 440, top: 180, width: 120, height: 80 });
  window.dispatchEvent(new Event('resize'));

  assert.equal(toolbar.hidden, true);
});

test('quick-toolbar stays visible when it fits inside the panel boundary', async () => {
  let { toolbar, node } = createToolbarFixture({
    panelRect: { left: 40, top: 80, width: 300, height: 520 },
    nodeRect: { left: 120, top: 180, width: 120, height: 80 },
  });
  await nextRenderTick();
  setToolbarSize(toolbar);

  toolbar.show('node-1', node, { sticky: true });
  await nextRenderTick();

  assert.equal(toolbar.hidden, false);
  assert.equal(toolbar.style.getPropertyValue('--sn-toolbar-clip-top'), '0px');
  assert.equal(toolbar.style.getPropertyValue('--sn-toolbar-clip-left'), '0px');
});

test('quick-toolbar clips against the panel boundary instead of staying above it', async () => {
  let { toolbar, node } = createToolbarFixture({
    panelRect: { left: 40, top: 150, width: 300, height: 520 },
    nodeRect: { left: 120, top: 180, width: 120, height: 80 },
  });
  await nextRenderTick();
  setToolbarSize(toolbar);

  toolbar.show('node-1', node, { sticky: true });
  await nextRenderTick();

  assert.equal(toolbar.hidden, false);
  assert.equal(toolbar.style.getPropertyValue('--sn-toolbar-clip-top'), '18px');
});

test('quick-toolbar follows its node while clipped by the panel edge', async () => {
  let { toolbar, node } = createToolbarFixture({
    panelRect: { left: 100, top: 80, width: 260, height: 520 },
    nodeRect: { left: 20, top: 180, width: 120, height: 80 },
  });
  await nextRenderTick();
  setToolbarSize(toolbar);

  toolbar.show('node-1', node, { sticky: true });
  await nextRenderTick();

  assert.match(toolbar.style.transform, /translate\(80px,/);
  assert.equal(toolbar.style.getPropertyValue('--sn-toolbar-clip-left'), '110px');
});
