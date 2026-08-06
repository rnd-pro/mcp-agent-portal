import { html } from '@symbiotejs/symbiote';

export default html`
  <span class="sn-status-light-dot"></span>
  <span class="sn-status-light-label">
    <slot></slot>
  </span>
`;
