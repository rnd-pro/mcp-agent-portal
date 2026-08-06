import { html } from '@symbiotejs/symbiote';

export default html`
<header class="app-topbar">
  <div class="topbar-left">
    <span class="material-symbols-outlined app-title-icon" ${{ textContent: 'titleIcon' }}></span>
    <span class="app-title" ${{ textContent: 'title' }}></span>
  </div>
  <div class="topbar-center">
    <span class="material-symbols-outlined topbar-project-icon" ${{ textContent: 'pathIcon' }}></span>
    <span class="topbar-project-path" ${{ textContent: 'pathLabel' }}></span>
  </div>
  <div class="topbar-right">
    <slot name="actions"></slot>
  </div>
</header>
<section class="shell-tabs-row" aria-label="Layout groups">
  <project-tabs class="shell-tabs" ${{ ref: 'tabs' }}></project-tabs>
  <slot name="tab-actions"></slot>
</section>
<div class="app-workspace">
  <slot name="sidebar" ${{ ref: 'sidebarSlot', onslotchange: 'onSidebarSlotChange' }}></slot>
  <main class="app-workspace-content">
    <slot></slot>
  </main>
</div>
`;
