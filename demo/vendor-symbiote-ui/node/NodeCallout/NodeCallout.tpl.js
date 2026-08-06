import { html } from '@symbiotejs/symbiote';

export const template = html`
  <div class="sn-node-callout" part="box">
    <span class="sn-node-callout-text" part="text" hidden></span>
    <slot></slot>
  </div>
`;
