import { Symbiote, html } from '@symbiotejs/symbiote';
import { sharedUiStyles as cssShared } from 'symbiote-node/ui';

const css = `
:host {
  display: block;
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

ContextCard.rootStyles = cssShared + css;
ContextCard.reg('mp-context-card');

export default ContextCard;
