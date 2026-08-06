import { html } from '@symbiotejs/symbiote';

export default html`
<div class="sn-loading-overlay">
  <div class="sn-loading-label" ${{ textContent: 'label' }}></div>
  <div class="sn-loading-phase" ${{ textContent: 'phase' }}></div>
  <div class="sn-loading-track">
    <div class="sn-loading-bar"></div>
  </div>
  <div class="sn-loading-sub" ${{ textContent: 'sub' }}></div>
</div>
`;
