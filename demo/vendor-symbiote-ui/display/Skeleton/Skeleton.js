import Symbiote from '@symbiotejs/symbiote';
import template from './Skeleton.tpl.js';
import css from './Skeleton.css.js';

export class Skeleton extends Symbiote {
  static observedAttributes = ['variant', 'animation'];

  init$ = {
    variant: 'text',
    animation: 'shimmer',
  };

  connectedCallback() {
    super.connectedCallback?.();
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'progressbar');
    }
    this.setAttribute('aria-busy', 'true');
    // Hydrate $ from pre-set attributes (attributeChangedCallback is guarded
    // pre-connection because $ is unreliable before super.connectedCallback)
    if (this.hasAttribute('variant')) {
      this.$.variant = this.getAttribute('variant');
    }
    if (this.hasAttribute('animation')) {
      this.$.animation = this.getAttribute('animation');
    }
    this.#syncState();
  }

  get variant() {
    return this.getAttribute('variant') || 'text';
  }

  set variant(val) {
    this.setAttribute('variant', val);
  }

  get animation() {
    return this.getAttribute('animation') || 'shimmer';
  }

  set animation(val) {
    this.setAttribute('animation', val);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (!this.isConnected) return;
    if (name === 'variant') {
      this.$.variant = newValue || 'text';
      this.#syncState();
    } else if (name === 'animation') {
      this.$.animation = newValue || 'shimmer';
      this.#syncState();
    } else {
      super.attributeChangedCallback?.(name, oldValue, newValue);
    }
  }

  #syncState() {
    this.setAttribute('variant', this.$.variant);
    this.setAttribute('animation', this.$.animation);
  }
}

Skeleton.template = template;
Skeleton.rootStyles = css;
Skeleton.reg('sn-skeleton');

export default Skeleton;
