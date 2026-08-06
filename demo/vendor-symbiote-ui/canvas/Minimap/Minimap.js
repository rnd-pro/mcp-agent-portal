/* eslint-env browser */
/**
 * Minimap — small overview of the entire node graph
 *
 * Shows a scaled-down view of all nodes and connections.
 * The viewport rectangle shows current visible area and can be dragged to pan.
 * Positioned bottom-right of the canvas.
 *
 * @module symbiote-ui/canvas/Minimap
 */

import Symbiote from '@symbiotejs/symbiote';
import { template } from './Minimap.tpl.js';
import { styles } from './Minimap.css.js';

export class Minimap extends Symbiote {
  init$ = {
    visible: true,
  };

  /** @type {HTMLCanvasElement|null} */
  #canvas2d = null;

  /** @type {CanvasRenderingContext2D|null} */
  #ctx = null;

  /** @type {function|null} */
  #getState = null;

  /** @type {boolean} */
  #isDragging = false;

  /** @type {number} */
  #rafId = 0;

  renderCallback() {
    this.#canvas2d = this.querySelector('canvas');
    this.#ctx = this.#canvas2d?.getContext('2d');


    this.#canvas2d?.addEventListener('pointerdown', (e) => this.#onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.#onPointerMove(e));
    window.addEventListener('pointerup', () => this.#onPointerUp());
  }

  /**
   * Set state getter for reading canvas state
   * @param {function} fn - returns { nodes, transform, containerSize }
   */
  setStateGetter(fn) {
    this.#getState = fn;
    this.#startLoop();
  }

  #startLoop() {
    let draw = () => {
      this.#draw();
      this.#rafId = requestAnimationFrame(draw);
    };
    this.#rafId = requestAnimationFrame(draw);
  }

  #draw() {
    let ctx = this.#ctx;
    let canvas = this.#canvas2d;
    if (!ctx || !canvas || !this.#getState) return;

    let state = this.#getState();
    if (!state) return;

    let { nodes, transform, containerSize } = state;
    let w = canvas.width;
    let h = canvas.height;


    let cs = getComputedStyle(this);
    let bgColor = cs.getPropertyValue('--sn-minimap-bg').trim();
    let nodeColor = cs.getPropertyValue('--sn-minimap-node').trim();
    let nodeStroke =
      cs.getPropertyValue('--sn-minimap-node-stroke').trim() ||
      cs.getPropertyValue('--sn-sys-outline').trim();
    let bypassedNodeColor = cs.getPropertyValue('--sn-minimap-bypassed-node').trim();
    let vpStroke = cs.getPropertyValue('--sn-minimap-viewport').trim();
    let vpFill = cs.getPropertyValue('--sn-minimap-viewport-fill').trim();


    ctx.clearRect(0, 0, w, h);


    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    if (nodes.length === 0) return;


    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + (n.width || 200));
      maxY = Math.max(maxY, n.y + (n.height || 100));
    }


    let pad = 100;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;

    let graphW = maxX - minX;
    let graphH = maxY - minY;


    let scaleX = w / graphW;
    let scaleY = h / graphH;
    let scale = Math.min(scaleX, scaleY);

    let offsetX = (w - graphW * scale) / 2;
    let offsetY = (h - graphH * scale) / 2;


    this._mapMinX = minX;
    this._mapMinY = minY;
    this._mapScale = scale;
    this._mapOffsetX = offsetX;
    this._mapOffsetY = offsetY;


    for (const n of nodes) {
      let x = (n.x - minX) * scale + offsetX;
      let y = (n.y - minY) * scale + offsetY;
      let nw = (n.width || 200) * scale;
      let nh = (n.height || 80) * scale;

      ctx.fillStyle = n.bypassed ? bypassedNodeColor : nodeColor;
      ctx.fillRect(x, y, nw, nh);
      ctx.strokeStyle = nodeStroke;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, nw, nh);
    }


    if (containerSize && transform) {
      let vx = (-transform.x / transform.zoom - minX) * scale + offsetX;
      let vy = (-transform.y / transform.zoom - minY) * scale + offsetY;
      let vw = (containerSize.width / transform.zoom) * scale;
      let vh = (containerSize.height / transform.zoom) * scale;

      ctx.strokeStyle = vpStroke;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(vx, vy, vw, vh);
      ctx.fillStyle = vpFill;
      ctx.fillRect(vx, vy, vw, vh);
    }
  }

  #onPointerDown(e) {
    this.#isDragging = true;
    this.#navigateTo(e);
    e.preventDefault();
  }

  #onPointerMove(e) {
    if (!this.#isDragging) return;
    this.#navigateTo(e);
  }

  #onPointerUp() {
    this.#isDragging = false;
  }

  #navigateTo(e) {
    if (!this.#getState || !this.#canvas2d) return;
    let rect = this.#canvas2d.getBoundingClientRect();
    let mx = e.clientX - rect.left;
    let my = e.clientY - rect.top;

    let state = this.#getState();
    if (!state?.containerSize || !state?.transform) return;


    let graphX = (mx - this._mapOffsetX) / this._mapScale + this._mapMinX;
    let graphY = (my - this._mapOffsetY) / this._mapScale + this._mapMinY;


    let zoom = state.transform.zoom;
    let newX = -(graphX * zoom - state.containerSize.width / 2);
    let newY = -(graphY * zoom - state.containerSize.height / 2);


    this.dispatchEvent(
      new CustomEvent('minimap-navigate', {
        detail: { x: newX, y: newY },
        bubbles: true,
      })
    );
  }

  destroyCallback() {
    cancelAnimationFrame(this.#rafId);
  }
}

Minimap.template = template;
Minimap.rootStyles = styles;
Minimap.reg('node-minimap');
