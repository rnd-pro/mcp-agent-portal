import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RENDER_ADMISSION_VERSION, admitRenderRequest } from '../render-admission.js';

function limits(overrides = {}) {
  return {
    maxWidth: 3840,
    maxHeight: 2160,
    maxDpr: 2,
    maxFps: 60,
    maxWorkers: 8,
    allowedTiers: ['sequential-realtime', 'replayable-segment'],
    availableMemoryBytes: 16_000_000_000,
    availableStorageBytes: 200_000_000_000,
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    tier: 'replayable-segment',
    width: 1920,
    height: 1080,
    dpr: 1,
    fps: 30,
    workerCount: 4,
    estMemoryBytes: 4_000_000_000,
    estStorageBytes: 20_000_000_000,
    ...overrides,
  };
}

test('admission admits a request that respects every limit', () => {
  let verdict = admitRenderRequest({ request: request(), limits: limits() });
  assert.equal(verdict.version, RENDER_ADMISSION_VERSION);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.admitted, true);
  assert.deepEqual(verdict.rejections, []);
});

test('admission hard-rejects rather than clamps an oversized dimension', () => {
  let verdict = admitRenderRequest({ request: request({ width: 7680 }), limits: limits() });
  assert.equal(verdict.admitted, false);
  assert.deepEqual(verdict.rejections, [{ field: 'width', requested: 7680, limit: 3840, reason: 'width-over-limit' }]);
});

test('admission rejects an invalid tier and a disallowed tier', () => {
  let invalid = admitRenderRequest({ request: request({ tier: '' }), limits: limits() });
  assert.equal(invalid.admitted, false);
  assert.ok(invalid.rejections.some((entry) => entry.field === 'tier' && entry.reason === 'tier-invalid'));

  let unknown = admitRenderRequest({ request: request({ tier: 'turbo' }), limits: limits() });
  assert.equal(unknown.admitted, false);
  assert.ok(unknown.rejections.some((entry) => entry.field === 'tier' && entry.reason === 'tier-invalid'));

  let disallowed = admitRenderRequest({ request: request({ tier: 'checkpointed-deterministic' }), limits: limits() });
  assert.equal(disallowed.admitted, false);
  assert.ok(disallowed.rejections.some((entry) => entry.field === 'tier' && entry.reason === 'tier-not-allowed'));
});

test('admission fails closed when allowedTiers is missing or empty', () => {
  let missing = admitRenderRequest({ request: request(), limits: limits({ allowedTiers: undefined }) });
  assert.equal(missing.admitted, false);
  assert.ok(missing.rejections.some((entry) => entry.reason === 'allowed-tiers-missing'));

  let empty = admitRenderRequest({ request: request(), limits: limits({ allowedTiers: [] }) });
  assert.equal(empty.admitted, false);
  assert.ok(empty.rejections.some((entry) => entry.reason === 'allowed-tiers-missing'));
});

test('admission fails closed when a hard-gated limit is missing or non-positive', () => {
  let verdict = admitRenderRequest({ request: request(), limits: limits({ maxWidth: undefined, maxFps: 0 }) });
  assert.equal(verdict.admitted, false);
  let reasons = verdict.rejections.map((entry) => entry.reason);
  assert.ok(reasons.includes('width-limit-missing'));
  assert.ok(reasons.includes('fps-limit-missing'));
});

test('admission rejects a missing or non-positive request dimension', () => {
  let missing = admitRenderRequest({ request: request({ width: undefined }), limits: limits() });
  assert.equal(missing.admitted, false);
  assert.ok(missing.rejections.some((entry) => entry.field === 'width' && entry.reason === 'width-invalid'));

  let zero = admitRenderRequest({ request: request({ height: 0 }), limits: limits() });
  assert.equal(zero.admitted, false);
  assert.ok(zero.rejections.some((entry) => entry.field === 'height' && entry.reason === 'height-invalid'));
});

test('admission requires workerCount to be a positive integer', () => {
  let fractional = admitRenderRequest({ request: request({ workerCount: 2.5 }), limits: limits() });
  assert.equal(fractional.admitted, false);
  assert.ok(fractional.rejections.some((entry) => entry.field === 'workerCount' && entry.reason === 'workerCount-invalid'));

  let nan = admitRenderRequest({ request: request({ workerCount: 'many' }), limits: limits() });
  assert.equal(nan.admitted, false);
  assert.ok(nan.rejections.some((entry) => entry.field === 'workerCount' && entry.reason === 'workerCount-invalid'));
});

test('admission binds sequential-realtime to exactly one worker', () => {
  let four = admitRenderRequest({
    request: request({ tier: 'sequential-realtime', workerCount: 4 }),
    limits: limits(),
  });
  assert.equal(four.admitted, false);
  assert.ok(four.rejections.some((entry) => entry.reason === 'sequential-realtime-single-worker'));

  let one = admitRenderRequest({
    request: request({ tier: 'sequential-realtime', workerCount: 1 }),
    limits: limits(),
  });
  assert.equal(one.admitted, true);
  assert.deepEqual(one.rejections, []);
});

test('admission rejects over-limit fps, dpr, workers, memory and storage estimates', () => {
  let verdict = admitRenderRequest({
    request: request({ fps: 120, dpr: 4, workerCount: 32, estMemoryBytes: 40_000_000_000, estStorageBytes: 500_000_000_000 }),
    limits: limits(),
  });
  assert.equal(verdict.admitted, false);
  let fields = verdict.rejections.map((entry) => entry.field);
  for (let field of ['fps', 'dpr', 'workerCount', 'estMemoryBytes', 'estStorageBytes']) {
    assert.ok(fields.includes(field), `expected rejection for ${field}`);
  }
});

test('admission fails closed when an estimate is provided without an available limit', () => {
  let verdict = admitRenderRequest({
    request: request(),
    limits: limits({ availableMemoryBytes: undefined }),
  });
  assert.equal(verdict.admitted, false);
  assert.ok(verdict.rejections.some((entry) => entry.field === 'estMemoryBytes' && entry.reason === 'estMemoryBytes-limit-missing'));
});

test('admission folds a failing worker capacity proof into the verdict', () => {
  let verdict = admitRenderRequest({
    request: request({ workerCount: 20 }),
    limits: limits({ maxWorkers: 32 }),
    capacity: {
      requestedWorkers: 20,
      totalMemoryBytes: 16_000_000_000,
      availableMemoryBytes: 16_000_000_000,
      perWorkerPeakRssBytes: 1_000_000_000,
    },
  });
  assert.equal(verdict.admitted, false);
  assert.equal(verdict.capacityProof.ok, false);
  assert.ok(verdict.rejections.some((entry) => entry.reason === 'worker-capacity-exceeded'));
});

test('admission admits when a passing capacity proof is provided', () => {
  let verdict = admitRenderRequest({
    request: request({ workerCount: 4 }),
    limits: limits(),
    capacity: {
      requestedWorkers: 4,
      totalMemoryBytes: 16_000_000_000,
      availableMemoryBytes: 16_000_000_000,
      perWorkerPeakRssBytes: 1_000_000_000,
    },
  });
  assert.equal(verdict.admitted, true);
  assert.equal(verdict.capacityProof.ok, true);
  assert.deepEqual(verdict.rejections, []);
});
