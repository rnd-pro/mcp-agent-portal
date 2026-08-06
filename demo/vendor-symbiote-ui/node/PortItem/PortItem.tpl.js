/**
 * PortItem template
 * @module symbiote-ui/node/PortItem.tpl
 */
import { html } from '@symbiotejs/symbiote';

export let template = html`
  <div ref="socket" class="sn-socket" ${{ '@data-key': 'key' }}></div>
  <span class="port-label">{{label}}</span>
`;
