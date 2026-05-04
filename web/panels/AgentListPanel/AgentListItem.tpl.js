import { html } from '@symbiotejs/symbiote';

export default html`
<div class="ui-item" ${{ onclick: '^onAgentSelect' }}>
  <div class="agent-layout">
    <span class="material-symbols-outlined icon" ${{ textContent: 'icon', 'style.color': 'color' }}></span>
    <div class="ui-item-title name-label" ${{ textContent: 'name', title: 'description' }}></div>
    <div class="ui-badge" ${{ textContent: 'tier', className: 'tier' }}></div>
  </div>
</div>
`;
