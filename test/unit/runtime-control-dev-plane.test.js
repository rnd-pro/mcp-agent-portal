import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDevPlaneRuntimeSummary } from '../../web/panels/RuntimeControl/dev-plane-summary.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function t(key, params = {}) {
  let suffix = Object.keys(params).sort().map((name) => `${name}:${params[name]}`).join(',');
  return suffix ? `${key}(${suffix})` : key;
}

describe('RuntimeControl dev-plane summary', () => {
  it('summarizes ready manifest-level dev-plane status without paths', () => {
    let summary = createDevPlaneRuntimeSummary({
      ok: true,
      state: 'ready',
      configured: true,
      root: { source: 'env', name: 'symbiote-dev-plane' },
      summary: {
        packageCount: 15,
        browserImportCount: 4,
      },
      issues: [],
    }, t);

    assert.deepEqual(summary, {
      label: 'text.devPlane',
      value: 'text.devPlaneReady',
      note: 'text.devPlaneReadyNote(browserImports:4,count:15,source:env)',
      variant: 'ready',
    });
  });

  it('summarizes missing optional dev-plane status as an unconfigured state', () => {
    let summary = createDevPlaneRuntimeSummary({
      ok: false,
      state: 'missing',
      configured: false,
      root: { source: 'missing', name: 'symbiote-dev-plane' },
      issues: [{ level: 'info', code: 'dev-plane-not-found' }],
    }, t);

    assert.deepEqual(summary, {
      label: 'text.devPlane',
      value: 'text.devPlaneMissing',
      note: 'text.devPlaneMissingNote',
      variant: 'missing',
    });
  });

  it('summarizes explicit dev-plane errors without leaking issue details', () => {
    let summary = createDevPlaneRuntimeSummary({
      ok: false,
      state: 'error',
      configured: true,
      root: { source: 'env', name: 'symbiote-dev-plane' },
      issues: [
        { level: 'error', code: 'dev-plane-root-unavailable', message: 'LOCAL_DEV_PLANE_ROOT_SHOULD_NOT_RENDER' },
        { level: 'warning', code: 'dev-plane-package-mismatch' },
      ],
    }, t);

    assert.deepEqual(summary, {
      label: 'text.devPlane',
      value: 'text.devPlaneError',
      note: 'text.devPlaneIssueNote(count:2,source:env)',
      variant: 'error',
    });
    assert.equal(JSON.stringify(summary).includes('LOCAL_DEV_PLANE_ROOT_SHOULD_NOT_RENDER'), false);
  });

  it('wires RuntimeControl to the consolidated runtime endpoint', () => {
    let source = fs.readFileSync(path.join(ROOT, 'web/panels/RuntimeControl/RuntimeControl.js'), 'utf8');

    assert.ok(source.includes("from './dev-plane-summary.js'"));
    assert.ok(source.includes("fetchJson('/api/runtime')"));
    assert.equal(source.includes("fetchJson('/api/server-status')"), false);
    assert.equal(source.includes("fetchJson('/api/instances')"), false);
  });
});
