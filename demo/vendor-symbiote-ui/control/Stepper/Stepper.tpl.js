import { html } from '@symbiotejs/symbiote';

export default html`
  <div ref="container" class="sn-stepper-container" style="display: contents;" ${{ innerHTML: 'stepsHtml' }}></div>
`;
