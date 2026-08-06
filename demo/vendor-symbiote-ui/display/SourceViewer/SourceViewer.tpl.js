export default `
  <div class="sv-shell">
    <div class="sv-header">
      <span class="sv-filename" bind="textContent: filename"></span>
      <div class="sv-controls">
        <span class="sv-stats"></span>
        <button class="sv-action sv-save-action" bind="onclick: onSourceAction; hidden: !showSaveAction; title: saveTitle">
          <span class="material-symbols-outlined icon-sm" bind="textContent: saveIcon"></span>
          <span class="sv-action-label sv-save-label"></span>
        </button>
        <button class="sv-action sv-graph-action" bind="onclick: onShowGraph; hidden: !showGraphAction; title: showGraphTitle">
          <span class="material-symbols-outlined icon-sm">account_tree</span>
          <span class="sv-action-label sv-graph-label"></span>
        </button>
        <button class="sv-action sv-toggle-action" bind="onclick: onToggleMode; hidden: !showToggle; title: toggleModeTitle">
          <span class="material-symbols-outlined icon-sm" bind="textContent: toggleIcon"></span>
          <span class="sv-action-label sv-toggle-label"></span>
        </button>
      </div>
    </div>
    <code-block></code-block>
  </div>
`;
