function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze(obj[key]);
  }
  return obj;
}

export function createXRFrameTimingTracker(options = {}) {
  const nominalFrameRate = typeof options.nominalFrameRate === 'number' && Number.isFinite(options.nominalFrameRate)
    ? options.nominalFrameRate
    : null;

  const supportedFrameRates = Array.isArray(options.supportedFrameRates)
    ? Array.from(new Set(options.supportedFrameRates.filter(v => typeof v === 'number' && Number.isFinite(v) && v > 0))).sort((a, b) => a - b)
    : null;

  let samples = [];
  let resets = [];
  let resetSequence = 0;
  let resetCount = 0;

  const tracker = {
    getNominalFrameRate() {
      return nominalFrameRate;
    },
    getSupportedFrameRates() {
      return supportedFrameRates ? [...supportedFrameRates] : null;
    },
    getResetCount() {
      return resetCount;
    },
    recordFrame(timestampMs, { visible = true, discontinuous = false } = {}) {
      if (typeof timestampMs !== 'number' || !Number.isFinite(timestampMs)) {
        throw new Error('Timestamp must be a finite number');
      }
      const previousTimestamp = samples.length > 0 ? samples[samples.length - 1] : null;
      if (visible === false || discontinuous === true || (samples.length > 0 && timestampMs <= previousTimestamp)) {
        let reason = 'non-monotonic';
        if (visible === false) {
          reason = 'hidden';
        } else if (discontinuous === true) {
          reason = 'discontinuity';
        }
        resets.push(deepFreeze({
          sequence: ++resetSequence,
          reason,
          previousTimestamp,
          timestamp: timestampMs
        }));
        samples = [];
        resetCount++;
        if (visible === false) {
          return;
        }
      }
      samples.push(timestampMs);

      // Prune samples older than 10 seconds (10000ms)
      const cutoff = timestampMs - 10000;
      while (samples.length > 0 && samples[0] < cutoff) {
        samples.shift();
      }
    },
    getMetrics() {
      if (samples.length <= 1) {
        return deepFreeze({
          version: 'xr-frame-timing-v1',
          nominalFrameRate,
          effectiveFrameRate: 0,
          durationMs: 0,
          sampleCount: samples.length,
          meanIntervalMs: 0,
          p95IntervalMs: 0,
          maxIntervalMs: 0,
          dropRatio: 0,
          supportedFrameRates: supportedFrameRates ? [...supportedFrameRates] : null,
          resetCount,
          resets: [...resets]
        });
      }

      const intervals = [];
      for (let i = 1; i < samples.length; i++) {
        intervals.push(samples[i] - samples[i - 1]);
      }

      const durationMs = samples[samples.length - 1] - samples[0];
      const meanIntervalMs = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
      const maxIntervalMs = Math.max(...intervals);

      const sortedIntervals = [...intervals].sort((a, b) => a - b);
      const p95Idx = Math.ceil(sortedIntervals.length * 0.95) - 1;
      const p95IntervalMs = sortedIntervals[Math.max(0, p95Idx)];

      let dropRatio = 0;
      if (nominalFrameRate && nominalFrameRate > 0) {
        const nominalInterval = 1000 / nominalFrameRate;
        let totalDropped = 0;
        for (const dt of intervals) {
          const expected = Math.round(dt / nominalInterval);
          const dropped = Math.max(0, expected - 1);
          totalDropped += dropped;
        }
        const expectedIntervals = intervals.length + totalDropped;
        dropRatio = expectedIntervals > 0 ? totalDropped / expectedIntervals : 0;
      }

      const effectiveFrameRate = durationMs > 0 ? (intervals.length / (durationMs / 1000)) : 0;

      return deepFreeze({
        version: 'xr-frame-timing-v1',
        nominalFrameRate,
        effectiveFrameRate,
        durationMs,
        sampleCount: samples.length,
        meanIntervalMs,
        p95IntervalMs,
        maxIntervalMs,
        dropRatio,
        supportedFrameRates: supportedFrameRates ? [...supportedFrameRates] : null,
        resetCount,
        resets: [...resets]
      });
    }
  };

  Object.defineProperty(tracker, 'resets', {
    get() {
      return deepFreeze([...resets]);
    },
    configurable: true,
    enumerable: true
  });

  return tracker;
}
