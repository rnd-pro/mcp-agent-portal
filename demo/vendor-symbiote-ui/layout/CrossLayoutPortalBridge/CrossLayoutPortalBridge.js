import { routePortalBridgePath } from './portal-bridge-routing.js';

/**
 * CrossLayoutPortalBridge draws a themed visual bridge between two DOM anchors.
 *
 * It is intentionally data-agnostic: host apps decide which elements represent
 * portal endpoints, while the bridge owns viewport tracking and path rendering.
 */
export class CrossLayoutPortalBridge extends HTMLElement {
  #root;
  #svg;
  #path;
  #sourceDot;
  #targetDot;
  #resizeObserver;
  #mutationObserver;
  #raf = 0;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.innerHTML = `
      <style>
        :host,
        cross-layout-portal-bridge {
          position: fixed;
          inset: 0;
          z-index: var(--sn-portal-bridge-z, 12);
          pointer-events: none;
          contain: layout style;
        }

        svg {
          width: 100%;
          height: 100%;
          overflow: visible;
        }

        path {
          fill: none;
          stroke: var(--sn-portal-bridge-stroke, var(--sn-sys-accent));
          stroke-width: var(--sn-portal-bridge-width, 2);
          stroke-linecap: round;
          stroke-dasharray: var(--sn-portal-bridge-dash, 7 7);
          filter: drop-shadow(0 0 5px color-mix(in oklab, var(--sn-portal-bridge-stroke, var(--sn-sys-accent)) 40%, transparent));
        }

        circle {
          fill: var(--sn-portal-bridge-dot, var(--sn-sys-accent));
          stroke: var(--sn-sys-surface);
          stroke-width: 2;
        }
      </style>
      <svg aria-hidden="true">
        <path part="path"></path>
        <circle part="source-dot" r="5"></circle>
        <circle part="target-dot" r="5"></circle>
      </svg>
    `;
    this.#svg = this.#root.querySelector('svg');
    this.#path = this.#root.querySelector('path');
    this.#sourceDot = this.#root.querySelector('[part="source-dot"]');
    this.#targetDot = this.#root.querySelector('[part="target-dot"]');
  }

  static get observedAttributes() {
    return ['source-selector', 'target-selector', 'source-side', 'target-side', 'path-style', 'obstacle-selector'];
  }

  connectedCallback() {
    this.#resizeObserver = new ResizeObserver(() => this.requestUpdate());
    this.#mutationObserver = new MutationObserver(() => this.requestUpdate());
    this.#mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    window.addEventListener('resize', this.#onWindowChange, { passive: true });
    window.addEventListener('scroll', this.#onWindowChange, { passive: true, capture: true });
    this.requestUpdate();
  }

  disconnectedCallback() {
    this.#resizeObserver?.disconnect();
    this.#mutationObserver?.disconnect();
    window.removeEventListener('resize', this.#onWindowChange);
    window.removeEventListener('scroll', this.#onWindowChange, { capture: true });
    cancelAnimationFrame(this.#raf);
  }

  attributeChangedCallback() {
    this.requestUpdate();
  }

  requestUpdate() {
    cancelAnimationFrame(this.#raf);
    this.#raf = requestAnimationFrame(() => this.#render());
  }

  #onWindowChange = () => this.requestUpdate();

  #render() {
    const source = this.#endpoint('source-selector');
    const target = this.#endpoint('target-selector');

    if (!source || !target) {
      this.hidden = true;
      return;
    }

    this.hidden = false;
    this.#resizeObserver?.observe(source);
    this.#resizeObserver?.observe(target);

    const sourceSide = this.getAttribute('source-side') || 'right';
    const targetSide = this.getAttribute('target-side') || 'left';
    const start = this.#anchorPoint(source, sourceSide);
    const end = this.#anchorPoint(target, targetSide);
    const path = routePortalBridgePath({
      start,
      end,
      sourceRect: source.getBoundingClientRect(),
      targetRect: target.getBoundingClientRect(),
      sourceSide,
      targetSide,
      style: this.getAttribute('path-style') || 'bezier',
      grid: this.#cssNumber('--sn-portal-bridge-grid', 20),
      stub: this.#cssNumber('--sn-portal-bridge-stub', 36),
      clearance: this.#cssNumber('--sn-portal-bridge-clearance', 28),
      chamfer: this.#cssNumber('--sn-portal-bridge-chamfer', 8),
      obstacles: this.#obstacleRects(source, target),
    });

    this.#svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
    this.#path.setAttribute('d', path);
    this.#sourceDot.setAttribute('cx', String(start.x));
    this.#sourceDot.setAttribute('cy', String(start.y));
    this.#targetDot.setAttribute('cx', String(end.x));
    this.#targetDot.setAttribute('cy', String(end.y));
  }

  #endpoint(attributeName) {
    const selector = this.getAttribute(attributeName) || '';
    const invalidAttribute = `data-${attributeName}-invalid`;
    if (!selector) {
      this.toggleAttribute(invalidAttribute, false);
      return null;
    }
    try {
      const endpoint = document.querySelector(selector);
      this.toggleAttribute(invalidAttribute, false);
      return endpoint;
    } catch {
      this.toggleAttribute(invalidAttribute, true);
      return null;
    }
  }

  #anchorPoint(el, side) {
    const rect = el.getBoundingClientRect();
    const xMap = {
      left: rect.left,
      right: rect.right,
      center: rect.left + rect.width / 2,
    };
    const yMap = {
      top: rect.top,
      bottom: rect.bottom,
      center: rect.top + rect.height / 2,
    };
    return {
      x: Math.round(xMap[side] ?? xMap.center),
      y: Math.round(yMap[side] ?? yMap.center),
    };
  }

  #cssNumber(name, fallback) {
    const value = Number.parseFloat(getComputedStyle(this).getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  }

  #obstacleRects(source, target) {
    const selector = this.getAttribute('obstacle-selector') || '';
    if (!selector) return [];
    try {
      const rects = [...document.querySelectorAll(selector)]
        .filter((el) => el !== source && el !== target && el !== this)
        .map((el, index) => {
          const rect = el.getBoundingClientRect();
          return {
            id: `portal-obstacle-${index}`,
            x: rect.left,
            y: rect.top,
            w: rect.width,
            h: rect.height,
          };
        })
        .filter((rect) => rect.w > 0 && rect.h > 0);
      this.toggleAttribute('data-obstacle-selector-invalid', false);
      return rects;
    } catch {
      this.toggleAttribute('data-obstacle-selector-invalid', true);
      return [];
    }
  }
}

CrossLayoutPortalBridge.reg = (tagName = 'cross-layout-portal-bridge') => {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, CrossLayoutPortalBridge);
  }
};

CrossLayoutPortalBridge.reg('cross-layout-portal-bridge');
