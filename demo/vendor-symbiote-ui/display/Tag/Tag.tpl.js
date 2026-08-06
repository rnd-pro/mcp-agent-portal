import { html } from '@symbiotejs/symbiote';

export default html`
  <span class="sn-tag-content">
    <slot></slot>
  </span>
  <button class="sn-tag-close-btn" ${{ '@hidden': '!closable', onclick: 'onCloseClick' }} aria-label="Remove tag">
    <span class="material-symbols-outlined">close</span>
  </button>
`;
