import { Symbiote } from '@symbiotejs/symbiote';
import 'symbiote-ui/ui';
import { events, emit, state } from '../../app.js';
import { tPortal } from '../../common/localization.js';
import {
  collapseTree,
  highlightTreePath,
  setTreeItems,
  setupTreePanel,
  showTree,
  showTreePlaceholder,
  syncTreeFilter,
} from 'symbiote-ui/ui';
import template from './AgentPortalTree.tpl.js';
import css from './AgentPortalTree.css.js';

const EXPANDED_STORAGE_KEY = 'pg-agent-portal-tree-expanded';
const DEFAULT_EXPANDED_IDS = ['agents', 'skills', 'workflows'];

function iconFor(name) {
  if (name.endsWith('.md')) return 'description';
  if (name.endsWith('.json')) return 'data_object';
  if (name.endsWith('.js') || name.endsWith('.css.js') || name.endsWith('.tpl.js')) return 'code';
  return 'insert_drive_file';
}

function activeProjectQuery() {
  let query = String(location.hash || '').split('?')[1] || '';
  let projectId = new URLSearchParams(query).get('project');
  return projectId ? `?project=${encodeURIComponent(projectId)}` : '';
}

export class AgentPortalTree extends Symbiote {
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
    events.addEventListener('agent-portal-tree-refresh', () => this.loadTree());
    events.addEventListener('file-selected', (event) => {
      if (event.detail.path?.startsWith('.agent-portal/')) {
        requestAnimationFrame(() => this._highlightFile(event.detail.path));
      }
    });
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
    this.#showPlaceholder(tPortal('text.loadingAgentPortal'));
    try {
      let res = await fetch(`/api/agent-portal/tree${activeProjectQuery()}`);
      let data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      this._tree = data.tree || [];
      this.renderTree({ scrollActive: true });
    } catch (err) {
      let message = /ENOENT|no such file or directory/.test(err.message)
        ? tPortal('text.teamMemoryMissing')
        : tPortal('text.errorWithMessage', { message: err.message });
      this.#showPlaceholder(message);
    }
  }

  renderTree({ scrollActive = false } = {}) {
    if (!this._tree.length) {
      this.#showPlaceholder(tPortal('text.noFilesFound'));
      return;
    }
    let tree = this.ref.panel || this.ref.tree;
    if (!tree?.setItems) return;
    setTreeItems(this, this._tree.map(node => this.#toTreeItem(node)), this.$.filterText);
    this.#showTree();
    requestAnimationFrame(() => {
      if (state.activeFile?.startsWith('.agent-portal/')) {
        this._highlightFile(state.activeFile, { scroll: scrollActive });
      }
      this.#syncFilter();
    });
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
    let fullPath = `.agent-portal/${node.path}`;
    return {
      id: fullPath,
      path: fullPath,
      label: node.name,
      icon: iconFor(node.name),
      type: 'file',
      draggable: true,
      payload: { path: fullPath, type: 'file' },
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
    state.activeFile = item.path;
    emit('file-selected', { path: item.path, source: 'agent-portal-tree' });
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

  _highlightFile(path, { scroll = false } = {}) {
    this.#selectedId = path;
    highlightTreePath(this, path, { scroll });
  }
}

AgentPortalTree.template = template;
AgentPortalTree.rootStyles = css;
AgentPortalTree.reg('pg-agent-portal-tree');

export default AgentPortalTree;
