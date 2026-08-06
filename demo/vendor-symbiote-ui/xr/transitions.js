function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

/**
 * Ease-out cubic easing: fast start, gentle settle. Input is clamped to
 * `[0, 1]`, so `easeOutCubic(0) === 0` and `easeOutCubic(1) === 1` exactly.
 * @param {number} t normalized time in `[0, 1]`
 * @returns {number} eased progress in `[0, 1]`
 */
export function easeOutCubic(t) {
  if (typeof t !== 'number' || !Number.isFinite(t)) {
    throw new TypeError('easeOutCubic t must be a finite number.');
  }
  let clamped = clamp01(t);
  return 1 - Math.pow(1 - clamped, 3);
}

function normalizeEndpoint(value, name) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Tween ${name} must be a finite number.`);
    }
    return { scale: value, opacity: null };
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    let scale = value.scale ?? null;
    let opacity = value.opacity ?? null;
    if (scale !== null && (typeof scale !== 'number' || !Number.isFinite(scale))) {
      throw new TypeError(`Tween ${name}.scale must be a finite number.`);
    }
    if (opacity !== null && (typeof opacity !== 'number' || !Number.isFinite(opacity))) {
      throw new TypeError(`Tween ${name}.opacity must be a finite number.`);
    }
    if (scale === null && opacity === null) {
      throw new TypeError(`Tween ${name} must declare scale, opacity, or both.`);
    }
    return { scale, opacity };
  }
  throw new TypeError(`Tween ${name} must be a finite number or an object with scale/opacity.`);
}

function writeScale(target, value) {
  if (typeof target.set === 'function') {
    target.set(value, value, value);
    return;
  }
  target.x = value;
  target.y = value;
  target.z = value;
}

/**
 * Renderer-level scale/fade tween for XR session visuals. The tween carries
 * no timers: the owning session frame loop pumps `tick(now)` with the frame
 * timestamp, and the first tick anchors the tween start time. `from` is
 * applied synchronously at creation so the first pumped frame never flashes
 * the pre-tween value; the final tick writes the exact `to` endpoints and
 * then calls `onDone` exactly once. Writes are limited to `object.scale`
 * (uniform x/y/z) and `object.material.opacity` on the given object — roots,
 * poses, and shared materials are never touched. `cancel()` settles the
 * tween silently: no further writes and no `onDone`. `reapply()` re-writes
 * the last eased values after external code reset them (the Three adapter
 * rewrites mesh scale on every store sync); it no-ops once settled.
 * @param {Object} options
 * @param {Object} options.object target with `scale` and/or `material`
 * @param {number} options.durationMs tween length in milliseconds (`>= 0`)
 * @param {number|{scale?: number, opacity?: number}} options.from start endpoint
 * @param {number|{scale?: number, opacity?: number}} options.to final endpoint
 * @param {function} [options.onDone] called once when the tween completes
 * @returns {{tick: function, cancel: function, reapply: function, isDone: function, isCancelled: function}}
 */
export function createXRScaleFadeTween({ object, durationMs, from, to, onDone } = {}) {
  if (!object || typeof object !== 'object') {
    throw new TypeError('Tween object must be an object with scale and/or material.');
  }
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) {
    throw new TypeError('Tween durationMs must be a finite number >= 0.');
  }
  if (onDone !== undefined && typeof onDone !== 'function') {
    throw new TypeError('Tween onDone must be a function.');
  }
  let fromEndpoint = normalizeEndpoint(from, 'from');
  let toEndpoint = normalizeEndpoint(to, 'to');
  let scaleChannel = fromEndpoint.scale !== null || toEndpoint.scale !== null;
  let opacityChannel = fromEndpoint.opacity !== null || toEndpoint.opacity !== null;
  if (scaleChannel && (fromEndpoint.scale === null || toEndpoint.scale === null)) {
    throw new TypeError('Tween scale must be declared on both from and to endpoints.');
  }
  if (opacityChannel && (fromEndpoint.opacity === null || toEndpoint.opacity === null)) {
    throw new TypeError('Tween opacity must be declared on both from and to endpoints.');
  }
  if (scaleChannel && (!object.scale || typeof object.scale !== 'object')) {
    throw new TypeError('Tween object.scale must be an object when a scale tween is requested.');
  }
  if (opacityChannel && (!object.material || typeof object.material !== 'object' || Array.isArray(object.material))) {
    throw new TypeError('Tween object.material must be a single material object when an opacity tween is requested.');
  }

  let startTime = null;
  let settled = false;
  let done = false;
  let cancelled = false;
  let lastEased = 0;

  let apply = (eased) => {
    lastEased = eased;
    if (scaleChannel) {
      writeScale(object.scale, fromEndpoint.scale + (toEndpoint.scale - fromEndpoint.scale) * eased);
    }
    if (opacityChannel) {
      object.material.opacity = fromEndpoint.opacity + (toEndpoint.opacity - fromEndpoint.opacity) * eased;
    }
  };

  apply(0);

  return {
    tick(now) {
      if (settled) {
        return true;
      }
      if (typeof now !== 'number' || !Number.isFinite(now)) {
        throw new TypeError('Tween tick time must be a finite number.');
      }
      if (startTime === null) {
        startTime = now;
      }
      let elapsed = Math.max(0, now - startTime);
      let t = durationMs === 0 ? 1 : Math.min(1, elapsed / durationMs);
      if (t >= 1) {
        settled = true;
        done = true;
        if (scaleChannel) {
          writeScale(object.scale, toEndpoint.scale);
        }
        if (opacityChannel) {
          object.material.opacity = toEndpoint.opacity;
        }
        onDone?.();
        return true;
      }
      apply(easeOutCubic(t));
      return false;
    },

    cancel() {
      if (settled) {
        return;
      }
      settled = true;
      cancelled = true;
    },

    reapply() {
      if (settled) {
        return;
      }
      apply(lastEased);
    },

    isDone() {
      return done;
    },

    isCancelled() {
      return cancelled;
    },
  };
}
