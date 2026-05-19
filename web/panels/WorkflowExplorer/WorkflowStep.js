import { Symbiote, html } from '@symbiotejs/symbiote';

export class WorkflowStep extends Symbiote {
  init$ = {
    id: '',
    name: '',
    description: 'No description provided.',
    toolsText: '',
    isExpanded: false,
    contentLoaded: false,
  };

  renderCallback() {
    this.sub('isExpanded', (val) => {
      this.toggleAttribute('expanded', Boolean(val));
    });
  }
}

WorkflowStep.template = html`
<div class="step-card">
  <div class="step-header" ${{ onclick: '^onStepToggle' }}>
    <div class="step-title">
      <span class="material-symbols-outlined">psychology</span>
      <span ${{ textContent: 'name' }}></span>
    </div>
    <div class="node-id" ${{ textContent: 'id' }}></div>
  </div>
  <div class="step-content">
    <div class="step-description" ${{ textContent: 'description' }}></div>
    <div class="step-tools" ${{ textContent: 'toolsText', hidden: '!toolsText' }}></div>
    <div class="step-markdown-container" ref="markdownContainer">Loading content...</div>
  </div>
</div>
`;

WorkflowStep.rootStyles = `
:host {
  display: block;
  color: var(--sn-text);
  font-family: var(--sn-font, 'Inter', -apple-system, sans-serif);
}
.step-card {
  margin-bottom: 12px;
  background: var(--sn-node-bg, rgba(0,0,0,0.1));
  border: 1px solid var(--sn-node-border, rgba(255,255,255,0.1));
  border-radius: 6px;
  overflow: hidden;
}
.step-header {
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  background: rgba(0,0,0,0.05);
  font-weight: 500;
}
.step-header:hover {
  background: rgba(255,255,255,0.05);
}
.step-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.step-title .material-symbols-outlined {
  font-size: 16px;
  color: var(--sn-cat-server);
}
.step-content {
  padding: 16px;
  border-top: 1px solid var(--sn-node-border, rgba(255,255,255,0.1));
  display: none;
}
:host([expanded]) .step-content {
  display: block;
}
:host([expanded]) .step-header {
  background: rgba(255,255,255,0.05);
}
.step-description {
  margin-bottom: 12px;
  color: var(--sn-text-dim);
}
.step-tools {
  margin-bottom: 12px;
  font-size: 11px;
  color: var(--sn-text-dim);
  font-family: var(--sn-font-mono, ui-monospace, SFMono-Regular, monospace);
}
.ui-empty-state {
  padding: 20px;
  text-align: center;
  color: var(--sn-text-dim);
  font-size: 13px;
  font-style: italic;
}
.node-id {
  flex-shrink: 0;
  font-size: 11px;
  font-family: monospace;
  color: var(--sn-text-dim);
  background: rgba(0,0,0,0.2);
  padding: 2px 6px;
  border-radius: 4px;
}
`;

WorkflowStep.reg('we-workflow-step');
export default WorkflowStep;
