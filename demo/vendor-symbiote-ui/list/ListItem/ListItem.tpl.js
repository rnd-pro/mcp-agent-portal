import { html } from '@symbiotejs/symbiote';

export default html`
<div
  class="sn-list-item"
  ref="item"
  role="button"
  tabindex="0"
  ${{ onclick: 'onSelect', onkeydown: 'onKeydown' }}
>
  <span class="sn-list-item-spinner" hidden></span>
  <span class="sn-list-item-prefix">
    <slot name="prefix">
      <span class="sn-list-item-icon" ${{ textContent: 'icon', '@hidden': '!icon' }}></span>
    </slot>
  </span>
  <span class="sn-list-item-body">
    <slot>
      <span class="sn-list-item-label" ${{ textContent: 'label' }}></span>
      <span class="sn-list-item-description" ${{ textContent: 'description', '@hidden': '!description' }}></span>
    </slot>
  </span>
  <span class="sn-list-item-suffix">
    <slot name="suffix">
      <span class="sn-list-item-meta" ${{ textContent: 'meta', '@hidden': '!meta' }}></span>
    </slot>
  </span>
</div>
`;
