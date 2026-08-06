import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="sn-mentions-container">
    <slot ref="inputSlot"></slot>
    <div ref="dropdown" class="sn-mentions-dropdown">
      <ul ref="optionsList" class="sn-mentions-list" role="listbox" aria-label="Mention suggestions"></ul>
    </div>
  </div>
`;
