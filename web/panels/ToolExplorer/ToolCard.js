import { Symbiote, html } from '@symbiotejs/symbiote';

export class ToolCard extends Symbiote {
  init$ = {
    name: '',
    description: '',
    schemaJson: '{}',
  };
}

ToolCard.template = html`
<div class="ui-card">
  <div class="te-tool-name" ${{ textContent: 'name' }}></div>
  <div class="te-tool-desc" ${{ textContent: 'description' }}></div>
  <div>
    <div class="te-schema-title">Input Schema</div>
    <div class="te-schema-block" ${{ textContent: 'schemaJson' }}></div>
  </div>
</div>
`;

ToolCard.rootStyles = `
:host {
  display: block;
  color: var(--sn-text);
  font-family: var(--sn-font, 'Inter', -apple-system, sans-serif);
}
.ui-card {
  background: var(--sn-node-bg);
  border: 1px solid var(--sn-node-border);
  border-radius: 8px;
  padding: 14px;
  margin-bottom: 12px;
}
.te-tool-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--sn-node-selected);
  font-family: var(--sn-font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
}
.te-tool-desc {
  font-size: 12px;
  opacity: 0.8;
  line-height: 1.5;
  margin-top: 8px;
  margin-bottom: 12px;
}
.te-schema-block {
  background: var(--sn-bg);
  padding: 10px;
  border-radius: 6px;
  font-family: var(--sn-font-mono, ui-monospace, SFMono-Regular, monospace);
  font-size: 11px;
  overflow-x: auto;
  color: #a8b2d1;
  white-space: pre-wrap;
  border: 1px solid var(--sn-node-border);
}
.te-schema-title {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--sn-text-dim);
  margin-bottom: 6px;
}
`;

ToolCard.reg('te-tool-card');
export default ToolCard;
