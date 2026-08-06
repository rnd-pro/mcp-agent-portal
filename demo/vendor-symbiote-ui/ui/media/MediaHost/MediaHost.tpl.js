import { html } from '@symbiotejs/symbiote';

export default html`
  <div ref="poster" class="sn-media-poster">
    <img ref="posterImg" class="sn-media-poster-img" alt="" draggable="false" />
    <button ref="button" type="button" class="sn-media-activate">
      <span ref="buttonLabel" class="sn-media-activate-label"></span>
    </button>
  </div>
  <div ref="stage" class="sn-media-stage"></div>
`;
