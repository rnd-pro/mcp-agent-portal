import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  WORKSPACE_VIRTUAL_SEQUENCE_SCHEMA,
  createVirtualSequenceProjection,
} from '../ui/virtual-sequence.js';

let HASH = 'sha256-0000000000000000000000000000000000000000000000000000000000000000';
let resolvePath = (path) => `https://cdn.example/${path}`;

// 60 ticks at a 1/60 timebase and 30fps => ticksPerFrame 2, frameCount 30.
function sampleSequence(overrides = {}) {
  return {
    schemaVersion: WORKSPACE_VIRTUAL_SEQUENCE_SCHEMA,
    executionTier: 'sequential-realtime',
    timebase: { num: 1, den: 60 },
    frameRate: { num: 30, den: 1 },
    duration: 60,
    masters: [
      {
        id: 'm0',
        path: 'masters/m0.mp4',
        contentHash: HASH,
        codec: 'h264',
        container: 'mp4',
        range: { startTick: 0, endTick: 60 },
        keyframes: [0, 30],
      },
    ],
    playbackProxy: { path: 'proxies/playback.mp4', contentHash: HASH, codec: 'h264', container: 'mp4' },
    scrub: { mode: 'proxy', path: 'proxies/scrub.mp4', contentHash: HASH, codec: 'h264', container: 'mp4' },
    sprites: [
      {
        id: 's0',
        path: 'sprites/s0.webp',
        contentHash: HASH,
        codec: 'webp',
        cues: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
        tile: { width: 160, height: 90, columns: 10, rows: 10 },
      },
    ],
    index: { keyframes: [0, 30], timestamps: [0, 30] },
    audio: [
      {
        id: 'a0',
        path: 'audio/a0.m4a',
        contentHash: HASH,
        range: { startTick: 0, endTick: 60 },
        waveform: { path: 'audio/a0.wave.json', contentHash: HASH },
      },
    ],
    layers: [
      { id: 'base', kind: 'base', invalidation: 'opaque', range: { startTick: 0, endTick: 60 }, dependsOn: [], affectedRanges: [{ startTick: 0, endTick: 60 }] },
      // Active over 30..60 but only 40..50 actually invalidates.
      { id: 'cap', kind: 'caption', invalidation: 'partial', range: { startTick: 30, endTick: 60 }, dependsOn: ['base'], affectedRanges: [{ startTick: 40, endTick: 50 }] },
    ],
    ...overrides,
  };
}

function chunkedScrubSequence() {
  return sampleSequence({
    scrub: {
      mode: 'chunks',
      maxChunkDurationTicks: 30,
      chunks: [
        { id: 'c0', path: 'scrub/c0.mp4', contentHash: HASH, codec: 'h264', container: 'mp4', range: { startTick: 0, endTick: 30 } },
        { id: 'c1', path: 'scrub/c1.mp4', contentHash: HASH, codec: 'h264', container: 'mp4', range: { startTick: 30, endTick: 60 } },
      ],
    },
  });
}

test('virtual sequence projection requires an injected artifact-path resolver', () => {
  assert.throws(() => createVirtualSequenceProjection(sampleSequence(), {}), /resolvePath/);
  assert.throws(() => createVirtualSequenceProjection(sampleSequence(), { resolvePath: 'nope' }), /resolvePath/);
});

test('virtual sequence projection requires the exact v1 schema string', () => {
  assert.equal(WORKSPACE_VIRTUAL_SEQUENCE_SCHEMA, 'workspace-virtual-sequence-v1');
  let missing = sampleSequence();
  delete missing.schemaVersion;
  assert.throws(() => createVirtualSequenceProjection(missing, { resolvePath }), /schemaVersion must equal/);
  assert.throws(
    () => createVirtualSequenceProjection(sampleSequence({ schemaVersion: 'workspace-virtual-sequence' }), { resolvePath }),
    /schemaVersion must equal/,
  );
  assert.throws(
    () => createVirtualSequenceProjection(sampleSequence({ schemaVersion: 'workspace-virtual-sequence-v1-beta' }), { resolvePath }),
    /schemaVersion must equal/,
  );
});

test('virtual sequence projection fails loudly on the local timing fields it uses', () => {
  assert.throws(() => createVirtualSequenceProjection(sampleSequence({ timebase: { num: 0, den: 60 } }), { resolvePath }), /timebase/);
  assert.throws(() => createVirtualSequenceProjection(sampleSequence({ frameRate: { num: 30, den: 0 } }), { resolvePath }), /frameRate/);
  assert.throws(() => createVirtualSequenceProjection(sampleSequence({ duration: 0 }), { resolvePath }), /duration/);
  assert.throws(() => createVirtualSequenceProjection(sampleSequence({ masters: [] }), { resolvePath }), /masters/);
  let noIndex = sampleSequence();
  delete noIndex.index;
  assert.throws(() => createVirtualSequenceProjection(noIndex, { resolvePath }), /index/);
});

test('virtual sequence projection maps ticks and frames without exceeding the final frame', () => {
  let projection = createVirtualSequenceProjection(sampleSequence(), { resolvePath });
  assert.equal(projection.executionTier, 'sequential-realtime');
  assert.equal(projection.ticksPerFrame, 2);
  assert.equal(projection.frameCount, 30);
  assert.equal(projection.durationTicks, 60);
  assert.equal(projection.durationSeconds, 1);

  assert.equal(projection.tickToTime(30), 0.5);
  assert.equal(projection.timeToTick(0.5), 30);
  assert.equal(projection.tickToFrame(0), 0);
  assert.equal(projection.tickToFrame(59), 29);
  // Duration endpoint maps to the final frame (29), never past it.
  assert.equal(projection.tickToFrame(60), 29);
  assert.equal(projection.timeToFrame(projection.durationSeconds), 29);
  assert.equal(projection.frameToTick(29), 58);
  assert.equal(projection.frameToTick(99), 58);
  assert.equal(projection.frameToTime(29), 58 / 60);

  // Point lookups clamp to 0..duration-1.
  assert.equal(projection.timeToTick(99), 59);
  assert.equal(projection.timeToTick(-5), 0);
});

test('virtual sequence projection resolves portable paths only through the resolver', () => {
  let projection = createVirtualSequenceProjection(sampleSequence(), { resolvePath });
  assert.equal(projection.playbackUrl(), 'https://cdn.example/proxies/playback.mp4');
  assert.equal(projection.scrubMode, 'proxy');
  assert.equal(projection.scrubProxyUrl(), 'https://cdn.example/proxies/scrub.mp4');

  let audio = projection.activeAudioForTick(10);
  assert.equal(audio.length, 1);
  assert.equal(audio[0].url, 'https://cdn.example/audio/a0.m4a');
  assert.equal(audio[0].waveformUrl, 'https://cdn.example/audio/a0.wave.json');
  assert.deepEqual(projection.activeAudioForTick(59).map((entry) => entry.audio.id), ['a0']);
});

test('virtual sequence projection selects masters and nearest keyframe/timestamp', () => {
  let projection = createVirtualSequenceProjection(sampleSequence(), { resolvePath });
  let master = projection.masterForTick(30);
  assert.equal(master.master.id, 'm0');
  assert.equal(master.url, 'https://cdn.example/masters/m0.mp4');

  assert.equal(projection.nearestKeyframeTick(29), 0);
  assert.equal(projection.nearestKeyframeTick(30), 30);
  assert.equal(projection.nearestKeyframeTick(59), 30);
  assert.equal(projection.nearestKeyframeTick(0), 0);

  assert.equal(projection.nearestTimestampTick(29), 0);
  assert.equal(projection.nearestTimestampTick(31), 30);
});

test('virtual sequence projection resolves a proxy scrub for any tick', () => {
  let projection = createVirtualSequenceProjection(sampleSequence(), { resolvePath });
  let scrub = projection.scrubForTick(45);
  assert.equal(scrub.mode, 'proxy');
  assert.equal(scrub.url, 'https://cdn.example/proxies/scrub.mp4');
});

test('virtual sequence projection selects scrub chunks on half-open boundaries', () => {
  let projection = createVirtualSequenceProjection(chunkedScrubSequence(), { resolvePath });
  assert.equal(projection.scrubMode, 'chunks');
  assert.equal(projection.scrubProxyUrl(), null);

  assert.equal(projection.scrubForTick(0).chunk.id, 'c0');
  assert.equal(projection.scrubForTick(29).chunk.id, 'c0');
  assert.equal(projection.scrubForTick(30).chunk.id, 'c1', 'the start tick belongs to the next chunk');
  assert.equal(projection.scrubForTick(59).chunk.id, 'c1');
  assert.equal(projection.scrubForTick(59).url, 'https://cdn.example/scrub/c1.mp4');
  // Point lookups clamp: a tick at/after duration resolves to the last chunk.
  assert.equal(projection.scrubForTick(60).chunk.id, 'c1');
});

test('virtual sequence projection computes sprite tile geometry from the cue index', () => {
  let projection = createVirtualSequenceProjection(sampleSequence(), { resolvePath });

  let first = projection.spriteTileForTick(0);
  assert.equal(first.url, 'https://cdn.example/sprites/s0.webp');
  assert.equal(first.cueIndex, 0);
  assert.deepEqual([first.x, first.y, first.width, first.height], [0, 0, 160, 90]);

  let second = projection.spriteTileForTick(3);
  assert.equal(second.cueIndex, 1, 'greatest cue tick at or below 3 is the tick-2 cue');
  assert.deepEqual([second.x, second.y], [160, 0]);

  // Cue index 12 on a 10-column sheet wraps to column 2, row 1.
  let wrapped = projection.spriteTileForTick(24);
  assert.equal(wrapped.cueIndex, 12);
  assert.deepEqual([wrapped.column, wrapped.row], [2, 1]);
  assert.deepEqual([wrapped.x, wrapped.y], [320, 90]);
});

test('virtual sequence projection reports active layers ordered by kind then id', () => {
  let projection = createVirtualSequenceProjection(sampleSequence(), { resolvePath });
  assert.deepEqual(projection.layersForTick(40).map((layer) => layer.id), ['base', 'cap']);
  assert.deepEqual(projection.layersForTick(40).map((layer) => layer.kind), ['base', 'caption']);
  assert.deepEqual(projection.layersForTick(10).map((layer) => layer.id), ['base']);
});

test('virtual sequence projection preserves full producer layer fields without leaking mutations', () => {
  let projection = createVirtualSequenceProjection(sampleSequence(), { resolvePath });
  let cap = projection.layersForTick(40).find((layer) => layer.id === 'cap');
  assert.equal(cap.invalidation, 'partial');
  assert.deepEqual(cap.range, { startTick: 30, endTick: 60 });
  assert.deepEqual(cap.dependsOn, ['base']);
  assert.deepEqual(cap.affectedRanges, [{ startTick: 40, endTick: 50 }]);

  // Mutating the returned projection output must not affect later lookups.
  cap.affectedRanges[0].startTick = 0;
  cap.dependsOn.push('poison');
  let capAgain = projection.layersForTick(40).find((layer) => layer.id === 'cap');
  assert.deepEqual(capAgain.affectedRanges, [{ startTick: 40, endTick: 50 }]);
  assert.deepEqual(capAgain.dependsOn, ['base']);
});

test('virtual sequence projection distinguishes active layers from affected (invalidated) layers', () => {
  let projection = createVirtualSequenceProjection(sampleSequence(), { resolvePath });

  // At tick 35 the caption is active (declared range 30..60) but not invalidated (affected 40..50).
  assert.deepEqual(projection.layersForTick(35).map((layer) => layer.id), ['base', 'cap']);
  assert.deepEqual(projection.affectedLayerIdsForTick(35), ['base']);

  // Inside the affected interval both are invalidated.
  assert.deepEqual(projection.affectedLayerIdsForTick(45).sort(), ['base', 'cap']);

  // Range overlap follows affectedRanges, not the declared range.
  assert.deepEqual(projection.affectedLayerIdsForRange(0, 20), ['base']);
  assert.deepEqual(projection.affectedLayerIdsForRange(30, 38), ['base']);
  assert.deepEqual(projection.affectedLayerIdsForRange(45, 55).sort(), ['base', 'cap']);
});

test('virtual sequence projection does not import the producer package', async () => {
  let source = await readFile(new URL('../ui/virtual-sequence.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /symbiote-workspace/);
});
