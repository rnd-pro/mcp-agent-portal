import { html } from '@symbiotejs/symbiote';

export default html`
<div class="mp-header">
  <span class="material-symbols-outlined mp-header-icon">storefront</span>
  <span class="mp-header-title">MCP Marketplace</span>
  <span class="mp-header-count">{{serverCount}} servers</span>
</div>
<div class="mp-grid" ref="grid"></div>
`;
