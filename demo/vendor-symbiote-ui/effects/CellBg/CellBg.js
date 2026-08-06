import Symbiote from '@symbiotejs/symbiote';
import template from './CellBg.tpl.js';
import css from './CellBg.css.js';
import { CELL_BG_DEFAULTS, readCellBgTheme } from './cell-bg-theme.js';
import { renderNow } from '../../core/render-clock.js';
import {
  cellBgRenderFrame,
  cellBgRenderHash,
  createCellBgRenderState,
  seekCellBgRenderState,
} from './cell-bg-render-state.js';

/**
 * Cellular Automaton Background Component
 * Parameters based on user config:
 * Rule: Conway B3/S23
 * Cell Size: 14px
 * Speed: 75ms
 * Min Radius: 2px
 * Max Radius: 4px
 * Fade Rate: 4%
 */

const RULE_B = [3];
const RULE_S = [2, 3];
const PALETTE_SIZE = CELL_BG_DEFAULTS.paletteSize;
const now = () => renderNow();
const requestFrame = (callback) => {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    return globalThis.requestAnimationFrame(callback);
  }
  return setTimeout(() => callback(now()), 16);
};
const cancelFrame = (handle) => {
  if (handle === null || handle === undefined) return;
  if (typeof globalThis.cancelAnimationFrame === 'function') {
    globalThis.cancelAnimationFrame(handle);
  } else {
    clearTimeout(handle);
  }
};
const getReducedMotionQuery = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') || null;

function normalizeCssColor(source, value) {
  let doc = source?.ownerDocument || globalThis.document;
  if (!doc || !value) return null;
  let probe = doc.createElement('span');
  probe.style.color = value;
  let target = typeof source?.append === 'function' ? source : doc.documentElement;
  target.append(probe);
  let normalized = globalThis.getComputedStyle(probe).color.trim();
  probe.remove();
  return normalized || null;
}

function parseCssRgb(source, value) {
  let normalized = normalizeCssColor(source, value);
  if (!normalized) return null;

  let rgbMatch = normalized.match(/rgba?\(([^)]+)\)/);
  if (rgbMatch) {
    let channels = rgbMatch[1]
      .replaceAll(',', ' ')
      .split(/[ /\t]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((part) => (part.endsWith('%') ? Number.parseFloat(part) * 2.55 : Number.parseFloat(part)));
    return channels.every(Number.isFinite) ? channels : null;
  }

  let srgbMatch = normalized.match(/color\(\s*srgb\s+([^)]+)\)/);
  if (!srgbMatch) return null;
  let channels = srgbMatch[1]
    .split(/[ /\t]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => (part.endsWith('%') ? Number.parseFloat(part) * 2.55 : Number.parseFloat(part) * 255));
  return channels.every(Number.isFinite) ? channels : null;
}

function readCssToken(source, token) {
  let computed = globalThis.getComputedStyle?.(source);
  return computed?.getPropertyValue(token).trim() || '';
}

function readCssNumber(source, token, fallback) {
  let raw = readCssToken(source, token);
  let value = Number.parseFloat(raw);
  if (Number.isFinite(value) && !raw.startsWith('calc(')) return value;

  let doc = source?.ownerDocument || globalThis.document;
  if (!doc || !raw) return fallback;
  let probe = doc.createElement('span');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.width = raw;
  let target = typeof source?.append === 'function' ? source : doc.documentElement;
  target.append(probe);
  let resolved = Number.parseFloat(globalThis.getComputedStyle(probe).width);
  probe.remove();
  return Number.isFinite(resolved) ? resolved : fallback;
}

export class CellBg extends Symbiote {
  static get observedAttributes() {
    return ['active', 'auto-trigger', 'pulse-duration', 'seed'];
  }

  init$ = {
    active: false,
    autoTrigger: true,
    pulseDuration: 10000,
  };

  initCallback() {
    this.$.active = this.hasAttribute('active');
    this.$.autoTrigger = this._readAutoTriggerAttribute();
    this.$.pulseDuration = this._readPulseDurationAttribute();

    this.canvas = this.ref.canvas;
    this.ctx = this.canvas?.getContext?.('2d') || null;
    this._available = Boolean(this.canvas && this.ctx);

    this._buildPalette();
    this._motionQuery = getReducedMotionQuery();
    this._prefersReducedMotion = Boolean(this._motionQuery?.matches);
    this._motionChangeHandler = (event) => {
      this._prefersReducedMotion = Boolean(event.matches);
      if (this._externalFrameDrive) {
        this.presentFrame();
        return;
      }
      if (this._prefersReducedMotion) {
        if (this._pulseTimer) clearTimeout(this._pulseTimer);
        this._pulseTimer = null;
        this._stop();
        this._draw();
      } else if (this._toggled) {
        this._start();
      }
    };
    if (typeof this._motionQuery?.addEventListener === 'function') {
      this._motionQuery.addEventListener('change', this._motionChangeHandler);
    } else {
      this._motionQuery?.addListener?.(this._motionChangeHandler);
    }

    this.cols = 0;
    this.rows = 0;
    this.grid = new Uint8Array(0);
    this.radii = new Float32Array(0);
    this.running = false;
    this.currentSpeed = 0;
    this.accumulator = 0;
    this.lastTime = now();
    this.isAnimating = false;
    this._stagnantCount = 0;
    this._frameRequest = null;
    this._externalFrameDrive = false;
    this._externalRenderState = null;
    this._externalRenderFrame = null;
    this._externalRestoreState = null;

    // We only redraw on rAF if running, or if a single frame is needed after resize
    this.resize = this.resize.bind(this);
    this.renderLoop = this.renderLoop.bind(this);

    // Use ResizeObserver to catch layout panel resizing (not just window resizes)
    // Debounce: resize canvas immediately (prevents flash), pulse only after settle
    const onResize = () => {
      this.resize();
      if (this._externalFrameDrive) return;
      if (this._resizeDebounce) clearTimeout(this._resizeDebounce);
      this._resizeDebounce = setTimeout(() => {
        this._resizeDebounce = null;
        this._triggerIfEnabled();
      }, 300);
    };

    if (typeof globalThis.ResizeObserver === 'function') {
      this.ro = new ResizeObserver(onResize);
    } else if (typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener('resize', onResize);
      this._removeResizeFallback = () => globalThis.removeEventListener?.('resize', onResize);
    }

    this._themeChangeHandler = () => this._scheduleThemeRefresh();
    this.ownerDocument?.addEventListener?.('cascade-theme-change', this._themeChangeHandler);
    if (typeof globalThis.MutationObserver === 'function') {
      this._themeObserver = new MutationObserver(() => this._scheduleThemeRefresh());
      let root = this.ownerDocument?.documentElement;
      if (root) {
        this._themeObserver.observe(root, { attributes: true, attributeFilter: ['class', 'style'] });
      }
      this._themeObserver.observe(this, { attributes: true, attributeFilter: ['class', 'style'] });
    }

    // Defer observation to allow DOM to settle
    setTimeout(() => {
      this.ro?.observe(this);
      this.resize();
      this._seedRandom();
      this._triggerIfEnabled();
    }, 0);

    this.sub('active', (val) => {
      this._setPersistent(!!val);
    });
    if (this.$.active) this._setPersistent(true);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    super.attributeChangedCallback?.(name, oldValue, newValue);
    if (oldValue === newValue) return;
    if (name === 'active') {
      this.$.active = this.hasAttribute('active');
    } else if (name === 'auto-trigger') {
      this.$.autoTrigger = this._readAutoTriggerAttribute();
    } else if (name === 'pulse-duration') {
      this.$.pulseDuration = this._readPulseDurationAttribute();
    } else if (name === 'seed' && this._externalFrameDrive) {
      this._externalRenderState = null;
      this.presentFrame();
    }
  }

  /**
   * Persistent on/off state for host-controlled activity.
   * toggle(true) keeps animation running until explicit toggle(false).
   * @param {boolean} state
   */
  toggle(state) {
    let next = !!state;
    if (this._externalFrameDrive) {
      this._recordExternalPersistent(next);
      return;
    }
    if (this.$.active !== next) {
      this.$.active = next;
      return;
    }
    this._setPersistent(next);
  }

  setFrameDriver(mode = 'self') {
    let nextMode = String(mode || 'self').trim().toLowerCase();
    if (nextMode !== 'self' && nextMode !== 'external') {
      throw new TypeError('CellBg frame driver must be self or external');
    }
    if (nextMode === 'external') {
      if (!this._externalFrameDrive) {
        this._externalRestoreState = {
          toggled: Boolean(this._toggled),
          active: Boolean(this.$?.active),
          running: Boolean(this.running),
        };
      }
      this._externalFrameDrive = true;
      this.running = false;
      this.isAnimating = false;
      this.currentSpeed = 0;
      if (this._frameRequest !== null) cancelFrame(this._frameRequest);
      this._frameRequest = null;
      if (this._pulseTimer) clearTimeout(this._pulseTimer);
      if (this._resizeDebounce) clearTimeout(this._resizeDebounce);
      this._pulseTimer = null;
      this._resizeDebounce = null;
      this._externalRenderState = null;
      this.resize();
      return 'external';
    }

    if (!this._externalFrameDrive) return 'self';
    let restore = this._externalRestoreState || {};
    if (this._externalRenderFrame) {
      this.grid = new Uint8Array(this._externalRenderFrame.grid);
      this.radii = new Float32Array(this._externalRenderFrame.radii);
    }
    this._externalFrameDrive = false;
    this._externalRenderState = null;
    this._externalRenderFrame = null;
    this._externalRestoreState = null;
    this._toggled = Boolean(restore.toggled);
    this.$.active = Boolean(restore.active);
    this.running = false;
    this.isAnimating = false;
    this.currentSpeed = 0;
    this.lastTime = now();
    if (restore.running || restore.toggled || restore.active) this._start('frame-driver-restore');
    else this._draw();
    return 'self';
  }

  presentFrame() {
    if (!this._available) return false;
    this.resize();
    if (!this.canvas?._w || !this.canvas?._h) return false;
    if (!this._externalFrameDrive) {
      this._draw();
      return true;
    }
    let options = this._externalRenderOptions();
    this._externalRenderState = seekCellBgRenderState(this._externalRenderState, now(), options);
    this._externalRenderFrame = cellBgRenderFrame(this._externalRenderState);
    this._draw(this._externalRenderFrame);
    return true;
  }

  getFramePresentation() {
    if (!this._externalRenderState || !this._externalRenderFrame) return null;
    return {
      seed: this._externalRenderState.seed,
      width: this.canvas?._w || 0,
      height: this.canvas?._h || 0,
      cols: this._externalRenderState.cols,
      rows: this._externalRenderState.rows,
      cellSize: this._cellSize,
      stepMs: this._externalRenderState.stepMs,
      stepIndex: this._externalRenderState.stepIndex,
      timeMs: this._externalRenderState.timeMs,
      gridHash: cellBgRenderHash(this._externalRenderState, this._externalRenderFrame),
      activity: 'continuous',
      reducedMotion: false,
    };
  }

  _externalRenderOptions() {
    return {
      seed: this.getAttribute('seed') || 'symbiote-cell-bg',
      cols: this.cols,
      rows: this.rows,
      stepMs: this._stepMs,
      minRadius: this._minRadius,
      maxRadius: this._maxRadius,
      fadeRate: this._fadeRate,
    };
  }

  _recordExternalPersistent(state) {
    if (!this._externalRestoreState) return;
    let active = Boolean(state);
    this._externalRestoreState.toggled = active;
    this._externalRestoreState.active = active;
    this._externalRestoreState.running = active;
  }

  _setPersistent(state) {
    if (this._externalFrameDrive) {
      this._recordExternalPersistent(state);
      return;
    }
    this._toggled = !!state;
    if (state && this._pulseTimer) {
      clearTimeout(this._pulseTimer);
      this._pulseTimer = null;
    }
    if (state && this._prefersReducedMotion) {
      this._draw();
      return;
    }
    if (state) {
      this._start('persistent');
    } else if (!this._pulseTimer) {
      // Only stop if no active pulse timer
      this._stop('persistent');
    }
  }

  /**
   * Start persistent animation with smooth acceleration.
   */
  start() {
    this.toggle(true);
  }

  /**
   * Stop persistent or timed animation with smooth deceleration.
   */
  stop() {
    if (this._externalFrameDrive) {
      this._recordExternalPersistent(false);
      return;
    }
    if (this._pulseTimer) clearTimeout(this._pulseTimer);
    this._pulseTimer = null;
    this._toggled = false;
    if (this.$.active) {
      this.$.active = false;
    } else {
      this._setPersistent(false);
    }
    this._stop('manual');
  }

  suspendLayout({ reason = 'layout-suspend' } = {}) {
    if (this._externalFrameDrive) return;
    this._resumePersistentAfterSuspend = Boolean(this._toggled || this.$.active);
    if (this._pulseTimer) clearTimeout(this._pulseTimer);
    this._pulseTimer = null;
    let wasAnimating = this.running || this.isAnimating || this.currentSpeed > 0;
    this._toggled = false;
    this.running = false;
    this.currentSpeed = 0;
    this.isAnimating = false;
    this.$.active = false;
    if (wasAnimating) {
      this.dispatchEvent(new CustomEvent('cell-bg-animation-stop', {
        bubbles: true,
        composed: true,
        detail: { reason, smooth: false },
      }));
      this.dispatchEvent(new CustomEvent('cell-bg-animation-idle', {
        bubbles: true,
        composed: true,
        detail: { reason, smooth: false },
      }));
    }
  }

  resumeLayout() {
    if (this._externalFrameDrive) return;
    if (this._resumePersistentAfterSuspend) this.start();
    this._resumePersistentAfterSuspend = false;
  }

  /**
   * Timed pulse: start animation for `duration` ms then auto-stop.
   * Does NOT start if toggle is already active (animation already running).
   * Does NOT stop if toggle is active when timer expires.
   * @param {number} [duration=10000]
   */
  pulse(duration = 10000) {
    if (this._externalFrameDrive) return;
    if (this._toggled) return; // Already running persistently
    let safeDuration = this._normalizePulseDuration(duration);
    if (this._prefersReducedMotion) {
      this._draw();
      return;
    }
    if (this._pulseTimer) clearTimeout(this._pulseTimer);
    this.dispatchEvent(new CustomEvent('cell-bg-animation-trigger', {
      bubbles: true,
      composed: true,
      detail: { duration: safeDuration },
    }));
    this._start('pulse');
    this._pulseTimer = setTimeout(() => {
      this._pulseTimer = null;
      if (!this._toggled) this._stop('pulse');
    }, safeDuration);
  }

  /**
   * Trigger a timed animation pulse. Alias for hosts and WebMCP descriptors.
   * @param {number} [duration=10000]
   */
  trigger(duration = 10000) {
    this.pulse(duration ?? this.$.pulseDuration);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.ro) this.ro.disconnect();
    if (this._pulseTimer) clearTimeout(this._pulseTimer);
    if (this._resizeDebounce) clearTimeout(this._resizeDebounce);
    this._pulseTimer = null;
    this._resizeDebounce = null;
    if (this._frameRequest !== null) cancelFrame(this._frameRequest);
    this._frameRequest = null;
    this._themeObserver?.disconnect();
    this.ownerDocument?.removeEventListener?.('cascade-theme-change', this._themeChangeHandler);
    if (typeof this._motionQuery?.removeEventListener === 'function') {
      this._motionQuery.removeEventListener('change', this._motionChangeHandler);
    } else {
      this._motionQuery?.removeListener?.(this._motionChangeHandler);
    }
    this._removeResizeFallback?.();
    this._stop();
  }

  refreshTheme({ pulse = false } = {}) {
    let previousCellSize = this._cellSize;
    let previousMinRadius = this._minRadius;
    let previousMaxRadius = this._maxRadius;
    let previousStepMs = this._stepMs;
    let previousFadeRate = this._fadeRate;
    this._buildPalette();

    let geometryChanged = previousCellSize !== this._cellSize
      || previousMinRadius !== this._minRadius
      || previousMaxRadius !== this._maxRadius
      || previousStepMs !== this._stepMs
      || previousFadeRate !== this._fadeRate;
    if (geometryChanged) {
      if (this._externalFrameDrive) this._externalRenderState = null;
      this.resize({ force: true });
    } else {
      this._draw();
    }
    if (pulse) this.trigger(3000);
  }

  _scheduleThemeRefresh() {
    if (this._externalFrameDrive) {
      this.refreshTheme({ pulse: false });
      return;
    }
    if (this._themeRefreshQueued) return;
    this._themeRefreshQueued = true;
    requestFrame(() => {
      this._themeRefreshQueued = false;
      this.refreshTheme({ pulse: true });
    });
  }

  _readThemeMetrics() {
    this._applyThemeState();
  }

  _buildPalette() {
    this._applyThemeState();
  }

  _readAutoTriggerAttribute() {
    let value = this.getAttribute('auto-trigger');
    return value !== 'false' && value !== 'off';
  }

  _readPulseDurationAttribute() {
    return this._normalizePulseDuration(this.getAttribute('pulse-duration') || this.$.pulseDuration);
  }

  _normalizePulseDuration(duration) {
    let next = Number.parseFloat(duration);
    return Number.isFinite(next) && next > 0 ? Math.max(300, next) : 10000;
  }

  _triggerIfEnabled() {
    if (this._externalFrameDrive) return;
    if (this.$.autoTrigger === false) return;
    this.trigger(this.$.pulseDuration);
  }

  _applyThemeState() {
    let theme = readCellBgTheme(this, {
      readToken: readCssToken,
      readNumber: readCssNumber,
      normalizeColor: normalizeCssColor,
      parseRgb: parseCssRgb,
    });
    this._cellSize = theme.cellSize;
    this._minRadius = theme.minRadius;
    this._maxRadius = theme.maxRadius;
    this._stepMs = theme.stepMs;
    this._fadeRate = theme.fadeRate;
    this._bgFill = theme.bgFill;
    this.palette = theme.palette;
    return theme;
  }

  resize({ force = false } = {}) {
    if (!this._available || !this.canvas.parentElement) return;
    let dpr = globalThis.devicePixelRatio || 1;
    let w = this.canvas.parentElement.clientWidth;
    let h = this.canvas.parentElement.clientHeight;

    if (w === 0 || h === 0) return; // Hidden or not attached

    let sameSize = this.canvas._w === w && this.canvas._h === h;
    if (sameSize && !force && (!this._externalFrameDrive || this._externalRenderState)) return;

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.canvas._w = w;
    this.canvas._h = h;

    this._buildPalette();
    this.ctx.fillStyle = this._bgFill;
    this.ctx.fillRect(0, 0, w, h);

    let oldGrid = this.grid;
    let oldRadii = this.radii;
    let oldCols = this.cols;
    let oldRows = this.rows;

    this.cols = Math.ceil(w / this._cellSize) + 1;
    this.rows = Math.ceil(h / this._cellSize) + 1;

    if (this._externalFrameDrive) {
      this.grid = new Uint8Array(this.cols * this.rows);
      this.radii = new Float32Array(this.cols * this.rows);
      this.radii.fill(this._minRadius);
      this._externalRenderState = createCellBgRenderState(this._externalRenderOptions());
      this._externalRenderFrame = cellBgRenderFrame(this._externalRenderState);
      this._draw(this._externalRenderFrame);
      return;
    }

    this.grid = new Uint8Array(this.cols * this.rows);
    this.radii = new Float32Array(this.cols * this.rows);
    this.radii.fill(this._minRadius);

    if (oldGrid && oldGrid.length > 0) {
      let mc = Math.min(this.cols, oldCols);
      let mr = Math.min(this.rows, oldRows);
      for (let y = 0; y < mr; y++) {
        for (let x = 0; x < mc; x++) {
          this.grid[y * this.cols + x] = oldGrid[y * oldCols + x];
          this.radii[y * this.cols + x] = oldRadii[y * oldCols + x];
        }
      }
    } else {
      this._seedRandom();
    }

    // Draw one frame if not running
    if (!this.running) {
      this._draw();
    }
  }

  _seedRandom() {
    if (!this.grid || this.grid.length === 0) return;
    for (let i = 0; i < this.grid.length; i++) {
      this.grid[i] = Math.random() < 0.15 ? 1 : 0;
      if (this.grid[i]) this.radii[i] = this._minRadius;
    }
  }

  _start(reason = 'manual') {
    if (this._externalFrameDrive) return;
    if (!this._available) return;
    if (this.running) return;
    this.running = true;
    this.dispatchEvent(new CustomEvent('cell-bg-animation-start', {
      bubbles: true,
      composed: true,
      detail: { reason },
    }));
    if (!this.isAnimating) {
      this.lastTime = now();
      this.isAnimating = true;
      this._scheduleFrame();
    }
  }

  _stop(reason = 'manual') {
    if (this._externalFrameDrive) return;
    if (!this.running) return;
    this.running = false;
    this.dispatchEvent(new CustomEvent('cell-bg-animation-stop', {
      bubbles: true,
      composed: true,
      detail: { reason, smooth: true },
    }));
    // Loop will smoothly decelerate and stop in renderLoop
  }

  _scheduleFrame() {
    if (this._externalFrameDrive || this._frameRequest !== null) return;
    this._frameRequest = requestFrame(this.renderLoop);
  }

  _step() {
    if (!this.cols || !this.rows) return;
    let len = this.cols * this.rows;
    let next = new Uint8Array(len);
    let changed = 0;

    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            let nx = (x + dx + this.cols) % this.cols;
            let ny = (y + dy + this.rows) % this.rows;
            neighbors += this.grid[ny * this.cols + nx];
          }
        }

        let idx = y * this.cols + x;
        let alive = this.grid[idx];

        if (alive) {
          next[idx] = RULE_S.includes(neighbors) ? 1 : 0;
        } else {
          next[idx] = RULE_B.includes(neighbors) ? 1 : 0;
        }
        if (next[idx] !== alive) changed++;
      }
    }
    this.grid = next;

    // Stagnation detector: if < 2% of cells changed for 5 consecutive steps, inject noise
    let threshold = len * 0.02;
    if (changed < threshold) {
      this._stagnantCount++;
      if (this._stagnantCount >= 5) {
        this._injectNoise();
        this._stagnantCount = 0;
      }
    } else {
      this._stagnantCount = 0;
    }
  }

  /**
   * Inject random live cells into a random rectangular region
   * to break stagnation without resetting the entire grid.
   */
  _injectNoise() {
    let regionW = Math.max(4, (this.cols * 0.3) | 0);
    let regionH = Math.max(4, (this.rows * 0.3) | 0);
    let startX = (Math.random() * Math.max(1, this.cols - regionW)) | 0;
    let startY = (Math.random() * Math.max(1, this.rows - regionH)) | 0;
    for (let y = startY; y < startY + regionH; y++) {
      for (let x = startX; x < startX + regionW; x++) {
        if (Math.random() < 0.15) {
          let idx = y * this.cols + x;
          this.grid[idx] = 1;
          this.radii[idx] = this._minRadius;
        }
      }
    }
  }

  renderLoop(ts) {
    this._frameRequest = null;
    if (this._externalFrameDrive) return;
    if (!this.isAnimating) return;

    let time = now();
    let dt = Math.min(time - this.lastTime, 100); // clamp dt to prevent huge jumps
    this.lastTime = time;

    // Smoothly accelerate/decelerate
    let targetSpeed = this.running ? 1.0 : 0.0;
    let speedBlend = 1 - Math.pow(1 - 0.03, dt / (1000 / 60));
    this.currentSpeed += (targetSpeed - this.currentSpeed) * speedBlend;

    // If we're fully stopped and radii have faded (we just wait for speed to drop near 0)
    if (!this.running && this.currentSpeed < 0.005) {
      this.currentSpeed = 0;
      this.isAnimating = false;
      this.dispatchEvent(new CustomEvent('cell-bg-animation-idle', {
        bubbles: true,
        composed: true,
        detail: { smooth: true },
      }));
    }

    // Accumulate effective time for cellular automaton steps
    this.accumulator += dt * this.currentSpeed;

    let maxSteps = 5;
    while (this.accumulator >= this._stepMs && maxSteps > 0) {
      this._step();
      this.accumulator -= this._stepMs;
      maxSteps--;
    }

    this._advanceLiveRadii(dt);
    this._draw();

    if (this.isAnimating) {
      this._scheduleFrame();
    }
  }

  _advanceLiveRadii(elapsedMs) {
    let frames = Math.max(0, Number(elapsedMs) || 0) / (1000 / 60);
    for (let index = 0; index < this.radii.length; index += 1) {
      let alive = this.grid[index] === 1;
      let target = alive ? this._maxRadius : this._minRadius;
      let factor = alive ? 0.2 : this._fadeRate;
      this.radii[index] = target + (this.radii[index] - target) * Math.pow(1 - factor, frames);
    }
  }

  _draw(frame = null) {
    if (!this._available || !this.canvas._w) return;
    let w = this.canvas._w;
    let h = this.canvas._h;
    let radii = frame?.radii || this.radii;

    this.ctx.clearRect(0, 0, w, h);
    this.ctx.fillStyle = this._bgFill;
    this.ctx.fillRect(0, 0, w, h);

    let maxIdx = PALETTE_SIZE - 1;

    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        let idx = y * this.cols + x;
        let r = radii[idx];
        let cx = x * this._cellSize;
        let cy = y * this._cellSize;

        let t = (r - this._minRadius) / (this._maxRadius - this._minRadius);
        if (t < 0) t = 0;
        if (t > 1) t = 1;

        let pi = (t * maxIdx + 0.5) | 0;

        this.ctx.beginPath();
        this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
        this.ctx.fillStyle = this.palette[pi];
        this.ctx.fill();
      }
    }
  }
}

CellBg.template = template;
CellBg.rootStyles = css;
CellBg.reg('cell-bg');
