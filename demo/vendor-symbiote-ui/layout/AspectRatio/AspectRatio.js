import Symbiote from '@symbiotejs/symbiote';
import template from './AspectRatio.tpl.js';
import css from './AspectRatio.css.js';

class AspectRatio extends Symbiote {
  static observedAttributes = ['ratio'];

  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback?.();
    this.#syncRatio();
  }

  get ratio() {
    return this.getAttribute('ratio') || '1/1';
  }

  set ratio(val) {
    this.setAttribute('ratio', String(val));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'ratio') {
      this.#syncRatio();
    }
  }

  #syncRatio() {
    if (this.ref.box) {
      // Direct CSS aspect-ratio support
      this.ref.box.style.aspectRatio = this.ratio;
    }
  }
}

AspectRatio.template = template;
AspectRatio.rootStyles = css;
AspectRatio.reg('sn-aspect-ratio');

export default AspectRatio;
