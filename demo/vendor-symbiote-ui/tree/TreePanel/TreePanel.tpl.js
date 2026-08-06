import { html } from '@symbiotejs/symbiote';

export default html`
<div class="sn-tree-panel-shell">
  <div class="sn-tree-panel-title" ${{ '@hidden': 'hideTitle' }}>
    <span class="material-symbols-outlined sn-tree-panel-title-icon" ${{ textContent: 'titleIcon', '@hidden': '!titleIcon' }}></span>
    <span ${{ textContent: 'title' }}></span>
  </div>
  <div class="sn-tree-panel-toolbar">
    <input class="sn-tree-panel-filter" ref="filter" type="search" ${{ oninput: 'onFilterInput' }}>
    <sn-button class="sn-tree-panel-collapse" ref="collapseButton" variant="icon" ${{ onclick: 'onCollapseAll' }}>
      <span class="material-symbols-outlined sn-tree-panel-toolbar-icon">unfold_less</span>
    </sn-button>
  </div>
  <div class="sn-tree-panel-content">
    <div class="sn-tree-panel-placeholder" ref="placeholder" ${{ textContent: 'placeholder' }}></div>
    <sn-tree-view ref="tree" hidden></sn-tree-view>
  </div>
</div>
`;
