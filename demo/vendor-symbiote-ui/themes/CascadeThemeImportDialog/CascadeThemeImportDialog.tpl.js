import { html } from '@symbiotejs/symbiote';

export default html`
  <dialog
    ref="dialog"
    class="sn-dialog sn-theme-import-dialog"
    aria-modal="true"
    aria-labelledby="sn-theme-import-dialog-title"
    aria-describedby="sn-theme-import-dialog-status"
  >
    <div class="sn-dialog-panel">
      <header class="sn-dialog-header">
        <h2 id="sn-theme-import-dialog-title" class="sn-dialog-title">{{title}}</h2>
        <button
          ref="closeBtn"
          type="button"
          class="sn-dialog-close-btn"
          ${{ '@aria-label': 'closeLabel' }}
        >
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </header>

      <div class="sn-dialog-body">
        <p class="sn-theme-import-prompt">
          <span>{{promptPrefix}}</span>
          <strong>{{themeName}}</strong><span>{{promptSuffix}}</span>
        </p>
        <p
          id="sn-theme-import-dialog-status"
          class="sn-theme-import-status"
          aria-live="polite"
          ref="statusText"
        >{{status}}</p>
      </div>

      <footer class="sn-dialog-footer sn-theme-import-actions">
        <button
          type="button"
          class="sn-dialog-btn"
          data-action="cancel"
          ${{ onclick: 'onCancel', '@disabled': 'isFinalizing' }}
        >{{cancelLabel}}</button>
        <button
          type="button"
          class="sn-dialog-btn"
          data-action="save-only"
          ${{ onclick: 'onSaveWithoutApplying', '@disabled': 'isFinalizing' }}
        >{{saveOnlyLabel}}</button>
        <button
          type="button"
          class="sn-dialog-btn sn-dialog-btn-primary"
          data-action="save-apply"
          ${{ onclick: 'onAddAndApply', '@disabled': 'isFinalizing' }}
        >{{saveApplyLabel}}</button>
      </footer>
    </div>
  </dialog>
`;
