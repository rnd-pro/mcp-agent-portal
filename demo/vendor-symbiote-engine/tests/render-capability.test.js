import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  RENDER_ACCELERATION_PROBES,
  RENDER_ACCELERATION_ROLES,
  RENDER_CAPABILITY_CONTRACT_VERSION,
  RENDER_DIAGNOSTIC_SURFACES,
  RENDER_EXECUTION_TIERS,
  accelerationCandidateProven,
  normalizeAccelerationCandidate,
  normalizeAccelerationSelection,
  normalizeCapabilityRequest,
  normalizeExecutionTier,
} from '../contracts/render-capability.js';

test('execution tiers keep the binding taxonomy and reject anything else', () => {
  assert.deepEqual(RENDER_EXECUTION_TIERS, [
    'sequential-realtime',
    'replayable-segment',
    'checkpointed-deterministic',
  ]);
  assert.deepEqual(RENDER_ACCELERATION_ROLES, ['renderer', 'encoder']);
  assert.deepEqual(RENDER_DIAGNOSTIC_SURFACES, ['screenshot', 'passive-cdp']);
  assert.ok(Object.isFrozen(RENDER_ACCELERATION_PROBES) && RENDER_ACCELERATION_PROBES.includes('renderer-identity') && RENDER_ACCELERATION_PROBES.includes('real-encode'));
  assert.equal(normalizeExecutionTier('sequential-realtime'), 'sequential-realtime');
  assert.throws(() => normalizeExecutionTier('parallel'), /executionTier: must be one of/);
  assert.throws(() => normalizeExecutionTier(''), /must be one of/);
});

test('renderer candidate normalizes and preserves proven identity evidence', () => {
  let candidate = normalizeAccelerationCandidate({
    id: 'vaapi-render',
    backend: 'vaapi',
    deviceNode: '/dev/dri/renderD128',
    driver: 'iHD',
    driverVersion: '23.1',
    available: true,
    evidence: { probe: 'renderer-identity', rendererIdentity: 'Mesa Intel', detail: 'glGetString' },
  }, 'renderer');

  assert.deepEqual(candidate, {
    id: 'vaapi-render',
    role: 'renderer',
    backend: 'vaapi',
    available: true,
    evidence: { probe: 'renderer-identity', detail: 'glGetString', rendererIdentity: 'Mesa Intel' },
    deviceNode: '/dev/dri/renderD128',
    driver: 'iHD',
    driverVersion: '23.1',
  });
});

test('a device-present candidate stays unavailable without implying usability', () => {
  let candidate = normalizeAccelerationCandidate({
    id: 'idle-gpu',
    backend: 'vaapi',
    deviceNode: '/dev/dri/renderD128',
    available: false,
    evidence: { probe: 'device-present' },
  }, 'renderer');

  assert.equal(candidate.available, false);
  assert.equal(candidate.deviceNode, '/dev/dri/renderD128');
  assert.equal(candidate.evidence.probe, 'device-present');
});

test('available must be an explicit boolean and evidence probe is validated', () => {
  assert.throws(
    () => normalizeAccelerationCandidate({
      id: 'x', backend: 'vaapi', evidence: { probe: 'renderer-identity' },
    }, 'renderer'),
    /available: must be an explicit boolean/,
  );
  assert.throws(
    () => normalizeAccelerationCandidate({
      id: 'x', backend: 'vaapi', available: 'yes', evidence: { probe: 'renderer-identity' },
    }, 'renderer'),
    /available: must be an explicit boolean/,
  );
  assert.throws(
    () => normalizeAccelerationCandidate({
      id: 'x', backend: 'vaapi', available: true, evidence: { probe: 'proven' },
    }, 'renderer'),
    /evidence\.probe: must be one of/,
  );
  assert.throws(
    () => normalizeAccelerationCandidate({
      id: 'x', role: 'encoder', backend: 'vaapi', available: true, evidence: { probe: 'real-encode' },
    }, 'renderer'),
    /role: must equal "renderer"/,
  );
});

test('encoder candidate carries codec/container/pixelFormat metadata', () => {
  let candidate = normalizeAccelerationCandidate({
    id: 'vaapi-h264-enc',
    backend: 'vaapi',
    available: true,
    codec: 'h264',
    container: 'mp4',
    pixelFormat: 'nv12',
    evidence: { probe: 'real-encode', encodeOk: true },
  }, 'encoder');

  assert.equal(candidate.codec, 'h264');
  assert.equal(candidate.container, 'mp4');
  assert.equal(candidate.pixelFormat, 'nv12');
  assert.equal(candidate.evidence.encodeOk, true);
});

test('acceleration proven predicate gates a renderer on identity evidence', () => {
  let proven = normalizeAccelerationCandidate({
    id: 'radv', backend: 'radv', available: true,
    evidence: { probe: 'renderer-identity', rendererIdentity: 'AMD RADV' },
  }, 'renderer');
  assert.equal(accelerationCandidateProven(proven), true);

  // available but only device-present -> not proven.
  assert.equal(accelerationCandidateProven(normalizeAccelerationCandidate({
    id: 'idle', backend: 'radv', available: true, evidence: { probe: 'device-present' },
  }, 'renderer')), false);

  // renderer-identity probe but empty identity -> not proven.
  assert.equal(accelerationCandidateProven({
    id: 'x', role: 'renderer', backend: 'radv', available: true,
    evidence: { probe: 'renderer-identity', rendererIdentity: '' },
  }), false);

  // unavailable device -> not proven even with identity.
  assert.equal(accelerationCandidateProven(normalizeAccelerationCandidate({
    id: 'x', backend: 'radv', available: false,
    evidence: { probe: 'renderer-identity', rendererIdentity: 'AMD RADV' },
  }, 'renderer')), false);
});

test('acceleration proven predicate gates an encoder on a real encode', () => {
  let proven = normalizeAccelerationCandidate({
    id: 'nvenc', backend: 'nvenc', codec: 'h264', available: true,
    evidence: { probe: 'real-encode', encodeOk: true },
  }, 'encoder');
  assert.equal(accelerationCandidateProven(proven), true);

  // encodeOk explicitly false -> not proven.
  assert.equal(accelerationCandidateProven(normalizeAccelerationCandidate({
    id: 'nvenc', backend: 'nvenc', available: true,
    evidence: { probe: 'real-encode', encodeOk: false },
  }, 'encoder')), false);

  // real-encode probe without an encodeOk result -> not proven.
  assert.equal(accelerationCandidateProven(normalizeAccelerationCandidate({
    id: 'nvenc', backend: 'nvenc', available: true, evidence: { probe: 'real-encode' },
  }, 'encoder')), false);

  // encoder measured with a renderer probe -> not proven.
  assert.equal(accelerationCandidateProven({
    id: 'nvenc', role: 'encoder', backend: 'nvenc', available: true,
    evidence: { probe: 'renderer-identity', rendererIdentity: 'nvidia' },
  }), false);

  assert.equal(accelerationCandidateProven(null), false);
  assert.equal(accelerationCandidateProven({ role: 'other', available: true, evidence: { probe: 'real-encode', encodeOk: true } }), false);
});

test('capability request normalizes both roles with explicit fallback flags', () => {
  let request = normalizeCapabilityRequest({
    tier: 'checkpointed-deterministic',
    renderer: { requiredBackend: 'vaapi', allowFallback: false },
    encoder: { requiredBackend: 'vaapi', requiredCodec: 'h264', allowFallback: true },
  });

  assert.deepEqual(request, {
    version: RENDER_CAPABILITY_CONTRACT_VERSION,
    tier: 'checkpointed-deterministic',
    renderer: { allowFallback: false, requiredBackend: 'vaapi' },
    encoder: { allowFallback: true, requiredBackend: 'vaapi', requiredCodec: 'h264' },
  });
  assert.throws(
    () => normalizeCapabilityRequest({ tier: 'sequential-realtime', renderer: {}, encoder: { allowFallback: true } }),
    /renderer\.allowFallback: must be an explicit boolean/,
  );
  assert.throws(
    () => normalizeCapabilityRequest({ tier: 'sequential-realtime', renderer: { allowFallback: true }, encoder: { allowFallback: true }, version: 'render-capability/9' }),
    /version: must equal/,
  );
});

test('acceleration selection receipt validates structure and folds in request defaults', () => {
  let request = {
    tier: 'replayable-segment',
    renderer: { requiredBackend: 'vaapi', allowFallback: false },
    encoder: { requiredBackend: 'vaapi', requiredCodec: 'h264', allowFallback: false },
  };
  let receipt = normalizeAccelerationSelection({
    ok: false,
    renderer: {
      selected: {
        id: 'vaapi-render', backend: 'vaapi', available: true,
        evidence: { probe: 'renderer-identity', rendererIdentity: 'Mesa' },
      },
      fallbackUsed: false,
    },
    encoder: { selected: null, fallbackUsed: false },
    rejections: [
      { role: 'encoder', candidateId: 'idle-enc', backend: 'vaapi', reason: 'device-present-but-unproven' },
    ],
  }, { request });

  assert.equal(receipt.version, RENDER_CAPABILITY_CONTRACT_VERSION);
  assert.equal(receipt.tier, 'replayable-segment');
  assert.equal(receipt.ok, false);
  assert.equal(receipt.renderer.selected.id, 'vaapi-render');
  assert.deepEqual(receipt.renderer.requested, { allowFallback: false, requiredBackend: 'vaapi' });
  assert.equal(receipt.encoder.selected, null);
  assert.deepEqual(receipt.rejections, [
    { role: 'encoder', candidateId: 'idle-enc', backend: 'vaapi', reason: 'device-present-but-unproven' },
  ]);
});

test('acceleration selection requires an explicit fallbackUsed flag and rejection reason', () => {
  let request = {
    tier: 'replayable-segment',
    renderer: { allowFallback: true },
    encoder: { allowFallback: true },
  };
  assert.throws(
    () => normalizeAccelerationSelection({
      renderer: { selected: null },
      encoder: { selected: null, fallbackUsed: false },
    }, { request }),
    /renderer\.fallbackUsed: must be an explicit boolean/,
  );
  assert.throws(
    () => normalizeAccelerationSelection({
      renderer: { selected: null, fallbackUsed: false },
      encoder: { selected: null, fallbackUsed: false },
      rejections: [{ role: 'renderer', candidateId: 'x' }],
    }, { request }),
    /rejections\[0\]\.reason: is required/,
  );
});
