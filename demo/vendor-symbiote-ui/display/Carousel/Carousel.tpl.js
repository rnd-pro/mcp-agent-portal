import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="sn-carousel-container">
    <div class="sn-carousel-viewport" ref="viewport">
      <slot></slot>
    </div>
    <button ref="prevBtn" type="button" class="sn-carousel-nav-btn sn-carousel-nav-prev" aria-label="Previous slide">
      <span class="material-symbols-outlined">chevron_left</span>
    </button>
    <button ref="nextBtn" type="button" class="sn-carousel-nav-btn sn-carousel-nav-next" aria-label="Next slide">
      <span class="material-symbols-outlined">chevron_right</span>
    </button>
  </div>
  <div ref="pagination" class="sn-carousel-pagination"></div>
`;
