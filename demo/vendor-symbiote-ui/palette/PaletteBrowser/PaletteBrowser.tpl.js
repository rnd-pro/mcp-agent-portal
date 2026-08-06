/**
 * PaletteBrowser template
 * @module symbiote-ui/palette/PaletteBrowser.tpl
 */
import { html } from '@symbiotejs/symbiote';

export let template = html`
  <div class="pal-header">
    <span class="material-symbols-outlined" aria-hidden="true">widgets</span>
    <span ${{ textContent: 'title' }}></span>
  </div>
  <div class="pal-search">
    <input
      ref="palSearch"
      type="text"
      role="combobox"
      autocomplete="off"
      aria-autocomplete="list"
      aria-haspopup="listbox"
      aria-expanded="false"
      aria-controls="pal-listbox"
      ${{ placeholder: 'searchPlaceholder', '@aria-label': 'searchLabel', oninput: 'onSearchInput', onkeydown: 'onSearchKeydown' }}
    />
  </div>
  <div
    class="pal-list"
    id="pal-listbox"
    role="listbox"
    ref="palList"
    ${{ '@aria-label': 'resultsLabel', itemize: 'categories', 'item-tag': 'pal-category', onclick: 'onItemClick' }}
  ></div>
`;
