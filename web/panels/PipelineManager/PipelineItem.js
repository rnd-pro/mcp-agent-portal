import { Symbiote, html } from '@symbiotejs/symbiote';
import cssShared from '../../common/ui-shared.css.js';

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
