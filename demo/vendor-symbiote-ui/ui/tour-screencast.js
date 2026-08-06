const DEFAULT_TAIL_MS = 320;

function abortError() {
  if (typeof DOMException !== 'undefined') return new DOMException('Aborted', 'AbortError');
  let error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function wait(ms, signal) {
  let duration = Number.isFinite(Number(ms)) ? Math.max(0, Number(ms)) : 0;
  if (!duration) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    let timer = setTimeout(resolve, duration);
    if (!signal?.addEventListener) return;
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(abortError());
    }, { once: true });
  });
}

function withAbort(promise, signal) {
  if (!signal?.addEventListener) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(abortError()), { once: true });
    }),
  ]);
}

/**
 * Record a real browser screencast around a live UI action.
 *
 * `recorder.start()` is intentionally awaited before `play()` is called so the
 * browser capture picker is opened from the user's action before playback begins.
 *
 * @param {object} options
 * @param {object} options.recorder ScreencastRecorder-compatible instance.
 * @param {() => Promise<any>|any} options.play Live playback/action to record.
 * @param {object} [options.startOptions] Options forwarded to recorder.start().
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.tailMs]
 * @returns {Promise<{value:any, recording:any}>}
 */
export async function recordTourScreencast({
  recorder,
  play,
  startOptions = {},
  signal = null,
  tailMs = DEFAULT_TAIL_MS,
  stopReason = 'tour-screencast',
} = {}) {
  if (!recorder || typeof recorder.start !== 'function' || typeof recorder.stop !== 'function') {
    throw new TypeError('recordTourScreencast requires a ScreencastRecorder-compatible recorder.');
  }
  if (typeof play !== 'function') {
    throw new TypeError('recordTourScreencast requires a play callback.');
  }
  if (signal?.aborted) throw abortError();

  let started = false;
  try {
    await recorder.start({
      reason: 'tour-screencast',
      ...startOptions,
      signal,
    });
    started = true;
    let value = await withAbort(Promise.resolve().then(() => play(recorder)), signal);
    await wait(tailMs, signal);
    let recording = await recorder.stop(stopReason);
    started = false;
    return { value, recording };
  } catch (error) {
    if (started) {
      let reason = error?.name === 'AbortError' ? 'tour-screencast-abort' : 'tour-screencast-error';
      try { await recorder.stop(reason); } catch {}
    }
    throw error;
  }
}
