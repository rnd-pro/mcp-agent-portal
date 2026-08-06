import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="sn-floating-container">
    <header ref="header" class="sn-floating-header">
      <span class="sn-floating-title">{{label}}</span>
      <div class="sn-floating-actions">
        <button ref="minBtn" type="button" class="sn-floating-action-btn" data-action="minimize" aria-label="Minimize">
          <span class="material-symbols-outlined sn-floating-action-icon">remove</span>
        </button>
        <button ref="maxBtn" type="button" class="sn-floating-action-btn" data-action="maximize" aria-label="Maximize">
          <span class="material-symbols-outlined sn-floating-action-icon">aspect_ratio</span>
        </button>
        <button ref="closeBtn" type="button" class="sn-floating-action-btn" data-action="close" aria-label="Close">
          <span class="material-symbols-outlined sn-floating-action-icon">close</span>
        </button>
      </div>
    </header>
    <div class="sn-floating-body">
      <slot></slot>
    </div>
  </div>
`;
