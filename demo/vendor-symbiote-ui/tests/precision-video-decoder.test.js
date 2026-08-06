import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PrecisionVideoDecodeError,
  createPrecisionVideoDecoder,
  getPrecisionVideoDecodeSupport,
} from '../ui/precision-video-decoder.js';

class FakeEvent {
  constructor(type) {
    this.type = type;
  }
}

function fakeWebCodecs(opts = {}) {
  let instances = [];
  let frames = [];
  let configWaiters = [];
  let frameByteSize = opts.frameBytes ?? (320 * 180 * 4);
  let makeFrame = (timestamp) => {
    let frame = {
      timestamp,
      codedWidth: opts.width ?? 320,
      codedHeight: opts.height ?? 180,
      allocationSize: () => frameByteSize,
      closes: 0,
      close() {
        this.closes += 1;
      },
    };
    frames.push(frame);
    return frame;
  };

  class FakeEncodedVideoChunk {
    constructor(init) {
      Object.assign(this, init);
    }
  }

  class FakeVideoDecoder {
    static async isConfigSupported(config) {
      if (opts.holdConfigSupport) {
        await new Promise((resolve) => configWaiters.push(resolve));
      }
      return { supported: !opts.unsupported && config.codec !== 'unsupported', config };
    }

    constructor(init) {
      this.init = init;
      this.state = 'unconfigured';
      this.decodeQueueSize = 0;
      this.peakQueue = 0;
      this.closes = 0;
      this.dequeueListeners = 0;
      this._listeners = new Map();
      this._flush = null;
      this._sync = opts.sync !== false;
      instances.push(this);
    }

    addEventListener(type, callback) {
      let list = this._listeners.get(type) || [];
      list.push(callback);
      this._listeners.set(type, list);
      if (type === 'dequeue') this.dequeueListeners += 1;
    }

    removeEventListener(type, callback) {
      let list = this._listeners.get(type) || [];
      this._listeners.set(type, list.filter((entry) => entry !== callback));
    }

    listenerCount(type) {
      return (this._listeners.get(type) || []).length;
    }

    _emit(type) {
      for (let callback of (this._listeners.get(type) || []).slice()) callback(new FakeEvent(type));
    }

    configure(config) {
      this.config = config;
      this.state = 'configured';
    }

    decode(chunk) {
      if (this.state !== 'configured') throw new Error(`decode in state ${this.state}`);
      this.decodeQueueSize += 1;
      this.peakQueue = Math.max(this.peakQueue, this.decodeQueueSize);
      let emit = () => {
        this.decodeQueueSize = Math.max(0, this.decodeQueueSize - 1);
        if (opts.errorAt != null && chunk.timestamp === opts.errorAt) {
          this.init.error(new Error('decode failure'));
          return;
        }
        this.init.output(makeFrame(chunk.timestamp));
        this._emit('dequeue');
      };
      if (this._sync) emit();
      else queueMicrotask(emit);
    }

    flush() {
      if (opts.holdFlush) {
        return new Promise((resolve, reject) => {
          this._flush = { resolve, reject };
        });
      }
      return new Promise((resolve) => {
        let check = () => (this.decodeQueueSize > 0 ? queueMicrotask(check) : resolve());
        check();
      });
    }

    releaseFlush() {
      this._flush?.resolve();
      this._flush = null;
    }

    close() {
      this.state = 'closed';
      this.closes += 1;
    }
  }

  return {
    VideoDecoder: FakeVideoDecoder,
    EncodedVideoChunk: FakeEncodedVideoChunk,
    instances,
    frames,
    setFrameBytes(bytes) {
      frameByteSize = bytes;
    },
    releaseConfigSupport() {
      let waiters = configWaiters;
      configWaiters = [];
      for (let resolve of waiters) resolve();
    },
  };
}

function keyframeChunks(timestamps) {
  return timestamps.map((timestamp, index) => ({
    type: index === 0 ? 'key' : 'delta',
    timestamp,
    data: new Uint8Array([index]),
  }));
}

function baseConfig() {
  return { codec: 'avc1.640028', codedWidth: 320, codedHeight: 180 };
}

test('precision decoder support probe reports WebCodecs availability', () => {
  let unavailable = getPrecisionVideoDecodeSupport({ VideoDecoder: undefined, EncodedVideoChunk: undefined });
  assert.equal(unavailable.supported, false);

  let fake = fakeWebCodecs();
  let available = getPrecisionVideoDecodeSupport(fake);
  assert.equal(available.supported, true);
  assert.equal(available.videoDecoder, true);
  assert.equal(available.encodedVideoChunk, true);

  let insecure = getPrecisionVideoDecodeSupport({ ...fake, secureContext: false });
  assert.equal(insecure.supported, false);
  assert.equal(insecure.secureContext, false);
});

test('precision decoder rejects unavailable WebCodecs with structured diagnostics', async () => {
  let decoder = createPrecisionVideoDecoder({ VideoDecoder: undefined, EncodedVideoChunk: undefined });
  await assert.rejects(
    decoder.decodeFrame({ config: baseConfig(), chunks: keyframeChunks([0]), targetTimestamp: 0 }),
    (error) => {
      assert.ok(error instanceof PrecisionVideoDecodeError);
      assert.equal(error.code, 'webcodecs-unavailable');
      assert.equal(typeof error.diagnostics, 'object');
      return true;
    },
  );
});

test('precision decoder rejects an unsupported codec config with structured diagnostics', async () => {
  let fake = fakeWebCodecs({ unsupported: true });
  let decoder = createPrecisionVideoDecoder(fake);
  await assert.rejects(
    decoder.decodeFrame({ config: { codec: 'unsupported' }, chunks: keyframeChunks([0]), targetTimestamp: 0 }),
    (error) => {
      assert.equal(error.code, 'unsupported-config');
      assert.equal(error.diagnostics.config.codec, 'unsupported');
      return true;
    },
  );
  assert.equal(fake.frames.length, 0);
});

test('precision decoder rejects empty input and a non-key first chunk', async () => {
  let fake = fakeWebCodecs();
  let decoder = createPrecisionVideoDecoder(fake);

  await assert.rejects(
    decoder.decodeFrame({ config: baseConfig(), chunks: [], targetTimestamp: 0 }),
    (error) => error.code === 'empty-input',
  );

  await assert.rejects(
    decoder.decodeFrame({
      config: baseConfig(),
      chunks: [{ type: 'delta', timestamp: 0, data: new Uint8Array([0]) }],
      targetTimestamp: 0,
    }),
    (error) => error.code === 'missing-key-chunk',
  );
});

test('precision decoder rejects an input window larger than the bound', async () => {
  let fake = fakeWebCodecs();
  let decoder = createPrecisionVideoDecoder({ ...fake, maxInputChunks: 3 });
  await assert.rejects(
    decoder.decodeFrame({ config: baseConfig(), chunks: keyframeChunks([0, 1, 2, 3]), targetTimestamp: 0 }),
    (error) => {
      assert.equal(error.code, 'input-window-exceeded');
      assert.equal(error.diagnostics.chunkCount, 4);
      assert.equal(error.diagnostics.maxInputChunks, 3);
      return true;
    },
  );
});

test('precision decoder delivers the nearest frame at or before the target and closes every frame', async () => {
  let fake = fakeWebCodecs();
  let decoder = createPrecisionVideoDecoder(fake);
  let received = null;
  let receivedClosesDuringCallback = null;

  let result = await decoder.decodeFrame({
    config: baseConfig(),
    chunks: keyframeChunks([0, 1000, 2000, 3000]),
    targetTimestamp: 2500,
    onFrame: (frame) => {
      received = frame;
      receivedClosesDuringCallback = frame.closes;
      return frame.timestamp;
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.timestamp, 2000);
  assert.equal(result.targetTimestamp, 2500);
  assert.equal(result.deliveredFrame, true);
  assert.equal(result.decodedFrames, 4);
  assert.equal(result.width, 320);
  assert.equal(result.height, 180);
  assert.equal(receivedClosesDuringCallback, 0, 'the borrowed frame is open during the consumer callback');
  assert.equal(received.closes, 1, 'the borrowed frame is closed exactly once after delivery');
  assert.deepEqual(fake.frames.map((frame) => frame.closes), [1, 1, 1, 1], 'every produced frame is closed once');
  assert.equal(fake.instances[0].closes, 1, 'the decoder is closed exactly once');
  assert.equal(fake.instances[0].listenerCount('dequeue'), 0, 'no dequeue listener leaks on success');
  assert.equal(decoder.diagnostics.framesProduced, 4);
  assert.equal(decoder.diagnostics.framesClosed, 4);
});

test('precision decoder selects the first frame when the target precedes it', async () => {
  let fake = fakeWebCodecs();
  let decoder = createPrecisionVideoDecoder(fake);
  let result = await decoder.decodeFrame({
    config: baseConfig(),
    chunks: keyframeChunks([1000, 2000, 3000]),
    targetTimestamp: 0,
  });
  assert.equal(result.timestamp, 1000);
  assert.deepEqual(fake.frames.map((frame) => frame.closes), [1, 1, 1]);
});

test('precision decoder enforces a decoded-byte ceiling and closes the frame', async () => {
  let fake = fakeWebCodecs({ frameBytes: 4096 });
  let decoder = createPrecisionVideoDecoder({ ...fake, maxDecodedBytes: 1024 });
  await assert.rejects(
    decoder.decodeFrame({ config: baseConfig(), chunks: keyframeChunks([0]), targetTimestamp: 0 }),
    (error) => error.code === 'decoded-bytes-exceeded',
  );
  assert.deepEqual(fake.frames.map((frame) => frame.closes), [1]);
  assert.equal(fake.instances[0].closes, 1);
});

test('precision decoder reports each job\'s own peak retained bytes, not the controller history', async () => {
  let fake = fakeWebCodecs();
  let decoder = createPrecisionVideoDecoder(fake);

  fake.setFrameBytes(1000);
  let first = await decoder.decodeFrame({ config: baseConfig(), chunks: keyframeChunks([0, 1000]), targetTimestamp: 1000 });
  assert.ok(first.peakRetainedBytes >= 2000, 'first job briefly retained two 1000-byte frames');

  fake.setFrameBytes(100);
  let second = await decoder.decodeFrame({ config: baseConfig(), chunks: keyframeChunks([0, 1000]), targetTimestamp: 1000 });
  assert.equal(second.peakRetainedBytes, 200, 'second job reports only its own smaller peak');
  assert.ok(second.peakRetainedBytes < first.peakRetainedBytes);

  // The controller-global diagnostic keeps the historical high-water mark.
  assert.ok(decoder.diagnostics.peakRetainedBytes >= first.peakRetainedBytes);
});

test('precision decoder honors queue backpressure as a strict ceiling via the dequeue event', async () => {
  let fake = fakeWebCodecs({ sync: false });
  let decoder = createPrecisionVideoDecoder({ ...fake, maxDecodeQueueSize: 2 });
  let result = await decoder.decodeFrame({
    config: baseConfig(),
    chunks: keyframeChunks([0, 100, 200, 300, 400, 500, 600, 700]),
    targetTimestamp: 700,
  });
  assert.equal(result.timestamp, 700);
  assert.ok(
    fake.instances[0].peakQueue <= 2,
    `queue never exceeded the configured max (peak ${fake.instances[0].peakQueue})`,
  );
  assert.ok(fake.instances[0].dequeueListeners > 0, 'backpressure waited on the dequeue event');
  assert.equal(fake.instances[0].listenerCount('dequeue'), 0, 'no dequeue listener is left behind on success');
  assert.deepEqual(fake.frames.map((frame) => frame.closes), fake.frames.map(() => 1));
});

test('precision decoder bounds cumulative retained bytes including the transient frame', async () => {
  let fake = fakeWebCodecs({ frameBytes: 600 });
  let decoder = createPrecisionVideoDecoder({ ...fake, maxDecodedBytes: 1000 });
  await assert.rejects(
    decoder.decodeFrame({ config: baseConfig(), chunks: keyframeChunks([0, 1000]), targetTimestamp: 1000 }),
    (error) => {
      assert.equal(error.code, 'decoded-bytes-exceeded');
      assert.ok(error.diagnostics.peakRetainedBytes >= 1200, 'peak retained bytes counts the transient frame');
      assert.equal(error.diagnostics.maxDecodedBytes, 1000);
      return true;
    },
  );
  // Both frames were momentarily retained (600 each) and both are closed once.
  assert.deepEqual(fake.frames.map((frame) => frame.closes), [1, 1]);
  assert.equal(fake.instances[0].closes, 1);
  assert.ok(decoder.diagnostics.peakRetainedBytes >= 1200);
});

test('precision decoder removes the dequeue listener when abort wins the backpressure race', async () => {
  let fake = fakeWebCodecs({ sync: false, holdFlush: true });
  let decoder = createPrecisionVideoDecoder({ ...fake, maxDecodeQueueSize: 1 });
  let controller = new AbortController();
  let pending = decoder.decodeFrame({
    config: baseConfig(),
    chunks: keyframeChunks([0, 100, 200, 300]),
    targetTimestamp: 300,
    signal: controller.signal,
  });
  await Promise.resolve();
  controller.abort();
  await assert.rejects(pending, (error) => error.code === 'aborted');
  assert.equal(fake.instances[0].listenerCount('dequeue'), 0, 'the dequeue listener is removed on abort');
  assert.ok(fake.frames.every((frame) => frame.closes === 1));
  assert.equal(fake.instances[0].closes, 1);
});

test('precision decoder terminates a pre-aborted request without creating a decoder', async () => {
  let fake = fakeWebCodecs();
  let decoder = createPrecisionVideoDecoder(fake);
  let controller = new AbortController();
  controller.abort();
  await assert.rejects(
    decoder.decodeFrame({
      config: baseConfig(),
      chunks: keyframeChunks([0, 1000]),
      targetTimestamp: 1000,
      signal: controller.signal,
    }),
    (error) => error.code === 'aborted',
  );
  assert.equal(fake.instances.length, 0, 'no decoder was constructed or configured');
  assert.equal(fake.frames.length, 0);
});

test('precision decoder surfaces a decoder error and closes every resource', async () => {
  let fake = fakeWebCodecs({ errorAt: 1000 });
  let decoder = createPrecisionVideoDecoder(fake);
  await assert.rejects(
    decoder.decodeFrame({ config: baseConfig(), chunks: keyframeChunks([0, 1000, 2000]), targetTimestamp: 2000 }),
    (error) => {
      assert.equal(error.code, 'decoder-error');
      return true;
    },
  );
  assert.ok(fake.frames.every((frame) => frame.closes === 1), 'produced frames are closed once');
  assert.equal(fake.instances[0].closes, 1);
  assert.equal(fake.instances[0].listenerCount('dequeue'), 0, 'no dequeue listener leaks on decoder error');
});

test('precision decoder wraps a consumer callback failure and still closes the frame', async () => {
  let fake = fakeWebCodecs();
  let decoder = createPrecisionVideoDecoder(fake);
  let delivered = null;
  await assert.rejects(
    decoder.decodeFrame({
      config: baseConfig(),
      chunks: keyframeChunks([0, 1000]),
      targetTimestamp: 1000,
      onFrame: (frame) => {
        delivered = frame;
        throw new Error('render sink failure');
      },
    }),
    (error) => {
      assert.equal(error.code, 'render-callback-error');
      assert.match(String(error.cause), /render sink failure/);
      return true;
    },
  );
  assert.equal(delivered.closes, 1);
  assert.deepEqual(fake.frames.map((frame) => frame.closes), [1, 1]);
  assert.equal(fake.instances[0].closes, 1);
});

test('precision decoder aborts a request through an external signal', async () => {
  let fake = fakeWebCodecs({ holdFlush: true });
  let decoder = createPrecisionVideoDecoder(fake);
  let controller = new AbortController();
  let pending = decoder.decodeFrame({
    config: baseConfig(),
    chunks: keyframeChunks([0, 1000]),
    targetTimestamp: 1000,
    signal: controller.signal,
  });
  await Promise.resolve();
  controller.abort();
  await assert.rejects(pending, (error) => error.code === 'aborted');
  assert.ok(fake.frames.every((frame) => frame.closes === 1));
  assert.equal(fake.instances[0].closes, 1);
});

test('precision decoder supersedes an in-flight request with a newer one', async () => {
  let fake = fakeWebCodecs({ holdFlush: true });
  let decoder = createPrecisionVideoDecoder(fake);

  let first = decoder.decodeFrame({
    config: baseConfig(),
    chunks: keyframeChunks([0, 1000]),
    targetTimestamp: 1000,
  });
  await Promise.resolve();
  await Promise.resolve();

  let second = decoder.decodeFrame({
    config: baseConfig(),
    chunks: keyframeChunks([0, 1000, 2000]),
    targetTimestamp: 2000,
  });

  await assert.rejects(first, (error) => error.code === 'aborted');
  // Release the second decoder's flush so it can complete.
  fake.instances[1].releaseFlush();
  let result = await second;
  assert.equal(result.timestamp, 2000);

  assert.equal(fake.instances[0].closes, 1, 'the superseded decoder is closed');
  assert.equal(fake.instances[1].closes, 1, 'the newer decoder is closed after delivery');
  assert.ok(fake.frames.every((frame) => frame.closes === 1), 'no frame from either request leaks');
  assert.ok(
    fake.instances.every((instance) => instance.listenerCount('dequeue') === 0),
    'no dequeue listener leaks across supersession',
  );
});

test('precision decoder supersedes a request that overlaps the async config probe', async () => {
  let fake = fakeWebCodecs({ holdConfigSupport: true });
  let decoder = createPrecisionVideoDecoder(fake);

  let first = decoder.decodeFrame({
    config: baseConfig(),
    chunks: keyframeChunks([0, 1000]),
    targetTimestamp: 1000,
  });
  await Promise.resolve();

  let second = decoder.decodeFrame({
    config: baseConfig(),
    chunks: keyframeChunks([0, 1000, 2000]),
    targetTimestamp: 2000,
  });
  await Promise.resolve();

  // Both requests are parked in the support probe; releasing lets them proceed.
  fake.releaseConfigSupport();

  await assert.rejects(first, (error) => error.code === 'aborted');
  let result = await second;
  assert.equal(result.timestamp, 2000);
  assert.ok(fake.frames.every((frame) => frame.closes === 1));
});

test('precision decoder dispose aborts in-flight work and refuses further requests', async () => {
  let fake = fakeWebCodecs({ holdFlush: true });
  let decoder = createPrecisionVideoDecoder(fake);
  let pending = decoder.decodeFrame({
    config: baseConfig(),
    chunks: keyframeChunks([0, 1000]),
    targetTimestamp: 1000,
  });
  await Promise.resolve();
  decoder.dispose();
  await assert.rejects(pending, (error) => error.code === 'aborted');
  assert.ok(fake.frames.every((frame) => frame.closes === 1));
  assert.equal(fake.instances[0].closes, 1);
  assert.equal(fake.instances[0].listenerCount('dequeue'), 0, 'no dequeue listener leaks on dispose');

  await assert.rejects(
    decoder.decodeFrame({ config: baseConfig(), chunks: keyframeChunks([0]), targetTimestamp: 0 }),
    (error) => error.code === 'disposed',
  );
});
