export default `
<div class="ui-container">
  <div class="ui-header">
    <div class="ui-title"><span class="material-symbols-outlined">memory</span> Active Tasks & Background Processes</div>
    <button class="ui-btn" ref="refreshBtn"><span class="material-symbols-outlined">refresh</span> Refresh</button>
  </div>
  <div class="ui-main" ref="contentGrid">
    <div class="ui-empty-state">No active tasks found.</div>
  </div>
</div>
`;
