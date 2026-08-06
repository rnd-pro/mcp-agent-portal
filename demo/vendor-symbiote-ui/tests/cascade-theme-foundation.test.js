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

let nativeCSSStyleSheet;
let nativeDocument;
let nativeCustomEvent;

function installDom() {
  const { window } = parseHTML('<!doctype html><html><body><div id="test-element"></div></body></html>');
  nativeCSSStyleSheet = globalThis.CSSStyleSheet;
  nativeDocument = globalThis.document;
  nativeCustomEvent = globalThis.CustomEvent;

  globalThis.CSSStyleSheet = TestCSSStyleSheet;
  globalThis.document = window.document;
  globalThis.CustomEvent = window.CustomEvent;

  window.document.adoptedStyleSheets = [];
}

function restoreDom() {
  globalThis.CSSStyleSheet = nativeCSSStyleSheet;
  globalThis.document = nativeDocument;
  globalThis.CustomEvent = nativeCustomEvent;
}

test('applyCascadeTheme adopts foundation stylesheet and system cascade', async () => {
  installDom();
  try {
    const { applyCascadeTheme } = await import('../themes/cascade-theme.js');

    const element = globalThis.document.getElementById('test-element');
    applyCascadeTheme(element, { mode: 'dark' });

    const adopted = globalThis.document.adoptedStyleSheets;
    assert.equal(adopted.length, 2, 'Should adopt foundation and system cascade');

    const foundationSheet = adopted[0];
    const systemCascadeSheet = adopted[1];

    assert.ok(foundationSheet.cssText.includes('--sn-base'), 'Foundation sheet must contain scale base');
    assert.ok(foundationSheet.cssText.includes('--sn-step-2'), 'Foundation sheet must contain scale steps');
    assert.ok(foundationSheet.cssText.includes('--sn-font'), 'Foundation sheet must contain font definition');
    assert.ok(foundationSheet.cssText.includes(':where(:root, :host)'), 'Foundation sheet selector should be low specificity scoped');

    assert.ok(systemCascadeSheet.cssText.includes(':where(:root, :host)'), 'System cascade sheet selector should be low specificity scoped');
  } finally {
    restoreDom();
  }
});

test('ensureProviderFoundation caches stylesheets per document realm via WeakMap', async () => {
  const { window: win1 } = parseHTML('<!doctype html><html></html>');
  const { window: win2 } = parseHTML('<!doctype html><html></html>');

  win1.document.adoptedStyleSheets = [];
  win2.document.adoptedStyleSheets = [];

  const originalCSSStyleSheet = globalThis.CSSStyleSheet;
  globalThis.CSSStyleSheet = class extends TestCSSStyleSheet {};

  try {
    const { ensureProviderFoundation } = await import('../themes/system-cascade.js');

    const sheet1_a = ensureProviderFoundation(win1.document);
    const sheet1_b = ensureProviderFoundation(win1.document);
    const sheet2_a = ensureProviderFoundation(win2.document);

    assert.equal(sheet1_a, sheet1_b, 'Subsequent calls on same document should return the same sheet instance');
    assert.notEqual(sheet1_a, sheet2_a, 'Calls on different documents should return different sheet instances');
  } finally {
    globalThis.CSSStyleSheet = originalCSSStyleSheet;
  }
});

test('Node-safe imports and no-op without DOM / CSSStyleSheet', async () => {
  const originalCSSStyleSheet = globalThis.CSSStyleSheet;
  const originalDocument = globalThis.document;

  globalThis.CSSStyleSheet = undefined;
  globalThis.document = undefined;

  try {
    const { ensureProviderFoundation, ensureSystemCascade } = await import('../themes/system-cascade.js');

    const res1 = ensureProviderFoundation(null);
    const res2 = ensureSystemCascade(null);

    assert.equal(res1, null, 'Should return null and not crash when CSSStyleSheet/DOM is absent');
    assert.equal(res2, null, 'Should return null and not crash when CSSStyleSheet/DOM is absent');
  } finally {
    globalThis.CSSStyleSheet = originalCSSStyleSheet;
    globalThis.document = originalDocument;
  }
});
