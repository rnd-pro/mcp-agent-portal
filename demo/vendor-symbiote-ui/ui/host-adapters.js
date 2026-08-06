const SELECT_BOUND = Symbol('symbioteListItemSelectBound');

export function syncListItem(host, item, options = {}) {
  let listItem = host.ref?.[options.ref || 'listItem'];
  if (!listItem?.setItem) return null;
  if ('active' in options) host.toggleAttribute('active', Boolean(options.active));
  if (options.iconColor) {
    listItem.style.setProperty('--sn-list-item-icon-color', options.iconColor);
  }
  listItem.setItem(item);
  return listItem;
}

export function bindListItemSelect(host, eventName, detailFactory, options = {}) {
  let listItem = host.ref?.[options.ref || 'listItem'];
  if (!listItem || listItem[SELECT_BOUND]) return;
  listItem[SELECT_BOUND] = true;
  listItem.addEventListener('sn-list-item-select', (event) => {
    host.dispatchEvent(new CustomEvent(eventName, {
      bubbles: true,
      composed: true,
      detail: detailFactory(event),
    }));
  });
}

function getTreePanel(host) {
  return host.ref?.panel || null;
}

function getTree(host) {
  return host.ref?.tree || getTreePanel(host)?.tree || null;
}

function getTreeController(host) {
  return getTreePanel(host) || getTree(host);
}

export function setupTreePanel(host, options = {}) {
  let target = getTreeController(host);
  if (!target?.setItems || host._treePanelReady) return target || null;
  host._treePanelReady = true;
  if (options.storageKey) {
    target.storageKey = options.storageKey;
    if (options.defaultExpandedIds) target.defaultExpandedIds = options.defaultExpandedIds;
  }
  target.toggleBranchesOnSelect = options.toggleBranchesOnSelect !== false;
  if (options.onSelect) {
    target.addEventListener('sn-tree-select', (event) => options.onSelect(event.detail?.item, event));
  }
  target.addEventListener('sn-tree-toggle', (event) => {
    options.onToggle?.(event.detail?.item, event);
  });
  target.addEventListener('sn-tree-panel-filter', (event) => {
    if (host.$ && Object.hasOwn(host.$, 'filterText')) {
      host.$.filterText = event.detail?.filterText || '';
    }
    options.onFilter?.(event.detail?.filterText || '', event);
  });
  return target;
}

export function setTreeItems(host, items, filterText = '') {
  let target = getTreeController(host);
  if (!target) return;
  if (target.setItems) {
    target.setItems(items);
  } else {
    target.items = items;
  }
  target.filterText = filterText;
}

export function showTreePlaceholder(host, message) {
  let panel = getTreePanel(host);
  if (panel?.showPlaceholder) {
    panel.showPlaceholder(message);
    return;
  }
  if (host.ref?.placeholder) {
    host.ref.placeholder.textContent = message;
    host.ref.placeholder.hidden = false;
  }
  let tree = getTree(host);
  if (tree) tree.hidden = true;
}

export function showTree(host) {
  let panel = getTreePanel(host);
  if (panel?.showTree) {
    panel.showTree();
    return;
  }
  if (host.ref?.placeholder) host.ref.placeholder.hidden = true;
  let tree = getTree(host);
  if (tree) tree.hidden = false;
}

export function syncTreeFilter(host, filterText) {
  let target = getTreeController(host);
  if (target) target.filterText = filterText;
}

export function collapseTree(host) {
  getTreeController(host)?.collapseAll?.();
}

export function highlightTreePath(host, path, { scroll = false } = {}) {
  let tree = getTreeController(host);
  if (!tree || !path) return;
  tree.expandAncestors?.(path);
  tree.selectedId = path;
  if (scroll) requestAnimationFrame(() => tree.scrollSelectedIntoView?.());
}
