import { html } from '@symbiotejs/symbiote';

export default html`
  <div ref="container"
       class="sn-listbox"
       role="listbox"
       tabindex="0"
       ${{ '@aria-label': 'label', '@aria-activedescendant': 'activeId' }}>
    <slot></slot>
  </div>
`;
