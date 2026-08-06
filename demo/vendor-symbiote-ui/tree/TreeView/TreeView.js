import Symbiote from '@symbiotejs/symbiote';
import template from './TreeView.tpl.js';
import css from './TreeView.css.js';

function emit(el, type, detail = {}) {
  el.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
}

function escapeCssValue(value = '') {
  if (globalThis.CSS?.escape) return globalThis.CSS.escape(String(value));
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function normalizeBadges(badges = []) {
  if (!Array.isArray(badges)) return [];
  return badges
    .map((badge) => {
      if (badge && typeof badge === 'object') return badge.label || badge.text || badge.value || '';
      return badge;
    })
    .filter((badge) => badge !== null && badge !== undefined && badge !== '');
}

function textMatches(item, needle) {
  if (!needle) return true;
  let fields = [item.label, item.kind, item.icon, item.path, item.id, ...normalizeBadges(item.badges)];
  return fields.some((field) => String(field || '').toLowerCase().includes(needle));
}

function hasStorage() {
  return typeof localStorage !== 'undefined' && localStorage;
}

function serializeDragPayload(payload) {
  if (payload === null || payload === undefined) return '';
  return typeof payload === 'string' ? payload : JSON.stringify(payload);
}

function getItemId(item) {
  return String(item?.id || item?.path || '');
}

export class TreeView extends Symbiote {
  #items = [];
  #selectedId = '';
  #expandedIds = new Set();
  #defaultExpandedIds = [];
  #expandedIdsLoaded = false;
  #filterText = '';
  #storageKey = '';
  #toggleBranchesOnSelect = false;
  #visibleItems = [];

  init$ = {
    onTreeClick: (event) => {
      let row = event.target?.closest?.('.sn-tree-row');
      if (!row) return;
      let item = this.#visibleItems[Number(row.dataset.index)];
      if (!item) return;

      if (event.target?.closest?.('.sn-tree-toggle')) {
        this.#toggleItem(item);
        return;
      }

      this.selectedId = getItemId(item);
      if (this.#toggleBranchesOnSelect && Array.isArray(item.children) && item.children.length > 0) {
        this.#toggleItem(item);
      }
      emit(this, 'sn-tree-select', { item });
    },

    onTreeKeydown: (event) => {
      let row = event.target?.closest?.('.sn-tree-row');
      if (!row) return;

      const rows = this.getVisibleRowElements();
      let index = rows.indexOf(row);
      if (index === -1) return;

      const item = this.#visibleItems[Number(row.dataset.index)];
      if (!item) return;

      switch (event.key) {
        case 'Enter':
        case ' ':
          event.preventDefault();
          row.click();
          break;

        case 'ArrowDown': {
          event.preventDefault();
          const nextRow = rows[index + 1];
          if (nextRow) nextRow.focus();
          break;
        }

        case 'ArrowUp': {
          event.preventDefault();
          const prevRow = rows[index - 1];
          if (prevRow) prevRow.focus();
          break;
        }

        case 'ArrowRight': {
          event.preventDefault();
          const hasChildren = Array.isArray(item.children) && item.children.length > 0;
          const id = getItemId(item);
          const expanded = this.#expandedIds.has(id);
          if (hasChildren) {
            if (!expanded) {
              this.#toggleItem(item);
            } else {
              const nextRow = rows[index + 1];
              if (nextRow) nextRow.focus();
            }
          }
          break;
        }

        case 'ArrowLeft': {
          event.preventDefault();
          const hasChildren = Array.isArray(item.children) && item.children.length > 0;
          const id = getItemId(item);
          const expanded = this.#expandedIds.has(id);
          if (hasChildren && expanded) {
            this.#toggleItem(item);
          } else {
            let parentEl = null;
            let currentDepth = Number(row.style.getPropertyValue('--sn-tree-depth') || 0);
            for (let i = index - 1; i >= 0; i--) {
              let depth = Number(rows[i].style.getPropertyValue('--sn-tree-depth') || 0);
              if (depth < currentDepth) {
                parentEl = rows[i];
                break;
              }
            }
            if (parentEl) parentEl.focus();
          }
          break;
        }

        case 'Home': {
          event.preventDefault();
          rows[0]?.focus();
          break;
        }

        case 'End': {
          event.preventDefault();
          rows[rows.length - 1]?.focus();
          break;
        }
      }
    },

    onTreeDragStart: (event) => {
      let row = event.target?.closest?.('.sn-tree-row');
      if (!row) return;
      let item = this.#visibleItems[Number(row.dataset.index)];
      if (!item?.draggable) {
        event.preventDefault();
        return;
      }
      let payload = item.payload ?? item.dragText ?? item.path ?? item.id ?? '';
      if (payload && event.dataTransfer) {
        event.dataTransfer.setData('text/plain', serializeDragPayload(payload));
        event.dataTransfer.effectAllowed = item.dragEffect || 'copy';
      }
      emit(this, 'sn-tree-dragstart', { item, payload, nativeEvent: event });
    },
  };

  get items() {
    return this.#items;
  }

  set items(items) {
    this.setItems(items);
  }

  get selectedId() {
    return this.#selectedId;
  }

  set selectedId(value) {
    this.#selectedId = value || '';
    this.#renderTree();
  }

  get expandedIds() {
    return [...this.#expandedIds];
  }

  set expandedIds(value) {
    this.#expandedIds = new Set(Array.from(value || []).map(String));
    this.#expandedIdsLoaded = true;
    this.#persistExpandedIds();
    this.#renderTree();
  }

  get defaultExpandedIds() {
    return [...this.#defaultExpandedIds];
  }

  set defaultExpandedIds(value) {
    this.#defaultExpandedIds = Array.from(value || []).map(String);
    this.#expandedIdsLoaded = false;
    this.#loadExpandedIds();
    this.#renderTree();
  }

  get filterText() {
    return this.#filterText;
  }

  set filterText(value) {
    this.#filterText = String(value || '');
    this.#renderTree();
  }

  get storageKey() {
    return this.#storageKey;
  }

  set storageKey(value) {
    this.#storageKey = String(value || '');
    this.#expandedIdsLoaded = false;
    this.#loadExpandedIds();
    this.#renderTree();
  }

  get toggleBranchesOnSelect() {
    return this.#toggleBranchesOnSelect;
  }

  set toggleBranchesOnSelect(value) {
    this.#toggleBranchesOnSelect = Boolean(value);
  }

  static filterItems(items = [], filterText = '') {
    let needle = String(filterText || '').trim().toLowerCase();
    return TreeView.#filterBranch(Array.isArray(items) ? items : [], needle);
  }

  static #filterBranch(items, needle) {
    let result = [];
    for (let item of items) {
      if (!item || typeof item !== 'object') continue;
      let children = Array.isArray(item.children) ? item.children : [];
      let filteredChildren = TreeView.#filterBranch(children, needle);
      if (!needle || textMatches(item, needle) || filteredChildren.length > 0) {
        result.push({ item, children: filteredChildren });
      }
    }
    return result;
  }

  getVisibleRowElements() {
    return Array.from(this.querySelectorAll('.sn-tree-row'));
  }

  renderCallback() {
    this.#loadExpandedIds();
    this.#renderTree();
  }

  setItems(items = []) {
    this.#items = Array.isArray(items) ? items : [];
    this.#renderTree();
  }

  collapseAll() {
    this.#expandedIds.clear();
    this.#persistExpandedIds();
    this.#renderTree();
  }

  toggleItem(item) {
    if (!item) return;
    this.#toggleItem(item);
  }

  expandAncestors(idOrPath) {
    let target = String(idOrPath || '');
    if (!target) return false;
    let ancestors = [];
    let found = this.#collectAncestors(this.#items, target, ancestors);
    if (!found) return false;
    for (let item of ancestors) {
      let id = getItemId(item);
      if (id) this.#expandedIds.add(id);
    }
    this.#persistExpandedIds();
    this.#renderTree();
    return true;
  }

  scrollSelectedIntoView() {
    if (!this.#selectedId || !this.ref.tree?.querySelector) return;
    let selector = `.sn-tree-row[data-tree-id="${escapeCssValue(this.#selectedId)}"]`;
    this.ref.tree.querySelector(selector)?.scrollIntoView?.({ block: 'nearest' });
  }

  #toggleItem(item) {
    let id = getItemId(item);
    if (!id) return;
    let expanded = !this.#expandedIds.has(id);
    if (expanded) {
      this.#expandedIds.add(id);
    } else {
      this.#expandedIds.delete(id);
    }
    this.#persistExpandedIds();
    this.#renderTree();
    emit(this, 'sn-tree-toggle', { item, expanded });
  }

  #collectAncestors(items, target, ancestors) {
    for (let item of items) {
      if (!item || typeof item !== 'object') continue;
      let id = getItemId(item);
      let path = String(item.path || '');
      if (id === target || path === target) return true;

      let children = Array.isArray(item.children) ? item.children : [];
      ancestors.push(item);
      if (this.#collectAncestors(children, target, ancestors)) return true;
      ancestors.pop();
    }
    return false;
  }

  #loadExpandedIds() {
    if (this.#expandedIdsLoaded) return;
    if (!this.#storageKey || !hasStorage()) {
      this.#expandedIds = new Set(this.#defaultExpandedIds);
      this.#expandedIdsLoaded = true;
      return;
    }
    try {
      let value = localStorage.getItem(this.#storageKey);
      if (!value) {
        this.#expandedIds = new Set(this.#defaultExpandedIds);
        this.#expandedIdsLoaded = true;
        return;
      }
      let ids = JSON.parse(value);
      if (Array.isArray(ids)) {
        this.#expandedIds = new Set(ids.map(String));
      }
    } catch {
      this.#expandedIds = new Set();
    }
    this.#expandedIdsLoaded = true;
  }

  #persistExpandedIds() {
    if (!this.#storageKey || !hasStorage()) return;
    localStorage.setItem(this.#storageKey, JSON.stringify(this.expandedIds));
  }

  #getIndentSize() {
    if (typeof getComputedStyle !== 'function') return 16;
    let rawValue = getComputedStyle(this).getPropertyValue('--sn-tree-indent').trim();
    if (!rawValue.endsWith('px')) return 16;
    let size = Number.parseFloat(rawValue);
    return Number.isFinite(size) ? size : 16;
  }

  #renderTree() {
    if (!this.ref.tree) return;
    this.#visibleItems = [];
    let filtered = TreeView.filterItems(this.#items, this.#filterText);
    let nodes = [];
    let indentSize = this.#getIndentSize();
    this.#appendBranches(nodes, filtered, 0, Boolean(this.#filterText.trim()), indentSize);
    this.ref.tree.replaceChildren(...nodes);
  }

  #appendBranches(parent, branches, depth, forceExpanded, indentSize) {
    for (let { item, children } of branches) {
      let id = getItemId(item);
      let hasChildren = children.length > 0;
      let expanded = forceExpanded || this.#expandedIds.has(id);
      let rowIndex = this.#visibleItems.push(item) - 1;
      let row = document.createElement('div');
      row.className = 'sn-tree-row';
      row.setAttribute('role', 'treeitem');

      let isFocusable = false;
      if (this.#selectedId) {
        isFocusable = (id === this.#selectedId);
      } else {
        isFocusable = (rowIndex === 0);
      }
      row.tabIndex = isFocusable ? 0 : -1;

      row.dataset.index = String(rowIndex);
      row.dataset.treeId = id;
      row.style.setProperty('--sn-tree-depth', String(depth));
      row.style.setProperty('--sn-tree-depth-indent', `${depth * indentSize}px`);
      row.setAttribute('aria-selected', String(id === this.#selectedId));
      row.setAttribute('aria-expanded', hasChildren ? String(expanded) : 'false');
      row.toggleAttribute('muted', Boolean(item.muted));
      row.draggable = Boolean(item.draggable);

      let toggle = document.createElement('button');
      toggle.className = 'sn-tree-toggle';
      toggle.type = 'button';
      toggle.hidden = !hasChildren;
      toggle.textContent = expanded ? 'expand_more' : 'chevron_right';

      let icon = document.createElement('span');
      icon.className = 'sn-tree-icon';
      icon.hidden = !item.icon;
      icon.textContent = item.icon || '';

      let label = document.createElement('span');
      label.className = 'sn-tree-label';
      label.textContent = item.label || id;

      let kind = document.createElement('span');
      kind.className = 'sn-tree-kind';
      kind.hidden = !item.kind;
      kind.textContent = item.kind || '';

      let badges = document.createElement('span');
      badges.className = 'sn-tree-badges';
      let normalizedBadges = normalizeBadges(item.badges);
      badges.hidden = normalizedBadges.length === 0;
      for (let badge of normalizedBadges) {
        let badgeEl = document.createElement('span');
        badgeEl.className = 'sn-tree-badge';
        badgeEl.textContent = badge;
        badges.appendChild(badgeEl);
      }

      row.append(toggle, icon, label, kind, badges);
      parent.push(row);

      if (hasChildren && expanded) {
        this.#appendBranches(parent, children, depth + 1, forceExpanded, indentSize);
      }
    }
  }
}

TreeView.template = template;
TreeView.rootStyles = css;
TreeView.reg('sn-tree-view');

export default TreeView;
