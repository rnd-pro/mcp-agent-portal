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
      <div class="ui-list" ref="workflowList" ${{ itemize: 'workflows', 'item-tag': 'we-workflow-item' }}></div>
      <div class="ui-empty-state" ${{ hidden: '!workflowListEmptyText' }}>{{workflowListEmptyText}}</div>
    </div>
  </div>
  <div class="ui-main">
    <div class="ui-empty-state" ${{ hidden: 'hasSelectedWorkflow' }}>{{mainEmptyText}}</div>
    <div class="ui-details" ${{ hidden: '!hasSelectedWorkflow' }}>
      <div class="ui-details-header">
        <div>
          <h2 class="ui-details-title">{{selectedWorkflowName}}</h2>
          <div class="ui-details-desc">Workflow Diagram & Steps</div>
        </div>
      </div>
      <div class="ui-empty-state" ${{ hidden: 'hasSteps' }}>No steps defined for this workflow</div>
      <div ref="stepsList" ${{ itemize: 'steps', 'item-tag': 'we-workflow-step' }}></div>
    </div>
  </div>
</div>
`;
