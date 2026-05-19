// @ctx .context/web/panels/file-tree.ctx
import Symbiote from '@symbiotejs/symbiote';
import { api, state, events, emit } from '../../app.js';
import template from './FileTree.tpl.js';
import css from './FileTree.css.js';

export class FileTree extends Symbiote {
  init$ = {
    treeHTML: '<div class="pg-placeholder">Loading files...</div>',
    filterText: '',
    onFilterInput: (event) => {
      this.$.filterText = event.target.value.toLowerCase();
      this._applyFilter();
    },
    onCollapseAll: () => {
      this._collapseAll();
    },
  };

  _treeData = null;

  initCallback() {
    this._expandedDirs = new Set();

    try {
      const stored = localStorage.getItem('pg-tree-expanded');
      if (stored) {
        const expandedDirs = JSON.parse(stored);
        if (Array.isArray(expandedDirs)) {
          this._expandedDirs = new Set(expandedDirs);
        }
      }
    } catch (err) {}

    events.addEventListener('skeleton-loaded', (event) => {
      this._renderTree(event.detail);
      if (state.activeFile) {
        requestAnimationFrame(() => this._highlightFile(state.activeFile));
      }
    });

    if (state.skeleton) {
      this._renderTree(state.skeleton);
    } else {
      this._fetchSkeleton();
    }

    events.addEventListener('file-selected', (event) => {
      if (event.detail.fromRoute || event.detail.source === 'canvas') {
        requestAnimationFrame(() => this._highlightFile(event.detail.path));
      }
    });

    this.addEventListener('click', (event) => {
      const fileEl = event.target.closest('.pg-tree-file');
      if (fileEl) {
        this.querySelectorAll('.pg-tree-file.active').forEach((el) => el.classList.remove('active'));
        this.querySelectorAll('.pg-tree-dir.active').forEach((el) => el.classList.remove('active'));
        fileEl.classList.add('active');
        state.activeFile = fileEl.dataset.file;
        emit('file-selected', { path: fileEl.dataset.file });
        return;
      }

      const dirEl = event.target.closest('.pg-tree-dir');
      if (dirEl) {
        const dir = dirEl.dataset.dir;
        if (dir != null) {
          this._toggleDir(dir);
          this.querySelectorAll('.pg-tree-file.active').forEach((el) => el.classList.remove('active'));
          this.querySelectorAll('.pg-tree-dir.active').forEach((el) => el.classList.remove('active'));
          dirEl.classList.add('active');
          emit('file-selected', { path: `${dir}/` });
        }
      }
    });

    this.addEventListener('dragstart', (event) => {
      const fileEl = event.target.closest('.pg-tree-file');
      if (fileEl && fileEl.dataset.file) {
        event.dataTransfer.setData('text/plain', fileEl.dataset.file);
        event.dataTransfer.effectAllowed = 'copy';
        return;
      }

      const dirEl = event.target.closest('.pg-tree-dir');
      if (dirEl && dirEl.dataset.dir) {
        event.dataTransfer.setData('text/plain', `${dirEl.dataset.dir}/`);
        event.dataTransfer.effectAllowed = 'copy';
      }
    });
  }

  async _fetchSkeleton() {
    try {
      const skeleton = await api('/api/skeleton', {});
      if (!state.skeleton) {
        state.skeleton = skeleton;
      }
      this._renderTree(skeleton);
      emit('skeleton-loaded', skeleton);
      if (state.activeFile) {
        requestAnimationFrame(() => this._highlightFile(state.activeFile));
      }
    } catch (err) {}
  }

  _toggleDir(dir) {
    if (this._expandedDirs.has(dir)) {
      this._expandedDirs.delete(dir);
    } else {
      this._expandedDirs.add(dir);
    }
    this._saveExpandedState();
    this._updateDirDOM(dir);
  }

  _saveExpandedState() {
    localStorage.setItem('pg-tree-expanded', JSON.stringify(Array.from(this._expandedDirs)));
  }

  _lazyRenderChildren(dir) {
    const childrenEl = this.querySelector(`.pg-tree-children[data-dir="${CSS.escape(dir)}"]`);
    if (!childrenEl || childrenEl.dataset.rendered) return;
    if (!this._treeData) return;

    const parts = dir.split('/');
    let node = this._treeData;
    for (const part of parts) {
      if (!node || !node.children[part]) {
        node = null;
        break;
      }
      node = node.children[part];
    }

    if (!node) return;

    childrenEl.innerHTML = this._renderNode(node, dir, dir.split('/').length);
    childrenEl.dataset.rendered = '1';
  }

  _updateDirDOM(dir) {
    const dirEl = this.querySelector(`.pg-tree-dir[data-dir="${CSS.escape(dir)}"]`);
    const childrenEl = this.querySelector(`.pg-tree-children[data-dir="${CSS.escape(dir)}"]`);
    if (dirEl && childrenEl) {
      const isExpanded = this._expandedDirs.has(dir);
      const chevronEl = dirEl.querySelector('.pg-chevron');
      if (chevronEl) {
        chevronEl.textContent = isExpanded ? 'expand_more' : 'chevron_right';
      }
      if (isExpanded) {
        this._lazyRenderChildren(dir);
        childrenEl.removeAttribute('hidden');
      } else {
        childrenEl.setAttribute('hidden', '');
      }
    }
  }

  _collapseAll() {
    this._expandedDirs.clear();
    this._saveExpandedState();
    this.querySelectorAll('.pg-tree-dir').forEach((el) => {
      this._updateDirDOM(el.dataset.dir);
    });
  }

  _highlightFile(path) {
    // Support directory paths (e.g. "web/" -> data-dir="web")
    if (path.endsWith('/')) {
      const dir = path.replace(/\/$/, '');
      const parts = dir.split('/');
      for (let i = 1; i < parts.length; i++) {
        const parent = parts.slice(0, i).join('/');
        if (!this._expandedDirs.has(parent)) {
          this._expandedDirs.add(parent);
          this._lazyRenderChildren(parent);
          this._updateDirDOM(parent);
        }
      }
      this._saveExpandedState();

      const dirEl = this.querySelector(`.pg-tree-dir[data-dir="${CSS.escape(dir)}"]`);
      if (dirEl) {
        this.querySelectorAll('.pg-tree-file.active').forEach((el) => el.classList.remove('active'));
        this.querySelectorAll('.pg-tree-dir.active').forEach((el) => el.classList.remove('active'));
        dirEl.classList.add('active');
        dirEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      return;
    }

    const fileEl = this.querySelector(`.pg-tree-file[data-file="${CSS.escape(path)}"]`);
    if (fileEl) {
      this.querySelectorAll('.pg-tree-file.active').forEach((el) => el.classList.remove('active'));
      fileEl.classList.add('active');
      fileEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
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

  _renderNode(node, parentDir, depth) {
    const html = [];
    const dirs = Object.keys(node.children).sort();
    const files = node.files.sort((a, b) => a.name.localeCompare(b.name));
    const left = 16 * depth;

    for (const dirName of dirs) {
      const dir = parentDir ? `${parentDir}/${dirName}` : dirName;
      const isExpanded = this._expandedDirs && this._expandedDirs.has(dir);
      const icon = isExpanded ? 'expand_more' : 'chevron_right';

      html.push(`<div class="pg-tree-dir" draggable="true" data-dir="${dir}" style="padding-left:${left + 6}px"><span class="material-symbols-outlined pg-chevron" style="font-size:16px">${icon}</span> <span class="material-symbols-outlined" style="font-size:16px">folder</span> ${dirName}</div>`);

      if (isExpanded) {
        html.push(`<div class="pg-tree-children" data-dir="${dir}" data-rendered="1">`);
        html.push(this._renderNode(node.children[dirName], dir, depth + 1));
        html.push('</div>');
      } else {
        html.push(`<div class="pg-tree-children" data-dir="${dir}" hidden></div>`);
      }
    }

    for (const file of files) {
      const icon = FileTree._getFileIcon(file.name);
      const badges = [];
      if (file.exports > 0) badges.push(`${file.exports}f`);
      if (file.classes > 0) badges.push(`${file.classes}c`);

      const badge = badges.length > 0 ? `<span class="pg-badge">${badges.join(' ')}</span>` : '';
      const nonSourceClass = file.nonSource ? ' pg-non-source' : '';
      html.push(`<div class="pg-tree-file${nonSourceClass}" draggable="true" data-file="${file.f}" style="padding-left:${left + 24}px"><span class="material-symbols-outlined" style="font-size:14px">${icon}</span> ${file.name}${badge}</div>`);
    }

    return html.join('');
  }

  _renderTree(skeleton) {
    if (!skeleton) {
      this.$.treeHTML = '<div class="pg-placeholder">No files found</div>';
      return;
    }

    this._treeData = this._buildTree(skeleton);
    const count = Object.keys(this._treeData.children).length + this._treeData.files.length;
    if (count === 0) {
      this.$.treeHTML = '<div class="pg-placeholder">No files found</div>';
      return;
    }

    this.$.treeHTML = this._renderNode(this._treeData, '', 0);
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
    const filterText = this.$.filterText;
    if (filterText) {
      this._expandAllForFilter();
      this.querySelectorAll('.pg-tree-file').forEach((fileEl) => {
        const isMatch = fileEl.dataset.file.toLowerCase().includes(filterText);
        fileEl.hidden = !isMatch;
      });
      this.querySelectorAll('.pg-tree-dir').forEach((dirEl) => {
        const dir = dirEl.dataset.dir;
        const childrenEl = this.querySelector(`.pg-tree-children[data-dir="${CSS.escape(dir)}"]`);
        if (!childrenEl) return;

        let hasMatch = false;
        childrenEl.querySelectorAll('.pg-tree-file:not([hidden])').forEach(() => {
          hasMatch = true;
        });
        dirEl.hidden = !hasMatch;
      });
    } else {
      this.querySelectorAll('.pg-tree-file').forEach((fileEl) => {
        fileEl.hidden = false;
      });
      this.querySelectorAll('.pg-tree-dir').forEach((dirEl) => {
        dirEl.hidden = false;
      });
    }
  }

  _expandAllForFilter() {
    if (!this._treeData) return;

    const expand = (node, parentDir) => {
      for (const dirName of Object.keys(node.children)) {
        const dir = parentDir ? `${parentDir}/${dirName}` : dirName;
        this._lazyRenderChildren(dir);
        const childrenEl = this.querySelector(`.pg-tree-children[data-dir="${CSS.escape(dir)}"]`);
        if (childrenEl) {
          childrenEl.removeAttribute('hidden');
        }
        expand(node.children[dirName], dir);
      }
    };

    expand(this._treeData, '');
  }
}

FileTree.template = template;
FileTree.rootStyles = css;
FileTree.reg('pg-file-tree');
