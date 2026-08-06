import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createXRHapticsBridge } from '../xr/haptics.js';

function createInputSource({ pulse } = {}) {
  return {
    handedness: 'right',
    targetRayMode: 'tracked-pointer',
    gamepad: {
      hapticActuators: [{ pulse }],
    },
  };
}

test('pulse forwards exact amplitude and duration to the actuator', () => {
  let bridge = createXRHapticsBridge();
  let calls = [];
  let source = createInputSource({
    pulse: (amplitude, durationMs) => {
      calls.push([amplitude, durationMs]);
      return Promise.resolve(true);
    },
  });

  let fired = bridge.pulse(source, { amplitude: 0.5, durationMs: 120 });

  assert.equal(fired, true);
  assert.deepEqual(calls, [[0.5, 120]]);
});

test('pulse clamps amplitude to [0, 1] and durationMs to [1, 1000]', () => {
  let bridge = createXRHapticsBridge();
  let calls = [];
  let source = createInputSource({
    pulse: (amplitude, durationMs) => {
      calls.push([amplitude, durationMs]);
    },
  });

  bridge.pulse(source, { amplitude: 1.7, durationMs: 5000 });
  bridge.pulse(source, { amplitude: -0.4, durationMs: 0 });

  assert.deepEqual(calls, [[1, 1000], [0, 1]]);
});

test('pulse is a silent no-op without a gamepad', () => {
  let bridge = createXRHapticsBridge();
  assert.equal(bridge.pulse({ handedness: 'right' }, { amplitude: 1, durationMs: 50 }), false);
  assert.equal(bridge.pulse({ gamepad: null }, { amplitude: 1, durationMs: 50 }), false);
  assert.equal(bridge.pulse(null, { amplitude: 1, durationMs: 50 }), false);
  assert.equal(bridge.pulse(undefined, { amplitude: 1, durationMs: 50 }), false);
});

test('pulse is a silent no-op without usable actuators', () => {
  let bridge = createXRHapticsBridge();
  assert.equal(bridge.pulse({ gamepad: {} }, { amplitude: 1, durationMs: 50 }), false);
  assert.equal(
    bridge.pulse({ gamepad: { hapticActuators: [] } }, { amplitude: 1, durationMs: 50 }),
    false
  );
  assert.equal(
    bridge.pulse({ gamepad: { hapticActuators: [{}] } }, { amplitude: 1, durationMs: 50 }),
    false
  );
  assert.equal(
    bridge.pulse(
      { gamepad: { hapticActuators: [{ pulse: 'not-a-function' }] } },
      { amplitude: 1, durationMs: 50 }
    ),
    false
  );
});

test('pulse is a silent no-op for hand-like input sources', () => {
  let bridge = createXRHapticsBridge();
  let handSource = {
    handedness: 'left',
    targetRayMode: 'tracked-pointer',
    hand: {},
  };
  assert.equal(bridge.pulse(handSource, { amplitude: 1, durationMs: 50 }), false);
});

test('pulse throws TypeError on non-finite amplitude', () => {
  let bridge = createXRHapticsBridge();
  let source = createInputSource({ pulse: () => {} });
  for (let amplitude of [NaN, Infinity, -Infinity, '0.5', undefined, null]) {
    assert.throws(() => bridge.pulse(source, { amplitude, durationMs: 50 }), TypeError);
  }
});

test('pulse throws TypeError on non-finite durationMs', () => {
  let bridge = createXRHapticsBridge();
  let source = createInputSource({ pulse: () => {} });
  for (let durationMs of [NaN, Infinity, -Infinity, '50', undefined, null]) {
    assert.throws(() => bridge.pulse(source, { amplitude: 1, durationMs }), TypeError);
  }
});

test('pulseAll iterates session input sources and gates each per source', () => {
  let bridge = createXRHapticsBridge();
  let calls = [];
  let session = {
    inputSources: [
      createInputSource({
        pulse: (amplitude, durationMs) => {
          calls.push([amplitude, durationMs]);
        },
      }),
      { handedness: 'left', hand: {} },
      { handedness: 'right' },
    ],
  };

  let firedCount = bridge.pulseAll(session, { amplitude: 0.8, durationMs: 40 });

  assert.equal(firedCount, 1);
  assert.deepEqual(calls, [[0.8, 40]]);
});

test('pulseAll tolerates a session without inputSources', () => {
  let bridge = createXRHapticsBridge();
  assert.equal(bridge.pulseAll({}, { amplitude: 1, durationMs: 50 }), 0);
  assert.equal(bridge.pulseAll(null, { amplitude: 1, durationMs: 50 }), 0);
});

test('pulseAll uses the configured resolveInputSources helper', () => {
  let customSource = createInputSource({ pulse: () => {} });
  let resolveInputSources = (session) => session.extraSources ?? [];
  let bridge = createXRHapticsBridge({ resolveInputSources });

  let firedCount = bridge.pulseAll(
    { inputSources: [], extraSources: [customSource] },
    { amplitude: 1, durationMs: 50 }
  );

  assert.equal(firedCount, 1);
});

test('pulseAll throws TypeError on a non-finite cue before iterating', () => {
  let bridge = createXRHapticsBridge();
  let session = { inputSources: [createInputSource({ pulse: () => {} })] };
  assert.throws(() => bridge.pulseAll(session, { amplitude: NaN, durationMs: 50 }), TypeError);
  assert.throws(() => bridge.pulseAll(session, { amplitude: 1, durationMs: Infinity }), TypeError);
});

test('rejected actuator promises are swallowed', async () => {
  let bridge = createXRHapticsBridge();
  let source = createInputSource({
    pulse: () => Promise.reject(new Error('actuator busy')),
  });

  let fired = bridge.pulse(source, { amplitude: 1, durationMs: 50 });

  assert.equal(fired, true);
  await new Promise((resolve) => setTimeout(resolve, 0));
});

test('synchronously throwing actuators are swallowed', () => {
  let bridge = createXRHapticsBridge();
  let source = createInputSource({
    pulse: () => {
      throw new Error('non-conformant actuator');
    },
  });

  let fired = bridge.pulse(source, { amplitude: 1, durationMs: 50 });

  assert.equal(fired, false);
});

test('createXRHapticsBridge throws TypeError on a non-function resolveInputSources', () => {
  assert.throws(() => createXRHapticsBridge({ resolveInputSources: 'nope' }), TypeError);
});
