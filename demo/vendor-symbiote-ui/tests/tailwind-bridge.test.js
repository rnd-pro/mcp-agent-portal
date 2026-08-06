import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';
import {
  hasTailwind,
  applyTailwindBridge,
} from '../themes/TailwindBridge.js';

function setupDom() {
  const { window } = parseHTML('<!doctype html><html><body></body></html>');
  globalThis.window = window;
  globalThis.document = window.document;
  
  // Custom mock for getComputedStyle
  window.getComputedStyle = (element) => {
    return {
      getPropertyValue(prop) {
        return element.style.getPropertyValue(prop) || '';
      }
    };
  };
  return window;
}

test('hasTailwind detects Tailwind v4 root variables', () => {
  setupDom();
  const el = document.createElement('div');
  
  assert.equal(hasTailwind(el), false);
  
  el.style.setProperty('--color-background', '#0f172a');
  assert.equal(hasTailwind(el), true);
});

test('applyTailwindBridge programmatically bridges variables', () => {
  setupDom();
  const el = document.createElement('div');
  
  el.style.setProperty('--color-background', '#0f172a');
  el.style.setProperty('--color-foreground', '#f8fafc');
  el.style.setProperty('--color-surface', '#1e293b');
  el.style.setProperty('--color-panel', '#1e293b');
  el.style.setProperty('--color-accent', '#3b82f6');
  el.style.setProperty('--font-sans', 'sans-serif');
  
  applyTailwindBridge(el);
  
  assert.equal(el.style.getPropertyValue('--sn-sys-surface'), 'var(--color-background)');
  assert.equal(el.style.getPropertyValue('--sn-sys-on-surface'), 'var(--color-foreground)');
  assert.equal(el.style.getPropertyValue('--sn-sys-surface-panel'), 'var(--color-panel)');
  assert.equal(el.style.getPropertyValue('--sn-sys-accent'), 'var(--color-accent)');
  assert.equal(el.style.getPropertyValue('--sn-font'), 'var(--font-sans)');
});

