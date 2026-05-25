import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('XR diagnostics page is a standalone public-provider harness', () => {
  let html = fs.readFileSync(path.join(ROOT, 'web/xr-diagnostics.html'), 'utf8');
  let script = fs.readFileSync(path.join(ROOT, 'web/xr-diagnostics.js'), 'utf8');

  assert.ok(html.includes('symbiote-node/xr'), 'diagnostic page must import XR through a public provider specifier');
  assert.ok(html.includes('/packages/symbiote-node/themes/default-provider.css'), 'diagnostic page must use the provider theme');
  assert.ok(html.includes('class="panel"'), 'diagnostic page must include visible DOM panel probes');
  assert.ok(script.includes("from 'symbiote-node/xr'"), 'diagnostic script must consume public provider exports');
  assert.ok(script.includes('createWebXRLaunchRecommendation'), 'diagnostic script must use provider launch diagnostics');
  assert.ok(script.includes('requestWebXRSession'), 'diagnostic script must request sessions through the provider adapter');
  assert.ok(script.includes('createWebXRLayer'), 'diagnostic script must test the WebGL XR layer path');
  assert.equal(script.includes('packages/symbiote-node'), false, 'diagnostic script must not deep-import provider files');
  assert.equal(script.includes('navigator.userAgent'), false, 'diagnostic script must not sniff browser versions');
});
