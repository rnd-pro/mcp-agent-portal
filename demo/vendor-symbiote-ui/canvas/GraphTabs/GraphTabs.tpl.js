/**
 * GraphTabs template
 * @module symbiote-ui/canvas/GraphTabs.tpl
 */
import { html } from '@symbiotejs/symbiote';

export let template = html`
  <div ${{ itemize: 'tabItems', 'item-tag': 'tab-item', onclick: 'onTabClick' }}></div>
  <div class="tab-add" ${{ title: 'newTabTitle', onclick: 'onAddTab' }}>
    <span class="material-symbols-outlined">add</span>
  </div>
`;
