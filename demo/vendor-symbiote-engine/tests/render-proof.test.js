import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildRenderAudioLayerProof,
  buildRenderAvSyncProof,
  countClipOverlaps,
  durationDriftMs,
  findProbeStream,
  normalizeProbeStreams,
  renderAuthorityDurationSec,
  streamDurationSec,
} from '../render-proof.js';

function ffprobe({ videoDuration = '1.000000', audioDuration = '1.000000', videoCodec = 'h264', audioCodec = 'aac' } = {}) {
  let streams = [
    {
      codec_type: 'video',
      codec_name: videoCodec,
      duration: videoDuration,
      width: 1280,
      height: 720,
      nb_frames: '12',
    },
  ];
  if (audioDuration !== null) {
    streams.push({
      codec_type: 'audio',
      codec_name: audioCodec,
      duration: audioDuration,
      sample_rate: '24000',
      channels: 1,
    });
  }
  return {
    streams,
    format: { duration: videoDuration },
  };
}

test('audio layer proof returns null for empty input and uses neutral default speakers', () => {
  assert.equal(buildRenderAudioLayerProof(), null);

  let proof = buildRenderAudioLayerProof({
    items: [{ durationMs: 500, voiceRef: 'voice-a' }],
    cueTimings: [{ startMs: 0, durationMs: 500, requestedStartMs: 0 }],
    thresholdMs: 40,
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.sequenceMode, 'sequential');
  assert.equal(proof.speakerLayers.length, 1);
  assert.equal(proof.speakerLayers[0].persona, 'speaker-0');
  assert.equal(proof.speakerLayers[0].id, 'voice:speaker-0');
  assert.equal(proof.mixDurationMs, 500);
});

test('audio layer proof builds two speaker sequential layers with injected labels', () => {
  let proof = buildRenderAudioLayerProof({
    items: [
      { durationMs: 1000, persona: 'guide', voiceRef: 'voice-guide', artifactId: 'a1', sha256: 's1' },
      { durationMs: 900, persona: 'ops', voiceRef: 'voice-ops', artifactId: 'a2', sha256: 's2' },
    ],
    cueTimings: [
      { startMs: 0, endMs: 1000, durationMs: 1000, requestedStartMs: 0 },
      { startMs: 1000, endMs: 1900, durationMs: 900, requestedStartMs: 1000 },
    ],
    mixDurationMs: 1900,
    thresholdMs: 40,
    fallbackSpeakerForIndex: (index) => index % 2 ? 'ops' : 'guide',
    layerIdForClip: (clip) => `speaker:${clip.persona}`,
    layerLabelForClip: (clip) => `${clip.persona.toUpperCase()} narration`,
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.overlapCount, 0);
  assert.deepEqual(proof.distinctVoiceRefs, ['voice-guide', 'voice-ops']);
  assert.equal(proof.totalClipDurationMs, 1900);
  assert.equal(proof.durationDriftMs, 0);
  assert.deepEqual(proof.speakerLayers.map((layer) => layer.id), ['speaker:guide', 'speaker:ops']);
  assert.deepEqual(proof.speakerLayers.map((layer) => layer.label), ['GUIDE narration', 'OPS narration']);
});

test('audio layer proof validates cue counts, overlap mode, and exact drift threshold', () => {
  let mismatch = buildRenderAudioLayerProof({
    items: [{ durationMs: 500, persona: 'guide', voiceRef: 'voice-guide' }],
    cueTimings: [],
    thresholdMs: 40,
  });
  let noOverlap = buildRenderAudioLayerProof({
    sequenceMode: 'overlap',
    items: [
      { durationMs: 500, persona: 'guide', voiceRef: 'voice-guide' },
      { durationMs: 500, persona: 'ops', voiceRef: 'voice-ops' },
    ],
    cueTimings: [
      { startMs: 0, durationMs: 500 },
      { startMs: 500, durationMs: 500 },
    ],
    mixDurationMs: 1000,
    thresholdMs: 40,
  });
  let exactThreshold = buildRenderAudioLayerProof({
    items: [
      { durationMs: 500, persona: 'guide', voiceRef: 'voice-guide' },
      { durationMs: 500, persona: 'ops', voiceRef: 'voice-ops' },
    ],
    cueTimings: [
      { startMs: 0, durationMs: 500, requestedStartMs: 0 },
      { startMs: 500, durationMs: 500, requestedStartMs: 500 },
    ],
    mixDurationMs: 1040,
    thresholdMs: 40,
  });
  let noRequestedStarts = buildRenderAudioLayerProof({
    items: [
      { durationMs: 500, persona: 'guide', voiceRef: 'voice-guide' },
      { durationMs: 500, persona: 'ops', voiceRef: 'voice-ops' },
    ],
    cueTimings: [
      { startMs: 0, durationMs: 500 },
      { startMs: 500, durationMs: 500 },
    ],
    mixDurationMs: 1000,
    thresholdMs: 40,
  });

  assert.equal(mismatch.ok, false);
  assert.match(mismatch.errors.join('\n'), /matching item and cue timing counts/);
  assert.equal(noOverlap.ok, false);
  assert.match(noOverlap.errors.join('\n'), /overlap audio sequence requires/);
  assert.equal(exactThreshold.ok, true);
  assert.equal(exactThreshold.durationDriftMs, 40);
  assert.equal(noRequestedStarts.ok, true);
});

test('audio layer proof detects overlapping clips and missing distinct voice refs', () => {
  assert.equal(countClipOverlaps([
    { startMs: 0, endMs: 500 },
    { startMs: 470, endMs: 900 },
    { startMs: 900, endMs: 1200 },
  ], 20), 1);

  let proof = buildRenderAudioLayerProof({
    sequenceMode: 'sequential',
    items: [
      { durationMs: 600, persona: 'guide', voiceRef: 'same-voice' },
      { durationMs: 600, persona: 'ops', voiceRef: 'same-voice' },
    ],
    cueTimings: [
      { startMs: 0, durationMs: 600, requestedStartMs: 0 },
      { startMs: 500, durationMs: 600, requestedStartMs: 500 },
    ],
    mixDurationMs: 1200,
    thresholdMs: 40,
  });

  assert.equal(proof.ok, false);
  assert.match(proof.errors.join('\n'), /starts 100ms before the sequential cursor/);
  assert.match(proof.errors.join('\n'), /1 overlapping voice clips/);
  assert.match(proof.errors.join('\n'), /two-speaker render requires/);
});

test('render proof normalizes probe streams and stream durations', () => {
  let probe = ffprobe({ videoDuration: '1.250000' });

  assert.equal(normalizeProbeStreams({}).length, 0);
  assert.equal(findProbeStream(probe, 'video').codec_name, 'h264');
  assert.equal(streamDurationSec({ tags: { DURATION: '2.5' } }, probe), 2.5);
  assert.equal(streamDurationSec({}, { format: { duration: '3.5' } }), 3.5);
  assert.equal(Math.round(durationDriftMs(1.1, 1)), 100);
  assert.equal(durationDriftMs(0, 1), null);
});

test('render proof validates h264/aac streams against audio-authority timing', () => {
  let proof = buildRenderAvSyncProof({
    ffprobe: ffprobe(),
    audio: { mix: { durationMs: 1000 } },
    transcript: { durationSec: 1 },
    fps: 12,
    includeAudio: true,
    thresholdMs: 40,
    frames: [{}, {}],
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.expectedDurationMs, 1000);
  assert.equal(proof.streams.video.codecName, 'h264');
  assert.equal(proof.streams.video.frames, 12);
  assert.equal(proof.streams.audio.codecName, 'aac');
  assert.equal(proof.driftsMs.videoVsAudioMs, 0);
  assert.equal(proof.driftsMs.captionsVsAuthorityMs, 0);
});

test('render proof reports codec, missing stream, and duration drift failures', () => {
  let proof = buildRenderAvSyncProof({
    ffprobe: ffprobe({ videoDuration: '1.100000', audioDuration: null, videoCodec: 'vp9' }),
    frameArtifact: { durationSec: 1 },
    fps: 1,
    includeAudio: true,
    thresholdMs: 40,
  });

  assert.equal(proof.ok, false);
  assert.match(proof.errors.join('\n'), /video stream must be h264, got vp9/);
  assert.match(proof.errors.join('\n'), /missing audio stream/);
  assert.match(proof.errors.join('\n'), /videoVsAuthorityMs 100ms exceeds 40ms/);
});

test('render proof supports no-audio mode without requiring an audio stream', () => {
  let proof = buildRenderAvSyncProof({
    ffprobe: ffprobe({ audioDuration: null }),
    frameArtifact: { durationSec: 1 },
    fps: 24,
    includeAudio: false,
    thresholdMs: 40,
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.streams.audio, null);
  assert.equal(proof.driftsMs.audioVsAuthorityMs, null);
  assert.equal(proof.driftsMs.videoVsAudioMs, null);
});

test('render proof reports caption drift and missing positive authority duration', () => {
  let captionDrift = buildRenderAvSyncProof({
    ffprobe: ffprobe(),
    audio: { mix: { durationMs: 1000 } },
    transcript: { durationSec: 1.1 },
    fps: 12,
    includeAudio: true,
    thresholdMs: 40,
  });
  let missingAuthority = buildRenderAvSyncProof({
    ffprobe: ffprobe({ videoDuration: '1.000000', audioDuration: null }),
    includeAudio: false,
    thresholdMs: 40,
    defaultDurationMs: 0,
  });

  assert.equal(captionDrift.ok, false);
  assert.match(captionDrift.errors.join('\n'), /captionsVsAuthorityMs 100ms exceeds 40ms/);
  assert.equal(missingAuthority.ok, false);
  assert.match(missingAuthority.errors.join('\n'), /missing positive audio-authority duration/);
});

test('render proof falls through authority sources when includeAudio has no audio object', () => {
  assert.equal(renderAuthorityDurationSec({ audio: { mix: { durationMs: 1200 } } }), 1.2);
  assert.equal(renderAuthorityDurationSec({ frameArtifact: { durationSec: 1.5 } }), 1.5);
  assert.equal(renderAuthorityDurationSec({ durationMs: 2000 }), 2);

  let proof = buildRenderAvSyncProof({
    ffprobe: ffprobe({ videoDuration: '1.500000', audioDuration: '1.500000' }),
    frameArtifact: { durationSec: 1.5 },
    fps: 12,
    includeAudio: true,
    thresholdMs: 40,
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.expectedDurationMs, 1500);
});
