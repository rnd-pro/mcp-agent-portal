import Symbiote from '@symbiotejs/symbiote';
import { slotProcessor } from '@symbiotejs/symbiote/core/slotProcessor.js';
import template from './Badge.tpl.js';
import css from './Badge.css.js';

export class StatusBadge extends Symbiote {
  constructor() {
    super();
    this.templateProcessors.add(slotProcessor);
  }

  connectedCallback() {
    super.connectedCallback?.();
    if (!this.hasAttribute('role')) this.setAttribute('role', 'status');
  }
}

StatusBadge.template = template;
StatusBadge.rootStyles = css;
StatusBadge.reg('sn-badge');

export default StatusBadge;
