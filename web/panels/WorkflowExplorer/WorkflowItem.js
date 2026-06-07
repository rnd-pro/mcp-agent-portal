import { Symbiote, html } from '@symbiotejs/symbiote';
import 'symbiote-ui/ui';
import { bindListItemSelect, syncListItem } from 'symbiote-ui/ui';

export class WorkflowItem extends Symbiote {
  init$ = {
    name: '',
    stepCountText: '',
    isActive: false,
  };

  renderCallback() {
    this.#syncListItem();
    this.sub('name', () => this.#syncListItem());
    this.sub('stepCountText', () => this.#syncListItem());
    this.sub('isActive', () => this.#syncListItem());
  }

  #syncListItem() {
    let listItem = syncListItem(this, {
      label: this.$.name,
      description: this.$.stepCountText,
      active: this.$.isActive,
      name: this.$.name,
      stepCountText: this.$.stepCountText,
    }, {
      active: this.$.isActive,
    });
    if (listItem) {
      bindListItemSelect(this, 'workflow-item-select', (event) => ({
        item: event.detail?.item || null,
        name: this.$.name,
      }));
    }
  }
}

WorkflowItem.template = html`
<sn-list-item ref="listItem"></sn-list-item>
`;

WorkflowItem.rootStyles = `
:host,
we-workflow-item {
  display: block;
}
sn-list-item {
  --sn-list-item-radius: 0;
  --sn-list-item-padding: 10px 14px;
  --sn-list-item-label-size: 13px;
  --sn-list-item-description-size: 11px;
}
:host([active]) sn-list-item,
we-workflow-item[active] sn-list-item  {
  --sn-list-item-label-color: var(--sn-node-selected);
  --sn-list-item-padding: 10px 14px 10px 11px;
}
`;

WorkflowItem.reg('we-workflow-item');
export default WorkflowItem;
