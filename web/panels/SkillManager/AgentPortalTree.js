import { Symbiote } from '@symbiotejs/symbiote';
import { events, emit, state } from '../../app.js';

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
  if (name.endsWith('.js') || name.endsWith('.css.js') || name.endsWith('.tpl.js')) return 'code';
  return 'insert_drive_file';
}

function activeProjectQuery() {
  let query = String(location.hash || '').split('?')[1] || '';
  let projectId = new URLSearchParams(query).get('project');
  return projectId ? `?project=${encodeURIComponent(projectId)}` : '';
}

export class AgentPortalTree extends Symbiote {
  init$ = {
    treeHTML: '<div class="pg-placeholder">Loading .agent-portal...</div>',
    filterText: '',
    onFilterInput: (event) => {
      this.$.filterText = event.target.value.toLowerCase();
      this._applyFilter();
    },
    onCollapseAll: () => {
      this._expandedDirs.clear();
      this._saveExpandedState();
      this.renderTree();
    }
  };

  initCallback() {
    this._tree = [];
    this._expandedDirs = new Set(['agents', 'skills', 'workflows']);
    try {
      let stored = localStorage.getItem('pg-agent-portal-tree-expanded');
      if (stored) this._expandedDirs = new Set(JSON.parse(stored));
    } catch {}

    this.loadTree();
    events.addEventListener('agent-portal-tree-refresh', () => this.loadTree());
    events.addEventListener('file-selected', (event) => {
      if (event.detail.path?.startsWith('.agent-portal/')) {
        requestAnimationFrame(() => this._highlightFile(event.detail.path));
      }
    });

    this.addEventListener('click', (event) => {
      let file = event.target.closest('.pg-tree-file');
      if (file) {
        let path = file.dataset.file;
        this.querySelectorAll('.pg-tree-file.active, .pg-tree-dir.active').forEach(el => el.classList.remove('active'));
        file.classList.add('active');
        state.activeFile = path;
        emit('file-selected', { path, source: 'agent-portal-tree' });
        return;
      }
      let dir = event.target.closest('.pg-tree-dir');
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
      let res = await fetch(`/api/agent-portal/tree${activeProjectQuery()}`);
      let data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      this._tree = data.tree || [];
      this.renderTree({ scrollActive: true });
    } catch (err) {
      let message = /ENOENT|no such file or directory/.test(err.message)
        ? 'Team memory is not initialized for this project. Add or sync the .agent-portal submodule to edit agents, skills, and workflows here.'
        : `Error: ${err.message}`;
      this.$.treeHTML = `<div class="pg-placeholder">${esc(message)}</div>`;
    }
  }

  renderTree({ scrollActive = false } = {}) {
    if (!this._tree.length) {
      this.$.treeHTML = '<div class="pg-placeholder">No files found</div>';
      return;
    }
    if (scrollActive && state.activeFile?.startsWith('.agent-portal/')) {
      this._expandAncestors(state.activeFile);
    }
    this.$.treeHTML = this._tree.map(node => this._renderNode(node, 0)).join('');
    requestAnimationFrame(() => {
      if (state.activeFile?.startsWith('.agent-portal/')) {
        this._highlightFile(state.activeFile, { scroll: scrollActive });
      }
      this._applyFilter();
    });
  }

  _renderNode(node, depth) {
    let pad = depth * 16 + 6;
    if (node.type === 'dir') {
      let open = this._expandedDirs.has(node.path);
      return `
        <div class="pg-tree-dir" draggable="true" data-dir="${esc(node.path)}" style="padding-left:${pad}px">
          <span class="material-symbols-outlined pg-chevron" style="font-size:16px">${open ? 'expand_more' : 'chevron_right'}</span>
          <span class="material-symbols-outlined" style="font-size:16px">folder</span>
          ${esc(node.name)}
        </div>
        <div class="pg-tree-children" data-dir="${esc(node.path)}" ${open ? '' : 'hidden'}>
          ${open ? (node.children || []).map(child => this._renderNode(child, depth + 1)).join('') : ''}
        </div>
      `;
    }
    let fullPath = `.agent-portal/${node.path}`;
    return `
      <div class="pg-tree-file" draggable="true" data-file="${esc(fullPath)}" style="padding-left:${pad + 18}px">
        <span class="material-symbols-outlined" style="font-size:14px">${iconFor(node.name)}</span>
        ${esc(node.name)}
      </div>
    `;
  }

  _highlightFile(path, { scroll = false } = {}) {
    this.querySelectorAll('.pg-tree-file.active, .pg-tree-dir.active').forEach(el => el.classList.remove('active'));
    let el = this.querySelector(`.pg-tree-file[data-file="${CSS.escape(path)}"]`);
    if (el) {
      el.classList.add('active');
      if (scroll) el.scrollIntoView({ block: 'center' });
    }
  }

  _expandAncestors(path) {
    let relPath = path.replace(/^\.agent-portal\//, '');
    let parts = relPath.split('/');
    parts.pop();
    for (let index = 1; index <= parts.length; index++) {
      this._expandedDirs.add(parts.slice(0, index).join('/'));
    }
  }

  _saveExpandedState() {
    localStorage.setItem('pg-agent-portal-tree-expanded', JSON.stringify([...this._expandedDirs]));
  }

  _applyFilter() {
    let filter = this.$.filterText;
    this.querySelectorAll('.pg-tree-file').forEach(file => {
      file.hidden = !!filter && !file.dataset.file.toLowerCase().includes(filter);
    });
  }
}

AgentPortalTree.template = `
  <div class="pg-panel-toolbar">
    <input type="search" placeholder="Filter .agent-portal..." bind="oninput: onFilterInput">
    <button class="pg-collapse-all" bind="onclick: onCollapseAll" title="Collapse All Folders">
      <span class="material-symbols-outlined" style="font-size:14px">unfold_less</span>
    </button>
  </div>
  <div class="pg-tree-content" bind="innerHTML: treeHTML"></div>
`;

AgentPortalTree.rootStyles = `
  pg-agent-portal-tree {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    font-size: 12px;
    font-family: var(--sn-font, Georgia, serif);
  }
  pg-agent-portal-tree .pg-panel-toolbar {
    padding: 6px 8px;
    border-bottom: 1px solid var(--sn-node-border, hsl(35, 18%, 80%));
    display: flex;
    gap: 6px;
  }
  pg-agent-portal-tree .pg-panel-toolbar input {
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
  pg-agent-portal-tree .pg-collapse-all {
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
  pg-agent-portal-tree .pg-tree-content {
    flex: 1;
    overflow-y: auto;
    padding: 4px;
  }
  pg-agent-portal-tree .pg-tree-dir,
  pg-agent-portal-tree .pg-tree-file {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px;
    cursor: pointer;
    border-radius: 4px;
    color: var(--sn-text-dim, hsl(30, 10%, 45%));
  }
  pg-agent-portal-tree .pg-tree-dir {
    font-weight: 600;
    font-size: 11px;
    user-select: none;
  }
  pg-agent-portal-tree .pg-tree-dir:hover,
  pg-agent-portal-tree .pg-tree-file:hover {
    background: var(--sn-node-hover, hsl(36, 22%, 88%));
    color: var(--sn-text, hsl(30, 15%, 18%));
  }
  pg-agent-portal-tree .pg-tree-file.active,
  pg-agent-portal-tree .pg-tree-dir.active {
    background: hsla(210, 45%, 45%, 0.12);
    color: var(--sn-cat-server, hsl(210, 45%, 45%));
  }
  pg-agent-portal-tree .pg-tree-children[hidden],
  pg-agent-portal-tree .pg-tree-file[hidden] {
    display: none;
  }
  pg-agent-portal-tree .pg-placeholder {
    padding: 12px;
    color: var(--sn-text-dim, hsl(30, 10%, 45%));
  }
`;

AgentPortalTree.reg('pg-agent-portal-tree');

export default AgentPortalTree;
