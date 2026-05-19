export default `
<div class="gm-root">
  <div class="gm-toolbar">
    <div class="ui-title"><span class="material-symbols-outlined">groups</span> Resource Groups</div>
    <span class="gm-status" ref="status"></span>
    <button class="ui-btn-icon" title="New Group" ref="newBtn"><span class="material-symbols-outlined">add</span></button>
    <button class="ui-btn-icon" title="Refresh" ref="refreshBtn"><span class="material-symbols-outlined">refresh</span></button>
  </div>
  <div class="gm-board" ref="board">
    <div class="ui-empty-state">Loading...</div>
  </div>
</div>
`;
