/* eslint-env browser */
/**
 * FrameManager.js
 *
 * Handles DOM creation, dragging, resizing, and child node containment
 * for GraphFrame elements on the canvas.
 *
 * @module symbiote-ui/canvas/FrameManager
 */

import { Drag } from '../interactions/Drag.js';

export class FrameManager {
  /** @type {Map<string, HTMLElement>} */
  #frameViews = new Map();

  /** @type {Map<string, HTMLElement>} */
  #nodeViews;

  /** @type {import('../core/Editor.js').NodeEditor} */
  #editor;

  /** @type {import('./NodeCanvas/NodeCanvas.js').NodeCanvas} */
  #canvas;

  /** @type {function} */
  #setNodePosition;

  /**
   * @param {object} options
   * @param {Map<string, HTMLElement>} options.nodeViews
   * @param {import('../core/Editor.js').NodeEditor} options.editor
   * @param {import('./NodeCanvas/NodeCanvas.js').NodeCanvas} options.canvas
   * @param {function(string, number, number): void} options.setNodePosition
   */
  constructor({ nodeViews, editor, canvas, setNodePosition }) {
    this.#nodeViews = nodeViews;
    this.#editor = editor;
    this.#canvas = canvas;
    this.#setNodePosition = setNodePosition;
  }

  /**
   * Remove all frame views and destroy their interactions
   */
  clear() {
    for (const [, el] of this.#frameViews) {
      if (el._drag) el._drag.destroy();
      if (el._resizeDrag) el._resizeDrag.destroy();
      el.remove();
    }
    this.#frameViews.clear();
  }

  /**
   * Set frame position
   * @param {string} frameId
   * @param {number} x
   * @param {number} y
   */
  setPosition(frameId, x, y) {
    let el = this.#frameViews.get(frameId);
    if (!el) return;
    el.style.transform = `translate(${x}px, ${y}px)`;
    el._position = { x, y };
    let frame = this.#editor?.getFrame(frameId);
    if (frame) {
      frame.x = x;
      frame.y = y;
    }
  }

  /**
   * Set frame size
   * @param {string} frameId
   * @param {number} w
   * @param {number} h
   */
  setSize(frameId, w, h) {
    let el = this.#frameViews.get(frameId);
    if (!el) return;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    let frame = this.#editor?.getFrame(frameId);
    if (frame) {
      frame.width = w;
      frame.height = h;
    }
  }

  /**
   * Get node IDs that are spatially inside a frame
   * @param {string} frameId
   * @returns {string[]}
   */
  #getNodesInFrame(frameId) {
    let el = this.#frameViews.get(frameId);
    if (!el) return [];
    let fp = el._position;
    let fw = parseFloat(el.style.width) || el._frameData?.width || 400;
    let fh = parseFloat(el.style.height) || el._frameData?.height || 300;
    let ids = [];
    for (const [nodeId, nodeEl] of this.#nodeViews) {
      let np = nodeEl._position;
      if (np && np.x >= fp.x && np.y >= fp.y && np.x <= fp.x + fw && np.y <= fp.y + fh) {
        ids.push(nodeId);
      }
    }
    return ids;
  }

  /**
   * Create frame DOM element with drag and resize
   * @param {import('../core/Frame.js').Frame} frame
   */
  addView(frame) {
    let el = document.createElement('graph-frame');
    el.style.position = 'absolute';
    el.style.width = `${frame.width}px`;
    el.style.height = `${frame.height}px`;
    el.style.transform = `translate(${frame.x}px, ${frame.y}px)`;
    el._position = { x: frame.x, y: frame.y };
    el._frameData = frame;
    el.setAttribute('frame-id', frame.id);


    el.style.setProperty('--frame-color', frame.color);


    requestAnimationFrame(() => {
      if (el.$) {
        el.$.label = frame.label;
        el.$.color = frame.color;
      } else {

        let labelEl = el.querySelector('.sn-frame-label');
        if (labelEl) labelEl.textContent = frame.label;
      }
    });


    let drag = new Drag();
    let childStartPositions = null;
    let frameStartPos = null;

    drag.initialize(
      el,
      {
        getPosition: () => el._position,
        getZoom: () => this.#canvas.$.zoom,
      },
      {
        onStart: () => {
          frameStartPos = { ...el._position };

          let nodeIds = this.#getNodesInFrame(frame.id);
          childStartPositions = new Map();
          for (const nid of nodeIds) {
            let nel = this.#nodeViews.get(nid);
            if (nel && nel._position) childStartPositions.set(nid, { ...nel._position });
          }
        },
        onTranslate: (x, y) => {

          if (childStartPositions && frameStartPos) {
            let dx = x - frameStartPos.x;
            let dy = y - frameStartPos.y;
            for (const [nid, startPos] of childStartPositions) {
              this.#setNodePosition(nid, startPos.x + dx, startPos.y + dy);
            }
          }
          this.setPosition(frame.id, x, y);
        },
        onDrop: () => {
          childStartPositions = null;
          frameStartPos = null;
        },
      }
    );
    el._drag = drag;


    requestAnimationFrame(() => {
      let handle = el.ref?.resizeHandle;
      if (handle) {
        let resizeDrag = new Drag();
        resizeDrag.initialize(
          handle,
          {
            getPosition: () => ({ x: frame.width, y: frame.height }),
            getZoom: () => this.#canvas.$.zoom,
          },
          {
            onTranslate: (x, y) => {
              let w = Math.max(120, x);
              let h = Math.max(80, y);
              this.setSize(frame.id, w, h);
            },
          }
        );
        el._resizeDrag = resizeDrag;
      }
    });

    this.#canvas.ref.framesLayer.appendChild(el);
    this.#frameViews.set(frame.id, el);
  }

  /**
   * Remove frame DOM element
   * @param {import('../core/Frame.js').Frame} frame
   */
  removeView(frame) {
    let el = this.#frameViews.get(frame.id);
    if (!el) return;
    if (el._drag) el._drag.destroy();
    if (el._resizeDrag) el._resizeDrag.destroy();
    el.remove();
    this.#frameViews.delete(frame.id);
  }
}

export { FrameManager as default };
