export const DURATION_MS = 10000;

export const PHASES = Object.freeze({
  METADATA: 'metadata',
  DISCOVER: 'discover',
  SELECT: 'select',
  HYDRATE: 'hydrate',
  READY: 'ready',
});

export const LANDMARKS = Object.freeze({
  [PHASES.METADATA]: 0,
  [PHASES.DISCOVER]: 2000,
  [PHASES.SELECT]: 4000,
  [PHASES.HYDRATE]: 6000,
  [PHASES.READY]: 8000,
});

export const BEATS = Object.freeze([
  Object.freeze({
    phase: PHASES.METADATA,
    label: 'PROVIDER METADATA',
    explanation: 'schemas, tokens, and descriptors loaded',
    startMs: LANDMARKS[PHASES.METADATA],
    endMs: LANDMARKS[PHASES.DISCOVER] - 1,
    caption: 'Symbiote UI makes provider metadata, tokens, schemas, and descriptors available to the host.',
  }),
  Object.freeze({
    phase: PHASES.DISCOVER,
    label: 'MANIFEST DISCOVERY',
    explanation: 'capabilities inspectable via manifest contract',
    startMs: LANDMARKS[PHASES.DISCOVER],
    endMs: LANDMARKS[PHASES.SELECT] - 1,
    caption: 'The WebMCP manifest contract exposes component capabilities, schemas, and APIs for runtime inspection.',
  }),
  Object.freeze({
    phase: PHASES.SELECT,
    label: 'PRIMITIVE SELECTION',
    explanation: 'agent selects appropriate registered UI primitives',
    startMs: LANDMARKS[PHASES.SELECT],
    endMs: LANDMARKS[PHASES.HYDRATE] - 1,
    caption: 'The agent parses requirements and selects the required layout structures and custom element primitives.',
  }),
  Object.freeze({
    phase: PHASES.HYDRATE,
    label: 'UI HYDRATION',
    explanation: 'Web Components hydrate through safe entry point',
    startMs: LANDMARKS[PHASES.HYDRATE],
    endMs: LANDMARKS[PHASES.READY] - 1,
    caption: 'Browser Web Components hydrate dynamically over Node-safe boundaries for full interactivity.',
  }),
  Object.freeze({
    phase: PHASES.READY,
    label: 'READY COMPOSITION',
    explanation: 'agent-ready UI composition completed',
    startMs: LANDMARKS[PHASES.READY],
    endMs: DURATION_MS,
    caption: 'The client workspace visual composition is completed. Persistence, execution, permissions, and workflow policy remain explicitly host-owned.',
  }),
]);

/**
 * @param {number} timeMs
 */
function assertFiniteTime(timeMs) {
  if (!Number.isFinite(timeMs)) {
    throw new TypeError('Timeline time must be a finite number of milliseconds.');
  }
}

/**
 * @param {number} timeMs
 * @returns {number}
 */
export function clampTime(timeMs) {
  assertFiniteTime(timeMs);
  return Math.min(Math.max(timeMs, 0), DURATION_MS);
}

/**
 * @param {number} timeMs
 * @returns {number}
 */
export function wrapTime(timeMs) {
  assertFiniteTime(timeMs);
  return ((timeMs % DURATION_MS) + DURATION_MS) % DURATION_MS;
}

/**
 * @param {number} timeMs
 * @returns {Readonly<{phase: string, label: string, explanation: string, startMs: number, endMs: number, caption: string}>}
 */
function getBeatAtTime(timeMs) {
  let clampedTime = clampTime(timeMs);
  return BEATS.findLast((beat) => clampedTime >= beat.startMs) || BEATS[0];
}

/**
 * @param {number} timeMs
 * @returns {number}
 */
export function getProgressInPhase(timeMs) {
  let clampedTime = clampTime(timeMs);
  let beat = getBeatAtTime(clampedTime);
  let progress = (clampedTime - beat.startMs) / (beat.endMs - beat.startMs);
  return Math.min(Math.max(progress, 0), 1);
}

/**
 * @param {number} timeMs
 * @returns {string}
 */
export function formatAccessibleTime(timeMs) {
  let clampedTime = clampTime(timeMs);
  let seconds = (clampedTime / 1000).toFixed(2);
  let beat = getBeatAtTime(clampedTime);
  return `${seconds} seconds — ${beat.label}`;
}

export const DESCRIPTOR_COUNT = 137;
export const CAPABILITY_COUNT = 49;

/**
 * @param {number} timeMs
 * @returns {object}
 */
export function getStateAtTime(timeMs) {
  let clampedTime = clampTime(timeMs);
  let beat = getBeatAtTime(clampedTime);
  let progress = getProgressInPhase(clampedTime);

  let state = {
    phase: beat.phase,
    label: beat.label,
    explanation: beat.explanation,
    caption: beat.caption,
    phaseProgress: progress,
  };

  if (beat.phase === PHASES.METADATA) {
    state.statusText = 'Loading Schemas';
    state.metric = `${DESCRIPTOR_COUNT} Descriptors`;
  } else if (beat.phase === PHASES.DISCOVER) {
    state.statusText = 'Querying Manifest';
    state.metric = `${Math.min(Math.floor(progress * CAPABILITY_COUNT) + 1, CAPABILITY_COUNT)} Capabilities`;
  } else if (beat.phase === PHASES.SELECT) {
    state.statusText = 'Choosing Elements';
    state.metric = `${Math.floor(progress * 4 + 1)}/5 Selected`;
  } else if (beat.phase === PHASES.HYDRATE) {
    state.statusText = 'Hydrating DOM';
    state.metric = `${Math.round(progress * 100)}% Hydrated`;
  } else {
    state.statusText = 'Workspace Ready';
    state.metric = 'Active';
  }

  return state;
}
