import { css } from '@symbiotejs/symbiote';
export default css`
:host { display: block; height: 100%; }

.pr-split {
  padding: 20px;
  gap: 20px;
}

.pr-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.pr-col-right {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.pr-card-full {
  height: 100%;
  display: flex;
  flex-direction: column;
  margin-bottom: 0;
}

.pr-feedback-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.pr-feedback-title {
  margin: 0;
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
  background: rgba(0, 0, 0, 0.2);
  padding: 16px;
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.6;
  border: 1px solid var(--sn-node-border, rgba(255, 255, 255, 0.1));
  white-space: pre-wrap;
  overflow-y: auto;
}
`;
