import { Symbiote, html } from '@symbiotejs/symbiote';
import 'symbiote-ui/ui';
import { bindListItemSelect, syncListItem } from 'symbiote-ui/ui';

export class ToolServerItem extends Symbiote {
  init$ = {
    name: '',
    toolCountText: '',
    isActive: false,
  };

  renderCallback() {
    this.#syncListItem();
    this.sub('name', () => this.#syncListItem());
    this.sub('toolCountText', () => this.#syncListItem());
    this.sub('isActive', () => this.#syncListItem());
  }

  #syncListItem() {
    let listItem = syncListItem(this, {
      label: this.$.name,
      description: this.$.toolCountText,
      icon: 'api',
      active: this.$.isActive,
      name: this.$.name,
      toolCountText: this.$.toolCountText,
    }, {
      active: this.$.isActive,
    });
    if (listItem) {
      bindListItemSelect(this, 'tool-server-item-select', (event) => ({
        item: event.detail?.item || null,
        name: this.$.name,
      }));
    }
  }
}

ToolServerItem.template = html`
<sn-list-item ref="listItem"></sn-list-item>
`;

ToolServerItem.rootStyles = `
:host,
te-server-item {
  display: block;
}
sn-list-item {
  --sn-icon-font: 'Material Symbols Outlined';
  --sn-list-item-radius: 0;
  --sn-list-item-padding: 10px 14px;
  --sn-list-item-label-size: 13px;
  --sn-list-item-description-size: 11px;
}
:host([active]) sn-list-item,
te-server-item[active] sn-list-item {
  --sn-list-item-label-color: var(--sn-node-selected);
  --sn-list-item-padding: 10px 14px 10px 11px;
}
`;

ToolServerItem.reg('te-server-item');
export default ToolServerItem;
