export default `
  <div class="pg-code-header">
    <span class="pg-code-filename" bind="textContent: filename"></span>
    <div class="pg-code-controls">
      <span class="pg-code-stats" bind="textContent: statsText"></span>
      <button class="pg-mode-toggle" bind="onclick: onShowInGraph" title="Show in Graph">
        <span class="material-symbols-outlined icon-sm">account_tree</span>
        <span class="pg-mode-label">graph</span>
      </button>
      <button class="pg-mode-toggle" bind="onclick: onToggleMode; hidden: !showToggle" title="Toggle view mode">
        <span class="material-symbols-outlined icon-sm">compress</span>
        <span class="pg-mode-label" bind="textContent: modeLabel"></span>
      </button>
    </div>
  </div>
  <code-block></code-block>
`;
