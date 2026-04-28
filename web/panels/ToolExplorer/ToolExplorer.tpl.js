import { html } from '@symbiotejs/symbiote';

export default html`
<div class="ui-split-container">
  <div class="ui-sidebar">
    <div class="ui-sidebar-header">
      <div class="ui-title">Servers</div>
    </div>
    <div class="ui-sidebar-content">
      <div class="ui-list" ref="serverList"></div>
    </div>
  </div>
  <div class="ui-main" style="padding:0">
    <div class="ui-header">
      <div class="ui-title-large">
        <span class="material-symbols-outlined">build</span>
        Tool Explorer: {{selectedServerName}}
      </div>
    </div>
    <div class="te-tools-grid" ref="toolsGrid">
      <div class="ui-empty-state">Select a server to view tools</div>
    </div>
  </div>
</div>
`;
