import { html } from '@symbiotejs/symbiote';

export default html`
<div class="agent-list-item-shell" ${{ onclick: '^onAgentSelect' }}>
  <sn-list-item ref="listItem"></sn-list-item>
</div>
`;
