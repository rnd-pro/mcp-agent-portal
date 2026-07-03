import { css } from '@symbiotejs/symbiote';
export default css`
:host { display: block; height: 100%; },
pg-peer-review { display: block; height: 100%; }

sn-list-detail-shell {
  height: 100%;
  --sn-list-detail-sidebar-width: minmax(320px, 42%);
}

.pr-card-full {
  height: 100%;
  display: flex;
  flex-direction: column;
  margin-bottom: 0;
}

.pr-input-stack {
  display: grid;
  gap: 12px;
}

.pr-history {
  min-height: 100px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 4px;
  font-family: inherit;
  font-size: 14px;
  resize: vertical;
}

.pr-feedback-body {
  flex: 1;
  background: var(--sn-sys-surface-raised);
  padding: 16px;
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.6;
  border: 1px solid var(--sn-sys-outline);
  white-space: pre-wrap;
  overflow-y: auto;
}

.pr-verdict-row {
  margin-bottom: 16px;
}

.pr-verdict-badge {
  --sn-badge-font-size: 14px;
  --sn-badge-padding: 4px 12px;
}

.pr-result-preview {
  background: transparent;
  border: none;
  padding: 0;
}

.pr-result-text {
  margin: 0;
  white-space: pre-wrap;
  font-size: 13px;
  line-height: 1.6;
}

.pr-spin {
  animation: spin 2s linear infinite;
}
`;
