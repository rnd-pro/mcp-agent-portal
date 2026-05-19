import { Symbiote, html } from '@symbiotejs/symbiote';

export class ToolServerItem extends Symbiote {
  init$ = {
    name: '',
    toolCountText: '',
    isActive: false,
  };

  renderCallback() {
    this.sub('isActive', (val) => {
      this.toggleAttribute('active', Boolean(val));
    });
  }
}

ToolServerItem.template = html`
<div class="ui-item" ${{ onclick: '^onServerSelect' }}>
  <div class="ui-item-title te-server-title">
    <span class="material-symbols-outlined">api</span>
    <span ${{ textContent: 'name' }}></span>
  </div>
  <div class="ui-item-desc" ${{ textContent: 'toolCountText', hidden: '!toolCountText' }}></div>
</div>
`;

ToolServerItem.rootStyles = `
:host {
  display: block;
  color: var(--sn-text);
  font-family: var(--sn-font, 'Inter', -apple-system, sans-serif);
}
.ui-item {
  padding: 10px 14px;
  background: transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-bottom: 1px solid var(--sn-node-hover);
  transition: background 0.15s;
}
.ui-item:hover {
  background: var(--sn-node-hover);
}
:host([active]) .ui-item {
  background: var(--sn-node-bg);
  border-left: 3px solid var(--sn-node-selected);
  padding-left: 11px;
}
.ui-item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--sn-text);
}
:host([active]) .ui-item-title {
  color: var(--sn-node-selected);
}
.ui-item-desc {
  font-size: 11px;
  color: var(--sn-text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.te-server-title {
  display: flex;
  align-items: center;
  gap: 6px;
}
.te-server-title .material-symbols-outlined {
  font-size: 16px;
}
`;

ToolServerItem.reg('te-server-item');
export default ToolServerItem;
