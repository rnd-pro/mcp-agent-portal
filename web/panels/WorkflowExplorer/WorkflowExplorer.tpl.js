import { html } from '@symbiotejs/symbiote';

export default html`
<div class="ui-split-container">
  <div class="ui-sidebar">
    <div class="ui-sidebar-header">
      <div class="ui-title">Workflows</div>
      <sn-button variant="icon" ref="refreshBtn" title="Refresh">
        <span class="material-symbols-outlined">refresh</span>
      </sn-button>
    </div>
    <div class="ui-sidebar-content">
      <div class="ui-list" ref="workflowList" ${{ itemize: 'workflows', 'item-tag': 'we-workflow-item' }}></div>
      <sn-empty-state ${{ hidden: '!workflowListEmptyText' }}>{{workflowListEmptyText}}</sn-empty-state>
    </div>
  </div>
  <div class="ui-main">
    <sn-empty-state ${{ hidden: 'hasSelectedWorkflow' }}>{{mainEmptyText}}</sn-empty-state>
    <div class="ui-details" ${{ hidden: '!hasSelectedWorkflow' }}>
      <div class="ui-details-header">
        <div>
          <h2 class="ui-details-title">{{selectedWorkflowName}}</h2>
          <div class="ui-details-desc">Workflow Diagram & Steps</div>
        </div>
      </div>
      <sn-empty-state ${{ hidden: 'hasSteps' }}>No steps defined for this workflow</sn-empty-state>
      <div ref="stepsList" ${{ itemize: 'steps', 'item-tag': 'we-workflow-step' }}></div>
    </div>
  </div>
</div>
`;
