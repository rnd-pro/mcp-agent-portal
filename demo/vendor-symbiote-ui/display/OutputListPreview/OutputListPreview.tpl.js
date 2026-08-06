import { html } from '@symbiotejs/symbiote';

export default html`
<section class="output-list-preview">
  <header class="output-list-preview-head" ${{ '@hidden': '!showHeader' }}>
    <span class="output-list-preview-title" ${{ textContent: 'title' }}></span>
    <span class="output-list-preview-count" ${{ textContent: 'countText' }}></span>
  </header>
  <div class="output-list-preview-empty" ${{ textContent: 'emptyText', '@hidden': '!isEmpty' }}></div>
  <div class="output-list-preview-items" ${{ innerHTML: 'itemsHtml', '@hidden': 'isEmpty' }}></div>
  <footer class="output-list-preview-foot" ${{ textContent: 'truncatedText', '@hidden': '!isTruncated' }}></footer>
</section>
`;
