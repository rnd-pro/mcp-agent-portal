import Symbiote from '@symbiotejs/symbiote';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import template from './Tag.tpl.js';
import css from './Tag.css.js';

export class Tag extends Symbiote {
  static observedAttributes = ['variant', 'closable'];

  init$ = {
    variant: 'neutral',
    closable: false,
    onCloseClick: (e) => {
      e.stopPropagation();
      this.dispatchEvent(new CustomEvent('sn-tag-close', {
        bubbles: true,
        composed: true
      }));
    }
  };

  connectedCallback() {
    super.connectedCallback?.();
    // Hydrate $ from pre-set attributes
    if (this.hasAttribute('variant')) {
      this.$.variant = this.getAttribute('variant');
    }
    if (this.hasAttribute('closable')) {
      this.$.closable = true;
      ensureMaterialSymbols(['close']);
    }
    this.#syncState();
  }

  get variant() {
    return this.getAttribute('variant') || 'neutral';
  }

  set variant(val) {
    this.setAttribute('variant', val);
  }

  get closable() {
    return this.hasAttribute('closable');
  }

  set closable(val) {
    if (val) {
      this.setAttribute('closable', '');
    } else {
      this.removeAttribute('closable');
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (!this.isConnected) return;
    if (name === 'variant') {
      this.$.variant = newValue || 'neutral';
      this.#syncState();
    } else if (name === 'closable') {
      this.$.closable = newValue !== null;
      if (this.$.closable) {
        ensureMaterialSymbols(['close']);
      }
      this.#syncState();
    } else {
      super.attributeChangedCallback?.(name, oldValue, newValue);
    }
  }

  #syncState() {
    this.setAttribute('variant', this.$.variant);
    if (this.$.closable) {
      this.setAttribute('closable', '');
    } else {
      this.removeAttribute('closable');
    }
  }
}

Tag.template = template;
Tag.rootStyles = css;
Tag.reg('sn-tag');

export default Tag;
