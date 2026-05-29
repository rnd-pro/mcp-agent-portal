import { css } from '@symbiotejs/symbiote';

export default css`
:host,
pg-agent-list-item {
  display: block;
}

.agent-list-item-shell {
  display: block;
}

sn-list-item {
  --sn-icon-font: 'Material Symbols Outlined';
  --sn-list-item-radius: 4px;
  --sn-list-item-padding: 8px 10px;
  --sn-list-item-label-size: 12px;
  --sn-list-item-description-size: 11px;
  --sn-list-item-meta-size: 10px;
}

:host([active]) sn-list-item,
pg-agent-list-item[active] sn-list-item  {
  --sn-list-item-padding: 8px 10px 8px 7px;
  --sn-list-item-active-border: var(--sn-node-selected);
}

:host([active]),
pg-agent-list-item[active]  {
  color: var(--sn-node-selected);
}
`;
