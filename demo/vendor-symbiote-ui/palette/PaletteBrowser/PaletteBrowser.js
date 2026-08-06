/**
 * PaletteBrowser — Component library browser panel
 *
 * Displays categorized node types that can be dragged onto the canvas.
 * Similar to TouchDesigner's Component Palette concept.
 * Shows grouped node templates with icons, descriptions, and drag support.
 *
 * @module symbiote-ui/palette/PaletteBrowser
 */

import Symbiote, { html } from '@symbiotejs/symbiote';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import { template } from './PaletteBrowser.tpl.js';
import { styles } from './PaletteBrowser.css.js';
import { translate } from '../../locale/index.js';

let optionUid = 0;

class PalItem extends Symbiote {
  init$ = {
    name: '',
    icon: 'radio_button_checked',
    desc: '',
    type: '',
    color: '',
    category: '',
    isHeader: false,
  };

  renderCallback() {
    ensureMaterialSymbols([this.$.icon]);
    this.sub('icon', (icon) => ensureMaterialSymbols([icon]));
    this.setAttribute('role', 'option');
    if (!this.id) this.id = `pal-option-${++optionUid}`;
    this.setAttribute('aria-selected', 'false');
  }
}

PalItem.template = html`
  <span class="pal-item-icon material-symbols-outlined" aria-hidden="true" ${{ textContent: 'icon' }}></span>
  <span class="pal-item-label" ${{ textContent: 'name' }}></span>
  <span class="pal-item-desc" ${{ textContent: 'desc' }}></span>
`;

PalItem.reg('pal-item');

class PalCategory extends Symbiote {
  init$ = {
    category: '',
    catItems: [],
  };

  onToggle() {
    this.toggleAttribute('data-collapsed');
    this.#syncExpanded();
  }

  onHeaderKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.onToggle();
    }
  }

  #syncExpanded() {
    this.ref.catHeader?.setAttribute('aria-expanded', String(!this.hasAttribute('data-collapsed')));
  }

  renderCallback() {
    ensureMaterialSymbols(['expand_more']);
    this.setAttribute('role', 'group');
    this.sub('category', (category) => {
      if (category) this.setAttribute('aria-label', category);
    });
    this.ref.catHeader?.setAttribute('aria-label', translate('palette.toggleCategory'));
    this.#syncExpanded();
  }
}

PalCategory.template = html`
  <div class="pal-cat-header" ref="catHeader" role="button" tabindex="0" ${{ onclick: 'onToggle', onkeydown: 'onHeaderKeydown' }}>
    <span class="material-symbols-outlined" aria-hidden="true">expand_more</span>
    <span ${{ textContent: 'category' }}></span>
  </div>
  <div class="pal-cat-items" ${{ itemize: 'catItems', 'item-tag': 'pal-item' }}></div>
`;

PalCategory.reg('pal-category');

export class PaletteBrowser extends Symbiote {
  init$ = {
    categories: [],
    title: translate('palette.title'),
    searchPlaceholder: translate('palette.searchPlaceholder'),
    searchLabel: translate('palette.searchLabel'),
    resultsLabel: translate('palette.resultsLabel'),
  };

  /** @type {Array<{ category: string, color: string, items: Array<{ name: string, icon: string, type: string, desc: string, factory: function }> }>} */
  #rawCategories = [];

  /** @type {function|null} */
  #onSelect = null;

  /** @type {Map<string, function>} */
  #factoryMap = new Map();

  /** @type {HTMLElement|null} */
  #activeItem = null;

  renderCallback() {
    ensureMaterialSymbols(['widgets']);
  }

  /**
   * Register palette categories and items
   * @param {Array<{ category: string, color: string, items: Array<{ name: string, icon: string, type: string, desc: string, factory: function }> }>} categories
   */
  setCategories(categories) {
    this.#rawCategories = categories;
    this.#syncList();
  }

  /**
   * Set callback for item selection
   * @param {function} callback - (factory, name) => void
   */
  onSelect(callback) {
    this.#onSelect = callback;
  }

  #syncList(filter = '') {
    let lowerFilter = filter.toLowerCase();
    this.#factoryMap.clear();
    ensureMaterialSymbols(this.#rawCategories.flatMap((cat) => cat.items.map((it) => it.icon)));

    this.$.categories = this.#rawCategories
      .map((cat) => {
        let filtered = lowerFilter
          ? cat.items.filter(
              (it) =>
                it.name.toLowerCase().includes(lowerFilter) ||
                it.desc.toLowerCase().includes(lowerFilter)
            )
          : cat.items;

        if (filtered.length === 0) return null;

        let catItems = filtered.map((it) => {
          this.#factoryMap.set(it.name, it.factory);
          return {
            name: it.name,
            icon: it.icon,
            desc: it.desc,
            type: it.type,
            color: cat.color,
          };
        });

        return { category: cat.category, catItems };
      })
      .filter(Boolean);

    this.#clearActive();
    this.#syncExpandedState();
  }

  onSearchInput(e) {
    this.#syncList(e.target.value);
  }

  /** Visible (rendered, non-collapsed) option elements in DOM order. */
  #visibleOptions() {
    if (!this.ref.palList) return [];
    return [...this.ref.palList.querySelectorAll('pal-item')].filter((opt) => {
      let group = opt.closest('pal-category');
      return !group || !group.hasAttribute('data-collapsed');
    });
  }

  #syncExpandedState() {
    let hasResults = this.#visibleOptions().length > 0;
    this.ref.palSearch?.setAttribute('aria-expanded', String(hasResults));
  }

  #clearActive() {
    if (this.#activeItem) this.#activeItem.setAttribute('aria-selected', 'false');
    this.#activeItem = null;
    this.ref.palSearch?.removeAttribute('aria-activedescendant');
  }

  #setActive(item) {
    if (this.#activeItem) this.#activeItem.setAttribute('aria-selected', 'false');
    this.#activeItem = item;
    if (item) {
      if (!item.id) item.id = `pal-option-${++optionUid}`;
      item.setAttribute('aria-selected', 'true');
      this.ref.palSearch?.setAttribute('aria-activedescendant', item.id);
      item.scrollIntoView?.({ block: 'nearest' });
    } else {
      this.ref.palSearch?.removeAttribute('aria-activedescendant');
    }
  }

  #moveActive(delta) {
    let options = this.#visibleOptions();
    if (!options.length) return;
    let current = this.#activeItem ? options.indexOf(this.#activeItem) : -1;
    let next = current + delta;
    if (next < 0) next = options.length - 1;
    else if (next >= options.length) next = 0;
    this.#setActive(options[next]);
  }

  #activate(item) {
    if (!item) return;
    let name = item.$.name;
    let factory = this.#factoryMap.get(name);
    if (this.#onSelect && factory) this.#onSelect(factory, name);
  }

  onSearchKeydown(e) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.#syncExpandedState();
        this.#moveActive(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.#syncExpandedState();
        this.#moveActive(-1);
        break;
      case 'Enter':
        if (this.#activeItem) {
          e.preventDefault();
          this.#activate(this.#activeItem);
        }
        break;
      case 'Escape':
        if (e.target.value) {
          e.preventDefault();
          e.target.value = '';
          this.#syncList('');
        } else if (this.#activeItem) {
          e.preventDefault();
          this.#clearActive();
        }
        break;
      default:
        break;
    }
  }

  onItemClick(e) {
    let item = e.target.closest('pal-item');
    if (!item) return;
    this.#activate(item);
  }
}

PaletteBrowser.template = template;
PaletteBrowser.rootStyles = styles;
PaletteBrowser.reg('palette-browser');
