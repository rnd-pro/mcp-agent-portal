import { css } from '@symbiotejs/symbiote';
export default css`
:host { display: block; height: 100%; }

.ab-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.ab-stats {
  padding: 16px;
  border-bottom: 1px solid var(--sn-node-border);
  display: flex;
  gap: 24px;
  background: var(--sn-node-bg);
  flex-shrink: 0;
  --sn-metric-border: transparent;
  --sn-metric-label-size: 11px;
  --sn-metric-value-size: 24px;
}

.ab-stat-unit {
  font-size: 14px;
  color: var(--sn-text-dim);
}

sn-event-feed {
  flex: 1;
  min-height: 0;
}
`;
