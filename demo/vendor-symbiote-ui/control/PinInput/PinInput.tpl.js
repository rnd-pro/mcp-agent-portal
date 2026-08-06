import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="sn-pin-container">
    <div ref="cellsContainer" class="sn-pin-cells" role="group" aria-label="PIN code"></div>
    <button ref="maskToggle" type="button" class="sn-pin-mask-toggle" aria-label="Toggle pin mask" aria-pressed="false">
      <span class="material-symbols-outlined" ref="toggleIcon">visibility_off</span>
    </button>
  </div>
`;
