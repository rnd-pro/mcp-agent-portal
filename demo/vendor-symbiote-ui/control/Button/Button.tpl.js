import { html } from '@symbiotejs/symbiote';

export default html`
  <span class="sn-button-spinner" hidden></span>
  <slot name="prefix"></slot>
  <slot></slot>
  <slot name="suffix"></slot>
`;
