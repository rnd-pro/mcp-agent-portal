import { Symbiote } from '@symbiotejs/symbiote';
import template from './CellBg.tpl.js';
import css from './CellBg.css.js';

/**
 * Cellular Automaton Background Component
 * Parameters based on user config:
 * Rule: Conway B3/S23
 * Cell Size: 14px
 * Speed: 75ms
 * Min Radius: 2px
 * Max Radius: 4px
 * Fade Rate: 4%
 * BG Color: #1a1a1a
 * Dot Color: #ffffff
 */

const RULE_B = [3];
const RULE_S = [2, 3];
const CELL_SIZE = 14;
const STEP_MS = 75;
const MIN_RADIUS = 2;
const MAX_RADIUS = 4;
const FADE_RATE = 0.04;
const BG_COLOR = '#1a1a1a';
const DOT_COLOR = [209, 209, 209];
const BASE_ALPHA = 0.06;

const PALETTE_SIZE = 32;

export class CellBg extends Symbiote {
  init$ = {
    active: false,
  };

  initCallback() {
    this.canvas = this.ref.canvas;
    this.ctx = this.canvas.getContext('2d');
    
    this._buildPalette();

    this.cols = 0;
    this.rows = 0;
    this.grid = new Uint8Array(0);
    this.radii = new Float32Array(0);
    this.running = false;
    this.stepTimer = null;
    this.lastDrawTime = 0;
    this._stagnantCount = 0;

    // We only redraw on rAF if running, or if a single frame is needed after resize
    this.resize = this.resize.bind(this);
    this.renderLoop = this.renderLoop.bind(this);
    
    // Use ResizeObserver to catch layout panel resizing (not just window resizes)
    // Debounce: resize canvas immediately (prevents flash), pulse only after settle
    this.ro = new ResizeObserver(() => {
      this.resize();
      // Debounced pulse: only after resize stops for 300ms
      if (this._resizeDebounce) clearTimeout(this._resizeDebounce);
      this._resizeDebounce = setTimeout(() => {
        this._resizeDebounce = null;
        this.pulse(10000);
      }, 300);
    });
    
    // Defer observation to allow DOM to settle
    setTimeout(() => {
      this.ro.observe(this);
      this.resize();
      this._seedRandom();
    }, 0);

    this.sub('active', (val) => {
      this.toggle(!!val);
    });
  }

  /**
   * Persistent on/off — used for chat processing state.
   * toggle(true) keeps animation running until explicit toggle(false).
   * @param {boolean} state
   */
  toggle(state) {
    this._toggled = !!state;
    if (state) {
      this._start();
    } else if (!this._pulseTimer) {
      // Only stop if no active pulse timer
      this._stop();
    }
  }

  /**
   * Timed pulse — start animation for `duration` ms then auto-stop.
   * Does NOT start if toggle is already active (animation already running).
   * Does NOT stop if toggle is active when timer expires.
   * @param {number} [duration=10000]
   */
  pulse(duration = 10000) {
    if (this._toggled) return; // Already running persistently
    if (this._pulseTimer) clearTimeout(this._pulseTimer);
    this._start();
    this._pulseTimer = setTimeout(() => {
      this._pulseTimer = null;
      if (!this._toggled) this._stop();
    }, duration);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.ro) this.ro.disconnect();
    this._stop();
  }

  _buildPalette() {
    let bg = BG_COLOR;
    let br = parseInt(bg.slice(1, 3), 16) || 0;
    let bgG = parseInt(bg.slice(3, 5), 16) || 0;
    let bb = parseInt(bg.slice(5, 7), 16) || 0;

    this.palette = [];
    for (let i = 0; i < PALETTE_SIZE; i++) {
      let t = i / (PALETTE_SIZE - 1);
      let alpha = BASE_ALPHA + t * 0.18;
      let r = Math.round(br * (1 - alpha) + DOT_COLOR[0] * alpha);
      let g = Math.round(bgG * (1 - alpha) + DOT_COLOR[1] * alpha);
      let b = Math.round(bb * (1 - alpha) + DOT_COLOR[2] * alpha);
      this.palette.push(`#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`);
    }
  }

  resize() {
    if (!this.canvas.parentElement) return;
    let dpr = window.devicePixelRatio || 1;
    let w = this.canvas.parentElement.clientWidth;
    let h = this.canvas.parentElement.clientHeight;
    
    if (w === 0 || h === 0) return; // Hidden or not attached

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.canvas._w = w;
    this.canvas._h = h;

    // Immediately fill with BG color to prevent CSS background flash
    this.ctx.fillStyle = BG_COLOR;
    this.ctx.fillRect(0, 0, w, h);

    let oldGrid = this.grid;
    let oldRadii = this.radii;
    let oldCols = this.cols;
    let oldRows = this.rows;

    this.cols = Math.ceil(w / CELL_SIZE) + 1;
    this.rows = Math.ceil(h / CELL_SIZE) + 1;

    this.grid = new Uint8Array(this.cols * this.rows);
    this.radii = new Float32Array(this.cols * this.rows);
    this.radii.fill(MIN_RADIUS);

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
      if (this.grid[i]) this.radii[i] = MIN_RADIUS;
    }
  }

  _start() {
    if (this.running) return;
    this.running = true;
    this.stepTimer = setInterval(() => this._step(), STEP_MS);
    requestAnimationFrame(this.renderLoop);
  }

  _stop() {
    if (!this.running) return;
    this.running = false;
    if (this.stepTimer) clearInterval(this.stepTimer);
    this.stepTimer = null;
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
    let startX = (Math.random() * (this.cols - regionW)) | 0;
    let startY = (Math.random() * (this.rows - regionH)) | 0;
    for (let y = startY; y < startY + regionH; y++) {
      for (let x = startX; x < startX + regionW; x++) {
        if (Math.random() < 0.15) {
          let idx = y * this.cols + x;
          this.grid[idx] = 1;
          this.radii[idx] = MIN_RADIUS;
        }
      }
    }
  }

  renderLoop(ts) {
    if (!this.running) return;
    this._draw();
    requestAnimationFrame(this.renderLoop);
  }

  _draw() {
    if (!this.canvas._w) return;
    let w = this.canvas._w;
    let h = this.canvas._h;
    
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.fillStyle = BG_COLOR;
    this.ctx.fillRect(0, 0, w, h);

    let maxIdx = PALETTE_SIZE - 1;

    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        let idx = y * this.cols + x;
        let alive = this.grid[idx];

        let targetR = alive ? MAX_RADIUS : MIN_RADIUS;
        let currentR = this.radii[idx];

        if (alive) {
          this.radii[idx] = currentR + (targetR - currentR) * 0.2;
        } else {
          this.radii[idx] = currentR + (targetR - currentR) * FADE_RATE;
        }

        let r = this.radii[idx];
        let cx = x * CELL_SIZE;
        let cy = y * CELL_SIZE;

        let t = (r - MIN_RADIUS) / (MAX_RADIUS - MIN_RADIUS);
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
