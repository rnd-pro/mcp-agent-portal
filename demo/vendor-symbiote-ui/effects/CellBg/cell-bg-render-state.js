const RULE_B = new Set([3]);
const RULE_S = new Set([2, 3]);
const LIVE_FRAME_MS = 1000 / 60;
const DEFAULT_SEED = 'symbiote-cell-bg';

function finitePositive(value, fallback) {
  let number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function seedHash(value) {
  let hash = 2166136261;
  for (let char of String(value || DEFAULT_SEED)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

function nextRandom(state) {
  state.randomState = (state.randomState + 0x6D2B79F5) >>> 0;
  let value = state.randomState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function approach(value, target, factor, elapsedMs) {
  let safeFactor = Math.min(0.999999, Math.max(0, Number(factor) || 0));
  let frames = Math.max(0, Number(elapsedMs) || 0) / LIVE_FRAME_MS;
  return target + (value - target) * Math.pow(1 - safeFactor, frames);
}

function advanceRadii(state, elapsedMs) {
  for (let index = 0; index < state.radii.length; index += 1) {
    let alive = state.grid[index] === 1;
    let target = alive ? state.maxRadius : state.minRadius;
    let factor = alive ? 0.2 : state.fadeRate;
    state.radii[index] = approach(state.radii[index], target, factor, elapsedMs);
  }
}

function injectNoise(state) {
  let regionW = Math.max(4, Math.floor(state.cols * 0.3));
  let regionH = Math.max(4, Math.floor(state.rows * 0.3));
  let startX = Math.floor(nextRandom(state) * Math.max(1, state.cols - regionW));
  let startY = Math.floor(nextRandom(state) * Math.max(1, state.rows - regionH));
  for (let y = startY; y < Math.min(state.rows, startY + regionH); y += 1) {
    for (let x = startX; x < Math.min(state.cols, startX + regionW); x += 1) {
      if (nextRandom(state) >= 0.15) continue;
      let index = y * state.cols + x;
      state.grid[index] = 1;
      state.radii[index] = state.minRadius;
    }
  }
}

function stepGrid(state) {
  let next = new Uint8Array(state.grid.length);
  let changed = 0;
  for (let y = 0; y < state.rows; y += 1) {
    for (let x = 0; x < state.cols; x += 1) {
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          let nx = (x + dx + state.cols) % state.cols;
          let ny = (y + dy + state.rows) % state.rows;
          neighbors += state.grid[ny * state.cols + nx];
        }
      }
      let index = y * state.cols + x;
      let alive = state.grid[index] === 1;
      next[index] = alive
        ? (RULE_S.has(neighbors) ? 1 : 0)
        : (RULE_B.has(neighbors) ? 1 : 0);
      if (next[index] !== state.grid[index]) changed += 1;
    }
  }
  state.grid = next;
  if (changed < state.grid.length * 0.02) {
    state.stagnantCount += 1;
    if (state.stagnantCount >= 5) {
      injectNoise(state);
      state.stagnantCount = 0;
    }
  } else {
    state.stagnantCount = 0;
  }
}

export function createCellBgRenderState(options = {}) {
  let cols = Math.max(1, Math.floor(finitePositive(options.cols, 1)));
  let rows = Math.max(1, Math.floor(finitePositive(options.rows, 1)));
  let minRadius = finitePositive(options.minRadius, 2);
  let state = {
    seed: String(options.seed || DEFAULT_SEED),
    cols,
    rows,
    stepMs: finitePositive(options.stepMs, 75),
    minRadius,
    maxRadius: Math.max(minRadius, finitePositive(options.maxRadius, 4)),
    fadeRate: Math.min(1, Math.max(0, Number(options.fadeRate) || 0.04)),
    grid: new Uint8Array(cols * rows),
    radii: new Float32Array(cols * rows),
    randomState: seedHash(`${options.seed || DEFAULT_SEED}:${cols}x${rows}`),
    stagnantCount: 0,
    stepIndex: 0,
    timeMs: 0,
  };
  state.radii.fill(minRadius);
  for (let index = 0; index < state.grid.length; index += 1) {
    state.grid[index] = nextRandom(state) < 0.15 ? 1 : 0;
  }
  return state;
}

export function seekCellBgRenderState(state, timeMs, options = state || {}) {
  let targetTimeMs = Math.max(0, Number(timeMs) || 0);
  let next = state;
  if (!next || targetTimeMs < next.timeMs) {
    next = createCellBgRenderState(options);
  }
  let targetStep = Math.floor(targetTimeMs / next.stepMs);
  while (next.stepIndex < targetStep) {
    advanceRadii(next, next.stepMs);
    stepGrid(next);
    next.stepIndex += 1;
  }
  next.timeMs = targetTimeMs;
  return next;
}

export function cellBgRenderFrame(state) {
  let elapsedMs = Math.max(0, state.timeMs - state.stepIndex * state.stepMs);
  let radii = new Float32Array(state.radii.length);
  for (let index = 0; index < radii.length; index += 1) {
    let alive = state.grid[index] === 1;
    let target = alive ? state.maxRadius : state.minRadius;
    let factor = alive ? 0.2 : state.fadeRate;
    radii[index] = approach(state.radii[index], target, factor, elapsedMs);
  }
  return { grid: state.grid, radii };
}

export function cellBgRenderHash(state, frame = cellBgRenderFrame(state)) {
  let hash = 2166136261;
  for (let index = 0; index < frame.grid.length; index += 1) {
    hash ^= frame.grid[index];
    hash = Math.imul(hash, 16777619);
    hash ^= Math.round(frame.radii[index] * 1000);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
