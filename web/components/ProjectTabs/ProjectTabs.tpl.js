import { html } from '@symbiotejs/symbiote';

export default html`
<div class="tab-bar">
  <button class="tab" ${{ '@active': '!activeId', onclick: 'onHomeClick' }}>
    <span class="material-symbols-outlined">home</span>
    <span>Home</span>
  </button>
  <div style="display:flex; align-items:stretch;" itemize="tabs" item-tag="project-tab-item"></div>
  <button class="tab-add" title="Open project" ${{ onclick: 'onAddClick' }}>
    <span class="material-symbols-outlined">add</span>
  </button>
  <div class="tab-filler"></div>
</div>
`;
