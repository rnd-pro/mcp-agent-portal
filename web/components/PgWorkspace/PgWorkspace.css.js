import { css } from '@symbiotejs/symbiote';
export default css`
pg-workspace {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

pg-workspace[hidden] {
  display: none;
}

pg-workspace > .app-content {
  flex: 1;
  position: relative;
  overflow: hidden;
  min-width: 0;
}

pg-workspace > .app-content > panel-layout {
  width: 100%;
  height: 100%;
}
`;
