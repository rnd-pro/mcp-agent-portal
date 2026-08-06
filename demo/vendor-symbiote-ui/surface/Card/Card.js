import Symbiote from '@symbiotejs/symbiote';
import { slotProcessor } from '@symbiotejs/symbiote/core/slotProcessor.js';
import template from './Card.tpl.js';
import css from './Card.css.js';

export class SurfaceCard extends Symbiote {
  static observedAttributes = ['interactive'];

  constructor() {
    super();
    this.templateProcessors.add(slotProcessor);
  }

  connectedCallback() {
    super.connectedCallback?.();
    if (!this.hasAttribute('role')) this.setAttribute('role', 'region');
    this._syncInteractive(this.hasAttribute('interactive'));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'interactive') {
      this._syncInteractive(newValue !== null);
    } else {
      super.attributeChangedCallback?.(name, oldValue, newValue);
    }
  }

  _syncInteractive(interactive) {
    if (interactive) {
      if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
      this.setAttribute('role', 'button');
    } else {
      this.removeAttribute('tabindex');
      this.setAttribute('role', 'region');
    }
  }
}

SurfaceCard.template = template;
SurfaceCard.rootStyles = css;
SurfaceCard.reg('sn-card');

export default SurfaceCard;
