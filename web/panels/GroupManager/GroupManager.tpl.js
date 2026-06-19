export default `
<div class="gm-root">
  <div class="gm-toolbar">
    <div class="gm-title"><span class="material-symbols-outlined">groups</span> Resource Groups</div>
    <span class="gm-status" ref="status"></span>
    <sn-button variant="icon" title="New Group" ref="newBtn"><span class="material-symbols-outlined">add</span></sn-button>
    <sn-button variant="icon" title="Refresh" ref="refreshBtn"><span class="material-symbols-outlined">refresh</span></sn-button>
  </div>
  <div class="gm-unassigned" ref="unassigned" hidden></div>
  <sn-kanban-board class="gm-board" ref="board" label="Resource groups" empty-text="Loading groups..."></sn-kanban-board>
</div>
`;
