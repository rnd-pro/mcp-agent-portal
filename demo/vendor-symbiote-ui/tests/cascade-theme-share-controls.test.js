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

class MemoryStorage {
  #values = new Map();

  get length() {
    return this.#values.size;
  }

  key(index) {
    return Array.from(this.#values.keys())[index] ?? null;
  }

  getItem(key) {
    return this.#values.has(key) ? this.#values.get(key) : null;
  }

  setItem(key, value) {
    this.#values.set(String(key), String(value));
  }

  removeItem(key) {
    this.#values.delete(String(key));
  }
}

function installDom() {
  const { window } = parseHTML('<!doctype html><html><body></body></html>');
  const localStorage = new MemoryStorage();
  Object.defineProperty(window, 'localStorage', { configurable: true, value: localStorage });
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
}

async function nextRenderTick() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function normalizeMetadata(value) {
  if (Array.isArray(value)) return value.map(normalizeMetadata);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    key === 'type' && entry && typeof entry === 'object' ? entry.text : normalizeMetadata(entry),
  ]));
}

function normalizedEvents(events) {
  return normalizeMetadata(events).sort((left, right) => left.name.localeCompare(right.name));
}

function assertExactShareDetail(detail, expectedName) {
  assert.deepEqual(
    Object.keys(detail),
    expectedName === undefined ? ['state', 'register'] : ['state', 'register', 'name'],
  );
  assert.equal(Object.getPrototypeOf(detail.state), Object.prototype);
  assert.equal(typeof detail.register, 'string');
  if (expectedName !== undefined) assert.equal(detail.name, expectedName);
}

function withThemeNameValue(component, value, callback) {
  const getAttribute = component.getAttribute.bind(component);
  Object.defineProperty(component, 'getAttribute', {
    configurable: true,
    value(name) {
      return name === 'theme-name' ? value : getAttribute(name);
    },
  });
  try {
    callback();
  } finally {
    delete component.getAttribute;
  }
}

installDom();
await Promise.all([
  import('../themes/CascadeThemeWidget/CascadeThemeWidget.js'),
  import('../themes/CascadeThemeEditor/CascadeThemeEditor.js'),
]);

const componentCases = [
  ['cascade-theme-widget', 'Compartir tema'],
  ['cascade-theme-editor', 'Поделиться темой'],
];

for (const [tagName, customLabel] of componentCases) {
  test(`${tagName} exposes a reactive public share-label contract`, async () => {
    const component = document.createElement(tagName);
    document.body.append(component);
    await nextRenderTick();

    assert.equal(component.shareLabel, 'Share theme');
    assert.equal(component.ref.shareAction.getAttribute('title'), 'Share theme');
    assert.equal(component.ref.shareAction.getAttribute('aria-label'), 'Share theme');

    let clickRequests = 0;
    component.addEventListener('cascade-theme-share-request', () => { clickRequests += 1; });
    component.ref.shareAction.dispatchEvent(new Event('click', { bubbles: true, composed: true }));
    assert.equal(clickRequests, 1, 'the rendered action uses the public share intent');

    component.setAttribute('share-label', customLabel);
    await nextRenderTick();
    assert.equal(component.shareLabel, customLabel);
    assert.equal(component.ref.shareAction.getAttribute('title'), customLabel);
    assert.equal(component.ref.shareAction.getAttribute('aria-label'), customLabel);

    component.shareLabel = 'Share this preset';
    await nextRenderTick();
    assert.equal(component.getAttribute('share-label'), 'Share this preset');
    assert.equal(component.ref.shareAction.getAttribute('title'), 'Share this preset');
    assert.equal(component.ref.shareAction.getAttribute('aria-label'), 'Share this preset');

    component.removeAttribute('share-label');
    await nextRenderTick();
    assert.equal(component.shareLabel, 'Share theme');
    assert.equal(component.ref.shareAction.getAttribute('title'), 'Share theme');
    assert.equal(component.ref.shareAction.getAttribute('aria-label'), 'Share theme');
    component.remove();

    const preconfigured = document.createElement(tagName);
    preconfigured.setAttribute('share-label', customLabel);
    document.body.append(preconfigured);
    await nextRenderTick();
    assert.equal(preconfigured.shareLabel, customLabel);
    assert.equal(preconfigured.ref.shareAction.getAttribute('title'), customLabel);
    assert.equal(preconfigured.ref.shareAction.getAttribute('aria-label'), customLabel);
    preconfigured.remove();
  });

  test(`${tagName} emits the exact product-neutral share request`, async () => {
    const component = document.createElement(tagName);
    document.body.append(component);
    await nextRenderTick();

    let events = [];
    component.addEventListener('cascade-theme-share-request', (event) => events.push(event));
    component.shareTheme();

    assert.equal(events.length, 1);
    assert.equal(events[0].bubbles, true);
    assert.equal(events[0].composed, true);
    assertExactShareDetail(events[0].detail);
    assert.equal(events[0].detail.register, '', 'the default empty register is a valid share value');

    const originalMode = component.state.mode;
    events[0].detail.state.mode = originalMode === 'dark' ? 'light' : 'dark';
    assert.equal(component.state.mode, originalMode, 'event state is a detached plain snapshot');

    component.setAttribute('theme-name', '  Shared Theme  ');
    component.shareTheme();
    assert.equal(events.length, 2);
    assertExactShareDetail(events[1].detail, 'Shared Theme');
    assert.equal('url' in events[1].detail, false);
    assert.equal('token' in events[1].detail, false);

    component.setAttribute('theme-name', '');
    component.shareTheme();
    assertExactShareDetail(events.at(-1).detail);

    component.setAttribute('theme-name', '   ');
    component.shareTheme();
    assertExactShareDetail(events.at(-1).detail);
    component.removeAttribute('theme-name');

    withThemeNameValue(
      component,
      tagName === 'cascade-theme-widget' ? { text: 'must not be coerced' } : 42,
      () => {
        component.shareTheme();
        assertExactShareDetail(events.at(-1).detail);
      },
    );

    if (tagName === 'cascade-theme-widget') {
      component.scopes = [{
        id: 'named-scope',
        storageKey: component.storageKey,
        label: '  Scope Theme  ',
      }];
    } else {
      component.targets = [{
        id: 'named-target',
        storageKey: component.storageKey,
        selector: component.targetSelector,
        name: '  Target Theme  ',
      }];
    }
    component.setAttribute('theme-name', '   ');
    component.shareTheme();
    assertExactShareDetail(
      events.at(-1).detail,
      tagName === 'cascade-theme-widget' ? 'Scope Theme' : 'Target Theme',
    );
    component.removeAttribute('theme-name');

    withThemeNameValue(component, 42, () => {
      component.shareTheme();
      assertExactShareDetail(
        events.at(-1).detail,
        tagName === 'cascade-theme-widget' ? 'Scope Theme' : 'Target Theme',
      );
    });

    if (tagName === 'cascade-theme-widget') {
      component.scopes = [{
        id: 'hostile-scope',
        storageKey: component.storageKey,
        label: { text: 'must not be coerced' },
      }];
    } else {
      component.targets = [{
        id: 'hostile-target',
        storageKey: component.storageKey,
        selector: component.targetSelector,
        name: { text: 'must not be coerced' },
        label: '  Valid Target Label  ',
      }];
    }
    component.shareTheme();
    if (tagName === 'cascade-theme-widget') {
      assertExactShareDetail(events.at(-1).detail);
    } else {
      assertExactShareDetail(events.at(-1).detail, 'Valid Target Label');
      component.targets = [{
        id: 'fully-hostile-target',
        storageKey: component.storageKey,
        selector: component.targetSelector,
        name: { text: 'must not be coerced' },
        label: 42,
      }];
      component.shareTheme();
      assertExactShareDetail(events.at(-1).detail);
    }
    component.remove();
  });
}

test('provider metadata exposes the share boundary and hydrate-only import dialog', async () => {
  const [{ getComponent }, customElementsSource] = await Promise.all([
    import('../manifest/component-registry.js'),
    readFile(new URL('../custom-elements.json', import.meta.url), 'utf8'),
  ]);
  const customElementsManifest = JSON.parse(customElementsSource);
  const declarations = customElementsManifest.modules.flatMap((module) => module.declarations || []);

  for (const tagName of ['cascade-theme-widget', 'cascade-theme-editor']) {
    const descriptor = getComponent(tagName);
    const declaration = declarations.find((entry) => entry.tagName === tagName);
    assert.ok(descriptor.contract.attributes.some((attribute) => attribute.name === 'share-label'));
    assert.ok(descriptor.contract.properties.some((property) => property.name === 'shareLabel'));
    assert.ok(descriptor.contract.events.some((event) => event.name === 'cascade-theme-share-request'));
    assert.ok(declaration.attributes.some((attribute) => attribute.name === 'share-label'));
    assert.ok(declaration.members.some((member) => member.name === 'shareLabel'));
    assert.ok(declaration.events.some((event) => event.name === 'cascade-theme-share-request'));
    for (const field of ['attributes', 'properties', 'methods', 'events']) {
      assert.deepEqual(
        normalizeMetadata(declaration.contract[field]),
        normalizeMetadata(descriptor.contract[field]),
        `${tagName} ${field} metadata stays aligned with provider discovery`,
      );
    }
    assert.deepEqual(
      normalizedEvents(declaration.events),
      normalizedEvents(descriptor.contract.events),
      `${tagName} CEM events preserve the full provider detail contract`,
    );
    assert.deepEqual(declaration.contract.themeAliases, descriptor.contract.themeAliases);
  }

  const dialogDescriptor = getComponent('sn-theme-import-dialog');
  const dialogDeclaration = declarations.find((entry) => entry.tagName === 'sn-theme-import-dialog');
  const expectedMethods = ['show', 'close', 'cancel', 'saveWithoutApplying', 'addAndApply'];
  assert.equal(dialogDescriptor.contract.ssr.mode, 'hydrate-only');
  assert.equal(dialogDescriptor.contract.ssr.jsdaRenderable, false);
  assert.deepEqual(dialogDescriptor.contract.properties.map(({ name }) => name), ['decoded']);
  assert.deepEqual(dialogDescriptor.contract.methods.map(({ name }) => name), expectedMethods);
  assert.deepEqual(dialogDescriptor.contract.themeAliases, []);
  assert.match(dialogDescriptor.contract.methods[0].description, /storageKey is the active theme state key/);
  for (const field of ['attributes', 'properties', 'methods', 'events']) {
    assert.deepEqual(
      normalizeMetadata(dialogDeclaration.contract[field]),
      normalizeMetadata(dialogDescriptor.contract[field]),
      `sn-theme-import-dialog ${field} metadata stays aligned with provider discovery`,
    );
  }
  assert.deepEqual(
    normalizedEvents(dialogDeclaration.events),
    normalizedEvents(dialogDescriptor.contract.events),
    'sn-theme-import-dialog CEM events preserve the full provider detail contract',
  );
  assert.equal(dialogDeclaration.contract.ssr.mode, 'hydrate-only');
  assert.equal(dialogDeclaration.contract.ssr.jsdaRenderable, false);
  assert.deepEqual(dialogDeclaration.members.map(({ name }) => name), ['decoded', ...expectedMethods]);
  assert.deepEqual(dialogDeclaration.contract.themeAliases, []);
});
