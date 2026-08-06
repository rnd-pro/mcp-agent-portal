import { html } from '@symbiotejs/symbiote';

export default html`
  <section class="ne-shell">
    <header class="ne-header">
      <div class="ne-title">
        <span class="material-symbols-outlined" aria-hidden="true">notifications</span>
        <strong ref="title"></strong>
      </div>
      <div class="ne-actions">
        <button type="button" class="ne-icon-button" data-action="reset" ref="resetButton">
          <span class="material-symbols-outlined" aria-hidden="true">restart_alt</span>
        </button>
      </div>
    </header>
    <div class="ne-body" ref="body"></div>
  </section>
`;
