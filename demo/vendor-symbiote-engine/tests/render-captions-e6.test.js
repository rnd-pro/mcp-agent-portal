import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as indexExports from '../index.js';
import * as browserExports from '../browser.js';
import {
  CAPTION_PRESENTATION_TRACK_VERSION,
  buildCaptionPlacementTrack,
  assertCaptionPlacementTrack,
  buildCaptionCues,
  renderAss,
  parseAss,
  joinCaptionArtifacts
} from '../render-captions.js';

test('root/browser/render-captions imports expose track v3 and reject v2', () => {
  assert.equal(CAPTION_PRESENTATION_TRACK_VERSION, 'caption-presentation-track-v3');
  assert.equal(indexExports.CAPTION_PRESENTATION_TRACK_VERSION, 'caption-presentation-track-v3');
  assert.equal(browserExports.CAPTION_PRESENTATION_TRACK_VERSION, 'caption-presentation-track-v3');
  assert.notEqual(CAPTION_PRESENTATION_TRACK_VERSION, 'caption-presentation-track-v2');
});

test('same-anchor wrap/reflow/font shrink increments typography adaptation but has zero relocation', () => {
  let layout = {
    preset: 'square',
    width: 1080,
    height: 1080,
    maxLines: 1,
    fontSize: 50,
    preferredZones: ['top'],
    safeInsets: { top: 54, bottom: 54, left: 54, right: 54 },
    avoidRegions: [
      { id: 'block-center', x: 400, y: 0, width: 680, height: 1080, startSec: 0, endSec: 3 },
      { id: 'block-bottom-left', x: 0, y: 150, width: 400, height: 930, startSec: 0, endSec: 3 }
    ]
  };
  let cues = [
    { cueId: 'cue-e1', startSec: 0.0, endSec: 1.5, text: 'Short' },
    { cueId: 'cue-e2', startSec: 1.5, endSec: 3.0, text: 'Somewhat longer' }
  ];
  let track = buildCaptionPlacementTrack(cues, layout);

  assert.equal(track.cues[0].placement.x, track.cues[1].placement.x);
  assert.equal(track.cues[0].placement.y, track.cues[1].placement.y);
  assert.equal(track.cues[0].placement.alignment, track.cues[1].placement.alignment);
  assert.equal(track.relocationCount, 0);
  assert.equal(track.typographyAdaptationCount, 1);
  assert.equal(track.forcedCollisionRelocationCount, 0);
  assert.equal(track.unforcedSwitchCount, 0);
});

test('discontinuity retains the previous valid slot with zero move', () => {
  let layout = {
    preset: 'youtube',
    width: 1920,
    height: 1080,
    fontSize: 30,
    preferredZones: ['bottom'],
    safeInsets: { top: 54, bottom: 54, left: 54, right: 54 }
  };
  let cues = [
    { cueId: 'cue-d1', startSec: 0.0, endSec: 1.0, speaker: 'guide', text: 'Cue 1' },
    { cueId: 'cue-d2', startSec: 4.0, endSec: 5.0, speaker: 'guide', text: 'Cue 2', discontinuity: true }
  ];
  let track = buildCaptionPlacementTrack(cues, layout);

  assert.equal(track.cues[0].placement.x, track.cues[1].placement.x);
  assert.equal(track.cues[0].placement.y, track.cues[1].placement.y);
  assert.equal(track.cues[0].placement.alignment, track.cues[1].placement.alignment);
  assert.equal(track.relocationCount, 0);
  assert.equal(track.cues[1].decisionEvidence.switchReason, null);
  assert.equal(track.cues[1].decisionEvidence.decision, 'retained');
  assert.equal(track.cues[1].decisionEvidence.discontinuity, true);
});

test('actual compact collision causes one collision relocation', () => {
  let layout = {
    preset: 'youtube',
    width: 1920,
    height: 1080,
    fontSize: 30,
    preferredZones: ['bottom'],
    safeInsets: { top: 54, bottom: 54, left: 54, right: 54 }
  };
  let cues = [
    { cueId: 'cue-c1', startSec: 0.0, endSec: 1.0, speaker: 'guide', text: 'Cue 1' },
    { cueId: 'cue-c2', startSec: 1.0, endSec: 2.0, speaker: 'guide', text: 'Cue 2' }
  ];
  let avoidRegions = [
    { id: 'focus-region', kind: 'focus', x: 800, y: 900, width: 320, height: 100, startSec: 1.0, endSec: 2.0 }
  ];
  let track = buildCaptionPlacementTrack(cues, { ...layout, avoidRegions });

  assert.equal(track.relocationCount, 1);
  assert.equal(track.forcedCollisionRelocationCount, 1);
  assert.equal(track.cues[1].decisionEvidence.switchReason, 'collision');
  assert.equal(track.cues[1].decisionEvidence.decision, 'moved');
});

test('actual geometric out-of-bounds placement causes one safe-bounds relocation', () => {
  let layoutNarrow = {
    preset: 'youtube',
    width: 1920,
    height: 500,
    fontSize: 30,
    preferredZones: ['bottom', 'top'],
    safeInsets: { top: 200, bottom: 240, left: 54, right: 54 },
    avoidRegions: [
      { id: 'obs-bottom', x: 400, y: 250, width: 800, height: 10 },
      { id: 'obs-top', x: 400, y: 200, width: 800, height: 10, startSec: 0.0, endSec: 1.0 }
    ]
  };
  let cuesNarrow = [
    { cueId: 'cue-sb1', startSec: 0.0, endSec: 1.0, text: 'OK' },
    { cueId: 'cue-sb2', startSec: 1.0, endSec: 2.0, text: 'This is an extremely long sentence with many words that will definitely wrap to at least four or five lines at wrap width 662 even if we shrink the font size down to the absolute minimum of 18 pixels' }
  ];
  let trackNarrow = buildCaptionPlacementTrack(cuesNarrow, layoutNarrow);

  assert.equal(trackNarrow.relocationCount, 1);
  assert.equal(trackNarrow.forcedSafeBoundsRelocationCount, 1);
  assert.equal(trackNarrow.cues[1].decisionEvidence.switchReason, 'safe-bounds');
  assert.equal(trackNarrow.cues[1].decisionEvidence.decision, 'moved');
});

test('impossible typography fails instead of moving', () => {
  let layout = {
    preset: 'youtube',
    width: 1920,
    height: 1080,
    fontSize: 30,
    preferredZones: ['bottom'],
    safeInsets: { top: 54, bottom: 54, left: 54, right: 54 }
  };
  let cues = [
    { cueId: 'cue-i1', startSec: 0.0, endSec: 1.0, speaker: 'guide', text: 'Cue 1' },
    { cueId: 'cue-i2', startSec: 1.0, endSec: 2.0, speaker: 'guide', text: 'A'.repeat(500) }
  ];

  assert.throws(() => {
    buildCaptionPlacementTrack(cues, layout);
  }, /Typography cannot fit|exceeded available line budget|No readable placement zone/);
});

test('counters, reasons, geometry, and canonical hash reject contradictions', () => {
  let layout = {
    preset: 'youtube',
    width: 1920,
    height: 1080,
    fontSize: 30,
    preferredZones: ['bottom'],
    safeInsets: { top: 54, bottom: 54, left: 54, right: 54 }
  };
  let cues = [
    { cueId: 'cue-h1', startSec: 0.0, endSec: 1.0, speaker: 'guide', text: 'Cue 1' }
  ];
  let track = buildCaptionPlacementTrack(cues, layout);

  assert.equal(assertCaptionPlacementTrack(track), track);

  let mutated1 = { ...track, trackHash: 'invalid-hash' };
  assert.throws(() => assertCaptionPlacementTrack(mutated1), /trackHash does not match|signature is invalid/);

  let mutated2 = { ...track, relocationCount: 999 };
  assert.throws(() => assertCaptionPlacementTrack(mutated2), /trackHash does not match|signature is invalid|incorrect relocationCount/);
});

test('ASS Name speaker and Effect cue ID round-trip, including safe-charset, duplicate-ID, and cue-ID join tests', () => {
  let layout = {
    preset: 'youtube',
    width: 1920,
    height: 1080,
    fontSize: 30,
    speakerTreatment: 'none',
    preferredZones: ['bottom'],
    safeInsets: { top: 54, bottom: 54, left: 54, right: 54 }
  };

  let unsafeCues = [
    { cueId: 'Cue-1', startSec: 0.0, endSec: 1.0, speaker: 'guide', text: 'Safe' }
  ];
  assert.throws(() => buildCaptionPlacementTrack(unsafeCues, layout), /unsafe cueId/);

  let safeCues = [
    { cueId: 'cue_1.test-id:ok', startSec: 0.0, endSec: 1.0, speaker: 'guide', text: 'Hello' },
    { cueId: 'cue.2', startSec: 1.0, endSec: 2.0, speaker: 'ops', text: 'World' }
  ];
  let track = buildCaptionPlacementTrack(safeCues, layout);
  let ass = renderAss(track);

  assert.match(ass, /,guide,0000,0000,0000,cue_1\.test-id:ok,/);
  assert.match(ass, /,ops,0000,0000,0000,cue.2,/);

  let parsed = parseAss(ass);
  assert.equal(parsed.width, 1920);
  assert.equal(parsed.height, 1080);
  assert.equal(parsed.cues.length, 2);

  assert.equal(parsed.cues[0].cueId, 'cue_1.test-id:ok');
  assert.equal(parsed.cues[0].speaker, 'guide');
  assert.equal(parsed.cues[0].text, 'Hello');
  assert.equal(parsed.cues[0].placement.alignment, 2);

  assert.equal(parsed.cues[1].cueId, 'cue.2');
  assert.equal(parsed.cues[1].speaker, 'ops');
  assert.equal(parsed.cues[1].text, 'World');

  let artifactA = [
    { cueId: 'cue.1', text: 'Hello' }
  ];
  let artifactB = [
    { cueId: 'cue.1', speaker: 'guide' }
  ];
  let joined = joinCaptionArtifacts(artifactA, artifactB);
  assert.deepEqual(joined, [{ cueId: 'cue.1', text: 'Hello', speaker: 'guide' }]);

  assert.throws(() => joinCaptionArtifacts([{ cueId: 'cue.1' }, { cueId: 'cue.1' }], [{ cueId: 'cue.1' }]), /duplicate cue ID/);
  assert.throws(() => joinCaptionArtifacts([{ cueId: 'cue.1' }], [{ cueId: 'cue.2' }]), /missing cue ID/);
  assert.throws(() => joinCaptionArtifacts([{ cueId: 'CUE' }], [{ cueId: 'CUE' }]), /missing or invalid|unsafe/);
});

test('buildCaptionCues rejects missing, unsafe, or duplicate cueId', () => {
  assert.throws(() => {
    buildCaptionCues({
      presentation: { width: 1080, height: 1920, captionStyle: { preset: 'tiktok' } },
      clipTranscripts: [
        { speaker: 'guide', words: [{ word: 'hello', startSec: 0, endSec: 1 }] }
      ]
    });
  }, /missing cueId|requires a nonempty explicit cueId/i);

  assert.throws(() => {
    buildCaptionCues({
      presentation: { width: 1080, height: 1920, captionStyle: { preset: 'tiktok' } },
      clipTranscripts: [
        { speaker: 'guide', cueId: 'Cue-1', words: [{ word: 'hello', startSec: 0, endSec: 1 }] }
      ]
    });
  }, /unsafe cueId/i);

  assert.throws(() => {
    buildCaptionCues({
      presentation: { width: 1080, height: 1920, captionStyle: { preset: 'tiktok' } },
      clipTranscripts: [
        { speaker: 'guide', cueId: 'cue1', words: [{ word: 'hello', startSec: 0, endSec: 1 }] },
        { speaker: 'guide', cueId: 'cue1', words: [{ word: 'world', startSec: 10, endSec: 11 }] }
      ]
    });
  }, /ambiguous|duplicate/i);
});

test('retained slot decision evidence validation', () => {
  let layout = {
    preset: 'youtube',
    width: 1920,
    height: 1080,
    fontSize: 30,
    preferredZones: ['bottom'],
    safeInsets: { top: 54, bottom: 54, left: 54, right: 54 }
  };
  let cues = [
    { cueId: 'cue-r1', startSec: 0.0, endSec: 1.0, speaker: 'guide', text: 'Cue 1' },
    { cueId: 'cue-r2', startSec: 1.5, endSec: 2.5, speaker: 'guide', text: 'Cue 2' }
  ];
  let track = buildCaptionPlacementTrack(cues, layout);
  let c1 = track.cues[0];
  let c2 = track.cues[1];

  assert.equal(c1.decisionEvidence.decision, 'initialized');
  assert.equal(c1.decisionEvidence.switchReason, 'initialization');
  assert.equal(c1.decisionEvidence.discontinuity, false);

  assert.equal(c2.decisionEvidence.decision, 'retained');
  assert.equal(c2.decisionEvidence.switchReason, null);
  assert.equal(c2.decisionEvidence.discontinuity, false);
});

test('compact focus vs active caption vs other collision evidence distinct', () => {
  let layout = {
    preset: 'youtube',
    width: 1920,
    height: 1080,
    fontSize: 30,
    preferredZones: ['bottom'],
    safeInsets: { top: 54, bottom: 54, left: 54, right: 54 }
  };

  let cues = [
    { cueId: 'cue-active1', startSec: 0.0, endSec: 2.0, speaker: 'guide', text: 'Cue 1' },
    { cueId: 'cue-active2', startSec: 0.5, endSec: 1.5, speaker: 'learner', text: 'Second speaker has a very wide caption that cannot possibly fit on the sides of the bottom zone' }
  ];

  let track = buildCaptionPlacementTrack(cues, layout);
  let c2 = track.cues[1];

  assert.equal(c2.decisionEvidence.decision, 'moved');
  assert.equal(c2.decisionEvidence.switchReason, 'collision');
  assert.equal(c2.decisionEvidence.intersectsCompactFocus, false);
  assert.equal(c2.decisionEvidence.intersectsActiveCaption, false); // accepted candidate is clear

  let bottomCenterCandidate = c2.decisionEvidence.auditTrail.find(
    c => c.zone === 'bottom' && c.horizontal === 'center'
  );
  assert.ok(bottomCenterCandidate);
  assert.equal(bottomCenterCandidate.intersectsActiveCaption, true);

  let hasCaptionRegion = c2.decisionEvidence.collidedRegions.some(
    r => r.id === 'caption-cue:cue-active1' && r.kind === 'caption'
  );
  assert.equal(hasCaptionRegion, true);
});

test('track hash mutation coverage', () => {
  let layout = {
    preset: 'youtube',
    width: 1920,
    height: 1080,
    fontSize: 30,
    preferredZones: ['bottom'],
    safeInsets: { top: 54, bottom: 54, left: 54, right: 54 }
  };
  let cues = [
    { cueId: 'cue-h1', startSec: 0.0, endSec: 1.0, speaker: 'guide', text: 'Cue 1' }
  ];
  let track = buildCaptionPlacementTrack(cues, layout);

  assertCaptionPlacementTrack(track);

  let mutated = JSON.parse(JSON.stringify(track));
  mutated.cues[0].decisionEvidence.auditTrail = [];

  assert.throws(() => {
    assertCaptionPlacementTrack(mutated);
  }, /signature is invalid|mutated|trackHash|does not match/i);
});

test('parseAss fails closed on malformed input', () => {
  assert.throws(() => {
    parseAss(`[Script Info]
PlayResX: 1920
PlayResY: 1080

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:aa.00,0:00:01.00,Default,guide,0000,0000,0000,cue1,{\\an2\\pos(960,950)}Hello`);
  }, /invalid ASS timestamp/i);

  assert.throws(() => {
    parseAss(`[Script Info]
PlayResX: 1920
PlayResY: 1080

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:02.00,0:00:01.00,Default,guide,0000,0000,0000,cue1,{\\an2\\pos(960,950)}Hello`);
  }, /end timestamp not after start/i);

  assert.throws(() => {
    parseAss(`[Script Info]
PlayResX: 1920
PlayResY: 1080

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:01.00,Default,guide,0000,0000,0000,cue1,{\\an2\\pos(960,950)}Hello
Dialogue: 0,0:00:01.00,0:00:02.00,Default,guide,0000,0000,0000,cue1,{\\an2\\pos(960,950)}World`);
  }, /duplicate ASS cue ID/i);

  assert.throws(() => {
    parseAss(`[Script Info]
PlayResX: 1920
PlayResY: 1080

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:01.00,Default,guide,0000,0000,0000,Cue-Unsafe,{\\an2\\pos(960,950)}Hello`);
  }, /unsafe cueId/i);

  assert.throws(() => {
    parseAss(`[Script Info]
PlayResX: 1920
PlayResY: 1080

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:01.00,Default,guide,0000,0000,0000,cue1,{\\an10\\pos(960,950)}Hello`);
  }, /invalid alignment tag|malformed tags/i);
});

test('buildCaptionCues rejects safe-looking fallback keys when cueId is missing', () => {
  assert.throws(() => {
    buildCaptionCues({
      presentation: { width: 1080, height: 1920, captionStyle: { preset: 'tiktok' } },
      clipTranscripts: [
        { speaker: 'guide', id: 'clip-safe', words: [{ word: 'hello', startSec: 0, endSec: 1 }] }
      ]
    });
  }, /missing cueId/i);

  assert.throws(() => {
    buildCaptionCues({
      presentation: { width: 1080, height: 1920, captionStyle: { preset: 'tiktok' } },
      clipTranscripts: [
        { speaker: 'guide', index: 'word-safe', words: [{ word: 'hello', startSec: 0, endSec: 1 }] }
      ]
    });
  }, /missing cueId/i);
});
