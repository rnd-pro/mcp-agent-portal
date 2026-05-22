import { html } from '@symbiotejs/symbiote';

export default html`
<div class="ui-split-container">
  <div class="ui-sidebar">
    <div class="ui-sidebar-header">
      <div class="ui-title">Servers</div>
    </div>
    <div class="ui-sidebar-content">
      <div class="ui-list" ref="serverList" ${{ itemize: 'servers', 'item-tag': 'te-server-item' }}></div>
      <sn-empty-state ${{ hidden: '!serversEmptyText' }}>{{serversEmptyText}}</sn-empty-state>
    </div>
  </div>
  <div class="ui-main te-main-nopad">
    <div class="ui-header">
      <div class="ui-title-large">
        <span class="material-symbols-outlined">build</span>
        Tool Explorer: {{selectedServerName}}
      </div>
    </div>
    <div class="te-tools-grid" ref="toolsGrid" ${{ itemize: 'tools', 'item-tag': 'te-tool-card' }}></div>
    <sn-empty-state ${{ hidden: '!toolsEmptyText' }}>{{toolsEmptyText}}</sn-empty-state>
  </div>
</div>
`;
