import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RENDER_CAPABILITY_CONTRACT_VERSION } from '../contracts/render-capability.js';
import { RENDER_SELECTION_VERSION, selectRenderAcceleration } from '../render-selection.js';

function rendererCandidate(overrides = {}) {
  return {
    id: 'renderer-1',
    role: 'renderer',
    backend: 'vaapi',
    available: true,
    evidence: { probe: 'renderer-identity', rendererIdentity: 'Mesa Intel' },
    ...overrides,
  };
}

function encoderCandidate(overrides = {}) {
  return {
    id: 'encoder-1',
    role: 'encoder',
    backend: 'vaapi',
    codec: 'h264',
    available: true,
    evidence: { probe: 'real-encode', encodeOk: true },
    ...overrides,
  };
}

test('selection re-exports the contract version and selects proven candidates', () => {
  assert.equal(RENDER_SELECTION_VERSION, RENDER_CAPABILITY_CONTRACT_VERSION);
  let selection = selectRenderAcceleration({
    request: {
      tier: 'replayable-segment',
      renderer: { requiredBackend: 'vaapi', allowFallback: false },
      encoder: { requiredBackend: 'vaapi', requiredCodec: 'h264', allowFallback: false },
    },
    rendererCandidates: [rendererCandidate()],
    encoderCandidates: [encoderCandidate()],
  });
  assert.equal(selection.version, RENDER_CAPABILITY_CONTRACT_VERSION);
  assert.equal(selection.ok, true);
  assert.equal(selection.renderer.selected.id, 'renderer-1');
  assert.equal(selection.renderer.fallbackUsed, false);
  assert.equal(selection.encoder.selected.id, 'encoder-1');
  assert.deepEqual(selection.rejections, []);
});

test('selection never treats a present-but-unproven device as usable', () => {
  let selection = selectRenderAcceleration({
    request: {
      tier: 'sequential-realtime',
      renderer: { requiredBackend: 'vaapi', allowFallback: false },
      encoder: { allowFallback: false },
    },
    rendererCandidates: [
      rendererCandidate({ id: 'device-only', available: false, deviceNode: '/dev/dri/renderD128', evidence: { probe: 'device-present' } }),
    ],
    encoderCandidates: [encoderCandidate()],
  });
  assert.equal(selection.ok, false);
  assert.equal(selection.renderer.selected, null);
  let reasons = selection.rejections.filter((entry) => entry.role === 'renderer').map((entry) => entry.reason);
  assert.ok(reasons.includes('device-present-but-unproven'));
  assert.ok(reasons.includes('required-backend-unavailable'));
});

test('selection rejects a required backend with no proven candidate and no fallback', () => {
  let selection = selectRenderAcceleration({
    request: {
      tier: 'sequential-realtime',
      renderer: { requiredBackend: 'nvenc', allowFallback: false },
      encoder: { allowFallback: false },
    },
    rendererCandidates: [rendererCandidate({ backend: 'vaapi' })],
    encoderCandidates: [encoderCandidate()],
  });
  assert.equal(selection.ok, false);
  assert.equal(selection.renderer.selected, null);
  assert.equal(selection.renderer.fallbackUsed, false);
  assert.ok(selection.rejections.some((entry) => entry.role === 'renderer' && entry.reason === 'no-fallback-allowed'));
});

test('selection uses an explicit fallback only when allowed and records the requested rejection', () => {
  let selection = selectRenderAcceleration({
    request: {
      tier: 'sequential-realtime',
      renderer: { requiredBackend: 'nvenc', allowFallback: true },
      encoder: { allowFallback: false },
    },
    rendererCandidates: [rendererCandidate({ id: 'vaapi-proven', backend: 'vaapi' })],
    encoderCandidates: [encoderCandidate()],
  });
  assert.equal(selection.ok, true);
  assert.equal(selection.renderer.selected.id, 'vaapi-proven');
  assert.equal(selection.renderer.fallbackUsed, true);
  assert.ok(selection.rejections.some((entry) => entry.role === 'renderer' && entry.reason === 'required-backend-unavailable'));
});

test('selection reports no-fallback-allowed when a proven alternative exists but fallback is disallowed', () => {
  let selection = selectRenderAcceleration({
    request: {
      tier: 'sequential-realtime',
      renderer: { allowFallback: false },
      encoder: { requiredBackend: 'vaapi', requiredCodec: 'av1', allowFallback: false },
    },
    rendererCandidates: [rendererCandidate()],
    encoderCandidates: [encoderCandidate({ codec: 'h264' })],
  });
  assert.equal(selection.ok, false);
  assert.equal(selection.encoder.selected, null);
  assert.equal(selection.encoder.fallbackUsed, false);
  assert.ok(selection.rejections.some((entry) => entry.role === 'encoder' && entry.reason === 'no-fallback-allowed'));
});

test('selection never selects an encoder whose real-encode probe reports encodeOk false', () => {
  let selection = selectRenderAcceleration({
    request: {
      tier: 'sequential-realtime',
      renderer: { allowFallback: false },
      encoder: { requiredBackend: 'vaapi', requiredCodec: 'h264', allowFallback: false },
    },
    rendererCandidates: [rendererCandidate()],
    encoderCandidates: [encoderCandidate({ evidence: { probe: 'real-encode', encodeOk: false } })],
  });
  assert.equal(selection.ok, false);
  assert.equal(selection.encoder.selected, null);
  let reasons = selection.rejections.filter((entry) => entry.role === 'encoder').map((entry) => entry.reason);
  assert.ok(reasons.includes('evidence-insufficient'));
});

test('selection never selects a renderer whose identity probe is missing the renderer identity', () => {
  let selection = selectRenderAcceleration({
    request: {
      tier: 'sequential-realtime',
      renderer: { requiredBackend: 'vaapi', allowFallback: false },
      encoder: { allowFallback: false },
    },
    rendererCandidates: [rendererCandidate({ evidence: { probe: 'renderer-identity', rendererIdentity: '' } })],
    encoderCandidates: [encoderCandidate()],
  });
  assert.equal(selection.ok, false);
  assert.equal(selection.renderer.selected, null);
  let reasons = selection.rejections.filter((entry) => entry.role === 'renderer').map((entry) => entry.reason);
  assert.ok(reasons.includes('evidence-insufficient'));
});

test('selection surfaces codec-mismatch when it falls back to another proven codec', () => {
  let selection = selectRenderAcceleration({
    request: {
      tier: 'sequential-realtime',
      renderer: { allowFallback: false },
      encoder: { requiredCodec: 'av1', allowFallback: true },
    },
    rendererCandidates: [rendererCandidate()],
    encoderCandidates: [encoderCandidate({ id: 'h264-proven', codec: 'h264' })],
  });
  assert.equal(selection.ok, true);
  assert.equal(selection.encoder.selected.id, 'h264-proven');
  assert.equal(selection.encoder.fallbackUsed, true);
  assert.ok(selection.rejections.some((entry) => entry.role === 'encoder' && entry.reason === 'codec-mismatch'));
});
