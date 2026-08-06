import { html } from '@symbiotejs/symbiote';

export default html`
<span class="sn-metric-label"><slot name="label"></slot></span>
<span class="sn-metric-value"><slot name="value"></slot><slot></slot></span>
`;
