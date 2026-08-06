/**
 * NodeSearch template
 * @module symbiote-ui/canvas/NodeSearch.tpl
 */
import { html } from '@symbiotejs/symbiote';

export let template = html`
  <div class="search-bar" ${{ onkeydown: 'onSearchKeydown' }}>
    <span class="material-symbols-outlined search-icon">search</span>
    <input
      class="search-input"
      type="text"
      ${{ placeholder: 'placeholder', oninput: 'onSearchInput' }}
    />
    <span class="search-hint">Esc</span>
  </div>
  <div class="search-results" ${{ itemize: 'results', 'item-tag': 'search-result-item' }}></div>
`;

export let searchResultTemplate = html`
  <div class="search-result" ${{ onclick: '^onResultClick', '@data-node-id': 'id' }}>
    <span class="search-result-label">{{label}}</span>
    <span class="search-result-type">{{type}}</span>
  </div>
`;
