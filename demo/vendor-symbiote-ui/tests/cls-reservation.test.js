import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';
import { reserveLayoutFootprint } from '../runtime/cls-reservation.js';
import { createRuntimeUiController, executeAgentIntent } from '../runtime/index.js';

function setupDom() {
  const { window } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.ResizeObserver = class MockResizeObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {}
    disconnect() {}
  };
  return window;
}

test('reserveLayoutFootprint creates placeholder and replacement works', () => {
  setupDom();
  const parent = document.getElementById('app');
  
  const reservation = reserveLayoutFootprint(parent, {
    width: 300,
    height: 150,
    aspectRatio: '2/1',
    skeleton: true,
  });
  
  const placeholder = reservation.element;
  assert.ok(placeholder);
  assert.equal(placeholder.getAttribute('data-placeholder-state'), 'reserved');
  assert.equal(placeholder.style.width, '300px');
  assert.equal(placeholder.style.height, '150px');
  assert.equal(placeholder.style.aspectRatio, '2/1');
  
  // Verify skeleton inner div
  const skeletonEl = placeholder.querySelector('.sym-placeholder-skeleton');
  assert.ok(skeletonEl);
  
  // Perform replacement
  const widget = document.createElement('iframe');
  widget.getBoundingClientRect = () => ({ width: 400, height: 250 });
  
  let completeCalled = false;
  reservation.replace(widget, {
    onComplete: (size) => {
      completeCalled = true;
      assert.equal(size.width, 400);
      assert.equal(size.height, 250);
    }
  });
  
  assert.equal(reservation.state, 'ready');
  assert.equal(placeholder.getAttribute('data-placeholder-state'), 'ready');
  assert.equal(placeholder.firstElementChild, widget);
  assert.equal(placeholder.style.width, '400px');
  assert.equal(placeholder.style.height, '250px');
  assert.equal(completeCalled, true);
  
  // Test destroy
  reservation.destroy();
  assert.equal(reservation.state, 'destroyed');
  assert.equal(document.querySelector('.sym-layout-placeholder'), null);
});

test('reserveLayoutFootprint cleans placeholder when replacement throws', () => {
  setupDom();
  const parent = document.getElementById('app');
  const reservation = reserveLayoutFootprint(parent, {
    width: 200,
    height: 100,
  });
  const widget = document.createElement('bad-widget');
  widget.getBoundingClientRect = () => {
    throw new Error('measurement failed');
  };

  assert.throws(() => reservation.replace(widget), /measurement failed/);
  assert.equal(reservation.state, 'destroyed');
  assert.equal(parent.querySelector('.sym-layout-placeholder'), null);
});

test('reserveLayoutFootprint supports append-only minimal DOM parents', () => {
  const originalWindow = globalThis.window;
  const makeElement = (tagName) => ({
    tagName,
    className: '',
    children: [],
    style: {},
    attributes: new Map(),
    parentNode: null,
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    getAttribute(name) {
      return this.attributes.get(name) || null;
    },
    append(child) {
      child.parentNode = this;
      this.children.push(child);
    },
    remove() {
      if (this.parentNode) {
        this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
        this.parentNode = null;
      }
    },
  });
  const head = makeElement('head');
  const doc = {
    head,
    createElement: makeElement,
    getElementById() {
      return null;
    },
  };
  const parent = makeElement('section');
  globalThis.window = {};

  try {
    const reservation = reserveLayoutFootprint(parent, {
      document: doc,
      width: '10px',
      height: '20px',
    });

    assert.equal(parent.children.length, 1);
    assert.equal(parent.children[0], reservation.element);
    assert.equal(reservation.element.children.length, 1);
    assert.equal(head.children.length, 1);

    reservation.destroy();
    assert.equal(parent.children.length, 0);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('executeAgentIntent integrates CLS reservation on ui:create', async () => {
  setupDom();
  const parent = document.getElementById('app');
  const controller = createRuntimeUiController({ document });

  const node = {
    id: 'my-widget',
    component: 'div',
    layout: {
      width: '350px',
      height: '180px'
    }
  };

  const intent = {
    version: 'agent-intent-v1',
    intentId: 'intent-123',
    operations: [
      {
        type: 'ui',
        params: {
          action: 'create',
          node,
          targetSelector: '#app',
          options: {
            cls: { skeleton: true }
          }
        }
      }
    ]
  };

  // Mock getBoundingClientRect for created elements
  const originalCreateElement = document.createElement;
  document.createElement = function(tagName) {
    const el = originalCreateElement.call(document, tagName);
    if (tagName === 'div') {
      el.getBoundingClientRect = () => ({ width: 350, height: 180 });
    }
    return el;
  };

  try {
    let result = await executeAgentIntent(controller, intent, { document });
    assert.ok(result.success);

    // Verify CLS placeholder structure
    const placeholder = parent.querySelector('.sym-layout-placeholder');
    assert.ok(placeholder);
    assert.equal(placeholder.getAttribute('data-placeholder-state'), 'ready');
    assert.equal(placeholder.style.width, '350px');
    assert.equal(placeholder.style.height, '180px');

    const widgetEl = placeholder.querySelector('div[data-runtime-ui-id="my-widget"]');
    assert.ok(widgetEl);

    // Destroy it and verify placeholder is removed cleanly
    controller.destroy('my-widget');
    assert.equal(parent.querySelector('.sym-layout-placeholder'), null);
  } finally {
    document.createElement = originalCreateElement;
  }
});

test('executeAgentIntent cleans CLS reservation when ui:create fails', async () => {
  setupDom();
  const parent = document.getElementById('app');
  const controller = createRuntimeUiController({ document });
  const originalCreateElement = document.createElement.bind(document);

  document.createElement = (tagName) => {
    if (tagName === 'bad-widget') {
      throw new Error('create failed');
    }
    return originalCreateElement(tagName);
  };

  try {
    await assert.rejects(
      executeAgentIntent(controller, {
        version: 'agent-intent-v1',
        intentId: 'intent-create-failure',
        operations: [{
          type: 'ui',
          params: {
            action: 'create',
            targetSelector: '#app',
            node: {
              id: 'bad-widget',
              component: 'bad-widget',
              layout: { width: '120px', height: '80px' },
            },
            options: { cls: true },
          },
        }],
      }, { document }),
      /create failed/
    );

    assert.equal(parent.querySelectorAll('.sym-layout-placeholder').length, 0);
    assert.equal(controller.instances.has('bad-widget'), false);
  } finally {
    document.createElement = originalCreateElement;
  }
});

test('executeAgentIntent cleans CLS reservation when replacement fails', async () => {
  setupDom();
  const parent = document.getElementById('app');
  const controller = createRuntimeUiController({ document });
  const originalCreateElement = document.createElement.bind(document);

  document.createElement = (tagName) => {
    const el = originalCreateElement(tagName);
    if (tagName === 'explode-widget') {
      el.getBoundingClientRect = () => {
        throw new Error('measure failed');
      };
    }
    return el;
  };

  try {
    await assert.rejects(
      executeAgentIntent(controller, {
        version: 'agent-intent-v1',
        intentId: 'intent-replace-failure',
        operations: [{
          type: 'ui',
          params: {
            action: 'create',
            targetSelector: '#app',
            node: {
              id: 'explode-widget',
              component: 'explode-widget',
              layout: { width: '120px', height: '80px' },
            },
            options: { cls: true },
          },
        }],
      }, { document }),
      /measure failed/
    );

    assert.equal(parent.querySelectorAll('.sym-layout-placeholder').length, 0);
    assert.equal(parent.querySelector('[data-runtime-ui-id="explode-widget"]'), null);
    assert.equal(controller.instances.has('explode-widget'), false);
  } finally {
    document.createElement = originalCreateElement;
  }
});

test('executeAgentIntent rollback removes successful CLS reservation', async () => {
  setupDom();
  const parent = document.getElementById('app');
  const controller = createRuntimeUiController({ document });
  const originalCreateElement = document.createElement.bind(document);

  document.createElement = (tagName) => {
    const el = originalCreateElement(tagName);
    if (tagName === 'rollback-widget') {
      el.getBoundingClientRect = () => ({ width: 240, height: 120 });
    }
    return el;
  };

  try {
    await assert.rejects(
      executeAgentIntent(controller, {
        version: 'agent-intent-v1',
        intentId: 'intent-rollback',
        operations: [
          {
            type: 'ui',
            params: {
              action: 'create',
              targetSelector: '#app',
              node: {
                id: 'rollback-widget',
                component: 'rollback-widget',
                layout: { width: '240px', height: '120px' },
              },
              options: { cls: true },
            },
          },
          {
            type: 'state',
            params: {
              id: 'missing-widget',
              state: { props: { active: true } },
            },
          },
        ],
      }, { document }),
      /state target not found/
    );

    assert.equal(parent.querySelectorAll('.sym-layout-placeholder').length, 0);
    assert.equal(parent.querySelector('[data-runtime-ui-id="rollback-widget"]'), null);
    assert.equal(controller.instances.has('rollback-widget'), false);
  } finally {
    document.createElement = originalCreateElement;
  }
});
