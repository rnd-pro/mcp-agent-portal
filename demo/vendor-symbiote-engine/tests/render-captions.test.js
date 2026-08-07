import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CAPTION_PRESENTATION_TRACK_VERSION,
  alignAuthoredCaptionWords,
  assertCaptionPlacementTrack,
  buildCaptionCues,
  buildCaptionPlacementTrack,
  captionCueHasWordTimings,
  captionAttributionForRange,
  captionCuesFromClipTranscripts,
  captionCuesFromTimedWords,
  captionCuesFromTranscript,
  captionTranscriptDurationSec,
  captionWordTimeSeconds,
  overlapMs,
  renderAss,
  renderVtt,
  resolveCaptionProfile,
} from '../render-captions.js';

function word(text, startSec, endSec) {
  return { word: text, startSec, endSec };
}

test('caption transcript cues group by speaker, max words, gaps, and sentence breaks', () => {
  let cues = [
    { cueId: 'guide-0', index: 0, startMs: 0, endMs: 3500, speaker: 'guide' },
    { cueId: 'ops-1', index: 1, startMs: 4500, endMs: 6200, speaker: 'ops' },
  ];
  let transcript = {
    words: [
      word('one', 0, 0.2),
      word('two', 0.25, 0.45),
      word('three', 0.5, 0.7),
      word('four', 0.75, 0.95),
      word('five', 1, 1.2),
      word('six', 1.25, 1.45),
      word('seven', 1.5, 1.7),
      word('eight', 1.75, 1.95),
      word('gap', 3, 3.2),
      word('ops', 4.6, 4.8),
      word('done.', 4.9, 5.1),
      word('next', 5.2, 5.4),
    ],
  };

  let result = captionCuesFromTranscript(transcript, cues);

  assert.deepEqual(result.map((cue) => cue.words.join(' ')), [
    'one two three four five',
    'six seven eight',
    'gap',
    'ops done.',
    'next',
  ]);
  assert.deepEqual(result.map((cue) => cue.speaker), ['guide', 'guide', 'guide', 'ops', 'ops']);
  assert.equal(result[0].attributionSource, 'range-map');
  assert.deepEqual(result[0].wordTimings[0], { text: 'one', startSec: 0, endSec: 0.2 });
  assert.equal(captionCueHasWordTimings(result[0]), true);
});

test('caption transcript cues fall back to transcript text when words are missing', () => {
  let result = captionCuesFromTranscript(
    { text: 'hello fallback', durationSec: 2.5 },
    [{ cueId: 'guide-2', index: 2, startMs: 0, endMs: 2500, speaker: 'guide' }],
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].words.join(' '), 'hello fallback');
  assert.equal(captionCueHasWordTimings(result[0]), false);
  assert.equal(result[0].endSec, 2.5);
  assert.equal(result[0].speaker, 'guide');
});

test('caption clip transcripts sort across clips and preserve speaker attribution', () => {
  let result = captionCuesFromClipTranscripts([
    {
      speaker: 'ops',
      cueIndex: 2,
      words: [word('second', 2, 2.2)],
    },
    {
      speaker: 'guide',
      cueIndex: 1,
      words: [word('first', 0.2, 0.5), word('phrase.', 0.6, 0.9), word('after', 1, 1.2)],
    },
  ]);

  assert.deepEqual(result.map((cue) => cue.words.join(' ')), ['first phrase.', 'after', 'second']);
  assert.deepEqual(result.map((cue) => cue.speaker), ['guide', 'guide', 'ops']);
  assert.deepEqual(result[0].wordTimings.map((item) => item.text), ['first', 'phrase.']);
  assert.equal(result[2].wordTimings[0].startSec, 2);
  assert.equal(result.every((cue) => cue.attributionSource === 'clip-transcript'), true);
});

test('caption timed words use the canonical readable chunk size and preserve attribution', () => {
  let result = captionCuesFromTimedWords([
    word('one', 0, 0.1),
    word('two', 0.1, 0.2),
    word('three', 0.2, 0.3),
    word('four', 0.3, 0.4),
    word('five', 0.4, 0.5),
    word('six', 0.5, 0.6),
  ].map((item) => ({ ...item, speaker: 'guide', cueIndex: 3, timingSource: 'live' })));

  assert.deepEqual(result.map((cue) => cue.words.join(' ')), [
    'one two three four five',
    'six',
  ]);
  assert.equal(result.every((cue) => cue.speaker === 'guide'), true);
  assert.equal(result.every((cue) => cue.cueIndex === 3), true);
  assert.equal(result.every((cue) => cue.attributionSource === 'live'), true);
  assert.throws(() => captionCuesFromTimedWords([{ text: 'bad', startSec: 1, endSec: 1 }]), /invalid/);
  assert.throws(() => captionCuesFromTimedWords([], { maxCharacters: 0 }), /maxCharacters/);

  let longWords = 'complete demonstration workspace set: an.'.split(' ').map((text, index) => ({
    text,
    startSec: index * 0.1,
    endSec: (index + 1) * 0.1,
    speaker: 'guide',
    cueIndex: 4,
    timingSource: 'live',
  }));
  assert.deepEqual(
    captionCuesFromTimedWords(longWords).map((cue) => cue.words.join(' ')),
    ['complete demonstration', 'workspace set: an.'],
  );
});

test('authored caption alignment preserves exact Whisper timing when token counts match', () => {
  let result = alignAuthoredCaptionWords('UNIAPI routes correctly.', [
    word('UN', 1, 1.2),
    word('ePASS', 1.25, 1.6),
    word('wrongly.', 1.7, 2.1),
  ]);

  assert.equal(result.mode, 'authored-identity');
  assert.equal(result.warning, false);
  assert.deepEqual(result.words, [
    { text: 'UNIAPI', startSec: 1, endSec: 1.2 },
    { text: 'routes', startSec: 1.25, endSec: 1.6 },
    { text: 'correctly.', startSec: 1.7, endSec: 2.1 },
  ]);

  let fallback = alignAuthoredCaptionWords('', [
    word('first', 2, 2.2),
    word('second', 2, 2.2),
  ]);
  assert.deepEqual(fallback.words.map((item) => item.text), ['first', 'second']);
});

test('authored caption alignment resamples mismatched tokens without consuming long pauses', () => {
  let result = alignAuthoredCaptionWords('The UNIAPI route works now.', [
    word('The', 0, 0.2),
    word('wrong', 0.25, 0.5),
    word('works', 1.4, 1.65),
    word('now.', 1.7, 2),
  ]);

  assert.equal(result.mode, 'authored-resampled');
  assert.deepEqual(result.words.map((item) => item.text), ['The', 'UNIAPI', 'route', 'works', 'now.']);
  assert.equal(result.words[0].startSec, 0);
  assert.equal(result.words.at(-1).endSec, 2);
  assert.equal(result.words.every((item) => item.endSec > item.startSec), true);
  assert.equal(result.words.every((item, index) => index === 0 || item.startSec >= result.words[index - 1].endSec), true);
  assert.equal(result.words.some((item) => item.startSec < 0.5 && item.endSec > 1.4), false);

  let cues = captionCuesFromClipTranscripts([{
    authoredText: 'The UNIAPI route works now.',
    speaker: 'guide',
    cueIndex: 0,
    words: [
      word('The', 0, 0.2),
      word('wrong', 0.25, 0.5),
      word('works', 1.4, 1.65),
      word('now.', 1.7, 2),
    ],
  }]);
  assert.deepEqual(cues.map((cue) => cue.words.join(' ')), ['The UNIAPI route', 'works now.']);
  assert.equal(cues.every((cue) => cue.attributionSource === 'authored-clip-timing'), true);
});

test('caption builds expose authored, fallback, and mixed clip timing sources precisely', () => {
  let authored = buildCaptionCues({
    sequenceMode: 'sequential',
    presentation: { width: 1080, height: 1920, captionStyle: { preset: 'tiktok' } },
    clipTranscripts: [{
      cueId: 'cue-uniapi',
      authoredText: 'UNIAPI routes.',
      speaker: 'guide',
      cueIndex: 0,
      words: [word('UN', 0, 0.2), word('ePASS', 0.2, 0.5)],
    }],
  });
  assert.equal(authored.source, 'authored+whisper-clip-range-map');
  assert.equal(authored.alignment.authoredClipCount, 1);
  assert.match(authored.vtt, /UNIAPI routes\./);
  assert.match(authored.ass, /UNIAPI/);

  let mixed = buildCaptionCues({
    sequenceMode: 'sequential',
    clipTranscripts: [
      {
        cueId: 'cue-exact',
        authoredText: 'Exact text.',
        speaker: 'guide',
        cueIndex: 0,
        words: [word('wrong', 0, 0.2), word('words.', 0.2, 0.5)],
      },
      {
        cueId: 'cue-fallback',
        speaker: 'guide',
        cueIndex: 1,
        words: [word('fallback', 0.55, 0.8)],
      },
    ],
  });
  assert.equal(mixed.source, 'mixed-authored-whisper+clip-range-map');
  assert.deepEqual(mixed.cues.map((cue) => cue.attributionSource), ['authored-clip-timing', 'clip-transcript']);
  assert.deepEqual(mixed.cues.map((cue) => cue.words.join(' ')), ['Exact text.', 'fallback']);

  let missingTiming = buildCaptionCues({
    transcript: { text: 'Whisper fallback', durationSec: 1 },
    cues: [{ cueId: 'cue-fallback-timing', startMs: 0, endMs: 1000, speaker: 'guide', text: 'Whisper fallback' }],
    clipTranscripts: [{ cueId: 'cue-missing', authoredText: 'Authored text without timing.', words: [] }],
  });
  assert.equal(missingTiming.source, 'whisper+range-map');
  assert.equal(missingTiming.alignment.clips.length, 1);
  assert.equal(missingTiming.alignment.warningCount, 1);
  assert.equal(missingTiming.alignment.clips[0].warningReason, 'missing-whisper-word-timings');
});

test('caption attribution chooses the largest cue overlap and reports unmapped ranges', () => {
  let cues = [
    { cueId: '0', index: 0, startMs: 0, endMs: 1000, speaker: 'guide' },
    { cueId: '1', index: 1, startMs: 800, endMs: 2200, speaker: 'ops' },
  ];

  assert.equal(overlapMs(0, 100, 50, 150), 50);
  assert.deepEqual(captionAttributionForRange(0.9, 1.4, cues), {
    speaker: 'ops',
    cueIndex: 1,
    cueId: '1',
    overlapMs: 500,
    source: 'range-map',
  });
  assert.deepEqual(captionAttributionForRange(3, 3.2, cues), {
    speaker: '',
    cueIndex: null,
    cueId: '',
    overlapMs: 0,
    source: 'unmapped',
  });
  assert.deepEqual(captionAttributionForRange(0, 0.5, [
    { cueId: 'silent-speaker-id', startMs: 0, endMs: 1000 },
  ]), {
    speaker: '',
    cueIndex: null,
    cueId: 'silent-speaker-id',
    overlapMs: 500,
    source: 'range-map',
  });
});

test('caption attribution never promotes id or index aliases into cueId', () => {
  let unmapped = {
    speaker: '',
    cueIndex: null,
    cueId: '',
    overlapMs: 0,
    source: 'unmapped',
  };

  assert.deepEqual(captionAttributionForRange(0, 1, [
    { id: 'legacy-id', startMs: 0, endMs: 1000, speaker: 'legacy-id-speaker' },
    { index: 7, startMs: 0, endMs: 1000, speaker: 'legacy-index-speaker' },
    { cueId: '   ', id: 'legacy-empty-id', index: 8, startMs: 0, endMs: 1000 },
  ]), unmapped);

  assert.deepEqual(captionAttributionForRange(0, 1, [
    { id: 'legacy-id', index: 7, startMs: 0, endMs: 1000, speaker: 'legacy' },
    { cueId: 'canonical-id', index: 9, startMs: 400, endMs: 600, speaker: 'guide' },
  ]), {
    speaker: 'guide',
    cueIndex: 9,
    cueId: 'canonical-id',
    overlapMs: 200,
    source: 'range-map',
  });
});

test('renderVtt formats timestamps, speaker prefixes, escaping, and trailing newline', () => {
  let output = renderVtt([
    { cueId: 'cue_1', startSec: -1, endSec: 1.234, speaker: 'guide', words: ['A&B', '<ok>'] },
    { cueId: 'cue_2', startSec: 3661.2, endSec: 3661.234, speaker: 'ops', words: ['done'] },
  ]);

  assert.equal(output, [
    'WEBVTT',
    '',
    'cue_1',
    '00:00:00.000 --> 00:00:01.234',
    'GUIDE: A&amp;B &lt;ok&gt;',
    '',
    'cue_2',
    '01:01:01.200 --> 01:01:01.234',
    'OPS: done',
    '',
    '',
  ].join('\n'));
});

test('caption helpers expose duration, word time, and caption build source', () => {
  assert.equal(captionWordTimeSeconds({ end: 1.25 }, 'end', 0), 1.25);
  assert.equal(captionWordTimeSeconds({ end: -1 }, 'end', 0.5), 0.5);
  assert.equal(captionTranscriptDurationSec({ words: [word('a', 0, 0.5), word('b', 1, 1.75)] }), 1.75);

  let built = buildCaptionCues({
    sequenceMode: 'sequential',
    presentation: { width: 1080, height: 1920, captionStyle: { preset: 'tiktok' } },
    clipTranscripts: [{ speaker: 'guide', cueId: 'cue-hello', words: [word('hello', 0, 0.2)] }],
  });
  assert.equal(built.source, 'whisper+clip-range-map');
  assert.equal(built.cues[0].cueId, 'cue-hello');
  assert.match(built.vtt, new RegExp(`^WEBVTT\\n\\n${built.cues[0].cueId}\\n00:00:00\\.000 --> 00:00:00\\.200\\nhello\\n\\n$`));
  assert.match(built.ass, /Dialogue: 0,0:00:00\.00,0:00:00\.20,TikTok/);
  assert.match(built.ass, /\\k20\}hello/);
});

test('caption build uses timed clip transcripts before transcript text fallbacks', () => {
  let built = buildCaptionCues({
    transcript: { text: 'fallback transcript without timed words', durationSec: 3 },
    presentation: { width: 1080, height: 1920, captionStyle: { preset: 'tiktok' } },
    clipTranscripts: [
      { speaker: 'guide', cueId: 'cue-timed', cueIndex: 0, words: [word('timed', 1, 1.25), word('clip', 1.3, 1.55)] },
    ],
  });

  assert.equal(built.source, 'whisper+clip-range-map');
  assert.equal(built.cues.length, 1);
  assert.equal(built.cues[0].words.join(' '), 'timed clip');
  assert.equal(captionCueHasWordTimings(built.cues[0]), true);
  assert.match(built.ass, /\\k25\}timed/);
});

test('renderAss emits karaoke timings and escapes unsafe text', () => {
  let placementTrack = buildCaptionPlacementTrack([
    {
      cueId: 'karaoke-guide',
      startSec: 1,
      endSec: 2,
      speaker: 'guide',
      words: ['A{bad}', 'word'],
      wordTimings: [
        { text: 'A{bad}', startSec: 1, endSec: 1.25 },
        { text: 'word', startSec: 1.25, endSec: 1.8 },
      ],
    },
    {
      cueId: 'plain-ops',
      startSec: 2.2,
      endSec: 2.8,
      speaker: 'ops',
      words: ['whole line'],
      wordTimings: [],
    },
  ], {
    width: 1080,
    height: 1920,
    captionStyle: { preset: 'tiktok', fontSize: 54, highlightColor: '#ffff00' },
  });
  let ass = renderAss(placementTrack);

  assert.match(ass, /Style: TikTok,Arial,54/);
  assert.equal(ass.split('\n').find((line) => line.startsWith('Style: TikTok')).split(',')[7], '0');
  assert.match(ass, /Dialogue: 0,0:00:01\.00,0:00:02\.00,TikTok,guide/);
  assert.match(ass, /\\k25\}A bad/);
  assert.match(ass, /\\k55\}word/);
  assert.match(ass, /Dialogue: 0,0:00:02\.20,0:00:02\.80,TikTok,ops/);
  assert.doesNotMatch(ass, /A\{bad\}/);
  let plainTrack = buildCaptionPlacementTrack(
    [{ cueId: 'plain-caption', startSec: 0, endSec: 1, words: ['plain'], wordTimings: [] }],
    { width: 1920, height: 1080, captionStyle: { preset: 'youtube' } },
  );
  let plainAss = renderAss(plainTrack);
  assert.match(plainAss, /PlayResX: 1920/);
  assert.match(plainAss, /Dialogue:.*YouTube.*plain/);
  assert.equal(plainAss.split('\n').find((line) => line.startsWith('Style: YouTube')).split(',')[7], '-1');
});

test('resolveCaptionProfile resolves format-aware presets and validates/clamps overrides', () => {
  let profileYt = resolveCaptionProfile({ preset: 'youtube' }, 1920, 1080);
  assert.equal(profileYt.preset, 'youtube');
  assert.equal(profileYt.fontName, 'Arial');
  assert.equal(profileYt.fontWeight, 700);
  assert.equal(profileYt.fontSize, Math.round(1080 * 0.045));
  assert.deepEqual(profileYt.preferredZones, ['bottom', 'top']);
  assert.equal(profileYt.primaryColor, '#FFFFFFFF');
  assert.equal(profileYt.primaryColorAss, '&H00FFFFFF');

  let profileClamped = resolveCaptionProfile({ preset: 'tiktok', fontSize: 10 }, 1080, 1920);
  assert.equal(profileClamped.fontSize, 54);
  assert.equal(profileClamped.fontWeight, 400);
  assert.equal(resolveCaptionProfile({ preset: 'tiktok', fontWeight: 'bold' }, 1080, 1920).fontWeight, 700);
  assert.equal(resolveCaptionProfile({ preset: 'tiktok', fontWeight: 500 }, 1080, 1920).fontWeight, 400);

  let profileClampedSmall = resolveCaptionProfile({ preset: 'tiktok', fontSize: 10 }, 1080, 800);
  assert.equal(profileClampedSmall.fontSize, 22);

  let profileClampedMax = resolveCaptionProfile({ preset: 'tiktok', fontSize: 600 }, 1080, 1920);
  assert.equal(profileClampedMax.fontSize, Math.round(1920 * 0.12));

  let profileMargins = resolveCaptionProfile({ preset: 'tiktok', margins: { bottom: 800, left: 500 } }, 1080, 1920);
  assert.equal(profileMargins.margins.bottom, Math.round(1920 * 0.35));
  assert.equal(profileMargins.margins.left, Math.round(1080 * 0.35));

  let invalidMargins = resolveCaptionProfile({ preset: 'tiktok', marginV: 'invalid', marginH: NaN }, 1080, 1920);
  assert.deepEqual(invalidMargins.margins, {
    top: Math.round(1920 * 0.1),
    bottom: Math.round(1920 * 0.15),
    left: Math.round(1080 * 0.08),
    right: Math.round(1080 * 0.08),
  });
  assert.equal(Object.values(invalidMargins.margins).every(Number.isFinite), true);

  let profileAssColor = resolveCaptionProfile({ preset: 'tiktok', primaryColor: '&H7A00FF00' }, 1080, 1920);
  assert.equal(profileAssColor.primaryColor, '#00FF0085');
});

test('buildCaptionPlacementTrack resolves collision-free zones with safe insets and avoid regions', () => {
  let cues = [
    { cueId: 'hello-avoid', startSec: 0, endSec: 2, speaker: 'guide', text: 'Hello avoid' }
  ];

  let avoidRegions = [
    { id: 'logo-obstacle', x: 0, y: 1500, width: 1080, height: 300, startSec: 0, endSec: 2 }
  ];

  let result = buildCaptionPlacementTrack(cues, {
    preset: 'tiktok',
    width: 1080,
    height: 1920,
    avoidRegions
  });

  assert.equal(result.cues[0].placement.zone, 'top');
  assert.equal(result.cues[0].placement.alignment, 8);
  assert.equal(result.cues[0].decisionEvidence.auditTrail.find((candidate) => (
    candidate.zone === 'bottom' && candidate.horizontal === 'center'
  ))?.status, 'collided');
  assert.equal(result.cues[0].decisionEvidence.auditTrail.find((candidate) => (
    candidate.zone === 'top' && candidate.horizontal === 'center'
  ))?.status, 'clear');
});

test('buildCaptionPlacementTrack rewraps into a free side column when attention fills the center', () => {
  let result = buildCaptionPlacementTrack([{
    cueId: 'orientation',
    startSec: 0,
    endSec: 2,
    speaker: 'guide',
    text: 'Today we will inspect Maximo',
  }], {
    preset: 'youtube',
    width: 1920,
    height: 1080,
    avoidRegions: [{
      id: 'large-focus',
      x: 192,
      y: 86,
      width: 1060,
      height: 908,
      startSec: 0,
      endSec: 2,
    }],
  });
  let cue = result.cues[0];

  assert.equal(cue.placement.zone, 'bottom');
  assert.equal(cue.placement.horizontal, 'right');
  assert.equal(cue.placement.alignment, 3);
  assert.ok(cue.wrappedLines.length <= cue.placement.lineBudget);
  assert.ok(cue.measuredRect.x >= 1252);
  assert.ok(cue.decisionEvidence.auditTrail.some((candidate) => (
    candidate.status === 'clear' && candidate.span?.width > 0
  )));
  assert.match(renderAss(result), /\\an3/);
});

test('buildCaptionPlacementTrack uses a free vertical shelf between persistent controls', () => {
  let result = buildCaptionPlacementTrack([{
    cueId: 'proof-orientation:caption-1',
    startSec: 0,
    endSec: 2,
    speaker: 'guide',
    text: 'Today we will inspect Maximo',
  }], {
    preset: 'youtube',
    width: 1920,
    height: 1080,
    safeInsets: { top: 54, right: 54, bottom: 54, left: 54 },
    avoidRegions: [
      { id: 'focus', x: 54, y: 109, width: 1197.406, height: 917, startSec: 0, endSec: 2 },
      { id: 'annotation', x: 1263.406, y: 109, width: 120, height: 40, startSec: 0, endSec: 2 },
      { id: 'chrome', x: 0, y: 0, width: 1920, height: 110, startSec: 0, endSec: 2 },
      { id: 'tour-player', x: 1334.406, y: 590.5, width: 568.594, height: 267.375, startSec: 0, endSec: 2 },
      { id: 'chat-composer', x: 1318.406, y: 951, width: 600.594, height: 128, startSec: 0, endSec: 2 },
    ],
  });
  let cue = result.cues[0];

  assert.equal(cue.placement.zone, 'bottom');
  assert.equal(cue.placement.horizontal, 'right');
  assert.ok(cue.measuredRect.x >= 1257);
  assert.ok(cue.measuredRect.y >= 110);
  assert.ok(cue.measuredRect.y + cue.measuredRect.height < 590.5);
  assert.ok(cue.decisionEvidence.auditTrail.some((candidate) => (
    candidate.status === 'clear' && Number.isFinite(candidate.adaptiveY)
  )));
});

test('square captions preserve the largest readable cue font in a narrow safe shelf', () => {
  let result = buildCaptionPlacementTrack([{
    cueId: 'proof-explain-map:caption-3',
    startSec: 0,
    endSec: 2,
    speaker: 'ops',
    text: 'double-clicking empty space to',
  }], {
    preset: 'square',
    fontSize: 43,
    width: 1080,
    height: 1080,
    safeInsets: { top: 54, right: 54, bottom: 54, left: 54 },
    avoidRegions: [
      { id: 'focus', kind: 'focus', x: 54, y: 109, width: 667.609, height: 917, startSec: 0, endSec: 2 },
      { id: 'action', kind: 'action', x: 54, y: 109, width: 667.609, height: 917, startSec: 0, endSec: 2 },
      { id: 'annotation', kind: 'annotation', x: 733.609, y: 109, width: 120, height: 40, startSec: 0, endSec: 2 },
      { id: 'chrome', kind: 'persistent-chrome', x: 0, y: 0, width: 1080, height: 110, startSec: 0, endSec: 2 },
      { id: 'player', kind: 'critical-control', x: 771.609, y: 794.5, width: 291.391, height: 118, startSec: 0, endSec: 2 },
      { id: 'composer', kind: 'critical-control', x: 755.609, y: 935, width: 323.391, height: 144, startSec: 0, endSec: 2 },
    ],
  });
  let cue = result.cues[0];

  assert.equal(cue.fontSize, 41);
  assert.equal(cue.lineHeight, 53);
  assert.equal(cue.decisionEvidence.adaptiveTypography, true);
  assert.equal(cue.placement.horizontal, 'right');
  assert.deepEqual(cue.measuredRect, { x: 726, y: 153, width: 300, height: 212 });
  assert.match(renderAss(result), /\\fs41/);
});

test('bold caption metrics cover Chromium Arial measurements', () => {
  let result = buildCaptionPlacementTrack([
    {
      cueId: 'clarify-detail',
      startSec: 0,
      endSec: 2,
      speaker: 'ops',
      text: 'the detail?',
    },
    {
      cueId: 'conclusion-final',
      startSec: 2,
      endSec: 4,
      speaker: 'ops',
      text: 'the next task.',
    },
  ], {
    preset: 'youtube',
    width: 1920,
    height: 1080,
  });

  assert.deepEqual(result.cues.map((cue) => cue.wrappedLines), [
    ['OPS: the detail?'],
    ['OPS: the next task.'],
  ]);
  assert.ok(result.cues[0].measuredRect.width >= 378);
  assert.ok(result.cues[1].measuredRect.width >= 447);
});

test('regular caption metrics cover Chromium Arial measurements', () => {
  let result = buildCaptionPlacementTrack([
    {
      cueId: 'conclusion-final',
      startSec: 0,
      endSec: 2,
      speaker: 'ops',
      text: 'the next task.',
    },
  ], {
    preset: 'tiktok',
    width: 1080,
    height: 1920,
  });

  assert.deepEqual(result.cues[0].wrappedLines, ['[OPS] the next task.']);
  assert.ok(result.cues[0].measuredRect.width >= 596);
});

test('vertical captions adapt their line budget in the safe side column beside tall attention', () => {
  let result = buildCaptionPlacementTrack([
    {
      cueId: 'proof-orientation:caption-1',
      startSec: 0,
      endSec: 2,
      speaker: 'guide',
      text: 'Today we will inspect Maximo',
    },
    {
      cueId: 'proof-explain-map:caption-4',
      startSec: 2,
      endSec: 4,
      speaker: 'guide',
      text: 'graph, and zoom before opening',
    },
    {
      cueId: 'proof-orientation:caption-2',
      startSec: 4,
      endSec: 6,
      speaker: 'guide',
      text: 'interaction proof lesson and verify',
    },
    {
      cueId: 'proof-clarify-detail:caption-3',
      startSec: 6,
      endSec: 8,
      speaker: 'ops',
      text: 'the detail?',
    },
  ], {
    preset: 'tiktok',
    width: 1080,
    height: 1920,
    preferredZones: ['bottom', 'top'],
    safeInsets: { top: 54, right: 54, bottom: 54, left: 54 },
    avoidRegions: [
      {
        id: 'focus',
        x: 54,
        y: 109,
        width: 634.609,
        height: 1757,
        startSec: 0,
        endSec: 8,
      },
      {
        id: 'annotation',
        x: 700.609,
        y: 109,
        width: 120,
        height: 40,
        startSec: 0,
        endSec: 8,
      },
    ],
  });
  let [orientationCue, mapCue, clippingCue, detailCue] = result.cues;

  assert.equal(result.profile.fontSize, 67);
  assert.equal(result.profile.fontWeight, 400);
  assert.equal(result.profile.maxLines, 3);
  assert.deepEqual(result.cues.map((cue) => cue.placement.zone), ['bottom', 'bottom', 'bottom', 'bottom']);
  assert.deepEqual(result.cues.map((cue) => cue.placement.horizontal), ['right', 'right', 'right', 'right']);
  assert.equal(orientationCue.wrappedLines.length, 5);
  assert.equal(mapCue.wrappedLines.length, 5);
  assert.deepEqual(clippingCue.wrappedLines, ['[GUIDE]', 'interaction', 'proof', 'lesson', 'and', 'verify']);
  assert.deepEqual(detailCue.wrappedLines, ['[OPS] the', 'detail?']);
  assert.equal(orientationCue.placement.lineBudget, 6);
  assert.equal(mapCue.placement.lineBudget, 6);
  assert.equal(clippingCue.placement.lineBudget, 6);
  assert.equal(detailCue.placement.lineBudget, 6);
  assert.ok(clippingCue.measuredRect.width >= 324);
  assert.ok(detailCue.measuredRect.width >= 291);
  assert.ok(clippingCue.measuredRect.width <= clippingCue.placement.wrapWidth);
  assert.ok(result.cues.every((cue) => cue.measuredRect.x >= 693));
  assert.ok(result.cues.every((cue) => (
    cue.decisionEvidence.auditTrail.some((candidate) => candidate.status === 'clear' || candidate.status === 'collided')
  )));
});

test('vertical captions preserve long words in the safe side column', () => {
  let result = buildCaptionPlacementTrack([{
    cueId: 'proof-conclusion-final:caption-3',
    startSec: 61.212,
    endSec: 62.552,
    speaker: 'guide',
    text: 'complete demonstration',
  }], {
    preset: 'tiktok',
    width: 1080,
    height: 1920,
    safeInsets: { top: 54, right: 54, bottom: 54, left: 54 },
    avoidRegions: [
      {
        id: 'focus:proof-conclusion-final:0',
        x: 498,
        y: 110,
        width: 528,
        height: 1756,
        startSec: 57.652,
        endSec: 66.722,
      },
      {
        id: 'maximo-app-chrome',
        kind: 'persistent-chrome',
        x: 0,
        y: 0,
        width: 1080,
        height: 110,
        startSec: 0,
        endSec: 72,
      },
    ],
  });
  let cue = result.cues[0];

  assert.deepEqual(cue.wrappedLines, ['[GUIDE]', 'complete', 'demonstration']);
  assert.equal(cue.placement.horizontal, 'left');
  assert.equal(cue.placement.wrapWidth, 440);
  assert.equal(cue.measuredRect.x + cue.measuredRect.width <= 494, true);
  assert.match(renderAss(result), /demonstration/);
  assert.doesNotMatch(renderAss(result), /demonstratio\\Nn/);
});

test('caption chunks fit the measured side interval from the rejected Maximo orientation', () => {
  let text = 'Today we will inspect Maximo interaction proof lesson. By the end: Create a complete demonstration workspace set: an.';
  let words = text.split(/\s+/u).map((value, index) => ({
    text: value,
    startSec: index * 0.25,
    endSec: (index + 1) * 0.25,
    speaker: 'guide',
    cueIndex: 0,
    timingSource: 'live',
  }));
  let cues = captionCuesFromTimedWords(words).map((cue, index) => ({
    ...cue,
    cueId: `proof-orientation:caption-${index + 1}`,
  }));
  let result = buildCaptionPlacementTrack(cues, {
    preset: 'youtube',
    width: 1920,
    height: 1080,
    avoidRegions: [
      { id: 'focus', x: 54, y: 109, width: 1230.406, height: 917, startSec: 0, endSec: 10 },
      { id: 'annotation', x: 1296.406, y: 109, width: 120, height: 40, startSec: 0, endSec: 10 },
    ],
  });

  assert.deepEqual(cues.map((cue) => cue.words.join(' ')), [
    'Today we will inspect Maximo',
    'interaction proof lesson.',
    'By the end: Create a',
    'complete demonstration',
    'workspace set: an.',
  ]);
  assert.equal(result.cues.every((cue) => cue.placement.horizontal === 'right'), true);
  assert.equal(result.cues.every((cue) => cue.wrappedLines.length <= 3), true);
  assert.equal(result.cues.every((cue) => cue.measuredRect.x >= 1290), true);
});

test('buildCaptionPlacementTrack throws when no readable collision-free zone exists', () => {
  let cues = [
    { cueId: 'no-place', startSec: 0, endSec: 2, speaker: 'guide', text: 'No place' }
  ];

  let avoidRegions = [
    { id: 'fullscreen-obstacle', x: 0, y: 0, width: 1080, height: 1920, startSec: 0, endSec: 2 }
  ];

  assert.throws(() => {
    buildCaptionPlacementTrack(cues, {
      preset: 'tiktok',
      width: 1080,
      height: 1920,
      avoidRegions
    });
  }, /No readable placement zone available/);
});

test('buildCaptionPlacementTrack preserves maxLines when no side collision narrows the caption', () => {
  assert.throws(() => buildCaptionPlacementTrack([{
    cueId: 'too-many-lines',
    startSec: 0,
    endSec: 2,
    text: 'one two three four five six seven eight nine ten eleven twelve',
  }], {
    preset: 'youtube',
    width: 1920,
    height: 1080,
    maxLines: 2,
    maxLineWidthPct: 0.1,
  }), /wrapped lines .* exceeded available line budget \(2\)/);
});

test('renderAss validates placement track and outputs explicit wrapped lines', () => {
  let cues = [
    { cueId: 'wrapped-caption', startSec: 0, endSec: 2, speaker: 'guide', text: 'This is a long sentence that should wrap' }
  ];

  let trackResult = buildCaptionPlacementTrack(cues, {
    preset: 'tiktok',
    width: 1080,
    height: 1920,
    maxLines: 4,
    maxLineWidthPct: 0.5
  });

  let ass = renderAss(trackResult);
  assert.match(ass, /PlayResX: 1080/);
  assert.match(ass, /PlayResY: 1920/);
  assert.match(ass, /Dialogue:.*TikTok/);
  assert.match(ass, /\\pos\(\d+,\d+\).*\\N/);
});

test('caption presentation requires actual dimensions and rejects unknown presets', () => {
  assert.throws(() => resolveCaptionProfile({ preset: 'youtube' }), /actual width and height/);
  assert.throws(
    () => resolveCaptionProfile({ preset: 'unknown', width: 1920, height: 1080 }),
    /unsupported caption preset/,
  );
  assert.throws(
    () => buildCaptionPlacementTrack([], { width: 0, height: 1080, preset: 'youtube' }),
    /actual width and height/,
  );
});

test('caption placement carries cue identity, text, timings, and actual profile dimensions', () => {
  for (let dimensions of [
    { preset: 'youtube', width: 1920, height: 1080 },
    { preset: 'tiktok', width: 1080, height: 1920 },
    { preset: 'square', width: 1080, height: 1080 },
  ]) {
    let result = buildCaptionPlacementTrack([{
      cueId: 'cue-intro',
      cueIndex: 4,
      startSec: 1,
      endSec: 2,
      speaker: 'guide',
      text: 'Readable caption',
      wordTimings: [
        { text: 'Readable', startSec: 1, endSec: 1.4 },
        { text: 'caption', startSec: 1.4, endSec: 1.9 },
      ],
    }], dimensions);
    assert.equal(result.schemaVersion, CAPTION_PRESENTATION_TRACK_VERSION);
    assert.equal(result.profile.width, dimensions.width);
    assert.equal(result.profile.height, dimensions.height);
    assert.equal(result.cues[0].cueId, 'cue-intro');
    assert.equal(result.cues[0].cueIndex, 4);
    assert.equal(result.cues[0].text, 'Readable caption');
    assert.equal(result.cues[0].wordTimings.length, 2);
    assert.ok(result.cues[0].measuredRect.width > 0);
  }
});

test('caption placement rejects invalid identities, timings, safe areas, and avoid regions', () => {
  let options = { width: 1920, height: 1080, preset: 'youtube' };
  assert.throws(() => buildCaptionPlacementTrack([
    { cueId: 'same', startSec: 0, endSec: 1, text: 'one' },
    { cueId: 'same', startSec: 1, endSec: 2, text: 'two' },
  ], options), /duplicated/);
  assert.throws(() => buildCaptionPlacementTrack([
    { cueId: 'bad-time', startSec: 2, endSec: 1, text: 'bad' },
  ], options), /invalid timing/);
  assert.throws(() => buildCaptionPlacementTrack([], {
    ...options,
    safeInsets: { left: 1000, right: 1000 },
  }), /leave no readable/);
  assert.throws(() => buildCaptionPlacementTrack([], {
    ...options,
    avoidRegions: [{ id: 'test-avoid', x: 0, y: 0, width: 10, height: 0 }],
  }), /positive finite rectangle/);
});

test('caption placement v3 requires explicit cueId and rejects identity aliases', () => {
  let options = { width: 1920, height: 1080, preset: 'youtube' };
  let cue = { startSec: 0, endSec: 1, text: 'Explicit identity' };

  for (let identity of [
    {},
    { cueId: '' },
    { cueId: '   ' },
    { cueId: 7 },
    { id: 'legacy-id' },
    { index: 7 },
    { id: 'legacy-id', index: 7 },
  ]) {
    assert.throws(
      () => buildCaptionPlacementTrack([{ ...cue, ...identity }], options),
      /requires a nonempty explicit cueId/,
    );
  }

  let valid = buildCaptionPlacementTrack([{ ...cue, cueId: 'stable-cue-id' }], options);
  let aliased = structuredClone(valid);
  delete aliased.cues[0].cueId;
  aliased.cues[0].id = 'stable-cue-id';
  aliased.cues[0].index = aliased.cues[0].cueIndex;
  assert.throws(
    () => assertCaptionPlacementTrack(aliased),
    /requires a nonempty explicit cueId/,
  );
});

test('caption placement separates time-overlapping cues and rejects genuinely exhausted zones', () => {
  let result = buildCaptionPlacementTrack([
    { cueId: 'guide', startSec: 0, endSec: 2, speaker: 'guide', text: 'First speaker has a very wide caption that blocks the entire width of the bottom zone' },
    { cueId: 'learner', startSec: 0.5, endSec: 1.5, speaker: 'learner', text: 'Second speaker also has a very wide caption that cannot possibly fit on the sides of the bottom zone' },
  ], {
    preset: 'youtube',
    width: 1920,
    height: 1080,
  });
  let [first, second] = result.cues;
  let intersects = first.measuredRect.x < second.measuredRect.x + second.measuredRect.width
    && first.measuredRect.x + first.measuredRect.width > second.measuredRect.x
    && first.measuredRect.y < second.measuredRect.y + second.measuredRect.height
    && first.measuredRect.y + first.measuredRect.height > second.measuredRect.y;

  assert.deepEqual(result.cues.map((cue) => cue.placement.zone), ['bottom', 'top']);
  assert.equal(intersects, false);
  let bottomOnly = buildCaptionPlacementTrack([
    { cueId: 'bottom-guide', startSec: 0, endSec: 2, speaker: 'guide', text: 'First speaker' },
    { cueId: 'bottom-learner', startSec: 1, endSec: 3, speaker: 'learner', text: 'Second speaker' },
  ], {
    preset: 'youtube',
    width: 1920,
    height: 1080,
    preferredZones: ['bottom'],
  });
  assert.deepEqual(bottomOnly.cues.map((cue) => cue.placement.zone), ['bottom', 'bottom']);
  assert.equal(bottomOnly.cues[1].placement.horizontal, 'center');
  assert.notEqual(bottomOnly.cues[1].measuredRect.y, bottomOnly.cues[0].measuredRect.y);
  assert.ok(bottomOnly.cues[1].decisionEvidence.auditTrail.some((candidate) => (
    candidate.status === 'clear' && Number.isFinite(candidate.adaptiveY)
  )));

  assert.throws(() => buildCaptionPlacementTrack([
    { cueId: 'exhausted-1', startSec: 0, endSec: 1, speaker: 'guide', text: 'First speaker' },
    { cueId: 'exhausted-2', startSec: 1, endSec: 3, speaker: 'learner', text: 'Second speaker' },
  ], {
    preset: 'youtube',
    width: 1920,
    height: 1080,
    preferredZones: ['bottom'],
    avoidRegions: [{ id: 'focus', x: 0, y: 0, width: 1920, height: 1080, startSec: 1, endSec: 3 }],
  }), /No readable placement zone available for cue ID exhausted-2/);
});

test('renderAss assigns partial timings only to normalized matching display words', () => {
  let track = buildCaptionPlacementTrack([{
    cueId: 'partial-timings',
    startSec: 0,
    endSec: 1,
    speaker: 'guide',
    text: 'Untimed HELLO, world!',
    wordTimings: [
      { text: 'hello', startSec: 0.2, endSec: 0.5 },
      { text: 'WORLD', startSec: 0.5, endSec: 0.8 },
    ],
  }], {
    preset: 'youtube',
    width: 1920,
    height: 1080,
  });

  let ass = renderAss(track);

  assert.match(ass, /GUIDE: Untimed \{\\k50\}HELLO, \{\\k30\}world!/);
  assert.doesNotMatch(ass, /\\k\d+\}GUIDE:/);
  assert.doesNotMatch(ass, /\\k\d+\}Untimed/);
});

test('caption placement rejects measured text that cannot fit inside the safe bounds', () => {
  assert.throws(() => buildCaptionPlacementTrack([{
    cueId: 'outside-safe-bounds',
    startSec: 0,
    endSec: 1,
    text: 'WWWW',
  }], {
    preset: 'youtube',
    width: 16,
    height: 300,
    maxLines: 10,
    safeInsets: { top: 0, bottom: 0, left: 2, right: 2 },
  }), /No readable placement zone available.*outside caption safe bounds/);
});

test('caption placement validation rejects tampered measured rectangles', () => {
  let track = buildCaptionPlacementTrack([{
    cueId: 'valid-geometry',
    startSec: 0,
    endSec: 1,
    text: 'Valid geometry',
  }], {
    preset: 'youtube',
    width: 1920,
    height: 1080,
  });
  let zeroWidth = structuredClone(track);
  zeroWidth.cues[0].measuredRect.width = 0;
  let outsideSafeBounds = structuredClone(track);
  outsideSafeBounds.cues[0].measuredRect.x = track.safeInsets.left - 1;
  let mismatchedAnchor = structuredClone(track);
  mismatchedAnchor.cues[0].placement.x += 1;
  let invalidLineBudget = structuredClone(track);
  invalidLineBudget.cues[0].placement.lineBudget = 0;
  let staleTypography = structuredClone(track);
  staleTypography.profile.fontSize = 5000;
  let staleAvoidEvidence = structuredClone(track);
  staleAvoidEvidence.avoidRegions.push({
    id: 'late-attention',
    kind: 'focus',
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    startSec: 0,
    endSec: 1,
  });

  assert.throws(
    () => assertCaptionPlacementTrack(zeroWidth),
    /cue "valid-geometry" has an invalid measured rectangle/,
  );
  assert.throws(
    () => assertCaptionPlacementTrack(outsideSafeBounds),
    /cue "valid-geometry" measured rectangle is outside caption safe bounds/,
  );
  assert.throws(
    () => assertCaptionPlacementTrack(mismatchedAnchor),
    /cue "valid-geometry" placement does not match its measured rectangle/,
  );
  assert.throws(
    () => assertCaptionPlacementTrack(invalidLineBudget),
    /cue "valid-geometry" has an invalid line budget/,
  );
  assert.throws(
    () => assertCaptionPlacementTrack(staleTypography),
    /cannot be reproduced from its evidence|does not match its resolved presentation evidence/,
  );
  assert.throws(
    () => assertCaptionPlacementTrack(staleAvoidEvidence),
    /cannot be reproduced from its evidence|does not match its resolved presentation evidence/,
  );
});

test('caption placement retains previous placement when collision-free and changes with switchReason on collision', () => {
  let cues = [
    { cueId: 'cue-1', startSec: 0, endSec: 2, speaker: 'guide', text: 'First caption text' },
    { cueId: 'cue-2', startSec: 2, endSec: 4, speaker: 'guide', text: 'Second caption text' },
    { cueId: 'cue-3', startSec: 4, endSec: 6, speaker: 'guide', text: 'Third caption text' },
  ];

  let avoidRegions = [
    { id: 'obstacle-cue2', kind: 'focus', x: 0, y: 1500, width: 1080, height: 300, startSec: 2, endSec: 4 }
  ];

  let result = buildCaptionPlacementTrack(cues, {
    preset: 'tiktok',
    width: 1080,
    height: 1920,
    avoidRegions,
  });

  assert.equal(result.cues[0].placement.zone, 'bottom');
  assert.equal(result.cues[0].decisionEvidence.switchReason, 'initialization');

  assert.notEqual(result.cues[1].placement.zone, 'bottom');
  assert.equal(result.cues[1].decisionEvidence.switchReason, 'collision');

  assert.equal(result.cues[2].placement.zone, result.cues[1].placement.zone);
  assert.equal(result.cues[2].placement.horizontal, result.cues[1].placement.horizontal);
  assert.equal(result.cues[2].decisionEvidence.switchReason, null);
});

test('caption continuity ignores a nearby critical region until rectangles actually overlap', () => {
  let cues = [
    { cueId: 'cue-near-1', startSec: 0, endSec: 1.5, text: 'Stable caption' },
    { cueId: 'cue-near-2', startSec: 1.5, endSec: 3, text: 'Stable caption' },
  ];
  let layout = { preset: 'youtube', width: 1920, height: 1080 };
  let baseline = buildCaptionPlacementTrack(cues, layout);
  let rect = baseline.cues[0].measuredRect;
  let nearMiss = {
    id: 'near-miss',
    x: rect.x,
    y: rect.y - 2,
    width: rect.width,
    height: 1,
    startSec: 1.5,
    endSec: 3,
  };

  let track = buildCaptionPlacementTrack(cues, {
    ...layout,
    avoidRegions: [nearMiss],
  });

  assert.deepEqual(track.cues[1].placement, track.cues[0].placement);
  assert.equal(track.cues[1].decisionEvidence.switchReason, null);
  assert.equal(track.relocationCount, 0);
  assert.equal(track.hardCollisionCount, 0);
});

test('caption continuity rejects a reused slot when the next cue cannot fit readably', () => {
  assert.throws(() => {
    buildCaptionPlacementTrack([
      { cueId: 'fit-1', startSec: 0, endSec: 1, text: 'Short' },
      {
        cueId: 'fit-2',
        startSec: 1,
        endSec: 2,
        text: 'This longer caption needs a different readable slot or adaptive typography',
      },
    ], {
      preset: 'square',
      width: 1080,
      height: 1080,
      maxLines: 1,
      fontSize: 50,
    });
  }, /Typography cannot fit/);
});

test('focused continuity tests on 1920x1080, 1080x1080, and 1080x1920 layouts', () => {
  for (let layout of [
    { preset: 'youtube', width: 1920, height: 1080, },
    { preset: 'square', width: 1080, height: 1080, },
    { preset: 'tiktok', width: 1080, height: 1920, },
  ]) {
    let cuesSameAttention = [
      { cueId: 'cue-a1', startSec: 0.0, endSec: 1.5, speaker: 'guide', text: 'Short', },
      { cueId: 'cue-a2', startSec: 1.5, endSec: 3.0, speaker: 'guide', text: 'A slightly longer caption text', },
      { cueId: 'cue-a3', startSec: 3.0, endSec: 4.5, speaker: 'guide', text: 'Short again', },
    ];
    let trackSame = buildCaptionPlacementTrack(cuesSameAttention, layout);
    assert.equal(trackSame.cues[0].placement.x, trackSame.cues[1].placement.x);
    assert.equal(trackSame.cues[0].placement.y, trackSame.cues[1].placement.y);
    assert.equal(trackSame.cues[0].placement.alignment, trackSame.cues[1].placement.alignment);
    assert.equal(trackSame.cues[0].placement.zone, trackSame.cues[1].placement.zone);
    assert.equal(trackSame.cues[1].placement.x, trackSame.cues[2].placement.x);
    assert.equal(trackSame.cues[1].placement.y, trackSame.cues[2].placement.y);
    assert.equal(trackSame.cues[1].placement.alignment, trackSame.cues[2].placement.alignment);
    assert.equal(trackSame.cues[1].placement.zone, trackSame.cues[2].placement.zone);

    assert.equal(trackSame.cues[0].decisionEvidence.switchReason, 'initialization');
    assert.equal(trackSame.cues[1].decisionEvidence.switchReason, null);
    assert.equal(trackSame.cues[2].decisionEvidence.switchReason, null);
    assert.equal(trackSame.relocationCount, 0);

    let bottomMargin = layout.preset === 'tiktok' ? 288
                     : layout.preset === 'square' ? 108
                     : 86;
    let obstacleY = layout.height - bottomMargin - 50;
    let cuesCollision = [
      { cueId: 'cue-b1', startSec: 0.0, endSec: 1.5, speaker: 'guide', text: 'First cue', },
      { cueId: 'cue-b2', startSec: 1.5, endSec: 3.0, speaker: 'guide', text: 'Second cue', },
      { cueId: 'cue-b3', startSec: 3.0, endSec: 4.5, speaker: 'guide', text: 'Third cue', },
    ];
    let avoidRegions = [
      { id: 'obstacle-cue2', kind: 'focus', x: 0, y: obstacleY, width: layout.width, height: 200, startSec: 1.5, endSec: 3.0, },
    ];
    let trackCollision = buildCaptionPlacementTrack(cuesCollision, {
      ...layout,
      avoidRegions,
    });
    assert.equal(trackCollision.cues[0].placement.zone, 'bottom');
    assert.notEqual(trackCollision.cues[1].placement.zone, 'bottom');
    assert.equal(trackCollision.cues[2].placement.zone, trackCollision.cues[1].placement.zone);

    assert.equal(trackCollision.relocationCount, 1);
    assert.equal(trackCollision.hardCollisionCount, 0);
    assert.equal(trackCollision.forcedCollisionRelocationCount, 1);
    assert.equal(trackCollision.forcedSafeBoundsRelocationCount, 0);
    assert.equal(trackCollision.unforcedSwitchCount, 0);
    assert.equal(trackCollision.cues[0].decisionEvidence.switchReason, 'initialization');
    assert.equal(trackCollision.cues[1].decisionEvidence.switchReason, 'collision');
    assert.equal(trackCollision.cues[2].decisionEvidence.switchReason, null);

    let cuesGap = [
      { cueId: 'cue-c1', startSec: 0.0, endSec: 1.0, speaker: 'guide', text: 'Cue 1', },
      { cueId: 'cue-c2', startSec: 1.0, endSec: 2.0, speaker: 'guide', text: 'Cue 2', },
      { cueId: 'cue-c3', startSec: 3.0, endSec: 4.0, speaker: 'guide', text: 'Cue 3', },
    ];
    let avoidRegionsGap = [
      { id: 'obstacle-cue2', kind: 'focus', x: 0, y: obstacleY, width: layout.width, height: 200, startSec: 1.0, endSec: 2.0, },
    ];
    let trackGap = buildCaptionPlacementTrack(cuesGap, {
      ...layout,
      avoidRegions: avoidRegionsGap,
      continuityGapMs: 750,
    });
    assert.equal(trackGap.cues[0].placement.zone, 'bottom');
    assert.notEqual(trackGap.cues[1].placement.zone, 'bottom');
    assert.equal(trackGap.cues[2].placement.zone, 'top');

    assert.equal(trackGap.relocationCount, 1);
    assert.equal(trackGap.hardCollisionCount, 0);
    assert.equal(trackGap.forcedCollisionRelocationCount, 1);
    assert.equal(trackGap.forcedSafeBoundsRelocationCount, 0);
    assert.equal(trackGap.unforcedSwitchCount, 0);
    assert.equal(trackGap.cues[0].decisionEvidence.switchReason, 'initialization');
    assert.equal(trackGap.cues[1].decisionEvidence.switchReason, 'collision');
    assert.equal(trackGap.cues[2].decisionEvidence.switchReason, null);
  }
});

test('focused VTT tests for canonical cueId and uniqueness validation', () => {
  let output = renderVtt([
    { cueId: 'custom-id-1', startSec: 1, endSec: 2, speaker: 'guide', words: ['Hello'], },
    { cueId: 'custom-id-2', startSec: 3, endSec: 4, speaker: 'ops', words: ['World'], },
  ]);
  assert.match(output, /WEBVTT\n\ncustom-id-1\n00:00:01\.000 --> 00:00:02\.000\nGUIDE: Hello\n\ncustom-id-2\n00:00:03\.000 --> 00:00:04\.000\nOPS: World\n\n/);

  assert.throws(() => {
    renderVtt([
      { cueId: 'dup-id', startSec: 1, endSec: 2, speaker: 'guide', words: ['Hello'], },
      { cueId: 'dup-id', startSec: 3, endSec: 4, speaker: 'ops', words: ['World'], },
    ]);
  }, /duplicate cue ID "dup-id"/);

  assert.throws(() => {
    renderVtt([
      { id: 'legacy-index-alias', startSec: 1, endSec: 2, speaker: 'guide', words: ['Hello'] },
    ]);
  }, /requires a valid canonical cueId|has unsafe or missing cueId/);
});

test('caption grouping preserves adjacent source cue identities through VTT output', () => {
  let built = buildCaptionCues({
    clipTranscripts: [
      {
        cueId: 'clip-a',
        cueIndex: 0,
        speaker: 'guide',
        authoredText: 'Alpha',
        words: [{ text: 'Alpha', startSec: 0, endSec: 0.4 }],
      },
      {
        cueId: 'clip-b',
        cueIndex: 0,
        speaker: 'guide',
        authoredText: 'Beta',
        words: [{ text: 'Beta', startSec: 0.4, endSec: 0.8 }],
      },
    ],
  });

  assert.deepEqual(built.cues.map((cue) => cue.cueId), ['clip-a', 'clip-b']);
  assert.match(built.vtt, /\nclip-a\n/);
  assert.match(built.vtt, /\nclip-b\n/);
});

test('caption placement rejects non-canonical continuity controls before producing a track', () => {
  let cues = [{ cueId: 'cue-1', startSec: 0, endSec: 1, text: 'Caption' }];

  for (let continuityGapMs of ['750', 0, -1, 1.5]) {
    assert.throws(
      () => buildCaptionPlacementTrack(cues, {
        preset: 'youtube',
        width: 1920,
        height: 1080,
        continuityGapMs,
      }),
      /continuityGapMs must be a positive integer/,
    );
  }
  assert.throws(
    () => buildCaptionPlacementTrack(cues, {
      preset: 'youtube',
      width: 1920,
      height: 1080,
      discontinuity: true,
    }),
    /discontinuity must be declared on the cue/,
  );
  assert.throws(
    () => buildCaptionPlacementTrack([
      { ...cues[0], resetContinuity: 'true' },
    ], {
      preset: 'youtube',
      width: 1920,
      height: 1080,
    }),
    /invalid resetContinuity flag/,
  );
});

test('v3 continuity evidence and cue identity survive shifted track reconstruction', () => {
  let layout = { preset: 'youtube', width: 1920, height: 1080, };
  let bottomMargin = 86;
  let obstacleY = layout.height - bottomMargin - 50;

  let cues = [
    { cueId: 'cue-b1', startSec: 0.0, endSec: 1.5, speaker: 'guide', text: 'First cue', },
    { cueId: 'cue-b2', startSec: 1.5, endSec: 3.0, speaker: 'guide', text: 'Second cue', },
  ];
  let avoidRegions = [
    { id: 'obstacle', kind: 'focus', x: 0, y: obstacleY, width: layout.width, height: 200, startSec: 1.5, endSec: 3.0, },
  ];
  let track = buildCaptionPlacementTrack(cues, {
    ...layout,
    avoidRegions,
  });
  assert.equal(track.hardCollisionCount, 0);
  assert.equal(track.forcedCollisionRelocationCount, 1);
  assert.equal(track.relocationCount, 1);
  assert.equal(track.unforcedSwitchCount, 0);

  let cuesWithDiscontinuity = [
    { cueId: 'cue-d1', cueIndex: 41, startSec: 0.0, endSec: 1.0, speaker: 'guide', text: 'Cue 1', },
    { cueId: 'cue-d2', cueIndex: 42, startSec: 1.2, endSec: 2.2, speaker: 'guide', text: 'Cue 2', sceneBoundary: true, resetContinuity: false, discontinuity: false, },
    { cueId: 'cue-d3', cueIndex: 43, startSec: 4.0, endSec: 5.0, speaker: 'guide', text: 'Cue 3', resetContinuity: true, discontinuity: true, },
  ];
  let trackWithDisc = buildCaptionPlacementTrack(cuesWithDiscontinuity, {
    ...layout,
    continuityGapMs: 1200,
  });

  assert.equal(trackWithDisc.schemaVersion, CAPTION_PRESENTATION_TRACK_VERSION);
  assert.equal(trackWithDisc.continuityGapMs, 1200);
  assert.deepEqual(trackWithDisc.cues.map((cue) => cue.cueId), ['cue-d1', 'cue-d2', 'cue-d3']);
  assert.deepEqual(trackWithDisc.cues.map((cue) => cue.cueIndex), [41, 42, 43]);
  assert.deepEqual(
    {
      sceneBoundary: trackWithDisc.cues[1].sceneBoundary,
      resetContinuity: trackWithDisc.cues[1].resetContinuity,
      discontinuity: trackWithDisc.cues[1].discontinuity,
    },
    { sceneBoundary: true, resetContinuity: false, discontinuity: false },
  );
  assert.equal(trackWithDisc.cues[2].resetContinuity, true);
  assert.equal(trackWithDisc.cues[2].discontinuity, true);

  let validated = assertCaptionPlacementTrack(trackWithDisc);
  assert.equal(validated.continuityGapMs, 1200);
  assert.equal(validated.cues[1].sceneBoundary, true);

  let shiftSec = 8;
  let shifted = buildCaptionPlacementTrack(trackWithDisc.cues.map((cue) => ({
    ...cue,
    startSec: cue.startSec + shiftSec,
    endSec: cue.endSec + shiftSec,
    wordTimings: cue.wordTimings.map((wordTiming) => ({
      ...wordTiming,
      startSec: wordTiming.startSec + shiftSec,
      endSec: wordTiming.endSec + shiftSec,
    })),
  })), {
    width: trackWithDisc.profile.width,
    height: trackWithDisc.profile.height,
    captionStyle: trackWithDisc.profile,
    safeInsets: trackWithDisc.safeInsets,
    avoidRegions: trackWithDisc.avoidRegions,
    continuityGapMs: trackWithDisc.continuityGapMs,
  });

  assert.equal(shifted.continuityGapMs, 1200);
  assert.deepEqual(shifted.cues.map((cue) => cue.cueId), ['cue-d1', 'cue-d2', 'cue-d3']);
  assert.deepEqual(shifted.cues.map((cue) => cue.cueIndex), [41, 42, 43]);
  assert.equal(shifted.cues[1].sceneBoundary, true);
  assert.equal(shifted.cues[1].resetContinuity, false);
  assert.equal(shifted.cues[1].discontinuity, false);
  assert.equal(shifted.cues[2].resetContinuity, true);
  assert.equal(shifted.cues[2].discontinuity, true);
  assert.equal(assertCaptionPlacementTrack(shifted), shifted);
});

test('relocation detected when slot contract changes font size or wrap width but retains coordinate alignment', () => {
  let layout = {
    preset: 'square',
    width: 1080,
    height: 1080,
    maxLines: 1,
    fontSize: 50,
    preferredZones: ['top'],
    safeInsets: { top: 54, bottom: 54, left: 54, right: 54 },
    avoidRegions: [
      { id: 'block-center', x: 400, y: 0, width: 680, height: 1080, startSec: 0, endSec: 3, },
      { id: 'block-bottom-left', x: 0, y: 150, width: 400, height: 930, startSec: 0, endSec: 3, },
    ],
  };
  let cues = [
    { cueId: 'cue-e1', startSec: 0.0, endSec: 1.5, text: 'Short', },
    { cueId: 'cue-e2', startSec: 1.5, endSec: 3.0, text: 'Somewhat much longer text that needs to wrap to more than four lines', },
  ];
  let track = buildCaptionPlacementTrack(cues, layout);
  assert.notEqual(track.cues[0].placement.fontSize, track.cues[1].placement.fontSize);
  assert.equal(track.cues[0].placement.x, track.cues[1].placement.x);
  assert.equal(track.cues[0].placement.y, track.cues[1].placement.y);
  assert.equal(track.cues[0].placement.alignment, track.cues[1].placement.alignment);
  assert.equal(track.cues[0].placement.zone, track.cues[1].placement.zone);
  assert.equal(track.relocationCount, 0);
  assert.equal(track.typographyAdaptationCount, 1);
  assert.equal(track.forcedCollisionRelocationCount, 0);
  assert.equal(track.unforcedSwitchCount, 0);
});

test('ping-pong count resets across gap and explicit discontinuities', () => {
  let layout = { preset: 'youtube', width: 1920, height: 1080, };
  let bottomMargin = 86;
  let obstacleY = layout.height - bottomMargin - 50;

  let cuesGap = [
    { cueId: 'cue-gap1', startSec: 0.0, endSec: 1.0, speaker: 'guide', text: 'Slot A', },
    { cueId: 'cue-gap2', startSec: 1.0, endSec: 2.0, speaker: 'guide', text: 'Slot B', },
    { cueId: 'cue-gap3', startSec: 3.0, endSec: 4.0, speaker: 'guide', text: 'Slot A', },
  ];
  let avoidRegionsGap = [
    { id: 'obstacle-cue2', x: 0, y: obstacleY, width: layout.width, height: 200, startSec: 1.0, endSec: 2.0, },
  ];
  let trackGap = buildCaptionPlacementTrack(cuesGap, {
    ...layout,
    avoidRegions: avoidRegionsGap,
    continuityGapMs: 750,
  });
  assert.equal(trackGap.pingPongCount, 0);

  let cuesExplicit = [
    { cueId: 'cue-exp1', startSec: 0.0, endSec: 1.0, speaker: 'guide', text: 'Slot A', },
    { cueId: 'cue-exp2', startSec: 1.0, endSec: 2.0, speaker: 'guide', text: 'Slot B', },
    { cueId: 'cue-exp3', startSec: 2.0, endSec: 3.0, speaker: 'guide', text: 'Slot A', resetContinuity: true, },
  ];
  let trackExplicit = buildCaptionPlacementTrack(cuesExplicit, {
    ...layout,
    avoidRegions: avoidRegionsGap,
  });
  assert.equal(trackExplicit.pingPongCount, 0);

  let tampered = structuredClone(trackExplicit);
  tampered.pingPongCount += 1;
  assert.throws(() => {
    assertCaptionPlacementTrack(tampered);
  }, /caption placement track does not match its resolved presentation evidence/);
});
