import Symbiote from '@symbiotejs/symbiote';
import '../TreeView/TreeView.js';
import '../../control/Button/Button.js';
import template from './TreePanel.tpl.js';
import css from './TreePanel.css.js';
import { translate } from '../../locale/index.js';

function emit(el, type, detail = {}) {
  el.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
}

export class TreePanel extends Symbiote {
  init$ = {
    title: '',
    titleIcon: '',
    hideTitle: true,
    placeholder: translate('tree.loading'),
    filterText: '',
    onFilterInput: (event) => {
      this.filterText = event.target.value;
      emit(this, 'sn-tree-panel-filter', { filterText: this.filterText });
    },
    onCollapseAll: () => {
      this.collapseAll();
      emit(this, 'sn-tree-panel-collapse');
    },
  };

  initCallback() {
    this.#syncAttributes();
    this.#syncInputChrome();

    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'region');
    }
    if (!this.hasAttribute('aria-label') && !this.hasAttribute('aria-labelledby')) {
      let title = this.getAttribute('title') || 'Navigation Tree';
      this.setAttribute('aria-label', title);
    }
  }

  get tree() {
    return this.ref.tree;
  }

  get items() {
    return this.tree?.items || [];
  }

  set items(items) {
    this.setItems(items);
  }

  get selectedId() {
    return this.tree?.selectedId || '';
  }

  set selectedId(value) {
    if (this.tree) this.tree.selectedId = value;
  }

  get expandedIds() {
    return this.tree?.expandedIds || [];
  }

  set expandedIds(value) {
    if (this.tree) this.tree.expandedIds = value;
  }

  get defaultExpandedIds() {
    return this.tree?.defaultExpandedIds || [];
  }

  set defaultExpandedIds(value) {
    if (this.tree) this.tree.defaultExpandedIds = value;
  }

  get filterText() {
    return this.$.filterText || '';
  }

  set filterText(value) {
    let next = String(value || '');
    this.$.filterText = next;
    if (this.ref.filter && this.ref.filter.value !== next) this.ref.filter.value = next;
    if (this.tree) this.tree.filterText = next;
  }

  get storageKey() {
    return this.tree?.storageKey || '';
  }

  set storageKey(value) {
    if (this.tree) this.tree.storageKey = value;
  }

  get toggleBranchesOnSelect() {
    return this.tree?.toggleBranchesOnSelect || false;
  }

  set toggleBranchesOnSelect(value) {
    if (this.tree) this.tree.toggleBranchesOnSelect = value;
  }

  setItems(items = []) {
    this.tree?.setItems?.(items);
    this.filterText = this.filterText;
  }

  collapseAll() {
    this.tree?.collapseAll?.();
  }

  expandAncestors(path) {
    return this.tree?.expandAncestors?.(path) || false;
  }

  scrollSelectedIntoView() {
    this.tree?.scrollSelectedIntoView?.();
  }

  showPlaceholder(message = '') {
    if (message) this.$.placeholder = message;
    if (this.ref.placeholder) this.ref.placeholder.hidden = false;
    if (this.tree) this.tree.hidden = true;
  }

  showTree() {
    if (this.ref.placeholder) this.ref.placeholder.hidden = true;
    if (this.tree) this.tree.hidden = false;
  }

  #syncAttributes() {
    this.$.title = this.getAttribute('title') || '';
    this.$.titleIcon = this.getAttribute('title-icon') || '';
    this.$.hideTitle = !this.$.title && !this.$.titleIcon;
    this.$.placeholder = this.getAttribute('placeholder') || this.$.placeholder;
  }

  #syncInputChrome() {
    if (this.ref.filter) {
      this.ref.filter.placeholder = this.getAttribute('filter-placeholder') || translate('tree.filterPlaceholder');
      this.ref.filter.value = this.filterText;
    }
    if (this.ref.collapseButton) {
      this.ref.collapseButton.title = this.getAttribute('collapse-title') || translate('tree.collapseAll');
    }
  }
}

TreePanel.template = template;
TreePanel.rootStyles = css;
TreePanel.reg('sn-tree-panel');

export default TreePanel;
