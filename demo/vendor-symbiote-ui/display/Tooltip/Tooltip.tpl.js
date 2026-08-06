import { html } from '@symbiotejs/symbiote';

export default html`
  <slot></slot>
  <div class="sn-tooltip-popup" ref="popup" role="tooltip" aria-hidden="true">
    {{content}}
  </div>
`;
