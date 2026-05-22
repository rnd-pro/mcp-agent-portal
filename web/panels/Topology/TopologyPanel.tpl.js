import { html } from '@symbiotejs/symbiote';

export default html`
<div class="topo-main">
  <div class="topo-header">
    <div class="topo-title">
      <span class="material-symbols-outlined">hub</span> Network Topology
    </div>
    <div class="topo-desc">Connected nodes participating in the Distributed Agent Pool.</div>
  </div>

  <table class="node-table">
    <thead>
      <tr>
        <th>Node ID</th>
        <th>Type</th>
        <th>Location</th>
        <th>Agents</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody ref="tableBody">
      <!-- Generated rows go here -->
    </tbody>
  </table>
</div>
`;
