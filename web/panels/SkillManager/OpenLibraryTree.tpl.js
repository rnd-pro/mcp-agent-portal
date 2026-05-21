export default `
  <div class="pg-library-title">
    <span class="material-symbols-outlined pg-title-icon">public</span>
    Open Library
  </div>
  <div class="pg-panel-toolbar">
    <input type="search" placeholder="Filter public items..." bind="oninput: onFilterInput">
    <button class="pg-collapse-all" bind="onclick: onCollapseAll" title="Collapse All Folders">
      <span class="material-symbols-outlined pg-toolbar-icon">unfold_less</span>
    </button>
  </div>
  <div class="pg-tree-content">
    <div class="pg-placeholder" ref="placeholder">Loading Open Library...</div>
    <sn-tree-view ref="tree" hidden></sn-tree-view>
  </div>
`;
