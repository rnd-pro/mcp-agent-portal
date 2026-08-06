/**
 * Reusable voice-arbitration contract.
 *
 * A shared, single-holder speaking channel so that only one voice source uses
 * the audio output at a time: notification narration must yield to chat speech,
 * and nothing may speak while the microphone is actively listening.
 *
 * Pure, Node-safe logic — no DOM, speechSynthesis, or timers. The browser side
 * (speechSynthesis / SpeechRecognition) consumes this channel; see
 * `notification-narrator.js` and `voice-controller.js`.
 */

export const VOICE_ARBITRATION_ROLES = Object.freeze({
  notification: 'notification',
  speech: 'speech',
  listening: 'listening',
});

/**
 * Default priority ladder. Higher wins the floor and preempts a lower holder.
 * - notification: background narration, the first to yield.
 * - speech: chat voice replies, preempt notifications.
 * - listening: active microphone capture, preempts all speaking and blocks it.
 */
export const DEFAULT_VOICE_ARBITRATION_PRIORITIES = Object.freeze({
  notification: 10,
  speech: 20,
  listening: 30,
});

function resolvePriority(priorities, role, explicit) {
  if (Number.isFinite(explicit)) return explicit;
  let mapped = priorities[role];
  return Number.isFinite(mapped) ? mapped : 0;
}

/**
 * Single-holder priority lock shared by every voice source on one audio output.
 */
export class VoiceArbitrationChannel {
  constructor({ priorities } = {}) {
    this._priorities = { ...DEFAULT_VOICE_ARBITRATION_PRIORITIES, ...priorities };
    this._holder = null;
    this._counter = 0;
  }

  get activeRole() {
    return this._holder ? this._holder.role : null;
  }

  get activePriority() {
    return this._holder ? this._holder.priority : null;
  }

  get isBusy() {
    return this._holder !== null;
  }

  get isListening() {
    return this._holder ? this._holder.role === VOICE_ARBITRATION_ROLES.listening : false;
  }

  get isSpeaking() {
    return this.isBusy && !this.isListening;
  }

  /**
   * Would a request for `role` (or explicit `priority`) be granted right now?
   * A holder of equal or higher priority keeps the floor.
   */
  canAcquire({ role, priority } = {}) {
    if (!this._holder) return true;
    return resolvePriority(this._priorities, role, priority) > this._holder.priority;
  }

  /**
   * Request the speaking floor. Returns a token on success, or `null` when a
   * holder of equal/higher priority owns the channel. Granting a higher-priority
   * request preempts the current holder via its `onPreempt` callback.
   *
   * @param {object} options
   * @param {string} options.role - one of VOICE_ARBITRATION_ROLES.
   * @param {number} [options.priority] - explicit override of the role priority.
   * @param {(info: { role: string, priority: number }) => void} [options.onPreempt]
   * @returns {{ id: number, role: string, priority: number } | null}
   */
  request({ role, priority, onPreempt } = {}) {
    let nextPriority = resolvePriority(this._priorities, role, priority);

    if (this._holder) {
      if (nextPriority <= this._holder.priority) return null;
      let preempted = this._holder;
      this._holder = null;
      preempted.onPreempt?.({ role, priority: nextPriority });
    }

    let token = { id: ++this._counter, role, priority: nextPriority };
    this._holder = { ...token, onPreempt };
    return token;
  }

  /**
   * Release a previously granted token. No-op if the token is stale (the holder
   * was already preempted or replaced).
   */
  release(token) {
    if (token && this._holder && this._holder.id === token.id) {
      this._holder = null;
      return true;
    }
    return false;
  }

  /** Force-release the current holder, notifying it via `onPreempt`. */
  clear() {
    if (!this._holder) return false;
    let holder = this._holder;
    this._holder = null;
    holder.onPreempt?.({ role: null, priority: null });
    return true;
  }
}

let sharedChannel = null;

/**
 * The process-wide default channel. The notifier and the chat VoiceController
 * share this instance so narration and chat voice arbitrate against each other.
 */
export function getDefaultVoiceArbitrationChannel() {
  if (!sharedChannel) sharedChannel = new VoiceArbitrationChannel();
  return sharedChannel;
}

/** Test-only reset of the shared channel. */
export function resetDefaultVoiceArbitrationChannel() {
  sharedChannel = null;
}
