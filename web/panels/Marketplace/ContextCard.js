import { Symbiote, html } from '@symbiotejs/symbiote';

const css = `
:host {
  display: block;
}

.ui-card {
  background: var(--sn-node-bg);
  border: 1px solid var(--sn-node-border);
  border-radius: 8px;
  padding: 14px;
  margin-bottom: 12px;
}

.ui-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  background: var(--sn-node-bg);
  border: 1px solid var(--sn-node-border);
  color: var(--sn-text-dim);
}

.ui-badge.info {
  color: var(--sn-node-selected);
  border-color: var(--sn-node-selected);
}

.ui-btn {
  background: var(--sn-node-bg);
  color: var(--sn-text);
  border: 1px solid var(--sn-node-border);
  padding: 6px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-family: inherit;
  transition: border-color 0.15s, background-color 0.15s;
}

.ui-btn:hover:not(:disabled) {
  border-color: var(--sn-node-selected);
}

.ui-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ui-btn.primary {
  background: var(--sn-node-selected);
  border-color: var(--sn-node-selected);
  color: #fff;
}

.mp-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mp-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.mp-card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.mp-card-desc {
  font-family: monospace;
  font-size: 11px;
  margin-bottom: 12px;
  opacity: 0.6;
}

.mp-card-actions {
  display: flex;
  gap: 8px;
}

.mp-form-status {
  margin-top: 8px;
  font-size: 11px;
  min-height: 14px;
}

.material-symbols-outlined {
  font-size: 16px;
}
`;

export class ContextCard extends Symbiote {
  init$ = {
    title: '',
    description: '',
    type: '',
    icon: 'lightbulb',
    status: '',
    isError: false,
  };

  renderCallback() {
    this.sub('isError', (isError) => {
      this.ref.status.style.color = isError ? '#ef4444' : 'inherit';
    });
  }
}

ContextCard.template = html`
<div class="ui-card">
  <div class="mp-card-header">
    <div class="mp-card-title">
      <span class="mp-card-icon">
        <span class="material-symbols-outlined" ${{ textContent: 'icon' }}></span>
      </span>
      <span style="word-break:break-all" ${{ textContent: 'title' }}></span>
    </div>
    <span class="ui-badge info" style="margin-left:auto" ${{ textContent: 'type' }}></span>
  </div>
  <div class="mp-card-desc" ${{ textContent: 'description' }}></div>
  <div class="mp-card-actions">
    <button class="ui-btn" style="flex:1" data-dest="project" ${{ onclick: '^onContextInstall' }}>
      <span class="material-symbols-outlined">download</span> Project
    </button>
    <button class="ui-btn primary" style="flex:1" data-dest="team" ${{ onclick: '^onContextInstall' }}>
      <span class="material-symbols-outlined">group</span> Team
    </button>
  </div>
  <div class="mp-form-status" ref="status" ${{ textContent: 'status' }}></div>
</div>
`;

ContextCard.rootStyles = css;
ContextCard.reg('mp-context-card');

export default ContextCard;
