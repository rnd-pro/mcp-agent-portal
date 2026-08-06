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
  globalThis.getComputedStyle = (element) => ({
    getPropertyValue(prop) {
      return element.style?.getPropertyValue?.(prop) || '';
    },
  });
  globalThis.matchMedia = () => ({ matches: false });
}

async function nextRenderTick() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

installDom();
await import('../themes/CascadeThemeWidget/CascadeThemeWidget.js');
await import('../notifications/NotificationWidget/NotificationWidget.js');

async function mountShell() {
  let theme = document.createElement('cascade-theme-widget');
  let notifications = document.createElement('notification-widget');
  document.body.append(theme, notifications);
  await nextRenderTick();
  return { theme, notifications };
}

// Mirror a real trigger click: pointerdown bubbles up to the document
// coordinator first, then the click toggles the widget open.
function clickTrigger(widget) {
  let trigger = widget.querySelector('.ctw-trigger, .nw-trigger');
  trigger.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
  trigger.dispatchEvent(new Event('click', { bubbles: true, composed: true }));
}

test('opening one widget popover closes the other', async () => {
  let { theme, notifications } = await mountShell();

  clickTrigger(theme);
  await nextRenderTick();
  assert.equal(theme.$.isOpen, true);
  assert.equal(notifications.$.isOpen, false);

  clickTrigger(notifications);
  await nextRenderTick();
  assert.equal(notifications.$.isOpen, true, 'notifications opened');
  assert.equal(theme.$.isOpen, false, 'theme closed when notifications opened');

  clickTrigger(theme);
  await nextRenderTick();
  assert.equal(theme.$.isOpen, true, 'theme reopened');
  assert.equal(notifications.$.isOpen, false, 'notifications closed when theme reopened');

  theme.remove();
  notifications.remove();
});

test('outside pointerdown closes the open popover', async () => {
  let { theme, notifications } = await mountShell();

  clickTrigger(notifications);
  await nextRenderTick();
  assert.equal(notifications.$.isOpen, true);

  let outside = document.createElement('button');
  document.body.append(outside);
  outside.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
  await nextRenderTick();

  assert.equal(notifications.$.isOpen, false, 'outside click closed notifications');
  assert.equal(theme.$.isOpen, false);

  theme.remove();
  notifications.remove();
  outside.remove();
});

test('clicking inside the open popover keeps it open', async () => {
  let { theme, notifications } = await mountShell();

  clickTrigger(theme);
  await nextRenderTick();
  assert.equal(theme.$.isOpen, true);

  let popover = document.querySelector('.ctw-popover');
  popover.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
  await nextRenderTick();

  assert.equal(theme.$.isOpen, true, 'theme stays open on inside pointerdown');

  theme.remove();
  notifications.remove();
});
