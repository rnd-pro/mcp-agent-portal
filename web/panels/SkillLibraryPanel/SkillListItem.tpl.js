import { html } from '@symbiotejs/symbiote';

export default html`
<div class="ui-item" ${{ onclick: '^onSkillSelect' }} title="Click to insert skill into agent body">
  <div class="skill-layout">
    <span class="material-symbols-outlined icon">bolt</span>
    <div class="skill-text-container">
      <div class="ui-item-title" ${{ textContent: 'name' }}></div>
      <div class="ui-item-desc" ${{ textContent: 'description' }}></div>
    </div>
  </div>
</div>
`;
