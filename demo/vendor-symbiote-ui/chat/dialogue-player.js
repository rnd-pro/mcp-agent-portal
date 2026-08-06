/**
 * Stateful dialogue player.
 *
 * Wraps a dialogue stage (see `dialogue-stage.js`) with transport controls —
 * play/pause/resume, next/prev/seek/preview, and stop — over the same
 * `{ personas, turns }` timeline that `playDialogueTimeline` consumes. Where the
 * scheduler is a fire-and-forget run, this controller holds a cursor (`index`)
 * the host can steer, so a UI can drive playback like a media player.
 *
 * `onCue` fires at each turn's speak START (matching `playDialogueTimeline`).
 * `onIndexChange` fires whenever the cursor moves; `onStateChange` fires on
 * play, pause, resume, stop, and natural finish. Turns advance sequentially with
 * a fixed `defaultGapMs` between them — overlap/cross-talk stays the scheduler's
 * job. Node-safe at import time and against a non-browser stage, where `speak`
 * resolves immediately so playback still walks the timeline turn by turn.
 */

const DEFAULT_GAP_MS = 120;
const DEFAULT_MIN_TURN_MS = 0;

function nonNegative(value, fallback) {
  let n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function clampIndex(index, total) {
  if (!Number.isFinite(index)) return 0;
  let i = Math.trunc(index);
  if (i < 0) return 0;
  if (i > total - 1) return Math.max(0, total - 1);
  return i;
}

/**
 * Create a transport controller over `stage` for `timeline`.
 *
 * @param {object} stage - a dialogue stage (`persona`, `speak`, `cancel`, `pause`, `resume`).
 * @param {object} timeline
 * @param {object} [timeline.personas] - `{ [id]: profile }`, registered up front.
 * @param {Array} [timeline.turns] - `{ persona, text, cue? }`.
 * @param {object} [options]
 * @param {(cue:any, turn:object, index:number) => void} [options.onCue] - fired at each turn's speak start.
 * @param {(index:number) => void} [options.onIndexChange] - fired whenever the cursor moves.
 * @param {(state:string) => void} [options.onStateChange] - 'playing' | 'paused' | 'stopped' | 'finished'.
 * @param {number} [options.defaultGapMs=120] - gap between sequential turns.
 * @param {number} [options.minTurnMs=0] - minimum visible time for each cue
 *   before advancing. Useful when a speech engine resolves immediately.
 * @returns {object} controller (see the shared contract).
 */
export function createDialoguePlayer(stage, timeline, options = {}) {
  let { onCue, onIndexChange, onStateChange, defaultGapMs, minTurnMs } = options;
  let personas = timeline?.personas || {};
  let turns = Array.isArray(timeline?.turns) ? timeline.turns : [];
  let baseGap = nonNegative(defaultGapMs, DEFAULT_GAP_MS);
  let minTurn = nonNegative(minTurnMs, DEFAULT_MIN_TURN_MS);
  let total = turns.length;

  if (stage && typeof stage.persona === 'function') {
    for (let [id, profile] of Object.entries(personas)) {
      stage.persona(id, profile || {});
    }
  }

  let index = 0;
  // Idle: not started or finished/stopped. Playing: a turn is speaking or the
  // gap is pending. Paused: held mid-utterance or mid-gap.
  let state = 'idle';
  let gapTimer = null;
  // Set to the active run token when an advance is requested while paused (the
  // current turn ended during a pause); `resume()` replays it.
  let pendingAdvance = null;
  // True when the current paused state is a seek-preview: a single turn was
  // spoken on demand while staying paused, with no frozen utterance to un-freeze.
  // resume()/play() uses this to restart from the current index via the normal
  // play path instead of letting `stage.resume()` continue a frozen utterance.
  let previewPause = false;
  // Generation token: bumped on every cancel/seek/stop so a stale speak end or
  // gap callback from a superseded turn cannot advance the cursor.
  let run = 0;

  let resolveDone;
  let done = new Promise((resolve) => {
    resolveDone = resolve;
  });

  function emitState(next) {
    state = next;
    let cb = controller.onStateChange;
    if (typeof cb === 'function') {
      try {
        cb(next);
      } catch (_) {}
    }
  }

  function emitIndex() {
    let cb = controller.onIndexChange;
    if (typeof cb === 'function') {
      try {
        cb(index);
      } catch (_) {}
    }
  }

  function clearGap() {
    if (gapTimer !== null) {
      clearTimeout(gapTimer);
      gapTimer = null;
    }
  }

  /** Stop any in-flight speech and pending gap, invalidating their callbacks. */
  function halt() {
    run += 1;
    pendingAdvance = null;
    clearGap();
    if (stage && typeof stage.cancel === 'function') {
      try {
        stage.cancel();
      } catch (_) {}
    }
  }

  function finish() {
    halt();
    emitState('finished');
    resolveDone();
  }

  // Speak turn `index`, firing its cue at speak start. When it ends (and this
  // run is still current and playing), schedule the next turn after the gap, or
  // finish at the end of the timeline.
  function speakCurrent() {
    if (total === 0) {
      finish();
      return;
    }

    let token = run;
    let turn = turns[index];
    let cued = false;
    let cueStartedAt = 0;
    let fireCue = () => {
      if (cued) return;
      cued = true;
      cueStartedAt = Date.now();
      let cb = controller.onCue;
      if (typeof cb === 'function') {
        try {
          cb(turn?.cue, turn, index);
        } catch (_) {}
      }
    };

    let speakPromise = Promise.resolve(
      stage && typeof stage.speak === 'function'
        ? stage.speak(turn?.persona, turn?.text, { onStart: fireCue })
        : undefined,
    ).catch(() => {});

    // Non-browser stages resolve without an `onStart` callback; guarantee one cue.
    speakPromise.then(() => {
      if (token !== run) return;
      fireCue();
    });

    speakPromise.then(() => {
      // Superseded by next/prev/seek/stop — the new owner drives.
      if (token !== run) return;
      // A paused seek-preview spoke this turn on demand; it must never advance,
      // so drop the end here rather than parking a pendingAdvance.
      if (previewPause) return;
      // Paused while (or just before) this turn ended: hold the advance until
      // resume() instead of dropping it.
      if (state === 'paused') {
        pendingAdvance = token;
        return;
      }
      if (state !== 'playing') return;
      scheduleAdvance(token, cueStartedAt);
    });
  }

  // After a turn ends, finish at the timeline's end or move to the next turn
  // after the gap. Pausing during the gap re-defers through `pendingAdvance`.
  function scheduleAdvance(token, turnStartedAt = 0) {
    if (token !== run) return;

    let elapsed = turnStartedAt ? Date.now() - turnStartedAt : 0;
    let delay = Math.max(baseGap, Math.max(0, minTurn - elapsed));

    let advance = () => {
      gapTimer = null;
      if (token !== run) return;
      if (state === 'paused') {
        pendingAdvance = token;
        return;
      }
      if (state !== 'playing') return;
      if (index >= total - 1) {
        finish();
        return;
      }
      index += 1;
      emitIndex();
      speakCurrent();
    };

    gapTimer = setTimeout(advance, delay);
  }

  /** Move the cursor to `target` and speak it, cancelling anything in flight. */
  function gotoAndSpeak(target) {
    let next = clampIndex(target, total);
    halt();
    // Leaving any preview: this is a normal play-through jump, so the tour must
    // advance after the turn ends.
    previewPause = false;
    let changed = next !== index;
    index = next;
    if (changed) emitIndex();
    emitState('playing');
    speakCurrent();
  }

  // Preview a single turn while staying paused. Cancels any frozen/current
  // utterance (halt bumps the run token + stage.cancel), then re-enables
  // synthesis: the stage was frozen by a prior stage.pause(), and cancel+resume
  // clears that paused queue state so the previewed turn can actually speak.
  // Speaks only `target` (firing its onCue + onIndexChange) and never schedules
  // an advance — the previewPause flag makes speakCurrent's end handler drop the
  // turn end instead of advancing, so the tour resumes only on play()/resume().
  // A second seek mid-preview re-enters here: halt() invalidates the prior
  // preview's run token and this previews the new turn, still paused.
  function previewWhilePaused(target) {
    let next = clampIndex(target, total);
    halt();
    previewPause = true;
    if (state !== 'paused') emitState('paused');
    if (stage && typeof stage.resume === 'function') {
      try {
        stage.resume();
      } catch (_) {}
    }
    let changed = next !== index;
    index = next;
    if (changed) emitIndex();
    // state stays 'paused'; speakCurrent fires onCue but never advances.
    speakCurrent();
  }

  let controller = {
    // Event handlers are settable so a UI can (re)bind after construction, not
    // only pass them via options at creation time. Initialized from options here.
    onCue,
    onIndexChange,
    onStateChange,

    /** Start from the current cursor, or resume if paused. */
    play() {
      if (state === 'paused') {
        controller.resume();
        return controller;
      }
      if (state === 'playing') return controller;
      if (total === 0) {
        finish();
        return controller;
      }
      emitState('playing');
      speakCurrent();
      return controller;
    },

    /** Hold the current utterance; no auto-advance while paused. */
    pause() {
      if (state !== 'playing') return controller;
      // A real freeze-pause: stage.pause() holds the in-flight utterance, which
      // resume() un-freezes. Mark this as not a preview.
      previewPause = false;
      // An in-flight gap means the turn already ended; convert it to a pending
      // advance so resume() continues to the next turn instead of losing it.
      if (gapTimer !== null) {
        clearGap();
        pendingAdvance = run;
      }
      if (stage && typeof stage.pause === 'function') {
        try {
          stage.pause();
        } catch (_) {}
      }
      emitState('paused');
      return controller;
    },

    /**
     * Resume after pause. Two cases, distinguished by `previewPause`:
     *   freeze-pause (previewPause false): a frozen utterance is held by
     *     stage.pause(); call stage.resume() to continue it and replay any
     *     advance deferred while paused.
     *   preview-pause (previewPause true): seek() already cancelled the frozen
     *     utterance and spoke a preview turn, so there is nothing to un-freeze;
     *     continue the tour from the current index via the normal play path.
     */
    resume() {
      if (state !== 'paused') return controller;
      if (previewPause) {
        previewPause = false;
        halt();
        emitState('playing');
        speakCurrent();
        return controller;
      }
      if (stage && typeof stage.resume === 'function') {
        try {
          stage.resume();
        } catch (_) {}
      }
      emitState('playing');
      if (pendingAdvance === run) {
        let token = pendingAdvance;
        pendingAdvance = null;
        scheduleAdvance(token);
      }
      return controller;
    },

    /** Pause if playing, else play/resume. */
    toggle() {
      if (state === 'playing') controller.pause();
      else controller.play();
      return controller;
    },

    /** Stop the current speech and speak the next turn (clamped at the end). */
    next() {
      gotoAndSpeak(index + 1);
      return controller;
    },

    /** Stop the current speech and speak the previous turn (clamped at 0). */
    prev() {
      gotoAndSpeak(index - 1);
      return controller;
    },

    /** Speak only turn `i` and stay paused; selecting timeline rows uses this. */
    preview(i) {
      previewWhilePaused(i);
      return controller;
    },

    /**
     * Jump to turn `i` and speak it. While playing, jump and continue the tour.
     * While paused, PREVIEW only turn `i`: speak that single turn and stay
     * paused — no resume, no auto-advance. A later play()/resume() continues the
     * tour from `i`.
     */
    seek(i) {
      if (state === 'paused') {
        previewWhilePaused(i);
      } else {
        gotoAndSpeak(i);
      }
      return controller;
    },

    /** Stop playback, reset to index 0, and resolve `done`. */
    stop() {
      halt();
      previewPause = false;
      let changed = index !== 0;
      index = 0;
      if (changed) emitIndex();
      emitState('stopped');
      resolveDone();
      return controller;
    },

    get index() {
      return index;
    },

    get total() {
      return total;
    },

    get isPlaying() {
      return state === 'playing';
    },

    get isPaused() {
      return state === 'paused';
    },

    done,
  };

  return controller;
}
