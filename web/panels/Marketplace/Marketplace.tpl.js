import { html } from '@symbiotejs/symbiote';

export default html`
<div class="ui-header">
  <div class="ui-title-large" style="display:flex; align-items:center; justify-content:space-between; width:100%">
    <div style="display:flex; align-items:center;">
      <span class="material-symbols-outlined mp-header-icon">storefront</span>
      Marketplace
    </div>
    <div class="ui-segmented-control" ref="modeToggle" style="font-size:13px; font-weight:normal;">
      <button class="active" data-mode="servers">MCP Servers</button>
      <button data-mode="context">Skills & Rules</button>
    </div>
  </div>
</div>

<div class="mp-mode-section" ref="serversSection">
  <div class="mp-tabs" ref="tabBar">
    <button class="mp-tab active" data-tab="installed">Installed (<span ref="serverCountBadge">{{serverCount}}</span>)</button>
    <button class="mp-tab" data-tab="catalog">Catalog</button>
    <button class="mp-tab" data-tab="custom">Custom</button>
  </div>

  <div class="mp-search-bar" ref="searchBar">
    <span class="material-symbols-outlined mp-search-icon">search</span>
    <input type="text" class="ui-field" style="width:100%" placeholder="Search servers..." ref="searchInput" />
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
        <div class="ui-card-title" style="margin-bottom:4px; font-size:15px;">Install Custom MCP Server</div>
        <p class="mp-form-desc">Add any MCP server by specifying its command and arguments.</p>
        
        <div class="ui-field">
          <label>Name <span class="mp-required">*</span></label>
          <input type="text" ref="customName" placeholder="my-server" />
        </div>
        
        <div class="ui-field">
          <label>Command <span class="mp-required">*</span></label>
          <input type="text" ref="customCommand" placeholder="npx" />
        </div>
        
        <div class="ui-field">
          <label>Arguments <span class="mp-hint">(comma-separated)</span></label>
          <input type="text" ref="customArgs" placeholder="-y, @scope/mcp-server-name" />
        </div>

        <div class="ui-field">
          <label>Environment Variables <span class="mp-hint">(KEY=VALUE, one per line)</span></label>
          <textarea ref="customEnv" rows="3" placeholder="API_KEY=sk-xxx&#10;DEBUG=true"></textarea>
        </div>
        
        <button class="ui-btn primary" ref="customInstallBtn">
          <span class="material-symbols-outlined" style="font-size:18px;">add_circle</span>
          Install Server
        </button>
        <div class="mp-form-status" ref="customStatus"></div>
      </div>
    </div>
  </div>
</div>

<div class="mp-mode-section" ref="contextSection" hidden style="display:flex; flex-direction:column; height:100%">
  <div style="padding:16px; border-bottom:1px solid var(--border); background:var(--bg-card);">
    <p style="margin:0; font-size:13px; color:var(--text-sec); line-height:1.5;">
      Browse and install universal agent skills and workflows from <b>Open Memory</b> (Layer 1).
      <br/>Installing a skill makes it available to your local project or the entire team.
    </p>
  </div>
  <div class="mp-scrollable" style="padding:16px;">
    <div class="mp-grid" ref="contextGrid"></div>
  </div>
</div>
`;
