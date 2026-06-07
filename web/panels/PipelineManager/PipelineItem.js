import { Symbiote, html } from '@symbiotejs/symbiote';
import 'symbiote-ui/ui';
import { bindListItemSelect, syncListItem } from 'symbiote-ui/ui';

export class PipelineItem extends Symbiote {
  init$ = {
    name: '',
    isActive: false,
  };

  renderCallback() {
    this.#syncListItem();
    this.sub('name', () => this.#syncListItem());
    this.sub('isActive', () => this.#syncListItem());
  }

  #syncListItem() {
    let listItem = syncListItem(this, {
      label: this.$.name,
      icon: 'schema',
      active: this.$.isActive,
      name: this.$.name,
    }, {
      active: this.$.isActive,
    });
    if (listItem) {
      bindListItemSelect(this, 'pipeline-item-select', (event) => ({
        item: event.detail?.item || null,
        name: this.$.name,
      }));
    }
  }
}

PipelineItem.template = html`
<sn-list-item ref="listItem"></sn-list-item>
`;

PipelineItem.rootStyles = `
:host,
pm-pipeline-item {
  display: block;
}
sn-list-item {
  --sn-icon-font: 'Material Symbols Outlined';
  --sn-list-item-radius: 0;
  --sn-list-item-padding: 10px 14px;
  --sn-list-item-label-size: 13px;
}
:host([active]) sn-list-item,
pm-pipeline-item[active] sn-list-item  {
  --sn-list-item-label-color: var(--sn-node-selected);
  --sn-list-item-padding: 10px 14px 10px 11px;
}
`;
PipelineItem.reg('pm-pipeline-item');

export default PipelineItem;
