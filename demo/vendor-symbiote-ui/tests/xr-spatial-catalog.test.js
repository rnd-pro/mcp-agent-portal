import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cmdDiscover } from '../discover.js';
import {
  XR_SPATIAL_EVIDENCE_CONTRACT,
  listXRSpatialSchemas,
} from '../manifest/xr-spatial-schema-catalog.js';

test('XR spatial schema catalog exposes every published evidence contract', () => {
  let schemas = listXRSpatialSchemas();
  assert.deepEqual(schemas.map((schema) => schema.version), [
    'xr-spatial-target-v1',
    'xr-spatial-observation-v1',
    'xr-spatial-audit-v1',
    'xr-content-hit-map-v1',
    'xr-spatial-placement-receipt-v1',
    'xr-portable-panel-state-v1',
    'xr-portable-panel-receipt-v1',
    'xr-frame-timing-v1',
    'xr-final-session-snapshot-v1',
  ]);
  assert.ok(schemas.every((schema) => schema.path.startsWith('schemas/')));
  assert.ok(schemas.every((schema) => schema.$id.endsWith(schema.path)));
  assert.deepEqual(XR_SPATIAL_EVIDENCE_CONTRACT.exports.placement, [
    'createXRPlacementReceipt',
    'verifyXRPlacementReceipt',
  ]);
  assert.deepEqual(XR_SPATIAL_EVIDENCE_CONTRACT.verification.projections.referenceOnly, [{
    id: 'axonometric',
    metric: false,
    affectsRuntimeVerdict: false,
  }]);
});

test('discover publishes XR schemas, verdict semantics, and Three adapter capabilities', async () => {
  let discovery = await cmdDiscover();
  assert.equal(discovery.manifest.xrSpatialEvidence.version, 'xr-spatial-provider-contract-v1');
  assert.equal(discovery.manifest.xrSpatialEvidence.verification.requiresStereoEvidence, true);
  assert.ok(discovery.manifest.schemas.some((schema) => (
    schema.version === 'xr-spatial-placement-receipt-v1' &&
    schema.path === 'schemas/xr-spatial-placement-receipt-v1.json'
  )));
  let three = discovery.manifest.renderers.find((renderer) => renderer.name === 'three-webxr');
  assert.ok(three.capabilities.includes('three-world-locked-root-commit'));
  assert.ok(three.capabilities.includes('three-trusted-select-receipts'));
  assert.ok(three.capabilities.includes('three-spatial-audit-v1'));
  assert.ok(three.capabilities.includes('three-portable-panel-controls'));
  assert.ok(three.capabilities.includes('three-portable-panel-receipts'));
  assert.ok(three.capabilities.includes('three-panel-fullscreen-intent'));
  assert.ok(three.capabilities.includes('three-frame-timing'));
  assert.ok(three.capabilities.includes('three-final-session-snapshot'));
});
