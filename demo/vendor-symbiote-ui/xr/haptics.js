const MIN_DURATION_MS = 1;
const MAX_DURATION_MS = 1000;

function defaultResolveInputSources(session) {
  return session?.inputSources ?? [];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function validateCue(cue) {
  if (cue === null || typeof cue !== 'object') {
    throw new TypeError('Haptic cue must be an object with amplitude and durationMs.');
  }
  if (typeof cue.amplitude !== 'number' || !Number.isFinite(cue.amplitude)) {
    throw new TypeError('Haptic cue amplitude must be a finite number.');
  }
  if (typeof cue.durationMs !== 'number' || !Number.isFinite(cue.durationMs)) {
    throw new TypeError('Haptic cue durationMs must be a finite number.');
  }
  return {
    amplitude: clamp(cue.amplitude, 0, 1),
    durationMs: clamp(cue.durationMs, MIN_DURATION_MS, MAX_DURATION_MS),
  };
}

/**
 * Renderer-level WebXR haptics primitive. Fires `GamepadHapticActuator.pulse`
 * only when the full capability chain exists and silently no-ops otherwise
 * (IWER, hand input sources, older runtimes). Actuator promises are caught
 * and ignored so haptics never surface errors into the session. The bridge
 * holds no listeners or timers, so no dispose is required. Cue semantics and
 * wiring stay with the consuming product.
 * @param {Object} [options]
 * @param {function} [options.resolveInputSources] session → input source array
 * @returns {{pulse: function, pulseAll: function}}
 */
export function createXRHapticsBridge({ resolveInputSources = defaultResolveInputSources } = {}) {
  if (typeof resolveInputSources !== 'function') {
    throw new TypeError('resolveInputSources must be a function.');
  }

  let pulse = (inputSource, cue) => {
    let { amplitude, durationMs } = validateCue(cue);
    let actuator = inputSource?.gamepad?.hapticActuators?.[0];
    if (typeof actuator?.pulse !== 'function') {
      return false;
    }
    let result;
    try {
      result = actuator.pulse(amplitude, durationMs);
    } catch {
      return false;
    }
    if (result && typeof result.then === 'function') {
      result.then(undefined, () => {});
    }
    return true;
  };

  return {
    pulse,

    pulseAll(session, cue) {
      let normalized = validateCue(cue);
      let inputSources = resolveInputSources(session);
      if (!Array.isArray(inputSources)) {
        throw new TypeError('resolveInputSources must return an array.');
      }
      let firedCount = 0;
      for (let inputSource of inputSources) {
        if (pulse(inputSource, normalized)) {
          firedCount += 1;
        }
      }
      return firedCount;
    },
  };
}
