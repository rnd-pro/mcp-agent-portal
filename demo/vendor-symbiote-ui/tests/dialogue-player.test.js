import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDialoguePlayer } from '../chat/dialogue-player.js';
import { createDialogueStage } from '../chat/dialogue-stage.js';

/**
 * Fake DOM driving the *real* createDialogueStage. Each iframe exposes a
 * contentWindow whose speechSynthesis resolves a speak after a tick (so the
 * player advances turn by turn) and records pause()/resume() so a test can
 * assert the stage forwarded those to the engine. Captured utterances land in
 * `created` for text assertions.
 */
function makeSpeechDocument() {
  let created = [];
  let calls = { pause: 0, resume: 0, cancel: 0 };
  class FakeUtterance {
    constructor(text) {
      this.text = text;
      created.push(this);
    }
  }
  // Mirror real speechSynthesis: a paused utterance holds its `onend` until
  // resume; cancel() drops the in-flight utterance without ending it.
  let active = null;
  let paused = false;
  let endActive = () => {
    let utterance = active;
    active = null;
    utterance?.onend?.();
  };
  let frameWindow = {
    SpeechSynthesisUtterance: FakeUtterance,
    speechSynthesis: {
      getVoices: () => [],
      speak(utterance) {
        active = utterance;
        setTimeout(() => utterance.onstart?.(), 0);
        // End on a later macrotask so the player has a real "in flight" window
        // the test can pause/cancel within; respect a pause that lands first.
        setTimeout(() => {
          if (active !== utterance) return;
          if (paused) return;
          endActive();
        }, 1);
      },
      cancel() {
        calls.cancel += 1;
        active = null;
      },
      pause() {
        calls.pause += 1;
        paused = true;
      },
      resume() {
        calls.resume += 1;
        if (!paused) return;
        paused = false;
        // Flush an utterance that finished speaking while paused.
        if (active) queueMicrotask(endActive);
      },
      addEventListener() {},
      removeEventListener() {},
    },
  };
  let body = { appendChild() {}, removeChild() {} };
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
  return { document, created, calls };
}

function makeTimeline() {
  return {
    personas: { ada: {}, linus: {} },
    turns: [
      { persona: 'ada', text: 'one', cue: 'panel-1' },
      { persona: 'linus', text: 'two', cue: 'panel-2' },
      { persona: 'ada', text: 'three', cue: 'panel-3' },
    ],
  };
}

test('player advances through every turn and fires onCue per turn', async () => {
  let { document, created } = makeSpeechDocument();
  let stage = createDialogueStage({ document, locale: 'en' });
  let cues = [];
  let indices = [];
  let player = createDialoguePlayer(stage, makeTimeline(), {
    defaultGapMs: 0,
    onCue: (cue, turn, index) => cues.push({ cue, text: turn.text, index }),
    onIndexChange: (i) => indices.push(i),
  });

  assert.equal(player.total, 3);
  assert.equal(player.index, 0);

  player.play();
  await player.done;

  assert.deepEqual(cues, [
    { cue: 'panel-1', text: 'one', index: 0 },
    { cue: 'panel-2', text: 'two', index: 1 },
    { cue: 'panel-3', text: 'three', index: 2 },
  ]);
  // Cursor walked 0 -> 1 -> 2 (index 0 is the starting position, not re-emitted).
  assert.deepEqual(indices, [1, 2]);
  assert.deepEqual(created.map((u) => u.text), ['one', 'two', 'three']);
  assert.equal(player.index, 2);
});

test('done resolves and onStateChange reports finished after the last turn', async () => {
  let { document } = makeSpeechDocument();
  let stage = createDialogueStage({ document, locale: 'en' });
  let states = [];
  let player = createDialoguePlayer(stage, makeTimeline(), {
    defaultGapMs: 0,
    onStateChange: (s) => states.push(s),
  });

  player.play();
  await player.done;

  assert.equal(states[0], 'playing');
  assert.equal(states[states.length - 1], 'finished');
});

test('pause()/resume() toggle isPaused and forward to the stage engine', async () => {
  let { document, calls } = makeSpeechDocument();
  let stage = createDialogueStage({ document, locale: 'en' });
  let player = createDialoguePlayer(stage, makeTimeline(), { defaultGapMs: 0 });

  player.play();
  // Let the first utterance start speaking.
  await new Promise((resolve) => setTimeout(resolve, 0));

  player.pause();
  assert.equal(player.isPaused, true);
  assert.equal(player.isPlaying, false);
  assert.ok(calls.pause >= 1, 'stage.pause() forwarded to the engine');

  player.resume();
  assert.equal(player.isPaused, false);
  assert.equal(player.isPlaying, true);
  assert.ok(calls.resume >= 1, 'stage.resume() forwarded to the engine');

  await player.done;
});

test('toggle() flips between playing and paused', async () => {
  let { document } = makeSpeechDocument();
  let stage = createDialogueStage({ document, locale: 'en' });
  let player = createDialoguePlayer(stage, makeTimeline(), { defaultGapMs: 0 });

  player.toggle();
  assert.equal(player.isPlaying, true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  player.toggle();
  assert.equal(player.isPaused, true);
  player.stop();
  await player.done;
});

test('seek(i) jumps to a turn and speaks it', async () => {
  let { document, created } = makeSpeechDocument();
  let stage = createDialogueStage({ document, locale: 'en' });
  let cues = [];
  let player = createDialoguePlayer(stage, makeTimeline(), {
    defaultGapMs: 0,
    onCue: (cue, turn, index) => cues.push({ text: turn.text, index }),
  });

  player.seek(2);
  assert.equal(player.index, 2);
  await player.done;

  // Seeking to the last turn speaks only it, then finishes.
  assert.equal(created[0].text, 'three');
  assert.deepEqual(cues[0], { text: 'three', index: 2 });
  assert.equal(player.index, 2);
});

test('next() and prev() move the cursor and speak the target turn', async () => {
  let { document, created } = makeSpeechDocument();
  let stage = createDialogueStage({ document, locale: 'en' });
  let player = createDialoguePlayer(stage, makeTimeline(), { defaultGapMs: 0 });

  player.seek(0);
  // Let the first turn begin.
  await new Promise((resolve) => setTimeout(resolve, 0));

  player.next();
  assert.equal(player.index, 1);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(created[created.length - 1].text, 'two');

  player.prev();
  assert.equal(player.index, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(created[created.length - 1].text, 'one');

  player.stop();
  await player.done;
});

test('next() clamps at the end and prev() clamps at the start', async () => {
  let { document } = makeSpeechDocument();
  let stage = createDialogueStage({ document, locale: 'en' });
  let player = createDialoguePlayer(stage, makeTimeline(), { defaultGapMs: 0 });

  player.seek(0);
  player.prev();
  assert.equal(player.index, 0);

  player.seek(2);
  player.next();
  assert.equal(player.index, 2);

  player.stop();
  await player.done;
});

test('stop() resolves done and resets the cursor to 0', async () => {
  let { document, calls } = makeSpeechDocument();
  let stage = createDialogueStage({ document, locale: 'en' });
  let states = [];
  let player = createDialoguePlayer(stage, makeTimeline(), {
    defaultGapMs: 0,
    onStateChange: (s) => states.push(s),
  });

  player.seek(1);
  assert.equal(player.index, 1);
  await new Promise((resolve) => setTimeout(resolve, 0));

  player.stop();
  assert.equal(player.index, 0);
  assert.ok(calls.cancel >= 1, 'stop() cancels the stage');
  assert.equal(states[states.length - 1], 'stopped');

  // done resolves on stop().
  await player.done;
});

test('player is a clean no-op against a non-browser stage', async () => {
  let stage = createDialogueStage();
  let cues = [];
  let player = createDialoguePlayer(stage, makeTimeline(), {
    defaultGapMs: 0,
    onCue: (cue) => cues.push(cue),
  });

  player.play();
  await player.done;

  // Every turn still emits exactly one cue even with no real speech engine.
  assert.deepEqual(cues, ['panel-1', 'panel-2', 'panel-3']);
  assert.equal(player.index, 2);
});

test('minTurnMs keeps no-op stages from flashing through the timeline', async () => {
  let stage = createDialogueStage();
  let cueTimes = [];
  let player = createDialoguePlayer(stage, makeTimeline(), {
    defaultGapMs: 0,
    minTurnMs: 20,
    onCue: () => cueTimes.push(Date.now()),
  });

  let started = Date.now();
  player.play();
  await player.done;
  let elapsed = Date.now() - started;

  assert.equal(cueTimes.length, 3);
  assert.ok(elapsed >= 35, `expected visual dwell, got ${elapsed}ms`);
  assert.ok(cueTimes[1] - cueTimes[0] >= 12, 'second cue waited after first');
  assert.ok(cueTimes[2] - cueTimes[1] >= 12, 'third cue waited after second');
});

function makeLongTimeline() {
  return {
    personas: { ada: {}, linus: {} },
    turns: [
      { persona: 'ada', text: 'one', cue: 'panel-1' },
      { persona: 'linus', text: 'two', cue: 'panel-2' },
      { persona: 'ada', text: 'three', cue: 'panel-3' },
      { persona: 'linus', text: 'four', cue: 'panel-4' },
    ],
  };
}

test('seek() while paused previews only that turn and stays paused', async () => {
  let { document, created } = makeSpeechDocument();
  let stage = createDialogueStage({ document, locale: 'en' });
  let cues = [];
  let indices = [];
  let player = createDialoguePlayer(stage, makeLongTimeline(), {
    defaultGapMs: 0,
    onCue: (cue, turn, index) => cues.push({ cue, text: turn.text, index }),
    onIndexChange: (i) => indices.push(i),
  });

  player.play();
  // Let the first utterance start speaking.
  await new Promise((resolve) => setTimeout(resolve, 0));

  player.pause();
  assert.equal(player.isPaused, true);

  // Preview turn 2 while paused. onIndexChange(2) fires synchronously.
  player.seek(2);
  assert.equal(player.index, 2);
  assert.equal(player.isPaused, true, 'preview keeps the controller paused');
  assert.equal(player.isPlaying, false);
  assert.ok(indices.includes(2), 'onIndexChange(2) fired for the preview');

  // Wait well past the preview's speak start + end + any gap. The cue fires on
  // speak start; the turn must NOT advance to 3.
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(
    cues.some((c) => c.index === 2 && c.text === 'three'),
    'onCue fired for previewed turn 2',
  );
  assert.equal(player.index, 2, 'preview did not auto-advance past turn 2');
  assert.equal(player.isPaused, true, 'still paused after the gap window');
  assert.ok(
    !indices.includes(3),
    'cursor never moved to turn 3 during the paused preview',
  );

  // Resuming continues the tour from the previewed turn (advances to 3+).
  player.play();
  assert.equal(player.isPlaying, true);
  await player.done;
  assert.equal(player.index, 3, 'play() continued from the preview to the end');
  assert.ok(indices.includes(3), 'tour advanced to turn 3 after resume');
  // The full set of texts spoken includes the post-preview turn 'four'.
  assert.ok(
    created.some((u) => u.text === 'four'),
    'turn after the preview was spoken once playback resumed',
  );
});

test('preview(i) plays only the selected turn and stays paused', async () => {
  let { document } = makeSpeechDocument();
  let stage = createDialogueStage({ document, locale: 'en' });
  let cues = [];
  let indices = [];
  let states = [];
  let player = createDialoguePlayer(stage, makeLongTimeline(), {
    defaultGapMs: 0,
    onCue: (cue, turn, index) => cues.push({ cue, text: turn.text, index }),
    onIndexChange: (i) => indices.push(i),
    onStateChange: (s) => states.push(s),
  });

  player.preview(2);
  assert.equal(player.index, 2);
  assert.equal(player.isPaused, true);
  assert.equal(player.isPlaying, false);

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(
    cues.some((c) => c.index === 2 && c.text === 'three'),
    'onCue fired for previewed turn 2',
  );
  assert.equal(player.index, 2, 'preview did not auto-advance');
  assert.ok(!indices.includes(3), 'preview did not move to the next turn');
  assert.deepEqual(states, ['paused']);

  player.stop();
  await player.done;
});

test('a paused preview does not resolve the done promise', async () => {
  let { document } = makeSpeechDocument();
  let stage = createDialogueStage({ document, locale: 'en' });
  let player = createDialoguePlayer(stage, makeLongTimeline(), { defaultGapMs: 0 });

  player.play();
  await new Promise((resolve) => setTimeout(resolve, 0));
  player.pause();
  player.seek(2);

  // Race done against a timeout; a paused preview must keep done pending.
  let settled = false;
  player.done.then(() => {
    settled = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(settled, false, 'done stayed pending through the preview');

  // Clean up so the test process does not hang on the unresolved promise.
  player.stop();
  await player.done;
});

test('a second seek while previewing previews the new turn and stays paused', async () => {
  let { document, created } = makeSpeechDocument();
  let stage = createDialogueStage({ document, locale: 'en' });
  let cues = [];
  let player = createDialoguePlayer(stage, makeLongTimeline(), {
    defaultGapMs: 0,
    onCue: (cue, turn, index) => cues.push({ text: turn.text, index }),
  });

  player.play();
  await new Promise((resolve) => setTimeout(resolve, 0));
  player.pause();

  player.seek(1);
  player.seek(3);
  assert.equal(player.index, 3, 'second seek moved the preview cursor');
  assert.equal(player.isPaused, true, 'second preview is still paused');

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(player.index, 3, 'second preview did not advance');
  assert.ok(
    cues.some((c) => c.index === 3 && c.text === 'four'),
    'onCue fired for the re-previewed turn',
  );

  player.stop();
  await player.done;
});

test('empty timeline finishes immediately on play()', async () => {
  let stage = createDialogueStage();
  let player = createDialoguePlayer(stage, { personas: {}, turns: [] }, { defaultGapMs: 0 });
  assert.equal(player.total, 0);
  player.play();
  await player.done;
  assert.equal(player.index, 0);
});
