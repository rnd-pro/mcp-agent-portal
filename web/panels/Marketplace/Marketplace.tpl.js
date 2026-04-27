import { html } from '@symbiotejs/symbiote';

export default html`
<div class="mp-header">
  <span class="material-symbols-outlined mp-header-icon">storefront</span>
  <span class="mp-header-title">MCP Marketplace</span>
  <span class="mp-header-count">{{serverCount}} installed</span>
</div>

<div class="mp-section">
  <h3 class="mp-section-title">Installed Servers</h3>
  <div class="mp-grid" ref="installedGrid"></div>
</div>

<div class="mp-section">
  <h3 class="mp-section-title">Discover</h3>
  <div class="mp-grid" ref="availableGrid"></div>
</div>
`;
