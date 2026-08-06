import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';

class TestCSSStyleSheet {
  replaceSync(text) {
    this.cssText = text;
  }
}

let testWindow = null;
const activeTimers = new Set();
const activeRafs = new Set();

const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;

function installDom() {
  if (testWindow) {
    testWindow.document.body.innerHTML = '';
    testWindow.document.adoptedStyleSheets = [];
    return;
  }

  const { window } = parseHTML('<!doctype html><html><body></body></html>');
  testWindow = window;

  globalThis.setTimeout = (cb, delay, ...args) => {
    const handle = originalSetTimeout(() => {
      activeTimers.delete(handle);
      cb(...args);
    }, delay);
    activeTimers.add(handle);
    return handle;
  };

  globalThis.clearTimeout = (handle) => {
    activeTimers.delete(handle);
    originalClearTimeout(handle);
  };

  globalThis.setInterval = (cb, delay, ...args) => {
    const handle = originalSetInterval(() => {
      cb(...args);
    }, delay);
    activeTimers.add(handle);
    return handle;
  };

  globalThis.clearInterval = (handle) => {
    activeTimers.delete(handle);
    originalClearInterval(handle);
  };

  globalThis.requestAnimationFrame = (callback) => {
    const handle = globalThis.setTimeout(() => {
      activeRafs.delete(handle);
      callback(Date.now());
    }, 0);
    activeRafs.add(handle);
    return handle;
  };

  globalThis.cancelAnimationFrame = (id) => {
    activeRafs.delete(id);
    globalThis.clearTimeout(id);
  };

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
    localStorage: {
      getItem: () => null,
      setItem: () => {},
    },
    getComputedStyle: window.getComputedStyle || (() => ({ transitionDuration: '0s', animationDuration: '0s' })),
  });
  window.document.adoptedStyleSheets = [];
}

function teardownDom() {
  if (testWindow) {
    testWindow.document.body.innerHTML = '';
  }
  for (const t of activeTimers) {
    originalClearTimeout(t);
  }
  activeTimers.clear();
  for (const r of activeRafs) {
    originalClearTimeout(r);
  }
  activeRafs.clear();
}

test('contracts/resource-tree resolves via package self-reference and stays narrow', async () => {
  const module = await import('symbiote-ui/contracts/resource-tree');
  assert.equal(typeof module.buildResourceTreeFromEntries, 'function');
  assert.deepEqual(Object.keys(module), ['buildResourceTreeFromEntries']);

  const tree = module.buildResourceTreeFromEntries([{ path: 'docs/guide/readme.md' }]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].kind, 'directory');
  assert.equal(tree[0].children[0].children[0].label, 'readme.md');
});

test('canvas/graph-explorer.js resolves via package self-reference without DOM globals', async () => {
  const module = await import('symbiote-ui/canvas/graph-explorer.js');
  assert.deepEqual(module.GRAPH_PATH_STYLES, ['pcb', 'bezier', 'orthogonal', 'straight']);
  assert.deepEqual(module.GRAPH_VIEW_MODES, ['structured', 'flat']);
});

test('layout/LayoutTree resolves via package self-reference without DOM globals', async () => {
  const module = await import('symbiote-ui/layout/LayoutTree');
  assert.equal(typeof module.normalizeLayoutBehavior, 'function');
  assert.equal(typeof module.DEFAULT_LAYOUT_BEHAVIOR, 'object');
});

test('ui/locale.js resolves via package self-reference with browser localization helpers', async () => {
  const module = await import('symbiote-ui/ui/locale.js');
  assert.equal(typeof module.configureBrowserLocalization, 'function');
  assert.equal(typeof module.detectBrowserLocale, 'function');
});

test('icons/material-symbols resolves via package self-reference with host control helpers', async () => {
  const module = await import('symbiote-ui/icons/material-symbols');
  assert.equal(typeof module.configureMaterialSymbols, 'function');
  assert.equal(typeof module.ensureMaterialSymbols, 'function');
});

test('ui/host-adapters.js resolves via package self-reference with host-adapter helpers', async () => {
  const module = await import('symbiote-ui/ui/host-adapters.js');
  assert.equal(typeof module.syncListItem, 'function');
  assert.equal(typeof module.bindListItemSelect, 'function');
});

test('canvas/canvas-graph entrypoint exports CanvasGraph and registers canvas-graph', async () => {
  installDom();
  try {
    const module = await import('symbiote-ui/canvas/canvas-graph');
    assert.ok(module.CanvasGraph);
    assert.equal(module.default, module.CanvasGraph);
    assert.ok(customElements.get('canvas-graph'));
  } finally {
    teardownDom();
  }
});

test('layout/panel-layout entrypoint registers the panel-layout element', async () => {
  installDom();
  try {
    const module = await import('symbiote-ui/layout/panel-layout');
    assert.ok(module.Layout);
    assert.ok(customElements.get('panel-layout'));
  } finally {
    teardownDom();
  }
});

test('control/segmented-control entrypoint registers the sn-segmented-control element', async () => {
  installDom();
  try {
    const module = await import('symbiote-ui/control/segmented-control');
    assert.ok(module.SegmentedControl);
    assert.equal(module.default, module.SegmentedControl);
    assert.ok(customElements.get('sn-segmented-control'));
  } finally {
    teardownDom();
  }
});

test('ui/media entrypoint registers sn-media-host and built-in media providers', async () => {
  installDom();
  try {
    const module = await import('symbiote-ui/ui/media');
    assert.ok(module.MediaHost);
    assert.ok(customElements.get('sn-media-host'));
    assert.equal(module.hasMediaProvider(module.IMAGE_PROVIDER_KEY), true);
    assert.equal(module.hasMediaProvider(module.YOUTUBE_PROVIDER_KEY), true);
  } finally {
    teardownDom();
  }
});

test('consumer-visible tags advertise their narrowest public specifier in the registry', async () => {
  const { getComponentSpecifier, listComponents, COMPONENT_UI_SPECIFIER } = await import('../manifest/component-registry.js');

  const expected = {
    'sn-segmented-control': 'symbiote-ui/control/segmented-control',
    'cascade-theme-widget': 'symbiote-ui/themes/CascadeThemeWidget/CascadeThemeWidget.js',
    'cascade-theme-editor': 'symbiote-ui/themes/CascadeThemeEditor/CascadeThemeEditor.js',
    'sn-theme-import-dialog': 'symbiote-ui/themes/CascadeThemeImportDialog/CascadeThemeImportDialog.js',
    'sn-tree-panel': 'symbiote-ui/tree/TreePanel',
    'sn-tree-view': 'symbiote-ui/tree/TreeView',
    'node-canvas': 'symbiote-ui/canvas/node-canvas',
    'canvas-graph': 'symbiote-ui/canvas/canvas-graph',
    'panel-layout': 'symbiote-ui/layout/panel-layout',
    'source-viewer': 'symbiote-ui/display/source-viewer',
    'sn-media-host': 'symbiote-ui/ui/media',
  };
  for (let [tagName, specifier] of Object.entries(expected)) {
    assert.equal(getComponentSpecifier(tagName), specifier, `${tagName} specifier`);
  }

  const narrowTags = new Set(Object.keys(expected));
  for (let component of listComponents({ includeInternal: true })) {
    if (narrowTags.has(component.tagName)) continue;
    assert.equal(
      component.specifier,
      COMPONENT_UI_SPECIFIER,
      `${component.tagName} must keep the symbiote-ui/ui fallback specifier`,
    );
  }
});

test('package declares media side-effect retention and narrow export subpaths', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

  assert.ok(pkg.sideEffects.includes('ui/media/**/*.js'), 'ui/media/**/*.js side effects');

  for (let subpath of [
    './contracts/resource-tree',
    './ui/locale.js',
    './canvas/graph-explorer.js',
    './icons/material-symbols',
    './ui/host-adapters.js',
    './ui/media',
    './canvas/canvas-graph',
    './layout/LayoutTree',
    './layout/panel-layout',
    './control/segmented-control',
  ]) {
    assert.ok(pkg.exports[subpath], `missing export subpath ${subpath}`);
  }
});

test('discover advertises the narrow public entrypoints', async () => {
  const { cmdDiscover } = await import('../discover.js');
  const data = await cmdDiscover({});
  const entrypoints = new Map(data.exports.entrypoints.map((entry) => [entry.specifier, entry]));

  assert.equal(entrypoints.get('symbiote-ui/contracts/resource-tree')?.kind, 'node-safe');
  assert.equal(entrypoints.get('symbiote-ui/canvas/graph-explorer.js')?.kind, 'node-safe');
  assert.equal(entrypoints.get('symbiote-ui/layout/LayoutTree')?.kind, 'node-safe');
  assert.equal(entrypoints.get('symbiote-ui/ui/locale.js')?.kind, 'browser');
  assert.equal(entrypoints.get('symbiote-ui/icons/material-symbols')?.kind, 'browser');
  assert.equal(entrypoints.get('symbiote-ui/ui/host-adapters.js')?.kind, 'browser');
  assert.equal(entrypoints.get('symbiote-ui/ui/media')?.kind, 'browser-component');
  assert.equal(entrypoints.get('symbiote-ui/canvas/canvas-graph')?.kind, 'browser-component');
  assert.equal(entrypoints.get('symbiote-ui/layout/panel-layout')?.kind, 'browser-component');
  assert.equal(entrypoints.get('symbiote-ui/control/segmented-control')?.kind, 'browser-component');
});

test('custom-elements metadata mirrors narrow specifiers for consumer-visible tags', async () => {
  const { getComponentSpecifier } = await import('../manifest/component-registry.js');
  const customElements = JSON.parse(await readFile(new URL('../custom-elements.json', import.meta.url), 'utf8'));
  const declarations = new Map(
    customElements.modules
      .flatMap((module) => module.declarations || [])
      .map((declaration) => [declaration.tagName, declaration]),
  );

  for (let tagName of [
    'sn-segmented-control',
    'cascade-theme-widget',
    'cascade-theme-editor',
    'sn-theme-import-dialog',
    'sn-tree-panel',
    'sn-tree-view',
    'node-canvas',
    'canvas-graph',
    'panel-layout',
    'source-viewer',
    'sn-media-host',
  ]) {
    const declaration = declarations.get(tagName);
    assert.ok(declaration, `${tagName} declaration present`);
    assert.equal(
      declaration.metadata?.specifier,
      getComponentSpecifier(tagName),
      `${tagName} custom-elements specifier mirrors the registry`,
    );
  }
});
