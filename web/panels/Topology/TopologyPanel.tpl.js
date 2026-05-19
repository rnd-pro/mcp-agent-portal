import { html } from '@symbiotejs/symbiote';

export default html`
<div class="ui-main">
  <div class="ui-details-header topo-header">
    <div class="ui-details-title topo-title">
      <span class="material-symbols-outlined">hub</span> Network Topology
    </div>
    <div class="ui-details-desc">Connected nodes participating in the Distributed Agent Pool.</div>
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
