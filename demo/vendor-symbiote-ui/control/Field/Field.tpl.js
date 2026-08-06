import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="sn-field-container">
    <slot name="label"></slot>
    <div class="sn-field-control-wrapper">
      <slot name="prefix"></slot>
      <slot></slot>
      <slot name="suffix"></slot>
    </div>
    <slot name="hint"></slot>
    <slot name="error"></slot>
  </div>
`;
