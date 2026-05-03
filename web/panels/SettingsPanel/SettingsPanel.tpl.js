export default`
<div class="ui-card-title">Actions</div>
<div style="display:flex;gap:8px;margin-bottom:16px">
<button class="ui-btn" ref="refreshBtn">↻ Refresh</button>
<button class="ui-btn danger" ref="restartBtn">⟳ Restart</button>
<button class="ui-btn danger" ref="stopBtn">⏹ Stop</button>
</div>
<div ref="restartStatus" style="margin-bottom:16px;font-size:11px;color:var(--sn-text-dim)"></div>

<div class="ui-card-title">Backend</div>
<div class="ui-card" ref="backendCard"></div>

<div class="ui-card-title">Active Instances</div>
<div ref="instanceList"></div>

<div class="ui-card-title">Server Lifecycle</div>
<div class="ui-card" ref="lifecycleCard">
  <div class="pg-stg-metric"><span>Auto-shutdown</span><span class="pg-stg-val" ref="shutdownTimer">—</span></div>
  <div class="pg-stg-metric"><span>Uptime</span><span class="pg-stg-val" ref="uptimeVal">—</span></div>
</div>

<div class="ui-card-title">Integrations</div>
<div class="ui-card" ref="integrationsCard" style="display:flex; flex-direction:column; gap:8px;">
  <div class="pg-stg-metric">
    <span style="min-width: 150px;">Telegram Token</span>
    <input type="password" ref="telegramTokenInput" placeholder="123456:ABC-DEF..." style="flex:1; padding:4px 8px; border:1px solid var(--sn-border); border-radius:4px; background:var(--sn-bg-level-1); color:var(--sn-text-main);">
  </div>
  <div class="pg-stg-metric">
    <span style="min-width: 150px;">Authorized Chat ID</span>
    <input type="text" ref="telegramChatIdInput" placeholder="-100123456789" style="flex:1; padding:4px 8px; border:1px solid var(--sn-border); border-radius:4px; background:var(--sn-bg-level-1); color:var(--sn-text-main);">
    <button class="ui-btn primary" ref="saveSettingsBtn" style="margin-left: 8px; align-self: flex-start;">Save</button>
  </div>
</div>

<div class="ui-card-title">Provider Models</div>
<div class="ui-card" ref="modelsCard">
  <div class="pm-provider-tabs" ref="providerTabs"></div>
  <div class="pm-model-list" ref="modelList"></div>
  <div class="pm-actions">
    <button class="ui-btn" ref="syncCliBtn">⟳ Discover & Update</button>
    <button class="ui-btn primary" ref="saveModelsBtn">Save Favorites</button>
    <span class="pm-status" ref="modelStatus"></span>
  </div>
  
  <div class="pm-directory" ref="directoryEl">
    <div class="pm-search">
      <span class="material-symbols-outlined" style="font-size:16px;color:var(--sn-text-dim)">search</span>
      <input type="text" ref="searchInput" placeholder="Search models by name or ID...">
    </div>
    <div class="pm-grid-header" ref="sortHeaders">
      <div></div>
      <div class="sortable" data-sort="name">Model <span class="s-icon"></span></div>
      <div class="sortable" data-sort="context_desc">Context <span class="s-icon"></span></div>
      <div class="sortable" data-sort="newest">Date <span class="s-icon"></span></div>
      <div class="sortable" data-sort="price_asc">Prompt / 1M <span class="s-icon"></span></div>
      <div class="sortable" data-sort="price_asc_out">Output / 1M <span class="s-icon"></span></div>
    </div>
    <div class="pm-grid-body" ref="directoryList"></div>
  </div>
</div>
`;