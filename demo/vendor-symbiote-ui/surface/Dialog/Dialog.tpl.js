import { html } from '@symbiotejs/symbiote';

export default html`
  <dialog ref="dialog" class="sn-dialog" ${{ '@aria-label': 'label' }}>
    <div class="sn-dialog-panel">
      <header class="sn-dialog-header">
        <slot name="title"><h2 class="sn-dialog-title">{{label}}</h2></slot>
        <button ref="closeBtn" type="button" class="sn-dialog-close-btn" aria-label="Close dialog">
          <span class="material-symbols-outlined">close</span>
        </button>
      </header>
      <div class="sn-dialog-body">
        <slot></slot>
      </div>
      <footer class="sn-dialog-footer">
        <slot name="footer"></slot>
      </footer>
    </div>
  </dialog>
`;
