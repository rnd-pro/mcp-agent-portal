/**
 * Dialogue timeline scheduler.
 *
 * Plays an ordered list of narration turns across a multi-voice dialogue stage
 * (see `dialogue-stage.js`). Each turn speaks through one persona; by default a
 * turn starts when the previous turn ends, plus a small gap. A turn may instead
 * start before the previous one finishes (`overlapMs`) to produce podcast-style
 * cross-talk, which on the stage means two persona channels speak in parallel.
 *
 * `onCue` fires at each turn's speak START with the turn's opaque cue, so a host
 * can highlight the UI the turn narrates or run a side action. Playback honors an
 * `AbortSignal`.
 *
 * Pure at import time and host-agnostic: the scheduler only assumes the stage
 * contract (`persona`, `speak` returning a Promise, `cancel`) and timers. It
 * degrades to a clean no-op against a non-browser stage, where `speak` resolves
 * immediately. `buildAlternatingTimeline` is fully pure (no browser, no timers).
 */

const DEFAULT_GAP_MS = 120;

// Rough words-per-minute used to estimate how long a turn speaks, so an
// overlapping turn can begin `overlapMs` before the previous turn is expected to
// end — the stage exposes no duration up front. Scaled by the persona's rate.
// When no usable estimate exists (e.g. empty text) we fall back to sequential.
const ESTIMATE_WPM = 165;
const MIN_ESTIMATE_MS = 350;

function nonNegative(value, fallback) {
  let n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Abortable timer. Resolves after `ms`, or immediately on abort. */
function delay(ms, signal) {
  return new Promise((resolve) => {
    if (!(ms > 0)) {
      resolve();
      return;
    }
    let timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    let onAbort = () => {
      cleanup();
      resolve();
    };
    let cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
    };
    if (signal?.aborted) {
      cleanup();
      resolve();
      return;
    }
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

/**
 * Estimate a turn's spoken duration in ms, scaled by the persona's rate, so the
 * next turn can overlap it. Returns 0 when no useful estimate is possible.
 */
function estimateTurnMs(text, profile) {
  let body = text == null ? '' : String(text);
  let trimmed = body.trim();
  if (!trimmed) return 0;
  let words = trimmed.split(/\s+/).length;
  let rate = Number.isFinite(profile?.rate) && profile.rate > 0 ? profile.rate : 1;
  let ms = ((words / ESTIMATE_WPM) * 60000) / rate;
  return Math.max(MIN_ESTIMATE_MS, ms);
}

/**
 * Play `timeline` on `stage`, in order.
 *
 * @param {object} stage - a dialogue stage (`persona`, `speak`, `cancel`).
 * @param {object} timeline
 * @param {object} [timeline.personas] - `{ [id]: profile }`, registered before playback.
 * @param {Array} [timeline.turns] - `{ persona, text, overlapMs?, gapMs?, cue? }`.
 * @param {object} [options]
 * @param {(cue:any, turn:object, index:number) => void} [options.onCue] - fired at each turn's speak start.
 * @param {AbortSignal} [options.signal] - abort to stop further turns and cancel the stage.
 * @param {number} [options.defaultGapMs=120] - gap after the previous turn ends when no `gapMs`/overlap.
 * @returns {Promise<void>} resolves when the final turn ends or playback is aborted.
 */
export function playDialogueTimeline(stage, timeline, { onCue, signal, defaultGapMs = DEFAULT_GAP_MS } = {}) {
  if (!stage || typeof stage.speak !== 'function') return Promise.resolve();

  let personas = timeline?.personas || {};
  let turns = Array.isArray(timeline?.turns) ? timeline.turns : [];
  let baseGap = nonNegative(defaultGapMs, DEFAULT_GAP_MS);

  if (typeof stage.persona === 'function') {
    for (let [id, profile] of Object.entries(personas)) {
      stage.persona(id, profile || {});
    }
  }

  if (turns.length === 0) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    let aborted = signal?.aborted === true;

    let detachAbort = () => {
      signal?.removeEventListener?.('abort', onAbort);
    };
    let finish = () => {
      if (settled) return;
      settled = true;
      detachAbort();
      resolve();
    };
    let onAbort = () => {
      aborted = true;
      try {
        stage.cancel?.();
      } catch (_) {}
      finish();
    };

    if (aborted) {
      try {
        stage.cancel?.();
      } catch (_) {}
      finish();
      return;
    }
    signal?.addEventListener?.('abort', onAbort, { once: true });

    // Speak one turn. The cue fires once at speak START (via `onStart`), with a
    // safety net so a no-op stage that never calls `onStart` still emits the cue.
    function speakTurn(turn, index) {
      let cued = false;
      let fireCue = () => {
        if (cued) return;
        cued = true;
        if (typeof onCue === 'function') {
          try {
            onCue(turn?.cue, turn, index);
          } catch (_) {}
        }
      };

      let speakPromise = Promise.resolve(
        stage.speak(turn?.persona, turn?.text, { onStart: fireCue }),
      ).catch(() => {});

      // Non-browser stages resolve immediately without an `onStart` callback;
      // ensure every turn still emits exactly one cue.
      speakPromise.then(fireCue);

      return { speakPromise, profile: personas[turn?.persona] || {} };
    }

    // Launch turn `index`; `control` is the previously launched turn so we can
    // chain on its end (sequential) or pre-empt it (overlap).
    function launch(index, control) {
      if (settled || aborted) {
        finish();
        return;
      }

      let turn = turns[index];
      let current = speakTurn(turn, index);
      let next = turns[index + 1];

      if (!next) {
        // Resolve only after the final turn actually finishes speaking.
        current.speakPromise.then(finish);
        return;
      }

      let nextOverlap = nonNegative(next.overlapMs, 0);
      if (nextOverlap > 0) {
        let estMs = estimateTurnMs(turn?.text, current.profile);
        if (estMs > 0) {
          // Cross-talk: start the next turn `nextOverlap` before this turn is
          // estimated to end, so the two persona channels speak in parallel.
          let lead = Math.max(0, estMs - nextOverlap);
          delay(lead, signal).then(() => launch(index + 1, current));
        } else {
          // No usable estimate — fall back to sequential.
          current.speakPromise
            .then(() => delay(baseGap, signal))
            .then(() => launch(index + 1, current));
        }
      } else {
        // Sequential: the next turn waits for this one to end, then its gap.
        let nextGap = nonNegative(next.gapMs, baseGap);
        current.speakPromise
          .then(() => delay(nextGap, signal))
          .then(() => launch(index + 1, current));
      }
    }

    launch(0, null);
  });
}

/**
 * Build a timeline that alternates `personaIds` round-robin across `lines`.
 *
 * Pure and Node-safe. Each line is `{ text, cue?, persona? }`; a line's explicit
 * `persona` overrides the round-robin assignment. `overlapMs` is applied to every
 * turn after the first so the conversation cross-talks.
 *
 * @param {string[]} personaIds - persona ids to cycle through.
 * @param {Array} lines - `{ text, cue?, persona? }`; `persona` overrides the cycle.
 * @param {number} [overlapMs=0] - applied to every turn after the first.
 * @returns {{ personas: object, turns: Array }} a timeline. Pure (no browser).
 */
export function buildAlternatingTimeline(personaIds, lines, overlapMs = 0) {
  let ids = Array.isArray(personaIds) ? personaIds.filter((id) => id != null) : [];
  let entries = Array.isArray(lines) ? lines : [];
  let lead = Number.isFinite(overlapMs) && overlapMs > 0 ? overlapMs : 0;

  let personas = {};
  for (let id of ids) personas[id] = {};

  let turns = entries.map((line, index) => {
    let persona =
      line?.persona != null
        ? line.persona
        : ids.length > 0
          ? ids[index % ids.length]
          : undefined;
    if (persona != null && !(persona in personas)) personas[persona] = {};

    let turn = { persona, text: line?.text == null ? '' : line.text };
    if (line && 'cue' in line) turn.cue = line.cue;
    if (index > 0 && lead > 0) turn.overlapMs = lead;
    return turn;
  });

  return { personas, turns };
}
