import { html } from '@symbiotejs/symbiote';

export default html`
<div class="skill-list-item-shell" ${{ onclick: '^onSkillSelect' }} title="Click to insert skill into agent body">
  <sn-list-item ref="listItem"></sn-list-item>
</div>
`;
