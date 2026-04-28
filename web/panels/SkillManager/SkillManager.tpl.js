export default `
<div class="ui-split-container">
  <div class="ui-sidebar">
    <div class="ui-sidebar-header">
      <div class="ui-title"><span class="material-symbols-outlined">school</span> Skills & Policies</div>
      <button class="ui-btn-icon" title="New Skill" ref="newBtn"><span class="material-symbols-outlined">add</span></button>
      <button class="ui-btn-icon" title="Refresh" ref="refreshBtn"><span class="material-symbols-outlined">refresh</span></button>
    </div>
    <div class="ui-sidebar-content">
      <div style="border-bottom: 1px solid var(--sn-color-border, #404040);">
        <div style="padding: 8px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--sn-color-text-muted, #9ca3af); background: rgba(0,0,0,0.2);">Project</div>
        <div class="ui-list" ref="projectList"></div>
      </div>
      <div style="border-bottom: 1px solid var(--sn-color-border, #404040);">
        <div style="padding: 8px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--sn-color-text-muted, #9ca3af); background: rgba(0,0,0,0.2);">Global</div>
        <div class="ui-list" ref="globalList"></div>
      </div>
      <div style="border-bottom: 1px solid var(--sn-color-border, #404040);">
        <div style="padding: 8px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--sn-color-text-muted, #9ca3af); background: rgba(0,0,0,0.2);">Built-in</div>
        <div class="ui-list" ref="builtinList"></div>
      </div>
    </div>
  </div>
  <div class="ui-main" ref="mainContent">
    <div class="ui-empty-state">Select a skill or create a new one</div>
  </div>
</div>
`;
