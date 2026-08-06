/**
 * CtrlItem template
 * @module symbiote-ui/node/CtrlItem.tpl
 */
import { html } from '@symbiotejs/symbiote';

export let template = html`
  <label class="sn-ctrl-label">{{label}}</label>
  <input
    class="sn-ctrl-input"
    ${{
      '@type': 'inputType',
      '@value': 'value',
      '@readonly': 'isReadonly',
    }}
  />
`;
