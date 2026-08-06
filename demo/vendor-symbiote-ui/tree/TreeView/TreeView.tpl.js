import { html } from '@symbiotejs/symbiote';

export default html`
<div
  class="sn-tree-view"
  ref="tree"
  role="tree"
  ${{ onclick: 'onTreeClick', onkeydown: 'onTreeKeydown', ondragstart: 'onTreeDragStart' }}
></div>
`;
