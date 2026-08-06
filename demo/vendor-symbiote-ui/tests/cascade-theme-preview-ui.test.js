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

class MockStorage {
  constructor(entries = []) {
    this.store = new Map(entries);
    this.reads = 0;
    this.writes = 0;
    this.removes = 0;
  }

  get length() {
    return this.store.size;
  }

  key(index) {
    return Array.from(this.store.keys())[index] ?? null;
  }

  getItem(key) {
    this.reads += 1;
    return this.store.has(key) ? this.store.get(key) : null;
  }

  setItem(key, value) {
    this.writes += 1;
    this.store.set(key, String(value));
  }

  removeItem(key) {
    this.removes += 1;
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

function installDom() {
  const { window } = parseHTML('<!doctype html><html><body></body></html>');
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    customElements: window.customElements,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: class CustomEvent extends window.CustomEvent {
      constructor(type, dictionary = {}) {
        super(type, dictionary);
        Object.defineProperties(this, {
          bubbles: { value: dictionary.bubbles ?? false },
          composed: { value: dictionary.composed ?? false },
          detail: { value: dictionary.detail ?? null },
        });
      }
    },
    MutationObserver: window.MutationObserver,
    CSSStyleSheet: TestCSSStyleSheet,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
  });
  window.CustomEvent = globalThis.CustomEvent;
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
    getPropertyValue(property) {
      return element.style?.getPropertyValue?.(property) || '';
    },
  });
  globalThis.matchMedia = () => ({ matches: false });

  const style = window.document.createElement('div').style;
  const StylePrototype = Object.getPrototypeOf(style);
  const originalSet = StylePrototype.setProperty;
  const originalRemove = StylePrototype.removeProperty;
  const priorities = new WeakMap();

  StylePrototype.setProperty = function setProperty(name, value, priority) {
    originalSet.call(this, name, value);
    if (!priorities.has(this)) priorities.set(this, {});
    if (priority) priorities.get(this)[name] = priority;
    else delete priorities.get(this)[name];
  };
  StylePrototype.getPropertyPriority = function getPropertyPriority(name) {
    return priorities.get(this)?.[name] || '';
  };
  StylePrototype.removeProperty = function removeProperty(name) {
    const result = originalRemove.call(this, name);
    delete priorities.get(this)?.[name];
    return result;
  };

  Object.defineProperties(window.HTMLElement.prototype, {
    showModal: {
      configurable: true,
      value() {
        if (this.hasAttribute('open')) throw new Error('InvalidStateError');
        this.setAttribute('open', '');
      },
    },
    close: {
      configurable: true,
      value() {
        this.removeAttribute('open');
        this.dispatchEvent(new window.Event('close'));
      },
    },
  });

  let activeElement = window.document.body;
  Object.defineProperty(window.document, 'activeElement', {
    configurable: true,
    get() {
      return activeElement;
    },
  });
  window.HTMLElement.prototype.focus = function focus() {
    activeElement = this;
  };

  const storage = new MockStorage();
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
}

async function nextRenderTick() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function tokenFor(encode, hue, options = {}) {
  const payload = {
    state: { hue },
    register: options.register ?? '',
  };
  if (options.name !== undefined) payload.name = options.name;
  return encode(payload);
}

installDom();

const {
  start,
  rollback,
  commit,
  finalize,
  getSnapshot,
  getPreviewState,
} = await import('../themes/cascade-theme-preview.js');
const {
  listCascadeThemeUserPresets,
} = await import('../themes/cascade-theme-presets.js');
const {
  normalizeCascadeThemeOptions,
} = await import('../themes/cascade-theme.js');
const {
  encodeCascadeThemeShare,
} = await import('../themes/cascade-theme-share.js');
const {
  default: dialogStyles,
} = await import('../surface/Dialog/Dialog.css.js');

await import('../themes/CascadeThemeImportDialog/CascadeThemeImportDialog.js');

function createDialog() {
  const dialog = document.createElement('sn-theme-import-dialog');
  document.body.appendChild(dialog);
  return dialog;
}

function createTarget(hue = '100') {
  const target = document.createElement('div');
  target.style.setProperty('--sn-theme-hue', hue, 'important');
  target.setAttribute('data-cascade-theme-variant', 'classic');
  document.body.appendChild(target);
  return target;
}

function createCallbackTarget() {
  const properties = new Map([
    ['--sn-theme-hue', { value: '100', priority: 'important' }],
  ]);
  const attributes = new Map([
    ['data-cascade-theme-variant', 'classic'],
    ['data-cascade-tab-shape', 'classic-ear'],
  ]);
  let callback = null;
  const notify = (operation, name, value) => callback?.(operation, name, value);
  const style = {
    getPropertyValue(name) {
      notify('style-read', name);
      return properties.get(name)?.value || '';
    },
    getPropertyPriority(name) {
      notify('priority-read', name);
      return properties.get(name)?.priority || '';
    },
    setProperty(name, value, priority = '') {
      notify('style-write', name, String(value));
      properties.set(name, { value: String(value), priority: String(priority) });
    },
    removeProperty(name) {
      notify('style-remove', name);
      const previous = properties.get(name)?.value || '';
      properties.delete(name);
      return previous;
    },
  };
  const target = {
    style,
    getAttribute(name) {
      notify('attribute-read', name);
      return attributes.has(name) ? attributes.get(name) : null;
    },
    setAttribute(name, value) {
      notify('attribute-write', name, String(value));
      attributes.set(name, String(value));
    },
    removeAttribute(name) {
      notify('attribute-remove', name);
      attributes.delete(name);
    },
  };
  return {
    target,
    properties,
    attributes,
    setCallback(next) {
      callback = next;
    },
  };
}

const START_DISCONNECT_TARGET = 'sn-preview-start-disconnect-target';
if (!customElements.get(START_DISCONNECT_TARGET)) {
  customElements.define(START_DISCONNECT_TARGET, class extends HTMLElement {
    static observedAttributes = ['data-cascade-theme-variant'];

    onPreviewAttributeChange = null;

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue !== newValue) this.onPreviewAttributeChange?.();
    }
  });
}

test('cascade theme preview enforces checked, failure-atomic transitions', () => {
  const target = createTarget('100');

  assert.deepEqual(start(target, { hue: 180 }, 'compact'), {
    state: 'previewing',
    outcome: 'started',
  });
  assert.equal(target.style.getPropertyValue('--sn-theme-hue'), '180');
  assert.deepEqual(finalize(target), { state: 'finalizing', outcome: 'finalized' });
  assert.throws(
    () => start(target, { hue: 220 }, ''),
    (error) => error.code === 'PREVIEW_FINALIZING'
  );
  assert.deepEqual(commit(target), { state: 'settled', outcome: 'committed' });
  assert.throws(
    () => commit(target),
    (error) => error.code === 'INVALID_TRANSITION'
  );
  assert.deepEqual(rollback(target), { state: 'settled', outcome: 'already-settled' });
  target.remove();
});

test('preview diagnostics are detached from the owned transaction', () => {
  const target = createTarget('100');
  start(target, { hue: 180 }, 'compact');

  const diagnostic = getSnapshot(target);
  const originalHue = diagnostic.properties.get('--sn-theme-hue');
  assert.deepEqual(originalHue, { value: '100', priority: 'important' });
  assert.equal(Object.isFrozen(originalHue), true);
  assert.throws(() => {
    originalHue.value = '999';
  }, TypeError);
  diagnostic.properties.set('--sn-theme-hue', { value: '999', priority: '' });
  diagnostic.attributes.set('data-cascade-theme-variant', 'modern');

  const fresh = getSnapshot(target);
  assert.deepEqual(fresh.properties.get('--sn-theme-hue'), {
    value: '100',
    priority: 'important',
  });
  assert.equal(fresh.attributes.get('data-cascade-theme-variant'), 'classic');
  rollback(target);
  assert.equal(target.style.getPropertyValue('--sn-theme-hue'), '100');
  assert.equal(target.style.getPropertyPriority('--sn-theme-hue'), 'important');
  assert.equal(target.getAttribute('data-cascade-theme-variant'), 'classic');
  target.remove();
});

test('low-level preview ownership rejects reentrant mutations during start and restore', () => {
  const instrumented = createCallbackTarget();
  const { target, properties, attributes } = instrumented;
  const codes = { start: [], restore: [] };
  let phase = 'start';
  let invoked = false;

  instrumented.setCallback(() => {
    if (invoked) return;
    invoked = true;
    for (const operation of [
      () => start(target, { hue: 300 }),
      () => finalize(target),
      () => commit(target),
      () => rollback(target),
    ]) {
      try {
        operation();
      } catch (error) {
        codes[phase].push(error.code);
      }
    }
  });

  assert.deepEqual(start(target, { hue: 180 }, 'compact'), {
    state: 'previewing',
    outcome: 'started',
  });
  assert.deepEqual(codes.start, Array(4).fill('PREVIEW_BUSY'));
  assert.equal(properties.get('--sn-theme-hue').value, '180');

  phase = 'restore';
  invoked = false;
  assert.deepEqual(rollback(target), { state: 'settled', outcome: 'rolled-back' });
  assert.deepEqual(codes.restore, Array(4).fill('PREVIEW_BUSY'));
  assert.deepEqual(properties.get('--sn-theme-hue'), {
    value: '100',
    priority: 'important',
  });
  assert.equal(attributes.get('data-cascade-theme-variant'), 'classic');
  assert.equal(attributes.get('data-cascade-tab-shape'), 'classic-ear');

  let injected = false;
  instrumented.setCallback((operation, name, value) => {
    if (operation === 'style-write'
      && name === '--sn-theme-hue'
      && value === '240'
      && !injected) {
      injected = true;
      throw new Error('injected callback interruption');
    }
  });
  assert.throws(
    () => start(target, { hue: 240 }, 'spacious'),
    (error) => error.code === 'START_FAILED'
  );
  assert.deepEqual(properties.get('--sn-theme-hue'), {
    value: '100',
    priority: 'important',
  });
  assert.equal(attributes.get('data-cascade-theme-variant'), 'classic');
  assert.equal(attributes.get('data-cascade-tab-shape'), 'classic-ear');
  assert.equal(getPreviewState(target), 'settled');
});

test('preview replacement restores the original theme and direct partial apply rolls back', () => {
  const target = createTarget('100');
  start(target, { hue: 180 }, 'compact');
  start(target, { hue: 220 }, 'spacious');
  rollback(target);
  assert.equal(target.style.getPropertyValue('--sn-theme-hue'), '100');
  assert.equal(target.style.getPropertyPriority('--sn-theme-hue'), 'important');
  assert.equal(target.getAttribute('data-cascade-theme-variant'), 'classic');

  const StylePrototype = Object.getPrototypeOf(target.style);
  const originalSetProperty = StylePrototype.setProperty;
  let callCount = 0;
  StylePrototype.setProperty = function injectedSetProperty(...args) {
    if (this === target.style) callCount += 1;
    if (this === target.style && callCount === 3) throw new Error('injected DOM write failure');
    return originalSetProperty.apply(this, args);
  };
  assert.throws(
    () => start(target, { hue: 250 }, 'product'),
    (error) => error.code === 'START_FAILED'
  );
  StylePrototype.setProperty = originalSetProperty;
  assert.equal(getPreviewState(target), 'settled');
  assert.equal(target.style.getPropertyValue('--sn-theme-hue'), '100');
  assert.equal(target.style.getPropertyPriority('--sn-theme-hue'), 'important');
  target.remove();
});

test('disconnect from target attributeChangedCallback during start restores the exact owned preview', async () => {
  const dialog = createDialog();
  await nextRenderTick();
  const target = document.createElement(START_DISCONNECT_TARGET);
  target.style.setProperty('--sn-theme-hue', '100', 'important');
  target.setAttribute('data-cascade-theme-variant', 'classic');
  target.setAttribute('data-cascade-tab-shape', 'classic-ear');
  document.body.appendChild(target);
  const originalStyle = target.getAttribute('style');
  const terminals = [];
  let mutationCount = 0;
  let disconnectCount = 0;

  dialog.addEventListener('cascade-theme-import-cancel', (event) => {
    terminals.push({ type: 'cancel', detail: event.detail });
  });
  dialog.addEventListener('cascade-theme-import-error', () => terminals.push('error'));
  target.onPreviewAttributeChange = () => {
    mutationCount += 1;
    if (dialog.isConnected) {
      disconnectCount += 1;
      dialog.remove();
    }
  };

  assert.throws(
    () => dialog.show({
      token: encodeCascadeThemeShare({
        state: { hue: 180, themeVariant: 'modern', tabShape: 'frame' },
        register: 'spacious',
        name: 'Start interruption',
      }),
      target,
      storage: new MockStorage(),
    }),
    (error) => error.code === 'IMPORT_SHOW_INTERRUPTED'
  );

  assert.ok(mutationCount >= 1);
  assert.equal(disconnectCount, 1);
  assert.equal(dialog.isConnected, false);
  assert.equal(target.getAttribute('style'), originalStyle);
  assert.equal(target.style.getPropertyValue('--sn-theme-hue'), '100');
  assert.equal(target.style.getPropertyPriority('--sn-theme-hue'), 'important');
  assert.equal(target.getAttribute('data-cascade-theme-variant'), 'classic');
  assert.equal(target.getAttribute('data-cascade-tab-shape'), 'classic-ear');
  assert.equal(getPreviewState(target), 'settled');
  assert.deepEqual(terminals, [{
    type: 'cancel',
    detail: { reason: 'disconnect' },
  }]);
  assert.deepEqual(Object.keys(terminals[0].detail), ['reason']);

  target.remove();
});

test('close during starting owns cancellation and cannot let the outer show replace a nested session', async () => {
  const dialog = createDialog();
  await nextRenderTick();
  const target = document.createElement(START_DISCONNECT_TARGET);
  target.style.setProperty('--sn-theme-hue', '100', 'important');
  target.setAttribute('data-cascade-theme-variant', 'classic');
  target.setAttribute('data-cascade-tab-shape', 'classic-ear');
  document.body.appendChild(target);
  const nestedTarget = createTarget('130');
  const storage = new MockStorage();
  const terminals = [];
  let closeResult = null;
  let nestedResult = null;

  target.onPreviewAttributeChange = () => {
    if (!closeResult) closeResult = dialog.close();
  };
  dialog.addEventListener('cascade-theme-import-cancel', (event) => {
    terminals.push({ type: 'cancel', detail: event.detail });
    nestedResult = dialog.show({
      token: tokenFor(encodeCascadeThemeShare, 275, { name: 'Nested after close' }),
      target: nestedTarget,
      storage,
    });
  }, { once: true });
  dialog.addEventListener('cascade-theme-import-error', () => terminals.push({ type: 'error' }));
  dialog.addEventListener('cascade-theme-import-success', () => terminals.push({ type: 'success' }));

  assert.throws(
    () => dialog.show({
      token: encodeCascadeThemeShare({
        state: { hue: 180, themeVariant: 'modern', tabShape: 'frame' },
        register: 'spacious',
        name: 'Close during start',
      }),
      target,
      storage,
    }),
    (error) => error.code === 'IMPORT_SHOW_INTERRUPTED'
  );

  assert.deepEqual(closeResult, {
    state: 'starting',
    outcome: 'cancellation-requested',
  });
  assert.deepEqual(terminals, [{
    type: 'cancel',
    detail: { reason: 'close' },
  }]);
  assert.equal(target.style.getPropertyValue('--sn-theme-hue'), '100');
  assert.equal(target.style.getPropertyPriority('--sn-theme-hue'), 'important');
  assert.equal(target.getAttribute('data-cascade-theme-variant'), 'classic');
  assert.equal(target.getAttribute('data-cascade-tab-shape'), 'classic-ear');
  assert.equal(getPreviewState(target), 'settled');
  assert.equal(nestedResult?.outcome, 'shown');
  assert.equal(nestedTarget.style.getPropertyValue('--sn-theme-hue'), '275');
  assert.equal(getPreviewState(nestedTarget), 'previewing');

  assert.equal(dialog.cancel().outcome, 'cancelled');
  assert.equal(nestedTarget.style.getPropertyValue('--sn-theme-hue'), '130');
  dialog.remove();
  target.remove();
  nestedTarget.remove();
});

test('popstate contains persistent rollback failure and preserves a retryable preview', async () => {
  const dialog = createDialog();
  await nextRenderTick();
  const target = createTarget('100');
  const storage = new MockStorage();
  const terminals = [];
  const errors = [];
  dialog.addEventListener('cascade-theme-import-error', (event) => {
    terminals.push('error');
    errors.push(event.detail);
  });
  dialog.addEventListener('cascade-theme-import-cancel', () => terminals.push('cancel'));
  dialog.addEventListener('cascade-theme-import-success', () => terminals.push('success'));
  dialog.show({
    token: tokenFor(encodeCascadeThemeShare, 220, { name: 'Retry rollback' }),
    target,
    storage,
  });

  const StylePrototype = Object.getPrototypeOf(target.style);
  const originalSetProperty = StylePrototype.setProperty;
  StylePrototype.setProperty = function persistentRestoreFailure(name, value, ...rest) {
    if (this === target.style && name === '--sn-theme-hue' && String(value) === '100') {
      throw new Error('persistent rollback failure');
    }
    return originalSetProperty.call(this, name, value, ...rest);
  };

  try {
    assert.doesNotThrow(() => window.dispatchEvent(new window.Event('popstate')));
    assert.doesNotThrow(() => window.dispatchEvent(new window.Event('popstate')));
    assert.equal(errors.length, 1);
    assert.deepEqual(Object.keys(errors[0]).sort(), ['code', 'error']);
    assert.equal(errors[0].code, 'IMPORT_ROLLBACK_FAILED');
    assert.equal(errors[0].error.name, 'CascadeThemeImportError');
    assert.equal(target.style.getPropertyValue('--sn-theme-hue'), '220');
    assert.equal(getPreviewState(target), 'previewing');
    assert.equal(dialog.$.isSettled, false);
    assert.notEqual(dialog.decoded, null);
    assert.equal(dialog.addAndApply().outcome, 'rollback-pending');
    assert.equal(storage.writes, 0);
  } finally {
    StylePrototype.setProperty = originalSetProperty;
  }

  assert.deepEqual(dialog.cancel('retry'), { state: 'settled', outcome: 'cancelled' });
  assert.equal(target.style.getPropertyValue('--sn-theme-hue'), '100');
  assert.equal(target.style.getPropertyPriority('--sn-theme-hue'), 'important');
  assert.equal(target.getAttribute('data-cascade-theme-variant'), 'classic');
  assert.equal(getPreviewState(target), 'settled');
  assert.deepEqual(terminals, ['error']);

  dialog.remove();
  target.remove();
});

test('show performs zero storage or clipboard writes and exposes accessible native actions', async () => {
  const dialog = createDialog();
  await nextRenderTick();
  const target = createTarget();
  const storage = new MockStorage();
  let clipboardReads = 0;
  Object.defineProperty(globalThis.navigator || {}, 'clipboard', {
    configurable: true,
    get() {
      clipboardReads += 1;
      throw new Error('clipboard must not be touched');
    },
  });

  dialog.show({
    token: tokenFor(encodeCascadeThemeShare, 170, { register: 'spacious', name: 'Preview' }),
    target,
    storage,
  });
  await nextRenderTick();

  assert.equal(storage.reads, 0);
  assert.equal(storage.writes, 0);
  assert.equal(storage.removes, 0);
  assert.equal(clipboardReads, 0);
  assert.equal(dialog.ref.dialog.getAttribute('aria-modal'), 'true');
  assert.equal(dialog.ref.dialog.getAttribute('aria-labelledby'), 'sn-theme-import-dialog-title');
  assert.equal(dialog.ref.dialog.getAttribute('aria-describedby'), 'sn-theme-import-dialog-status');
  assert.equal(dialog.ref.dialog.querySelectorAll('button').length, 4);
  assert.equal(dialog.ref.dialog.querySelector('[data-action="save-apply"]').tagName, 'BUTTON');
  assert.equal(target.style.getPropertyValue('--sn-theme-hue'), '170');
  assert.notEqual(dialog.style.getPropertyValue('--sn-button-primary-bg'), '');
  assert.equal(dialog.style.getPropertyValue('--sn-button-primary-bg').includes('var('), false);

  dialog.cancel();
  dialog.remove();
  target.remove();
});

test('replacement restores both targets; invalid replacement clears stale actions and has exclusive terminals', async () => {
  const dialog = createDialog();
  await nextRenderTick();
  const firstTarget = createTarget('90');
  const secondTarget = createTarget('110');
  const storage = new MockStorage();
  const events = [];
  for (const type of [
    'cascade-theme-import-cancel',
    'cascade-theme-import-error',
    'cascade-theme-import-success',
  ]) {
    dialog.addEventListener(type, () => events.push(type));
  }

  dialog.show({ token: tokenFor(encodeCascadeThemeShare, 180), target: firstTarget, storage });
  dialog.show({ token: tokenFor(encodeCascadeThemeShare, 210), target: secondTarget, storage });
  assert.equal(firstTarget.style.getPropertyValue('--sn-theme-hue'), '90');
  assert.equal(secondTarget.style.getPropertyValue('--sn-theme-hue'), '210');

  assert.throws(() => {
    dialog.show({ token: 'v1.invalid!', target: secondTarget, storage });
  });
  assert.equal(secondTarget.style.getPropertyValue('--sn-theme-hue'), '110');
  assert.equal(dialog.ref.dialog.hasAttribute('open'), false);
  assert.equal(dialog.addAndApply().outcome, 'already-settled');
  assert.equal(storage.writes, 0);
  assert.deepEqual(events, [
    'cascade-theme-import-cancel',
    'cascade-theme-import-cancel',
    'cascade-theme-import-error',
  ]);

  dialog.remove();
  firstTarget.remove();
  secondTarget.remove();
});

test('replacement aborts when its cancel listener disconnects the dialog and leaves no detached preview', async () => {
  const dialog = createDialog();
  await nextRenderTick();
  const firstTarget = createTarget('90');
  const replacementTarget = createTarget('110');
  const storage = new MockStorage();

  dialog.show({
    token: tokenFor(encodeCascadeThemeShare, 180),
    target: firstTarget,
    storage,
  });
  dialog.addEventListener('cascade-theme-import-cancel', () => dialog.remove(), { once: true });

  assert.throws(
    () => dialog.show({
      token: tokenFor(encodeCascadeThemeShare, 220),
      target: replacementTarget,
      storage,
    }),
    (error) => error.code === 'IMPORT_SHOW_INTERRUPTED'
  );
  assert.equal(dialog.isConnected, false);
  assert.equal(firstTarget.style.getPropertyValue('--sn-theme-hue'), '90');
  assert.equal(replacementTarget.style.getPropertyValue('--sn-theme-hue'), '110');
  assert.equal(getPreviewState(firstTarget), 'settled');
  assert.equal(getPreviewState(replacementTarget), null);

  firstTarget.remove();
  replacementTarget.remove();
});

test('recursive replacement transfers ownership without leaking either superseded preview', async () => {
  const dialog = createDialog();
  await nextRenderTick();
  const firstTarget = createTarget('90');
  const outerTarget = createTarget('110');
  const nestedTarget = createTarget('130');
  const storage = new MockStorage();
  const nestedToken = tokenFor(encodeCascadeThemeShare, 240);
  let nestedResult = null;

  dialog.show({
    token: tokenFor(encodeCascadeThemeShare, 180),
    target: firstTarget,
    storage,
  });
  dialog.addEventListener('cascade-theme-import-cancel', () => {
    nestedResult = dialog.show({ token: nestedToken, target: nestedTarget, storage });
  }, { once: true });

  assert.throws(
    () => dialog.show({
      token: tokenFor(encodeCascadeThemeShare, 220),
      target: outerTarget,
      storage,
    }),
    (error) => error.code === 'IMPORT_SHOW_INTERRUPTED'
  );
  assert.equal(nestedResult?.outcome, 'shown');
  assert.equal(firstTarget.style.getPropertyValue('--sn-theme-hue'), '90');
  assert.equal(outerTarget.style.getPropertyValue('--sn-theme-hue'), '110');
  assert.equal(nestedTarget.style.getPropertyValue('--sn-theme-hue'), '240');
  assert.equal(getPreviewState(firstTarget), 'settled');
  assert.equal(getPreviewState(outerTarget), null);
  assert.equal(getPreviewState(nestedTarget), 'previewing');

  dialog.cancel();
  assert.equal(nestedTarget.style.getPropertyValue('--sn-theme-hue'), '130');
  dialog.remove();
  firstTarget.remove();
  outerTarget.remove();
  nestedTarget.remove();
});

test('replacement protection snapshots the restored host theme, not the previous preview', async () => {
  const dialog = createDialog();
  await nextRenderTick();
  const target = createTarget();
  target.style.setProperty('--sn-sys-surface-overlay', '#123456');
  const storage = new MockStorage();

  dialog.show({ token: tokenFor(encodeCascadeThemeShare, 180), target, storage });
  assert.notEqual(target.style.getPropertyValue('--sn-sys-surface-overlay'), '#123456');
  dialog.show({ token: tokenFor(encodeCascadeThemeShare, 220), target, storage });
  assert.equal(dialog.style.getPropertyValue('--sn-theme-hue'), '100');
  assert.equal(dialog.style.getPropertyValue('--sn-sys-surface-overlay'), '#202124');
  dialog.cancel();
  assert.equal(target.style.getPropertyValue('--sn-sys-surface-overlay'), '#123456');

  dialog.remove();
  target.remove();
});

test('dialog safety tokens always use the frozen palette under a hostile host theme', async () => {
  const dialog = createDialog();
  await nextRenderTick();
  const target = createTarget();
  const storage = new MockStorage();
  target.style.setProperty('--sn-sys-surface-overlay', 'transparent');
  target.style.setProperty('--sn-dialog-max-width', '999999px');
  target.style.setProperty('--sn-panel-radius', 'calc(100vw * 999)');
  target.style.setProperty('--sn-button-primary-bg', 'transparent');
  target.style.setProperty('--sn-sys-on-surface', 'transparent');
  target.style.setProperty('--sn-sys-focus-ring-width', '0px');
  target.style.setProperty('--sn-scroll-shadow-size', '999px');
  target.style.setProperty('--sn-scroll-fade-mask-color', 'transparent');

  dialog.show({ token: tokenFor(encodeCascadeThemeShare, 180), target, storage });

  for (const element of [dialog, dialog.ref.dialog]) {
    assert.equal(element.style.getPropertyValue('--sn-sys-surface-overlay'), '#202124');
    assert.equal(element.style.getPropertyValue('--sn-dialog-max-width'), '560px');
    assert.equal(element.style.getPropertyValue('--sn-panel-radius'), '8px');
    assert.equal(element.style.getPropertyValue('--sn-button-primary-bg'), '#4d8df7');
    assert.equal(element.style.getPropertyValue('--sn-sys-on-surface'), '#f2f3f5');
    assert.equal(element.style.getPropertyValue('--sn-sys-focus-ring-width'), '2px');
    assert.equal(element.style.getPropertyValue('--sn-scroll-shadow-size'), '14px');
    assert.equal(element.style.getPropertyValue('--sn-scroll-fade-mask-color'), '#f2f3f5');
    assert.equal(element.style.getPropertyValue('--sn-theme-hue'), '100');
  }
  assert.match(dialogStyles, /var\(--sn-sys-focus-ring-width\)/);
  assert.match(dialogStyles, /var\(--sn-scroll-shadow-size, 14px\)/);
  assert.match(dialogStyles, /var\(--sn-scroll-fade-mask-color,/);

  dialog.cancel();
  dialog.remove();
  target.remove();
});

test('legacy positional show calls cancel the prior preview and cannot reuse stale action data', async () => {
  const dialog = createDialog();
  await nextRenderTick();
  const target = createTarget();
  const storage = new MockStorage();
  const token = tokenFor(encodeCascadeThemeShare, 200, { name: 'Strict options' });

  dialog.show({ token, target, storage });
  assert.throws(
    () => dialog.show(token, target),
    (error) => error.code === 'INVALID_IMPORT_OPTIONS'
  );
  assert.equal(target.style.getPropertyValue('--sn-theme-hue'), '100');
  assert.equal(dialog.ref.dialog.hasAttribute('open'), false);
  assert.equal(dialog.saveWithoutApplying().outcome, 'already-settled');
  assert.equal(storage.writes, 0);

  dialog.remove();
  target.remove();
});

test('messages reset per show and Escape restores focus and original theme', async () => {
  const dialog = createDialog();
  await nextRenderTick();
  const target = createTarget();
  const trigger = document.createElement('button');
  document.body.appendChild(trigger);
  trigger.focus();

  dialog.show({
    token: tokenFor(encodeCascadeThemeShare, 160),
    target,
    storage: new MockStorage(),
    messages: { title: 'Localized title', cancelLabel: 'Localized cancel' },
  });
  assert.equal(dialog.$.title, 'Localized title');
  assert.equal(dialog.$.cancelLabel, 'Localized cancel');
  dialog.cancel();
  assert.equal(document.activeElement, trigger);

  trigger.focus();
  dialog.show({
    token: tokenFor(encodeCascadeThemeShare, 165),
    target,
    storage: new MockStorage(),
  });
  assert.equal(dialog.$.title, 'Import theme');
  assert.equal(dialog.$.cancelLabel, 'Cancel');
  dialog.ref.dialog.dispatchEvent(new window.Event('cancel'));
  assert.equal(target.style.getPropertyValue('--sn-theme-hue'), '100');
  assert.equal(document.activeElement, trigger);

  trigger.remove();
  dialog.remove();
  target.remove();
});

test('add-and-apply proves exact active bytes before commit and blocks finalizing/reentrant actions', async () => {
  const dialog = createDialog();
  await nextRenderTick();
  const target = createTarget();
  const replacementTarget = createTarget('80');
  const storage = new MockStorage();
  const token = tokenFor(encodeCascadeThemeShare, 205, {
    register: 'spacious',
    name: 'Exact bytes',
  });
  const replacementToken = tokenFor(encodeCascadeThemeShare, 30);
  let replacementError = null;
  let reentrantResult = null;
  let changeCount = 0;
  let successCount = 0;
  const originalSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    if (key === 'symbiote-ui:cascade-theme-editor') {
      try {
        dialog.show({ token: replacementToken, target: replacementTarget, storage });
      } catch (error) {
        replacementError = error;
      }
    }
    originalSetItem(key, value);
  };

  target.addEventListener('cascade-theme-change', () => {
    changeCount += 1;
    reentrantResult = dialog.addAndApply();
  });
  dialog.addEventListener('cascade-theme-import-success', () => {
    successCount += 1;
    dialog.addAndApply();
  });

  dialog.show({ token, target, storage });
  const result = dialog.addAndApply();
  const expectedState = JSON.stringify(normalizeCascadeThemeOptions({ hue: 205 }));

  assert.equal(result.outcome, 'added-and-applied');
  assert.equal(replacementError?.code, 'IMPORT_FINALIZING');
  assert.equal(replacementTarget.style.getPropertyValue('--sn-theme-hue'), '80');
  assert.equal(storage.store.get('symbiote-ui:cascade-theme-editor'), expectedState);
  assert.equal(storage.store.get('symbiote-ui:cascade-theme-editor::geometry-register'), 'spacious');
  assert.equal(target.style.getPropertyValue('--sn-theme-hue'), '205');
  assert.equal(getPreviewState(target), 'settled');
  assert.equal(changeCount, 1);
  assert.equal(successCount, 1);
  assert.equal(reentrantResult.outcome, 'already-settled');
  assert.equal(listCascadeThemeUserPresets({ storage }).length, 1);

  dialog.remove();
  target.remove();
  replacementTarget.remove();
});

test('successful settlement preserves nested previews opened from every outward event', async () => {
  const scenarios = [
    { action: 'add-and-apply', event: 'sn-dialog-close' },
    { action: 'add-and-apply', event: 'cascade-theme-change' },
    { action: 'add-and-apply', event: 'cascade-theme-import-success' },
    { action: 'save-without-applying', event: 'sn-dialog-close' },
    { action: 'save-without-applying', event: 'cascade-theme-import-success' },
  ];

  for (const scenario of scenarios) {
    const dialog = createDialog();
    await nextRenderTick();
    const target = createTarget('100');
    const nestedTarget = createTarget('130');
    const storage = new MockStorage();
    const nestedStorage = new MockStorage();
    const nestedToken = tokenFor(encodeCascadeThemeShare, 275, {
      name: `Nested ${scenario.action} ${scenario.event}`,
    });
    let nestedResult = null;
    let successCount = 0;
    let reentryCount = 0;
    const successDetails = [];

    dialog.addEventListener('cascade-theme-import-success', (event) => {
      successCount += 1;
      successDetails.push(event.detail);
    });
    const eventTarget = scenario.event === 'cascade-theme-change' ? target : dialog;
    eventTarget.addEventListener(scenario.event, () => {
      reentryCount += 1;
      nestedResult = dialog.show({
        token: nestedToken,
        target: nestedTarget,
        storage: nestedStorage,
      });
    }, { once: true });

    dialog.show({
      token: tokenFor(encodeCascadeThemeShare, 205, {
        register: 'spacious',
        name: `Outer ${scenario.action} ${scenario.event}`,
      }),
      target,
      storage,
    });
    const result = scenario.action === 'add-and-apply'
      ? dialog.addAndApply()
      : dialog.saveWithoutApplying();

    assert.equal(
      result.outcome,
      scenario.action === 'add-and-apply' ? 'added-and-applied' : 'saved',
      `${scenario.action} from ${scenario.event} must finish truthfully`
    );
    assert.equal(reentryCount, 1, `${scenario.event} must re-enter exactly once`);
    assert.equal(successCount, 1, `${scenario.action} must emit one success`);
    assert.deepEqual(
      Object.keys(successDetails[0]).sort(),
      ['action', 'preset', 'register', 'state']
    );
    assert.equal(nestedResult?.outcome, 'shown');
    assert.equal(nestedTarget.style.getPropertyValue('--sn-theme-hue'), '275');
    assert.equal(getPreviewState(nestedTarget), 'previewing');
    assert.equal(getPreviewState(target), 'settled');
    assert.equal(
      target.style.getPropertyValue('--sn-theme-hue'),
      scenario.action === 'add-and-apply' ? '205' : '100'
    );
    assert.equal(listCascadeThemeUserPresets({ storage }).length, 1);
    assert.equal(nestedStorage.writes, 0);

    assert.equal(dialog.cancel().outcome, 'cancelled');
    assert.equal(nestedTarget.style.getPropertyValue('--sn-theme-hue'), '130');
    assert.equal(getPreviewState(nestedTarget), 'settled');

    dialog.remove();
    target.remove();
    nestedTarget.remove();
  }
});

test('add-and-apply restores exact raw active bytes and removes its new preset on readback failure', async () => {
  const stateKey = 'symbiote-ui:cascade-theme-editor';
  const registerKey = stateKey + '::geometry-register';
  const priorState = '{"legacy":true,"spacing":"exact"}';
  const priorRegister = 'compact';
  const storage = new MockStorage([
    [stateKey, priorState],
    [registerKey, priorRegister],
  ]);
  const baseGetItem = storage.getItem.bind(storage);
  storage.getItem = (key) => {
    const value = baseGetItem(key);
    if (key === stateKey && value !== priorState) return `${value}corrupt`;
    return value;
  };

  const dialog = createDialog();
  await nextRenderTick();
  const target = createTarget();
  const terminals = [];
  dialog.addEventListener('cascade-theme-import-error', () => terminals.push('error'));
  dialog.addEventListener('cascade-theme-import-cancel', () => terminals.push('cancel'));
  dialog.addEventListener('cascade-theme-import-success', () => terminals.push('success'));
  dialog.show({
    token: tokenFor(encodeCascadeThemeShare, 240, { name: 'Failure' }),
    target,
    storage,
  });

  assert.throws(
    () => dialog.addAndApply(),
    (error) => error.code === 'IMPORT_APPLY_FAILED'
  );
  assert.equal(storage.store.get(stateKey), priorState);
  assert.equal(storage.store.get(registerKey), priorRegister);
  assert.equal(Array.from(storage.store.keys()).some((key) => key.startsWith('symbiote-ui:presets:v1:')), false);
  assert.equal(target.style.getPropertyValue('--sn-theme-hue'), '100');
  assert.deepEqual(terminals, ['error']);

  dialog.remove();
  target.remove();
});

test('direct DOM failure rolls back exact theme and emits error without cancel', async () => {
  const dialog = createDialog();
  await nextRenderTick();
  const target = createTarget();
  const storage = new MockStorage();
  const terminals = [];
  dialog.addEventListener('cascade-theme-import-error', () => terminals.push('error'));
  dialog.addEventListener('cascade-theme-import-cancel', () => terminals.push('cancel'));
  dialog.show({
    token: tokenFor(encodeCascadeThemeShare, 230, { name: 'DOM failure' }),
    target,
    storage,
  });

  const StylePrototype = Object.getPrototypeOf(target.style);
  const originalSetProperty = StylePrototype.setProperty;
  let failed = false;
  StylePrototype.setProperty = function injectedSetProperty(...args) {
    if (this === target.style && !failed) {
      failed = true;
      throw new Error('injected apply failure');
    }
    return originalSetProperty.apply(this, args);
  };
  assert.throws(
    () => dialog.addAndApply(),
    (error) => error.code === 'IMPORT_APPLY_FAILED'
  );
  StylePrototype.setProperty = originalSetProperty;

  assert.equal(target.style.getPropertyValue('--sn-theme-hue'), '100');
  assert.equal(target.style.getPropertyPriority('--sn-theme-hue'), 'important');
  assert.deepEqual(terminals, ['error']);
  assert.equal(listCascadeThemeUserPresets({ storage }).length, 0);

  dialog.remove();
  target.remove();
});

test('save-only disconnect during rollback compensates its preset and reports only cancellation', async () => {
  const dialog = createDialog();
  await nextRenderTick();
  const target = createTarget();
  const storage = new MockStorage();
  const terminals = [];
  for (const [type, label] of [
    ['cascade-theme-import-error', 'error'],
    ['cascade-theme-import-cancel', 'cancel'],
    ['cascade-theme-import-success', 'success'],
  ]) {
    dialog.addEventListener(type, () => terminals.push(label));
  }
  dialog.show({
    token: tokenFor(encodeCascadeThemeShare, 195, { name: 'Interrupted save' }),
    target,
    storage,
  });

  const StylePrototype = Object.getPrototypeOf(target.style);
  const originalSetProperty = StylePrototype.setProperty;
  let disconnected = false;
  StylePrototype.setProperty = function disconnectingSetProperty(...args) {
    const result = originalSetProperty.apply(this, args);
    if (this === target.style && !disconnected) {
      disconnected = true;
      dialog.remove();
    }
    return result;
  };

  try {
    assert.throws(
      () => dialog.saveWithoutApplying(),
      (error) => error.code === 'IMPORT_FINALIZATION_INTERRUPTED'
    );
  } finally {
    StylePrototype.setProperty = originalSetProperty;
  }

  assert.equal(target.style.getPropertyValue('--sn-theme-hue'), '100');
  assert.equal(target.style.getPropertyPriority('--sn-theme-hue'), 'important');
  assert.equal(listCascadeThemeUserPresets({ storage }).length, 0);
  assert.deepEqual(terminals, ['cancel']);
  target.remove();
});

test('add-and-apply disconnect during target writes restores target, exact active state, and preset', async () => {
  const stateKey = 'symbiote-ui:cascade-theme-editor';
  const registerKey = stateKey + '::geometry-register';
  const priorState = '{"legacy":"exact bytes"}';
  const priorRegister = 'compact';
  const storage = new MockStorage([
    [stateKey, priorState],
    [registerKey, priorRegister],
  ]);
  const dialog = createDialog();
  await nextRenderTick();
  const target = createTarget();
  const terminals = [];
  for (const [type, label] of [
    ['cascade-theme-import-error', 'error'],
    ['cascade-theme-import-cancel', 'cancel'],
    ['cascade-theme-import-success', 'success'],
  ]) {
    dialog.addEventListener(type, () => terminals.push(label));
  }
  dialog.show({
    token: tokenFor(encodeCascadeThemeShare, 215, {
      register: 'spacious',
      name: 'Interrupted apply',
    }),
    target,
    storage,
  });

  const StylePrototype = Object.getPrototypeOf(target.style);
  const originalSetProperty = StylePrototype.setProperty;
  let disconnected = false;
  StylePrototype.setProperty = function disconnectingSetProperty(...args) {
    const result = originalSetProperty.apply(this, args);
    if (this === target.style && !disconnected) {
      disconnected = true;
      dialog.remove();
    }
    return result;
  };

  try {
    assert.throws(
      () => dialog.addAndApply(),
      (error) => error.code === 'IMPORT_FINALIZATION_INTERRUPTED'
    );
  } finally {
    StylePrototype.setProperty = originalSetProperty;
  }
  assert.equal(storage.store.get(stateKey), priorState);
  assert.equal(storage.store.get(registerKey), priorRegister);
  assert.equal(listCascadeThemeUserPresets({ storage }).length, 0);
  assert.equal(target.style.getPropertyValue('--sn-theme-hue'), '100');
  assert.equal(target.style.getPropertyPriority('--sn-theme-hue'), 'important');
  assert.deepEqual(terminals, ['cancel']);
  target.remove();
});

test('actual add-and-apply button cannot report success after a reentrant disconnect', async () => {
  const dialog = createDialog();
  await nextRenderTick();
  const target = createTarget();
  const storage = new MockStorage();
  const terminals = [];
  for (const [type, label] of [
    ['cascade-theme-import-error', 'error'],
    ['cascade-theme-import-cancel', 'cancel'],
    ['cascade-theme-import-success', 'success'],
  ]) {
    dialog.addEventListener(type, () => terminals.push(label));
  }
  dialog.show({
    token: tokenFor(encodeCascadeThemeShare, 225, { name: 'Button interruption' }),
    target,
    storage,
  });

  const originalSetItem = storage.setItem.bind(storage);
  let disconnected = false;
  storage.setItem = (key, value) => {
    originalSetItem(key, value);
    if (key.startsWith('symbiote-ui:presets:v1:') && !disconnected) {
      disconnected = true;
      dialog.remove();
    }
  };
  dialog.ref.dialog.querySelector('[data-action="save-apply"]').click();
  await nextRenderTick();

  assert.equal(listCascadeThemeUserPresets({ storage }).length, 0);
  assert.equal(storage.store.has('symbiote-ui:cascade-theme-editor'), false);
  assert.equal(storage.store.has('symbiote-ui:cascade-theme-editor::geometry-register'), false);
  assert.equal(target.style.getPropertyValue('--sn-theme-hue'), '100');
  assert.deepEqual(terminals, ['cancel']);
  target.remove();
});

test('failed preset compensation after finalizing disconnect emits one truthful error', async () => {
  const dialog = createDialog();
  await nextRenderTick();
  const target = createTarget();
  const storage = new MockStorage();
  const terminals = [];
  for (const [type, label] of [
    ['cascade-theme-import-error', 'error'],
    ['cascade-theme-import-cancel', 'cancel'],
    ['cascade-theme-import-success', 'success'],
  ]) {
    dialog.addEventListener(type, () => terminals.push(label));
  }
  dialog.show({
    token: tokenFor(encodeCascadeThemeShare, 225, { name: 'Failed compensation' }),
    target,
    storage,
  });

  const originalSetItem = storage.setItem.bind(storage);
  const originalRemoveItem = storage.removeItem.bind(storage);
  let disconnected = false;
  storage.setItem = (key, value) => {
    originalSetItem(key, value);
    if (key.startsWith('symbiote-ui:presets:v1:') && !disconnected) {
      disconnected = true;
      dialog.remove();
    }
  };
  storage.removeItem = (key) => {
    if (key.startsWith('symbiote-ui:presets:v1:')) {
      throw new Error('injected compensation failure');
    }
    originalRemoveItem(key);
  };

  assert.throws(
    () => dialog.saveWithoutApplying(),
    (error) => error.code === 'IMPORT_COMPENSATION_FAILED'
  );
  assert.equal(target.style.getPropertyValue('--sn-theme-hue'), '100');
  assert.equal(listCascadeThemeUserPresets({ storage }).length, 1);
  assert.deepEqual(terminals, ['error']);
  target.remove();
});

test('save-only works through the actual button, preserves active scope, and reports exclusive failure', async () => {
  const dialog = createDialog();
  await nextRenderTick();
  const target = createTarget();
  const storage = new MockStorage();
  const success = [];
  dialog.addEventListener('cascade-theme-import-success', (event) => success.push(event.detail.action));
  dialog.show({
    token: tokenFor(encodeCascadeThemeShare, 190, { register: 'product', name: 'Saved only' }),
    target,
    storage,
  });
  dialog.ref.dialog.querySelector('[data-action="save-only"]').click();
  await nextRenderTick();

  assert.equal(target.style.getPropertyValue('--sn-theme-hue'), '100');
  assert.equal(storage.store.has('symbiote-ui:cascade-theme-editor'), false);
  assert.equal(storage.store.has('symbiote-ui:cascade-theme-editor::geometry-register'), false);
  assert.equal(listCascadeThemeUserPresets({ storage }).length, 1);
  assert.deepEqual(success, ['save-without-applying']);

  const failingDialog = createDialog();
  await nextRenderTick();
  const failingTarget = createTarget('120');
  const failingStorage = new MockStorage();
  failingStorage.setItem = () => {
    throw new Error('quota');
  };
  const terminals = [];
  failingDialog.addEventListener('cascade-theme-import-error', () => terminals.push('error'));
  failingDialog.addEventListener('cascade-theme-import-cancel', () => terminals.push('cancel'));
  failingDialog.show({
    token: tokenFor(encodeCascadeThemeShare, 260, { name: 'Cannot save' }),
    target: failingTarget,
    storage: failingStorage,
  });
  failingDialog.ref.dialog.querySelector('[data-action="save-only"]').click();
  await nextRenderTick();
  assert.equal(failingTarget.style.getPropertyValue('--sn-theme-hue'), '120');
  assert.deepEqual(terminals, ['error']);

  dialog.remove();
  failingDialog.remove();
  target.remove();
  failingTarget.remove();
});
