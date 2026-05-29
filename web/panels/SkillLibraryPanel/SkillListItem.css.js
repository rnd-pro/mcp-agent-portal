import { css } from '@symbiotejs/symbiote';

export default css`
:host,
pg-skill-list-item {
  display: block;
}

.skill-list-item-shell {
  display: block;
}

sn-list-item {
  --sn-icon-font: 'Material Symbols Outlined';
  --sn-list-item-radius: 4px;
  --sn-list-item-padding: 8px 10px;
  --sn-list-item-icon-color: var(--sn-warning-color);
  --sn-list-item-label-size: 12px;
  --sn-list-item-description-size: 11px;
}
`;
