import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  RENDER_PROOF_MANIFEST_STATE_FIELDS,
  buildAudioConcatArgs,
  buildAudioConcatListLine,
  buildAudioMuxArgs,
  buildAudioOverlapMixArgs,
  buildCaptionOverlayFilter,
  buildFrameSequenceEncodeArgs,
  buildRenderProofManifestProjection,
  buildSegmentConcatArgs,
  buildSegmentConcatListLine,
  parseFfprobeJson,
  projectRenderProofManifestState,
} from '../render-finalize.js';

test('render finalize builds frame sequence x264 args with optional audio', () => {
  assert.deepEqual(
    buildFrameSequenceEncodeArgs({
      fps: 12,
      frameInput: '/cache/frames/frame-%05d.png',
      audioPath: '/cache/audio/narration.wav',
      width: 1280,
      height: 720,
      outputPath: '/cache/render.mp4',
    }),
    [
      '-y',
      '-framerate', '12',
      '-i', '/cache/frames/frame-%05d.png',
      '-i', '/cache/audio/narration.wav',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=1280:720',
      '-fps_mode', 'cfr',
      '-r', '12',
      '-c:a', 'aac',
      '-b:a', '192k',
      '/cache/render.mp4',
    ],
  );

  assert.deepEqual(
    buildFrameSequenceEncodeArgs({
      fps: 30,
      startNumber: 4,
      frameInput: 'frames/frame_%05d.png',
      scaleFilter: 'scale=640:360',
      outputPath: 'silent.mp4',
    }),
    [
      '-y',
      '-framerate', '30',
      '-start_number', '4',
      '-i', 'frames/frame_%05d.png',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=640:360',
      '-fps_mode', 'cfr',
      '-r', '30',
      'silent.mp4',
    ],
  );
});

test('render finalize builds reusable caption overlay filters for final video', () => {
  let filter = buildCaptionOverlayFilter({
    captionsPath: "/cache/captions/tour:one.vtt",
    captionStyle: { preset: 'tiktok', fontSize: 54, marginBottom: 80 },
    width: 1080,
    height: 1920,
  });

  assert.match(filter, /^subtitles=\/cache\/captions\/tour\\:one\.vtt:force_style='/);
  assert.match(filter, /Fontsize=54/);
  assert.match(filter, /MarginV=80/);
  assert.equal(buildCaptionOverlayFilter({}), '');
  let assFilter = buildCaptionOverlayFilter({
    captionsPath: '/cache/captions/render.ass',
    captionStyle: { preset: 'tiktok', fontSize: 28, marginV: 80 },
  });
  assert.equal(assFilter, 'subtitles=/cache/captions/render.ass');
  assert.doesNotMatch(assFilter, /force_style/);
  let invalidMarginFilter = buildCaptionOverlayFilter({
    captionsPath: '/cache/captions/render.vtt',
    captionStyle: { preset: 'tiktok', marginV: 'invalid' },
    width: 1080,
    height: 1920,
  });
  assert.doesNotMatch(invalidMarginFilter, /NaN/);
  assert.match(invalidMarginFilter, /MarginV=288/);

  let args = buildFrameSequenceEncodeArgs({
    fps: 12,
    frameInput: '/cache/frames/frame-%05d.png',
    captionsPath: '/cache/captions/render.vtt',
    captionStyle: { preset: 'tiktok' },
    width: 1280,
    height: 720,
    outputPath: '/cache/render.mp4',
  });

  let vfIndex = args.indexOf('-vf');
  assert.notEqual(vfIndex, -1);
  assert.match(args[vfIndex + 1], /^scale=1280:720,subtitles=\/cache\/captions\/render\.vtt/);
  assert.match(args[vfIndex + 1], /force_style='/);

  let assArgs = buildFrameSequenceEncodeArgs({
    fps: 12,
    frameInput: '/cache/frames/frame-%05d.png',
    captionsPath: '/cache/captions/render.vtt',
    captionsBurnPath: '/cache/captions/render.ass',
    width: 1280,
    height: 720,
    outputPath: '/cache/render.mp4',
  });
  let assVfIndex = assArgs.indexOf('-vf');
  assert.notEqual(assVfIndex, -1);
  assert.equal(assArgs[assVfIndex + 1], 'scale=1280:720,subtitles=/cache/captions/render.ass');
});

test('render finalize builds concat demuxer audio args and list lines', () => {
  assert.equal(buildAudioConcatListLine("/cache/audio/guide's line.wav"), "file '/cache/audio/guide'\\''s line.wav'");
  assert.deepEqual(
    buildAudioConcatArgs({
      concatListPath: '/cache/audio/concat.txt',
      outputPath: '/cache/audio/narration.wav',
    }),
    [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', '/cache/audio/concat.txt',
      '-c:a', 'pcm_s16le',
      '/cache/audio/narration.wav',
    ],
  );
});

test('render finalize builds overlap mix audio args without changing timing math', () => {
  assert.equal(buildAudioOverlapMixArgs({ clips: [], outputPath: 'out.wav' }), null);

  let mix = buildAudioOverlapMixArgs({
    clips: [
      { path: 'guide.wav', startMs: 0, endMs: 1200 },
      { path: 'ops.wav', startMs: 500, endMs: 1900 },
      { path: 'dispatch.wav', startMs: 1750.4, endMs: 2600 },
    ],
    outputPath: 'narration.wav',
  });

  assert.equal(mix.durationMs, 2600);
  assert.equal(mix.durationSec, 2.6);
  assert.equal(mix.filterComplex, [
    '[0:a]adelay=0|0,apad,atrim=0:2.600[a0]',
    '[1:a]adelay=500|500,apad,atrim=0:2.600[a1]',
    '[2:a]adelay=1750|1750,apad,atrim=0:2.600[a2]',
    '[a0][a1][a2]amix=inputs=3:duration=longest:normalize=0,atrim=0:2.600[mix]',
  ].join(';'));
  assert.deepEqual(mix.args, [
    '-y',
    '-i', 'guide.wav',
    '-i', 'ops.wav',
    '-i', 'dispatch.wav',
    '-filter_complex', mix.filterComplex,
    '-map', '[mix]',
    '-c:a', 'pcm_s16le',
    'narration.wav',
  ]);
});

test('render finalize builds reusable audio mux args from a caller-owned filter graph', () => {
  assert.equal(buildAudioMuxArgs({ videoPath: 'in.mp4', audioSources: [], outputPath: 'out.mp4' }), null);

  let args = buildAudioMuxArgs({
    videoPath: 'in.mp4',
    audioSources: [{ src: 'a.wav' }, { src: 'b.wav' }],
    filterComplex: '[1:a]apad[a0];[2:a]apad[a1];[a0][a1]amix=inputs=2[aout]',
    audioMapLabel: '[aout]',
    outputPath: 'out.mp4',
    audioBitrate: '256k',
  });

  assert.deepEqual(args, [
    '-y',
    '-i', 'in.mp4',
    '-i', 'a.wav',
    '-i', 'b.wav',
    '-filter_complex', '[1:a]apad[a0];[2:a]apad[a1];[a0][a1]amix=inputs=2[aout]',
    '-map', '0:v:0',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '256k',
    '-shortest',
    'out.mp4',
  ]);
});

test('render finalize parses ffprobe JSON loudly', () => {
  assert.deepEqual(parseFfprobeJson('{"streams":[{"codec_type":"video"}]}'), {
    streams: [{ codec_type: 'video' }],
  });
  assert.throws(() => parseFfprobeJson('{nope'), /ffprobe output is not valid JSON/);
});

test('render finalize projects neutral proof manifests without route or URL fields', () => {
  let manifest = buildRenderProofManifestProjection({
    cacheKey: 'render:a',
    frameCacheKey: 'frame:b',
    providerId: 'browser-headless-screencast',
    usesTrackDemoFrames: false,
    frames: [{ index: 0, elapsedMs: 0, url: 'https://example.test/frame.png', path: '/tmp/frame.png' }],
    visualFrame: { index: 0, url: 'https://example.test/proof.png', path: '/tmp/proof.png' },
    audio: {
      sequenceMode: 'sequential',
      mix: { artifactId: 'sha256:1', url: 'https://example.test/audio.wav', path: '/tmp/audio.wav' },
      items: [{ voiceRef: 'voice-a', url: 'https://example.test/item.wav', path: '/tmp/item.wav' }],
    },
    output: { url: 'https://example.test/render.mp4', path: '/tmp/render.mp4', sha256: 'abc' },
    renderSeedProjection: { surface: { route: '/private?token=secret' } },
    ffprobe: { streams: [] },
    avSync: { ok: true },
  });

  let json = JSON.stringify(manifest);
  assert.equal(manifest.usesTrackDemoFrames, false);
  assert.equal(manifest.output.sha256, 'abc');
  assert.equal(manifest.frames[0].index, 0);
  assert.doesNotMatch(json, /https?:/);
  assert.doesNotMatch(json, /\/tmp\//);
  assert.doesNotMatch(json, /route/);
  assert.doesNotMatch(json, /token/);
});

test('render finalize projects proof manifest state with a stable field set', () => {
  let manifest = {
    cacheKey: 'render:a',
    frameCacheKey: 'frame:b',
    renderSeed: { id: 'seed-a' },
    renderSeedProjection: { version: 2 },
    renderQueue: { id: 'queue-a' },
    usesTrackDemoFrames: false,
    frameSequenceCleaned: true,
    visualFrame: { index: 0 },
    audio: { durationMs: 1200 },
    transcript: { artifactId: 'sha256:t' },
    clipTranscripts: [{ itemIndex: 0 }],
    captions: { cueCount: 1 },
    output: { sha256: 'abc' },
    avSync: { ok: true },
    cleanup: { ok: true },
    cleanupError: null,
    progressTimeline: [{ stage: 'done' }],
    stageDurations: [{ stage: 'encode:done' }],
    ffprobe: { streams: [] },
  };

  let state = projectRenderProofManifestState(manifest);

  assert.deepEqual(Object.keys(state), [...RENDER_PROOF_MANIFEST_STATE_FIELDS]);
  assert.equal(state.ffprobe, undefined);
  assert.equal(state.usesTrackDemoFrames, false);
  assert.equal(state.cleanupError, null);
  assert.deepEqual(projectRenderProofManifestState(manifest, ['cacheKey', 'output']), {
    cacheKey: 'render:a',
    output: { sha256: 'abc' },
  });
  assert.deepEqual(projectRenderProofManifestState(null, ['cacheKey']), { cacheKey: undefined });
});

test('segment concat list line reuses the escaped audio concat quoting', () => {
  assert.equal(buildSegmentConcatListLine("/cache/seg's-01.mp4"), "file '/cache/seg'\\''s-01.mp4'");
});

test('segment concat stream-copies segments without re-encoding', () => {
  assert.deepEqual(
    buildSegmentConcatArgs({ concatListPath: '/cache/list.txt', outputPath: '/cache/out.mp4' }),
    ['-y', '-f', 'concat', '-safe', '0', '-i', '/cache/list.txt', '-c', 'copy', '/cache/out.mp4'],
  );
});

test('segment concat re-encode is explicit and never silently copies', () => {
  assert.deepEqual(
    buildSegmentConcatArgs({
      concatListPath: '/cache/list.txt',
      outputPath: '/cache/out.mp4',
      mode: 're-encode',
      videoCodec: 'libx264',
      audioCodec: 'aac',
      crf: '20',
      preset: 'medium',
    }),
    [
      '-y', '-f', 'concat', '-safe', '0', '-i', '/cache/list.txt',
      '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-c:a', 'aac', '/cache/out.mp4',
    ],
  );
  assert.throws(() => buildSegmentConcatArgs({ concatListPath: '/l', outputPath: '/o', mode: 'guess' }), /stream-copy or re-encode/);
});
