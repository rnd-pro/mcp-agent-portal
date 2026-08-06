import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';

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
  // linkedom does not implement the Popover API; polyfill just enough of it for SSR
  // rendering tests. Real Chromium-latest runtimes use the native implementation —
  // this is test-harness scaffolding, not a production fallback.
  if (!window.HTMLElement.prototype.showPopover) {
    Object.defineProperties(window.HTMLElement.prototype, {
      showPopover: {
        configurable: true,
        value() {
          this.__symbiotePopoverOpen = true;
          this.setAttribute('data-ssr-popover-open', '');
          let event = new window.Event('toggle');
          event.oldState = 'closed';
          event.newState = 'open';
          this.dispatchEvent(event);
        },
      },
      hidePopover: {
        configurable: true,
        value() {
          this.__symbiotePopoverOpen = false;
          this.removeAttribute('data-ssr-popover-open');
          let event = new window.Event('toggle');
          event.oldState = 'open';
          event.newState = 'closed';
          this.dispatchEvent(event);
        },
      },
      togglePopover: {
        configurable: true,
        value(force) {
          let next = force ?? !this.__symbiotePopoverOpen;
          next ? this.showPopover() : this.hidePopover();
        },
      },
    });
  }
  globalThis.getComputedStyle = (element) => {
    return {
      getPropertyValue(prop) {
        return element.style?.getPropertyValue?.(prop) || '';
      }
    };
  };
  return window;
}

async function nextRenderTick() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('sn-button hones standard control states', async () => {
  installSsrDom();
  await import('../control/Button/Button.js');

  const el = document.createElement('sn-button');
  document.body.append(el);
  await nextRenderTick();

  assert.equal(el.getAttribute('role'), 'button');
  assert.equal(el.getAttribute('tabindex'), '0');

  el.loading = true;
  assert.equal(el.hasAttribute('loading'), true);
  assert.equal(el.getAttribute('aria-busy'), 'true');
  assert.equal(el.getAttribute('aria-disabled'), 'true');
  assert.equal(el.getAttribute('tabindex'), '-1');
  let spinner = el.querySelector('.sn-button-spinner');
  if (spinner) assert.equal(spinner.hidden, false, 'Spinner should be visible when loading');

  el.loading = false;
  if (spinner) assert.equal(spinner.hidden, true, 'Spinner should be hidden when not loading');
  el.disabled = true;
  assert.equal(el.hasAttribute('disabled'), true);
  assert.equal(el.getAttribute('aria-disabled'), 'true');
  assert.equal(el.getAttribute('tabindex'), '-1');

  el.pressed = true;
  assert.equal(el.getAttribute('pressed'), 'true');
  assert.equal(el.getAttribute('aria-pressed'), 'true');
  el.setAttribute('pressed', '');
  assert.equal(el.getAttribute('aria-pressed'), 'true');

  el.selected = true;
  assert.equal(el.hasAttribute('selected'), true);

  el.size = 'lg';
  el.block = true;
  assert.equal(el.getAttribute('size'), 'lg');
  assert.equal(el.hasAttribute('block'), true);

  el.remove();
});

test('sn-field links labels, hints, errors, and input state styling', async () => {
  installSsrDom();
  await import('../control/Field/Field.js');

  const el = document.createElement('sn-field');
  el.innerHTML = `
    <label slot="label">Email Address</label>
    <input type="email" placeholder="name@domain.com">
    <div slot="hint">Enter your email</div>
    <div slot="error">Invalid email address</div>
  `;
  document.body.append(el);

  // Trigger mutation observer sync
  await nextRenderTick();


  const input = el.querySelector('input');
  const label = el.querySelector('label');
  const hint = el.querySelector('[slot="hint"]');

  assert.ok(input.id, 'Input should be assigned an auto-generated ID');
  assert.equal(label.getAttribute('for'), input.id, 'Label should point to Input ID');
  assert.ok(input.getAttribute('aria-describedby').includes(hint.id), 'Input should be described by the hint');

  el.required = true;
  el.disabled = true;
  el.readonly = true;
  el.invalid = true;
  el._syncControlState(); // Force immediate sync check

  assert.ok(input.hasAttribute('required'));
  assert.ok(input.hasAttribute('disabled'));
  assert.ok(input.hasAttribute('readonly'));
  assert.equal(input.getAttribute('aria-invalid'), 'true');

  el.remove();
});

test('sn-selection controls preserve native semantics, descriptions, and change intents', async () => {
  installSsrDom();
  await import('../control/SelectionControl/SelectionControl.js');

  const checkbox = document.createElement('sn-checkbox');
  checkbox.innerHTML = `
    Enable sync
    <div slot="hint">Keeps workspace state current</div>
    <div slot="error">Sync is required</div>
  `;
  checkbox.name = 'sync';
  checkbox.value = 'yes';
  checkbox.checked = true;
  checkbox.indeterminate = true;
  checkbox.required = true;
  checkbox.invalid = true;
  document.body.append(checkbox);
  await nextRenderTick();

  const checkboxInput = checkbox.querySelector('input');
  const checkboxHint = checkbox.querySelector('[slot="hint"]');
  const checkboxError = checkbox.querySelector('[slot="error"]');

  assert.equal(checkboxInput.type, 'checkbox');
  assert.equal(checkboxInput.checked, true);
  assert.equal(checkboxInput.indeterminate, true);
  assert.equal(checkboxInput.name, 'sync');
  assert.equal(checkboxInput.value, 'yes');
  assert.ok(checkboxInput.hasAttribute('required'));
  assert.equal(checkboxInput.getAttribute('aria-invalid'), 'true');
  assert.ok(checkboxInput.getAttribute('aria-describedby').includes(checkboxHint.id));
  assert.ok(checkboxInput.getAttribute('aria-describedby').includes(checkboxError.id));

  let controlChange = null;
  let checkboxChange = null;
  checkbox.addEventListener('sn-control-change', (event) => {
    controlChange = event.detail;
  });
  checkbox.addEventListener('sn-checkbox-change', (event) => {
    checkboxChange = event.detail;
  });
  checkboxInput.checked = false;
  checkboxInput.dispatchEvent(new Event('change', { bubbles: true }));

  assert.equal(checkbox.checked, false);
  assert.equal(checkbox.indeterminate, false);
  assert.equal(controlChange.control, 'checkbox');
  assert.equal(controlChange.checked, false);
  assert.equal(controlChange.value, 'yes');
  assert.deepEqual(checkboxChange, controlChange);

  checkbox.checked = true;
  checkbox.readonly = true;
  checkboxInput.checked = false;
  checkboxInput.dispatchEvent(new Event('change', { bubbles: true }));
  assert.equal(checkbox.checked, true, 'readonly checkbox should restore host-owned checked state');
  assert.equal(checkboxInput.checked, true);
  assert.equal(checkboxInput.getAttribute('aria-readonly'), 'true');

  const radio = document.createElement('sn-radio');
  radio.name = 'mode';
  radio.value = 'manual';
  document.body.append(radio);
  await nextRenderTick();

  const radioInput = radio.querySelector('input');
  assert.equal(radioInput.type, 'radio');
  assert.equal(radioInput.name, 'mode');
  assert.equal(radioInput.value, 'manual');

  const sw = document.createElement('sn-switch');
  sw.checked = true;
  document.body.append(sw);
  await nextRenderTick();

  const switchInput = sw.querySelector('input');
  assert.equal(switchInput.type, 'checkbox');
  assert.equal(switchInput.getAttribute('role'), 'switch');
  assert.equal(switchInput.getAttribute('aria-checked'), 'true');

  checkbox.remove();
  radio.remove();
  sw.remove();
});

test('context-menu implements roving focus and APG item styling', async () => {
  installSsrDom();
  await import('../menu/ContextMenu/ContextMenu.js');
  const contextMenuStyles = await readFile(
    new URL('../menu/ContextMenu/ContextMenu.css.js', import.meta.url),
    'utf8'
  );

  const el = document.createElement('context-menu');
  document.body.append(el);
  await nextRenderTick();

  let clickedLabel = null;
  const items = [
    { label: 'Cut', icon: 'content_cut', action: () => { clickedLabel = 'Cut'; } },
    { label: 'Copy', icon: 'content_copy', action: () => {}, detail: 'Ctrl+C' },
    { divider: true },
    { label: 'Format', icon: 'check', checked: true, action: () => {} },
    { label: 'Delete', icon: 'delete', destructive: true, action: () => {} },
    { label: 'Paste', icon: 'content_paste', disabled: true, action: () => {} },
  ];

  el.show(100, 200, items);
  await nextRenderTick();

  assert.equal(el.$.visible, true);
  assert.equal(el.hasAttribute('hidden'), false);

  const renderedItems = el.querySelectorAll('ctx-item');
  assert.equal(renderedItems.length, 6);

  assert.equal(renderedItems[1].$.detail, 'Ctrl+C');
  assert.equal(renderedItems[2].$.divider, true);
  assert.equal(renderedItems[3].$.checked, true);
  assert.equal(renderedItems[4].$.destructive, true);
  assert.equal(renderedItems[5].$.disabled, true);

  const firstCheck = renderedItems[0].querySelector('.sn-ctx-check-mark');
  assert.equal(firstCheck.hasAttribute('hidden'), true);
  assert.match(contextMenuStyles, /\.sn-ctx-check-mark\[hidden\]/);
  assert.match(contextMenuStyles, /display:\s*none\s*!important/);

  el.hide();
  assert.equal(el.$.visible, false);

  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: 320 },
    innerHeight: { configurable: true, value: 240 },
  });
  el.getBoundingClientRect = () => ({ width: 180, height: 120 });
  el.show(310, 230, items);
  await nextRenderTick();
  assert.equal(el.style.left, '132px');
  assert.equal(el.style.top, '112px');
  el.hide();

  el.remove();
});

test('project-tabs coordinates roving tabindex and keys', async () => {
  installSsrDom();
  await import('../layout/ProjectTabs/ProjectTabs.js');

  const el = document.createElement('project-tabs');
  document.body.append(el);
  await nextRenderTick();

  el.setTabs([
    { id: 'tab1', name: 'Main Project', closeable: false },
    { id: 'tab2', name: 'Sidebar Helper', closeable: true },
  ], 'tab1');
  await nextRenderTick();

  const homeTab = el.querySelector('.tab');
  const items = el.querySelectorAll('project-tab-item');

  assert.equal(homeTab.getAttribute('role'), 'tab');
  assert.equal(homeTab.getAttribute('data-tab-id'), 'home');
  assert.equal(items.length, 2);
  assert.equal(items[0].getAttribute('role'), 'tab');
  assert.equal(items[0].getAttribute('data-tab-id'), 'tab1');
  assert.equal(items[0].getAttribute('aria-selected'), 'true');
  assert.equal(items[0].getAttribute('tabindex'), '0');
  assert.equal(items[1].getAttribute('data-tab-id'), 'tab2');
  assert.equal(items[1].getAttribute('aria-selected'), 'false');
  assert.equal(items[1].getAttribute('tabindex'), '-1');

  el.remove();
});

test('sn-list-item enforces selection events and loading states', async () => {
  installSsrDom();
  const styles = await readFile(new URL('../list/ListItem/ListItem.css.js', import.meta.url), 'utf8');
  const template = await readFile(new URL('../list/ListItem/ListItem.tpl.js', import.meta.url), 'utf8');
  await import('../list/ListItem/ListItem.js');

  const el = document.createElement('sn-list-item');
  document.body.append(el);
  await nextRenderTick();

  let selectTriggered = false;
  el.addEventListener('sn-list-item-select', () => {
    selectTriggered = true;
  });

  el.setItem({ label: 'Item Title', description: 'Item description text', active: true });
  await nextRenderTick();

  assert.equal(el.getAttribute('active'), '');

  const innerItem = el.ref.item;
  assert.equal(innerItem.getAttribute('aria-selected'), 'true');
  const spinner = el.querySelector('.sn-list-item-spinner');
  const prefix = el.querySelector('.sn-list-item-prefix');
  const suffix = el.querySelector('.sn-list-item-suffix');
  const meta = el.querySelector('.sn-list-item-meta');
  assert.ok(prefix);
  assert.ok(suffix);
  assert.ok(meta);
  assert.match(styles, /\.sn-list-item-spinner\[hidden\]\s*\{[\s\S]*?display: none !important;/);
  assert.doesNotMatch(styles, /slot\[name=|::slotted/);
  assert.match(styles, /\.sn-list-item-prefix,[\s\S]*?\.sn-list-item-suffix\s*\{[\s\S]*?min-inline-size: 0;/);
  assert.match(styles, /\.sn-list-item-suffix\s*\{[\s\S]*?flex: 0 0 auto;[\s\S]*?max-inline-size: var\(--sn-list-item-meta-max-width, 38%\);[\s\S]*?overflow: hidden;/);
  assert.match(styles, /\.sn-list-item-meta\s*\{[\s\S]*?min-inline-size: 0;[\s\S]*?max-inline-size: 100%;/);
  assert.match(template, /class="sn-list-item-prefix"[\s\S]*?<slot name="prefix">/);
  assert.match(template, /class="sn-list-item-suffix"[\s\S]*?<slot name="suffix">/);
  assert.match(styles, /font-size: var\(--sn-list-item-label-size, 12px\);/);
  assert.match(styles, /font-size: var\(--sn-list-item-description-size, 11px\);/);
  assert.match(styles, /font-size: var\(--sn-list-item-meta-size, 10px\);/);
  assert.equal(spinner.hidden, true);

  el.loading = true;
  await nextRenderTick();
  assert.equal(spinner.hidden, false);

  el.loading = false;
  await nextRenderTick();
  assert.equal(spinner.hidden, true);

  innerItem.dispatchEvent(new window.Event('click', { bubbles: true, composed: true }));
  assert.equal(selectTriggered, true);

  el.remove();
});

test('sn-data-table implements sorting descriptors and selection click triggers', async () => {
  installSsrDom();
  await import('../display/DataTable/DataTable.js');

  const el = document.createElement('sn-data-table');
  document.body.append(el);
  await nextRenderTick();

  let sortEvent = null;
  el.addEventListener('sn-data-table-sort', (e) => {
    sortEvent = e.detail;
  });

  el.setData({
    columns: [
      { key: 'name', label: 'Name', sortable: true },
      { key: 'status', label: 'Status' }
    ],
    rows: [
      { id: 'row1', name: 'Pipeline A', status: 'Passed' },
      { id: 'row2', name: 'Pipeline B', status: 'Failed' }
    ]
  });
  await nextRenderTick();

  el.loading = true;
  assert.equal(el.loading, true);
  assert.equal(el.hasAttribute('loading'), true);

  el.errorText = 'Timeout occurred';
  assert.equal(el.errorText, 'Timeout occurred');

  el.remove();
});

test('sn-badge renders with status role', async () => {
  installSsrDom();
  await import('../display/Badge/Badge.js?base-elements-badge');

  const el = document.createElement('sn-badge');
  document.body.append(el);
  await nextRenderTick();

  assert.equal(el.getAttribute('role'), 'status');

  el.remove();
});

test('sn-badge keeps a readable 12px typography floor across theme entrypoints', async () => {
  let [badge, defaultProvider, defaultProviderCss, defaultDark, cascadeTheme, editor] = await Promise.all([
    readFile(new URL('../display/Badge/Badge.css.js', import.meta.url), 'utf8'),
    readFile(new URL('../themes/default-provider.js', import.meta.url), 'utf8'),
    readFile(new URL('../themes/default-provider.css', import.meta.url), 'utf8'),
    readFile(new URL('../themes/default-dark.js', import.meta.url), 'utf8'),
    readFile(new URL('../themes/cascade-theme.js', import.meta.url), 'utf8'),
    readFile(new URL('../themes/CascadeThemeEditor/CascadeThemeEditor.css.js', import.meta.url), 'utf8'),
  ]);

  assert.match(badge, /font-size: var\(--sn-badge-font-size, 12px\);/);
  assert.match(defaultProvider, /'--sn-badge-font-size': '12px'/);
  assert.match(defaultProviderCss, /--sn-badge-font-size: 12px;/);
  assert.match(defaultDark, /'--sn-badge-font-size': '12px'/);
  assert.match(cascadeTheme, /'--sn-badge-font-size': typeToken\(12\)/);
  assert.match(editor, /var\(--sn-badge-font-size, 12px\)/);
});

test('sn-metric renders with ARIA role and status-based live region', async () => {
  installSsrDom();
  await import('../display/Metric/Metric.js');

  const el = document.createElement('sn-metric');
  document.body.append(el);
  await nextRenderTick();

  assert.equal(el.getAttribute('role'), 'group');

  el.setAttribute('status', 'error');
  assert.equal(el.getAttribute('aria-live'), 'polite');

  el.setAttribute('status', 'success');
  assert.equal(el.hasAttribute('aria-live'), false);

  el.remove();
});

test('content surfaces expose themed inset and collapsed sidebar geometry', async () => {
  let [
    descriptionList,
    scrollArea,
    layoutNode,
    layoutSidebar,
    defaultProvider,
    defaultProviderCss,
    cascadeTheme,
    registry,
    customElements,
  ] = await Promise.all([
    readFile(new URL('../display/DescriptionList/DescriptionList.css.js', import.meta.url), 'utf8'),
    readFile(new URL('../layout/ScrollArea/ScrollArea.css.js', import.meta.url), 'utf8'),
    readFile(new URL('../layout/LayoutNode/LayoutNode.css.js', import.meta.url), 'utf8'),
    readFile(new URL('../layout/LayoutSidebar/LayoutSidebar.css.js', import.meta.url), 'utf8'),
    readFile(new URL('../themes/default-provider.js', import.meta.url), 'utf8'),
    readFile(new URL('../themes/default-provider.css', import.meta.url), 'utf8'),
    readFile(new URL('../themes/cascade-theme.js', import.meta.url), 'utf8'),
    readFile(new URL('../manifest/component-registry.js', import.meta.url), 'utf8'),
    readFile(new URL('../custom-elements.json', import.meta.url), 'utf8'),
  ]);

  assert.match(descriptionList, /grid-template-columns: var\(--sn-description-list-columns, minmax\(120px, max-content\) minmax\(0, 1fr\)\);/);
  assert.match(descriptionList, /padding: var\(--sn-description-list-padding\);/);
  assert.match(descriptionList, /\.sn-description-label \{[\s\S]*?min-width: 0;[\s\S]*?text-overflow: ellipsis;/);
  assert.match(scrollArea, /sn-scroll-area \{[\s\S]*?min-width: 0;[\s\S]*?min-height: 0;/);
  assert.match(scrollArea, /sn-scroll-area \{[\s\S]*?overflow: auto;[\s\S]*?padding: var\(--sn-scroll-area-padding\);/);
  assert.match(scrollArea, /sn-scroll-area:has\(> \.sn-scroll-container\) \{[\s\S]*?overflow: hidden;[\s\S]*?padding: 0;/);
  assert.match(scrollArea, /sn-scroll-area:not\(:has\(> \.sn-scroll-container\)\) \{[\s\S]*?themedScrollFadeBlockStyles/);
  assert.match(scrollArea, /\.sn-scroll-viewport \{[\s\S]*?box-sizing: border-box;[\s\S]*?padding: var\(--sn-scroll-area-padding\);/);
  assert.doesNotMatch(scrollArea, /\.sn-scroll-viewport \{[\s\S]*?themedScrollFadeBlockStyles/);
  assert.match(layoutNode, /\.panel-title \{[\s\S]*?font-size: var\(--sn-layout-header-title-size, var\(--sn-layout-header-button-size, 0\.75rem\)\);[\s\S]*?line-height: var\(--sn-layout-header-title-line-height, 1\.2\);/);
  assert.match(layoutNode, /\.panel-content \{[\s\S]*?box-sizing: border-box;[\s\S]*?min-inline-size: 0;[\s\S]*?min-block-size: 0;/);
  assert.match(layoutNode, /\.panel-content > sn-card \{[\s\S]*?--sn-card-bg: var\(--sn-layout-panel-card-bg, transparent\);[\s\S]*?--sn-card-border: var\(--sn-layout-panel-card-border, transparent\);[\s\S]*?--sn-card-radius: var\(--sn-layout-panel-card-radius, 0\);[\s\S]*?box-sizing: border-box;[\s\S]*?inline-size: var\(--sn-layout-panel-card-inline-size, 100%\);[\s\S]*?min-block-size: var\(--sn-layout-panel-card-min-block-size, 100%\);/);
  assert.match(layoutSidebar, /layout-sidebar \{[\s\S]*?border-top: 1px solid var\(--sn-layout-border\);[\s\S]*?border-right: 1px solid var\(--sn-layout-border\);/);
  assert.match(layoutSidebar, /&\[collapsed\] \{[\s\S]*?width: var\(--sn-sidebar-collapsed-width, var\(--sn-layout-header-block-size, calc\(var\(--sn-layout-header-min-height, 28px\) \+ 3px\)\)\);[\s\S]*?min-width: var\(--sn-sidebar-collapsed-width, var\(--sn-layout-header-block-size, calc\(var\(--sn-layout-header-min-height, 28px\) \+ 3px\)\)\);/);
  assert.match(layoutSidebar, /\.sb-header \{[\s\S]*?block-size: var\(--sn-layout-header-block-size, calc\(var\(--sn-layout-header-min-height, 28px\) \+ 3px\)\);[\s\S]*?background: var\(--sn-layout-sidebar-header-bg, var\(--sn-node-header-bg\)\);[\s\S]*?box-sizing: border-box;[\s\S]*?border-bottom: 1px solid var\(--sn-layout-sidebar-header-border, var\(--sn-layout-border\)\);/);
  assert.doesNotMatch(layoutSidebar, /\.sb-header \{[\s\S]*?border-right:/);
  assert.match(layoutSidebar, /\.sb-header-btn \{[\s\S]*?box-sizing: border-box;[\s\S]*?min-inline-size: var\(--sn-layout-header-button-min-inline-size, 24px\);[\s\S]*?block-size: var\(--sn-layout-header-button-block-size, var\(--sn-layout-header-button-min-block-size, 24px\)\);[\s\S]*?line-height: 1;[\s\S]*?&:hover \{[\s\S]*?background: var\(--sn-layout-sidebar-header-button-hover-bg, color-mix\(in oklch, var\(--sn-sys-accent\) var\(--sn-sys-state-hover-mix\), transparent\)\);/);
  assert.match(layoutSidebar, /layout-sidebar\[collapsed\] & \{[\s\S]*?justify-content: center;[\s\S]*?padding: var\(--sn-layout-header-padding, 2px 4px\);/);
  assert.match(layoutSidebar, /sidebar-section \.sec-item \{[\s\S]*?padding: var\(--sn-layout-sidebar-item-padding, var\(--sn-step-2\) var\(--sn-step-7\)\);[\s\S]*?box-sizing: border-box;[\s\S]*?block-size: var\(--sn-layout-sidebar-item-block-size, var\(--sn-layout-header-block-size, calc\(var\(--sn-layout-header-min-height, 28px\) \+ 3px\)\)\);/);
  assert.match(layoutSidebar, /layout-sidebar\[edit-mode\] &:first-child \{[\s\S]*?background: var\(--sn-layout-sidebar-header-button-active-bg, color-mix\(in oklab, var\(--sn-cat-server\) 10%, transparent\)\);/);
  assert.match(layoutSidebar, /layout-sidebar\[collapsed\] & \{[\s\S]*?inline-size: var\(--sn-sidebar-collapsed-item-size, var\(--sn-layout-sidebar-item-block-size, var\(--sn-layout-header-block-size, calc\(var\(--sn-layout-header-min-height, 28px\) \+ 3px\)\)\)\);[\s\S]*?block-size: var\(--sn-sidebar-collapsed-item-size, var\(--sn-layout-sidebar-item-block-size, var\(--sn-layout-header-block-size, calc\(var\(--sn-layout-header-min-height, 28px\) \+ 3px\)\)\)\);[\s\S]*?margin-inline: auto;/);
  assert.match(layoutSidebar, /sidebar-section\[data-active\] > \.sec-item \{[\s\S]*?padding-left: var\(--sn-step-6\);[\s\S]*?layout-sidebar\[collapsed\] & \{[\s\S]*?justify-content: center;[\s\S]*?inline-size: var\(--sn-sidebar-collapsed-item-size, var\(--sn-layout-sidebar-item-block-size, var\(--sn-layout-header-block-size, calc\(var\(--sn-layout-header-min-height, 28px\) \+ 3px\)\)\)\);[\s\S]*?margin-inline: auto;[\s\S]*?border-radius: var\(--sn-sidebar-collapsed-item-radius, var\(--sn-radius-sm, 4px\)\);[\s\S]*?padding: 0;[\s\S]*?border-left: 0;[\s\S]*?box-shadow: inset 2px 0 0 var\(--sn-cat-server\);/);
  assert.doesNotMatch(layoutSidebar, /sidebar-section\[data-active\] > \.sec-item \{[\s\S]*?layout-sidebar\[collapsed\] & \{[\s\S]*?inline-size: 100%;/);
  assert.match(defaultProvider, /'--sn-sidebar-collapsed-item-size': 'var\(--sn-layout-sidebar-item-block-size\)'/);
  assert.match(defaultProvider, /'--sn-sidebar-collapsed-width': 'var\(--sn-layout-header-block-size, calc\(var\(--sn-layout-header-min-height, 28px\) \+ 3px\)\)'/);
  assert.match(defaultProviderCss, /--sn-sidebar-collapsed-width: var\(--sn-layout-header-block-size, calc\(var\(--sn-layout-header-min-height, 28px\) \+ 3px\)\);/);
  assert.match(defaultProviderCss, /--sn-sidebar-collapsed-item-size: var\(--sn-layout-sidebar-item-block-size\);/);
  assert.match(cascadeTheme, /'--sn-sidebar-collapsed-width': 'var\(--sn-layout-header-block-size, calc\(var\(--sn-layout-header-min-height, 28px\) \+ 3px\)\)'/);
  assert.match(cascadeTheme, /'--sn-sidebar-collapsed-item-size': 'var\(--sn-layout-sidebar-item-block-size\)'/);

  for (let token of [
    '--sn-description-list-padding',
    '--sn-scroll-area-padding',
    '--sn-layout-header-gap',
    '--sn-layout-header-padding',
    '--sn-layout-header-min-height',
    '--sn-layout-header-block-size',
    '--sn-layout-header-title-size',
    '--sn-layout-header-title-line-height',
    '--sn-layout-header-button-size',
    '--sn-layout-header-icon-size',
    '--sn-layout-header-button-gap',
    '--sn-layout-header-button-padding',
    '--sn-layout-header-button-radius',
    '--sn-layout-header-button-min-inline-size',
    '--sn-layout-header-button-min-block-size',
    '--sn-layout-header-button-block-size',
    '--sn-layout-panel-card-bg',
    '--sn-layout-panel-card-border',
    '--sn-layout-panel-card-radius',
    '--sn-layout-panel-card-inline-size',
    '--sn-layout-panel-card-min-block-size',
    '--sn-layout-sidebar-header-bg',
    '--sn-layout-sidebar-header-border',
    '--sn-layout-sidebar-header-button-hover-bg',
    '--sn-layout-sidebar-header-button-active-bg',
    '--sn-layout-sidebar-item-block-size',
    '--sn-layout-sidebar-item-padding',
    '--sn-sidebar-collapsed-width',
    '--sn-sidebar-collapsed-item-size',
    '--sn-sidebar-collapsed-item-radius',
    '--sn-sidebar-collapsed-sections-padding',
  ]) {
    assert.match(defaultProvider, new RegExp(`'${token}'`));
    assert.match(defaultProviderCss, new RegExp(`${token}:`));
    assert.match(cascadeTheme, new RegExp(`'${token}'`));
    assert.match(registry, new RegExp(token));
    assert.match(customElements, new RegExp(token));
  }
});

test('sn-card renders with ARIA role and interactive focus support', async () => {
  installSsrDom();
  await import('../surface/Card/Card.js');

  const el = document.createElement('sn-card');
  document.body.append(el);
  await nextRenderTick();

  assert.equal(el.getAttribute('role'), 'region');
  assert.equal(el.hasAttribute('tabindex'), false);

  el.setAttribute('interactive', '');
  assert.equal(el.getAttribute('role'), 'button');
  assert.equal(el.getAttribute('tabindex'), '0');

  el.removeAttribute('interactive');
  assert.equal(el.getAttribute('role'), 'region');
  assert.equal(el.hasAttribute('tabindex'), false);

  el.remove();
});

test('sn-banner renders with variant-based ARIA role', async () => {
  installSsrDom();
  await import('../display/Banner/Banner.js');

  const el = document.createElement('sn-banner');
  document.body.append(el);
  await nextRenderTick();

  assert.equal(el.getAttribute('role'), 'status');

  el.setAttribute('variant', 'error');
  assert.equal(el.getAttribute('role'), 'alert');

  el.setAttribute('variant', 'danger');
  assert.equal(el.getAttribute('role'), 'alert');

  el.setAttribute('variant', 'info');
  assert.equal(el.getAttribute('role'), 'status');

  el.remove();
});

test('sn-empty-state renders with region role', async () => {
  installSsrDom();
  await import('../display/EmptyState/EmptyState.js');

  const el = document.createElement('sn-empty-state');
  document.body.append(el);
  await nextRenderTick();

  assert.equal(el.getAttribute('role'), 'region');

  el.remove();
});

test('sn-loading-overlay renders with progressbar role and ARIA value tracking', async () => {
  installSsrDom();
  await import('../display/LoadingOverlay/LoadingOverlay.js');

  const el = document.createElement('sn-loading-overlay');
  document.body.append(el);
  await nextRenderTick();

  assert.equal(el.getAttribute('role'), 'progressbar');
  assert.equal(el.getAttribute('aria-valuemin'), '0');
  assert.equal(el.getAttribute('aria-valuemax'), '100');

  el.remove();
});

test('quick-open renders with combobox ARIA role and manages selection states', async () => {
  installSsrDom();
  await import('../navigation/QuickOpen/QuickOpen.js');

  const el = document.createElement('quick-open');
  document.body.append(el);
  await nextRenderTick();

  const input = el.querySelector('.qo-input');
  const resultsContainer = el.querySelector('.qo-results');

  assert.equal(input.getAttribute('role'), 'combobox');
  assert.equal(input.getAttribute('aria-autocomplete'), 'list');
  assert.equal(input.getAttribute('aria-controls'), 'qo-results-list');
  assert.equal(resultsContainer.getAttribute('role'), 'listbox');

  const items = [
    { label: 'File A', path: 'src/FileA.js', value: 'src/FileA.js' },
    { label: 'File B', path: 'src/FileB.js', value: 'src/FileB.js' },
  ];
  el.setItems(items);
  await nextRenderTick();

  assert.equal(input.getAttribute('aria-expanded'), 'false');

  el.open();
  await nextRenderTick();

  assert.equal(input.getAttribute('aria-expanded'), 'true');

  const options = el.querySelectorAll('.qo-item');
  assert.equal(options.length, 2);
  assert.equal(options[0].getAttribute('role'), 'option');
  assert.equal(options[0].id, 'qo-item-0');
  assert.equal(options[0].getAttribute('aria-selected'), 'true');
  assert.equal(options[1].getAttribute('aria-selected'), 'false');
  assert.equal(input.getAttribute('aria-activedescendant'), 'qo-item-0');

  input.dispatchEvent(new window.Event('focus'));
  const keyEvent = new window.Event('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(keyEvent, 'key', { value: 'ArrowDown' });
  input.dispatchEvent(keyEvent);
  await nextRenderTick();

  const updatedOptions = el.querySelectorAll('.qo-item');
  assert.equal(updatedOptions[0].getAttribute('aria-selected'), 'false');
  assert.equal(updatedOptions[1].getAttribute('aria-selected'), 'true');
  assert.equal(input.getAttribute('aria-activedescendant'), 'qo-item-1');

  el.remove();
});

test('sn-slider updates value, syncs input attributes, and handles native events', async () => {
  installSsrDom();
  await import('../control/Slider/Slider.js');
  const sliderCss = (await import('../control/Slider/Slider.css.js')).default;

  const el = document.createElement('sn-slider');
  el.min = '10';
  el.max = '200';
  el.value = '50';
  document.body.append(el);
  await nextRenderTick();

  const input = el.querySelector('input');
  assert.equal(input.value, '50');
  assert.equal(input.min, '10');
  assert.equal(input.max, '200');

  let changeEvent = null;
  el.addEventListener('sn-slider-change', (e) => {
    changeEvent = e.detail;
  });

  input.value = '120';
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  await nextRenderTick();

  assert.equal(el.value, '120');
  assert.equal(changeEvent.value, '120');
  assert.match(sliderCss, /\.sn-slider-wrapper:focus-within \.sn-slider-track-wrap/);
  assert.doesNotMatch(sliderCss, /\.sn-slider-input:focus-visible ~ \.sn-slider-track-wrap/);

  el.remove();
});

test('sn-rating renders max stars, handles selection and keyboard increment', async () => {
  installSsrDom();
  await import('../control/Rating/Rating.js');

  const el = document.createElement('sn-rating');
  el.max = '6';
  el.value = '2';
  document.body.append(el);
  await nextRenderTick();

  const stars = el.querySelectorAll('.sn-rating-star');
  assert.equal(stars.length, 6);
  assert.ok(stars[0].hasAttribute('data-active'));
  assert.ok(stars[1].hasAttribute('data-active'));
  assert.ok(!stars[2].hasAttribute('data-active'));

  // Simulate click on index 3 (value 4)
  stars[3].dispatchEvent(new window.Event('click', { bubbles: true }));
  await nextRenderTick();
  assert.equal(el.value, '4');

  // Simulate ArrowRight keydown to increment to 5
  const keyEvent = new window.Event('keydown', { bubbles: true });
  Object.defineProperty(keyEvent, 'key', { value: 'ArrowRight' });
  el.dispatchEvent(keyEvent);
  await nextRenderTick();
  assert.equal(el.value, '5');

  el.setAttribute('disabled', '');
  assert.equal(el.hasAttribute('tabindex'), false);
  assert.equal(el.querySelector('input').disabled, true);

  el.remove();
});

test('sn-segmented-control coordinates roving focus and selection', async () => {
  installSsrDom();
  await import('../control/SegmentedControl/SegmentedControl.js');

  const el = document.createElement('sn-segmented-control');
  el.innerHTML = `
    <button value="light">Light</button>
    <button value="dark">Dark</button>
    <button value="system">System</button>
  `;
  el.value = 'dark';
  document.body.append(el);
  await nextRenderTick();

  const items = el._getItems();
  assert.equal(items.length, 3);
  assert.equal(el.querySelector('slot'), null);
  assert.deepEqual(Array.from(el.children).map((child) => child.tagName.toLowerCase()), ['button', 'button', 'button']);
  assert.equal(items[0].getAttribute('aria-checked'), 'false');
  assert.equal(items[1].getAttribute('aria-checked'), 'true');
  assert.equal(items[1].getAttribute('tabindex'), '0');
  assert.equal(items[0].getAttribute('tabindex'), '-1');

  let changeEvent = null;
  el.addEventListener('sn-segmented-change', (e) => {
    changeEvent = e.detail;
  });

  items[2].dispatchEvent(new window.Event('click', { bubbles: true }));
  await nextRenderTick();

  assert.equal(el.value, 'system');
  assert.equal(changeEvent.value, 'system');

  el.setAttribute('disabled', '');
  assert.equal(el.getAttribute('aria-disabled'), 'true');
  assert.equal(items[0].getAttribute('aria-disabled'), 'true');

  el.remove();
});

test('sn-transport drives playback intents, time display, and scrubber without owning media', async () => {
  installSsrDom();
  await import('../control/Transport/Transport.js');

  const el = document.createElement('sn-transport');
  el.duration = 300;
  el.fps = 30;
  el.current = 60;
  document.body.append(el);
  await nextRenderTick();

  // 60 frames / 30 fps = 2s of 300/30 = 10s.
  assert.equal(el.ref.time.textContent, '0:02 / 0:10');
  assert.equal(el.ref.playIcon.hasAttribute('hidden'), false);
  assert.equal(el.ref.pauseIcon.hasAttribute('hidden'), true);
  assert.equal(el.ref.scrub.hasAttribute('hidden'), true, 'scrubber hidden until show-scrub');

  let controlChange = null;
  let playEvent = null;
  el.addEventListener('sn-control-change', (e) => { controlChange = e.detail; });
  el.addEventListener('sn-transport-play', (e) => { playEvent = e.detail; });

  el.ref.playBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  await nextRenderTick();

  assert.equal(el.playing, true);
  assert.equal(playEvent.playing, true);
  assert.equal(controlChange.control, 'transport');
  assert.equal(controlChange.action, 'play');
  assert.equal(el.ref.playIcon.hasAttribute('hidden'), true);
  assert.equal(el.ref.pauseIcon.hasAttribute('hidden'), false);
  assert.equal(el.ref.playBtn.getAttribute('aria-label'), 'Pause');

  let pauseEvent = null;
  el.addEventListener('sn-transport-pause', (e) => { pauseEvent = e.detail; });
  el.ref.playBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  await nextRenderTick();
  assert.equal(el.playing, false);
  assert.equal(pauseEvent.playing, false);

  let stepEvent = null;
  el.addEventListener('sn-transport-step', (e) => { stepEvent = e.detail; });
  el.ref.stepForwardBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(stepEvent.dir, 1);
  el.ref.stepBackBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(stepEvent.dir, -1);

  let skipEvent = null;
  el.addEventListener('sn-transport-skip', (e) => { skipEvent = e.detail; });
  el.ref.skipEndBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(skipEvent.to, 'end');
  el.ref.skipStartBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(skipEvent.to, 'start');

  let stopEvent = null;
  el.playing = true;
  el.addEventListener('sn-transport-stop', (e) => { stopEvent = e.detail; });
  el.ref.stopBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(stopEvent.playing, false);
  assert.equal(el.playing, false);

  el.showScrub = true;
  await nextRenderTick();
  assert.equal(el.ref.scrub.hasAttribute('hidden'), false);
  assert.equal(el.ref.scrub.max, '300');

  let seekEvent = null;
  el.addEventListener('sn-transport-seek', (e) => { seekEvent = e.detail; });
  el.ref.scrub.value = '150';
  el.ref.scrub.dispatchEvent(new window.Event('input', { bubbles: true }));
  await nextRenderTick();
  assert.equal(seekEvent.value, 150);
  assert.equal(seekEvent.frame, 150);
  assert.equal(el.current, 150);

  // Disabled blocks intents and disables controls.
  el.setAttribute('disabled', '');
  await nextRenderTick();
  assert.equal(el.getAttribute('aria-disabled'), 'true');
  assert.equal(el.ref.playBtn.disabled, true);
  let blockedFire = false;
  el.addEventListener('sn-transport-skip', () => { blockedFire = true; });
  el.ref.skipEndBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(blockedFire, false, 'disabled transport ignores actions');

  el.remove();
});

test('sn-tooltip links trigger a11y description and controls popup overlay state', async () => {
  installSsrDom();
  await import('../display/Tooltip/Tooltip.js');

  const el = document.createElement('sn-tooltip');
  el.content = 'Helpful tooltip info';
  const trigger = document.createElement('button');
  trigger.textContent = 'Hover me';
  el.append(trigger);
  document.body.append(el);
  await nextRenderTick();

  const popup = el.ref.popup;
  assert.equal(trigger.getAttribute('aria-describedby'), popup.id);
  assert.ok(!popup.hasAttribute('data-visible'));

  // Trigger mouseenter
  el.dispatchEvent(new window.Event('mouseenter'));
  await nextRenderTick();

  assert.ok(popup.hasAttribute('data-visible'));
  assert.equal(popup.getAttribute('aria-hidden'), 'false');

  el.setAttribute('disabled', '');
  await nextRenderTick();
  assert.ok(!popup.hasAttribute('data-visible'));

  el.show();
  await nextRenderTick();
  assert.ok(!popup.hasAttribute('data-visible'), 'disabled tooltip should ignore programmatic show');

  // Trigger mouseleave
  el.dispatchEvent(new window.Event('mouseleave'));
  await nextRenderTick();

  assert.ok(!popup.hasAttribute('data-visible'));
  assert.equal(popup.getAttribute('aria-hidden'), 'true');

  el.remove();
});
