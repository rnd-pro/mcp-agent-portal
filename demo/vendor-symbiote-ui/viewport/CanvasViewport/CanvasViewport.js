/**
 * CanvasViewport — Preview/Composition viewport component.
 *
 * Renders a composition (layers of shapes, text, images) to a canvas
 * at configurable resolution and aspect ratio. Supports frame-by-frame
 * scrubbing from a connected timeline.
 *
 * @element sn-canvas-viewport
 *
 * Events:
 * - viewport-frame: { frame: number }
 * - viewport-resize: { width: number, height: number, aspect: string }
 */

import Symbiote from '@symbiotejs/symbiote';
import { canvasViewportTemplate } from './CanvasViewport.tpl.js';
import css from './CanvasViewport.css.js';

let ASPECT_RATIOS = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1': 1,
  '4:3': 4 / 3,
  '21:9': 21 / 9,
};

let RESOLUTIONS = {
  '1920x1080': [1920, 1080],
  '1280x720': [1280, 720],
  '1080x1920': [1080, 1920],
  '1080x1080': [1080, 1080],
  '3840x2160': [3840, 2160],
};

function emit(el, type, detail = {}) {
  el.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
}

export class CanvasViewport extends Symbiote {

  /** @type {{ width: number, height: number, fps: number, duration: number, layers: Array }} */
  #composition = null;

  /** @type {number} Current frame */
  #frame = 0;

  /** @type {string} Current aspect ratio key */
  #aspect = '16:9';

  /** @type {number[]} Canvas resolution */
  #resolution = [1920, 1080];

  /** @type {number} Display scale */
  #scale = 1;

  /** @type {ResizeObserver} */
  #resizeObserver = null;

  init$ = {
    hasData: false,
    zoomLabel: '100%',
    frameLabel: 'F: 0',

    aspectChange: (e) => {
      let value = e.target.value;
      if (ASPECT_RATIOS[value]) {
        this.#aspect = value;
        this.#updateResolutionFromAspect();
        this.#fitToContainer();
        this.#render();
        emit(this, 'viewport-resize', {
          width: this.#resolution[0],
          height: this.#resolution[1],
          aspect: this.#aspect,
        });
      }
    },

    resChange: (e) => {
      let value = e.target.value;
      if (RESOLUTIONS[value]) {
        this.#resolution = [...RESOLUTIONS[value]];
        this.#fitToContainer();
        this.#render();
        emit(this, 'viewport-resize', {
          width: this.#resolution[0],
          height: this.#resolution[1],
          aspect: this.#aspect,
        });
      }
    },
  };

  connectedCallback() {
    super.connectedCallback?.();
    this.addEventListener('click', this.#onClick);

    this.#resizeObserver = new ResizeObserver(() => {
      this.#fitToContainer();
    });
    this.#resizeObserver.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    this.removeEventListener('click', this.#onClick);
    this.#resizeObserver?.disconnect();
  }

  #onClick = (e) => {
    let btn = e.target.closest('[data-action]');
    if (!btn) return;

    switch (btn.dataset.action) {
      case 'safe-zone':
        this.toggleAttribute('show-safe-zone');
        break;
      case 'zoom-fit':
        this.#fitToContainer();
        break;
      case 'zoom-100':
        this.#setScale(1);
        break;
    }
  };

  // ── Public API ──

  /**
   * Load a composition.
   * @param {{ width?: number, height?: number, fps?: number, duration?: number, background?: string, layers: Array<{ type: 'rect'|'text'|'circle'|'image', x: number, y: number, width?: number, height?: number, radius?: number, color?: string, text?: string, fontSize?: number, fontFamily?: string, src?: string, opacity?: number, startFrame?: number, endFrame?: number }> }} comp
   */
  loadComposition(comp) {
    this.#composition = comp;
    if (comp.width && comp.height) {
      this.#resolution = [comp.width, comp.height];
    }
    this.#frame = 0;
    this.$.hasData = true;

    requestAnimationFrame(() => {
      this.#fitToContainer();
      this.#render();
    });
  }

  /** Set current frame (e.g. from timeline sync) */
  setFrame(frame) {
    this.#frame = frame;
    this.$.frameLabel = `F: ${frame}`;
    this.#render();
    emit(this, 'viewport-frame', { frame });
  }

  /** Get current frame */
  get currentFrame() {
    return this.#frame;
  }

  /** Get resolution */
  get resolution() {
    return [...this.#resolution];
  }

  // ── Internal ──

  #updateResolutionFromAspect() {
    let ratio = ASPECT_RATIOS[this.#aspect] || 16 / 9;
    let h = this.#resolution[1];
    this.#resolution = [Math.round(h * ratio), h];
  }

  #fitToContainer() {
    let wrap = this.querySelector('.vp-canvas-wrap');
    if (!wrap) return;
    let available = {
      w: wrap.clientWidth - 40,
      h: wrap.clientHeight - 40,
    };
    let [rw, rh] = this.#resolution;
    let scaleW = available.w / rw;
    let scaleH = available.h / rh;
    let scale = Math.min(scaleW, scaleH, 1);
    this.#setScale(scale);
  }

  #setScale(scale) {
    this.#scale = scale;
    let [rw, rh] = this.#resolution;
    let dw = Math.round(rw * scale);
    let dh = Math.round(rh * scale);
    this.set$({
      zoomLabel: `${Math.round(scale * 100)}%`,
    });

    let frame = this.ref.canvasFrame;
    if (frame) {
      frame.style.width = dw + 'px';
      frame.style.height = dh + 'px';
    }

    let canvas = this.ref.viewport;
    if (canvas) {
      let dpr = window.devicePixelRatio || 1;
      canvas.width = rw * dpr;
      canvas.height = rh * dpr;
      canvas.style.width = dw + 'px';
      canvas.style.height = dh + 'px';
    }
    this.#render();
  }

  #render() {
    let canvas = this.ref.viewport;
    if (!canvas || !this.#composition) return;

    let ctx = canvas.getContext('2d');
    let dpr = window.devicePixelRatio || 1;
    let [w, h] = this.#resolution;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = this.#composition.background || '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    // Render layers
    for (let layer of this.#composition.layers) {
      // Frame visibility
      if (layer.startFrame != null && this.#frame < layer.startFrame) continue;
      if (layer.endFrame != null && this.#frame > layer.endFrame) continue;

      ctx.save();
      if (layer.opacity != null) ctx.globalAlpha = layer.opacity;

      switch (layer.type) {
        case 'rect':
          ctx.fillStyle = layer.color || '#ffffff';
          ctx.fillRect(layer.x, layer.y, layer.width || 100, layer.height || 100);
          break;

        case 'circle':
          ctx.fillStyle = layer.color || '#ffffff';
          ctx.beginPath();
          ctx.arc(layer.x, layer.y, layer.radius || 50, 0, Math.PI * 2);
          ctx.fill();
          break;

        case 'text':
          ctx.fillStyle = layer.color || '#ffffff';
          ctx.font = `${layer.fontSize || 48}px ${layer.fontFamily || 'Inter, sans-serif'}`;
          ctx.textBaseline = 'top';
          ctx.fillText(layer.text || '', layer.x, layer.y);
          break;

        case 'gradient':
          let grd = ctx.createLinearGradient(
            layer.x, layer.y,
            layer.x + (layer.width || w),
            layer.y + (layer.height || h)
          );
          let stops = layer.stops || [
            [0, 'hsl(220 60% 30%)'],
            [1, 'hsl(280 60% 30%)'],
          ];
          for (let [offset, color] of stops) {
            grd.addColorStop(offset, color);
          }
          ctx.fillStyle = grd;
          ctx.fillRect(layer.x, layer.y, layer.width || w, layer.height || h);
          break;
      }

      ctx.restore();
    }
  }
}

CanvasViewport.template = canvasViewportTemplate;
CanvasViewport.rootStyles = css;
CanvasViewport.reg('sn-canvas-viewport');

export default CanvasViewport;
