import { Symbiote } from '@symbiotejs/symbiote';
import { emit } from '../../app.js';

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function iconFor(name) {
  if (name.endsWith('.md')) return 'description';
  if (name.endsWith('.json')) return 'data_object';
  if (name.endsWith('.yml') || name.endsWith('.yaml')) return 'tune';
  return 'insert_drive_file';
}

export class OpenLibraryTree extends Symbiote {
  init$ = {
    treeHTML: '<div class="pg-placeholder">Loading Open Library...</div>',
    filterText: '',
    onFilterInput: (event) => {
      this.$.filterText = event.target.value.toLowerCase();
      this._applyFilter();
    },
    onCollapseAll: () => {
      this._expandedDirs.clear();
      this._saveExpandedState();
      this.renderTree();
    },
  };

  initCallback() {
    this._tree = [];
    this._expandedDirs = new Set(['skills', 'workflows', 'rules']);
    try {
      let stored = localStorage.getItem('pg-open-library-tree-expanded');
      if (stored) this._expandedDirs = new Set(JSON.parse(stored));
    } catch {}

    this.loadTree();
    this.addEventListener('click', (event) => {
      let file = event.target.closest('.pg-library-file');
      if (file) {
        let path = file.dataset.file;
        this.querySelectorAll('.pg-library-file.active, .pg-library-dir.active').forEach(el => el.classList.remove('active'));
        file.classList.add('active');
        emit('file-selected', { path: `.open-library/${path}`, source: 'open-library' });
        return;
      }
      let dir = event.target.closest('.pg-library-dir');
      if (dir) {
        let path = dir.dataset.dir;
        if (this._expandedDirs.has(path)) this._expandedDirs.delete(path);
        else this._expandedDirs.add(path);
        this._saveExpandedState();
        this.renderTree();
      }
    });
  }

  async loadTree() {
    try {
      let res = await fetch('/api/agent-portal/open-library/tree');
      let data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      this._tree = data.tree || [];
      if (!data.configured) {
        this.$.treeHTML = '<div class="pg-placeholder">Open Library source is not configured.</div>';
        return;
      }
      this.renderTree();
    } catch (err) {
      this.$.treeHTML = `<div class="pg-placeholder">Error: ${esc(err.message)}</div>`;
    }
  }

  renderTree() {
    if (!this._tree.length) {
      this.$.treeHTML = '<div class="pg-placeholder">No public items found</div>';
      return;
    }
    this.$.treeHTML = this._tree.map(node => this._renderNode(node, 0)).join('');
    requestAnimationFrame(() => this._applyFilter());
  }

  _renderNode(node, depth) {
    let pad = depth * 16 + 6;
    if (node.type === 'dir') {
      let open = this._expandedDirs.has(node.path);
      return `
        <div class="pg-library-dir" draggable="true" data-dir="${esc(node.path)}" style="padding-left:${pad}px">
          <span class="material-symbols-outlined pg-chevron" style="font-size:16px">${open ? 'expand_more' : 'chevron_right'}</span>
          <span class="material-symbols-outlined" style="font-size:16px">folder</span>
          ${esc(node.name)}
        </div>
        <div class="pg-library-children" data-dir="${esc(node.path)}" ${open ? '' : 'hidden'}>
          ${open ? (node.children || []).map(child => this._renderNode(child, depth + 1)).join('') : ''}
        </div>
      `;
    }
    return `
      <div class="pg-library-file" draggable="true" data-file="${esc(node.path)}" style="padding-left:${pad + 18}px">
        <span class="material-symbols-outlined" style="font-size:14px">${iconFor(node.name)}</span>
        ${esc(node.name)}
      </div>
    `;
  }

  _saveExpandedState() {
    localStorage.setItem('pg-open-library-tree-expanded', JSON.stringify([...this._expandedDirs]));
  }

  _applyFilter() {
    let filter = this.$.filterText;
    this.querySelectorAll('.pg-library-file').forEach(file => {
      file.hidden = !!filter && !file.dataset.file.toLowerCase().includes(filter);
    });
  }
}

OpenLibraryTree.template = `
  <div class="pg-library-title">
    <span class="material-symbols-outlined" style="font-size:14px">public</span>
    Open Library
  </div>
  <div class="pg-panel-toolbar">
    <input type="search" placeholder="Filter public items..." bind="oninput: onFilterInput">
    <button class="pg-collapse-all" bind="onclick: onCollapseAll" title="Collapse All Folders">
      <span class="material-symbols-outlined" style="font-size:14px">unfold_less</span>
    </button>
  </div>
  <div class="pg-tree-content" bind="innerHTML: treeHTML"></div>
`;

OpenLibraryTree.rootStyles = `
  pg-agent-portal-library {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    font-size: 12px;
    font-family: var(--sn-font, Georgia, serif);
  }
  pg-agent-portal-library .pg-library-title {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--sn-node-border, hsl(35, 18%, 80%));
    color: var(--sn-text-dim, hsl(30, 10%, 45%));
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
  }
  pg-agent-portal-library .pg-panel-toolbar {
    padding: 6px 8px;
    border-bottom: 1px solid var(--sn-node-border, hsl(35, 18%, 80%));
    display: flex;
    gap: 6px;
  }
  pg-agent-portal-library .pg-panel-toolbar input {
    flex: 1;
    min-width: 0;
    background: var(--sn-bg, hsl(37, 30%, 91%));
    border: 1px solid var(--sn-node-border, hsl(35, 18%, 80%));
    color: var(--sn-text, hsl(30, 15%, 18%));
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-family: inherit;
    outline: none;
  }
  pg-agent-portal-library .pg-collapse-all {
    background: var(--sn-bg, hsl(37, 30%, 91%));
    border: 1px solid var(--sn-node-border, hsl(35, 18%, 80%));
    color: var(--sn-text, hsl(30, 15%, 18%));
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 6px;
  }
  pg-agent-portal-library .pg-tree-content {
    flex: 1;
    overflow-y: auto;
    padding: 4px;
  }
  pg-agent-portal-library .pg-library-dir,
  pg-agent-portal-library .pg-library-file {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px;
    cursor: pointer;
    border-radius: 4px;
    color: var(--sn-text-dim, hsl(30, 10%, 45%));
  }
  pg-agent-portal-library .pg-library-dir {
    font-weight: 600;
    font-size: 11px;
    user-select: none;
  }
  pg-agent-portal-library .pg-library-dir:hover,
  pg-agent-portal-library .pg-library-file:hover {
    background: var(--sn-node-hover, hsl(36, 22%, 88%));
    color: var(--sn-text, hsl(30, 15%, 18%));
  }
  pg-agent-portal-library .pg-library-file.active,
  pg-agent-portal-library .pg-library-dir.active {
    background: hsla(145, 35%, 38%, 0.12);
    color: hsl(145, 35%, 38%);
  }
  pg-agent-portal-library .pg-library-children[hidden],
  pg-agent-portal-library .pg-library-file[hidden] {
    display: none;
  }
  pg-agent-portal-library .pg-placeholder {
    padding: 12px;
    color: var(--sn-text-dim, hsl(30, 10%, 45%));
  }
`;

OpenLibraryTree.reg('pg-agent-portal-library');

export default OpenLibraryTree;
