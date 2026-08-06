import { html } from '@symbiotejs/symbiote';

export default html`
<section class="sn-list-detail-sidebar">
  <header class="sn-list-detail-header">
    <slot name="list-header"></slot>
    <span class="sn-list-detail-icon material-symbols-outlined" ${{ textContent: 'sidebarIcon', '@hidden': '!sidebarIcon' }}></span>
    <span class="sn-list-detail-title" ${{ textContent: 'sidebarTitle', '@hidden': '!sidebarTitle' }}></span>
    <slot name="sidebar-actions"></slot>
  </header>
  <div class="sn-list-detail-list">
    <slot name="list"></slot>
  </div>
  <div class="sn-list-detail-list-empty">
    <slot name="list-empty"></slot>
  </div>
</section>

<section class="sn-list-detail-main">
  <header class="sn-list-detail-header">
    <slot name="detail-header"></slot>
    <span class="sn-list-detail-icon material-symbols-outlined" ${{ textContent: 'detailIcon', '@hidden': '!detailIcon' }}></span>
    <span class="sn-list-detail-heading">
      <span class="sn-list-detail-title" ${{ textContent: 'detailTitle', '@hidden': '!detailTitle' }}></span>
      <span class="sn-list-detail-description" ${{ textContent: 'detailDescription', '@hidden': '!detailDescription' }}></span>
    </span>
    <slot name="detail-actions"></slot>
  </header>
  <div class="sn-list-detail-body">
    <slot name="detail"></slot>
  </div>
  <div class="sn-list-detail-empty">
    <slot name="detail-empty"></slot>
  </div>
</section>
`;
