import { html } from '@symbiotejs/symbiote';

export default html`
<div class="topo-main">
  <div class="topo-header">
    <div class="topo-title">
      <span class="material-symbols-outlined">hub</span> Network Topology
    </div>
    <div class="topo-desc">Connected nodes participating in the Distributed Agent Pool.</div>
  </div>

  <sn-data-table ref="dataTable"></sn-data-table>
</div>
`;
