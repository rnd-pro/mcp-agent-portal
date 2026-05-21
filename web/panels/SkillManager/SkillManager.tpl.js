export default `
  <div class="pg-code-header">
    <span class="pg-code-filename" bind="textContent: filename"></span>
    <div class="pg-code-controls">
      <span class="pg-code-stats" bind="textContent: statusText"></span>
      <button class="pg-mode-toggle" bind="onclick: onToggleEdit; hidden: !canEdit" title="Toggle edit mode">
        <span class="material-symbols-outlined icon-sm">edit_note</span>
        <span class="pg-mode-label" bind="textContent: modeLabel"></span>
      </button>
      <button class="pg-mode-toggle pg-install-btn" bind="onclick: onInstall; hidden: !canInstall" title="Install to Team Library">
        <span class="material-symbols-outlined icon-sm">download</span>
        <span class="pg-mode-label">install</span>
      </button>
      <button class="pg-mode-toggle" bind="onclick: onSave; disabled: !dirty; hidden: !canEdit" title="Save">
        <span class="material-symbols-outlined icon-sm">save</span>
        <span class="pg-mode-label">save</span>
      </button>
    </div>
  </div>
  <code-block ref="preview"></code-block>
  <source-editor class="pg-source-editor" ref="editor" disabled></source-editor>
`;
