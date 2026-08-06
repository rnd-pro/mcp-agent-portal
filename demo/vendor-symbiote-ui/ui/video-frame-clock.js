/**
 * Authoritative per-frame video clock built on `requestVideoFrameCallback`.
 *
 * @module symbiote-ui/ui/video-frame-clock
 */

/**
 * @typedef {object} VideoFrameClockDetail
 * @property {number} mediaTime Presentation timestamp of the frame in media seconds.
 * @property {number} presentationTime `DOMHighResTimeStamp` when the frame was submitted.
 * @property {number} expectedDisplayTime `DOMHighResTimeStamp` the frame is expected on screen.
 * @property {number} presentedFrames Running count of frames presented to the compositor.
 * @property {number} processingDuration Elapsed decode-to-present duration in seconds.
 * @property {number} width Coded width of the presented frame.
 * @property {number} height Coded height of the presented frame.
 * @property {number} frameId Monotonic local counter, incremented once per published frame.
 */

/**
 * @typedef {object} VideoFrameClock
 * @property {() => boolean} start
 * @property {() => void} stop
 * @property {() => void} dispose
 * @property {boolean} running
 * @property {boolean} supported
 */

function toFiniteNumber(value, fallback = 0) {
  let number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function frameDetail(now, metadata, frameId) {
  let source = metadata && typeof metadata === 'object' ? metadata : {};
  return {
    mediaTime: toFiniteNumber(source.mediaTime),
    presentationTime: toFiniteNumber(source.presentationTime, toFiniteNumber(now)),
    expectedDisplayTime: toFiniteNumber(source.expectedDisplayTime),
    presentedFrames: toFiniteNumber(source.presentedFrames),
    processingDuration: toFiniteNumber(source.processingDuration),
    width: toFiniteNumber(source.width),
    height: toFiniteNumber(source.height),
    frameId,
  };
}

/**
 * @param {HTMLVideoElement} video
 * @param {{ onFrame?: (detail: VideoFrameClockDetail) => void }} [options]
 * @returns {VideoFrameClock}
 */
export function createVideoFrameClock(video, options = {}) {
  let onFrame = typeof options.onFrame === 'function' ? options.onFrame : null;
  let supported = typeof video?.requestVideoFrameCallback === 'function'
    && typeof video?.cancelVideoFrameCallback === 'function';
  let request = supported
    ? (callback) => video.requestVideoFrameCallback(callback)
    : null;
  let cancel = supported
    ? (handle) => video.cancelVideoFrameCallback(handle)
    : null;

  let running = false;
  let handle = null;
  let frameId = 0;
  // Registration identity: a stale callback delivered after stop()/restart() must
  // not publish or schedule. Every stop and start bumps the generation.
  let generation = 0;

  let schedule = (gen) => {
    handle = request((now, metadata) => {
      // A stale callback (after stop/restart) must not clear the live handle.
      if (!running || gen !== generation) return;
      handle = null;
      frameId += 1;
      // Queue the next frame before publishing so a throwing consumer cannot stall the clock.
      schedule(gen);
      onFrame?.(frameDetail(now, metadata, frameId));
    });
  };

  return {
    start() {
      if (running || !request) return false;
      running = true;
      generation += 1;
      schedule(generation);
      return true;
    },
    stop() {
      running = false;
      generation += 1;
      if (handle != null) cancel?.(handle);
      handle = null;
    },
    dispose() {
      this.stop();
      onFrame = null;
    },
    get running() {
      return running;
    },
    get supported() {
      return supported;
    },
  };
}
