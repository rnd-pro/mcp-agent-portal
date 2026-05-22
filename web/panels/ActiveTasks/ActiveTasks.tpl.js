import { html } from '@symbiotejs/symbiote';

export default html`
<div class="ui-container">
  <div class="ui-header">
    <div class="ui-title"><span class="material-symbols-outlined">memory</span> Active Tasks & Background Processes</div>
    <sn-button ref="refreshBtn"><span class="material-symbols-outlined">refresh</span> Refresh</sn-button>
  </div>
  <div class="ui-main" ref="contentGrid">
    <sn-empty-state ref="emptyState">No active tasks found.</sn-empty-state>
    <div ref="taskGrid" ${{ itemize: 'tasks', 'item-tag': 'at-task-card' }}></div>
  </div>
</div>
`;
