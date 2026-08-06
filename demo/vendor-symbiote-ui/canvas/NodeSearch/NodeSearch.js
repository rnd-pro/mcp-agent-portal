/**
 * NodeSearch — omnibox for searching and focusing nodes
 *
 * Ctrl+F or / to open. Type to filter by label, type, category.
 * Click result to select and center viewport on that node.
 * Escape to close.
 *
 * @module symbiote-ui/canvas/NodeSearch
 */

import Symbiote from '@symbiotejs/symbiote';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import { template, searchResultTemplate } from './NodeSearch.tpl.js';
import { styles } from './NodeSearch.css.js';
import { translate } from '../../locale/index.js';

export class NodeSearch extends Symbiote {
  init$ = {
    query: '',
    results: [],
    isOpen: false,
    placeholder: translate('nodeSearch.placeholder'),
    onResultClick: (e) => {
      let item = e.target.closest('.search-result');
      if (item?.dataset?.nodeId) {
        this.#handleResultClick(item.dataset.nodeId);
      }
    },
  };

  /** @type {function|null} */
  #getNodes = null;

  /** @type {function|null} */
  #onSelect = null;

  /**
   * Configure search
   * @param {object} options
   * @param {function} options.getNodes - returns array of { id, label, type, category }
   * @param {function} options.onSelect - called with nodeId when a result is clicked
   */
  configure(options) {
    this.#getNodes = options.getNodes;
    this.#onSelect = options.onSelect;
  }

  /** Open search panel */
  open() {
    this.$.isOpen = true;
    requestAnimationFrame(() => {
      let input = this.querySelector('.search-input');
      if (input) input.focus();
    });
  }

  close() {
    this.$.isOpen = false;
    this.$.query = '';
    this.$.results = [];
    let input = this.querySelector('.search-input');
    if (input) input.value = '';
  }

  /** Toggle open/close */
  toggle() {
    if (this.$.isOpen) this.close();
    else this.open();
  }

  #search(query) {
    if (!this.#getNodes) return;
    let nodes = this.#getNodes();
    let q = query.toLowerCase();
    let results = nodes
      .filter(
        (n) =>
          n.label.toLowerCase().includes(q) ||
          (n.type && n.type.toLowerCase().includes(q)) ||
          (n.category && n.category.toLowerCase().includes(q))
      )
      .slice(0, 10)
      .map((n) => ({
        id: n.id,
        label: n.label,
        type: n.type || 'default',
        category: n.category || 'default',
      }));
    this.$.results = results;
  }

  #handleResultClick(nodeId) {
    if (this.#onSelect) this.#onSelect(nodeId);
    this.close();
  }

  renderCallback() {
    ensureMaterialSymbols(['search']);

    this.sub('isOpen', (val) => {
      this.toggleAttribute('hidden', !val);
    });

    this.sub('query', (q) => {
      if (!q || q.length < 1) {
        this.$.results = [];
        return;
      }
      this.#search(q);
    });
  }

  onSearchInput(e) {
    this.$.query = e.target.value;
  }

  onSearchKeydown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.close();
    }
  }
}


class SearchResultItem extends Symbiote {
  init$ = {
    id: '',
    label: '',
    type: '',
    category: '',
  };
}

SearchResultItem.template = searchResultTemplate;
SearchResultItem.reg('search-result-item');

NodeSearch.template = template;
NodeSearch.rootStyles = styles;
NodeSearch.reg('node-search');
