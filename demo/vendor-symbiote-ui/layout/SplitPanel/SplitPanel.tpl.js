import { html } from '@symbiotejs/symbiote';

export default html`
  <div ref="container" class="sn-split-container">
    <div ref="primary" class="sn-split-panel-primary">
      <slot name="primary"></slot>
    </div>
    <div ref="divider" class="sn-split-divider"></div>
    <div ref="secondary" class="sn-split-panel-secondary">
      <slot name="secondary"></slot>
    </div>
  </div>
`;
