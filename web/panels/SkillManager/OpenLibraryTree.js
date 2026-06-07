import { Symbiote } from '@symbiotejs/symbiote';
import 'symbiote-ui/ui';
import { emit } from '../../app.js';
import { tPortal } from '../../common/localization.js';
import {
  collapseTree,
  setTreeItems,
  setupTreePanel,
  showTree,
  showTreePlaceholder,
  syncTreeFilter,
} from 'symbiote-ui/ui';
import template from './OpenLibraryTree.tpl.js';
import css from './OpenLibraryTree.css.js';

const EXPANDED_STORAGE_KEY = 'pg-open-library-tree-expanded';
const DEFAULT_EXPANDED_IDS = ['skills', 'workflows', 'rules'];

function iconFor(name) {
  if (name.endsWith('.md')) return 'description';
  if (name.endsWith('.json')) return 'data_object';
  if (name.endsWith('.yml') || name.endsWith('.yaml')) return 'tune';
  return 'insert_drive_file';
}

export class OpenLibraryTree extends Symbiote {
  #loadStarted = false;
  #selectedId = '';

  init$ = {
    filterText: '',
    onFilterInput: (event) => {
      this.$.filterText = event.target.value.toLowerCase();
      this.#syncFilter();
    },
    onCollapseAll: () => {
      collapseTree(this);
    },
  };

  initCallback() {
    this._tree = [];
  }

  renderCallback() {
    this.#setupTreeView();
    if (!this.#loadStarted) {
      this.#loadStarted = true;
      this.loadTree();
    }
  }

  async loadTree() {
    this.#setupTreeView();
    this.#showPlaceholder(tPortal('text.loadingOpenLibrary'));
    try {
      let res = await fetch('/api/agent-portal/open-library/tree');
      let data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      this._tree = data.tree || [];
      if (!data.configured) {
        this.#showPlaceholder(tPortal('text.openLibraryNotConfigured'));
        return;
      }
      this.renderTree();
    } catch (err) {
      this.#showPlaceholder(tPortal('text.errorWithMessage', { message: err.message }));
    }
  }

  renderTree() {
    if (!this._tree.length) {
      this.#showPlaceholder(tPortal('text.noPublicItemsFound'));
      return;
    }
    let tree = this.ref.panel || this.ref.tree;
    if (!tree?.setItems) return;
    setTreeItems(this, this._tree.map(node => this.#toTreeItem(node)), this.$.filterText);
    this.#showTree();
    requestAnimationFrame(() => this.#syncFilter());
  }

  #setupTreeView() {
    setupTreePanel(this, {
      storageKey: EXPANDED_STORAGE_KEY,
      defaultExpandedIds: DEFAULT_EXPANDED_IDS,
      onSelect: (item) => this.#handleTreeSelect(item),
    });
  }

  #toTreeItem(node) {
    if (node.type === 'dir') {
      return {
        id: node.path,
        path: node.path,
        label: node.name,
        icon: 'folder',
        type: 'dir',
        draggable: true,
        payload: { path: node.path, type: 'dir' },
        children: (node.children || []).map(child => this.#toTreeItem(child)),
      };
    }
    return {
      id: node.path,
      path: node.path,
      label: node.name,
      icon: iconFor(node.name),
      type: 'file',
      draggable: true,
      payload: { path: `.open-library/${node.path}`, type: 'file' },
    };
  }

  #handleTreeSelect(item) {
    if (!item) return;
    if (item.type === 'dir') {
      let tree = this.ref.panel || this.ref.tree;
      if (tree) tree.selectedId = this.#selectedId;
      return;
    }
    this.#selectedId = item.id;
    emit('file-selected', { path: `.open-library/${item.path}`, source: 'open-library' });
  }

  #showPlaceholder(message) {
    showTreePlaceholder(this, message);
  }

  #showTree() {
    showTree(this);
  }

  #syncFilter() {
    syncTreeFilter(this, this.$.filterText);
  }
}

OpenLibraryTree.template = template;
OpenLibraryTree.rootStyles = css;
OpenLibraryTree.reg('pg-agent-portal-library');

export default OpenLibraryTree;
