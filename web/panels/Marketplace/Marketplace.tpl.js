import { html } from '@symbiotejs/symbiote';

export default html`
<div class="ui-header">
  <div class="ui-title-large mp-title-bar">
    <div class="mp-title-left">
      <span class="material-symbols-outlined mp-header-icon">storefront</span>
      Marketplace
    </div>
    <div class="ui-segmented-control mp-mode-toggle" ref="modeToggle">
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
    <input type="text" class="ui-field mp-search-input" placeholder="Search servers..." ref="searchInput" />
  </div>

  <div class="mp-scrollable">
    <div class="mp-tab-content" ref="installedTab">
      <div class="mp-grid" ref="installedGrid" ${{ itemize: 'installedItems', 'item-tag': 'mp-server-card' }}></div>
    </div>

    <div class="mp-tab-content" ref="catalogTab" hidden>
      <div ref="catalogContent" ${{ itemize: 'catalogSections', 'item-tag': 'mp-catalog-section' }}></div>
    </div>

    <div class="mp-tab-content" ref="customTab" hidden>
      <div class="mp-custom-form">
        <div class="ui-card-title mp-custom-title">Install Custom MCP Server</div>
        <p class="mp-form-desc">Add any MCP server by specifying its command and arguments.</p>
        
        <sn-field>
          <label>Name <span class="mp-required">*</span></label>
          <input type="text" ref="customName" placeholder="my-server" />
        </sn-field>
        
        <sn-field>
          <label>Command <span class="mp-required">*</span></label>
          <input type="text" ref="customCommand" placeholder="npx" />
        </sn-field>
        
        <sn-field>
          <label>Arguments <span class="mp-hint">(comma-separated)</span></label>
          <input type="text" ref="customArgs" placeholder="-y, @scope/mcp-server-name" />
        </sn-field>

        <sn-field>
          <label>Environment Variables <span class="mp-hint">(KEY=VALUE, one per line)</span></label>
          <textarea ref="customEnv" rows="3" placeholder="API_KEY=sk-xxx&#10;DEBUG=true"></textarea>
        </sn-field>
        
        <sn-button variant="primary" ref="customInstallBtn">
          <span class="material-symbols-outlined mp-install-icon">add_circle</span>
          Install Server
        </sn-button>
        <div class="mp-form-status" ref="customStatus"></div>
      </div>
    </div>
  </div>
</div>

<div class="mp-mode-section mp-context-section" ref="contextSection" hidden>
  <div class="mp-context-header">
    <p class="mp-context-desc">
      Browse and install universal agent skills and workflows from <b>Open Memory</b> (Layer 1).
      <br/>Installing a skill makes it available to your local project or the entire team.
    </p>
  </div>
  <div class="mp-scrollable mp-context-body">
    <div class="mp-grid" ref="contextGrid" ${{ itemize: 'contextItems', 'item-tag': 'mp-context-card' }}></div>
  </div>
</div>
`;
