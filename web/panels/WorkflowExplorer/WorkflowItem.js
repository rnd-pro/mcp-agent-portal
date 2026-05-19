import { Symbiote, html } from '@symbiotejs/symbiote';

export class WorkflowItem extends Symbiote {
  init$ = {
    name: '',
    stepCountText: '',
    isActive: false,
  };

  renderCallback() {
    this.sub('isActive', (val) => {
      this.toggleAttribute('active', Boolean(val));
    });
  }
}

WorkflowItem.template = html`
<div class="ui-item" ${{ onclick: '^onWorkflowSelect' }}>
  <div class="ui-item-title" ${{ textContent: 'name' }}></div>
  <div class="ui-item-desc" ${{ textContent: 'stepCountText' }}></div>
</div>
`;

WorkflowItem.rootStyles = `
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
`;

WorkflowItem.reg('we-workflow-item');
export default WorkflowItem;
