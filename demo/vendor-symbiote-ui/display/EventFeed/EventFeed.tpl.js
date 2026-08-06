import { html } from '@symbiotejs/symbiote';

export default html`
<section class="sn-event-feed">
  <header class="sn-event-feed-header" ${{ hidden: '!showHeader' }}>
    <span ${{ textContent: 'title' }}></span>
    <span class="sn-event-feed-count" ${{ textContent: 'eventCount' }}></span>
  </header>
  <div class="sn-event-feed-body-list">
    <div class="sn-event-feed-items" ${{ itemize: 'eventsList', 'item-tag': 'sn-event-feed-item' }}></div>
    <sn-empty-state class="sn-event-feed-empty" ${{ hidden: 'hasEvents', textContent: 'emptyText' }}></sn-empty-state>
  </div>
</section>
`;
