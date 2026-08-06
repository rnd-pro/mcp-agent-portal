import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="sn-popover-trigger-wrapper" ref="triggerWrapper">
    <slot name="trigger"></slot>
  </div>
  <div class="sn-popover-panel-wrapper" ref="panel" role="dialog" aria-modal="false">
    <slot></slot>
  </div>
`;
