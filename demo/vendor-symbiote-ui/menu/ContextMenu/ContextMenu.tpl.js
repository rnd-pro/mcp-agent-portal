import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="ctx-items" role="menu" ${{ onkeydown: 'onKeydown' }} ${{ itemize: 'items', 'item-tag': 'ctx-item' }}></div>
`;

export let ctxItemTemplate = html`
  <div class="sn-ctx-divider" ${{ '@hidden': '!divider' }}></div>
  <button class="sn-ctx-btn" ${{ onclick: 'onclick', '@hidden': 'divider' }}>
    <span class="material-symbols-outlined sn-ctx-icon" ${{ '@hidden': '!icon' }}>{{icon}}</span>
    <span class="material-symbols-outlined sn-ctx-check-mark" ${{ '@hidden': '!checked' }}>check</span>
    <span class="sn-ctx-label">{{label}}</span>
    <span class="sn-ctx-detail" ${{ '@hidden': '!detail' }}>{{detail}}</span>
  </button>
`;
