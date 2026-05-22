export default `
<div class="gm-root">
  <div class="gm-toolbar">
    <div class="gm-title"><span class="material-symbols-outlined">groups</span> Resource Groups</div>
    <span class="gm-status" ref="status"></span>
    <sn-button variant="icon" title="New Group" ref="newBtn"><span class="material-symbols-outlined">add</span></sn-button>
    <sn-button variant="icon" title="Refresh" ref="refreshBtn"><span class="material-symbols-outlined">refresh</span></sn-button>
  </div>
  <div class="gm-board" ref="board">
    <sn-empty-state>Loading...</sn-empty-state>
  </div>
</div>
`;
