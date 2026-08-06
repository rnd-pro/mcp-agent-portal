import { html } from '@symbiotejs/symbiote';

export let descriptionListTemplate = html`
  <slot></slot>
`;

export let descriptionItemTemplate = html`
  <dt class="sn-description-label" ${{ textContent: 'label' }}></dt>
  <dd class="sn-description-value">
    <slot></slot>
  </dd>
`;
