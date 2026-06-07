import { css } from '@symbiotejs/symbiote';
export default css`
:host {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

:host([hidden]) {
  display: none;
}

.app-content {
  flex: 1;
  position: relative;
  overflow: hidden;
  min-width: 0;
}

.app-content > panel-layout {
  width: 100%;
  height: 100%;
}
`;
