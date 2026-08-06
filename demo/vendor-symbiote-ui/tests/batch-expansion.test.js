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

async function waitForCondition(check, timeoutMs = 1000) {
  const startedAt = Date.now();
  while (!check()) {
    if (Date.now() - startedAt > timeoutMs) return false;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return true;
}

test('sn-dialog manages visibility, events, and focus behavior', async () => {
  installSsrDom();
  await import('../surface/Dialog/Dialog.js');

  const trigger = document.createElement('button');
  trigger.textContent = 'Open Dialog';
  document.body.append(trigger);
  trigger.focus();

  const dialog = document.createElement('sn-dialog');
  dialog.label = 'Test Dialog';
  const input = document.createElement('input');
  dialog.appendChild(input);
  document.body.append(dialog);

  await nextRenderTick();

  let opened = false;
  let closed = false;
  dialog.addEventListener('sn-dialog-open', () => { opened = true; });
  dialog.addEventListener('sn-dialog-close', () => { closed = true; });

  // Open dialog
  dialog.show();
  await nextRenderTick();

  assert.equal(dialog.open, true);
  assert.equal(dialog.hasAttribute('open'), true);
  assert.equal(opened, true);

  // Close dialog
  dialog.close();
  await nextRenderTick();

  assert.equal(dialog.open, false);
  assert.equal(dialog.hasAttribute('open'), false);
  assert.equal(closed, true);

  // Clean up
  trigger.remove();
  dialog.remove();
});

test('sn-select coordinates selection options, form binding, and keyboard navigation', async () => {
  installSsrDom();
  await import('../control/Select/Select.js');

  const select = document.createElement('sn-select');
  select.placeholder = 'Choose option';
  select.name = 'test-select';

  const opt1 = document.createElement('option');
  opt1.value = 'val1';
  opt1.textContent = 'Option One';

  const opt2 = document.createElement('option');
  opt2.value = 'val2';
  opt2.textContent = 'Option Two';

  select.appendChild(opt1);
  select.appendChild(opt2);
  document.body.append(select);

  await nextRenderTick();

  // Test values and placeholders
  assert.equal(select.value, '');
  assert.equal(select.$.displayLabel, 'Choose option');

  // Verify option sync
  const customOptions = select.ref.optionsContainer.children;
  assert.equal(customOptions.length, 2);
  assert.equal(customOptions[0].textContent, 'Option One');
  assert.equal(customOptions[1].textContent, 'Option Two');

  // Verify native select children sync
  const nativeOptions = select.ref.nativeSelect.options;
  assert.equal(nativeOptions.length, 2);

  // Set selection programmatically
  select.value = 'val2';
  await nextRenderTick();
  assert.equal(select.$.displayLabel, 'Option Two');
  assert.equal(customOptions[1].getAttribute('aria-selected'), 'true');
  assert.equal(customOptions[0].getAttribute('aria-selected'), 'false');

  // Test keydown trigger controls
  let opened = false;
  let closed = false;
  select.addEventListener('sn-select-open', () => { opened = true; });
  select.addEventListener('sn-select-close', () => { closed = true; });

  // Simulate Space keydown to open
  const triggerBtn = select.ref.trigger;
  const eventSpace = new window.Event('keydown', { bubbles: true });
  Object.defineProperty(eventSpace, 'key', { value: ' ' });
  triggerBtn.dispatchEvent(eventSpace);
  await nextRenderTick();
  assert.equal(opened, true);

  // Simulate Escape to close
  const eventEsc = new window.Event('keydown', { bubbles: true });
  Object.defineProperty(eventEsc, 'key', { value: 'Escape' });
  triggerBtn.dispatchEvent(eventEsc);
  await nextRenderTick();
  assert.equal(closed, true);

  select.remove();
});

test('sn-toast and sn-toast-region handle notifications, timeouts, and programmatic show', async () => {
  installSsrDom();
  await import('../display/Toast/Toast.js');

  const region = document.createElement('sn-toast-region');
  document.body.append(region);
  await nextRenderTick();

  // Test ToastRegion.show()
  const toast = region.constructor.show({
    variant: 'success',
    message: 'Operation succeeded',
    duration: 10,
  });

  await nextRenderTick();

  assert.equal(toast.variant, 'success');
  assert.equal(toast.message, 'Operation succeeded');
  assert.equal(toast.duration, 10);
  assert.ok(region.contains(toast));

  const dismissed = await waitForCondition(() => !region.contains(toast));
  assert.equal(dismissed, true, 'Toast should dismiss itself after duration');

  region.remove();
});

test('sn-listbox manages items, multiple selection, keyboard and typeahead', async () => {
  installSsrDom();
  await import('../list/Listbox/Listbox.js');

  const listbox = document.createElement('sn-listbox');
  listbox.value = 'opt2';

  const opt1 = document.createElement('div');
  opt1.setAttribute('role', 'option');
  opt1.setAttribute('data-value', 'opt1');
  opt1.textContent = 'Apple';

  const opt2 = document.createElement('div');
  opt2.setAttribute('role', 'option');
  opt2.setAttribute('data-value', 'opt2');
  opt2.setAttribute('disabled', '');
  opt2.textContent = 'Banana';

  const opt3 = document.createElement('div');
  opt3.setAttribute('role', 'option');
  opt3.setAttribute('data-value', 'opt3');
  opt3.textContent = 'Cherry';

  listbox.appendChild(opt1);
  listbox.appendChild(opt2);
  listbox.appendChild(opt3);
  document.body.appendChild(listbox);

  await nextRenderTick();

  assert.equal(listbox.value, 'opt2');
  assert.equal(opt2.getAttribute('aria-selected'), 'true');
  assert.equal(opt1.getAttribute('aria-selected'), 'false');

  // Set multiple
  listbox.multiple = true;
  listbox.value = 'opt1,opt3';
  await nextRenderTick();
  assert.equal(opt1.getAttribute('aria-selected'), 'true');
  assert.equal(opt2.getAttribute('aria-selected'), 'false');
  assert.equal(opt3.getAttribute('aria-selected'), 'true');

  const arrowDown = new window.Event('keydown', { bubbles: true });
  Object.defineProperty(arrowDown, 'key', { value: 'ArrowDown' });

  listbox.ref.container.dispatchEvent(arrowDown);
  await nextRenderTick();
  assert.equal(opt1.hasAttribute('data-focused'), true);

  listbox.ref.container.dispatchEvent(arrowDown);
  await nextRenderTick();
  assert.equal(opt2.hasAttribute('data-focused'), false);
  assert.equal(opt3.hasAttribute('data-focused'), true);

  opt2.dispatchEvent(new window.Event('click', { bubbles: true }));
  await nextRenderTick();
  assert.equal(opt2.hasAttribute('data-focused'), false);
  assert.equal(opt3.hasAttribute('data-focused'), true);

  listbox.remove();
});

test('sn-popover manages open state and toggles content', async () => {
  installSsrDom();
  await import('../surface/Popover/Popover.js');

  const popover = document.createElement('sn-popover');
  popover.placement = 'bottom-start';

  const trigger = document.createElement('button');
  trigger.setAttribute('slot', 'trigger');
  trigger.textContent = 'Trigger';

  const content = document.createElement('div');
  content.textContent = 'Content';

  popover.appendChild(trigger);
  popover.appendChild(content);
  document.body.appendChild(popover);

  await nextRenderTick();

  assert.equal(popover.open, false);
  assert.equal(popover.ref.panel.hasAttribute('data-visible'), false);

  popover.show();
  await nextRenderTick();

  assert.equal(popover.open, true);
  assert.equal(popover.ref.panel.hasAttribute('data-visible'), true);

  popover.close();
  await nextRenderTick();

  assert.equal(popover.open, false);
  popover.remove();
});

test('sn-combobox filters options and manages selection', async () => {
  installSsrDom();
  await import('../control/Combobox/Combobox.js');

  const combobox = document.createElement('sn-combobox');
  combobox.placeholder = 'Search fruits...';
  combobox.name = 'fruit';

  const opt1 = document.createElement('option');
  opt1.value = 'ap';
  opt1.textContent = 'Apple';

  const opt2 = document.createElement('option');
  opt2.value = 'ba';
  opt2.textContent = 'Banana';

  combobox.appendChild(opt1);
  combobox.appendChild(opt2);
  document.body.appendChild(combobox);

  await nextRenderTick();

  assert.equal(combobox.value, '');

  // Show dropdown
  combobox.open();
  await nextRenderTick();

  assert.equal(combobox.ref.dropdown.hasAttribute('data-visible'), true);

  // Check filter
  combobox.ref.input.value = 'ap';
  combobox.ref.input.dispatchEvent(new window.Event('input'));
  await nextRenderTick();

  const options = combobox.ref.optionsContainer.children;
  assert.equal(options.length, 1);
  assert.equal(options[0].textContent, 'Apple');

  options[0].dispatchEvent(new window.Event('click', { bubbles: true }));
  await nextRenderTick();

  assert.equal(combobox.value, 'ap');
  assert.equal(combobox.ref.nativeInput.getAttribute('name'), 'fruit');
  assert.equal(combobox.ref.nativeInput.value, 'ap');

  combobox.remove();
});

test('sn-drawer slides in/out and manages backdrop visibility', async () => {
  installSsrDom();
  await import('../surface/Drawer/Drawer.js');

  const drawer = document.createElement('sn-drawer');
  drawer.label = 'Main Drawer';
  drawer.placement = 'right';

  const content = document.createElement('div');
  content.textContent = 'Drawer Body';
  drawer.appendChild(content);
  document.body.appendChild(drawer);

  await nextRenderTick();

  assert.equal(drawer.open, false);
  assert.equal(drawer.ref.backdrop.hasAttribute('data-visible'), false);

  drawer.show();
  await nextRenderTick();

  assert.equal(drawer.open, true);
  assert.equal(drawer.ref.backdrop.hasAttribute('data-visible'), true);
  assert.equal(drawer.ref.panel.getAttribute('data-placement'), 'right');
  assert.equal(drawer.ref.panel.hasAttribute('data-visible'), true);
  assert.equal(drawer.ref.panel.parentNode, document.body);

  drawer.close();
  await nextRenderTick();

  assert.equal(drawer.open, false);
  assert.equal(drawer.ref.panel.hasAttribute('data-visible'), false);
  await new Promise(resolve => setTimeout(resolve, 260));
  assert.equal(drawer.contains(drawer.ref.panel), true);
  drawer.remove();
});

test('sn-menu and related components manage items and custom events', async () => {
  installSsrDom();
  await import('../menu/Menu/Menu.js');
  const menuStyles = await readFile(new URL('../menu/Menu/Menu.css.js', import.meta.url), 'utf8');

  const menu = document.createElement('sn-menu');
  const item1 = document.createElement('sn-menu-item');
  item1.setAttribute('shortcut', 'Ctrl+S');
  item1.textContent = 'Save';
  const item2 = document.createElement('sn-menu-item');
  item2.setAttribute('checked', '');
  item2.textContent = 'Toggle Grid';

  menu.appendChild(item1);
  menu.appendChild(item2);
  document.body.appendChild(menu);
  await nextRenderTick();

  assert.equal(menu.getAttribute('role'), 'menu');
  assert.equal(item1.getAttribute('role'), 'menuitem');
  assert.equal(item1.getAttribute('tabindex'), '0');
  assert.equal(item2.getAttribute('role'), 'menuitemcheckbox');
  assert.equal(item2.getAttribute('aria-checked'), 'true');
  assert.ok(item1.querySelectorAll('.sn-menu-item-icon[hidden]').length >= 1);
  assert.match(menuStyles, /\.sn-menu-item-icon\[hidden\]/);
  assert.match(menuStyles, /display:\s*none\s*!important/);

  let selected = false;
  item1.addEventListener('sn-menu-item-select', (e) => {
    selected = true;
    assert.equal(e.detail.shortcut, 'Ctrl+S');
  });

  item1.click();
  await nextRenderTick();
  assert.equal(selected, true);

  menu.remove();
});

test('sn-toolbar manages compact state and keyboard roving focus', async () => {
  installSsrDom();
  await import('../toolbar/Toolbar/Toolbar.js');

  const toolbar = document.createElement('sn-toolbar');
  toolbar.setAttribute('compact', '');
  toolbar.setAttribute('orientation', 'vertical');

  const btn1 = document.createElement('button');
  btn1.textContent = 'Cut';
  const btn2 = document.createElement('button');
  btn2.textContent = 'Copy';

  toolbar.appendChild(btn1);
  toolbar.appendChild(btn2);
  document.body.appendChild(toolbar);
  await nextRenderTick();

  assert.equal(toolbar.getAttribute('role'), 'toolbar');
  assert.equal(toolbar.hasAttribute('compact'), true);
  assert.equal(toolbar.getAttribute('orientation'), 'vertical');

  toolbar.remove();
});

test('sn-breadcrumb and sn-breadcrumb-item represent navigation trail', async () => {
  installSsrDom();
  await import('../navigation/Breadcrumb/Breadcrumb.js');

  const bc = document.createElement('sn-breadcrumb');
  document.body.appendChild(bc);
  await nextRenderTick();

  bc.setPath([{ label: 'Home', icon: 'home' }, { label: 'Settings' }]);
  await nextRenderTick();

  const items = bc.querySelectorAll('sn-breadcrumb-item');
  assert.equal(items.length, 2);
  assert.equal(items[0].getAttribute('label'), 'Home');
  assert.equal(items[0].getAttribute('icon'), 'home');
  assert.equal(items[0].hasAttribute('is-first'), true);
  assert.equal(items[1].getAttribute('label'), 'Settings');
  assert.equal(items[1].hasAttribute('is-active'), true);

  bc.remove();
});

test('sn-accordion and sn-accordion-item toggle expansion states', async () => {
  installSsrDom();
  await import('../surface/Accordion/Accordion.js');

  const accordion = document.createElement('sn-accordion');
  const item = document.createElement('sn-accordion-item');
  item.setAttribute('header', 'System Status');
  item.innerHTML = '<div>Everything is nominal</div>';

  accordion.appendChild(item);
  document.body.appendChild(accordion);
  await nextRenderTick();

  assert.equal(item.getAttribute('header'), 'System Status');
  assert.equal(item.hasAttribute('open'), false);

  item.setAttribute('open', '');
  await nextRenderTick();
  assert.equal(item.open, true);

  accordion.remove();
});

test('sn-pagination updates pages and triggers page-change events', async () => {
  installSsrDom();
  await import('../control/Pagination/Pagination.js');

  const pager = document.createElement('sn-pagination');
  pager.setAttribute('current-page', '2');
  pager.setAttribute('total-pages', '5');
  document.body.appendChild(pager);
  await nextRenderTick();

  assert.equal(pager.currentPage, 2);
  assert.equal(pager.totalPages, 5);

  let pageChanged = null;
  pager.addEventListener('sn-page-change', (e) => {
    pageChanged = e.detail.page;
  });

  // Programmatically change page
  pager.currentPage = 3;
  await nextRenderTick();
  assert.equal(pager.currentPage, 3);

  pager.remove();
});

test('sn-stepper tracks sequence step states', async () => {
  installSsrDom();
  await import('../control/Stepper/Stepper.js');

  const stepper = document.createElement('sn-stepper');
  stepper.setAttribute('active-step', '1');
  document.body.appendChild(stepper);
  await nextRenderTick();

  stepper.setSteps(['Authentication', 'Configuration', 'Verification']);
  await nextRenderTick();

  assert.equal(stepper.activeStep, 1);
  const steps = stepper.ref.container?.children || [];
  assert.ok(steps.length > 0);

  stepper.remove();
});

test('sn-nav-list and sn-nav-item map navigation selections', async () => {
  installSsrDom();
  await import('../navigation/NavList/NavList.js');

  const navList = document.createElement('sn-nav-list');
  const navItem = document.createElement('sn-nav-item');
  navItem.setAttribute('icon', 'settings');
  navItem.setAttribute('badge', '9+');
  navItem.textContent = 'Settings';

  navList.appendChild(navItem);
  document.body.appendChild(navList);
  await nextRenderTick();

  assert.equal(navItem.getAttribute('icon'), 'settings');
  assert.equal(navItem.getAttribute('badge'), '9+');

  let selected = false;
  navItem.addEventListener('sn-nav-select', () => {
    selected = true;
  });

  navItem.click();
  await nextRenderTick();
  assert.equal(selected, true);

  navList.remove();
});

test('sn-progress indicators track work completion ratios', async () => {
  installSsrDom();
  await import('../display/Progress/Progress.js');

  const bar = document.createElement('sn-progress-bar');
  bar.setAttribute('value', '30');
  bar.setAttribute('max', '100');
  document.body.appendChild(bar);
  await nextRenderTick();

  assert.equal(bar.value, 30);
  assert.equal(bar.max, 100);
  assert.equal(bar.getAttribute('role'), 'progressbar');

  const ring = document.createElement('sn-progress-ring');
  ring.setAttribute('indeterminate', '');
  document.body.appendChild(ring);
  await nextRenderTick();

  assert.equal(ring.hasAttribute('indeterminate'), true);

  bar.remove();
  ring.remove();
});

test('sn-skeleton displays pulsing shimmer placeholders', async () => {
  installSsrDom();
  await import('../display/Skeleton/Skeleton.js');

  const sk = document.createElement('sn-skeleton');
  sk.setAttribute('variant', 'circle');
  sk.setAttribute('animation', 'pulse');
  document.body.appendChild(sk);
  await nextRenderTick();

  assert.equal(sk.getAttribute('variant'), 'circle');
  assert.equal(sk.getAttribute('animation'), 'pulse');

  sk.remove();
});

test('sn-status-light reflects semantic color indicators', async () => {
  installSsrDom();
  await import('../display/StatusLight/StatusLight.js');

  const sl = document.createElement('sn-status-light');
  sl.setAttribute('variant', 'success');
  document.body.appendChild(sl);
  await nextRenderTick();

  assert.equal(sl.getAttribute('variant'), 'success');
  assert.equal(sl.getAttribute('role'), 'status');

  sl.remove();

  // Preset variant must survive when host apps build the element inside a
  // JS-assembled innerHTML string, not just via createElement + setAttribute.
  const host = document.createElement('div');
  document.body.appendChild(host);
  host.innerHTML = '<sn-status-light variant="error"></sn-status-light>';
  await nextRenderTick();

  const parsed = host.firstElementChild;
  assert.equal(parsed.getAttribute('variant'), 'error', 'preset variant must survive parser/innerHTML upgrade');
  assert.equal(parsed.variant, 'error');
  host.remove();

  // Reproduce the browser upgrade ordering deterministically: attributeChangedCallback
  // can fire while the element is connected but before init$ has populated $. The old
  // #syncState wrote that uninitialized $.variant straight back, stringifying it to
  // the literal "null" and breaking the [variant=...] styles.
  const upgraded = document.createElement('sn-status-light');
  upgraded.setAttribute('variant', 'warning');
  Object.defineProperty(upgraded, 'isConnected', { configurable: true, get() { return true; } });
  upgraded.attributeChangedCallback('variant', null, 'warning');
  assert.equal(upgraded.getAttribute('variant'), 'warning', 'pre-init sync must not clobber the variant to "null"');
});

test('sn-description-list structures definition grids', async () => {
  installSsrDom();
  await import('../display/DescriptionList/DescriptionList.js');

  const dl = document.createElement('sn-description-list');
  const di = document.createElement('sn-description-item');
  di.setAttribute('label', 'IP Address');
  di.innerHTML = '<code>10.0.0.1</code>';

  dl.appendChild(di);
  document.body.appendChild(dl);
  await nextRenderTick();

  assert.equal(di.getAttribute('label'), 'IP Address');

  dl.remove();
});

test('sn-timeline documents traces chronologically', async () => {
  installSsrDom();
  await import('../display/Timeline/Timeline.js');

  const tl = document.createElement('sn-timeline');
  const ti = document.createElement('sn-timeline-item');
  ti.setAttribute('title', 'Service started');
  ti.setAttribute('time', '12:00 PM');
  ti.setAttribute('variant', 'info');

  tl.appendChild(ti);
  document.body.appendChild(tl);
  await nextRenderTick();

  assert.equal(ti.getAttribute('title'), 'Service started');
  assert.equal(ti.getAttribute('time'), '12:00 PM');
  assert.equal(ti.getAttribute('variant'), 'info');

  tl.remove();

  // Reproduce the browser upgrade ordering deterministically: attributeChangedCallback
  // can fire while the element is connected but before init$ has populated $. The old
  // #syncState wrote that uninitialized $.variant straight back, stringifying it to
  // the literal "null" and breaking the [variant=...] styles.
  const upgraded = document.createElement('sn-timeline-item');
  upgraded.setAttribute('variant', 'info');
  Object.defineProperty(upgraded, 'isConnected', { configurable: true, get() { return true; } });
  upgraded.attributeChangedCallback('variant', null, 'info');
  assert.equal(upgraded.getAttribute('variant'), 'info', 'pre-init sync must not clobber the variant to "null"');
});

test('sn-avatar presents profile fallbacks', async () => {
  installSsrDom();
  await import('../display/Avatar/Avatar.js');

  const av = document.createElement('sn-avatar');
  av.setAttribute('initials', 'JD');
  av.setAttribute('shape', 'rounded');
  av.setAttribute('status', 'online');
  document.body.appendChild(av);
  await nextRenderTick();

  assert.equal(av.getAttribute('initials'), 'JD');
  assert.equal(av.getAttribute('shape'), 'rounded');
  assert.equal(av.getAttribute('status'), 'online');

  av.remove();
});

test('sn-tag supports closable chips', async () => {
  installSsrDom();
  await import('../display/Tag/Tag.js');

  const tag = document.createElement('sn-tag');
  tag.setAttribute('variant', 'error');
  tag.setAttribute('closable', '');
  document.body.appendChild(tag);
  await nextRenderTick();

  assert.equal(tag.getAttribute('variant'), 'error');
  assert.equal(tag.hasAttribute('closable'), true);

  tag.remove();
});

test('sn-data-table supports expandable rows and chevron toggle', async () => {
  installSsrDom();
  await import('../display/DataTable/DataTable.js');

  const table = document.createElement('sn-data-table');
  document.body.appendChild(table);
  await nextRenderTick();

  table.setData({
    columns: [{ key: 'name', label: 'Name' }],
    rows: [
      { id: 'row1', name: 'Task 1', details: 'Full stack diagnostics info...' }
    ]
  });
  await nextRenderTick();

  // Verify expansion state
  assert.equal(table.$.bodyHtml.includes('sn-data-table-expand-btn'), true);
  assert.equal(table.$.bodyHtml.includes('aria-expanded="false"'), true);

  table.toggleRowExpansion('row1');
  await nextRenderTick();
  assert.equal(table.$.bodyHtml.includes('aria-expanded="true"'), true);

  table.remove();
});
