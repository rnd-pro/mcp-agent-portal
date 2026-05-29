import { html } from '@symbiotejs/symbiote';
import { tPortal } from '../../common/localization.js';

export default html`
<sn-list-detail-shell
  sidebar-title="${tPortal('text.pipelines')}"
  sidebar-icon="schema"
  detail-title="${tPortal('text.pipeline')}"
  detail-icon="schema"
  ${{ '@has-detail': 'hasDetail' }}
>
  <sn-button slot="sidebar-actions" variant="icon" title="${tPortal('text.createNewPipeline')}" ref="newBtn"><span class="material-symbols-outlined">add</span></sn-button>
  <sn-button slot="sidebar-actions" variant="icon" title="${tPortal('text.refresh')}" ref="refreshBtn"><span class="material-symbols-outlined">refresh</span></sn-button>
  <div slot="list">
    <sn-empty-state ref="pipelineState">${tPortal('text.loadingDots')}</sn-empty-state>
    <div ref="pipelineList" ${{ itemize: 'pipelines', 'item-tag': 'pm-pipeline-item' }}></div>
  </div>
  <sn-button slot="detail-actions" variant="primary" ${{ onclick: 'runSelectedPipeline', hidden: '!hasPipelineDetail' }}>
    <span class="material-symbols-outlined">play_arrow</span>
    ${tPortal('text.runPipeline')}
  </sn-button>
  <div slot="detail" class="pm-detail">
    <div class="pm-detail-section" ${{ hidden: '!hasPipelineDetail' }}>
      <div class="pm-detail-heading">
        <h2 class="pm-detail-title">{{selectedPipelineName}}</h2>
        <div class="pm-detail-desc">{{selectedPipelineDescription}}</div>
      </div>
      <sn-empty-state ${{ hidden: 'hasSteps' }}>${tPortal('text.noPipelineSteps')}</sn-empty-state>
      <div class="pm-steps" ${{ itemize: 'steps', 'item-tag': 'pm-pipeline-step' }}></div>
    </div>
    <div class="pm-detail-section" ${{ hidden: '!hasCreateDetail' }}>
      <h2 class="pm-detail-title">${tPortal('text.createNewPipeline')}</h2>
      <div class="pm-detail-desc">${tPortal('text.createPipelineDescription')}</div>
    </div>
  </div>
  <sn-empty-state slot="detail-empty">{{mainEmptyText}}</sn-empty-state>
</sn-list-detail-shell>
`;
