import { css } from '@symbiotejs/symbiote';

export default css`
pg-agent-list-item {
  display: block;
}

pg-agent-list-item[active] .ui-item {
  background: var(--sn-node-bg);
  border-left: 3px solid var(--sn-node-selected);
  padding-left: 11px;
}

.agent-layout {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon {
  font-size: 16px;
}

.name-label {
  flex: 1;
}

.ui-badge.project { color: var(--sn-success-color, hsl(140, 40%, 50%)); border-color: var(--sn-success-color, hsl(140, 40%, 50%)); }
.ui-badge.global { color: var(--sn-cat-server, hsl(210, 50%, 60%)); border-color: var(--sn-cat-server, hsl(210, 50%, 60%)); }
.ui-badge.built-in { color: var(--sn-warning-color, hsl(30, 50%, 60%)); border-color: var(--sn-warning-color, hsl(30, 50%, 60%)); }
`;
