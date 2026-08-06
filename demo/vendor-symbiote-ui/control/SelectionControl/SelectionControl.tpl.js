import { html } from '@symbiotejs/symbiote';

export default html`
  <label class="sn-selection-control">
    <span class="sn-selection-input-wrap">
      <input ref="input" class="sn-selection-input">
      <span class="sn-selection-visual" aria-hidden="true">
        <span class="sn-selection-mark"></span>
      </span>
    </span>
    <span class="sn-selection-content">
      <span class="sn-selection-label"><slot></slot></span>
      <span class="sn-selection-hint"><slot name="hint"></slot></span>
      <span class="sn-selection-error"><slot name="error"></slot></span>
    </span>
  </label>
`;
