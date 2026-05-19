export default `
  <div class="pg-panel-toolbar">
    <input type="search" placeholder="Filter files..." bind="oninput: onFilterInput">
    <button class="pg-collapse-all" bind="onclick: onCollapseAll" title="Collapse All Folders">
      <span class="material-symbols-outlined" style="font-size:14px">unfold_less</span>
    </button>
  </div>
  <div class="pg-tree-content" bind="innerHTML: treeHTML"></div>
`;
