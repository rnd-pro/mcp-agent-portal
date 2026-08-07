import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  alignAuthoredCaptionWords,
  buildCaptionCues,
  captionCueHasWordTimings,
  captionAttributionForRange,
  captionCuesFromClipTranscripts,
  captionCuesFromTranscript,
  captionTranscriptDurationSec,
  captionWordTimeSeconds,
  overlapMs,
  renderAss,
  renderVtt,
} from '../render-captions.js';

function word(text, startSec, endSec) {
  return { word: text, startSec, endSec };
}

test('caption transcript cues group by speaker, max words, gaps, and sentence breaks', () => {
  let cues = [
    { index: 0, startMs: 0, endMs: 3500, speaker: 'guide' },
    { index: 1, startMs: 4500, endMs: 6200, speaker: 'ops' },
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
    'one two three four five six seven',
    'eight',
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
    [{ index: 2, startMs: 0, endMs: 2500, speaker: 'guide' }],
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
    clipTranscripts: [{
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
        authoredText: 'Exact text.',
        speaker: 'guide',
        cueIndex: 0,
        words: [word('wrong', 0, 0.2), word('words.', 0.2, 0.5)],
      },
      {
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
    clipTranscripts: [{ authoredText: 'Authored text without timing.', words: [] }],
  });
  assert.equal(missingTiming.source, 'whisper+range-map');
  assert.equal(missingTiming.alignment.clips.length, 1);
  assert.equal(missingTiming.alignment.warningCount, 1);
  assert.equal(missingTiming.alignment.clips[0].warningReason, 'missing-whisper-word-timings');
});

test('caption attribution chooses the largest cue overlap and reports unmapped ranges', () => {
  let cues = [
    { index: 0, startMs: 0, endMs: 1000, speaker: 'guide' },
    { index: 1, startMs: 800, endMs: 2200, speaker: 'ops' },
  ];

  assert.equal(overlapMs(0, 100, 50, 150), 50);
  assert.deepEqual(captionAttributionForRange(0.9, 1.4, cues), {
    speaker: 'ops',
    cueIndex: 1,
    overlapMs: 500,
    source: 'range-map',
  });
  assert.deepEqual(captionAttributionForRange(3, 3.2, cues), {
    speaker: '',
    cueIndex: null,
    overlapMs: 0,
    source: 'unmapped',
  });
});

test('renderVtt formats timestamps, speaker prefixes, escaping, and trailing newline', () => {
  let output = renderVtt([
    { startSec: -1, endSec: 1.234, speaker: 'guide', words: ['A&B', '<ok>'] },
    { startSec: 3661.2, endSec: 3661.234, speaker: 'ops', words: ['done'] },
  ]);

  assert.equal(output, [
    'WEBVTT',
    '',
    '1',
    '00:00:00.000 --> 00:00:01.234',
    'GUIDE: A&amp;B &lt;ok&gt;',
    '',
    '2',
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
    clipTranscripts: [{ speaker: 'guide', words: [word('hello', 0, 0.2)] }],
  });
  assert.equal(built.source, 'whisper+clip-range-map');
  assert.match(built.vtt, /^WEBVTT\n\n1\n00:00:00\.000 --> 00:00:00\.200\nhello\n\n$/);
  assert.match(built.ass, /Dialogue: 0,0:00:00\.00,0:00:00\.20,TikTok/);
  assert.match(built.ass, /\\k20\}hello/);
});

test('caption build uses timed clip transcripts before transcript text fallbacks', () => {
  let built = buildCaptionCues({
    transcript: { text: 'fallback transcript without timed words', durationSec: 3 },
    clipTranscripts: [
      { speaker: 'guide', cueIndex: 0, words: [word('timed', 1, 1.25), word('clip', 1.3, 1.55)] },
    ],
  });

  assert.equal(built.source, 'whisper+clip-range-map');
  assert.equal(built.cues.length, 1);
  assert.equal(built.cues[0].words.join(' '), 'timed clip');
  assert.equal(captionCueHasWordTimings(built.cues[0]), true);
  assert.match(built.ass, /\\k25\}timed/);
});

test('renderAss emits karaoke timings and escapes unsafe text', () => {
  let ass = renderAss([
    {
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
      startSec: 2.2,
      endSec: 2.8,
      speaker: 'ops',
      words: ['whole line'],
      wordTimings: [],
    },
  ], { captionStyle: { preset: 'tiktok', fontSize: 30, highlightColor: '#ffff00' } });

  assert.match(ass, /Style: TikTok,Arial,30/);
  assert.match(ass, /Dialogue: 0,0:00:01\.00,0:00:02\.00,TikTok,guide/);
  assert.match(ass, /\\k25\}A bad/);
  assert.match(ass, /\\k55\}word/);
  assert.match(ass, /Dialogue: 0,0:00:02\.20,0:00:02\.80,TikTok,ops/);
  assert.doesNotMatch(ass, /A\{bad\}/);
  assert.equal(renderAss([{ startSec: 0, endSec: 1, words: ['plain'], wordTimings: [] }]), '');
});
