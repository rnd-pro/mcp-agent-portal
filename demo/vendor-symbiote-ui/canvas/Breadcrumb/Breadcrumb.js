/**
 * Breadcrumb — Navigation path UI for subgraph drill-down
 *
 * Displays clickable path segments: Root > Sub Pipeline > Inner
 * Auto-hides at root level (depth 0).
 *
 * @module symbiote-ui/canvas/Breadcrumb
 */

import Symbiote, { html } from '@symbiotejs/symbiote';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import { template } from './Breadcrumb.tpl.js';
import { styles } from './Breadcrumb.css.js';

class BreadcrumbItem extends Symbiote {
  init$ = {
    label: '',
    icon: 'home',
    level: 0,
    isActive: false,
    isFirst: true,
  };

  renderCallback() {
    ensureMaterialSymbols([this.$.icon]);
    this.sub('icon', (icon) => ensureMaterialSymbols([icon]));

    this.sub('isActive', (val) => {
      this.toggleAttribute('data-active', val);
    });
  }
}

BreadcrumbItem.template = html`
  <span class="bc-sep" ${{ '@hidden': 'isFirst' }}>›</span>
  <span class="bc-label" ${{ onclick: '^onCrumbClick' }}>
    <span class="material-symbols-outlined" ${{ textContent: 'icon' }}></span>
    <span ${{ textContent: 'label' }}></span>
  </span>
`;

BreadcrumbItem.reg('breadcrumb-item');

export class Breadcrumb extends Symbiote {
  init$ = {
    crumbs: [],
    isVisible: false,
    onCrumbClick: (e) => {
      let item = e.target.closest('breadcrumb-item');
      if (!item || item.$.isActive) return;
      if (this.#onNavigate) this.#onNavigate(item.$.level);
    },
  };

  /** @type {function|null} */
  #onNavigate = null;

  /**
   * Set navigation callback
   * @param {function} callback - (level: number) => void
   */
  onNavigate(callback) {
    this.#onNavigate = callback;
  }

  /**
   * Update breadcrumb path
   * @param {Array<{ label: string, level: number }>} path
   */
  setPath(path) {
    if (path.length <= 1) {
      this.$.isVisible = false;
      return;
    }

    this.$.isVisible = true;
    ensureMaterialSymbols(['account_tree', 'home']);
    this.$.crumbs = path.map((item, i) => ({
      label: item.label,
      icon: i === 0 ? 'home' : 'account_tree',
      level: item.level,
      isActive: i === path.length - 1,
      isFirst: i === 0,
    }));
  }

  renderCallback() {
    this.sub('isVisible', (val) => {
      this.toggleAttribute('hidden', !val);
    });
  }
}

Breadcrumb.template = template;
Breadcrumb.rootStyles = styles;
Breadcrumb.reg('graph-breadcrumb');
