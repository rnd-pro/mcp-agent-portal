import { html } from '@symbiotejs/symbiote';
import { tPortal } from '../../common/localization.js';

export default html`
<sn-list-detail-shell
  sidebar-title="${tPortal('text.workflows')}"
  sidebar-icon="account_tree"
  detail-icon="schema"
  detail-description="${tPortal('text.workflowDiagramSteps')}"
  ${{ 'detail-title': 'selectedWorkflowName', '@has-detail': 'hasSelectedWorkflow' }}
>
  <sn-button slot="sidebar-actions" variant="icon" ref="refreshBtn" title="${tPortal('text.refresh')}">
    <span class="material-symbols-outlined">refresh</span>
  </sn-button>
  <div slot="list" ref="workflowList" ${{ itemize: 'workflows', 'item-tag': 'we-workflow-item' }}></div>
  <sn-empty-state slot="list-empty" ${{ hidden: '!workflowListEmptyText' }}>{{workflowListEmptyText}}</sn-empty-state>
  <div slot="detail">
    <sn-empty-state ${{ hidden: 'hasSteps' }}>${tPortal('text.noWorkflowSteps')}</sn-empty-state>
    <div ref="stepsList" ${{ itemize: 'steps', 'item-tag': 'we-workflow-step' }}></div>
  </div>
  <sn-empty-state slot="detail-empty">{{mainEmptyText}}</sn-empty-state>
</sn-list-detail-shell>
`;
