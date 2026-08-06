import Symbiote from '@symbiotejs/symbiote';
import { slotProcessor } from '@symbiotejs/symbiote/core/slotProcessor.js';
import { bringOverlayToFront } from '../../ui/overlay-stack.js';
import { template } from './NodeCallout.tpl.js';
import { styles } from './NodeCallout.css.js';

/**
 * Floating label anchored to a graph node or any DOM element.
 */
export class NodeCallout extends Symbiote {
  static observedAttributes = ['anchor-node-id', 'anchor-selector', 'placement', 'offset', 'text', 'trigger', 'hidden'];

  #box = null;
  #text = null;
  #anchorElement = null;
  #resizeObserver = null;
  #mutationObserver = null;
  #observedAnchor = null;
  #hoverActive = false;
  #raf = 0;
  #lastLayout = '';
  #isMounted = false;

  constructor() {
    super();
    this.templateProcessors.add(slotProcessor);
  }

  connectedCallback() {
    super.connectedCallback?.();
    if (this.#isMounted) return;
    this.#isMounted = true;

    if (!this.hasAttribute('placement')) this.setAttribute('placement', 'top');
    if (!this.hasAttribute('role')) this.setAttribute('role', 'tooltip');

    this.#box = this.querySelector('.sn-node-callout');
    this.#text = this.querySelector('.sn-node-callout-text');
    this.#syncText();

    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    if (typeof ResizeObserver !== 'undefined') {
      this.#resizeObserver = new ResizeObserver(() => this.requestUpdate());
    }
    if (typeof MutationObserver !== 'undefined') {
      this.#mutationObserver = new MutationObserver(() => this.requestUpdate());
      this.#mutationObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden'],
        childList: true,
        subtree: true,
      });
    }

    window.addEventListener('resize', this.#onWindowChange, { passive: true });
    window.addEventListener('scroll', this.#onWindowChange, { passive: true, capture: true });
    this.requestUpdate();
    if (typeof requestAnimationFrame !== 'undefined') {
      this.#track();
    }
  }

  disconnectedCallback() {
    this.#isMounted = false;
    this.#clearAnchorObservation();
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#mutationObserver?.disconnect();
    this.#mutationObserver = null;

    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.#onWindowChange);
      window.removeEventListener('scroll', this.#onWindowChange, { capture: true });
    }

    if (typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.#raf);
    }
    this.#raf = 0;
    super.disconnectedCallback?.();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'text') this.#syncText();
    if (name === 'trigger' && newValue !== 'hover') {
      this.#hoverActive = false;
    }
    this.requestUpdate();
  }

  show() {
    this.hidden = false;
    bringOverlayToFront(this);
    this.requestUpdate();
  }

  hide() {
    this.hidden = true;
  }

  get anchorElement() {
    return this.#anchorElement;
  }

  set anchorElement(value) {
    this.#anchorElement = typeof Element !== 'undefined' && value instanceof Element ? value : null;
    this.requestUpdate();
  }

  requestUpdate() {
    this.#render();
  }

  #onWindowChange = () => this.requestUpdate();

  #onAnchorEnter = () => {
    if (this.#trigger() !== 'hover') return;
    this.#hoverActive = true;
    bringOverlayToFront(this);
    this.requestUpdate();
  };

  #onAnchorLeave = (event) => {
    if (this.#trigger() !== 'hover') return;
    if (event?.relatedTarget && this.#observedAnchor?.contains(event.relatedTarget)) return;
    this.#hoverActive = false;
    this.requestUpdate();
  };

  #track() {
    if (typeof requestAnimationFrame === 'undefined') return;
    this.#render();
    this.#raf = requestAnimationFrame(() => this.#track());
  }

  #syncText() {
    this.#text ||= this.querySelector('.sn-node-callout-text');
    if (!this.#text) return;
    const text = this.getAttribute('text') || '';
    this.#text.textContent = text;
    this.#text.hidden = !text;
  }

  #render() {
    if (!this.isConnected || this.hidden) return;
    this.#box ||= this.querySelector('.sn-node-callout');
    const anchor = this.#anchor();
    if (!anchor || !this.#box) {
      this.#clearAnchorObservation();
      this.style.visibility = 'hidden';
      this.#lastLayout = '';
      return;
    }

    this.#observeAnchor(anchor);
    const isOpen = this.#isOpen();
    const wasOpen = this.hasAttribute('data-open');
    this.toggleAttribute('data-open', isOpen);
    this.style.visibility = isOpen ? '' : 'hidden';
    if (isOpen && !wasOpen) bringOverlayToFront(this);

    const anchorRect = anchor.getBoundingClientRect();
    const boxRect = this.#box.getBoundingClientRect();
    const placement = this.#placement();
    const offset = this.#offset();
    const padding = 12;
    let x = 0;
    let y = 0;

    if (placement === 'bottom') {
      x = anchorRect.left + anchorRect.width / 2 - boxRect.width / 2;
      y = anchorRect.bottom + offset;
    } else if (placement === 'left') {
      x = anchorRect.left - boxRect.width - offset;
      y = anchorRect.top + anchorRect.height / 2 - boxRect.height / 2;
    } else if (placement === 'right') {
      x = anchorRect.right + offset;
      y = anchorRect.top + anchorRect.height / 2 - boxRect.height / 2;
    } else {
      x = anchorRect.left + anchorRect.width / 2 - boxRect.width / 2;
      y = anchorRect.top - boxRect.height - offset;
    }

    x = Math.min(Math.max(padding, x), window.innerWidth - boxRect.width - padding);
    y = Math.min(Math.max(padding, y), window.innerHeight - boxRect.height - padding);

    const nextLayout = `${Math.round(x)}:${Math.round(y)}:${placement}`;
    if (nextLayout === this.#lastLayout) return;
    this.#lastLayout = nextLayout;
    this.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  }

  #observeAnchor(anchor) {
    if (!this.#resizeObserver || this.#observedAnchor === anchor) return;
    this.#clearAnchorObservation();
    this.#resizeObserver.observe(anchor);
    anchor.addEventListener('mouseenter', this.#onAnchorEnter);
    anchor.addEventListener('mouseover', this.#onAnchorEnter);
    anchor.addEventListener('pointerenter', this.#onAnchorEnter);
    anchor.addEventListener('pointerover', this.#onAnchorEnter);
    anchor.addEventListener('mouseleave', this.#onAnchorLeave);
    anchor.addEventListener('mouseout', this.#onAnchorLeave);
    anchor.addEventListener('pointerleave', this.#onAnchorLeave);
    anchor.addEventListener('pointerout', this.#onAnchorLeave);
    this.#observedAnchor = anchor;
  }

  #clearAnchorObservation() {
    if (this.#resizeObserver && this.#observedAnchor) {
      this.#resizeObserver.unobserve(this.#observedAnchor);
    }
    this.#observedAnchor?.removeEventListener('mouseenter', this.#onAnchorEnter);
    this.#observedAnchor?.removeEventListener('mouseover', this.#onAnchorEnter);
    this.#observedAnchor?.removeEventListener('pointerenter', this.#onAnchorEnter);
    this.#observedAnchor?.removeEventListener('pointerover', this.#onAnchorEnter);
    this.#observedAnchor?.removeEventListener('mouseleave', this.#onAnchorLeave);
    this.#observedAnchor?.removeEventListener('mouseout', this.#onAnchorLeave);
    this.#observedAnchor?.removeEventListener('pointerleave', this.#onAnchorLeave);
    this.#observedAnchor?.removeEventListener('pointerout', this.#onAnchorLeave);
    this.#observedAnchor = null;
    this.#hoverActive = false;
  }

  #anchor() {
    if (this.#anchorElement?.isConnected) {
      this.toggleAttribute('data-anchor-selector-invalid', false);
      return this.#anchorElement;
    }

    const nodeId = this.getAttribute('anchor-node-id') || '';
    if (nodeId) {
      for (const node of document.querySelectorAll('graph-node[node-id]')) {
        if (node.getAttribute('node-id') === nodeId) {
          this.toggleAttribute('data-anchor-selector-invalid', false);
          return node;
        }
      }
      this.toggleAttribute('data-anchor-selector-invalid', false);
      return null;
    }

    const selector = this.getAttribute('anchor-selector') || '';
    if (!selector) {
      this.toggleAttribute('data-anchor-selector-invalid', false);
      return null;
    }
    try {
      const anchor = document.querySelector(selector);
      this.toggleAttribute('data-anchor-selector-invalid', false);
      return anchor;
    } catch {
      this.toggleAttribute('data-anchor-selector-invalid', true);
      return null;
    }
  }

  #placement() {
    const placement = this.getAttribute('placement') || 'top';
    return ['top', 'bottom', 'left', 'right'].includes(placement) ? placement : 'top';
  }

  #offset() {
    const value = Number.parseFloat(this.getAttribute('offset') || '');
    return Number.isFinite(value) ? value : 14;
  }

  #trigger() {
    const trigger = this.getAttribute('trigger') || 'always';
    return trigger === 'hover' ? 'hover' : 'always';
  }

  #isOpen() {
    return this.#trigger() !== 'hover' || this.#hoverActive;
  }
}

NodeCallout.template = template;
NodeCallout.rootStyles = styles;
NodeCallout.reg('node-callout');
