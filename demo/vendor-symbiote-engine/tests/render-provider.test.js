import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  ATTRIBUTED_COMPOSITOR_POLICY_VERSION,
  createRenderProviderRegistry,
  normalizeAudioProviderDescriptor,
  normalizeCaptureTransportKind,
  normalizeCompositorFrameEvent,
  normalizeRenderArtifact,
  normalizeRenderProvider,
} from '../contracts/render-provider.js';
import {
  createLocalBrowserScreencastProvider,
  sampleProcessTreeRss,
} from '../providers/local-browser-screencast.js';

const TEST_SETUP_STATE = Object.freeze({
  exportPath: '__fixture.exportState',
  importPath: '__fixture.importState',
});

test('process tree RSS sampler attributes descendants to browser workers', async () => {
  let sample = await sampleProcessTreeRss({
    roots: [{ workerIndex: 0, pid: 10 }, { workerIndex: 1, pid: 20 }],
    atMs: 250,
    execFile: async () => ({ stdout: [
      '10 1 100',
      '11 10 50',
      '12 11 25',
      '20 1 120',
      '21 20 30',
      '99 1 999',
    ].join('\n') }),
  });

  assert.equal(sample.atMs, 250);
  assert.equal(sample.processCount, 5);
  assert.equal(sample.rssBytes, (100 + 50 + 25 + 120 + 30) * 1024);
  assert.deepEqual(sample.workers.map((worker) => worker.rssBytes), [175 * 1024, 150 * 1024]);
});

test('render provider contract validates providers and rejects duplicate ids', async () => {
  let first = {
    id: 'browser-headless-screencast',
    kind: 'screencast',
    execute: async () => ({
      path: '/tmp/out.mp4',
      frames: 2,
      fps: 12,
      durationSec: 1,
      width: 1280,
      height: 720,
    }),
  };
  let registry = createRenderProviderRegistry([first]);

  assert.deepEqual(registry.list(), [{ id: 'browser-headless-screencast', kind: 'screencast' }]);
  assert.equal(registry.get('browser-headless-screencast').id, 'browser-headless-screencast');
  assert.throws(() => registry.register(first), /duplicate provider/);
  assert.throws(() => normalizeRenderProvider({ id: 'x', kind: 'audio' }), /unsupported kind/);
});

test('render provider registry executes the selected provider and normalizes metadata', async () => {
  let calls = [];
  let registry = createRenderProviderRegistry([
    {
      id: 'a',
      kind: 'screencast',
      execute: async () => {
        calls.push('a');
        return {
          path: '/tmp/a.mp4',
          kind: 'screencast',
          providerId: 'a',
          frames: 2,
          fps: 24,
          durationSec: 0.5,
          width: 640,
          height: 360,
          ignored: true,
        };
      },
    },
    {
      id: 'b',
      kind: 'screencast',
      execute: async () => {
        calls.push('b');
        throw new Error('wrong provider');
      },
    },
  ]);

  let result = await registry.execute({
    id: 'job-1',
    kind: 'screencast',
    providerId: 'a',
  });

  assert.deepEqual(calls, ['a']);
  assert.deepEqual(result, {
    path: '/tmp/a.mp4',
    kind: 'screencast',
    providerId: 'a',
    frames: 2,
    fps: 24,
    durationSec: 0.5,
    width: 640,
    height: 360,
  });
  await assert.rejects(() => registry.execute({ kind: 'screencast', providerId: 'missing' }), /unknown provider/);
});

test('render and audio provider descriptors fail fast without fake audio execution', () => {
  assert.deepEqual(
    normalizeRenderArtifact({
      path: '/tmp/out.mp4',
      kind: 'screencast',
      providerId: 'p',
      frames: 12,
      fps: 12,
      durationSec: 1,
      width: 1280,
      height: 720,
    }),
    {
      path: '/tmp/out.mp4',
      kind: 'screencast',
      providerId: 'p',
      frames: 12,
      fps: 12,
      durationSec: 1,
      width: 1280,
      height: 720,
    },
  );
  assert.deepEqual(
    normalizeAudioProviderDescriptor({ id: 'browser', kind: 'browser-tts' }),
    { id: 'browser', kind: 'browser-tts' },
  );
  assert.throws(
    () => normalizeAudioProviderDescriptor({ id: 'fake', kind: 'unsupported-audio' }),
    /unsupported kind/,
  );
});

test('render artifact contract supports ordered frame-sequence metadata', () => {
  assert.deepEqual(
    normalizeRenderArtifact({
      kind: 'frame-sequence',
      providerId: 'browser-headless-screencast',
      frames: 2,
      fps: 24,
      durationSec: 0.5,
      width: 640,
      height: 360,
      framesDir: '/tmp/frames',
      framePattern: 'frame-%05d.png',
      mimeType: 'image/png',
      frameFiles: [
        { index: 0, path: '/tmp/frames/frame-00000.png', elapsedMs: 0 },
        { index: 1, path: '/tmp/frames/frame-00001.png', elapsedMs: 42 },
      ],
      source: { url: 'http://127.0.0.1:4570/?surface=media-studio' },
    }),
    {
      kind: 'frame-sequence',
      providerId: 'browser-headless-screencast',
      frames: 2,
      fps: 24,
      durationSec: 0.5,
      width: 640,
      height: 360,
      framesDir: '/tmp/frames',
      framePattern: 'frame-%05d.png',
      mimeType: 'image/png',
      frameFiles: [
        { index: 0, path: '/tmp/frames/frame-00000.png', elapsedMs: 0, mimeType: 'image/png' },
        { index: 1, path: '/tmp/frames/frame-00001.png', elapsedMs: 42, mimeType: 'image/png' },
      ],
      source: { url: 'http://127.0.0.1:4570/?surface=media-studio' },
    },
  );
  assert.throws(
    () => normalizeRenderArtifact({
      kind: 'frame-sequence',
      providerId: 'p',
      frames: 2,
      fps: 24,
      durationSec: 0.5,
      width: 640,
      height: 360,
      framesDir: '/tmp/frames',
      frameFiles: [{ path: '/tmp/frames/frame-00000.png' }],
    }),
    /renderArtifact\.frameFiles: must include 2 frame records/,
  );
  assert.throws(
    () => normalizeRenderArtifact({
      kind: 'frame-sequence',
      providerId: 'p',
      frames: 1,
      fps: 24,
      durationSec: 0.5,
      width: 640,
      height: 360,
      framesDir: '/tmp/frames',
      frameFiles: [{ path: '/tmp/frames/frame-00000.png' }],
    }),
    /renderArtifact\.source\.url: is required/,
  );

  let capture = normalizeRenderArtifact({
    kind: 'frame-sequence',
    providerId: 'p',
    frames: 1,
    fps: 30,
    durationSec: 1 / 30,
    width: 320,
    height: 180,
    framesDir: '/tmp/frames',
    frameFiles: [{ path: '/tmp/frames/frame-00000.webp', mimeType: 'image/webp' }],
    source: { url: 'http://example.test/render' },
    capture: {
      mode: 'deterministic',
      workerCount: 1,
      durationMs: 12,
      throughputFps: 83.333,
      cleanupOk: true,
      cleanupErrors: [],
      peakRssBytes: 2048,
      workerPeakRssBytes: { 0: 2048 },
      resourceSamples: [{
        atMs: 4,
        rssBytes: 2048,
        processCount: 2,
        workers: [{ workerIndex: 0, pid: 10, processCount: 2, rssBytes: 2048 }],
      }],
      frameTimeSource: 'page-render-clock',
      workerRanges: [{
        workerIndex: 0,
        startFrame: 0,
        endFrame: 0,
        frameCount: 1,
        warmupDurationMs: 8,
        captureDurationMs: 4,
        phaseDurationMs: { render: 1, settle: 2, caption: 0, stateSample: 0, screenshot: 3 },
      }],
    },
  });
  assert.equal(capture.capture.mode, 'deterministic');
  assert.equal(capture.capture.workerRanges[0].warmupDurationMs, 8);
  assert.deepEqual(capture.capture.workerRanges[0].phaseDurationMs, {
    render: 1,
    settle: 2,
    caption: 0,
    stateSample: 0,
    screenshot: 3,
  });
  assert.equal(capture.capture.peakRssBytes, 2048);
  assert.equal(capture.capture.workerPeakRssBytes[0], 2048);
  assert.equal(capture.capture.resourceSamples[0].workers[0].pid, 10);
  assert.equal(capture.capture.cleanupOk, true);
  assert.deepEqual(capture.capture.cleanupErrors, []);
  assert.throws(
    () => normalizeRenderArtifact({
      kind: 'frame-sequence',
      providerId: 'p',
      frames: 1,
      fps: 30,
      durationSec: 1 / 30,
      width: 320,
      height: 180,
      framesDir: '/tmp/frames',
      frameFiles: [{ path: '/tmp/frames/frame-00000.webp', mimeType: 'image/webp' }],
      source: { url: 'http://example.test/render' },
      capture: { mode: 'deterministic', cleanupOk: 'true' },
    }),
    /renderArtifact\.capture\.cleanupOk: must be a boolean/,
  );
});

test('render provider contract stays browser-safe while local provider stays Node-only', async () => {
  let contractsDir = new URL('../contracts/', import.meta.url);
  for (let file of await readdir(contractsDir)) {
    if (!file.endsWith('.js')) continue;
    let source = await readFile(new URL(file, contractsDir), 'utf8');
    assert.doesNotMatch(source, /from ['"]node:/, `${file} must not import node:*`);
  }

  let browserSource = await readFile(new URL('../browser.js', import.meta.url), 'utf8');
  assert.doesNotMatch(browserSource, /local-browser-screencast/);
  let browser = await import('../browser.js');
  assert.equal(browser.createLocalBrowserScreencastProvider, undefined);
});

test('local browser provider keeps product row filters in the manifest', async () => {
  let source = await readFile(new URL('../providers/local-browser-screencast.js', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /DESCRIPTION|STATUS|unfold_more/);
  assert.match(source, /excludeTextPattern/);
});

test('package metadata publishes provider subpaths', async () => {
  let pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

  assert.equal(pkg.exports['./providers/*'], './providers/*');
  assert.equal(pkg.exports['./render-captions'], './render-captions.js');
  assert.equal(pkg.exports['./render-finalize'], './render-finalize.js');
  assert.equal(pkg.exports['./render-lifecycle'], './render-lifecycle.js');
  assert.equal(pkg.exports['./render-proof'], './render-proof.js');
  assert.equal(pkg.exports['./render-progress'], './render-progress.js');
  assert.ok(pkg.files.includes('providers/'));
});

test('local browser screencast provider requires injected dependencies', () => {
  assert.throws(
    () => createLocalBrowserScreencastProvider({}),
    /requires injected puppeteer\.launch/,
  );
  assert.throws(
    () => createLocalBrowserScreencastProvider({ puppeteer: { launch() {} }, execFile: null }),
    /requires execFile function/,
  );
});

test('local browser screencast provider runs with injected browser and ffmpeg', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-render-provider-'));
  let progress = [];
  let stages = [];
  let execCalls = [];
  let closed = false;
  let launchOptions = null;
  let page = {
    mouse: { click: async () => {} },
    async setViewport(viewport) {
      this.viewport = viewport;
    },
    async goto(url) {
      this.url = url;
    },
    async screenshot(options) {
      this.lastScreenshot = options.path;
    },
  };
  let puppeteer = {
    async launch(options) {
      launchOptions = options;
      return {
        options,
        async newPage() {
          return page;
        },
        async close() {
          closed = true;
        },
      };
    },
  };
  let provider = createLocalBrowserScreencastProvider({
    puppeteer,
    cwd: tmp,
    framesRoot: tmp,
    execFile: async (file, args, options) => {
      execCalls.push({ file, args, options });
    },
  });

  let job = {
    id: 'unit',
    output: { path: 'out/unit.mp4' },
    surface: { url: 'http://example.test/' },
    video: {
      width: 320,
      height: 180,
      fps: 1000,
      durationMs: 2,
      frameCount: 2,
    },
    setup: [],
    timeline: [],
    captions: { enabled: false, cues: [] },
    cleanup: { retainPaths: [] },
  };
  let result = await provider.execute(job, {
    browserProfileRoot: tmp,
    onStage(event) {
      stages.push(event.stage);
    },
    onProgress(event) {
      progress.push(event.frame);
    },
  });

  assert.equal(page.url, 'http://example.test/');
  assert.deepEqual(progress, [1, 2]);
  assert.deepEqual(stages.filter((stage) => [
    'frames:prepare',
    'browser:launch',
    'browser:navigate',
    'setup:start',
    'capture:start',
    'capture:done',
    'encode:start',
    'encode:done',
    'screencast:done',
  ].includes(stage)), [
    'frames:prepare',
    'browser:launch',
    'browser:navigate',
    'setup:start',
    'capture:start',
    'capture:done',
    'encode:start',
    'encode:done',
    'screencast:done',
  ]);
  assert.equal(execCalls.length, 1);
  assert.equal(execCalls[0].file, 'ffmpeg');
  assert.ok(execCalls[0].args.includes(join(tmp, 'out/unit.mp4')));
  assert.ok(launchOptions.userDataDir.startsWith(tmp));
  assert.deepEqual(job.cleanup.browserProfilePaths, [launchOptions.userDataDir]);
  assert.equal(closed, true);
  assert.deepEqual(result, {
    path: join(tmp, 'out/unit.mp4'),
    kind: 'screencast',
    providerId: 'browser-headless-screencast',
    frames: 2,
    fps: 1000,
    durationSec: 0.002,
    width: 320,
    height: 180,
  });
});

test('local browser screencast provider can return a frame-sequence artifact without ffmpeg', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-frame-sequence-'));
  let progress = [];
  let stages = [];
  let execCalls = [];
  let screenshotPaths = [];
  let closed = false;
  let page = {
    mouse: { click: async () => {} },
    async setViewport(viewport) {
      this.viewport = viewport;
    },
    async goto(url) {
      this.url = url;
    },
    async screenshot(options) {
      screenshotPaths.push(options.path);
    },
  };
  let provider = createLocalBrowserScreencastProvider({
    puppeteer: {
      async launch() {
        return {
          async newPage() { return page; },
          async close() { closed = true; },
        };
      },
    },
    cwd: tmp,
    framesRoot: tmp,
    execFile: async (...args) => {
      execCalls.push(args);
    },
  });

  let result = await provider.execute({
    id: 'sequence-unit',
    output: { path: 'out/ignored-sequence.mp4' },
    surface: { url: 'http://example.test/media' },
    video: {
      width: 320,
      height: 180,
      fps: 1000,
      durationMs: 2,
      frameCount: 2,
    },
    setup: [],
    timeline: [],
    captions: { enabled: false, cues: [] },
  }, {
    artifactKind: 'frame-sequence',
    onStage(event) {
      stages.push(event.stage);
    },
    onProgress(event) {
      progress.push(event);
    },
  });

  assert.equal(page.url, 'http://example.test/media');
  assert.equal(execCalls.length, 0);
  assert.equal(closed, true);
  assert.equal(result.kind, 'frame-sequence');
  assert.equal(result.providerId, 'browser-headless-screencast');
  assert.equal(result.frames, 2);
  assert.equal(result.path, undefined);
  assert.equal(result.framePattern, 'frame-%05d.png');
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.source.url, 'http://example.test/media');
  assert.deepEqual(
    result.frameFiles.map((frame) => [frame.index, frame.path, frame.elapsedMs, frame.mimeType]),
    [
      [0, screenshotPaths[0], 0, 'image/png'],
      [1, screenshotPaths[1], 1, 'image/png'],
    ],
  );
  assert.deepEqual(progress.map((event) => [event.frame, event.frames, event.progress, event.stage]), [
    [1, 2, 0.5, 'capture'],
    [2, 2, 1, 'capture'],
  ]);
  assert.ok(stages.includes('frame-sequence:done'));
  assert.equal(stages.includes('encode:start'), false);
});

test('local browser screencast provider supports WebP frame-sequence capture', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-webp-frame-sequence-'));
  let progress = [];
  let screenshotOptions = [];
  let page = {
    mouse: { click: async () => {} },
    async setViewport(viewport) {
      this.viewport = viewport;
    },
    async goto(url) {
      this.url = url;
    },
    async screenshot(options) {
      screenshotOptions.push(options);
    },
  };
  let provider = createLocalBrowserScreencastProvider({
    puppeteer: {
      async launch() {
        return {
          async newPage() { return page; },
          async close() {},
        };
      },
    },
    cwd: tmp,
    framesRoot: tmp,
    execFile: async () => {},
  });

  let result = await provider.execute({
    id: 'webp-sequence-unit',
    frameFormat: 'webp',
    surface: { url: 'http://example.test/webp' },
    video: {
      width: 320,
      height: 180,
      fps: 1000,
      durationMs: 2,
      frameCount: 2,
    },
    setup: [],
    timeline: [],
    captions: { enabled: false, cues: [] },
  }, {
    artifactKind: 'frame-sequence',
    onProgress(event) {
      progress.push(event);
    },
  });

  assert.equal(result.framePattern, 'frame-%05d.webp');
  assert.equal(result.mimeType, 'image/webp');
  assert.deepEqual(result.frameFiles.map((frame) => frame.mimeType), ['image/webp', 'image/webp']);
  assert.deepEqual(screenshotOptions.map((options) => options.type), ['webp', 'webp']);
  assert.deepEqual(screenshotOptions.map((options) => options.path.endsWith('.webp')), [true, true]);
  assert.deepEqual(progress.map((event) => [event.framePattern, event.mimeType]), [
    ['frame-%05d.webp', 'image/webp'],
    ['frame-%05d.webp', 'image/webp'],
  ]);
});

test('local browser screencast provider renders deterministic ranges in parallel', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-deterministic-workers-'));
  let launches = [];
  let events = [];
  let progress = [];
  let closed = [];
  let pages = [];
  let puppeteer = {
    async launch(options) {
      let workerIndex = launches.length;
      launches.push(options);
      let pageEvents = [];
      let exportCalls = 0;
      let page = {
        mouse: { click: async () => {} },
        async setViewport() {},
        async goto() { pageEvents.push('goto'); },
        async waitForFunction() {},
        async evaluate(_fn, arg) {
          if (arg?.methodParts?.at(-1) === 'exportState') {
            // Each export returns a distinct opaque continuation snapshot so a
            // peer that imports the wrong boundary payload is observable.
            let boundary = exportCalls;
            exportCalls += 1;
            pageEvents.push(`export:${boundary}`);
            return { version: 1, boundary };
          }
          if (arg?.methodParts?.at(-1) === 'importState') {
            pageEvents.push(`import:${arg.args?.[0]?.boundary}`);
            return { imported: true };
          }
          if (arg?.frameContext) {
            let frameIndex = arg.frameContext.frameIndex;
            pageEvents.push(arg.frameContext.warmup ? `warmup:${frameIndex}` : `render:${frameIndex}`);
            return {
              presentedTimeMs: arg.frameContext.timeMs,
              projectionId: `fixture:${frameIndex}`,
              contentDigest: `content:${frameIndex}`,
            };
          }
          if (arg?.settleFrames != null) {
            pageEvents.push(`settle:${arg.frameIndex}`);
            return { settled: true };
          }
          return { supported: false };
        },
        async screenshot(options) {
          let frame = Number(options.path.match(/frame-(\d+)/)?.[1]);
          let proof = options.path.includes('.seam-');
          pageEvents.push(`${proof ? 'screenshot-proof' : 'screenshot'}:${frame}`);
          await writeFile(options.path, `frame:${frame}${proof ? ':proof' : ''}`);
        },
      };
      pages.push(pageEvents);
      return {
        async newPage() { return page; },
        async close() { closed.push(workerIndex); },
      };
    },
  };
  let provider = createLocalBrowserScreencastProvider({
    puppeteer,
    cwd: tmp,
    framesRoot: tmp,
    execFile: async () => ({ stderr: 'SSIM All:0.9999995' }),
  });

  let result = await provider.execute({
    id: 'deterministic-workers',
    frameFormat: 'webp',
    artifactKind: 'frame-sequence',
    surface: { url: 'http://example.test/render' },
    video: { width: 320, height: 180, fps: 30, durationMs: 200, frameCount: 6 },
    setup: [],
    timeline: [],
    captions: { enabled: false, cues: [] },
    renderClock: {
      mode: 'deterministic',
      path: '__fixture.renderAt',
      workerCount: 2,
      settleFrames: 2,
      warmupPresentations: 2,
      timeoutMs: 1000,
      setupState: TEST_SETUP_STATE,
    },
  }, {
    artifactKind: 'frame-sequence',
    browserProfileRoot: tmp,
    onStage(event) { events.push(event); },
    onProgress(event) { progress.push(event); },
  });

  assert.equal(launches.length, 2);
  assert.deepEqual(closed.sort(), [0, 1]);
  assert.deepEqual(result.frameFiles.map((frame) => frame.index), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(result.frameFiles.map((frame) => frame.elapsedMs), [0, 33, 67, 100, 133, 167]);
  assert.equal(result.capture.mode, 'deterministic');
  assert.equal(result.capture.workerCount, 2);
  assert.equal(result.capture.seamProofs.length, 3);
  assert.equal(result.capture.seamProofs[0].frame, 3);
  assert.equal(result.capture.seamProofs[0].contentMatches, true);
  assert.equal(result.capture.seamProofs[0].pixelsMatch, true);
  assert.equal(result.capture.seamProofs[0].exactPixelsMatch, false);
  assert.equal(result.capture.seamProofs[0].ssim, 0.9999995);
  assert.match(result.capture.setupStateHash, /^[a-f0-9]{64}$/);
  assert.equal(result.capture.continuationPrepass.projectedFrames, 3);
  assert.equal(result.capture.continuationPrepass.continuationHashes.length, 2);
  assert.deepEqual(
    result.capture.continuationPrepass.continuationHashes.map((entry) => [entry.workerIndex, entry.startFrame]),
    [[0, 0], [1, 3]],
  );
  assert.deepEqual(result.capture.workerRanges.map((range) => [range.startFrame, range.endFrame]), [
    [0, 2],
    [3, 5],
  ]);
  assert.equal(progress.at(-1).completedFrames, 6);
  assert.equal(progress.at(-1).contiguousFrames, 6);
  assert.equal(progress.at(-1).frame, 6);
  assert.ok(events.some((event) => event.stage === 'capture-worker:start' && event.workerIndex === 1));

  // The leader-only prepass projects frames 0..(range1.start-1) with no
  // screenshots, exporting the continuation payload right before frame 3.
  let prepassStart = events.find((event) => event.stage === 'continuation-prepass:start');
  assert.deepEqual(prepassStart, {
    stage: 'continuation-prepass:start',
    ranges: 2,
    projectedFrames: 3,
    boundaries: [3],
  });
  let prepassExported = events.find((event) => event.stage === 'continuation-prepass:exported');
  assert.equal(prepassExported.range, 1);
  assert.equal(prepassExported.workerIndex, 1);
  assert.equal(prepassExported.boundaryFrame, 3);
  assert.match(prepassExported.continuationHash, /^[a-f0-9]{64}$/);
  let prepassDone = events.find((event) => event.stage === 'continuation-prepass:done');
  assert.equal(prepassDone.projectedFrames, 3);
  assert.equal(typeof prepassDone.durationMs, 'number');
  assert.deepEqual(
    prepassDone.continuationHashes.map((entry) => [entry.workerIndex, entry.startFrame]),
    [[0, 0], [1, 3]],
  );
  // Peer boundary hash differs from the range-0 initial hash but matches the
  // hash the prepass exported for that boundary.
  assert.notEqual(prepassDone.continuationHashes[0].continuationHash, prepassDone.continuationHashes[1].continuationHash);
  assert.equal(prepassDone.continuationHashes[1].continuationHash, prepassExported.continuationHash);
  assert.equal(prepassDone.continuationHashes[0].continuationHash, result.capture.setupStateHash);

  // capture-worker:warmed fires in completion order, so key it by worker.
  let warmedByWorker = new Map(
    events.filter((event) => event.stage === 'capture-worker:warmed').map((event) => [event.workerIndex, event]),
  );
  assert.equal(warmedByWorker.get(0).presentations, 2);
  assert.equal(warmedByWorker.get(1).presentations, 0);
  assert.deepEqual(
    [warmedByWorker.get(0).warmupFrame, warmedByWorker.get(0).boundaryFrame, warmedByWorker.get(0).elapsedMs, warmedByWorker.get(0).continued],
    [0, 0, 0, false],
  );
  assert.deepEqual(
    [warmedByWorker.get(1).warmupFrame, warmedByWorker.get(1).boundaryFrame, warmedByWorker.get(1).elapsedMs, warmedByWorker.get(1).continued],
    [2, 3, 67, true],
  );

  let leader = pages[0];
  let peer = pages[1];
  // Leader: canonical export, canonicalize import, prepass warmup + projection
  // (frames 0..2) with a boundary export before frame 3, restore import, then
  // the real range-0 capture, then the range-0/1 seam oracle for the three
  // boundary proof frames 3..5.
  assert.deepEqual(leader, [
    'goto',
    'export:0',
    'import:0',
    'warmup:0', 'settle:0',
    'warmup:0', 'settle:0',
    'render:0', 'settle:0',
    'render:1', 'settle:1',
    'render:2', 'settle:2',
    'export:1',
    'import:0',
    'warmup:0', 'settle:0',
    'warmup:0', 'settle:0',
    'render:0', 'settle:0', 'screenshot:0',
    'render:1', 'settle:1', 'screenshot:1',
    'render:2', 'settle:2', 'screenshot:2',
    'render:3', 'settle:3', 'screenshot-proof:3',
    'render:4', 'settle:4', 'screenshot-proof:4',
    'render:5', 'settle:5', 'screenshot-proof:5',
  ]);
  // Peer: import its own boundary payload (boundary 1), then capture 3..5 with
  // no warmup or boundary re-render.
  assert.deepEqual(peer, [
    'goto',
    'import:1',
    'render:3', 'settle:3', 'screenshot:3',
    'render:4', 'settle:4', 'screenshot:4',
    'render:5', 'settle:5', 'screenshot:5',
  ]);
  assert.equal(peer.filter((event) => event.startsWith('warmup:')).length, 0);
  assert.equal(peer.includes('render:2'), false);
  for (let pageEvents of pages) {
    for (let event of pageEvents.filter((item) => item.startsWith('screenshot'))) {
      let frame = event.split(':')[1];
      assert.ok(pageEvents.lastIndexOf(`render:${frame}`) < pageEvents.indexOf(event));
      assert.ok(pageEvents.lastIndexOf(`settle:${frame}`) < pageEvents.indexOf(event));
    }
  }
});

test('parallel deterministic capture fails closed when worker seam content differs', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-seam-mismatch-'));
  let seamFailureDir = join(tmp, 'seam-failure');
  let launchIndex = 0;
  let provider = createLocalBrowserScreencastProvider({
    puppeteer: {
      async launch() {
        let workerIndex = launchIndex++;
        let page = {
          mouse: { click: async () => {} },
          async setViewport() {},
          async goto() {},
          async waitForFunction() {},
          async evaluate(_fn, arg) {
            if (arg?.methodParts?.at(-1) === 'exportState') return { version: 1 };
            if (arg?.methodParts?.at(-1) === 'importState') return { imported: true };
            if (arg?.frameContext) {
              return {
                presentedTimeMs: arg.frameContext.timeMs,
                projectionId: `seam:${arg.frameContext.frameIndex}`,
                contentDigest: `worker:${workerIndex}`,
              };
            }
            return { settled: true };
          },
          async screenshot(options) { await writeFile(options.path, 'same pixels'); },
        };
        return {
          process() { return { pid: 10 + workerIndex * 10 }; },
          async newPage() { return page; },
          async close() {},
        };
      },
    },
    cwd: tmp,
    framesRoot: tmp,
    execFile: async (command) => command === 'ps'
      ? { stdout: '10 1 100\n11 10 50\n20 1 120\n21 20 30\n' }
      : {},
  });
  await assert.rejects(provider.execute({
    id: 'seam-mismatch',
    frameFormat: 'webp',
    artifactKind: 'frame-sequence',
    surface: { url: 'http://example.test/render' },
    video: { width: 320, height: 180, fps: 30, durationMs: 67, frameCount: 2 },
    setup: [],
    timeline: [],
    captions: { enabled: false, cues: [] },
    renderClock: {
      mode: 'deterministic',
      path: '__fixture.renderAt',
      workerCount: 2,
      setupState: TEST_SETUP_STATE,
    },
    execution: {
      seamFailureDir,
      resourceSampling: { enabled: true, required: true, intervalMs: 100 },
    },
  }, {
    artifactKind: 'frame-sequence',
    browserProfileRoot: tmp,
  }), (error) => (
    error?.code === 'RENDER_SEAM_MISMATCH'
      && error?.proof?.contentMatches === false
      && error?.proof?.pixelsMatch === true
      && error?.proof?.diagnosticFiles?.length === 2
      && error?.proof?.resourceMeasurement?.sampleCount >= 1
      && error?.proof?.resourceMeasurement?.peakRssBytes > 0
      && error?.proof?.workerRanges?.length === 2
  ));
  assert.deepEqual((await readdir(seamFailureDir)).sort(), [
    'frame-00001-worker-0.webp',
    'frame-00001-worker-1.webp',
  ]);
});

function createSeamProbeProvider(tmp, { ssimStderr = 'SSIM All:0.9999995', pixelContent, ffmpegCalls } = {}) {
  let launchIndex = 0;
  return createLocalBrowserScreencastProvider({
    puppeteer: {
      async launch() {
        let workerIndex = launchIndex;
        launchIndex += 1;
        let page = {
          mouse: { click: async () => {} },
          async setViewport() {},
          async goto() {},
          async waitForFunction() {},
          async evaluate(_fn, arg) {
            if (arg?.methodParts?.at(-1) === 'exportState') return { version: 1 };
            if (arg?.methodParts?.at(-1) === 'importState') return { imported: true };
            if (arg?.frameContext) {
              return {
                presentedTimeMs: arg.frameContext.timeMs,
                projectionId: `probe:${arg.frameContext.frameIndex}`,
                contentDigest: `content:${arg.frameContext.frameIndex}`,
              };
            }
            return { settled: true };
          },
          async screenshot(options) {
            let frame = Number(options.path.match(/frame-(\d+)/)?.[1]);
            let isProof = options.path.includes('.seam-');
            let content = typeof pixelContent === 'function'
              ? pixelContent({ frame, isProof })
              : `frame:${frame}`;
            await writeFile(options.path, content);
          },
        };
        return {
          process() { return { pid: 10 + workerIndex * 10 }; },
          async newPage() { return page; },
          async close() {},
        };
      },
    },
    cwd: tmp,
    framesRoot: tmp,
    execFile: async (command, args) => {
      if (command === 'ffmpeg') {
        ffmpegCalls?.push(args);
        return { stderr: ssimStderr };
      }
      return {};
    },
  });
}

function seamProbeJob(renderClockExtras = {}) {
  return {
    id: 'seam-threshold',
    frameFormat: 'webp',
    artifactKind: 'frame-sequence',
    surface: { url: 'http://example.test/render' },
    video: { width: 320, height: 180, fps: 30, durationMs: 67, frameCount: 2 },
    setup: [],
    timeline: [],
    captions: { enabled: false, cues: [] },
    renderClock: {
      mode: 'deterministic',
      path: '__fixture.renderAt',
      workerCount: 2,
      settleFrames: 0,
      warmupPresentations: 0,
      setupState: TEST_SETUP_STATE,
      ...renderClockExtras,
    },
  };
}

const seamProbeOptions = (tmp) => ({ artifactKind: 'frame-sequence', browserProfileRoot: tmp });

const nonExactPixels = ({ frame, isProof }) => (isProof ? `proof:${frame}` : `frame:${frame}`);

test('deterministic distributed capture rejects a seam threshold below the locked minimum', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-seam-below-min-'));
  let provider = createSeamProbeProvider(tmp);
  await assert.rejects(
    provider.execute(seamProbeJob({ seamSsim: 0.99 }), seamProbeOptions(tmp)),
    /renderJob\.renderClock\.seamSsim: must be a number between 0\.999999 and 1/,
  );
});

test('deterministic distributed capture rejects malformed and out-of-range seam thresholds', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-seam-invalid-'));
  for (let seamSsim of [null, '', 'not-a-number', Number.NaN, Infinity, 1.5, -0.5]) {
    let provider = createSeamProbeProvider(tmp);
    await assert.rejects(
      provider.execute(seamProbeJob({ seamSsim }), seamProbeOptions(tmp)),
      (error) => (
        error?.code === 'RENDER_SEAM_THRESHOLD_INVALID'
          && /renderJob\.renderClock\.seamSsim: must be a number between 0\.999999 and 1/.test(error.message)
      ),
    );
  }
});

test('deterministic distributed capture accepts the locked seam minimum and preserves measured evidence', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-seam-accepted-'));
  let provider = createSeamProbeProvider(tmp, {
    ssimStderr: 'SSIM All:0.9999995',
    pixelContent: nonExactPixels,
  });
  let result = await provider.execute(seamProbeJob({ seamSsim: 0.999999 }), seamProbeOptions(tmp));
  assert.equal(result.capture.seamProofs.length, 1);
  let proof = result.capture.seamProofs[0];
  assert.equal(proof.frame, 1);
  assert.deepEqual(proof.workers, [0, 1]);
  assert.equal(proof.requiredSsim, 0.999999);
  assert.equal(proof.ssim, 0.9999995);
  assert.equal(proof.exactPixelsMatch, false);
  assert.equal(proof.pixelsMatch, true);
  assert.equal(proof.contentMatches, true);
  assert.equal(proof.contentDigest, 'content:1');
  assert.equal(proof.peerContentDigest, 'content:1');
  assert.match(proof.pixelHash, /^[a-f0-9]{64}$/);
  assert.match(proof.peerPixelHash, /^[a-f0-9]{64}$/);
  assert.notEqual(proof.pixelHash, proof.peerPixelHash);
});

test('deterministic distributed capture passes the seam through the exact-pixel fast path', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-seam-exact-'));
  let ffmpegCalls = [];
  let provider = createSeamProbeProvider(tmp, {
    ffmpegCalls,
    pixelContent: ({ frame }) => `identical:${frame}`,
  });
  let result = await provider.execute(seamProbeJob(), seamProbeOptions(tmp));
  let proof = result.capture.seamProofs[0];
  assert.equal(proof.exactPixelsMatch, true);
  assert.equal(proof.pixelsMatch, true);
  assert.equal(proof.ssim, 1);
  assert.equal(proof.requiredSsim, 0.999999);
  assert.equal(proof.pixelHash, proof.peerPixelHash);
  assert.equal(ffmpegCalls.length, 0);
});

test('deterministic distributed capture passes when measured ssim meets the locked threshold exactly', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-seam-boundary-pass-'));
  let provider = createSeamProbeProvider(tmp, {
    ssimStderr: 'SSIM All:0.999999',
    pixelContent: nonExactPixels,
  });
  let result = await provider.execute(seamProbeJob(), seamProbeOptions(tmp));
  let proof = result.capture.seamProofs[0];
  assert.equal(proof.exactPixelsMatch, false);
  assert.equal(proof.ssim, 0.999999);
  assert.equal(proof.requiredSsim, 0.999999);
  assert.equal(proof.pixelsMatch, true);
});

test('deterministic distributed capture fails closed when measured ssim falls below the locked threshold', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-seam-boundary-fail-'));
  let provider = createSeamProbeProvider(tmp, {
    ssimStderr: 'SSIM All:0.999998',
    pixelContent: nonExactPixels,
  });
  await assert.rejects(
    provider.execute(seamProbeJob(), seamProbeOptions(tmp)),
    (error) => (
      error?.code === 'RENDER_SEAM_MISMATCH'
        && error?.proof?.exactPixelsMatch === false
        && error?.proof?.pixelsMatch === false
        && error?.proof?.ssim === 0.999998
        && error?.proof?.requiredSsim === 0.999999
    ),
  );
});

test('deterministic distributed capture fails closed on malformed seam ssim evidence', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-seam-malformed-'));
  let provider = createSeamProbeProvider(tmp, {
    ssimStderr: 'SSIM produced no comparable score',
    pixelContent: nonExactPixels,
  });
  await assert.rejects(
    provider.execute(seamProbeJob(), seamProbeOptions(tmp)),
    (error) => (
      error?.code === 'RENDER_SEAM_MISMATCH'
        && error?.proof?.exactPixelsMatch === false
        && error?.proof?.pixelsMatch === false
        && error?.proof?.ssim === 0
        && error?.proof?.requiredSsim === 0.999999
    ),
  );
});

test('render artifact contract keeps omitted seam proof evidence from becoming a pass', () => {
  let normalized = normalizeRenderArtifact({
    kind: 'frame-sequence',
    providerId: 'p',
    frames: 1,
    fps: 30,
    durationSec: 1 / 30,
    width: 320,
    height: 180,
    framesDir: '/tmp/frames',
    frameFiles: [{ path: '/tmp/frames/frame-00000.webp', mimeType: 'image/webp' }],
    source: { url: 'http://example.test/render' },
    capture: {
      mode: 'deterministic',
      workerCount: 2,
      workerRanges: [],
      seamProofs: [{
        frame: 1,
        workers: [0, 1],
        ssim: 0.5,
        requiredSsim: 0.999999,
        pixelHash: 'a'.repeat(64),
        peerPixelHash: 'b'.repeat(64),
      }],
    },
  });
  let proof = normalized.capture.seamProofs[0];
  assert.equal(proof.frame, 1);
  assert.deepEqual(proof.workers, [0, 1]);
  assert.equal(proof.pixelsMatch, false);
  assert.equal(proof.exactPixelsMatch, false);
  assert.equal(proof.contentMatches, false);
  assert.equal(proof.ssim, 0.5);
  assert.equal(proof.requiredSsim, 0.999999);
  assert.equal(proof.pixelHash, 'a'.repeat(64));
  assert.equal(proof.peerPixelHash, 'b'.repeat(64));
});

test('a continued peer imports its boundary state instead of re-rendering it', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-boundary-continuation-'));
  let workers = [];
  let provider = createLocalBrowserScreencastProvider({
    puppeteer: {
      async launch() {
        let calls = [];
        workers.push(calls);
        let page = {
          mouse: { click: async () => {} },
          async setViewport() {},
          async goto() {},
          async waitForFunction() {},
          async evaluate(_fn, arg) {
            if (arg?.methodParts?.at(-1) === 'exportState') return { version: 1 };
            if (arg?.methodParts?.at(-1) === 'importState') {
              calls.push({ type: 'import' });
              return { imported: true };
            }
            if (arg?.frameContext) {
              calls.push({
                type: 'render',
                frame: arg.frameContext.frameIndex,
                warmup: arg.frameContext.warmup === true,
              });
              return {
                presentedTimeMs: arg.frameContext.timeMs,
                projectionId: `continuation:${arg.frameContext.frameIndex}`,
                contentDigest: `content:${arg.frameContext.frameIndex}`,
              };
            }
            if (arg?.speaker) calls.push({ type: 'caption', text: arg.text });
            return { settled: true };
          },
          async screenshot(options) {
            let frame = Number(options.path.match(/frame-(\d+)/)?.[1]);
            await writeFile(options.path, `frame:${frame}`);
          },
        };
        return { async newPage() { return page; }, async close() {} };
      },
    },
    cwd: tmp,
    framesRoot: tmp,
    execFile: async () => ({ stderr: 'SSIM All:1.000000' }),
  });

  await provider.execute({
    id: 'boundary-continuation',
    frameFormat: 'webp',
    artifactKind: 'frame-sequence',
    surface: { url: 'http://example.test/render' },
    video: { width: 320, height: 180, fps: 30, durationMs: 67, frameCount: 2 },
    setup: [],
    timeline: [],
    captions: {
      enabled: true,
      cues: [
        { startMs: 0, endMs: 20, speaker: 'Guide', text: 'Before' },
        { startMs: 20, endMs: 67, speaker: 'Guide', text: 'Boundary' },
      ],
    },
    renderClock: {
      mode: 'deterministic',
      path: '__fixture.renderAt',
      workerCount: 2,
      settleFrames: 0,
      warmupPresentations: 0,
      setupState: TEST_SETUP_STATE,
    },
  }, { artifactKind: 'frame-sequence', browserProfileRoot: tmp });

  // The continued peer never re-renders its boundary frame 0; it imports the
  // continuation payload once and only rasters its own frame 1.
  assert.deepEqual(workers[1].filter((call) => call.type === 'render'), [
    { type: 'render', frame: 1, warmup: false },
  ]);
  assert.equal(workers[1].filter((call) => call.type === 'import').length, 1);
  // The caption overlay is still primed for boundary frame 0 without a render.
  assert.deepEqual(workers[1].filter((call) => call.type === 'caption').map((call) => call.text), [
    'Before',
    'Boundary',
  ]);
  assert.ok(
    workers[1].findIndex((call) => call.type === 'import')
      < workers[1].findIndex((call) => call.type === 'caption'),
  );
});

test('the prepass hands each peer a distinct boundary payload and restores the leader', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-boundary-distinct-'));
  let pages = [];
  let events = [];
  let provider = createLocalBrowserScreencastProvider({
    puppeteer: {
      async launch() {
        let workerIndex = pages.length;
        let calls = [];
        let exports = 0;
        let page = {
          mouse: { click: async () => {} },
          async setViewport() {},
          async goto() {},
          async waitForFunction() {},
          async evaluate(_fn, arg) {
            if (arg?.methodParts?.at(-1) === 'exportState') {
              let boundary = exports;
              exports += 1;
              return { version: 1, boundary };
            }
            if (arg?.methodParts?.at(-1) === 'importState') {
              calls.push({ type: 'import', boundary: arg.args?.[0]?.boundary });
              return { imported: true };
            }
            if (arg?.frameContext) {
              calls.push({
                type: 'render',
                frame: arg.frameContext.frameIndex,
                warmup: arg.frameContext.warmup === true,
                proofOnly: arg.frameContext.proofOnly === true,
              });
              return {
                presentedTimeMs: arg.frameContext.timeMs,
                projectionId: `distinct:${arg.frameContext.frameIndex}`,
                contentDigest: `content:${arg.frameContext.frameIndex}`,
              };
            }
            return { settled: true };
          },
          async screenshot(options) {
            let frame = Number(options.path.match(/frame-(\d+)/)?.[1]);
            await writeFile(options.path, `frame:${frame}`);
          },
        };
        pages.push({ workerIndex, calls });
        return { async newPage() { return page; }, async close() {} };
      },
    },
    cwd: tmp,
    framesRoot: tmp,
    execFile: async () => ({ stderr: 'SSIM All:1.000000' }),
  });

  let result = await provider.execute({
    id: 'boundary-distinct',
    frameFormat: 'webp',
    artifactKind: 'frame-sequence',
    surface: { url: 'http://example.test/render' },
    video: { width: 320, height: 180, fps: 30, durationMs: 200, frameCount: 6 },
    setup: [],
    timeline: [],
    captions: { enabled: false, cues: [] },
    renderClock: {
      mode: 'deterministic',
      path: '__fixture.renderAt',
      workerCount: 3,
      settleFrames: 0,
      warmupPresentations: 1,
      setupState: TEST_SETUP_STATE,
    },
  }, {
    artifactKind: 'frame-sequence',
    browserProfileRoot: tmp,
    onStage(event) { events.push(event); },
  });

  assert.equal(pages.length, 3);
  assert.deepEqual(result.capture.workerRanges.map((range) => [range.startFrame, range.endFrame]), [
    [0, 1],
    [2, 3],
    [4, 5],
  ]);

  // The prepass projects frames 0..3 once on the leader and exports a payload
  // before each of the two mid-video range starts.
  let prepassStart = events.find((event) => event.stage === 'continuation-prepass:start');
  assert.deepEqual(prepassStart.boundaries, [2, 4]);
  assert.equal(prepassStart.projectedFrames, 4);
  let exported = events.filter((event) => event.stage === 'continuation-prepass:exported');
  assert.deepEqual(exported.map((event) => [event.range, event.boundaryFrame]), [[1, 2], [2, 4]]);
  assert.notEqual(exported[0].continuationHash, exported[1].continuationHash);

  // Peers launch concurrently (race) and prior workers also render one seam
  // oracle frame, so identify each browser by the boundary payload it imported
  // and by the frames it actually rastered (non-warmup, non-proof renders).
  let summaries = pages.map(({ calls }) => ({
    importBoundaries: calls.filter((call) => call.type === 'import').map((call) => call.boundary),
    captureFrames: calls
      .filter((call) => call.type === 'render' && !call.warmup && !call.proofOnly)
      .map((call) => call.frame),
  }));

  // The leader imports only the canonical initial payload (boundary 0), twice:
  // once to canonicalize and once to restore after the prepass.
  let leaderSummary = summaries.find((summary) => summary.importBoundaries.length === 2);
  assert.deepEqual(leaderSummary.importBoundaries, [0, 0]);

  let peerSummaries = summaries.filter((summary) => summary !== leaderSummary);
  let peerByBoundary = new Map(peerSummaries.map((summary) => [summary.importBoundaries[0], summary]));
  // Each peer imports exactly one distinct boundary payload and rasters only its
  // own range, never re-rendering the boundary frame the payload already covers.
  assert.deepEqual([...peerByBoundary.keys()].sort(), [1, 2]);
  assert.equal(peerByBoundary.get(1).importBoundaries.length, 1);
  assert.equal(peerByBoundary.get(2).importBoundaries.length, 1);
  assert.deepEqual(peerByBoundary.get(1).captureFrames, [2, 3]);
  assert.deepEqual(peerByBoundary.get(2).captureFrames, [4, 5]);
});

test('parallel deterministic capture fails closed when the boundary export is not an object', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-boundary-export-invalid-'));
  let closed = [];
  let provider = createLocalBrowserScreencastProvider({
    puppeteer: {
      async launch() {
        let workerIndex = closed.length;
        let exportCalls = 0;
        let page = {
          mouse: { click: async () => {} },
          async setViewport() {},
          async goto() {},
          async waitForFunction() {},
          async evaluate(_fn, arg) {
            // The boundary export (the second exportState call) yields a
            // non-object payload; the initial canonical export stays valid.
            if (arg?.methodParts?.at(-1) === 'exportState') {
              exportCalls += 1;
              return exportCalls === 1 ? { version: 1 } : null;
            }
            if (arg?.methodParts?.at(-1) === 'importState') return { imported: true };
            if (arg?.frameContext) {
              return {
                presentedTimeMs: arg.frameContext.timeMs,
                projectionId: `invalid:${arg.frameContext.frameIndex}`,
                contentDigest: `content:${arg.frameContext.frameIndex}`,
              };
            }
            return { settled: true };
          },
          async screenshot() {},
        };
        return {
          async newPage() { return page; },
          async close() { closed.push(workerIndex); },
        };
      },
    },
    cwd: tmp,
    framesRoot: tmp,
    execFile: async () => ({ stderr: 'SSIM All:1.000000' }),
  });

  await assert.rejects(provider.execute({
    id: 'boundary-export-invalid',
    frameFormat: 'webp',
    artifactKind: 'frame-sequence',
    surface: { url: 'http://example.test/render' },
    video: { width: 320, height: 180, fps: 30, durationMs: 67, frameCount: 2 },
    setup: [],
    timeline: [],
    captions: { enabled: false, cues: [] },
    renderClock: {
      mode: 'deterministic',
      path: '__fixture.renderAt',
      workerCount: 2,
      settleFrames: 0,
      warmupPresentations: 0,
      setupState: TEST_SETUP_STATE,
    },
  }, { artifactKind: 'frame-sequence', browserProfileRoot: tmp }), (error) => (
    error?.code === 'RENDER_SETUP_STATE_INVALID'
      && /no object payload/.test(error.message)
  ));
  // Only the leader launched before the prepass failed; its browser is closed.
  assert.deepEqual(closed, [0]);
});

test('parallel deterministic capture aborts the prepass and closes the leader browser', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-prepass-abort-'));
  let controller = new AbortController();
  let closed = 0;
  let renderCalls = 0;
  let provider = createLocalBrowserScreencastProvider({
    puppeteer: {
      async launch() {
        let page = {
          mouse: { click: async () => {} },
          async setViewport() {},
          async goto() {},
          async waitForFunction() {},
          async evaluate(_fn, arg) {
            if (arg?.methodParts?.at(-1) === 'exportState') return { version: 1 };
            if (arg?.methodParts?.at(-1) === 'importState') return { imported: true };
            if (arg?.frameContext) {
              renderCalls += 1;
              // Abort mid-prepass, before the boundary payload is exported.
              controller.abort(new Error('stop during prepass'));
              return {
                presentedTimeMs: arg.frameContext.timeMs,
                projectionId: `prepass:${arg.frameContext.frameIndex}`,
                contentDigest: `content:${arg.frameContext.frameIndex}`,
              };
            }
            return { settled: true };
          },
          async screenshot() {},
        };
        return {
          async newPage() { return page; },
          async close() { closed += 1; },
        };
      },
    },
    cwd: tmp,
    framesRoot: tmp,
    execFile: async () => ({ stderr: 'SSIM All:1.000000' }),
  });

  await assert.rejects(provider.execute({
    id: 'prepass-abort',
    frameFormat: 'webp',
    artifactKind: 'frame-sequence',
    surface: { url: 'http://example.test/render' },
    video: { width: 320, height: 180, fps: 30, durationMs: 134, frameCount: 4 },
    setup: [],
    timeline: [],
    captions: { enabled: false, cues: [] },
    renderClock: {
      mode: 'deterministic',
      path: '__fixture.renderAt',
      workerCount: 2,
      settleFrames: 0,
      warmupPresentations: 0,
      setupState: TEST_SETUP_STATE,
    },
  }, {
    artifactKind: 'frame-sequence',
    browserProfileRoot: tmp,
    signal: controller.signal,
  }), /stop during prepass/);

  // The leader browser is closed and no peers were launched after the abort.
  assert.equal(closed, 1);
  assert.ok(renderCalls >= 1);
});

test('deterministic capture bounds a hanging browser close and records the timeout', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-browser-close-timeout-'));
  let events = [];
  let provider = createLocalBrowserScreencastProvider({
    puppeteer: {
      async launch() {
        let page = {
          mouse: { click: async () => {} },
          async setViewport() {},
          async goto() {},
          async waitForFunction() {},
          async evaluate(_fn, arg) {
            if (arg?.frameContext) {
              return {
                presentedTimeMs: arg.frameContext.timeMs,
                projectionId: `close-timeout:${arg.frameContext.frameIndex}`,
              };
            }
            return { settled: true };
          },
          async screenshot() {},
        };
        return {
          async newPage() { return page; },
          async close() { await new Promise(() => {}); },
        };
      },
    },
    cwd: tmp,
    framesRoot: tmp,
    execFile: async () => {},
  });

  let result = await provider.execute({
    id: 'browser-close-timeout',
    frameFormat: 'webp',
    artifactKind: 'frame-sequence',
    surface: { url: 'http://example.test/render' },
    video: { width: 320, height: 180, fps: 30, durationMs: 34, frameCount: 1 },
    setup: [],
    timeline: [],
    captions: { enabled: false, cues: [] },
    renderClock: { mode: 'deterministic', path: '__fixture.renderAt', workerCount: 1 },
  }, {
    artifactKind: 'frame-sequence',
    browserProfileRoot: tmp,
    browserCloseTimeoutMs: 10,
    onStage(event) { events.push(event); },
  });

  assert.equal(result.capture.browserCloseTimeouts, 1);
  assert.ok(events.some((event) => (
    event.stage === 'browser:close.timeout'
      && event.workerIndex === 0
      && event.timeoutMs === 100
  )));
  assert.ok(events.some((event) => event.stage === 'browser:closed' && event.timedOut === true));
});

test('deterministic capture rejects stateful engine timeline actions', async () => {
  let provider = createLocalBrowserScreencastProvider({
    puppeteer: { async launch() { throw new Error('must not launch'); } },
    execFile: async () => {},
  });
  await assert.rejects(provider.execute({
    id: 'stateful-timeline',
    artifactKind: 'frame-sequence',
    surface: { url: 'http://example.test/render' },
    video: { width: 320, height: 180, fps: 30, durationMs: 100, frameCount: 3 },
    timeline: [{ type: 'clickText', text: 'Next', atMs: 0 }],
    renderClock: { mode: 'deterministic', path: '__fixture.renderAt', workerCount: 2 },
  }, { artifactKind: 'frame-sequence' }), /does not support stateful renderJob\.timeline/);
});

test('parallel capture requires a deterministic render clock', async () => {
  let provider = createLocalBrowserScreencastProvider({
    puppeteer: { async launch() { throw new Error('must not launch'); } },
    execFile: async () => {},
  });
  await assert.rejects(provider.execute({
    id: 'missing-clock',
    artifactKind: 'frame-sequence',
    surface: { url: 'http://example.test/render' },
    video: { width: 320, height: 180, fps: 30, durationMs: 100, frameCount: 3 },
    timeline: [],
    execution: { workerCount: 2 },
  }, { artifactKind: 'frame-sequence' }), /parallel capture requires renderJob\.renderClock/);
});

test('parallel deterministic capture requires canonical setup state handoff', async () => {
  let provider = createLocalBrowserScreencastProvider({
    puppeteer: { async launch() { throw new Error('must not launch'); } },
    execFile: async () => {},
  });
  await assert.rejects(provider.execute({
    id: 'missing-setup-state',
    artifactKind: 'frame-sequence',
    surface: { url: 'http://example.test/render' },
    video: { width: 320, height: 180, fps: 30, durationMs: 100, frameCount: 3 },
    timeline: [],
    renderClock: { mode: 'deterministic', path: '__fixture.renderAt', workerCount: 2 },
  }, { artifactKind: 'frame-sequence' }), (error) => (
    error?.code === 'RENDER_SETUP_STATE_REQUIRED'
      && /requires renderJob\.renderClock\.setupState/.test(error.message)
  ));
});

test('deterministic worker failure aborts and closes the entire pool', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-worker-failure-'));
  let launchIndex = 0;
  let closed = [];
  let provider = createLocalBrowserScreencastProvider({
    puppeteer: {
      async launch() {
        let workerIndex = launchIndex;
        launchIndex += 1;
        let page = {
          mouse: { click: async () => {} },
          async setViewport() {},
          async goto() {},
          async waitForFunction() {},
          async evaluate(_fn, arg) {
            if (arg?.methodParts?.at(-1) === 'exportState') return { version: 1, boundary: workerIndex };
            if (arg?.methodParts?.at(-1) === 'importState') return { imported: true };
            // The peer fails during its parallel raster (after the leader-only
            // prepass has already succeeded), so resource sampling and worker
            // range metrics are populated before the pool aborts.
            if (arg?.frameContext && !arg.frameContext.warmup && workerIndex === 1) {
              throw new Error('render hook failed');
            }
            if (arg?.frameContext) {
              await new Promise((resolve) => setTimeout(resolve, 20));
              return {
                presentedTimeMs: arg.frameContext.timeMs,
                projectionId: 'slow',
                contentDigest: 'slow',
              };
            }
            return { settled: true };
          },
          async screenshot() {},
        };
        return {
          process() { return { pid: 10 + workerIndex * 10 }; },
          async newPage() { return page; },
          async close() { closed.push(workerIndex); },
        };
      },
    },
    cwd: tmp,
    framesRoot: tmp,
    execFile: async (command) => command === 'ps'
      ? { stdout: '10 1 100\n11 10 50\n20 1 120\n21 20 30\n' }
      : {},
  });

  await assert.rejects(provider.execute({
    id: 'worker-failure',
    artifactKind: 'frame-sequence',
    surface: { url: 'http://example.test/render' },
    video: { width: 320, height: 180, fps: 30, durationMs: 200, frameCount: 6 },
    timeline: [],
    renderClock: {
      mode: 'deterministic',
      path: '__fixture.renderAt',
      workerCount: 2,
      setupState: TEST_SETUP_STATE,
    },
  }, {
    artifactKind: 'frame-sequence',
    browserProfileRoot: tmp,
    resourceSampling: { enabled: true, required: true, intervalMs: 100 },
  }), (error) => (
    /render hook failed/.test(error.message)
      && error.proof?.resourceMeasurement?.sampleCount >= 1
      && error.proof?.resourceMeasurement?.peakRssBytes > 0
      && error.proof?.workerRanges?.length >= 1
      && Boolean(error.proof.workerRanges[0].phaseDurationMs)
  ));
  assert.deepEqual(closed.sort(), [0, 1]);
});

test('abort during browser launch closes the late browser process', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-worker-launch-abort-'));
  let markLaunchStarted;
  let launchStarted = new Promise((resolve) => { markLaunchStarted = resolve; });
  let resolveBrowser;
  let browserPromise = new Promise((resolve) => { resolveBrowser = resolve; });
  let closed = 0;
  let controller = new AbortController();
  let provider = createLocalBrowserScreencastProvider({
    puppeteer: {
      async launch() {
        markLaunchStarted();
        return browserPromise;
      },
    },
    cwd: tmp,
    framesRoot: tmp,
    execFile: async () => {},
  });
  let execution = provider.execute({
    id: 'worker-launch-abort',
    artifactKind: 'frame-sequence',
    surface: { url: 'http://example.test/render' },
    video: { width: 320, height: 180, fps: 30, durationMs: 34, frameCount: 1 },
    timeline: [],
    renderClock: { mode: 'deterministic', path: '__fixture.renderAt', workerCount: 1 },
  }, {
    artifactKind: 'frame-sequence',
    browserProfileRoot: tmp,
    browserCloseTimeoutMs: 100,
    signal: controller.signal,
  });

  await launchStarted;
  controller.abort(new Error('stop during launch'));
  resolveBrowser({ async close() { closed += 1; } });

  await assert.rejects(execution, /stop during launch/);
  assert.equal(closed, 1);
});

test('deterministic capture fails on stale presented time and render hook timeout', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-render-clock-errors-'));
  let closed = 0;
  let makeProvider = (evaluate) => createLocalBrowserScreencastProvider({
    puppeteer: {
      async launch() {
        let page = {
          mouse: { click: async () => {} },
          async setViewport() {},
          async goto() {},
          evaluate,
          async screenshot() {},
        };
        return {
          async newPage() { return page; },
          async close() { closed += 1; },
        };
      },
    },
    cwd: tmp,
    framesRoot: tmp,
    execFile: async () => {},
  });
  let job = {
    id: 'render-clock-error',
    artifactKind: 'frame-sequence',
    surface: { url: 'http://example.test/render' },
    video: { width: 320, height: 180, fps: 30, durationMs: 34, frameCount: 1 },
    timeline: [],
    renderClock: {
      mode: 'deterministic',
      path: '__fixture.renderAt',
      workerCount: 1,
      timeoutMs: 15,
    },
  };

  await assert.rejects(makeProvider(async (_fn, arg) => {
    if (arg?.frameContext) return { presentedTimeMs: 40, projectionId: 'stale' };
    return { supported: false };
  }).execute(job, { artifactKind: 'frame-sequence', browserProfileRoot: tmp }), /presented invalid time/);
  await assert.rejects(makeProvider(async (_fn, arg) => {
    if (arg?.frameContext) return new Promise(() => {});
    return { supported: false };
  }).execute(job, { artifactKind: 'frame-sequence', browserProfileRoot: tmp }), /timed out at frame 0/);
  assert.equal(closed, 2);
});

test('local browser screencast provider waits for document fonts before capture', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-font-readiness-'));
  let stageOrder = [];
  let calls = [];
  let page = {
    mouse: { click: async () => {} },
    async setViewport(viewport) {
      this.viewport = viewport;
    },
    async goto(url) {
      this.url = url;
    },
    async evaluate(_fn, payload) {
      calls.push(payload);
      return { supported: true, ready: true };
    },
    async screenshot(options) {
      stageOrder.push(`screenshot:${options.path}`);
    },
  };
  let provider = createLocalBrowserScreencastProvider({
    puppeteer: {
      async launch() {
        return {
          async newPage() { return page; },
          async close() {},
        };
      },
    },
    cwd: tmp,
    framesRoot: tmp,
    execFile: async () => {},
  });

  await provider.execute({
    id: 'font-ready-unit',
    output: { path: 'out/font-ready.mp4' },
    surface: { url: 'http://example.test/fonts' },
    video: {
      width: 320,
      height: 180,
      fps: 1000,
      durationMs: 1,
      frameCount: 1,
    },
    readiness: { fontsTimeoutMs: 5000 },
    setup: [],
    timeline: [],
    captions: { enabled: false, cues: [] },
  }, {
    artifactKind: 'frame-sequence',
    onStage(event) {
      stageOrder.push(event.stage);
    },
  });

  assert.deepEqual(calls, [{ timeoutMs: 5000 }]);
  assert.ok(stageOrder.indexOf('setup:done') < stageOrder.indexOf('fonts:wait'));
  assert.ok(stageOrder.indexOf('fonts:wait') < stageOrder.indexOf('fonts:ready'));
  assert.ok(stageOrder.indexOf('fonts:ready') < stageOrder.indexOf('capture:start'));
  assert.ok(stageOrder.indexOf('capture:start') < stageOrder.findIndex((stage) => stage.startsWith('screenshot:')));
});

test('local browser screencast provider aborts capture and closes browser', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-render-abort-'));
  let controller = new AbortController();
  let progress = [];
  let execCalls = [];
  let closed = false;
  let page = {
    mouse: { click: async () => {} },
    async setViewport(viewport) {
      this.viewport = viewport;
    },
    async goto(url) {
      this.url = url;
    },
    async screenshot(options) {
      this.lastScreenshot = options.path;
    },
  };
  let provider = createLocalBrowserScreencastProvider({
    puppeteer: {
      async launch() {
        return {
          async newPage() { return page; },
          async close() { closed = true; },
        };
      },
    },
    cwd: tmp,
    framesRoot: tmp,
    execFile: async (...args) => {
      execCalls.push(args);
    },
  });

  await assert.rejects(
    () => provider.execute({
      id: 'abort-unit',
      output: { path: 'out/abort.mp4' },
      surface: { url: 'http://example.test/abort' },
      video: {
        width: 320,
        height: 180,
        fps: 1000,
        durationMs: 3,
        frameCount: 3,
      },
      setup: [],
      timeline: [],
      captions: { enabled: false, cues: [] },
    }, {
      signal: controller.signal,
      onProgress(event) {
        progress.push(event.frame);
        if (event.frame === 1) controller.abort('render cancel smoke');
      },
    }),
    /render cancel smoke/,
  );

  assert.equal(closed, true);
  assert.deepEqual(progress, [1]);
  assert.equal(execCalls.length, 0);
});

test('local browser screencast provider can call live page methods and capture state', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-render-provider-state-'));
  let selectorCalls = [];
  let waitCalls = [];
  let evaluateCalls = [];
  let closed = false;
  let page = {
    mouse: { click: async () => {} },
    async setViewport(viewport) {
      this.viewport = viewport;
    },
    async goto(url) {
      this.url = url;
    },
    async waitForSelector(selector, options) {
      selectorCalls.push({ selector, options });
    },
    async waitForFunction(_fn, _options, parts) {
      waitCalls.push(parts);
    },
    async evaluate(_fn, payload) {
      evaluateCalls.push(payload);
      if (Object.hasOwn(payload, 'args')) return { status: 'started' };
      return { status: 'playing', caption: { text: 'Live caption' } };
    },
    async screenshot(options) {
      this.lastScreenshot = options.path;
    },
  };
  let provider = createLocalBrowserScreencastProvider({
    puppeteer: {
      async launch() {
        return {
          async newPage() { return page; },
          async close() { closed = true; },
        };
      },
    },
    cwd: tmp,
    framesRoot: tmp,
    execFile: async () => {},
  });

  await provider.execute({
    id: 'state-unit',
    output: { path: 'out/unit.mp4' },
    surface: { url: 'http://example.test/' },
    video: {
      width: 320,
      height: 180,
      fps: 1000,
      durationMs: 1,
      frameCount: 1,
    },
    setup: [
      { type: 'waitForSelector', selector: '[data-tab-id="orders-tab"]', state: 'attached', timeoutMs: 12000 },
      { type: 'waitForWindowPredicate', path: '__maximoTourRender.ready' },
      { type: 'waitForWindowMethod', path: '__maximoTourRender.playProviderTour' },
      {
        type: 'callWindowMethod',
        path: '__maximoTourRender.playProviderTour',
        args: [{ cues: [{ startMs: 0, endMs: 1000, text: 'Live caption' }] }],
      },
    ],
    timeline: [],
    captions: { enabled: false, cues: [] },
    captureState: {
      enabled: true,
      path: '__maximoTourRender.getState',
      outputPath: 'out/state.json',
      sampleEveryFrames: 1,
    },
  });

  let state = JSON.parse(await readFile(join(tmp, 'out/state.json'), 'utf8'));
  assert.equal(page.url, 'http://example.test/');
  assert.deepEqual(selectorCalls, [
    { selector: '[data-tab-id="orders-tab"]', options: { timeout: 12000, state: 'attached' } },
  ]);
  assert.deepEqual(waitCalls, [
    ['__maximoTourRender', 'ready'],
    ['__maximoTourRender', 'playProviderTour'],
    ['__maximoTourRender', 'playProviderTour'],
  ]);
  assert.equal(evaluateCalls.length, 3);
  assert.deepEqual(evaluateCalls[1], { timeoutMs: 10000 });
  assert.equal(state.samples.length, 1);
  assert.equal(state.samples[0].state.status, 'playing');
  assert.equal(state.samples[0].state.caption.text, 'Live caption');
  assert.equal(closed, true);
});

test('local browser screencast provider labels setup action failures', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-render-provider-setup-error-'));
  let closed = false;
  let page = {
    async setViewport() {},
    async goto() {},
    async waitForFunction() {
      throw new Error('not ready');
    },
  };
  let provider = createLocalBrowserScreencastProvider({
    puppeteer: {
      async launch() {
        return {
          async newPage() { return page; },
          async close() { closed = true; },
        };
      },
    },
    cwd: tmp,
    framesRoot: tmp,
    execFile: async () => {},
  });

  await assert.rejects(
    () => provider.execute({
      id: 'setup-error-unit',
      output: { path: 'out/unit.mp4' },
      surface: { url: 'http://example.test/' },
      video: {
        width: 320,
        height: 180,
        fps: 1,
        durationMs: 1000,
        frameCount: 1,
      },
      setup: [
        { type: 'waitForWindowPredicate', path: '__maximoTourRender.ready' },
      ],
      timeline: [],
      captions: { enabled: false, cues: [] },
    }),
    /setup action 0 \(waitForWindowPredicate:__maximoTourRender\.ready\) failed: not ready/,
  );
  assert.equal(closed, true);
});

const ATTRIBUTED_FRAME_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const ATTRIBUTED_FRAME_PNG_BASE64 = ATTRIBUTED_FRAME_PNG.toString('base64');

function makeAttributedHarness({ frameStale = 1, contentDigestByWorker = false } = {}) {
  let logs = [];
  let stopped = [];
  let launchIndex = 0;
  let puppeteer = {
    async launch() {
      let workerIndex = launchIndex;
      launchIndex += 1;
      let log = [];
      logs[workerIndex] = log;
      let exportCalls = 0;
      let page = {
        __log: log,
        __workerIndex: workerIndex,
        mouse: { click: async () => {} },
        async setViewport() {},
        async goto() {},
        async waitForFunction() {},
        async evaluate(_fn, arg) {
          if (arg?.methodParts?.at(-1) === 'exportState') {
            let boundary = exportCalls;
            exportCalls += 1;
            return { version: 1, boundary };
          }
          if (arg?.methodParts?.at(-1) === 'importState') return { imported: true };
          if (arg?.frameContext) {
            if (!arg.frameContext.warmup && !arg.frameContext.proofOnly) {
              log.push(`render:${arg.frameContext.frameIndex}`);
            }
            return {
              presentedTimeMs: arg.frameContext.timeMs,
              projectionId: `fixture:${arg.frameContext.frameIndex}`,
              contentDigest: contentDigestByWorker
                ? `worker:${workerIndex}`
                : `content:${arg.frameContext.frameIndex}`,
              ...(arg.capturePresentationMarker ? {
                presentationMarker: (arg.frameContext.frameIndex + 1) * 100,
              } : {}),
            };
          }
          if (arg?.settleFrames != null) return { settled: true };
          return { supported: false };
        },
        async screenshot(options) {
          await writeFile(options.path, `oracle:${options.path}`);
        },
      };
      return {
        process: () => ({ pid: 4200 + workerIndex }),
        async newPage() { return page; },
        async close() { log.push('close'); },
      };
    },
  };
  let compositorCapture = {
    async openSession({ page, sessionId, width, height }) {
      let log = page.__log;
      let pending = [];
      return {
        sessionId,
        async next() {
          let lastRender = log.findLast((entry) => entry.startsWith('render:'));
          let frameIndex = Number(lastRender.split(':')[1]);
          let clock = (frameIndex + 1) * 100;
          if (pending.length === 0) {
            pending = [];
            for (let stale = frameStale; stale >= 1; stale -= 1) {
              pending.push({
                sessionId,
                timestamp: clock - stale,
                width,
                height,
                devicePixelRatio: 1,
                data: ATTRIBUTED_FRAME_PNG_BASE64,
              });
            }
            pending.push({
              sessionId,
              timestamp: clock + 1,
              width,
              height,
              devicePixelRatio: 1,
              data: ATTRIBUTED_FRAME_PNG_BASE64,
            });
          }
          log.push('next');
          return pending.shift() ?? null;
        },
        async ack() {},
        async stop() { log.push('stop'); stopped.push(sessionId); },
      };
    },
  };
  return { puppeteer, compositorCapture, logs, stopped };
}

function attributedJob(overrides = {}) {
  return {
    id: 'attributed',
    frameFormat: 'png',
    artifactKind: 'frame-sequence',
    surface: { url: 'http://example.test/render' },
    video: { width: 320, height: 180, fps: 30, durationMs: 100, frameCount: 3 },
    setup: [],
    timeline: [],
    captions: { enabled: false, cues: [] },
    renderClock: {
      mode: 'deterministic',
      path: '__fixture.renderAt',
      workerCount: 1,
      settleFrames: 1,
      timeoutMs: 1000,
      transport: 'attributed-compositor',
    },
    ...overrides,
  };
}

test('render capture transport contract normalizes kinds and rejects unsupported values', () => {
  assert.equal(normalizeCaptureTransportKind(undefined), 'screenshot');
  assert.equal(normalizeCaptureTransportKind('attributed-compositor'), 'attributed-compositor');
  assert.throws(
    () => normalizeCaptureTransportKind('mjpeg'),
    (error) => error.code === 'RENDER_TRANSPORT_UNSUPPORTED' && /unsupported transport "mjpeg"/.test(error.message),
  );
});

test('compositor frame event contract validates every field and fixed dimensions', () => {
  let expected = { width: 320, height: 180, devicePixelRatio: 1, sessionId: 'worker-0' };
  let event = normalizeCompositorFrameEvent({
    sessionId: 'worker-0',
    timestamp: 12.5,
    width: 320,
    height: 180,
    devicePixelRatio: 1,
    data: ATTRIBUTED_FRAME_PNG_BASE64,
  }, expected);
  assert.deepEqual(event, {
    sessionId: 'worker-0',
    timestamp: 12.5,
    width: 320,
    height: 180,
    devicePixelRatio: 1,
    encoding: 'base64',
    data: ATTRIBUTED_FRAME_PNG_BASE64,
  });
  let bytes = normalizeCompositorFrameEvent({
    sessionId: 'worker-0',
    timestamp: 0,
    width: 320,
    height: 180,
    dpr: 1,
    data: new Uint8Array([1, 2, 3]),
  }, expected);
  assert.equal(bytes.encoding, 'bytes');
  for (let [patch, pattern] of [
    [{ sessionId: '' }, /compositorFrameEvent\.sessionId: is required/],
    [{ timestamp: 'soon' }, /compositorFrameEvent\.timestamp: must be a non-negative epoch-millisecond number/],
    [{ timestamp: -1 }, /compositorFrameEvent\.timestamp: must be a non-negative epoch-millisecond number/],
    [{ data: '' }, /compositorFrameEvent\.data: must be non-empty base64 data/],
    [{ data: 42 }, /compositorFrameEvent\.data: must be a base64 string or byte buffer/],
    [{ width: 321 }, /compositorFrameEvent\.width: must equal fixed capture width 320/],
    [{ height: 181 }, /compositorFrameEvent\.height: must equal fixed capture height 180/],
    [{ devicePixelRatio: 2 }, /compositorFrameEvent\.devicePixelRatio: must equal fixed capture dpr 1/],
    [{ sessionId: 'worker-9' }, /compositorFrameEvent\.sessionId: must equal session "worker-0"/],
  ]) {
    assert.throws(() => normalizeCompositorFrameEvent({
      sessionId: 'worker-0',
      timestamp: 5,
      width: 320,
      height: 180,
      devicePixelRatio: 1,
      data: ATTRIBUTED_FRAME_PNG_BASE64,
      ...patch,
    }, expected), pattern);
  }
});

test('render artifact contract preserves attributed transport evidence without frame bytes', () => {
  let normalized = normalizeRenderArtifact({
    kind: 'frame-sequence',
    providerId: 'p',
    frames: 1,
    fps: 30,
    durationSec: 1 / 30,
    width: 320,
    height: 180,
    framesDir: '/tmp/frames',
    frameFiles: [{ path: '/tmp/frames/frame-00000.png' }],
    source: { url: 'http://example.test/render' },
    capture: {
      mode: 'deterministic',
      workerCount: 2,
      transport: {
        name: 'attributed-compositor',
        policyVersion: ATTRIBUTED_COMPOSITOR_POLICY_VERSION,
        acceptedFrames: 6,
        discardedFrames: 4,
        attributionLatencyMs: { meanMs: 2.5, maxMs: 9 },
        presentationGapMs: { meanMs: 1, maxMs: 3 },
        width: 320,
        height: 180,
        devicePixelRatio: 1,
        sessionsStopped: 2,
        sessionStopTimeouts: 0,
        sessionStopErrors: 0,
      },
    },
  });
  assert.deepEqual(normalized.capture.transport, {
    name: 'attributed-compositor',
    policyVersion: ATTRIBUTED_COMPOSITOR_POLICY_VERSION,
    acceptedFrames: 6,
    discardedFrames: 4,
    attributionLatencyMs: { meanMs: 2.5, maxMs: 9 },
    presentationGapMs: { meanMs: 1, maxMs: 3 },
    width: 320,
    height: 180,
    devicePixelRatio: 1,
    sessionsStopped: 2,
    sessionStopTimeouts: 0,
    sessionStopErrors: 0,
  });
  assert.throws(
    () => normalizeRenderArtifact({
      kind: 'frame-sequence',
      providerId: 'p',
      frames: 1,
      fps: 30,
      durationSec: 1 / 30,
      width: 320,
      height: 180,
      framesDir: '/tmp/frames',
      frameFiles: [{ path: '/tmp/frames/frame-00000.png' }],
      source: { url: 'http://example.test/render' },
      capture: { mode: 'deterministic', workerCount: 1, transport: { name: 'attributed-compositor' } },
    }),
    /renderArtifact\.capture\.transport\.policyVersion: is required/,
  );
  assert.throws(
    () => normalizeRenderArtifact({
      kind: 'frame-sequence',
      providerId: 'p',
      frames: 1,
      fps: 30,
      durationSec: 1 / 30,
      width: 320,
      height: 180,
      framesDir: '/tmp/frames',
      frameFiles: [{ path: '/tmp/frames/frame-00000.png' }],
      source: { url: 'http://example.test/render' },
      capture: {
        mode: 'deterministic',
        workerCount: 1,
        transport: { name: 'attributed-compositor', policyVersion: 'attributed-compositor/0' },
      },
    }),
    /renderArtifact\.capture\.transport\.policyVersion: must equal "attributed-compositor\/1"/,
  );
});

test('attributed transport is opt-in and rejects unsupported adapter or format with stable codes', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-attributed-optin-'));
  let harness = makeAttributedHarness();

  await assert.rejects(
    createLocalBrowserScreencastProvider({ puppeteer: harness.puppeteer, cwd: tmp, framesRoot: tmp, execFile: async () => {} })
      .execute(attributedJob(), { artifactKind: 'frame-sequence', browserProfileRoot: tmp }),
    (error) => error.code === 'RENDER_COMPOSITOR_ADAPTER_REQUIRED',
  );

  await assert.rejects(
    createLocalBrowserScreencastProvider({
      puppeteer: harness.puppeteer,
      compositorCapture: harness.compositorCapture,
      cwd: tmp,
      framesRoot: tmp,
      execFile: async () => {},
    }).execute(attributedJob({ frameFormat: 'webp' }), { artifactKind: 'frame-sequence', browserProfileRoot: tmp }),
    (error) => error.code === 'RENDER_TRANSPORT_FORMAT_UNSUPPORTED',
  );

  await assert.rejects(
    createLocalBrowserScreencastProvider({
      puppeteer: harness.puppeteer,
      compositorCapture: harness.compositorCapture,
      cwd: tmp,
      framesRoot: tmp,
      execFile: async () => {},
    }).execute(attributedJob({
      renderClock: {
        mode: 'deterministic',
        path: '__fixture.renderAt',
        workerCount: 1,
        transport: 'mjpeg',
      },
    }), { artifactKind: 'frame-sequence', browserProfileRoot: tmp }),
    (error) => error.code === 'RENDER_TRANSPORT_UNSUPPORTED',
  );
});

test('injected compositor adapter stays unused unless the attributed transport is opted in', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-attributed-default-'));
  let harness = makeAttributedHarness();
  let openCalls = 0;
  let compositorCapture = {
    async openSession(args) {
      openCalls += 1;
      return harness.compositorCapture.openSession(args);
    },
  };
  let result = await createLocalBrowserScreencastProvider({
    puppeteer: harness.puppeteer,
    compositorCapture,
    cwd: tmp,
    framesRoot: tmp,
    execFile: async () => {},
  }).execute(attributedJob({
    renderClock: { mode: 'deterministic', path: '__fixture.renderAt', workerCount: 1 },
  }), { artifactKind: 'frame-sequence', browserProfileRoot: tmp });

  assert.equal(openCalls, 0);
  assert.equal(result.capture.frameCaptureType, 'screenshot');
  assert.equal(result.capture.transport, undefined);
});

test('attributed transport discards stale events and accepts the first frame at or after the marker', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-attributed-order-'));
  let harness = makeAttributedHarness({ frameStale: 2 });
  let result = await createLocalBrowserScreencastProvider({
    puppeteer: harness.puppeteer,
    compositorCapture: harness.compositorCapture,
    cwd: tmp,
    framesRoot: tmp,
    execFile: async () => {},
  }).execute(attributedJob(), { artifactKind: 'frame-sequence', browserProfileRoot: tmp });

  assert.equal(result.capture.frameCaptureType, 'attributed-compositor');
  assert.equal(result.capture.transport.name, 'attributed-compositor');
  assert.equal(result.capture.transport.policyVersion, ATTRIBUTED_COMPOSITOR_POLICY_VERSION);
  assert.equal(result.capture.transport.acceptedFrames, 3);
  assert.equal(result.capture.transport.discardedFrames, 6);
  assert.equal(result.capture.transport.width, 320);
  assert.equal(result.capture.transport.devicePixelRatio, 1);
  assert.equal(result.capture.transport.sessionsStopped, 1);
  assert.equal(result.capture.transport.sessionStopTimeouts, 0);
  assert.equal(result.capture.transport.sessionStopErrors, 0);
  assert.deepEqual(result.frameFiles.map((frame) => frame.index), [0, 1, 2]);
  for (let frame of result.frameFiles) {
    assert.deepEqual(await readFile(frame.path), ATTRIBUTED_FRAME_PNG);
  }
  // Ordered per frame: render, then discard-then-accept; and frame N+1
  // never renders before frame N's attribution completes.
  assert.deepEqual(harness.logs[0].slice(0, 12), [
    'render:0', 'next', 'next', 'next',
    'render:1', 'next', 'next', 'next',
    'render:2', 'next', 'next', 'next',
  ]);
});

test('attributed transport rejects malformed compositor frames and stops the stream and browser', async () => {
  let cases = [
    [{ timestamp: Number.NaN }, /compositorFrameEvent\.timestamp: must be a non-negative epoch-millisecond number/],
    [{ sessionId: '' }, /compositorFrameEvent\.sessionId: is required/],
    [{ data: '' }, /compositorFrameEvent\.data: must be non-empty base64 data/],
    [{ data: Buffer.from('not-png').toString('base64') }, (error) => (
      error.code === 'RENDER_COMPOSITOR_FRAME_FORMAT_INVALID'
    )],
    [{ width: 999 }, /compositorFrameEvent\.width: must equal fixed capture width 320/],
    [{ devicePixelRatio: 3 }, /compositorFrameEvent\.devicePixelRatio: must equal fixed capture dpr 1/],
  ];
  for (let [patch, pattern] of cases) {
    let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-attributed-malformed-'));
    let stopped = [];
    let closed = [];
    let compositorCapture = {
      async openSession({ page, sessionId, width, height }) {
        return {
          sessionId,
          async next() {
            return {
              sessionId,
              timestamp: 20,
              width,
              height,
              devicePixelRatio: 1,
              data: ATTRIBUTED_FRAME_PNG_BASE64,
              ...patch,
            };
          },
          async ack() {},
          async stop() { stopped.push(sessionId); },
        };
      },
    };
    let puppeteer = {
      async launch() {
        return {
          async newPage() {
            return {
              mouse: { click: async () => {} },
              async setViewport() {},
              async goto() {},
              async waitForFunction() {},
              async evaluate(_fn, arg) {
                if (arg?.frameContext) {
                  return {
                    presentedTimeMs: arg.frameContext.timeMs,
                    projectionId: `fixture:${arg.frameContext.frameIndex}`,
                    contentDigest: `content:${arg.frameContext.frameIndex}`,
                    presentationMarker: 10,
                  };
                }
                if (arg?.settleFrames != null) return { settled: true };
                return { supported: false };
              },
              async screenshot() {},
            };
          },
          async close() { closed.push(true); },
        };
      },
    };
    await assert.rejects(
      createLocalBrowserScreencastProvider({
        puppeteer,
        compositorCapture,
        cwd: tmp,
        framesRoot: tmp,
        execFile: async () => {},
      }).execute(attributedJob(), { artifactKind: 'frame-sequence', browserProfileRoot: tmp }),
      pattern,
    );
    assert.equal(stopped.length, 1);
    assert.equal(closed.length, 1);
  }
});

test('attributed transport times out on a stalled compositor and closes everything', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-attributed-timeout-'));
  let stopped = [];
  let closed = [];
  let compositorCapture = {
    async openSession({ sessionId }) {
      return {
        sessionId,
        next() { return new Promise(() => {}); },
        async ack() {},
        async stop() { stopped.push(sessionId); },
      };
    },
  };
  let puppeteer = {
    async launch() {
      return {
        async newPage() {
          return {
            mouse: { click: async () => {} },
            async setViewport() {},
            async goto() {},
            async waitForFunction() {},
            async evaluate(_fn, arg) {
              if (arg?.frameContext) {
                return {
                  presentedTimeMs: arg.frameContext.timeMs,
                  projectionId: 'x',
                  presentationMarker: 1,
                };
              }
              if (arg?.settleFrames != null) return { settled: true };
              return { supported: false };
            },
            async screenshot() {},
          };
        },
        async close() { closed.push(true); },
      };
    },
  };
  await assert.rejects(
    createLocalBrowserScreencastProvider({
      puppeteer,
      compositorCapture,
      cwd: tmp,
      framesRoot: tmp,
      execFile: async () => {},
    }).execute(attributedJob({
      renderClock: {
        mode: 'deterministic',
        path: '__fixture.renderAt',
        workerCount: 1,
        settleFrames: 0,
        timeoutMs: 40,
        transport: 'attributed-compositor',
      },
    }), { artifactKind: 'frame-sequence', browserProfileRoot: tmp }),
    (error) => error.code === 'RENDER_COMPOSITOR_ATTRIBUTION_TIMEOUT',
  );
  assert.equal(stopped.length, 1);
  assert.equal(closed.length, 1);
});

test('attributed transport records a rejected session stop without claiming successful cleanup', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-attributed-stop-error-'));
  let harness = makeAttributedHarness();
  let compositorCapture = {
    async openSession(args) {
      let session = await harness.compositorCapture.openSession(args);
      return {
        ...session,
        async stop() { throw new Error('stop rejected'); },
      };
    },
  };
  let result = await createLocalBrowserScreencastProvider({
    puppeteer: harness.puppeteer,
    compositorCapture,
    cwd: tmp,
    framesRoot: tmp,
    execFile: async () => {},
  }).execute(attributedJob(), { artifactKind: 'frame-sequence', browserProfileRoot: tmp });

  assert.equal(result.capture.transport.sessionsStopped, 0);
  assert.equal(result.capture.transport.sessionStopErrors, 1);
  assert.equal(result.capture.transport.sessionStopTimeouts, 0);
  assert.ok(harness.logs[0].includes('close'));
});

test('attributed transport aborts on signal and closes the stream and browser', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-attributed-abort-'));
  let controller = new AbortController();
  let harness = makeAttributedHarness();
  await assert.rejects(
    createLocalBrowserScreencastProvider({
      puppeteer: harness.puppeteer,
      compositorCapture: harness.compositorCapture,
      cwd: tmp,
      framesRoot: tmp,
      execFile: async () => {},
    }).execute(attributedJob(), {
      artifactKind: 'frame-sequence',
      browserProfileRoot: tmp,
      signal: controller.signal,
      onStage(event) {
        if (event.stage === 'capture-worker:start') controller.abort('attributed abort smoke');
      },
    }),
    /attributed abort smoke/,
  );
  assert.equal(harness.stopped.length, 1);
  assert.ok(harness.logs[0].includes('stop'));
  assert.ok(harness.logs[0].includes('close'));
});

test('attributed transport renders multi-worker canonical continuation ranges with valid seams', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-attributed-workers-'));
  let harness = makeAttributedHarness();
  let result = await createLocalBrowserScreencastProvider({
    puppeteer: harness.puppeteer,
    compositorCapture: harness.compositorCapture,
    cwd: tmp,
    framesRoot: tmp,
    execFile: async () => ({ stderr: 'SSIM All:0.9999995' }),
  }).execute(attributedJob({
    video: { width: 320, height: 180, fps: 30, durationMs: 200, frameCount: 6 },
    renderClock: {
      mode: 'deterministic',
      path: '__fixture.renderAt',
      workerCount: 2,
      settleFrames: 1,
      warmupPresentations: 0,
      timeoutMs: 1000,
      transport: 'attributed-compositor',
      setupState: TEST_SETUP_STATE,
    },
  }), { artifactKind: 'frame-sequence', browserProfileRoot: tmp });

  assert.equal(result.capture.workerCount, 2);
  assert.equal(result.capture.frameCaptureType, 'attributed-compositor');
  assert.deepEqual(result.frameFiles.map((frame) => frame.index), [0, 1, 2, 3, 4, 5]);
  assert.equal(result.capture.seamProofs.length, 3);
  assert.equal(result.capture.seamProofs[0].contentMatches, true);
  assert.equal(result.capture.seamProofs[0].pixelsMatch, true);
  assert.equal(result.capture.continuationPrepass.continuationHashes.length, 2);
  assert.equal(result.capture.transport.acceptedFrames, 6);
  assert.equal(result.capture.transport.sessionsStopped, 2);
  assert.match(result.capture.setupStateHash, /^[a-f0-9]{64}$/);
});

test('attributed transport fails closed on a worker seam mismatch and stops every session', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-attributed-seam-'));
  let harness = makeAttributedHarness({ contentDigestByWorker: true });
  await assert.rejects(
    createLocalBrowserScreencastProvider({
      puppeteer: harness.puppeteer,
      compositorCapture: harness.compositorCapture,
      cwd: tmp,
      framesRoot: tmp,
      execFile: async () => ({ stderr: 'SSIM All:0.9999995' }),
    }).execute(attributedJob({
      video: { width: 320, height: 180, fps: 30, durationMs: 67, frameCount: 2 },
      renderClock: {
        mode: 'deterministic',
        path: '__fixture.renderAt',
        workerCount: 2,
        settleFrames: 1,
        warmupPresentations: 0,
        timeoutMs: 1000,
        transport: 'attributed-compositor',
        setupState: TEST_SETUP_STATE,
      },
    }), { artifactKind: 'frame-sequence', browserProfileRoot: tmp }),
    (error) => error.code === 'RENDER_SEAM_MISMATCH',
  );
  assert.equal(harness.stopped.length, 2);
  for (let log of harness.logs) assert.ok(log.includes('stop') && log.includes('close'));
});

test('attributed transport artifact evidence survives without frame bytes', async () => {
  let tmp = await mkdtemp(join(os.tmpdir(), 'sym-engine-attributed-evidence-'));
  let harness = makeAttributedHarness({ frameStale: 2 });
  let result = await createLocalBrowserScreencastProvider({
    puppeteer: harness.puppeteer,
    compositorCapture: harness.compositorCapture,
    cwd: tmp,
    framesRoot: tmp,
    execFile: async () => {},
  }).execute(attributedJob(), { artifactKind: 'frame-sequence', browserProfileRoot: tmp });

  let transport = result.capture.transport;
  assert.deepEqual(Object.keys(transport).sort(), [
    'acceptedFrames',
    'attributionLatencyMs',
    'devicePixelRatio',
    'discardedFrames',
    'height',
    'name',
    'policyVersion',
    'presentationGapMs',
    'sessionStopErrors',
    'sessionStopTimeouts',
    'sessionsStopped',
    'width',
  ]);
  assert.equal(typeof transport.attributionLatencyMs.meanMs, 'number');
  assert.equal(typeof transport.presentationGapMs.maxMs, 'number');
  assert.equal(result.capture.browserCloseTimeouts, 0);
  let serialized = JSON.stringify(result);
  assert.equal(serialized.includes(ATTRIBUTED_FRAME_PNG_BASE64), false);
  for (let frame of result.frameFiles) {
    assert.equal(Object.hasOwn(frame, 'data'), false);
    assert.ok(typeof frame.path === 'string');
  }
});
