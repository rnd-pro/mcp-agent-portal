import { Symbiote, html } from '@symbiotejs/symbiote';
import { sharedUiStyles as cssShared } from 'symbiote-ui/ui';

const css = `
:host,
mp-server-card {
  display: block;
}

sn-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: calc(100% - 12px);
  box-sizing: border-box;
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
  color: var(--sn-sys-on-surface);
}

.mp-card-icon .material-symbols-outlined {
  font-size: 20px;
  color: var(--sn-sys-on-surface);
}

.mp-card-source {
  font-size: 10px;
  opacity: 0.3;
  margin-top: 1px;
}

.mp-card-name {
  margin-bottom: 0;
}

.mp-card-desc {
  font-size: 11.5px;
  line-height: 1.5;
  opacity: 0.6;
}

.mp-card-env {
  font-size: 10px;
  opacity: 0.35;
  font-family: var(--sn-font-mono);
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
  background: var(--sn-sys-success);
  box-shadow: 0 0 6px var(--sn-sys-success);
}

.mp-status-dot[data-active="false"] {
  background: var(--sn-sys-on-surface-faint);
}

sn-button.mp-card-toggle {
  --sn-button-bg: transparent;
  --sn-button-padding: 4px 10px;
  --sn-button-radius: 6px;
  --sn-button-font-size: 11px;
  --sn-button-min-height: 26px;
}

sn-button.mp-card-toggle:hover {
  --sn-button-hover-bg: color-mix(in srgb, var(--sn-sys-accent) 12%, transparent);
  --sn-button-hover-border: var(--sn-sys-accent);
}

sn-button.mp-card-toggle[data-action="remove"]:hover {
  --sn-button-hover-bg: color-mix(in srgb, var(--sn-sys-danger) 12%, transparent);
  --sn-button-hover-border: var(--sn-sys-danger);
}

sn-button.mp-card-toggle[disabled] {
  --sn-button-disabled-opacity: 0.3;
}
`;

export class McpServerCard extends Symbiote {
  init$ = {
    name: '',
    description: '',
    icon: 'bolt',
    gradient: 'linear-gradient(135deg, var(--sn-sys-accent), var(--sn-sys-accent-container))',
    sourceHost: '',
    envHint: '',
    status: 'Available',
    action: 'install',
    actionLabel: 'Install',
    isInstalled: 'false',
  };
}

McpServerCard.template = html`
<sn-card>
  <div class="mp-card-header">
    <div class="mp-card-icon" ${{ 'style.background': 'gradient' }}>
      <span class="material-symbols-outlined" ${{ textContent: 'icon' }}></span>
    </div>
    <div>
      <div class="sn-card-title mp-card-name" ${{ textContent: 'name' }}></div>
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
    <sn-button class="mp-card-toggle" ${{ '@data-action': 'action', textContent: 'actionLabel', onclick: '^onServerAction' }}></sn-button>
  </div>
</sn-card>
`;

McpServerCard.rootStyles = cssShared + css;
McpServerCard.reg('mp-server-card');

export default McpServerCard;
