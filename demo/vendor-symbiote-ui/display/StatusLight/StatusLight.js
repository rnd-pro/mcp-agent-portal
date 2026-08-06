import Symbiote from '@symbiotejs/symbiote';
import template from './StatusLight.tpl.js';
import css from './StatusLight.css.js';

const DEFAULT_VARIANT = 'neutral';

export class StatusLight extends Symbiote {
  static observedAttributes = ['variant'];

  init$ = {
    variant: DEFAULT_VARIANT,
  };

  connectedCallback() {
    super.connectedCallback?.();
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'status');
    }
    this.#syncState();
  }

  get variant() {
    return this.getAttribute('variant') || DEFAULT_VARIANT;
  }

  set variant(val) {
    this.setAttribute('variant', val);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'variant') {
      this.#syncState();
    } else {
      super.attributeChangedCallback?.(name, oldValue, newValue);
    }
  }

  // Reflect a valid variant onto the attribute that drives the [variant=...] styles.
  // The attribute is the source of truth for parsed/innerHTML markup, where
  // attributeChangedCallback can run before init$ has populated $ — so resolve from
  // it first and never write back a missing value as the literal "null" string.
  #syncState() {
    let variant = this.getAttribute('variant') || this.$.variant || DEFAULT_VARIANT;
    if (variant === 'null' || variant === 'undefined') {
      variant = DEFAULT_VARIANT;
    }
    if (this.$.variant !== variant) {
      this.$.variant = variant;
    }
    if (this.getAttribute('variant') !== variant) {
      this.setAttribute('variant', variant);
    }
  }
}

StatusLight.template = template;
StatusLight.rootStyles = css;
StatusLight.reg('sn-status-light');

export default StatusLight;
