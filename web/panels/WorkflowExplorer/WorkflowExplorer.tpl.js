import { html } from '@symbiotejs/symbiote';

export default html`
<sn-list-detail-shell
  sidebar-title="Workflows"
  sidebar-icon="account_tree"
  detail-icon="schema"
  detail-description="Workflow Diagram & Steps"
  ${{ 'detail-title': 'selectedWorkflowName', '@has-detail': 'hasSelectedWorkflow' }}
>
  <sn-button slot="sidebar-actions" variant="icon" ref="refreshBtn" title="Refresh">
    <span class="material-symbols-outlined">refresh</span>
  </sn-button>
  <div slot="list" ref="workflowList" ${{ itemize: 'workflows', 'item-tag': 'we-workflow-item' }}></div>
  <sn-empty-state slot="list-empty" ${{ hidden: '!workflowListEmptyText' }}>{{workflowListEmptyText}}</sn-empty-state>
  <div slot="detail">
    <sn-empty-state ${{ hidden: 'hasSteps' }}>No steps defined for this workflow</sn-empty-state>
    <div ref="stepsList" ${{ itemize: 'steps', 'item-tag': 'we-workflow-step' }}></div>
  </div>
  <sn-empty-state slot="detail-empty">{{mainEmptyText}}</sn-empty-state>
</sn-list-detail-shell>
`;
