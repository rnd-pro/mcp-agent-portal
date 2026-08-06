import { html } from '@symbiotejs/symbiote';

export default html`
  <div ref="backdrop" class="sn-drawer-backdrop"></div>
  <div ref="panel" class="sn-drawer-panel" role="dialog" aria-modal="true">
    <header class="sn-drawer-header">
      <slot name="title"><h2 ref="title" class="sn-drawer-title">{{label}}</h2></slot>
      <button ref="closeBtn" type="button" class="sn-drawer-close-btn" aria-label="Close drawer">
        <span class="material-symbols-outlined">close</span>
      </button>
    </header>
    <div class="sn-drawer-body">
      <slot></slot>
    </div>
    <footer class="sn-drawer-footer">
      <slot name="footer"></slot>
    </footer>
  </div>
`;
