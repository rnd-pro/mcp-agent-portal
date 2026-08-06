/**
 * GraphTabs — Tab/Page management for multi-canvas workflows
 *
 * Each tab represents an independent graph page with its own
 * set of nodes and connections. Provides tab bar UI and
 * state switching for the NodeCanvas.
 *
 * @module symbiote-ui/canvas/GraphTabs
 */

import Symbiote, { html } from '@symbiotejs/symbiote';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import { template } from './GraphTabs.tpl.js';
import { styles } from './GraphTabs.css.js';
import { translate } from '../../locale/index.js';

/**
 * @typedef {Object} TabPage
 * @property {string} id
 * @property {string} name
 * @property {Object} state - Serialized editor state
 */

class TabItem extends Symbiote {
  init$ = {
    id: '',
    name: '',
    isActive: false,
    showClose: false,
  };

  renderCallback() {
    ensureMaterialSymbols(['close', 'description']);

    this.sub('isActive', (val) => {
      this.toggleAttribute('data-active', val);
    });
  }
}

TabItem.template = html`
  <span class="material-symbols-outlined">description</span>
  <span ${{ textContent: 'name' }}></span>
  <span
    class="tab-close material-symbols-outlined"
    ${{ onclick: '^onCloseTab', '@hidden': '!showClose' }}
    >close</span
  >
`;

TabItem.reg('tab-item');

export class GraphTabs extends Symbiote {
  init$ = {
    tabItems: [],
    newTabTitle: translate('tabs.new'),
  };

  /** @type {TabPage[]} */
  #tabs = [];

  /** @type {string} */
  #activeTabId = '';

  /** @type {function|null} */
  #onSwitch = null;

  /** @type {function|null} */
  #onAdd = null;

  /** @type {function|null} */
  #onClose = null;

  renderCallback() {
    ensureMaterialSymbols(['add']);
  }

  /**
   * Set callbacks for tab events
   * @param {object} callbacks
   * @param {function} callbacks.onSwitch - (tabId) => void
   * @param {function} callbacks.onAdd - () => TabPage
   * @param {function} callbacks.onClose - (tabId) => void
   */
  setCallbacks(callbacks) {
    this.#onSwitch = callbacks.onSwitch;
    this.#onAdd = callbacks.onAdd;
    this.#onClose = callbacks.onClose;
  }

  /**
   * Add a tab
   * @param {string} id
   * @param {string} name
   * @param {Object} [state={}]
   */
  addTab(id, name, state = {}) {
    this.#tabs.push({ id, name, state });
    this.#syncItems();
    this.switchTo(id);
  }

  /**
   * Switch to a tab
   * @param {string} id
   */
  switchTo(id) {
    this.#activeTabId = id;
    this.#syncItems();
    if (this.#onSwitch) this.#onSwitch(id);
  }

  /**
   * Remove a tab
   * @param {string} id
   */
  removeTab(id) {
    let idx = this.#tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    this.#tabs.splice(idx, 1);
    if (this.#activeTabId === id && this.#tabs.length > 0) {
      this.switchTo(this.#tabs[Math.max(0, idx - 1)].id);
    }
    this.#syncItems();
    if (this.#onClose) this.#onClose(id);
  }

  /** @returns {string} */
  get activeTab() {
    return this.#activeTabId;
  }

  /** @returns {TabPage[]} */
  get tabs() {
    return [...this.#tabs];
  }

  /**
   * Update tab state (for saving before switch)
   * @param {string} id
   * @param {Object} state
   */
  setTabState(id, state) {
    let tab = this.#tabs.find((t) => t.id === id);
    if (tab) tab.state = state;
  }

  /**
   * Get tab state
   * @param {string} id
   * @returns {Object|undefined}
   */
  getTabState(id) {
    return this.#tabs.find((t) => t.id === id)?.state;
  }

  #syncItems() {
    let showClose = this.#tabs.length > 1;
    this.$.tabItems = this.#tabs.map((t) => ({
      id: t.id,
      name: t.name,
      isActive: t.id === this.#activeTabId,
      showClose,
    }));
  }

  onTabClick(e) {
    let item = e.target.closest('tab-item');
    if (!item) return;
    this.switchTo(item.$.id);
  }

  onCloseTab(e) {
    e.stopPropagation();
    let item = e.target.closest('tab-item');
    if (item) this.removeTab(item.$.id);
  }

  onAddTab() {
    if (this.#onAdd) {
      let newTab = this.#onAdd();
      if (newTab) this.addTab(newTab.id, newTab.name, newTab.state);
    }
  }
}

GraphTabs.template = template;
GraphTabs.rootStyles = styles;
GraphTabs.reg('graph-tabs');
