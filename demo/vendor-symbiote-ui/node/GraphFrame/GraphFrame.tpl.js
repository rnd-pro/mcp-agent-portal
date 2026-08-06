/**
 * GraphFrame template
 * @module symbiote-ui/node/GraphFrame.tpl
 */
import { html } from '@symbiotejs/symbiote';

export let template = html`
  <div class="sn-frame-header">
    <span class="material-symbols-outlined sn-frame-icon">dashboard</span>
    <span class="sn-frame-label">{{label}}</span>
  </div>
  <div ref="resizeHandle" class="sn-frame-resize"></div>
`;
