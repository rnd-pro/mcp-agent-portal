import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
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
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
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
  return window;
}

async function nextRenderTick() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

installSsrDom();
await import('../marketplace/PackCard/PackCard.js');
await import('../marketplace/PackDetail/PackDetail.js');

const WORKSPACE_PACKAGE_URL = new URL('../../symbiote-workspace/sharing/workspace-package.js', import.meta.url);

async function fileExists(url) {
  try {
    await access(url);
    return true;
  } catch {
    return false;
  }
}

function samplePackage(overrides = {}) {
  return {
    kind: 'symbiote-workspace-package',
    schemaVersion: '0.1.0',
    manifest: {
      id: 'demo.dashboard',
      name: 'Demo Dashboard',
      version: '1.2.0',
      description: 'A demo workspace dashboard package.',
      tags: ['dashboard', 'metrics'],
      permissions: ['workspace.read'],
      compatibility: { workspaceSchema: '1' },
      dependencies: { plugins: ['p1'], components: ['sn-card', 'sn-metric'], packages: [] },
      assets: { docs: ['docs/readme.md'], examples: [], previews: ['previews/main.json'] },
      ...overrides.manifest,
    },
    workspace: { config: {} },
    host: { contract: {} },
  };
}

test('pack-readiness helpers map projection status to display values', async () => {
  let { readinessVariant, readinessLabel, nextActionLabel, flattenMissingCapabilities, normalizePackageSummary } =
    await import('../marketplace/pack-readiness.js');

  assert.equal(readinessVariant({ status: 'ready' }), 'success');
  assert.equal(readinessVariant({ status: 'warning' }), 'warning');
  assert.equal(readinessVariant({ status: 'blocked' }), 'error');
  assert.equal(readinessVariant(null), 'neutral');

  assert.equal(readinessLabel({ status: 'ready' }), 'Ready');
  assert.equal(readinessLabel({ status: 'blocked' }), 'Blocked');
  assert.equal(readinessLabel(undefined), '');

  assert.equal(nextActionLabel({ nextAction: 'construct' }), 'Construct');
  assert.equal(nextActionLabel({ nextAction: 'review-package-readiness' }), 'Review readiness');

  let missing = flattenMissingCapabilities({ components: ['sn-card'], hostServices: ['queue'] });
  assert.deepEqual(missing, [
    { group: 'components', id: 'sn-card' },
    { group: 'hostServices', id: 'queue' },
  ]);

  let summary = normalizePackageSummary(samplePackage());
  assert.equal(summary.name, 'Demo Dashboard');
  assert.equal(summary.version, '1.2.0');
  assert.deepEqual(summary.tags, ['dashboard', 'metrics']);
  assert.equal(summary.dependencies.components.length, 2);
});

test('pack-readiness projection from inspectWorkspacePackage feeds the variant mapping', async (t) => {
  if (!await fileExists(WORKSPACE_PACKAGE_URL)) {
    t.skip('symbiote-workspace is not available in this checkout');
    return;
  }

  let { createPackageReadinessProjection } = await import(WORKSPACE_PACKAGE_URL.href);
  let { readinessVariant } = await import('../marketplace/pack-readiness.js');

  let ready = createPackageReadinessProjection({ valid: true, ready: true });
  assert.equal(ready.status, 'ready');
  assert.equal(readinessVariant(ready), 'success');

  let blocked = createPackageReadinessProjection({ valid: false, errors: [{ severity: 'error' }] });
  assert.equal(blocked.status, 'blocked');
  assert.equal(readinessVariant(blocked), 'error');

  let warning = createPackageReadinessProjection({ valid: true, warnings: [{ severity: 'warning' }] });
  assert.equal(warning.status, 'warning');
  assert.equal(readinessVariant(warning), 'warning');
});

test('sn-pack-card renders package props and host-supplied display props', async () => {

  let el = document.createElement('sn-pack-card');
  document.body.append(el);
  await nextRenderTick();

  el.setPackage(samplePackage(), {
    author: 'RND-PRO',
    verified: true,
    price: '$9',
    installable: true,
    previewable: true,
  });
  await nextRenderTick();

  assert.equal(el.getAttribute('role'), 'listitem');
  assert.match(el.textContent, /Demo Dashboard/);
  assert.match(el.textContent, /1\.2\.0/);
  assert.match(el.textContent, /dashboard/);
  assert.match(el.textContent, /RND-PRO/);
  assert.match(el.textContent, /\$9/);
  assert.equal(el.outerHTML.includes('[object Object]'), false);
  assert.equal(el.outerHTML.includes('undefined'), false);
});

test('sn-pack-card status indicator reflects the readiness projection', async () => {

  let el = document.createElement('sn-pack-card');
  document.body.append(el);
  el.setPackage(samplePackage(), { readiness: { status: 'blocked', nextAction: 'fix-package-context' } });
  await nextRenderTick();

  let light = el.querySelector('sn-status-light');
  assert.ok(light, 'status light is composed');
  assert.equal(light.getAttribute('variant'), 'error');
  assert.match(light.textContent, /Blocked/);

  el.setReadiness({ status: 'ready', nextAction: 'construct' });
  await nextRenderTick();
  assert.equal(light.getAttribute('variant'), 'success');
});

test('sn-pack-card emits select, install, and preview events', async () => {

  let el = document.createElement('sn-pack-card');
  document.body.append(el);
  el.setPackage(samplePackage(), { installable: true, previewable: true });
  await nextRenderTick();

  let events = {};
  for (let type of ['select', 'install', 'preview']) {
    el.addEventListener(type, (e) => { events[type] = e.detail; });
  }

  el.querySelector('sn-card').dispatchEvent(new CustomEvent('click', { bubbles: true }));
  let installBtn = el.querySelector('.sn-pack-card-action-primary');
  let previewBtn = el.querySelector('.sn-pack-card-action:not(.sn-pack-card-action-primary)');
  installBtn.dispatchEvent(new CustomEvent('click', { bubbles: true }));
  previewBtn.dispatchEvent(new CustomEvent('click', { bubbles: true }));
  await nextRenderTick();

  assert.ok(events.select, 'select fired');
  assert.equal(events.select.id, 'demo.dashboard');
  assert.ok(events.install, 'install fired');
  assert.ok(events.preview, 'preview fired');
});

test('sn-pack-detail renders manifest facts and a ready readiness section', async () => {

  let el = document.createElement('sn-pack-detail');
  document.body.append(el);
  el.setPackage(samplePackage(), {
    readiness: { status: 'ready', nextAction: 'construct', missing: {} },
  });
  await nextRenderTick();

  assert.equal(el.getAttribute('role'), 'region');
  assert.match(el.textContent, /Demo Dashboard/);
  assert.match(el.textContent, /Version/);
  assert.match(el.textContent, /Dependencies/);
  assert.match(el.textContent, /2 components/);
  assert.match(el.textContent, /Assets/);

  let banner = el.querySelector('sn-banner');
  assert.ok(banner, 'readiness banner composed');
  assert.equal(banner.getAttribute('variant'), 'success');
  assert.match(el.textContent, /All required capabilities are available/);
  assert.equal(el.outerHTML.includes('[object Object]'), false);
  assert.equal(el.outerHTML.includes('undefined'), false);
});

test('sn-pack-detail lists missing capabilities for a blocked package', async () => {

  let el = document.createElement('sn-pack-detail');
  document.body.append(el);
  el.setPackage(samplePackage(), {
    readiness: {
      status: 'blocked',
      nextAction: 'fix-package-context',
      missing: { components: ['sn-card'], hostServices: ['queue'] },
    },
  });
  await nextRenderTick();

  let banner = el.querySelector('sn-banner');
  assert.equal(banner.getAttribute('variant'), 'error');
  assert.match(el.textContent, /Missing capabilities/);
  assert.match(el.textContent, /sn-card/);
  assert.match(el.textContent, /queue/);
  let missingRows = el.querySelectorAll('.sn-pack-detail-missing-row');
  assert.equal(missingRows.length, 2);
});

test('sn-pack-detail emits install and preview events and reuses template-preview', async () => {

  let el = document.createElement('sn-pack-detail');
  document.body.append(el);
  el.setPackage(samplePackage(), {
    installable: true,
    previewable: true,
    previewTemplate: 'Hello {{name}}',
  });
  await nextRenderTick();

  let preview = el.querySelector('template-preview');
  assert.ok(preview, 'reuses inspector/TemplatePreview');

  let detail = {};
  el.addEventListener('install', (e) => { detail.install = e.detail; });
  el.addEventListener('preview', (e) => { detail.preview = e.detail; });

  el.querySelector('.sn-pack-detail-action-primary').dispatchEvent(new CustomEvent('click', { bubbles: true }));
  el.querySelector('.sn-pack-detail-action:not(.sn-pack-detail-action-primary)')
    .dispatchEvent(new CustomEvent('click', { bubbles: true }));
  await nextRenderTick();

  assert.ok(detail.install, 'install fired');
  assert.equal(detail.install.id, 'demo.dashboard');
  assert.ok(detail.preview, 'preview fired');
});
