import Symbiote from '@symbiotejs/symbiote';
import { slotProcessor } from '@symbiotejs/symbiote/core/slotProcessor.js';
import template from './Banner.tpl.js';
import css from './Banner.css.js';

export class StatusBanner extends Symbiote {
  static observedAttributes = ['variant'];

  constructor() {
    super();
    this.templateProcessors.add(slotProcessor);
  }

  connectedCallback() {
    super.connectedCallback?.();
    this._syncRole();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'variant') {
      this._syncRole();
    } else {
      super.attributeChangedCallback?.(name, oldValue, newValue);
    }
  }

  _syncRole() {
    const variant = this.getAttribute('variant');
    const role = (variant === 'error' || variant === 'danger') ? 'alert' : 'status';
    this.setAttribute('role', role);
  }
}

StatusBanner.template = template;
StatusBanner.rootStyles = css;
StatusBanner.reg('sn-banner');

export default StatusBanner;
