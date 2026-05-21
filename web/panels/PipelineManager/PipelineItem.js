import { Symbiote, html } from '@symbiotejs/symbiote';
import { sharedUiStyles as cssShared } from 'symbiote-node/ui';

export class PipelineItem extends Symbiote {
  init$ = {
    name: '',
    itemClass: 'ui-item',
  };
}

PipelineItem.template = html`
<div ${{ className: 'itemClass', '@data-pipeline-id': 'name', onclick: '^onPipelineSelect' }}>
  <div class="ui-item-title" ${{ textContent: 'name' }}></div>
</div>
`;

PipelineItem.rootStyles = cssShared;
PipelineItem.reg('pm-pipeline-item');

export default PipelineItem;
