export class LODManager {
  /** @type {import('./NodeCanvas/NodeCanvas.js').NodeCanvas} */
  #canvas;

  /** @type {number} */
  #threshold;

  /** @type {string} */
  #currentLod = 'collapsed';

  /** @type {boolean} */
  #attached = false;

  #listeners = [];

  /**
   * @param {import('./NodeCanvas/NodeCanvas.js').NodeCanvas} canvas
   * @param {object} config
   * @param {number} [config.threshold=0.7] - Zoom level at which LOD expands
   */
  constructor(canvas, { threshold = 0.7 } = {}) {
    this.#canvas = canvas;
    this.#threshold = threshold;
  }

  get currentLod() {
    return this.#currentLod;
  }

  /**
   * Attach LOD tracking to the canvas.
   * Note: Symbiote's sub() does not return an unsubscribe handle —
   * subscriptions are auto-cleaned when the canvas component is destroyed.
   */
  attach() {
    if (this.#attached || !this.#canvas) return;
    this.#attached = true;

    let initialZoom = this.#canvas.$.zoom || 1;
    this.#currentLod = initialZoom >= this.#threshold ? 'expanded' : 'collapsed';

    this.#canvas.sub('zoom', (zoom) => {
      if (!this.#attached) return;
      let newLod = zoom >= this.#threshold ? 'expanded' : 'collapsed';
      if (newLod === this.#currentLod) return;

      this.#currentLod = newLod;
      this.#emit(newLod);
    });
  }

  /**
   * Perform immediate LOD update evaluation (e.g. after manual navigation or fitView)
   */
  update() {
    if (!this.#canvas || !this.#attached) return;
    let zoom = this.#canvas.$.zoom || 1;
    let newLod = zoom >= this.#threshold ? 'expanded' : 'collapsed';
    if (newLod !== this.#currentLod) {
      this.#currentLod = newLod;
      this.#emit(newLod);
    }
  }

  /**
   * @param {Function} callback
   */
  onLodChange(callback) {
    this.#listeners.push(callback);

    if (this.#attached) {
      callback(this.#currentLod);
    }
  }

  #emit(lod) {
    for (const fn of this.#listeners) {
      fn(lod);
    }
  }

  destroy() {


    this.#listeners = [];
    this.#attached = false;
  }
}
