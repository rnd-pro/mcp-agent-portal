import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="sn-qr-container">
    <div class="sn-qr-svg-wrap">
      <svg ref="svg" class="sn-qr-svg" viewBox="0 0 21 21"></svg>
    </div>
    <div class="sn-qr-label">{{value}}</div>
  </div>
`;
