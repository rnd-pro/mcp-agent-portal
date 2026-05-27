// @ctx .context/web/panels/file-tree.ctx
import Symbiote from '@symbiotejs/symbiote';
import 'symbiote-node/ui';
import { api, state, events, emit, getActiveRouteProjectId, skeletonMatchesProject } from '../../app.js';
import { events as dashEvents, state as dashState } from '../../dashboard-state.js';
import {
  collapseTree,
  highlightTreePath,
  setTreeItems,
  setupTreePanel,
  showTree,
  showTreePlaceholder,
  syncTreeFilter,
} from 'symbiote-node/ui';
import template from './FileTree.tpl.js';
import css from './FileTree.css.js';

const TREE_STORAGE_KEY = 'pg-tree-expanded';

export class FileTree extends Symbiote {
  init$ = {
    filterText: '',
    onFilterInput: (event) => {
      this.$.filterText = event.target.value.toLowerCase();
      this._applyFilter();
    },
    onCollapseAll: () => {
      collapseTree(this);
    },
  };

  _treeData = null;
  _treeItems = [];
  _treeSyncPending = false;

  initCallback() {
    setupTreePanel(this, {
      storageKey: TREE_STORAGE_KEY,
      onSelect: (item) => this._handleTreeSelect(item),
      onToggle: (item) => this._selectItem(item),
    });
    this._syncTreeWhenReady();

    events.addEventListener('skeleton-loaded', (event) => {
      if (!skeletonMatchesProject(event.detail, getActiveRouteProjectId())) return;
      this._renderTree(event.detail);
      if (state.activeFile) {
        requestAnimationFrame(() => this._highlightFile(state.activeFile));
      }
    });

    if (state.skeleton && skeletonMatchesProject(state.skeleton, getActiveRouteProjectId())) {
      this._renderTree(state.skeleton);
    } else {
      this._fetchSkeleton();
    }

    dashEvents.addEventListener('active-project-changed', () => {
      this._fetchSkeleton();
    });

    events.addEventListener('file-selected', (event) => {
      if (event.detail.fromRoute || event.detail.source === 'canvas') {
        requestAnimationFrame(() => this._highlightFile(event.detail.path));
      }
    });
  }

  async _fetchSkeleton() {
    try {
      const projectId = getActiveRouteProjectId();
      const skeleton = await api('/api/skeleton', { projectId });
      if (getActiveRouteProjectId() !== projectId) return;
      if (!skeletonMatchesProject(skeleton, projectId)) return;
      if (!state.skeleton || state.skeletonProjectId !== projectId) {
        state.skeleton = skeleton;
        state.skeletonProjectId = projectId;
      }
      this._renderTree(skeleton);
      emit('skeleton-loaded', skeleton);
      if (state.activeFile) {
        requestAnimationFrame(() => this._highlightFile(state.activeFile));
      }
    } catch (err) {}
  }

  _handleTreeSelect(item) {
    this._selectItem(item);
  }

  _selectItem(item) {
    if (!item) return;
    let tree = this.ref.panel || this.ref.tree;
    if (tree) {
      tree.selectedId = item.id;
    }
    if (item.type === 'directory') {
      emit('file-selected', { path: `${item.path}/` });
      return;
    }
    state.activeFile = item.path;
    emit('file-selected', { path: item.path });
  }

  _setPlaceholder(text) {
    showTreePlaceholder(this, text);
  }

  _highlightFile(path) {
    if (path.endsWith('/')) {
      let dir = path.replace(/\/$/, '');
      highlightTreePath(this, dir, { scroll: true });
      return;
    }

    highlightTreePath(this, path, { scroll: true });
  }

  _buildTree(skeleton) {
    const files = new Map();
    const nodes = skeleton.n || {};

    for (const node of Object.values(nodes)) {
      if (node.f) {
        const meta = files.get(node.f) || { exports: 0, classes: 0 };
        meta.classes++;
        files.set(node.f, meta);
      }
    }

    const exportsByFile = skeleton.X || {};
    for (const [file, exports] of Object.entries(exportsByFile)) {
      const meta = files.get(file) || { exports: 0, classes: 0 };
      meta.exports = exports.length;
      files.set(file, meta);
    }

    const sourceFiles = skeleton.f || {};
    for (const [dir, names] of Object.entries(sourceFiles)) {
      for (const name of names) {
        const file = dir === './' ? name : `${dir}${name}`;
        if (!files.has(file)) {
          files.set(file, { exports: 0, classes: 0 });
        }
      }
    }

    const assetFiles = skeleton.a || {};
    for (const [dir, names] of Object.entries(assetFiles)) {
      for (const name of names) {
        const file = dir === './' ? name : `${dir}${name}`;
        if (!files.has(file)) {
          files.set(file, { exports: 0, classes: 0, nonSource: true });
        }
      }
    }

    const root = { children: {}, files: [] };
    for (const [file, meta] of files) {
      const parts = file.split('/');
      const name = parts.pop();
      let node = root;
      for (const part of parts) {
        if (!node.children[part]) {
          node.children[part] = { children: {}, files: [] };
        }
        node = node.children[part];
      }
      node.files.push({ f: file, name, ...meta });
    }
    return root;
  }

  _buildTreeItems(node, parentDir = '') {
    let items = [];
    let dirs = Object.keys(node.children).sort();
    let files = node.files.sort((a, b) => a.name.localeCompare(b.name));

    for (let dirName of dirs) {
      let dir = parentDir ? `${parentDir}/${dirName}` : dirName;
      items.push({
        id: dir,
        type: 'directory',
        label: dirName,
        path: dir,
        icon: 'folder',
        draggable: true,
        payload: `${dir}/`,
        children: this._buildTreeItems(node.children[dirName], dir),
      });
    }

    for (let file of files) {
      let badges = [];
      if (file.exports > 0) badges.push(`${file.exports}f`);
      if (file.classes > 0) badges.push(`${file.classes}c`);

      items.push({
        id: file.f,
        type: 'file',
        label: file.name,
        path: file.f,
        icon: FileTree._getFileIcon(file.name),
        badges: badges.length > 0 ? [badges.join(' ')] : [],
        draggable: true,
        payload: file.f,
        muted: Boolean(file.nonSource),
      });
    }

    return items;
  }

  _renderTree(skeleton) {
    if (!skeleton) {
      this._setPlaceholder('No files found');
      return;
    }

    this._treeData = this._buildTree(skeleton);
    let count = Object.keys(this._treeData.children).length + this._treeData.files.length;
    if (count === 0) {
      this._setPlaceholder('No files found');
      return;
    }

    this._treeItems = this._buildTreeItems(this._treeData);
    showTree(this);
    this._syncTreeItems();
  }

  static _getFileIcon(name) {
    return name.endsWith('.html') ? 'html'
      : name.endsWith('.css') || name.endsWith('.css.js') ? 'css'
        : name.endsWith('.tpl.js') ? 'web'
          : name.endsWith('.json') ? 'data_object'
            : name.endsWith('.md') ? 'description'
              : name.endsWith('.svg') || name.endsWith('.png') || name.endsWith('.jpg') ? 'image'
                : name.endsWith('.woff2') || name.endsWith('.ttf') ? 'font_download'
                  : 'insert_drive_file';
  }

  _applyFilter() {
    syncTreeFilter(this, this.$.filterText);
  }

  _syncTreeItems() {
    showTree(this);
    setTreeItems(this, this._treeItems, this.$.filterText);
    this._syncDirectTreePanel();
    this._syncTreeWhenReady();
  }

  _syncTreeWhenReady() {
    if (this._treeSyncPending) return;
    this._treeSyncPending = true;
    Promise.all([
      customElements.whenDefined('sn-tree-panel'),
      customElements.whenDefined('sn-tree-view'),
    ]).then(() => {
      requestAnimationFrame(() => {
        this._treeSyncPending = false;
        setupTreePanel(this, {
          storageKey: TREE_STORAGE_KEY,
          onSelect: (item) => this._handleTreeSelect(item),
          onToggle: (item) => this._selectItem(item),
        });
        if (this._treeItems.length > 0) {
          showTree(this);
          setTreeItems(this, this._treeItems, this.$.filterText);
          this._syncDirectTreePanel();
        }
      });
    }).catch(() => {
      this._treeSyncPending = false;
    });
  }

  _syncDirectTreePanel() {
    let panel = this.ref?.panel || this.querySelector('sn-tree-panel');
    if (!panel?.setItems) return;
    panel.setItems(this._treeItems);
    panel.filterText = this.$.filterText;
    panel.showTree?.();
  }
}

FileTree.template = template;
FileTree.rootStyles = css;
FileTree.reg('pg-file-tree');
