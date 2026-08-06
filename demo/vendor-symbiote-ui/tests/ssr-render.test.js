import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { test } from 'node:test';
import { listComponents } from '../manifest/index.js';

class TestCSSStyleSheet {
  replaceSync(text) {
    this.cssText = text;
  }
}

function installSsrDom() {
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
  return window;
}

async function nextRenderTick() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const fixtures = {
  'code-block': (el) => {
    el.setContent('const value = 1;', 'js');
    return 'value';
  },
  'source-viewer': (el) => {
    el.showFile({ path: 'src/example.js', raw: 'export const answer = 42;', statsText: '1 line' });
    return 'answer';
  },
  'sn-field': (el) => {
    el.textContent = 'Field label';
    return 'Field label';
  },
  'sn-card': (el) => {
    el.textContent = 'Card content';
    return 'Card content';
  },
  'sn-badge': (el) => {
    el.textContent = 'ready';
    return 'ready';
  },
  'sn-metric': (el) => {
    el.innerHTML = '<span slot="label">Latency</span><span slot="value">12ms</span>';
    return '12ms';
  },
  'sn-data-table': (el) => {
    el.setData({
      columns: [{ key: 'name', label: 'Name' }],
      rows: [{ name: 'Runtime UI' }],
    });
    return 'Runtime UI';
  },
  'sn-event-feed': (el) => {
    el.setEvents([{ title: 'Rendered', message: 'SSR smoke' }]);
    return 'Events';
  },
  'sn-banner': (el) => {
    el.textContent = 'Banner text';
    return 'Banner text';
  },
  'sn-empty-state': (el) => {
    el.textContent = 'No host data';
    return 'No host data';
  },
  'sn-checkbox': (el) => {
    el.textContent = 'Enable sync';
    return 'Enable sync';
  },
  'sn-radio': (el) => {
    el.textContent = 'Choose mode';
    return 'Choose mode';
  },
  'sn-switch': (el) => {
    el.textContent = 'Enable notifications';
    return 'Enable notifications';
  },
  'sn-slider': (el) => {
    el.value = '42';
    return '';
  },
  'sn-rating': (el) => {
    el.value = '3';
    return '';
  },
  'sn-segmented-control': (el) => {
    el.innerHTML = '<button value="a">A</button>';
    return 'A';
  },
  'sn-transport': (el) => {
    el.duration = 300;
    el.fps = 30;
    return '0:00 / 0:10';
  },
  'sn-tooltip': (el) => {
    el.content = 'Info';
    el.innerHTML = '<button>Hover</button>';
    return 'Hover';
  },
  'sn-dialog': (el) => {
    el.label = 'Dialog Title';
    const p = document.createElement('p');
    p.textContent = 'Dialog body content';
    el.appendChild(p);
    return 'Dialog body content';
  },
  'sn-select': (el) => {
    el.placeholder = 'Choose option';
    const opt = document.createElement('option');
    opt.value = 'opt1';
    opt.textContent = 'Option 1';
    el.appendChild(opt);
    return 'Option 1';
  },
  'sn-toast': (el) => {
    el.message = 'Notification message';
    return 'message';
  },
  'sn-toast-region': (el) => {
    const toast = document.createElement('sn-toast');
    toast.message = 'Toast';
    el.appendChild(toast);
    return 'message';
  },
  'sn-listbox': (el) => {
    const opt = document.createElement('div');
    opt.setAttribute('role', 'option');
    opt.setAttribute('data-value', 'a');
    opt.textContent = 'A';
    el.appendChild(opt);
    return 'A';
  },
  'sn-popover': (el) => {
    const btn = document.createElement('button');
    btn.setAttribute('slot', 'trigger');
    btn.textContent = 'Trigger';
    el.appendChild(btn);
    const content = document.createElement('div');
    content.textContent = 'Popover Content';
    el.appendChild(content);
    return 'Popover Content';
  },
  'sn-combobox': (el) => {
    el.placeholder = 'Search...';
    const opt = document.createElement('option');
    opt.value = 'a';
    opt.textContent = 'A';
    el.appendChild(opt);
    return 'A';
  },
  'sn-drawer': (el) => {
    el.label = 'Drawer Title';
    const content = document.createElement('div');
    content.textContent = 'Drawer content';
    el.appendChild(content);
    return 'Drawer content';
  },
};

test('jsda-ssr-renderable components render under a linkedom SSR fixture', async () => {
  installSsrDom();
  let components = listComponents().filter((component) => (
    component.contract?.ssr?.mode === 'jsda-ssr-renderable'
  ));
  assert.deepEqual(
    components.map((component) => component.tagName).sort(),
    Object.keys(fixtures).sort()
  );

  for (let component of components) {
    await import(new URL(`../${component.module}`, import.meta.url).href);
    let el = document.createElement(component.tagName);
    document.body.append(el);
    let expectedText = fixtures[component.tagName](el);
    await nextRenderTick();

    assert.match(el.outerHTML, new RegExp(component.tagName));
    assert.match(el.textContent, new RegExp(expectedText));
    assert.equal(el.outerHTML.includes('[object Object]'), false, component.tagName);
    assert.equal(el.outerHTML.includes('undefined'), false, component.tagName);
  }
});
