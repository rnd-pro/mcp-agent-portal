import { html } from '@symbiotejs/symbiote';

export default html`
  <nav class="sn-pagination-nav" aria-label="Pagination Navigation" ${{ onclick: 'onNavClick' }}>
    <button class="sn-pagination-btn sn-pagination-prev" data-action="prev" ${{ '@disabled': 'prevDisabled' }} aria-label="Go to previous page">
      <span class="material-symbols-outlined" aria-hidden="true">chevron_left</span>
    </button>
    <div class="sn-pagination-pages" style="display: inline-flex; gap: inherit;" ${{ innerHTML: 'pagesHtml' }}></div>
    <button class="sn-pagination-btn sn-pagination-next" data-action="next" ${{ '@disabled': 'nextDisabled' }} aria-label="Go to next page">
      <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
    </button>
  </nav>
`;
