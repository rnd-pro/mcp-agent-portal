import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="sn-slider-wrapper">
    <div class="sn-slider-track-wrap">
      <div class="sn-slider-active-track" ref="activeTrack"></div>
      <div class="sn-slider-thumb" ref="thumb"></div>
    </div>
    <input type="range" ref="input" class="sn-slider-input">
  </div>
`;
