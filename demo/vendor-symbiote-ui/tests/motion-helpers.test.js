import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';
import {
  ScopedAnimationScope,
  animateSpring,
  stagger,
  makeDraggable,
} from '../themes/Motion.js';

function setupDom() {
  const { window } = parseHTML('<!doctype html><html><body><div id="container"><div class="item"></div><div class="item"></div></div></body></html>');
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.DOMMatrix = class DOMMatrix {
    constructor(transform) {
      this.e = 0;
      this.f = 0;
      if (transform && transform.includes('translate')) {
        const parts = transform.match(/-?\d+/g);
        if (parts && parts.length >= 2) {
          this.e = parseFloat(parts[0]);
          this.f = parseFloat(parts[1]);
        }
      }
    }
  };
  globalThis.requestAnimationFrame = (callback) => {
    return setTimeout(() => callback(typeof performance !== 'undefined' ? performance.now() : Date.now()), 16);
  };
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  
  // Mock window.getComputedStyle
  window.getComputedStyle = (element) => {
    return {
      transform: element.style.transform || 'none',
      getPropertyValue: (prop) => element.style.getPropertyValue(prop) || '',
    };
  };
  
  return window;
}

test('ScopedAnimationScope tracks and cancels active animations', () => {
  const window = setupDom();
  const container = window.document.getElementById('container');
  const el = window.document.querySelector('.item');
  
  let animCancelCalled = false;
  // Mock animate on element
  el.animate = (keyframes, options) => {
    return {
      cancel() {
        animCancelCalled = true;
      },
      addEventListener() {}
    };
  };
  
  const scope = new ScopedAnimationScope(container);
  const anim = scope.animate(el, [{ opacity: 0 }, { opacity: 1 }], 300);
  
  assert.ok(scope.activeAnimations.has(anim));
  scope.cancelAll();
  assert.equal(animCancelCalled, true);
  assert.equal(scope.activeAnimations.size, 0);
});

test('animateSpring updates style properties using spring math', async () => {
  setupDom();
  const el = document.createElement('div');
  
  let currentVal = 0;
  const spring = animateSpring(el, {
    key: '--my-prop',
    from: 0,
    to: 100,
    stiffness: 500,
    damping: 15,
    onUpdate: (val) => {
      currentVal = val;
    }
  });
  
  // Let the spring animate
  await new Promise(resolve => setTimeout(resolve, 150));
  spring.cancel();
  
  assert.ok(currentVal > 0);
});

test('stagger triggers animation delays on multiple elements', () => {
  setupDom();
  const items = document.querySelectorAll('.item');
  
  const optionsList = [];
  items.forEach(el => {
    el.animate = (keyframes, opts) => {
      optionsList.push(opts);
      return {};
    };
  });
  
  stagger(items, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], {
    delay: 100,
    duration: 500,
  });
  
  assert.equal(optionsList.length, 2);
  assert.equal(optionsList[0].delay, 0);
  assert.equal(optionsList[1].delay, 100);
});

test('makeDraggable updates translations on pointer movement', () => {
  setupDom();
  const el = document.createElement('div');
  
  let started = false;
  let moved = false;
  let ended = false;
  
  // Custom mock event registration to bypass Linkedom bugs
  const listeners = {};
  el.addEventListener = (type, handler) => {
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push(handler);
  };
  el.removeEventListener = (type, handler) => {
    if (listeners[type]) {
      listeners[type] = listeners[type].filter(h => h !== handler);
    }
  };
  el.dispatchEvent = (event) => {
    const list = listeners[event.type] || [];
    for (const handler of list) {
      handler(event);
    }
    return true;
  };

  const drag = makeDraggable(el, {
    onStart: () => { started = true; },
    onMove: () => { moved = true; },
    onEnd: () => { ended = true; }
  });
  
  // Mock pointer events
  const downEvent = { type: 'pointerdown', clientX: 10, clientY: 20, button: 0, pointerId: 1 };
  const moveEvent = { type: 'pointermove', clientX: 30, clientY: 40, button: 0, pointerId: 1 };
  const upEvent = { type: 'pointerup', clientX: 30, clientY: 40, button: 0, pointerId: 1 };
  
  // Dispatch down
  el.dispatchEvent(downEvent);
  assert.equal(started, true);
  
  // Dispatch move
  el.dispatchEvent(moveEvent);
  assert.equal(moved, true);
  assert.equal(el.style.transform, 'translate(20px, 20px)');
  
  // Dispatch up
  el.dispatchEvent(upEvent);
  assert.equal(ended, true);
  
  drag.destroy();
});
