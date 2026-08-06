import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  playDialogueTimeline,
  buildAlternatingTimeline,
} from '../chat/dialogue-timeline.js';
import { createDialogueStage } from '../chat/dialogue-stage.js';

/**
 * Fake stage: records persona registrations and `speak(personaId, text)` calls,
 * and resolves each speak Promise after a tiny tick so the scheduler advances
 * turn-by-turn in Node with no browser.
 */
function makeFakeStage() {
  let stage = {
    personas: [],
    spoken: [],
    cancelCount: 0,
    persona(id, profile) {
      stage.personas.push({ id, profile });
      return stage;
    },
    speak(personaId, text) {
      stage.spoken.push({ personaId, text });
      return new Promise((resolve) => setTimeout(resolve, 1));
    },
    cancel() {
      stage.cancelCount += 1;
      return stage;
    },
  };
  return stage;
}

/**
 * Fake DOM driving the *real* createDialogueStage: each created iframe exposes a
 * contentWindow with a speechSynthesis queue and a SpeechSynthesisUtterance ctor.
 * Captured utterances land in `created`, so a test can read `utterance.text` —
 * the exact string that would be spoken — and assert it was sanitized.
 */
function makeSpeechDocument() {
  let created = [];
  class FakeUtterance {
    constructor(text) {
      this.text = text;
      created.push(this);
    }
  }
  let frameWindow = {
    SpeechSynthesisUtterance: FakeUtterance,
    speechSynthesis: {
      getVoices: () => [],
      speak(utterance) {
        // Resolve the speak Promise on a microtask, mirroring engine end events.
        queueMicrotask(() => utterance.onend?.());
      },
      cancel() {},
      resume() {},
      addEventListener() {},
      removeEventListener() {},
    },
  };
  let body = {
    appendChild() {},
    removeChild() {},
  };
  let document = {
    body,
    createElement() {
      return {
        setAttribute() {},
        style: {},
        contentWindow: frameWindow,
        parentNode: body,
      };
    },
  };
  return { document, created };
}

test('stage.speak() sanitizes markdown and symbols before the utterance', async () => {
  let { document, created } = makeSpeechDocument();
  let stage = createDialogueStage({ document, locale: 'ru' });
  stage.persona('host', {});

  await stage.speak('host', 'Это интерфейс «Аварийные наряды» — **смотри** `code`');

  assert.equal(created.length, 1);
  let spoken = created[0].text;
  for (let token of ['«', '»', '**', '`', '—']) {
    assert.equal(spoken.includes(token), false, `expected no ${token} in spoken text: ${spoken}`);
  }
  // Real prose survives the filter.
  assert.match(spoken, /Это интерфейс/);
});

test('stage.speak({ sanitize: false }) speaks the raw text verbatim', async () => {
  let { document, created } = makeSpeechDocument();
  let stage = createDialogueStage({ document, locale: 'ru' });
  stage.persona('host', {});

  let raw = 'Текст «как есть» — **жирный** `code`';
  await stage.speak('host', raw, { sanitize: false });

  assert.equal(created.length, 1);
  assert.equal(created[0].text, raw);
});

test('playDialogueTimeline feeds sanitized text through the real stage', async () => {
  let { document, created } = makeSpeechDocument();
  let stage = createDialogueStage({ document, locale: 'ru' });

  let timeline = {
    personas: { host: {} },
    turns: [{ persona: 'host', text: 'Смотри «панель» — **тут** `cmd`' }],
  };

  await playDialogueTimeline(stage, timeline, { defaultGapMs: 0 });

  assert.equal(created.length, 1);
  let spoken = created[0].text;
  for (let token of ['«', '»', '**', '`', '—']) {
    assert.equal(spoken.includes(token), false, `expected no ${token} in spoken text: ${spoken}`);
  }
});

test('buildAlternatingTimeline assigns persona ids round-robin', () => {
  let timeline = buildAlternatingTimeline(
    ['ada', 'linus'],
    [{ text: 'one' }, { text: 'two' }, { text: 'three' }],
  );
  assert.deepEqual(
    timeline.turns.map((t) => t.persona),
    ['ada', 'linus', 'ada'],
  );
  assert.deepEqual(
    timeline.turns.map((t) => t.text),
    ['one', 'two', 'three'],
  );
  assert.deepEqual(timeline.personas, { ada: {}, linus: {} });
});

test('buildAlternatingTimeline honors an explicit line.persona override', () => {
  let timeline = buildAlternatingTimeline(
    ['ada', 'linus'],
    [{ text: 'one' }, { text: 'two', persona: 'guest' }, { text: 'three' }],
  );
  assert.deepEqual(
    timeline.turns.map((t) => t.persona),
    ['ada', 'guest', 'ada'],
  );
  // The overriding persona is registered too, alongside the cycle members.
  assert.ok('guest' in timeline.personas);
  assert.ok('ada' in timeline.personas);
  assert.ok('linus' in timeline.personas);
});

test('buildAlternatingTimeline applies overlapMs to turns after the first only', () => {
  let timeline = buildAlternatingTimeline(
    ['a', 'b'],
    [{ text: 'one' }, { text: 'two' }, { text: 'three' }],
    80,
  );
  assert.equal(timeline.turns[0].overlapMs, undefined);
  assert.equal(timeline.turns[1].overlapMs, 80);
  assert.equal(timeline.turns[2].overlapMs, 80);
});

test('buildAlternatingTimeline carries cue and stays pure (no mutation of inputs)', () => {
  let ids = ['a', 'b'];
  let lines = [{ text: 'one', cue: 'panel-1' }, { text: 'two' }];
  let timeline = buildAlternatingTimeline(ids, lines);
  assert.equal(timeline.turns[0].cue, 'panel-1');
  assert.equal('cue' in timeline.turns[1], false);
  // Inputs are untouched.
  assert.deepEqual(ids, ['a', 'b']);
  assert.deepEqual(lines, [{ text: 'one', cue: 'panel-1' }, { text: 'two' }]);
});

test('buildAlternatingTimeline with no persona ids leaves persona undefined', () => {
  let timeline = buildAlternatingTimeline([], [{ text: 'solo' }]);
  assert.equal(timeline.turns[0].persona, undefined);
  assert.equal(timeline.turns[0].text, 'solo');
});

test('playDialogueTimeline registers personas and speaks turns in order', async () => {
  let stage = makeFakeStage();
  let timeline = {
    personas: { ada: { rate: 1.1 }, linus: { pitch: 0.8 } },
    turns: [
      { persona: 'ada', text: 'hello' },
      { persona: 'linus', text: 'world' },
      { persona: 'ada', text: 'again' },
    ],
  };

  await playDialogueTimeline(stage, timeline, { defaultGapMs: 0 });

  assert.deepEqual(
    stage.personas.map((p) => p.id),
    ['ada', 'linus'],
  );
  assert.deepEqual(stage.personas[0].profile, { rate: 1.1 });
  assert.deepEqual(stage.spoken, [
    { personaId: 'ada', text: 'hello' },
    { personaId: 'linus', text: 'world' },
    { personaId: 'ada', text: 'again' },
  ]);
});

test('playDialogueTimeline fires onCue(cue, turn, index) at each turn start', async () => {
  let stage = makeFakeStage();
  let cues = [];
  let timeline = {
    personas: { a: {}, b: {} },
    turns: [
      { persona: 'a', text: 'one', cue: 'panel-1' },
      { persona: 'b', text: 'two', cue: 'panel-2' },
    ],
  };

  await playDialogueTimeline(stage, timeline, {
    defaultGapMs: 0,
    onCue: (cue, turn, index) => cues.push({ cue, text: turn.text, index }),
  });

  assert.deepEqual(cues, [
    { cue: 'panel-1', text: 'one', index: 0 },
    { cue: 'panel-2', text: 'two', index: 1 },
  ]);
});

test('playDialogueTimeline resolves after the last turn ends', async () => {
  let stage = makeFakeStage();
  let lastEnded = false;
  let originalSpeak = stage.speak;
  stage.speak = (personaId, text) => {
    let promise = originalSpeak.call(stage, personaId, text);
    return promise.then(() => {
      if (text === 'final') lastEnded = true;
    });
  };

  let timeline = {
    personas: { a: {} },
    turns: [
      { persona: 'a', text: 'first' },
      { persona: 'a', text: 'final' },
    ],
  };

  await playDialogueTimeline(stage, timeline, { defaultGapMs: 0 });
  assert.equal(lastEnded, true);
  assert.equal(stage.spoken.length, 2);
});

test('playDialogueTimeline overlap starts the next turn as cross-talk', async () => {
  let stage = makeFakeStage();
  let timeline = {
    personas: { a: {}, b: {} },
    turns: [
      { persona: 'a', text: 'long line' },
      { persona: 'b', text: 'overlapping', overlapMs: 1 },
    ],
  };

  await playDialogueTimeline(stage, timeline, { defaultGapMs: 0 });
  // Both turns still play, in order.
  assert.deepEqual(
    stage.spoken.map((s) => s.text),
    ['long line', 'overlapping'],
  );
});

test('playDialogueTimeline aborts before start when the signal is already aborted', async () => {
  let stage = makeFakeStage();
  let controller = new AbortController();
  controller.abort();

  await playDialogueTimeline(
    stage,
    {
      personas: { a: {} },
      turns: [{ persona: 'a', text: 'never' }],
    },
    { signal: controller.signal, defaultGapMs: 0 },
  );

  assert.equal(stage.spoken.length, 0);
  assert.ok(stage.cancelCount >= 1);
});

test('AbortSignal stops further turns and cancels the stage', async () => {
  let stage = makeFakeStage();
  let controller = new AbortController();
  let cueCount = 0;

  let timeline = {
    personas: { a: {}, b: {}, c: {} },
    turns: [
      { persona: 'a', text: 'one' },
      { persona: 'b', text: 'two' },
      { persona: 'c', text: 'three' },
    ],
  };

  let done = playDialogueTimeline(stage, timeline, {
    signal: controller.signal,
    defaultGapMs: 0,
    onCue: () => {
      cueCount += 1;
      if (cueCount === 1) controller.abort();
    },
  });

  await done;

  // Only the first turn started before abort interrupted the run.
  assert.equal(stage.spoken.length, 1);
  assert.equal(stage.spoken[0].text, 'one');
  assert.ok(stage.cancelCount >= 1);
});

test('createDialogueStage isSupported() is false in Node', () => {
  let stage = createDialogueStage();
  assert.equal(stage.isSupported(), false);
});

test('createDialogueStage speak() resolves without throwing when no document', async () => {
  let stage = createDialogueStage();
  stage.persona('a', { rate: 1 });
  // Must resolve (not reject, not throw) in a non-browser env.
  await assert.doesNotReject(stage.speak('a', 'hello there'));
  // Other browser-touching methods are safe no-ops too.
  assert.equal(stage.isSpeaking('a'), false);
  stage.cancel('a');
  stage.cancel();
  stage.unlock();
  let detach = stage.installGestureUnlock(null);
  assert.equal(typeof detach, 'function');
  detach();
  stage.dispose();
});
