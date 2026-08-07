import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BROWSER_CODEC_SUPPORT_VERSION,
  normalizeBrowserCodecSupport,
} from '../contracts/browser-codec.js';

test('browser codec support normalizes a runtime descriptor and dedupes codecs', () => {
  let support = normalizeBrowserCodecSupport({
    probe: 'runtime',
    decode: { supported: true, codecs: ['avc1.42E01E', 'vp09.00.10.08', 'avc1.42E01E'] },
    encode: { supported: true, codecs: ['avc1.42E01E'] },
    hardwareAcceleration: 'prefer-hardware',
  });

  assert.deepEqual(support, {
    version: BROWSER_CODEC_SUPPORT_VERSION,
    api: 'webcodecs',
    decode: { supported: true, codecs: ['avc1.42E01E', 'vp09.00.10.08'] },
    encode: { supported: true, codecs: ['avc1.42E01E'] },
    hardwareAcceleration: 'prefer-hardware',
    probe: 'runtime',
  });
});

test('browser codec support tolerates a minimal declared descriptor', () => {
  let support = normalizeBrowserCodecSupport({
    probe: 'declared',
    decode: { supported: false },
    encode: { supported: false },
  });

  assert.deepEqual(support.decode, { supported: false, codecs: [] });
  assert.deepEqual(support.encode, { supported: false, codecs: [] });
  assert.equal('hardwareAcceleration' in support, false);
});

test('browser codec support requires explicit booleans and a valid probe', () => {
  assert.throws(
    () => normalizeBrowserCodecSupport({ probe: 'runtime', decode: {}, encode: { supported: true } }),
    /decode\.supported: must be an explicit boolean/,
  );
  assert.throws(
    () => normalizeBrowserCodecSupport({ probe: 'guessed', decode: { supported: true }, encode: { supported: true } }),
    /probe: must be one of/,
  );
  assert.throws(
    () => normalizeBrowserCodecSupport({ probe: 'runtime', api: 'ffmpeg', decode: { supported: true }, encode: { supported: true } }),
    /api: must be "webcodecs"/,
  );
});

test('browser codec support validates codec entries and hardware preference', () => {
  assert.throws(
    () => normalizeBrowserCodecSupport({
      probe: 'runtime',
      decode: { supported: true, codecs: ['avc1', ''] },
      encode: { supported: false },
    }),
    /decode\.codecs\[1\]: must be a non-empty codec string/,
  );
  assert.throws(
    () => normalizeBrowserCodecSupport({
      probe: 'runtime',
      decode: { supported: true, codecs: 'avc1' },
      encode: { supported: false },
    }),
    /decode\.codecs: must be an array of codec strings/,
  );
  assert.throws(
    () => normalizeBrowserCodecSupport({
      probe: 'runtime',
      decode: { supported: true },
      encode: { supported: false },
      hardwareAcceleration: 'turbo',
    }),
    /hardwareAcceleration: must be one of/,
  );
});
