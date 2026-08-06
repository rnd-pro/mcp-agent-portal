import Symbiote from '@symbiotejs/symbiote';
import { slotProcessor } from '@symbiotejs/symbiote/core/slotProcessor.js';
import template from './Metric.tpl.js';
import css from './Metric.css.js';

export class MetricItem extends Symbiote {
  static observedAttributes = ['status', 'variant'];

  constructor() {
    super();
    this.templateProcessors.add(slotProcessor);
  }

  connectedCallback() {
    super.connectedCallback?.();
    if (!this.hasAttribute('role')) this.setAttribute('role', 'group');
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'status') {
      if (newValue === 'error' || newValue === 'warning') {
        this.setAttribute('aria-live', 'polite');
      } else {
        this.removeAttribute('aria-live');
      }
    }
    super.attributeChangedCallback?.(name, oldValue, newValue);
  }
}

MetricItem.template = template;
MetricItem.rootStyles = css;
MetricItem.reg('sn-metric');

export default MetricItem;
