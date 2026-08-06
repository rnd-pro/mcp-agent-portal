import { html } from '@symbiotejs/symbiote';

export let navListTemplate = html`
  <slot></slot>
`;

export let navItemTemplate = html`
  <span class="sn-nav-item-icon material-symbols-outlined" ${{ textContent: 'icon', '@hidden': '!icon' }}></span>
  <span class="sn-nav-item-label">
    <slot></slot>
  </span>
  <span class="sn-nav-item-badge" ${{ textContent: 'badge', '@hidden': '!badge' }}></span>
`;
