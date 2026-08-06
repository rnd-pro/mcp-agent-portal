import Symbiote from '@symbiotejs/symbiote';
import { slotProcessor } from '@symbiotejs/symbiote/core/slotProcessor.js';
import template from './EmptyState.tpl.js';
import css from './EmptyState.css.js';

export class EmptyState extends Symbiote {
  constructor() {
    super();
    this.templateProcessors.add(slotProcessor);
  }

  connectedCallback() {
    super.connectedCallback?.();
    if (!this.hasAttribute('role')) this.setAttribute('role', 'region');
  }
}

EmptyState.template = template;
EmptyState.rootStyles = css;
EmptyState.reg('sn-empty-state');

export default EmptyState;
