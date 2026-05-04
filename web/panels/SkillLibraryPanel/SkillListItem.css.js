import { css } from '@symbiotejs/symbiote';

export default css`
pg-skill-list-item {
  display: block;
}

.skill-layout {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon {
  font-size: 16px;
  color: hsl(30, 80%, 60%);
}

.skill-text-container {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1;
}
`;
