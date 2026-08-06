/**
 * Pure state reducer helpers for sn-data-table grid state transitions.
 */

export function normalizeColumnWidth(value) {
  if (value == null || value === 'auto') return 'auto';
  let width = Number(value);
  if (!Number.isFinite(width) || width <= 0) return 'auto';
  return String(Math.round(width));
}

function normalizePinned(value) {
  if (value === 'left' || value === 'right') return value;
  return false;
}

export function normalizeColumns(columns) {
  if (!Array.isArray(columns)) return [];
  return columns
    .filter((col) => col && typeof col === 'object' && col.key)
    .map((col, index) => ({
      key: String(col.key),
      label: String(col.label ?? col.key),
      align: col.align === 'end' || col.align === 'center' ? col.align : 'start',
      sortable: Boolean(col.sortable),
      sortDirection: ['asc', 'desc', 'none'].includes(col.sortDirection) ? col.sortDirection : 'none',
      visible: col.visible !== false,
      pinned: normalizePinned(col.pinned),
      width: normalizeColumnWidth(col.width),
      order: typeof col.order === 'number' ? col.order : index,
      filterValue: col.filterValue !== undefined ? col.filterValue : null,
    }));
}

export function sortColumns(columns) {
  return [...columns].sort((a, b) => {
    // Pinning priority: left pinned first, then unpinned, then right pinned
    let aPinVal = a.pinned === 'left' ? -1 : a.pinned === 'right' ? 1 : 0;
    let bPinVal = b.pinned === 'left' ? -1 : b.pinned === 'right' ? 1 : 0;
    if (aPinVal !== bPinVal) {
      return aPinVal - bPinVal;
    }
    // Then order
    return a.order - b.order;
  });
}

export function toggleColumnVisibility(columns, key, visible) {
  return columns.map((col) => {
    if (col.key === key) {
      return { ...col, visible: Boolean(visible) };
    }
    return col;
  });
}

export function setColumnWidth(columns, key, width) {
  return columns.map((col) => {
    if (col.key === key) {
      return { ...col, width: normalizeColumnWidth(width) };
    }
    return col;
  });
}

export function toggleColumnPinning(columns, key, pinned) {
  let pinVal = normalizePinned(pinned);
  return columns.map((col) => {
    if (col.key === key) {
      return { ...col, pinned: pinVal };
    }
    return col;
  });
}

export function toggleRowSelection(selectedIds, rowId, selectionMode) {
  let ids = new Set(selectedIds);
  let idStr = String(rowId);
  if (selectionMode === 'single') {
    if (ids.has(idStr)) {
      ids.clear();
    } else {
      ids.clear();
      ids.add(idStr);
    }
  } else if (selectionMode === 'multi') {
    if (ids.has(idStr)) {
      ids.delete(idStr);
    } else {
      ids.add(idStr);
    }
  }
  return ids;
}

export function toggleRowExpansion(expandedIds, rowId, forceState) {
  let ids = new Set(expandedIds);
  let idStr = String(rowId);
  if (forceState === true) {
    ids.add(idStr);
  } else if (forceState === false) {
    ids.delete(idStr);
  } else {
    if (ids.has(idStr)) {
      ids.delete(idStr);
    } else {
      ids.add(idStr);
    }
  }
  return ids;
}

/**
 * Traverse hierarchical rows and flatten them into a list of visible rows
 * depending on which row IDs are expanded.
 */
export function getTreeRows(rows, expandedIds, level = 0) {
  let result = [];
  if (!Array.isArray(rows)) return result;

  for (let row of rows) {
    if (!row || typeof row !== 'object') continue;
    let flatRow = { ...row, level };
    result.push(flatRow);

    let idStr = row.id != null ? String(row.id) : null;
    let hasChildren = Array.isArray(row.children) && row.children.length > 0;
    if (hasChildren && idStr && expandedIds.has(idStr)) {
      result.push(...getTreeRows(row.children, expandedIds, level + 1));
    }
  }
  return result;
}

/**
 * Client-side local sorting helper (if requested or for unit testing).
 */
export function sortRowRecords(rows, columns, sortColumn, sortDirection) {
  if (!sortColumn || sortDirection === 'none') return [...rows];
  let col = columns.find(c => c.key === sortColumn);
  if (!col) return [...rows];

  return [...rows].sort((a, b) => {
    let aVal = a.cells && typeof a.cells === 'object' ? a.cells[sortColumn]?.text ?? a.cells[sortColumn] : a[sortColumn];
    let bVal = b.cells && typeof b.cells === 'object' ? b.cells[sortColumn]?.text ?? b.cells[sortColumn] : b[sortColumn];

    if (aVal == null) return sortDirection === 'asc' ? 1 : -1;
    if (bVal == null) return sortDirection === 'asc' ? -1 : 1;

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    }

    let aStr = String(aVal).toLowerCase();
    let bStr = String(bVal).toLowerCase();
    if (aStr < bStr) return sortDirection === 'asc' ? -1 : 1;
    if (aStr > bStr) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });
}
