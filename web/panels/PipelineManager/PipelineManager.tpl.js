export default `
<div class="ui-split-container">
  <div class="ui-sidebar">
    <div class="ui-sidebar-header">
      <div class="ui-title"><span class="material-symbols-outlined">schema</span> Pipelines</div>
      <button class="ui-btn-icon" title="New Pipeline" ref="newBtn"><span class="material-symbols-outlined">add</span></button>
      <button class="ui-btn-icon" title="Refresh" ref="refreshBtn"><span class="material-symbols-outlined">refresh</span></button>
    </div>
    <div class="ui-sidebar-content" ref="pipelineList">
      <div class="ui-empty-state">Loading...</div>
    </div>
  </div>
  <div class="ui-main" ref="mainContent">
    <div class="ui-empty-state">Select a pipeline or create a new one</div>
  </div>
</div>
`;
