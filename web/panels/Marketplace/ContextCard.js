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

.mp-card-title-text {
  word-break: break-all;
}

.mp-card-type {
  margin-left: auto;
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

.mp-context-btn {
  flex: 1;
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
      this.ref.status.style.color = isError ? 'var(--sn-danger-color)' : 'inherit';
    });
  }
}

ContextCard.template = html`
<sn-card>
  <div class="mp-card-header">
    <div class="mp-card-title">
      <span class="mp-card-icon">
        <span class="material-symbols-outlined" ${{ textContent: 'icon' }}></span>
      </span>
      <span class="mp-card-title-text" ${{ textContent: 'title' }}></span>
    </div>
    <span class="ui-badge info mp-card-type" ${{ textContent: 'type' }}></span>
  </div>
  <div class="mp-card-desc" ${{ textContent: 'description' }}></div>
  <div class="mp-card-actions">
    <sn-button class="mp-context-btn" data-dest="project" ${{ onclick: '^onContextInstall' }}>
      <span class="material-symbols-outlined">download</span> Project
    </sn-button>
    <sn-button variant="primary" class="mp-context-btn" data-dest="team" ${{ onclick: '^onContextInstall' }}>
      <span class="material-symbols-outlined">group</span> Team
    </sn-button>
  </div>
  <div class="mp-form-status" ref="status" ${{ textContent: 'status' }}></div>
</sn-card>
`;

ContextCard.rootStyles = cssShared + css;
ContextCard.reg('mp-context-card');

export default ContextCard;
