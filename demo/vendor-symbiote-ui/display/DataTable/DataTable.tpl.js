import { html } from '@symbiotejs/symbiote';

export default html`
<section class="sn-data-table">
  <div class="sn-data-table-loading-overlay" ${{ '@hidden': '!loading' }}>
    <span class="sn-data-table-spinner"></span>
    <span class="sn-data-table-loading-text" ${{ textContent: 'loadingText' }}></span>
  </div>
  <div class="sn-data-table-error" ${{ '@hidden': '!errorText', textContent: 'errorText' }}></div>
  <div class="sn-data-table-empty" ${{ textContent: 'emptyText', '@hidden': 'showTable' }}></div>
  <div class="sn-data-table-scroll" ${{ '@hidden': 'hideTable', onscroll: 'onScroll' }}>
    <table role="grid">
      <thead ${{ innerHTML: 'headHtml', onclick: 'onHeadClick' }}></thead>
      <tbody ${{ innerHTML: 'bodyHtml', onclick: 'onBodyClick', ondblclick: 'onBodyDblClick', onkeydown: 'onBodyKeyDown' }}></tbody>
    </table>
  </div>
</section>
`;
