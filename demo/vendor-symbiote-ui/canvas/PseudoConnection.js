/* eslint-env browser */
/**
 * PseudoConnection — temporary connection line during drag
 *
 * Renders dashed Bézier path + plus indicator at endpoint.
 * Extracted from NodeCanvas to reduce complexity.
 *
 * @module symbiote-ui/canvas/PseudoConnection
 */

export class PseudoConnection {
  /** @type {SVGPathElement|null} */
  #path = null;

  /** @type {SVGGElement|null} */
  #plusIndicator = null;

  /** @type {SVGElement} */
  #svg;

  /**
   * @param {SVGElement} svgLayer - pseudo SVG overlay
   */
  constructor(svgLayer) {
    this.#svg = svgLayer;
  }

  /**
   * Show pseudo-connection between two world-space points.
   * pseudo-svg is inside .content which applies CSS transform (zoom+pan),
   * so coordinates must be in world-space (same as ConnectionRenderer dots).
   * @param {number} sx - Start X (world space)
   * @param {number} sy - Start Y (world space)
   * @param {number} ex - End X (world space)
   * @param {number} ey - End Y (world space)
   */
  show(sx, sy, ex, ey) {
    if (!this.#path) {
      this.#path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      this.#path.setAttribute('class', 'pseudo-path');
      this.#svg.appendChild(this.#path);
    }

    let dx = Math.abs(ex - sx) * 0.5;
    let d = `M ${sx} ${sy} C ${sx + dx} ${sy}, ${ex - dx} ${ey}, ${ex} ${ey}`;
    this.#path.setAttribute('d', d);


    if (!this.#plusIndicator) {
      let g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'plus-indicator');
      let circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', '8');
      let h = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      h.setAttribute('x1', '-4');
      h.setAttribute('y1', '0');
      h.setAttribute('x2', '4');
      h.setAttribute('y2', '0');
      let v = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      v.setAttribute('x1', '0');
      v.setAttribute('y1', '-4');
      v.setAttribute('x2', '0');
      v.setAttribute('y2', '4');
      g.appendChild(circle);
      g.appendChild(h);
      g.appendChild(v);
      this.#svg.appendChild(g);
      this.#plusIndicator = g;
    }
    this.#plusIndicator.setAttribute('transform', `translate(${ex}, ${ey})`);
  }

  /** Hide and clean up pseudo-connection */
  hide() {
    if (this.#path) {
      this.#path.remove();
      this.#path = null;
    }
    if (this.#plusIndicator) {
      this.#plusIndicator.remove();
      this.#plusIndicator = null;
    }
  }
}
