import { html } from '@symbiotejs/symbiote';

export let accordionTemplate = html`
  <slot></slot>
`;

export let accordionItemTemplate = html`
  <details class="sn-accordion-details" ${{ '@open': 'open', ontoggle: 'onDetailsToggle' }}>
    <summary ref="summary" class="sn-accordion-summary">
      <span class="sn-accordion-header-text" ${{ textContent: 'header' }}></span>
      <span class="sn-accordion-icon material-symbols-outlined" aria-hidden="true">chevron_right</span>
    </summary>
    <div ref="content" class="sn-accordion-content" role="region">
      <slot></slot>
    </div>
  </details>
`;
