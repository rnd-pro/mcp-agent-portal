import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import {
  RENDER_CACHE_PROJECTION_VERSION,
  buildRenderCleanupProofPatch,
  createMemoryFrameCacheStore,
  createRenderFrameCacheKey,
  createRenderOutputCacheKey,
  createRenderSeedProjection,
  createRenderRetentionCleanup,
  createRenderSegmentCacheKey,
  didCleanupRemovePaths,
  invalidateRenderSegmentRanges,
  normalizeRenderSeed,
} from '../render-cache.js';

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function writeFixture(path, content = 'ok') {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

function baseSeed() {
  return {
    providerId: 'browser-headless-screencast',
    surface: {
      url: 'http://127.0.0.1:4570/',
      route: '/orders',
      id: 'maximo-live',
      tab: 'my-open-orders',
    },
    theme: { id: 'cascade-dark', hash: 'theme-a' },
    viewport: { width: 1280, height: 720, dpr: 2 },
    video: { width: 640, height: 360, fps: 30 },
    timelineHash: 'timeline-a',
    appBuild: 'build-a',
    dataHash: 'data-a',
    providerSettings: {
      audioProviderId: 'symbiote-model-service',
      voiceRef: 'qwen3:speaker:vivian',
      whisper: 'large-v3-turbo',
    },
    state: {
      activeTabId: 'my-open-orders',
      selectedWorkOrder: '1009',
    },
  };
}

test('render frame cache key is stable and invalidates by render seed dimensions', () => {
  let seed = baseSeed();
  let reordered = {
    dataHash: 'data-a',
    appBuild: 'build-a',
    timelineHash: 'timeline-a',
    state: {
      selectedWorkOrder: '1009',
      activeTabId: 'my-open-orders',
    },
    providerSettings: {
      whisper: 'large-v3-turbo',
      voiceRef: 'qwen3:speaker:vivian',
      audioProviderId: 'symbiote-model-service',
    },
    video: { fps: 30, height: 360, width: 640 },
    viewport: { dpr: 2, height: 720, width: 1280 },
    theme: { hash: 'theme-a', id: 'cascade-dark' },
    surface: {
      tab: 'my-open-orders',
      id: 'maximo-live',
      route: '/orders',
      url: 'http://127.0.0.1:4570/',
    },
    providerId: 'browser-headless-screencast',
  };

  let key = createRenderFrameCacheKey(seed);
  assert.match(key, /^frame:[a-f0-9]{32}$/);
  assert.equal(createRenderFrameCacheKey(reordered), key);

  let variants = [
    { surface: { ...seed.surface, route: '/crews' } },
    { theme: { id: 'cascade-dark', hash: 'theme-b' } },
    { viewport: { width: 1366, height: 720, dpr: 2 } },
    { viewport: { width: 1280, height: 720, dpr: 1 } },
    { timelineHash: 'timeline-b' },
    { appBuild: 'build-b' },
    { dataHash: 'data-b' },
  ];

  for (let patch of variants) {
    assert.notEqual(createRenderFrameCacheKey({ ...seed, ...patch }), key);
  }
});

test('render output and frame cache keys share the normalized seed identity', () => {
  let seed = baseSeed();
  let frameKey = createRenderFrameCacheKey(seed, { durationMs: 1000, frameCount: 30 });
  let outputKey = createRenderOutputCacheKey(seed, {
    includeAudio: true,
    sequenceMode: 'sequential',
    speakerMode: 'single',
  });

  assert.match(frameKey, /^frame:[a-f0-9]{32}$/);
  assert.match(outputKey, /^render:[a-f0-9]{32}$/);
  assert.equal(
    createRenderOutputCacheKey({
      dataHash: 'data-a',
      appBuild: 'build-a',
      timelineHash: 'timeline-a',
      providerSettings: {
        whisper: 'large-v3-turbo',
        voiceRef: 'qwen3:speaker:vivian',
        audioProviderId: 'symbiote-model-service',
      },
      state: {
        selectedWorkOrder: '1009',
        activeTabId: 'my-open-orders',
      },
      video: { fps: 30, height: 360, width: 640 },
      viewport: { dpr: 2, height: 720, width: 1280 },
      theme: { hash: 'theme-a', id: 'cascade-dark' },
      surface: {
        tab: 'my-open-orders',
        id: 'maximo-live',
        route: '/orders',
        url: 'http://127.0.0.1:4570/',
      },
      providerId: 'browser-headless-screencast',
    }, {
      speakerMode: 'single',
      sequenceMode: 'sequential',
      includeAudio: true,
    }),
    outputKey,
  );

  for (let patch of [
    { viewport: { width: 1280, height: 720, dpr: 1 } },
    { surface: { ...seed.surface, route: '/orders?filter=crew-a' } },
    { surface: { ...seed.surface, tab: 'crew-availability' } },
    { dataHash: 'data-b' },
    { providerSettings: { ...seed.providerSettings, voiceRef: 'qwen3:speaker:eric' } },
    { cascadeTheme: { id: 'cascade-dark', hash: 'cascade-b' } },
    { state: { activeTabId: 'my-open-orders', selectedWorkOrder: '1010' } },
  ]) {
    assert.notEqual(createRenderFrameCacheKey({ ...seed, ...patch }), frameKey);
    assert.notEqual(createRenderOutputCacheKey({ ...seed, ...patch }), outputKey);
  }
});

test('render seed projection is versioned and strips auth routing data', () => {
  let seed = {
    ...baseSeed(),
    url: 'https://playground.rnd-pro.com/demos/maximo-workbench/?surface=orders&token=secret#token=also-secret',
    internalBaseUrl: 'http://127.0.0.1:4570',
    surface: {
      ...baseSeed().surface,
      url: 'https://playground.rnd-pro.com/demos/maximo-workbench/?surface=orders&access_token=secret#token=also-secret',
    },
  };
  let projection = createRenderSeedProjection(seed);
  let serialized = JSON.stringify(projection);

  assert.equal(projection.version, RENDER_CACHE_PROJECTION_VERSION);
  assert.equal(projection.source.url, 'https://playground.rnd-pro.com/demos/maximo-workbench/?surface=orders');
  assert.equal(projection.source.route, '/orders');
  assert.doesNotMatch(serialized, /secret|access_token|internalBaseUrl|127\.0\.0\.1:4570/);
  assert.notEqual(
    createRenderFrameCacheKey(baseSeed()),
    createRenderFrameCacheKey(baseSeed(), {}, { version: RENDER_CACHE_PROJECTION_VERSION + 1 }),
  );
});

test('render seed cache identity requires appBuild and dataHash', () => {
  let seed = baseSeed();

  assert.throws(
    () => normalizeRenderSeed({ ...seed, appBuild: '', build: '', version: '', app: {} }),
    /appBuild is required/,
  );
  assert.throws(
    () => normalizeRenderSeed({ ...seed, dataHash: '', data: {} }),
    /dataHash is required/,
  );
  assert.equal(normalizeRenderSeed({ ...seed, appBuild: '' }, { appBuild: 'server-build' }).appBuild, 'server-build');
  assert.equal(normalizeRenderSeed({ ...seed, dataHash: '' }, { dataHash: 'server-data' }).dataHash, 'server-data');
});

test('memory frame cache store clones entries and tracks hits', async () => {
  let store = createMemoryFrameCacheStore();
  let key = createRenderFrameCacheKey(baseSeed());
  let inserted = await store.put(key, { framesDir: '/tmp/frames', frameCount: 2 }, { timelineHash: 'timeline-a' });

  assert.equal(inserted.key, key);
  assert.equal(await store.has(key), true);

  inserted.value.framesDir = 'mutated';
  let first = await store.get(key);
  let second = await store.get(key);

  assert.equal(first.value.framesDir, '/tmp/frames');
  assert.equal(second.hits, 2);
  assert.equal(store.list()[0].hits, 2);
  assert.equal(await store.delete(key), true);
  assert.equal(await store.get(key), null);
});

test('cleanup proof helpers derive removed path evidence without throwing', () => {
  let root = join(os.tmpdir(), 'sym-engine-cleanup-proof');
  let scratch = join(root, 'frames');
  let other = join(root, 'audio');

  assert.equal(didCleanupRemovePaths(undefined, [scratch]), false);
  assert.equal(didCleanupRemovePaths({ removed: null }, [scratch]), false);
  assert.equal(didCleanupRemovePaths({ removed: [{ resolvedPath: scratch }] }, []), false);
  assert.equal(didCleanupRemovePaths({ removed: [{ resolvedPath: other }] }, [scratch]), false);
  assert.equal(didCleanupRemovePaths({ removed: [{ resolvedPath: scratch }] }, [scratch]), true);
  assert.equal(didCleanupRemovePaths({ removed: [{ path: scratch }] }, [scratch]), true);
});

test('cleanup proof patch excludes retained frame cache paths', () => {
  let root = join(os.tmpdir(), 'sym-engine-cleanup-patch');
  let frameCache = join(root, 'frame-cache');
  let scratch = join(root, 'jobs', 'frames');
  let cleanup = { removed: [{ resolvedPath: scratch }] };

  assert.deepEqual(buildRenderCleanupProofPatch({
    cleanup,
    frameScratchPaths: [frameCache],
    retainedFramePaths: [frameCache],
  }), {
    frameSequenceCleaned: false,
    cleanup,
  });

  assert.deepEqual(buildRenderCleanupProofPatch({
    cleanup,
    frameScratchPaths: [frameCache, scratch],
    retainedFramePaths: [frameCache],
  }), {
    frameSequenceCleaned: true,
    cleanup,
  });
});

test('render retention cleanup deletes scratch paths and preserves final artifacts', async () => {
  let root = await mkdtemp(join(os.tmpdir(), 'sym-engine-render-cache-'));
  let framesDir = join(root, 'tmp', 'frames');
  let audioChunk = join(root, 'tmp', 'audio', 'chunk.wav');
  let whisperScratch = join(root, 'tmp', 'whisper.json');
  let browserProfile = join(root, 'tmp', 'browser-profile');
  let workerTemp = join(root, 'tmp', 'worker');
  let providerTemp = join(root, 'tmp', 'provider');
  let finalMp4 = join(root, 'final', 'render.mp4');
  let proof = join(root, 'proof', 'manifest.json');
  let reusableCache = join(root, 'cache', 'audio.wav');

  await mkdir(framesDir, { recursive: true });
  await writeFixture(join(framesDir, 'frame-00001.png'));
  await writeFixture(audioChunk);
  await writeFixture(whisperScratch);
  await writeFixture(join(browserProfile, 'Preferences'), '{}');
  await writeFixture(join(workerTemp, 'worker.tmp'), 'tmp');
  await writeFixture(join(providerTemp, 'provider.tmp'), 'tmp');
  await writeFixture(finalMp4);
  await writeFixture(proof, '{}');
  await writeFixture(reusableCache);

  let cleanup = createRenderRetentionCleanup({ root });
  let result = await cleanup({
    status: 'succeeded',
    input: {
      cleanup: {
        frameSequencePaths: ['tmp/frames'],
        audioChunkPaths: ['tmp/audio/chunk.wav'],
        transcriptScratchPaths: ['tmp/whisper.json'],
        browserProfilePaths: ['tmp/browser-profile'],
        workerTempPaths: ['tmp/worker'],
        providerTempPaths: ['tmp/provider'],
        reusableCachePaths: ['cache/audio.wav'],
      },
    },
    result: {
      path: finalMp4,
      proofPath: proof,
      cleanup: {
        deletePaths: ['tmp/audio'],
        retainPaths: ['proof/manifest.json'],
      },
    },
  }, { reason: 'succeeded' });

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'succeeded');
  assert.equal(await exists(framesDir), false);
  assert.equal(await exists(audioChunk), false);
  assert.equal(await exists(whisperScratch), false);
  assert.equal(await exists(browserProfile), false);
  assert.equal(await exists(workerTemp), false);
  assert.equal(await exists(providerTemp), false);
  assert.equal(await exists(finalMp4), true);
  assert.equal(await exists(proof), true);
  assert.equal(await exists(reusableCache), true);
  assert.ok(result.removed.some((item) => item.path === 'tmp/frames'));
  assert.ok(result.retained.some((item) => item.path === finalMp4));
});

test('render retention cleanup is idempotent and skips unsafe paths', async () => {
  let root = await mkdtemp(join(os.tmpdir(), 'sym-engine-render-cleanup-'));
  let outside = join(os.tmpdir(), `sym-engine-outside-${Date.now()}.txt`);
  let tempFile = join(root, 'tmp', 'remove.txt');
  let retained = join(root, 'proof', 'manifest.json');

  await writeFixture(outside, 'outside');
  await writeFixture(tempFile, 'remove');
  await writeFixture(retained, '{}');

  let cleanup = createRenderRetentionCleanup({ root });
  let record = {
    status: 'failed',
    input: {
      cleanup: {
        deletePaths: ['.', 'tmp/remove.txt', outside, 'https://example.test/cache'],
        retainPaths: ['proof/manifest.json'],
      },
    },
  };

  let first = await cleanup(record, { reason: 'failed' });
  let second = await cleanup(record, { reason: 'failed' });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(await exists(tempFile), false);
  assert.equal(await readFile(outside, 'utf8'), 'outside');
  assert.ok(first.skipped.some((item) => item.reason === 'root'));
  assert.ok(first.skipped.some((item) => item.reason === 'outside-root'));
  assert.ok(first.skipped.some((item) => item.reason === 'invalid-path'));
  assert.ok(second.skipped.some((item) => item.reason === 'missing'));
});

test('segment cache keys are range-addressed so unrelated ranges keep distinct keys', () => {
  let seed = baseSeed();
  let first = createRenderSegmentCacheKey(seed, { start: 0, end: 99 });
  let second = createRenderSegmentCacheKey(seed, { start: 100, end: 199 });
  let firstAgain = createRenderSegmentCacheKey(seed, { start: 0, end: 99 });
  assert.match(first, /^segment:[0-9a-f]+:0-99$/);
  assert.equal(first, firstAgain);
  assert.notEqual(first, second);
  assert.throws(() => createRenderSegmentCacheKey(seed, { start: 5, end: 1 }), /segmentRange\.end/);
});

test('range invalidation only invalidates segments overlapping the changed range', () => {
  let segments = [
    { id: 'seg-a', frameRange: { start: 0, end: 99 } },
    { id: 'seg-b', frameRange: { start: 100, end: 199 } },
    { id: 'seg-c', frameRange: { start: 200, end: 299 } },
  ];
  let result = invalidateRenderSegmentRanges(segments, { start: 150, end: 210 });
  assert.deepEqual(result.invalidated, ['seg-b', 'seg-c']);
  assert.deepEqual(result.retained, ['seg-a']);

  let untouched = invalidateRenderSegmentRanges(segments, { start: 100, end: 199 });
  assert.deepEqual(untouched.invalidated, ['seg-b']);
  assert.deepEqual(untouched.retained, ['seg-a', 'seg-c']);
});
