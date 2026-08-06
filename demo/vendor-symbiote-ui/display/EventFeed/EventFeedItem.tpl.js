import { html } from '@symbiotejs/symbiote';

export default html`
<article class="sn-event-feed-item" ${{ 'data-is-call': 'isCall', 'data-success': 'success' }}>
  <header class="sn-event-feed-item-header">
    <span class="sn-event-feed-arrow" ${{ textContent: 'isCall ? "->" : "<-"' }}></span>
    <span class="sn-event-feed-tool" ${{ textContent: 'tool' }}></span>
    <span class="sn-event-feed-time" ${{ textContent: 'timeText' }}></span>
    <span class="sn-event-feed-duration" ${{ textContent: 'durationText' }}></span>
  </header>
  <div class="sn-event-feed-body" ${{ hidden: '!isCall' }}>
    <span class="sn-event-feed-args" ${{ textContent: 'argsText' }}></span>
  </div>
  <div class="sn-event-feed-body sn-event-feed-result" ${{ hidden: 'isCall' }}>
    <div class="sn-event-feed-error" ${{ hidden: 'mode !== "error"', textContent: 'errorText' }}></div>
    <code-block ref="codePreview" ${{ hidden: 'mode !== "code"' }}></code-block>
    <output-graph-preview ref="graphPreview" ${{ hidden: 'mode !== "graph"' }}></output-graph-preview>
    <output-list-preview ref="listPreview" ${{ hidden: 'mode !== "list"' }}></output-list-preview>
    <pre class="sn-event-feed-raw" ${{ hidden: 'mode !== "raw"', textContent: 'rawOutput' }}></pre>
  </div>
</article>
`;
