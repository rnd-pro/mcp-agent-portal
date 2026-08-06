/* eslint-env browser */
export class PinExpansion {
  /** @type {import('./NodeCanvas/NodeCanvas.js').NodeCanvas} */
  #canvas;

  /** @type {Map<string, Array<object>>} Cache of pins per nodeId */
  #pinCache = new Map();

  /** @type {Function} Callback when a pin is clicked */
  #onPinClick;

  /**
   * @param {import('./NodeCanvas/NodeCanvas.js').NodeCanvas} canvas
   * @param {object} config
   * @param {Function} [config.onPinClick]
   */
  constructor(canvas, { onPinClick } = {}) {
    this.#canvas = canvas;
    this.#onPinClick = onPinClick || (() => {});
  }

  /**
   * Add pins data for a specific node
   * @param {string} nodeId
   * @param {Array<object>} pins
   */
  setPins(nodeId, pins) {
    if (pins && pins.length > 0) {
      this.#pinCache.set(nodeId, pins);
    } else {
      this.#pinCache.delete(nodeId);
    }
  }

  clearPins() {
    this.#pinCache.clear();
  }

  /**
   * Remove pins and overlay for a node
   * @param {string} nodeId
   */
  removePins(nodeId) {
    this.#pinCache.delete(nodeId);
    let el = this.#canvas.getNodeView?.(nodeId);
    if (!el) return;
    let overlay = el.querySelector('.pcb-pin-overlay');
    if (overlay) overlay.remove();
  }

  /**
   * Apply LOD state to render or hide pins
   * @param {'expanded'|'collapsed'} lod
   */
  applyLOD(lod) {
    if (!this.#canvas) return;

    for (const [nodeId, pins] of this.#pinCache) {
      let el = this.#canvas.getNodeView?.(nodeId);
      if (!el) continue;

      if (lod === 'expanded') {
        this.#renderPinsForNode(el, pins);
      } else {
        let overlay = el.querySelector('.pcb-pin-overlay');
        if (overlay) overlay.removeAttribute('data-visible');
      }
    }
  }

  /**
   * Render pin labels around a node element's border
   * @param {HTMLElement} el
   * @param {Array<object>} pins
   * @returns {void}
   */
  #renderPinsForNode(el, pins) {
    if (!pins || pins.length === 0) return;


    let overlay = el.querySelector('.pcb-pin-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'pcb-pin-overlay';
      el.appendChild(overlay);
    }


    if (overlay.children.length === 0) {
      let maxPins = Math.min(pins.length, 12);
      let half = Math.ceil(maxPins / 2);
      let nodeId = el.getAttribute('node-id');

      let createPinEl = (pin, side, yPct) => {
        let pinEl = document.createElement('span');
        pinEl.className = 'pcb-pin';
        pinEl.setAttribute('data-side', side);
        if (pin.kind) pinEl.setAttribute('data-kind', pin.kind);

        let suffix = pin.line ? ` :${pin.line}` : '';
        let label = pin.label || pin.name || '';
        pinEl.textContent = label + suffix;
        pinEl.style.top = `${yPct}%`;

        if (pin.interactable !== false) {
          pinEl.style.cursor = 'pointer';
          pinEl.title =
            pin.tooltip || (pin.line ? `${pin.file || ''}:${pin.line}` : pin.file || '');
          pinEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.#onPinClick(pin, nodeId);
          });
        }

        return pinEl;
      };


      for (let i = 0; i < half; i++) {
        let yPct = ((i + 1) / (half + 1)) * 100;
        overlay.appendChild(createPinEl(pins[i], 'right', yPct));
      }


      for (let i = half; i < maxPins; i++) {
        let yPct = ((i - half + 1) / (maxPins - half + 1)) * 100;
        overlay.appendChild(createPinEl(pins[i], 'left', yPct));
      }
    }


    requestAnimationFrame(() => overlay.setAttribute('data-visible', ''));
  }
}
