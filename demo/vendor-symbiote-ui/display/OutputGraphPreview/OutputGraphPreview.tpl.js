import { html } from '@symbiotejs/symbiote';

export default html`
<section class="output-graph-preview">
  <header class="output-graph-preview-head" ${{ '@hidden': '!showHeader' }}>
    <span class="output-graph-preview-title" ${{ textContent: 'title' }}></span>
    <span class="output-graph-preview-count" ${{ textContent: 'countText' }}></span>
  </header>
  <div class="output-graph-preview-empty" ${{ textContent: 'emptyText', '@hidden': '!isEmpty' }}></div>
  <div class="output-graph-preview-canvas" ${{ innerHTML: 'graphHtml', '@hidden': 'isEmpty' }}></div>
  <footer class="output-graph-preview-foot" ${{ textContent: 'truncatedText', '@hidden': '!isTruncated' }}></footer>
</section>
`;
