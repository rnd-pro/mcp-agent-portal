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
  <sn-button slot="detail-actions" variant="primary" ${{ onclick: 'runSelectedPipeline', hidden: '!hasPipelineDetail' }}>
    <span class="material-symbols-outlined">play_arrow</span>
    Run Pipeline
  </sn-button>
  <div slot="detail" class="pm-detail">
    <div class="pm-detail-section" ${{ hidden: '!hasPipelineDetail' }}>
      <div class="pm-detail-heading">
        <h2 class="pm-detail-title">{{selectedPipelineName}}</h2>
        <div class="pm-detail-desc">{{selectedPipelineDescription}}</div>
      </div>
      <sn-empty-state ${{ hidden: 'hasSteps' }}>No steps defined for this pipeline</sn-empty-state>
      <div class="pm-steps" ${{ itemize: 'steps', 'item-tag': 'pm-pipeline-step' }}></div>
    </div>
    <div class="pm-detail-section" ${{ hidden: '!hasCreateDetail' }}>
      <h2 class="pm-detail-title">Create New Pipeline</h2>
      <div class="pm-detail-desc">Use Agent Chat to design and create a pipeline with the create_pipeline tool.</div>
    </div>
  </div>
  <sn-empty-state slot="detail-empty">{{mainEmptyText}}</sn-empty-state>
</sn-list-detail-shell>
`;
