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
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: calc(100% - 12px);
  box-sizing: border-box;
}

.ui-card-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--sn-text-dim);
}

.mp-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mp-card-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
}

.mp-card-icon .material-symbols-outlined {
  font-size: 20px;
  color: #fff;
}

.mp-card-source {
  font-size: 10px;
  opacity: 0.3;
  margin-top: 1px;
}

.mp-card-desc {
  font-size: 11.5px;
  line-height: 1.5;
  opacity: 0.6;
}

.mp-card-env {
  font-size: 10px;
  opacity: 0.35;
  font-family: var(--sn-font-mono, monospace);
}

.mp-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
}

.mp-card-status {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
}

.mp-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.mp-status-dot[data-active="true"] {
  background: var(--sn-success-color);
  box-shadow: 0 0 6px var(--sn-success-color);
}

.mp-status-dot[data-active="false"] {
  background: var(--sn-node-hover);
}

.mp-card-toggle {
  background: none;
  border: 1px solid var(--sn-node-border);
  border-radius: 6px;
  color: inherit;
  font-size: 11px;
  padding: 4px 10px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.mp-card-toggle:hover {
  background: color-mix(in srgb, var(--sn-node-selected) 12%, transparent);
  border-color: var(--sn-node-selected);
}

.mp-card-toggle[data-action="remove"]:hover {
  background: color-mix(in srgb, var(--sn-danger-color) 12%, transparent);
  border-color: var(--sn-danger-color);
}

.mp-card-toggle:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
`;

export class McpServerCard extends Symbiote {
  init$ = {
    name: '',
    description: '',
    icon: 'bolt',
    gradient: 'linear-gradient(135deg, #6b7280, #4b5563)',
    sourceHost: '',
    envHint: '',
    status: 'Available',
    action: 'install',
    actionLabel: 'Install',
    isInstalled: 'false',
  };
}

McpServerCard.template = html`
<div class="ui-card">
  <div class="mp-card-header">
    <div class="mp-card-icon" ${{ 'style.background': 'gradient' }}>
      <span class="material-symbols-outlined" ${{ textContent: 'icon' }}></span>
    </div>
    <div>
      <div class="ui-card-title" style="margin-bottom:0" ${{ textContent: 'name' }}></div>
      <div class="mp-card-source" ${{ textContent: 'sourceHost', hidden: '!sourceHost' }}></div>
    </div>
  </div>
  <div class="mp-card-desc" ${{ textContent: 'description' }}></div>
  <div class="mp-card-env" ${{ textContent: 'envHint', hidden: '!envHint' }}></div>
  <div class="mp-card-footer">
    <div class="mp-card-status">
      <span class="mp-status-dot" ${{ 'data-active': 'isInstalled' }}></span>
      <span ${{ textContent: 'status' }}></span>
    </div>
    <button class="mp-card-toggle" ${{ '@data-action': 'action', textContent: 'actionLabel', onclick: '^onServerAction' }}></button>
  </div>
</div>
`;

McpServerCard.rootStyles = css;
McpServerCard.reg('mp-server-card');

export default McpServerCard;
