/**
 * Drag handler — pointer-based drag with zoom compensation
 *
 * Adapted from Rete.js area-plugin/drag.ts (86 LOC).
 * Handles both canvas panning and node dragging.
 *
 * @module symbiote-ui/interactions/Drag
 */

export class Drag {
  /** @type {{ x: number, y: number }|null} */
  #pointerStart = null;

  /** @type {{ x: number, y: number }|null} */
  #startPosition = null;

  /** @type {function|null} */
  #onTranslate = null;

  /** @type {function|null} */
  #onStart = null;

  /** @type {function|null} */
  #onDrop = null;

  /** @type {function} */
  #getZoom = () => 1;

  /** @type {function} */
  #getPosition = () => ({ x: 0, y: 0 });

  /** @type {HTMLElement|null} */
  #element = null;

  /** @type {function|null} - optional hit-test before starting drag */
  #shouldStart = null;

  /**
   * Initialize drag handler on element
   * @param {HTMLElement} element - Element to attach drag to
   * @param {object} config
   * @param {function} config.getPosition - Returns current {x, y}
   * @param {function} config.getZoom - Returns current zoom level
   * @param {object} callbacks
   * @param {function} callbacks.onStart - Called on drag start
   * @param {function} callbacks.onTranslate - Called with (x, y) during drag
   * @param {function} callbacks.onDrop - Called on drag end
   */
  initialize(element, config, callbacks) {
    this.#element = element;
    this.#getPosition = config.getPosition;
    this.#getZoom = config.getZoom;
    this.#onStart = callbacks.onStart || null;
    this.#onTranslate = callbacks.onTranslate;
    this.#onDrop = callbacks.onDrop || null;
    this.#shouldStart = callbacks.shouldStart || null;

    element.style.touchAction = 'none';
    element.addEventListener('pointerdown', this.#down);
    window.addEventListener('pointermove', this.#move);
    window.addEventListener('pointerup', this.#up);
  }

  #down = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    if (e.target.closest && e.target.closest('.sn-socket')) return;

    if (this.#shouldStart && !this.#shouldStart(e)) return;
    e.stopPropagation();
    this.#pointerStart = { x: e.pageX, y: e.pageY };
    this.#startPosition = { ...this.#getPosition() };
    if (this.#onStart) this.#onStart(e);
  };

  #move = (e) => {
    if (!this.#pointerStart || !this.#startPosition) return;
    e.preventDefault();
    let dx = e.pageX - this.#pointerStart.x;
    let dy = e.pageY - this.#pointerStart.y;
    let zoom = this.#getZoom();
    let x = this.#startPosition.x + dx / zoom;
    let y = this.#startPosition.y + dy / zoom;
    if (this.#onTranslate) this.#onTranslate(x, y, e);
  };

  #up = (e) => {
    if (!this.#pointerStart) return;
    this.#pointerStart = null;
    this.#startPosition = null;
    if (this.#onDrop) this.#onDrop(e);
  };

  /** Cleanup event listeners */
  destroy() {
    if (this.#element) {
      this.#element.removeEventListener('pointerdown', this.#down);
    }
    window.removeEventListener('pointermove', this.#move);
    window.removeEventListener('pointerup', this.#up);
  }
}

export { Drag as default };
