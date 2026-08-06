/**
 * Live streaming-status state machine.
 *
 * Models the lightweight phase meta that a chat stream advances through while an
 * agent works — thinking, running a tool, then responding — without any message
 * content. A stream begins with an implicit `thinking` indicator, receives a
 * series of server `meta` deltas (each carrying a phase plus a running message
 * count, the last tool name, and an optional thinking-status note), and ends by
 * clearing back to an idle, contentless state.
 *
 * Pure and dependency-free — no WebSocket transport, no DOM rendering, no event
 * emitters, no i18n. Feed it transport-decoded events and read the next meta.
 *
 * @module symbiote-ui/chat/live-status
 */

/**
 * Streaming phases a message can be in while the agent works.
 *
 * @readonly
 * @enum {string}
 */
export const MESSAGE_STREAMING_PHASE = Object.freeze({
  /** Agent is reasoning; no tool call and no visible output yet. */
  THINKING: 'thinking',
  /** Agent is running a tool; `lastToolName` names the most recent one. */
  TOOL: 'tool',
  /** Agent is producing its textual reply. */
  RESPONDING: 'responding',
});

const STREAMING_PHASES = Object.freeze(Object.values(MESSAGE_STREAMING_PHASE));

/**
 * @typedef {Object} LiveStatusMeta
 * @property {(MESSAGE_STREAMING_PHASE|null)} phase - Current streaming phase, or
 *   `null` when the stream is idle/cleared.
 * @property {number} messageCount - Running count of messages reported so far.
 * @property {(string|null)} lastToolName - Name of the most recent tool call, or
 *   `null` when no tool has run in the current phase context.
 * @property {string} thinkingStatus - Optional human-readable note attached to a
 *   thinking phase (e.g. a reconnect notice); empty string when none.
 * @property {boolean} active - Whether the stream is currently live (`phase` set).
 */

/**
 * Normalize a candidate phase to a known {@link MESSAGE_STREAMING_PHASE} value.
 *
 * @param {*} phase - Raw phase candidate.
 * @returns {(MESSAGE_STREAMING_PHASE|null)} A known phase, or `null` if unknown.
 */
function normalizePhase(phase) {
  return STREAMING_PHASES.includes(phase) ? phase : null;
}

/**
 * Coerce a value to a non-negative integer message count.
 *
 * @param {*} value - Raw count candidate.
 * @param {number} fallback - Value to use when `value` is not a finite number.
 * @returns {number} A non-negative integer.
 */
function normalizeMessageCount(value, fallback) {
  let count = Number(value);
  if (!Number.isFinite(count)) return fallback;
  return Math.max(0, Math.trunc(count));
}

/**
 * Coerce a value to a tool name or `null`.
 *
 * @param {*} value - Raw tool-name candidate.
 * @returns {(string|null)} A non-empty trimmed name, or `null`.
 */
function normalizeToolName(value) {
  let name = String(value ?? '').trim();
  return name ? name : null;
}

/**
 * Coerce a value to a thinking-status string.
 *
 * @param {*} value - Raw status candidate.
 * @returns {string} A trimmed status note, or empty string.
 */
function normalizeThinkingStatus(value) {
  return String(value ?? '').trim();
}

/**
 * Build a fresh, idle live-status meta.
 *
 * @param {Object} [init] - Optional initial overrides.
 * @param {(MESSAGE_STREAMING_PHASE|null)} [init.phase=null] - Initial phase.
 * @param {number} [init.messageCount=0] - Initial message count.
 * @param {(string|null)} [init.lastToolName=null] - Initial tool name.
 * @param {string} [init.thinkingStatus=''] - Initial thinking-status note.
 * @returns {LiveStatusMeta} A normalized meta object.
 */
export function createLiveStatusMeta(init = {}) {
  let phase = normalizePhase(init.phase);
  return {
    phase,
    messageCount: normalizeMessageCount(init.messageCount, 0),
    lastToolName: normalizeToolName(init.lastToolName),
    thinkingStatus: normalizeThinkingStatus(init.thinkingStatus),
    active: phase !== null,
  };
}

/**
 * @typedef {Object} LiveStatusEvent
 * @property {string} type - Event type: `start`, `meta`, `reconnecting`,
 *   `reconnected`, or `clear`.
 * @property {(MESSAGE_STREAMING_PHASE)} [phase] - Phase for a `meta` event.
 * @property {number} [messageCount] - Running message count for a `meta` event.
 * @property {(string|null)} [lastToolName] - Tool name for a `meta` event.
 * @property {string} [thinkingStatus] - Thinking note for a `meta` event.
 * @property {string} [status] - Status note for a `reconnecting`/`reconnected`
 *   event; defaults are applied when omitted.
 */

const RECONNECT_STATUS = Object.freeze({
  reconnecting: 'Reconnecting...',
  reconnected: 'Reconnected',
});

/**
 * Advance the streaming-phase state machine by one decoded event.
 *
 * Does not mutate `meta`; returns the next meta. Carries forward `messageCount`
 * and `lastToolName` when an event omits them, so a `tool` phase keeps its tool
 * name and a later `responding` phase keeps the latest count.
 *
 * Recognized event types:
 * - `start` — begin streaming with an implicit `thinking` phase, reset to a
 *   clean count and no tool.
 * - `meta` — apply a server delta: switch phase, update count, and (when the
 *   phase reports a tool) update `lastToolName`. A non-tool phase clears the
 *   tool name; a thinking phase without a note clears `thinkingStatus`.
 * - `reconnecting` / `reconnected` — show a `thinking` phase with a status note
 *   while preserving the running count.
 * - `clear` — return to the idle, contentless state.
 *
 * Unknown event types leave `meta` unchanged (a normalized copy is returned).
 *
 * @param {LiveStatusMeta} meta - Current meta (typically from a prior call).
 * @param {LiveStatusEvent} event - Decoded transport event.
 * @returns {LiveStatusMeta} The next normalized meta.
 */
export function advanceStreamingPhase(meta, event) {
  let current = createLiveStatusMeta(meta || {});
  let type = event && typeof event === 'object' ? event.type : event;

  switch (type) {
    case 'start':
      return {
        phase: MESSAGE_STREAMING_PHASE.THINKING,
        messageCount: 0,
        lastToolName: null,
        thinkingStatus: '',
        active: true,
      };

    case 'meta': {
      let phase = normalizePhase(event.phase);
      if (phase === null) return current;
      let messageCount = 'messageCount' in event
        ? normalizeMessageCount(event.messageCount, current.messageCount)
        : current.messageCount;
      let lastToolName = phase === MESSAGE_STREAMING_PHASE.TOOL
        ? (normalizeToolName(event.lastToolName) ?? current.lastToolName)
        : null;
      let thinkingStatus = phase === MESSAGE_STREAMING_PHASE.THINKING
        ? normalizeThinkingStatus(event.thinkingStatus)
        : '';
      return { phase, messageCount, lastToolName, thinkingStatus, active: true };
    }

    case 'reconnecting':
    case 'reconnected':
      return {
        phase: MESSAGE_STREAMING_PHASE.THINKING,
        messageCount: current.messageCount,
        lastToolName: null,
        thinkingStatus: normalizeThinkingStatus(event.status) || RECONNECT_STATUS[type],
        active: true,
      };

    case 'clear':
      return createLiveStatusMeta();

    default:
      return current;
  }
}
