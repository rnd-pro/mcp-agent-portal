import { html } from '@symbiotejs/symbiote';

export default html`
<div class="ui-split-container">
  <div class="ui-sidebar">
    <div class="ui-sidebar-header">
      <div class="ui-title">Workflows</div>
      <button class="ui-btn-icon" ref="refreshBtn" title="Refresh">
        <span class="material-symbols-outlined">refresh</span>
      </button>
    </div>
    <div class="ui-sidebar-content">
      <div class="ui-list" ref="workflowList"></div>
    </div>
  </div>
  <div class="ui-main" ref="mainContent">
    <div class="ui-empty-state">Select a workflow to view details</div>
  </div>
</div>
`;
