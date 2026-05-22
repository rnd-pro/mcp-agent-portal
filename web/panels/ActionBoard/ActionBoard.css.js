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
}

.ab-stat-label {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--sn-text-dim);
}

.ab-stat-value {
  font-size: 24px;
  font-weight: 600;
  font-family: var(--sn-font-mono);
}

.ab-stat-unit {
  font-size: 14px;
  color: var(--sn-text-dim);
}

.ab-events {
  flex: 1;
  overflow-y: auto;
}
`;
