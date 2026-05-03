export default`
<div style="display:flex; flex-direction:column; height:100%;">
  <div style="padding:10px 12px; border-bottom:1px solid var(--sn-node-border); display:flex; justify-content:space-between; align-items:center;">
    <div style="font-size:11px; font-weight:600; text-transform:uppercase; color:var(--sn-text-dim);">Tracked Context</div>
    <button class="ui-btn-icon" style="padding:4px; font-size:16px;" onclick="this.closest('pg-active-context').loadContext()">
      <span class="material-symbols-outlined">refresh</span>
    </button>
  </div>
  <div ref="fileList" style="flex:1; overflow-y:auto; padding:8px;"></div>
</div>
`;
