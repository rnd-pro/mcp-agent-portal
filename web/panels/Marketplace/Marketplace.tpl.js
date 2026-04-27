import { html } from '@symbiotejs/symbiote';

export default html`
<div class="mp-header">
  <span class="material-symbols-outlined mp-header-icon">storefront</span>
  <span class="mp-header-title">MCP Marketplace</span>
  <span class="mp-header-count">{{serverCount}} installed</span>
</div>

<div class="mp-tabs" ref="tabBar">
  <button class="mp-tab active" data-tab="installed">Installed</button>
  <button class="mp-tab" data-tab="catalog">Catalog</button>
  <button class="mp-tab" data-tab="custom">Custom</button>
</div>

<div class="mp-search-bar" ref="searchBar">
  <span class="material-symbols-outlined mp-search-icon">search</span>
  <input type="text" class="mp-search" placeholder="Search servers..." ref="searchInput" />
</div>

<div class="mp-scrollable">
  <div class="mp-tab-content" ref="installedTab">
    <div class="mp-grid" ref="installedGrid"></div>
  </div>

  <div class="mp-tab-content" ref="catalogTab" hidden>
    <div ref="catalogContent"></div>
  </div>

  <div class="mp-tab-content" ref="customTab" hidden>
    <div class="mp-custom-form">
      <h3 class="mp-form-title">Install Custom MCP Server</h3>
      <p class="mp-form-desc">Add any MCP server by specifying its command and arguments.</p>
      
      <label class="mp-label">Name <span class="mp-required">*</span></label>
      <input type="text" class="mp-input" ref="customName" placeholder="my-server" />
      
      <label class="mp-label">Command <span class="mp-required">*</span></label>
      <input type="text" class="mp-input" ref="customCommand" placeholder="npx" />
      
      <label class="mp-label">Arguments <span class="mp-hint">(comma-separated)</span></label>
      <input type="text" class="mp-input" ref="customArgs" placeholder="-y, @scope/mcp-server-name" />

      <label class="mp-label">Environment Variables <span class="mp-hint">(KEY=VALUE, one per line)</span></label>
      <textarea class="mp-textarea" ref="customEnv" rows="3" placeholder="API_KEY=sk-xxx&#10;DEBUG=true"></textarea>
      
      <button class="mp-install-btn" ref="customInstallBtn">
        <span class="material-symbols-outlined">add_circle</span>
        Install Server
      </button>
      <div class="mp-form-status" ref="customStatus"></div>
    </div>
  </div>
</div>
`;
