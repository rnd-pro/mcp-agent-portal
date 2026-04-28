import { html } from '@symbiotejs/symbiote';

export default html`
<div class="ui-main">
  <div class="ui-details-header" style="flex-direction: column;">
    <div class="ui-details-title" style="display:flex;align-items:center;gap:8px;">
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
