import { html } from '@symbiotejs/symbiote';

export default html`
<sn-list-detail-shell
  sidebar-title="Servers"
  sidebar-icon="dns"
  detail-title="Tool Explorer"
  detail-icon="build"
  ${{ 'detail-description': 'selectedServerName', '@has-detail': 'hasSelectedServer' }}
>
  <div slot="list" ref="serverList" ${{ itemize: 'servers', 'item-tag': 'te-server-item' }}></div>
  <sn-empty-state slot="list-empty" ${{ hidden: '!serversEmptyText' }}>{{serversEmptyText}}</sn-empty-state>
  <div slot="detail" class="te-detail">
    <div class="te-tools-grid" ref="toolsGrid" ${{ itemize: 'tools', 'item-tag': 'te-tool-card' }}></div>
    <sn-empty-state ${{ hidden: '!toolsEmptyText' }}>{{toolsEmptyText}}</sn-empty-state>
  </div>
  <sn-empty-state slot="detail-empty">{{mainEmptyText}}</sn-empty-state>
</sn-list-detail-shell>
`;
