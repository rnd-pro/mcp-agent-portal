import { html } from '@symbiotejs/symbiote';

export default html`
<div class="wcm-shell">
  <header class="wcm-header">
    <span ref="title">Work item markdown</span>
  </header>
  <code-block class="wcm-view" ref="viewer"></code-block>
</div>
`;
