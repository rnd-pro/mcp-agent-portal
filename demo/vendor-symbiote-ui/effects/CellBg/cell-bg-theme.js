export const CELL_BG_DEFAULTS = Object.freeze({
  cellSize: 14,
  stepMs: 75,
  minRadius: 2,
  maxRadius: 5,
  fadeRate: 0.04,
  paletteSize: 32,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const finiteNumber = (value, fallback) => {
  let next = Number.parseFloat(value);
  return Number.isFinite(next) ? next : fallback;
};

const hexChannel = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
const scriptString = (value) => JSON.stringify(String(value))
  .replace(/</g, '\\u003C')
  .replace(/>/g, '\\u003E')
  .replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

export function createCellBgPalette({
  bgRgb = [0, 0, 0],
  dotRgb = bgRgb,
  baseAlpha = 0,
  alphaSpan = 0,
  paletteSize = CELL_BG_DEFAULTS.paletteSize,
} = {}) {
  let size = Math.max(2, Math.round(finiteNumber(paletteSize, CELL_BG_DEFAULTS.paletteSize)));
  let palette = [];
  for (let i = 0; i < size; i++) {
    let t = i / (size - 1);
    let alpha = baseAlpha + t * alphaSpan;
    let r = bgRgb[0] * (1 - alpha) + dotRgb[0] * alpha;
    let g = bgRgb[1] * (1 - alpha) + dotRgb[1] * alpha;
    let b = bgRgb[2] * (1 - alpha) + dotRgb[2] * alpha;
    palette.push(`#${hexChannel(r)}${hexChannel(g)}${hexChannel(b)}`);
  }
  return palette;
}

export function readCellBgTheme(source, {
  readToken = () => '',
  readNumber = (_source, _token, fallback) => fallback,
  normalizeColor = (_source, value) => value || null,
  parseRgb = () => null,
} = {}) {
  let cellSize = Math.max(4, readNumber(source, '--sn-cell-size', CELL_BG_DEFAULTS.cellSize));
  let minRadius = Math.max(0.5, readNumber(source, '--sn-cell-min-radius', CELL_BG_DEFAULTS.minRadius));
  let maxRadius = Math.max(
    minRadius + 0.5,
    readNumber(source, '--sn-cell-max-radius', CELL_BG_DEFAULTS.maxRadius)
  );
  let stepMs = Math.max(24, readNumber(source, '--sn-cell-step-ms', CELL_BG_DEFAULTS.stepMs));
  let fadeRate = clamp(readNumber(source, '--sn-cell-fade-rate', CELL_BG_DEFAULTS.fadeRate), 0.01, 0.18);

  let bg = readToken(source, '--sn-cell-bg') || readToken(source, '--sn-sys-surface');
  let dot = readToken(source, '--sn-cell-dot') || readToken(source, '--sn-sys-on-surface-dim');
  let bgRgb = parseRgb(source, bg) || [0, 0, 0];
  let dotRgb = parseRgb(source, dot) || bgRgb;
  let baseAlpha = finiteNumber(readToken(source, '--sn-cell-base-alpha'), 0);
  let alphaSpan = finiteNumber(readToken(source, '--sn-cell-alpha-span'), 0);

  return {
    cellSize,
    minRadius,
    maxRadius,
    stepMs,
    fadeRate,
    bgFill: normalizeColor(source, bg) || 'transparent',
    palette: createCellBgPalette({ bgRgb, dotRgb, baseAlpha, alphaSpan }),
  };
}

export function createCellBgStandaloneScript({
  canvasId = 'sn-cell-bg-canvas',
  rootExpression = 'document.documentElement',
} = {}) {
  return `
    (() => {
      const canvas = document.getElementById(${scriptString(canvasId)});
      const ctx = canvas?.getContext?.('2d');
      const root = ${rootExpression};
      if (!canvas || !ctx || !root) return;

      const RULE_B = [3];
      const RULE_S = [2, 3];
      const DEFAULTS = ${JSON.stringify(CELL_BG_DEFAULTS)};
      const motionQuery = typeof matchMedia === 'function'
        ? matchMedia('(prefers-reduced-motion: reduce)')
        : { matches: false };
      const state = {
        cols: 0,
        rows: 0,
        grid: new Uint8Array(0),
        radii: new Float32Array(0),
        palette: [],
        running: false,
        currentSpeed: 0,
        accumulator: 0,
        lastTime: performance.now(),
        isAnimating: false,
        stagnantCount: 0,
        pulseTimer: null,
        toggled: false,
        bgFill: 'transparent',
        prefersReducedMotion: motionQuery.matches,
        cellSize: DEFAULTS.cellSize,
        stepMs: DEFAULTS.stepMs,
        minRadius: DEFAULTS.minRadius,
        maxRadius: DEFAULTS.maxRadius,
        fadeRate: DEFAULTS.fadeRate,
      };

      function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
      }

      function finiteNumber(value, fallback) {
        const next = Number.parseFloat(value);
        return Number.isFinite(next) ? next : fallback;
      }

      function readToken(token) {
        return getComputedStyle(root).getPropertyValue(token).trim();
      }

      function readNumber(token, fallback) {
        const raw = readToken(token);
        const direct = Number.parseFloat(raw);
        if (Number.isFinite(direct) && !raw.startsWith('calc(')) return direct;
        if (!raw) return fallback;
        const probe = document.createElement('span');
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.style.pointerEvents = 'none';
        probe.style.width = raw;
        root.append(probe);
        const resolved = Number.parseFloat(getComputedStyle(probe).width);
        probe.remove();
        return Number.isFinite(resolved) ? resolved : fallback;
      }

      function normalizeColor(value) {
        if (!value) return null;
        const probe = document.createElement('span');
        probe.style.color = value;
        root.append(probe);
        const normalized = getComputedStyle(probe).color.trim();
        probe.remove();
        return normalized || null;
      }

      function parseRgb(value) {
        const normalized = normalizeColor(value);
        if (!normalized) return null;
        const rgbMatch = normalized.match(/rgba?\\(([^)]+)\\)/);
        if (rgbMatch) {
          const channels = rgbMatch[1]
            .replaceAll(',', ' ')
            .split(/[ /\\t]+/)
            .filter(Boolean)
            .slice(0, 3)
            .map((part) => part.endsWith('%') ? Number.parseFloat(part) * 2.55 : Number.parseFloat(part));
          return channels.every(Number.isFinite) ? channels : null;
        }
        const srgbMatch = normalized.match(/color\\(\\s*srgb\\s+([^)]+)\\)/);
        if (!srgbMatch) return null;
        const channels = srgbMatch[1]
          .split(/[ /\\t]+/)
          .filter(Boolean)
          .slice(0, 3)
          .map((part) => part.endsWith('%') ? Number.parseFloat(part) * 2.55 : Number.parseFloat(part) * 255);
        return channels.every(Number.isFinite) ? channels : null;
      }

      function hexChannel(value) {
        return clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
      }

      function createPalette(bgRgb, dotRgb, baseAlpha, alphaSpan) {
        const size = Math.max(2, Math.round(DEFAULTS.paletteSize));
        const palette = [];
        for (let i = 0; i < size; i++) {
          const t = i / (size - 1);
          const alpha = baseAlpha + t * alphaSpan;
          const r = bgRgb[0] * (1 - alpha) + dotRgb[0] * alpha;
          const g = bgRgb[1] * (1 - alpha) + dotRgb[1] * alpha;
          const b = bgRgb[2] * (1 - alpha) + dotRgb[2] * alpha;
          palette.push('#' + hexChannel(r) + hexChannel(g) + hexChannel(b));
        }
        return palette;
      }

      function readTheme() {
        state.cellSize = Math.max(4, readNumber('--sn-cell-size', DEFAULTS.cellSize));
        state.minRadius = Math.max(0.5, readNumber('--sn-cell-min-radius', DEFAULTS.minRadius));
        state.maxRadius = Math.max(state.minRadius + 0.5, readNumber('--sn-cell-max-radius', DEFAULTS.maxRadius));
        state.stepMs = Math.max(24, readNumber('--sn-cell-step-ms', DEFAULTS.stepMs));
        state.fadeRate = clamp(readNumber('--sn-cell-fade-rate', DEFAULTS.fadeRate), 0.01, 0.18);
        const bg = readToken('--sn-cell-bg') || readToken('--sn-sys-surface');
        const dot = readToken('--sn-cell-dot') || readToken('--sn-sys-on-surface-dim');
        const bgRgb = parseRgb(bg) || [0, 0, 0];
        const dotRgb = parseRgb(dot) || bgRgb;
        const baseAlpha = finiteNumber(readToken('--sn-cell-base-alpha'), 0);
        const alphaSpan = finiteNumber(readToken('--sn-cell-alpha-span'), 0);
        state.bgFill = normalizeColor(bg) || 'transparent';
        state.palette = createPalette(bgRgb, dotRgb, baseAlpha, alphaSpan);
      }

      function seedRandom() {
        if (!state.grid.length) return;
        for (let i = 0; i < state.grid.length; i++) {
          state.grid[i] = Math.random() < 0.15 ? 1 : 0;
          if (state.grid[i]) state.radii[i] = state.minRadius;
        }
      }

      function draw() {
        if (!canvas._w) return;
        const w = canvas._w;
        const h = canvas._h;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = state.bgFill;
        ctx.fillRect(0, 0, w, h);
        const maxIdx = state.palette.length - 1;
        for (let y = 0; y < state.rows; y++) {
          for (let x = 0; x < state.cols; x++) {
            const idx = y * state.cols + x;
            const alive = state.grid[idx];
            const targetR = alive ? state.maxRadius : state.minRadius;
            const currentR = state.radii[idx];
            state.radii[idx] = alive
              ? currentR + (targetR - currentR) * 0.2
              : currentR + (targetR - currentR) * state.fadeRate;
            const radius = state.radii[idx];
            const t = Math.max(0, Math.min(1, (radius - state.minRadius) / (state.maxRadius - state.minRadius)));
            const paletteIndex = (t * maxIdx + 0.5) | 0;
            ctx.beginPath();
            ctx.arc(x * state.cellSize, y * state.cellSize, radius, 0, Math.PI * 2);
            ctx.fillStyle = state.palette[paletteIndex];
            ctx.fill();
          }
        }
      }

      function resize() {
        const dpr = devicePixelRatio || 1;
        const w = canvas.parentElement.clientWidth;
        const h = canvas.parentElement.clientHeight;
        if (!w || !h) return;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        canvas._w = w;
        canvas._h = h;
        readTheme();
        const oldGrid = state.grid;
        const oldRadii = state.radii;
        const oldCols = state.cols;
        const oldRows = state.rows;
        state.cols = Math.ceil(w / state.cellSize) + 1;
        state.rows = Math.ceil(h / state.cellSize) + 1;
        state.grid = new Uint8Array(state.cols * state.rows);
        state.radii = new Float32Array(state.cols * state.rows);
        state.radii.fill(state.minRadius);
        if (oldGrid.length) {
          const mc = Math.min(state.cols, oldCols);
          const mr = Math.min(state.rows, oldRows);
          for (let y = 0; y < mr; y++) {
            for (let x = 0; x < mc; x++) {
              state.grid[y * state.cols + x] = oldGrid[y * oldCols + x];
              state.radii[y * state.cols + x] = oldRadii[y * oldCols + x];
            }
          }
        } else {
          seedRandom();
        }
        draw();
      }

      function refreshTheme({ pulse: shouldPulse = false } = {}) {
        const previousCellSize = state.cellSize;
        const previousMinRadius = state.minRadius;
        const previousMaxRadius = state.maxRadius;
        readTheme();
        if (
          previousCellSize !== state.cellSize ||
          previousMinRadius !== state.minRadius ||
          previousMaxRadius !== state.maxRadius
        ) {
          resize();
        } else {
          draw();
        }
        if (shouldPulse) pulse(3000);
      }

      function injectNoise() {
        const regionW = Math.max(4, (state.cols * 0.3) | 0);
        const regionH = Math.max(4, (state.rows * 0.3) | 0);
        const startX = (Math.random() * Math.max(1, state.cols - regionW)) | 0;
        const startY = (Math.random() * Math.max(1, state.rows - regionH)) | 0;
        for (let y = startY; y < startY + regionH; y++) {
          for (let x = startX; x < startX + regionW; x++) {
            if (Math.random() < 0.15) {
              const idx = y * state.cols + x;
              state.grid[idx] = 1;
              state.radii[idx] = state.minRadius;
            }
          }
        }
      }

      function step() {
        const len = state.cols * state.rows;
        const next = new Uint8Array(len);
        let changed = 0;
        for (let y = 0; y < state.rows; y++) {
          for (let x = 0; x < state.cols; x++) {
            let neighbors = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = (x + dx + state.cols) % state.cols;
                const ny = (y + dy + state.rows) % state.rows;
                neighbors += state.grid[ny * state.cols + nx];
              }
            }
            const idx = y * state.cols + x;
            const alive = state.grid[idx];
            next[idx] = alive ? (RULE_S.includes(neighbors) ? 1 : 0) : (RULE_B.includes(neighbors) ? 1 : 0);
            if (next[idx] !== alive) changed++;
          }
        }
        state.grid = next;
        if (changed < len * 0.02) {
          state.stagnantCount++;
          if (state.stagnantCount >= 5) {
            injectNoise();
            state.stagnantCount = 0;
          }
        } else {
          state.stagnantCount = 0;
        }
      }

      function start() {
        if (state.pulseTimer) clearTimeout(state.pulseTimer);
        state.pulseTimer = null;
        state.toggled = true;
        if (state.prefersReducedMotion) {
          draw();
          return;
        }
        state.running = true;
        canvas.dispatchEvent(new CustomEvent('cell-bg-animation-start', {
          bubbles: true,
          composed: true,
          detail: { reason: 'persistent' },
        }));
        if (!state.isAnimating) {
          state.lastTime = performance.now();
          state.isAnimating = true;
          requestAnimationFrame(loop);
        }
      }

      function stop(reason = 'manual') {
        state.toggled = false;
        state.running = false;
        canvas.dispatchEvent(new CustomEvent('cell-bg-animation-stop', {
          bubbles: true,
          composed: true,
          detail: { reason, smooth: true },
        }));
      }

      function loop() {
        if (!state.isAnimating) return;
        const time = performance.now();
        const dt = Math.min(time - state.lastTime, 100);
        state.lastTime = time;
        const targetSpeed = state.running ? 1 : 0;
        state.currentSpeed += (targetSpeed - state.currentSpeed) * 0.03;
        if (!state.running && state.currentSpeed < 0.005) {
          state.currentSpeed = 0;
          state.isAnimating = false;
          canvas.dispatchEvent(new CustomEvent('cell-bg-animation-idle', {
            bubbles: true,
            composed: true,
            detail: { smooth: true },
          }));
        }
        state.accumulator += dt * state.currentSpeed;
        let maxSteps = 5;
        while (state.accumulator >= state.stepMs && maxSteps > 0) {
          step();
          state.accumulator -= state.stepMs;
          maxSteps--;
        }
        draw();
        if (state.isAnimating) requestAnimationFrame(loop);
      }

      function pulse(duration = 10000) {
        if (state.toggled) return;
        if (state.prefersReducedMotion) {
          draw();
          return;
        }
        const safeDuration = Math.max(300, Number.parseFloat(duration) || 10000);
        if (state.pulseTimer) clearTimeout(state.pulseTimer);
        canvas.dispatchEvent(new CustomEvent('cell-bg-animation-trigger', {
          bubbles: true,
          composed: true,
          detail: { duration: safeDuration },
        }));
        state.running = true;
        canvas.dispatchEvent(new CustomEvent('cell-bg-animation-start', {
          bubbles: true,
          composed: true,
          detail: { reason: 'pulse' },
        }));
        if (!state.isAnimating) {
          state.lastTime = performance.now();
          state.isAnimating = true;
          requestAnimationFrame(loop);
        }
        state.pulseTimer = setTimeout(() => {
          state.pulseTimer = null;
          if (!state.toggled) stop('pulse');
        }, safeDuration);
      }

      function trigger(duration = 10000) {
        pulse(duration);
      }

      canvas.__cellBg = {
        start,
        stop,
        trigger,
        pulse,
        refreshTheme,
        resize,
      };

      motionQuery.addEventListener?.('change', (event) => {
        state.prefersReducedMotion = event.matches;
        if (state.prefersReducedMotion) {
          if (state.pulseTimer) clearTimeout(state.pulseTimer);
          state.pulseTimer = null;
          stop();
          draw();
        }
      });
      addEventListener('resize', () => {
        resize();
        pulse(10000);
      });
      addEventListener('cascade-theme-change', () => refreshTheme({ pulse: true }));
      if (typeof MutationObserver === 'function') {
        new MutationObserver(() => refreshTheme()).observe(root, { attributes: true, attributeFilter: ['class', 'style'] });
      }
      resize();
      pulse(10000);
    })();
  `;
}
