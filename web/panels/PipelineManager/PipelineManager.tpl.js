import { html } from '@symbiotejs/symbiote';

export default html`
<sn-list-detail-shell
  sidebar-title="Pipelines"
  sidebar-icon="schema"
  detail-title="Pipeline"
  detail-icon="schema"
  ${{ '@has-detail': 'hasDetail' }}
>
  <sn-button slot="sidebar-actions" variant="icon" title="New Pipeline" ref="newBtn"><span class="material-symbols-outlined">add</span></sn-button>
  <sn-button slot="sidebar-actions" variant="icon" title="Refresh" ref="refreshBtn"><span class="material-symbols-outlined">refresh</span></sn-button>
  <div slot="list">
    <sn-empty-state ref="pipelineState">Loading...</sn-empty-state>
    <div ref="pipelineList" ${{ itemize: 'pipelines', 'item-tag': 'pm-pipeline-item' }}></div>
  </div>
  <div slot="detail" ref="mainContent"></div>
  <sn-empty-state slot="detail-empty">{{mainEmptyText}}</sn-empty-state>
</sn-list-detail-shell>
`;
