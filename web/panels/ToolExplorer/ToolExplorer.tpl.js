import { html } from '@symbiotejs/symbiote';

export default html`
<div class="te-layout">
  <div class="te-sidebar">
    <div class="te-sidebar-header">Servers</div>
    <div class="te-server-list" ref="serverList"></div>
  </div>
  <div class="te-main">
    <div class="te-main-header">
      <span class="material-symbols-outlined">build</span>
      <span class="te-header-title">Tool Explorer: {{selectedServerName}}</span>
    </div>
    <div class="te-tools-grid" ref="toolsGrid">
      <div class="te-empty">Select a server to view tools</div>
    </div>
  </div>
</div>
`;
