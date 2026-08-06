import { html } from '@symbiotejs/symbiote';

export let breadcrumbTemplate = html`
  <slot></slot>
`;

export let breadcrumbItemTemplate = html`
  <span class="bc-sep" aria-hidden="true" ${{ '@hidden': 'isFirst' }}>&rsaquo;</span>
  <button type="button" class="bc-label" ${{ onclick: '^onItemClick', '@hidden': 'isActive' }}>
    <span class="material-symbols-outlined" aria-hidden="true" ${{ textContent: 'icon', '@hidden': '!icon' }}></span>
    <span ${{ textContent: 'label' }}></span>
  </button>
  <span class="bc-label bc-current" ${{ '@hidden': '!isActive' }}>
    <span class="material-symbols-outlined" aria-hidden="true" ${{ textContent: 'icon', '@hidden': '!icon' }}></span>
    <span ${{ textContent: 'label' }}></span>
  </span>
`;
