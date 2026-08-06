/**
 * Bounded precision video decoder for scrub/frame-step windows. Receives
 * already-demuxed chunks; never fetches or parses media.
 *
 * @module symbiote-ui/ui/precision-video-decoder
 */

const DEFAULT_MAX_INPUT_CHUNKS = 240;
const DEFAULT_MAX_DECODE_QUEUE_SIZE = 8;
const DEFAULT_MAX_DECODED_BYTES = 64 * 1024 * 1024;

/**
 * @property {string} code One of `webcodecs-unavailable`, `invalid-config`,
 *   `empty-input`, `input-window-exceeded`, `missing-key-chunk`,
 *   `unsupported-config`, `no-frame-decoded`, `decoded-bytes-exceeded`,
 *   `decoder-error`, `render-callback-error`, `aborted`, `disposed`.
 * @property {object} diagnostics
 */
export class PrecisionVideoDecodeError extends Error {
  constructor(code, message, diagnostics = {}) {
    super(message);
    this.name = 'PrecisionVideoDecodeError';
    this.code = code;
    this.diagnostics = diagnostics;
    if (diagnostics.cause !== undefined) this.cause = diagnostics.cause;
  }
}

/**
 * @param {object} [options]
 * @returns {{ supported: boolean, videoDecoder: boolean, encodedVideoChunk: boolean, secureContext: boolean|null }}
 */
export function getPrecisionVideoDecodeSupport(options = {}) {
  let VideoDecoderCtor = options.VideoDecoder ?? globalThis.VideoDecoder;
  let EncodedVideoChunkCtor = options.EncodedVideoChunk ?? globalThis.EncodedVideoChunk;
  let videoDecoder = typeof VideoDecoderCtor === 'function';
  let encodedVideoChunk = typeof EncodedVideoChunkCtor === 'function';
  let secureContext = options.secureContext
    ?? (typeof globalThis.isSecureContext === 'boolean' ? globalThis.isSecureContext : null);
  return {
    supported: videoDecoder && encodedVideoChunk && secureContext !== false,
    videoDecoder,
    encodedVideoChunk,
    secureContext,
  };
}

function positiveInteger(value, fallback) {
  let number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function makeSignalPromise(signal) {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener('abort', () => resolve(), { once: true });
  });
}

// Cancelable dequeue waiter: the listener is removed on every race exit.
function makeDequeueWaiter(decoder) {
  if (typeof decoder.addEventListener !== 'function') {
    return { promise: Promise.resolve(), cancel() {} };
  }
  let onDequeue;
  let promise = new Promise((resolve) => {
    onDequeue = () => resolve();
    decoder.addEventListener('dequeue', onDequeue);
  });
  return {
    promise,
    cancel() {
      decoder.removeEventListener('dequeue', onDequeue);
    },
  };
}

function frameBytesOf(frame, config) {
  if (typeof frame.allocationSize === 'function') {
    let size = Number(frame.allocationSize());
    if (Number.isFinite(size) && size >= 0) return size;
  }
  let width = Number(frame.codedWidth ?? frame.displayWidth ?? config.codedWidth ?? 0);
  let height = Number(frame.codedHeight ?? frame.displayHeight ?? config.codedHeight ?? 0);
  return Math.max(0, width * height * 4);
}

/**
 * @typedef {object} PrecisionDecodeRequest
 * @property {VideoDecoderConfig} config Already demuxed decoder configuration.
 * @property {Array<EncodedVideoChunk|EncodedVideoChunkInit>} chunks Window starting at a key chunk.
 * @property {number} targetTimestamp Presentation timestamp (chunk unit) to resolve.
 * @property {AbortSignal} [signal] Cancellation; a newer request also supersedes an older one.
 * @property {(frame: VideoFrame) => unknown} [onFrame] Consumer of the borrowed frame; closed after this resolves.
 */

/**
 * @typedef {object} PrecisionDecodeResult
 * @property {'ok'} status
 * @property {number} timestamp
 * @property {number} targetTimestamp
 * @property {boolean} deliveredFrame
 * @property {number} decodedFrames
 * @property {number} width
 * @property {number} height
 * @property {number} decodedBytes
 * @property {number} peakRetainedBytes
 */

/**
 * @param {object} [options]
 * @returns {{ decodeFrame: (request: PrecisionDecodeRequest) => Promise<PrecisionDecodeResult>, dispose: () => void, diagnostics: object }}
 */
export function createPrecisionVideoDecoder(options = {}) {
  let VideoDecoderCtor = options.VideoDecoder ?? globalThis.VideoDecoder;
  let EncodedVideoChunkCtor = options.EncodedVideoChunk ?? globalThis.EncodedVideoChunk;
  let maxInputChunks = positiveInteger(options.maxInputChunks, DEFAULT_MAX_INPUT_CHUNKS);
  let maxDecodeQueueSize = positiveInteger(options.maxDecodeQueueSize, DEFAULT_MAX_DECODE_QUEUE_SIZE);
  let maxDecodedBytes = positiveInteger(options.maxDecodedBytes, DEFAULT_MAX_DECODED_BYTES);

  let disposed = false;
  let activeController = null;
  let framesProduced = 0;
  let framesClosed = 0;
  let decodesRun = 0;
  let peakRetainedFrames = 0;
  let peakRetainedBytes = 0;

  async function runJob(request) {
    let config = request.config;
    let chunks = Array.isArray(request.chunks) ? request.chunks : null;
    let targetTimestamp = Number(request.targetTimestamp);
    let onFrame = typeof request.onFrame === 'function' ? request.onFrame : null;

    if (typeof VideoDecoderCtor !== 'function' || typeof EncodedVideoChunkCtor !== 'function') {
      throw new PrecisionVideoDecodeError('webcodecs-unavailable', 'WebCodecs VideoDecoder is not available.', {
        videoDecoder: typeof VideoDecoderCtor === 'function',
        encodedVideoChunk: typeof EncodedVideoChunkCtor === 'function',
      });
    }
    if (!config || typeof config.codec !== 'string' || !config.codec) {
      throw new PrecisionVideoDecodeError('invalid-config', 'A decoder config with a codec string is required.', {
        config: config ?? null,
      });
    }
    if (!chunks || chunks.length === 0) {
      throw new PrecisionVideoDecodeError('empty-input', 'At least one encoded chunk is required.', { chunkCount: 0 });
    }
    if (chunks.length > maxInputChunks) {
      throw new PrecisionVideoDecodeError('input-window-exceeded', 'Encoded input window exceeds the bound.', {
        chunkCount: chunks.length,
        maxInputChunks,
      });
    }
    if (chunks[0]?.type !== 'key') {
      throw new PrecisionVideoDecodeError('missing-key-chunk', 'Decode must begin with a key chunk.', {
        firstChunkType: chunks[0]?.type ?? null,
      });
    }
    if (!Number.isFinite(targetTimestamp)) {
      throw new PrecisionVideoDecodeError('invalid-config', 'A finite targetTimestamp is required.', {
        targetTimestamp: request.targetTimestamp ?? null,
      });
    }

    // Register and supersede before the async support probe so overlapping requests
    // are ordered deterministically and an older request can never replace a newer one.
    let internal = new AbortController();
    let signal = internal.signal;
    let externalSignal = request.signal;
    let onExternalAbort = () => internal.abort(externalSignal?.reason);
    if (externalSignal) {
      if (externalSignal.aborted) internal.abort(externalSignal.reason);
      else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
    activeController?.abort(new PrecisionVideoDecodeError('aborted', 'Superseded by a newer decode request.', {}));
    activeController = internal;

    let abortPromise = makeSignalPromise(signal);
    let resolveError;
    let errorPromise = new Promise((resolve) => {
      resolveError = resolve;
    });
    errorPromise.catch(() => {});

    let openFrames = new Set();
    let frameBytes = new Map();
    let retainedBytes = 0;
    let jobPeakRetainedBytes = 0;
    let candidate = null;
    let decoderError = null;
    let byteOverflow = false;
    let producedInJob = 0;
    let decoder = null;

    let closeFrame = (frame) => {
      if (!frame || !openFrames.has(frame)) return;
      openFrames.delete(frame);
      retainedBytes = Math.max(0, retainedBytes - (frameBytes.get(frame) || 0));
      frameBytes.delete(frame);
      try {
        frame.close();
      } catch {
        // Best-effort resource release.
      }
      framesClosed += 1;
    };

    let throwIfInterrupted = () => {
      if (signal.aborted) {
        throw new PrecisionVideoDecodeError('aborted', 'Decode request was aborted.', {});
      }
      if (byteOverflow) {
        throw new PrecisionVideoDecodeError('decoded-bytes-exceeded', 'Retained decoded frames exceed the byte bound.', {
          peakRetainedBytes: jobPeakRetainedBytes,
          maxDecodedBytes,
        });
      }
      if (decoderError) {
        throw new PrecisionVideoDecodeError('decoder-error', 'The video decoder reported an error.', {
          cause: decoderError,
        });
      }
    };

    try {
      throwIfInterrupted();
      let support = await VideoDecoderCtor.isConfigSupported(config);
      throwIfInterrupted();
      if (!support?.supported) {
        throw new PrecisionVideoDecodeError('unsupported-config', 'The decoder config is not supported.', {
          config,
          support: support ?? null,
        });
      }

      decoder = new VideoDecoderCtor({
        output: (frame) => {
          framesProduced += 1;
          producedInJob += 1;
          let bytes = frameBytesOf(frame, config);
          openFrames.add(frame);
          frameBytes.set(frame, bytes);
          retainedBytes += bytes;
          jobPeakRetainedBytes = Math.max(jobPeakRetainedBytes, retainedBytes);
          peakRetainedFrames = Math.max(peakRetainedFrames, openFrames.size);
          peakRetainedBytes = Math.max(peakRetainedBytes, retainedBytes);
          if (signal.aborted || decoderError || byteOverflow) {
            closeFrame(frame);
            return;
          }
          // Bound cumulative retained bytes, including this transient frame while a
          // candidate is still held. On overflow, drop every retained frame.
          if (retainedBytes > maxDecodedBytes) {
            byteOverflow = true;
            closeFrame(frame);
            if (candidate) {
              closeFrame(candidate);
              candidate = null;
            }
            resolveError();
            return;
          }
          if (candidate == null) {
            candidate = frame;
            return;
          }
          if (Number(frame.timestamp) <= targetTimestamp) {
            closeFrame(candidate);
            candidate = frame;
          } else {
            closeFrame(frame);
          }
        },
        error: (error) => {
          decoderError = error;
          resolveError();
        },
      });
      let toChunk = (chunk) => (chunk instanceof EncodedVideoChunkCtor ? chunk : new EncodedVideoChunkCtor(chunk));

      decodesRun += 1;
      decoder.configure(config);

      for (let chunk of chunks) {
        throwIfInterrupted();
        while (
          (decoder.decodeQueueSize || 0) >= maxDecodeQueueSize
          && typeof decoder.addEventListener === 'function'
          && !signal.aborted
          && !decoderError
          && !byteOverflow
        ) {
          let waiter = makeDequeueWaiter(decoder);
          try {
            await Promise.race([waiter.promise, abortPromise, errorPromise]);
          } finally {
            waiter.cancel();
          }
        }
        throwIfInterrupted();
        decoder.decode(toChunk(chunk));
      }

      await Promise.race([decoder.flush(), abortPromise, errorPromise]);
      throwIfInterrupted();

      if (!candidate) {
        throw new PrecisionVideoDecodeError('no-frame-decoded', 'No frame was produced for the target window.', {
          targetTimestamp,
        });
      }

      let width = Number(candidate.codedWidth ?? candidate.displayWidth ?? config.codedWidth ?? 0);
      let height = Number(candidate.codedHeight ?? candidate.displayHeight ?? config.codedHeight ?? 0);
      let decodedBytes = frameBytes.get(candidate) ?? frameBytesOf(candidate, config);
      let timestamp = Number(candidate.timestamp);

      if (onFrame) {
        try {
          await onFrame(candidate);
        } catch (cause) {
          throw new PrecisionVideoDecodeError('render-callback-error', 'The frame consumer callback failed.', {
            cause,
          });
        }
      }

      return {
        status: 'ok',
        timestamp,
        targetTimestamp,
        deliveredFrame: true,
        decodedFrames: producedInJob,
        width,
        height,
        decodedBytes,
        peakRetainedBytes: jobPeakRetainedBytes,
      };
    } finally {
      closeFrame(candidate);
      for (let frame of Array.from(openFrames)) closeFrame(frame);
      try {
        if (decoder && decoder.state !== 'closed') decoder.close();
      } catch {
        // Best-effort decoder release.
      }
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
      if (activeController === internal) activeController = null;
    }
  }

  return {
    decodeFrame(request = {}) {
      if (disposed) {
        return Promise.reject(
          new PrecisionVideoDecodeError('disposed', 'The precision decoder has been disposed.', {}),
        );
      }
      return runJob(request);
    },
    dispose() {
      disposed = true;
      activeController?.abort(new PrecisionVideoDecodeError('aborted', 'The precision decoder was disposed.', {}));
      activeController = null;
    },
    get diagnostics() {
      return {
        framesProduced,
        framesClosed,
        decodesRun,
        peakRetainedFrames,
        peakRetainedBytes,
        disposed,
      };
    },
  };
}
