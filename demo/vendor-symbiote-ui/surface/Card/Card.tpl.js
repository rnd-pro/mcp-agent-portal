import { html } from '@symbiotejs/symbiote';

export default html`
<slot name="title"></slot>
<slot></slot>
<slot name="footer"></slot>
`;
