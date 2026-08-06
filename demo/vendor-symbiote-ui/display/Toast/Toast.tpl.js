import { html } from '@symbiotejs/symbiote';

export const toastTemplate = html`
  <div class="sn-toast-card {{variantClass}}" role="alert" aria-live="polite">
    <span class="material-symbols-outlined sn-toast-icon">{{iconName}}</span>
    <div class="sn-toast-message">
      <slot>{{message}}</slot>
    </div>
    <button ref="closeBtn" type="button" class="sn-toast-close" aria-label="Dismiss">
      <span class="material-symbols-outlined">close</span>
    </button>
  </div>
`;

export const toastRegionTemplate = html`
  <div class="sn-toast-region-container">
    <slot></slot>
  </div>
`;
