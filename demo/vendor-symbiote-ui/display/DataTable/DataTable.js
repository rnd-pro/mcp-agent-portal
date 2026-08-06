import Symbiote from '@symbiotejs/symbiote';
import { escapeHtml } from '../markdown-formatter.js';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import '../Badge/Badge.js';
import template from './DataTable.tpl.js';
import css from './DataTable.css.js';
import {
  normalizeColumns,
  sortColumns,
  toggleColumnVisibility,
  setColumnWidth,
  toggleColumnPinning,
  toggleRowSelection,
  toggleRowExpansion,
  getTreeRows,
} from './dataTableState.js';

function emit(el, type, detail = {}) {
  el.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
}

function escapeAttr(value) {
  return escapeHtml(String(value ?? '')).replaceAll('`', '&#96;');
}

function normalizeMarker(value) {
  let marker = String(value ?? '').trim();
  if (/^var\(--sn-[a-z0-9-]+\)$/i.test(marker)) return marker;
  return '';
}

function normalizeVariant(value) {
  let variant = String(value ?? '').trim();
  if (['success', 'info', 'warning', 'error'].includes(variant)) return variant;
  return '';
}

function resolveCell(row, column) {
  let source = row.cells && typeof row.cells === 'object'
    ? row.cells[column.key]
    : row[column.key];
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    return source;
  }
  return { text: source };
}

function cellPlainText(cell) {
  if (cell?.badge && typeof cell.badge === 'object') return String(cell.badge.label ?? cell.badge.text ?? '').trim();
  return String(cell?.text ?? cell?.label ?? cell?.value ?? '').trim();
}

function rowTargetText(row, columns, limit = 4) {
  return columns
    .filter((column) => column.visible !== false)
    .slice(0, limit)
    .map((column) => cellPlainText(resolveCell(row, column)))
    .filter(Boolean)
    .join(' · ');
}

function encodeTargetSegment(value) {
  return encodeURIComponent(String(value ?? '')).replace(/%20/g, '+');
}

function renderCellContent(cell) {
  let markerValue = normalizeMarker(cell.marker);
  let marker = markerValue
    ? `<span class="sn-data-table-marker" style="--sn-data-table-marker-color: ${escapeAttr(markerValue)}"></span>`
    : '';
  let content = cell.badge && typeof cell.badge === 'object'
    ? renderBadge(cell.badge)
    : `<span class="sn-data-table-text">${escapeHtml(cell.text ?? '')}</span>`;
  return `<span class="sn-data-table-cell">${marker}${content}</span>`;
}

function renderBadge(badge) {
  let label = escapeHtml(badge.label ?? badge.text ?? '');
  let variant = normalizeVariant(badge.variant);
  let variantAttr = variant ? ` variant="${variant}"` : '';
  return `<sn-badge${variantAttr}>${label}</sn-badge>`;
}

function getStickyOffsets(columns) {
  let leftOffsets = {};
  let rightOffsets = {};

  let leftSum = 0;
  for (let col of columns) {
    if (col.pinned === 'left') {
      leftOffsets[col.key] = leftSum;
      let w = parseInt(col.width) || 120;
      leftSum += w;
    }
  }

  let rightSum = 0;
  // Reverse loop for right pinned
  for (let i = columns.length - 1; i >= 0; i--) {
    let col = columns[i];
    if (col.pinned === 'right') {
      rightOffsets[col.key] = rightSum;
      let w = parseInt(col.width) || 120;
      rightSum += w;
    }
  }

  return { leftOffsets, rightOffsets };
}

function getVisibleRowHeight(scrollContainer, fallback) {
  let configured = Number(fallback);
  if (Number.isFinite(configured) && configured > 0) return configured;

  let row = scrollContainer.querySelector('tbody tr:not(.sn-data-table-details-row)');
  let measured = row?.getBoundingClientRect?.().height;
  return Number.isFinite(measured) && measured > 0 ? measured : 36;
}

function renderHead(columns, sortColumn, sortDirection, hasExpand, selectionMode, selectedRowIds, visibleRows) {
  let cells = [];

  // 1. If multi-select mode, render select all column
  if (selectionMode === 'multi') {
    let selectableRows = visibleRows.filter((row) => row.id != null);
    let allSelected = selectableRows.length > 0
      && selectableRows.every((row) => selectedRowIds.has(String(row.id)));
    let checked = allSelected ? ' checked' : '';
    cells.push(`<th scope="col" style="width: 40px; position: sticky; left: 0; z-index: 3;">
      <div class="sn-data-table-header-content">
        <input type="checkbox" class="sn-data-table-select-all" aria-label="Select all rows"${checked}>
      </div>
    </th>`);
  }

  // 2. If row details expand column is needed
  if (hasExpand) {
    cells.push(`<th scope="col" style="width: 40px;"></th>`);
  }

  // Calculate sticky offsets
  let { leftOffsets, rightOffsets } = getStickyOffsets(columns);
  let selectOffset = selectionMode === 'multi' ? 40 : 0;

  columns.forEach((column) => {
    if (column.visible === false) return;

    let ariaSort = '';
    let sortIndicator = '';

    if (column.sortable) {
      let isSorted = sortColumn === column.key;
      ariaSort = ` aria-sort="${isSorted ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}"`;
      let icon = 'unfold_more';
      if (isSorted) {
        icon = sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward';
      }
      sortIndicator = `<button class="sn-data-table-sort-btn" data-column-key="${escapeAttr(column.key)}" aria-label="Sort by ${escapeAttr(column.label)}">
        <span class="material-symbols-outlined">${icon}</span>
      </button>`;
    }

    let stickyStyle = '';
    if (column.pinned === 'left') {
      let left = (leftOffsets[column.key] ?? 0) + selectOffset;
      stickyStyle = `position: sticky; left: ${left}px; z-index: 2;`;
    } else if (column.pinned === 'right') {
      let right = rightOffsets[column.key] ?? 0;
      stickyStyle = `position: sticky; right: ${right}px; z-index: 2;`;
    }

    let widthStyle = column.width !== 'auto' ? `width: ${column.width}px; min-width: ${column.width}px; max-width: ${column.width}px;` : '';
    let styleAttr = (stickyStyle || widthStyle) ? ` style="${stickyStyle}${widthStyle}"` : '';

    cells.push(`<th scope="col" data-align="${column.align}"${ariaSort}${styleAttr}>
      <div class="sn-data-table-header-content">
        <span>${escapeHtml(column.label)}</span>
        ${sortIndicator}
      </div>
    </th>`);
  });

  return `<tr>${cells.join('')}</tr>`;
}

function renderBody(columns, rows, selectedRowIds, expandedRowIds, hasExpand, selectionMode) {
  let { leftOffsets, rightOffsets } = getStickyOffsets(columns);
  let selectOffset = selectionMode === 'multi' ? 40 : 0;

  return rows.map((row) => {
    let cells = [];

    // 1. Checkbox for multi-select
    if (selectionMode === 'multi') {
      let isRowSelected = selectedRowIds.has(String(row.id));
      cells.push(`<td style="position: sticky; left: 0; z-index: 2;">
        <input type="checkbox" class="sn-data-table-select-row" data-row-id="${escapeAttr(row.id)}" ${isRowSelected ? 'checked' : ''} aria-label="Select row">
      </td>`);
    }

    // 2. caret for row details
    if (hasExpand) {
      if (row.details) {
        let isExpanded = row.id && expandedRowIds.has(String(row.id));
        cells.push(`<td>
          <button class="sn-data-table-expand-btn" data-row-id="${escapeAttr(row.id)}" aria-label="${isExpanded ? 'Collapse' : 'Expand'} row" aria-expanded="${isExpanded}">
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
        </td>`);
      } else {
        cells.push('<td></td>');
      }
    }

    // 3. Render cells
    columns.forEach((column, colIndex) => {
      if (column.visible === false) return;

      let cell = resolveCell(row, column);
      let align = cell.align === 'end' || cell.align === 'center' ? cell.align : column.align;

      let stickyStyle = '';
      if (column.pinned === 'left') {
        let left = (leftOffsets[column.key] ?? 0) + selectOffset;
        stickyStyle = `position: sticky; left: ${left}px; z-index: 2;`;
      } else if (column.pinned === 'right') {
        let right = rightOffsets[column.key] ?? 0;
        stickyStyle = `position: sticky; right: ${right}px; z-index: 2;`;
      }

      let indentStyle = '';
      let treeToggle = '';
      if (colIndex === 0 && row.level > 0) {
        indentStyle = `padding-left: ${16 + row.level * 20}px;`;
      }
      if (colIndex === 0 && Array.isArray(row.children) && row.children.length > 0) {
        let isExpanded = row.id && expandedRowIds.has(String(row.id));
        treeToggle = `<button class="sn-data-table-tree-btn" data-row-id="${escapeAttr(row.id)}" aria-label="${isExpanded ? 'Collapse' : 'Expand'} row" aria-expanded="${isExpanded}">
          <span class="material-symbols-outlined">${isExpanded ? 'keyboard_arrow_down' : 'keyboard_arrow_right'}</span>
        </button>`;
      }

      let widthStyle = column.width !== 'auto' ? `width: ${column.width}px; min-width: ${column.width}px; max-width: ${column.width}px;` : '';
      let styleAttr = (stickyStyle || widthStyle || indentStyle)
        ? ` style="${stickyStyle}${widthStyle}${indentStyle}"`
        : '';

      cells.push(`<td data-align="${align}"${styleAttr}>${treeToggle}${renderCellContent(cell)}</td>`);
    });

    let rowId = row.id ? ` data-row-id="${escapeAttr(row.id)}"` : '';
    let isSelected = row.id && selectedRowIds.has(String(row.id));
    let ariaSelected = isSelected ? ' aria-selected="true"' : '';
    let tabIndex = ' tabindex="-1"';
    let isExpanded = row.id && expandedRowIds.has(String(row.id));

    let expandRowHtml = '';
    if (hasExpand && row.details && isExpanded) {
      let totalCols = columns.filter(c => c.visible !== false).length + (selectionMode === 'multi' ? 1 : 0) + 1;
      expandRowHtml = `<tr class="sn-data-table-details-row">
        <td colspan="${totalCols}">${escapeHtml(row.details)}</td>
      </tr>`;
    }

    let ariaExpandedAttr = (row.details || (Array.isArray(row.children) && row.children.length > 0)) ? ` aria-expanded="${isExpanded}"` : '';

    return `<tr${rowId}${ariaSelected}${tabIndex}${ariaExpandedAttr}>${cells.join('')}</tr>${expandRowHtml}`;
  }).join('');
}

export class DataTable extends Symbiote {
  static observedAttributes = ['loading', 'selected-row-id', 'selection-mode'];

  #columns = [];
  #rows = [];
  #selectedRowIds = new Set();
  #expandedRowIds = new Set();

  init$ = {
    headHtml: '',
    bodyHtml: '',
    emptyText: 'No rows',
    loadingText: 'Loading...',
    errorText: '',
    loading: false,
    selectedRowId: '',
    selectionMode: 'single',
    sortColumn: '',
    sortDirection: 'none',
    isEmpty: true,
    showTable: false,
    hideTable: true,

    onHeadClick: (event) => {
      let selectAll = event.target?.closest('.sn-data-table-select-all');
      if (selectAll) {
        event.stopPropagation();
        let visibleRows = getTreeRows(this.#rows, this.#expandedRowIds);
        if (selectAll.checked) {
          this.#selectedRowIds = new Set(
            visibleRows
              .filter((row) => row.id != null)
              .map((row) => String(row.id))
          );
        } else {
          this.#selectedRowIds.clear();
        }
        this.#render();
        emit(this, 'sn-data-table-select', {
          selectedRowIds: this.selectedRowIds,
          mode: 'all',
        });
        return;
      }

      let sortBtn = event.target?.closest('.sn-data-table-sort-btn');
      if (!sortBtn) return;
      event.stopPropagation();
      let columnKey = sortBtn.dataset.columnKey;
      let currentDir = this.$.sortDirection;
      let nextDir = 'asc';
      if (this.$.sortColumn === columnKey) {
        if (currentDir === 'asc') nextDir = 'desc';
        else if (currentDir === 'desc') nextDir = 'none';
      }
      this.$.sortColumn = columnKey;
      this.$.sortDirection = nextDir;
      this.#render();
      emit(this, 'sn-data-table-sort', { columnKey, direction: nextDir });
    },

    onBodyClick: (event) => {
      let selectRow = event.target?.closest('.sn-data-table-select-row');
      if (selectRow) {
        let rowId = selectRow.dataset.rowId;
        this.#selectedRowIds = toggleRowSelection(this.#selectedRowIds, rowId, 'multi');
        this.#render();
        emit(this, 'sn-data-table-select', { rowId, selectedRowIds: this.selectedRowIds });
        return;
      }

      let treeBtn = event.target?.closest('.sn-data-table-tree-btn');
      if (treeBtn) {
        event.stopPropagation();
        let rowId = treeBtn.dataset.rowId;
        this.toggleRowExpansion(rowId);
        return;
      }

      let expandBtn = event.target?.closest('.sn-data-table-expand-btn');
      if (expandBtn) {
        event.stopPropagation();
        let rowId = expandBtn.dataset.rowId;
        this.toggleRowExpansion(rowId);
        return;
      }

      let tr = event.target?.closest('tr');
      if (!tr || tr.classList.contains('sn-data-table-details-row')) return;
      let rowId = tr.dataset.rowId;
      if (rowId) {
        if (this.$.selectionMode === 'single') {
          this.#selectedRowIds = toggleRowSelection(this.#selectedRowIds, rowId, 'single');
          this.selectedRowId = this.#selectedRowIds.has(rowId) ? rowId : '';
          let rowData = this.#rows.find(r => String(r.id) === rowId);
          emit(this, 'sn-data-table-select', { rowId, row: rowData, selectedRowIds: this.selectedRowIds });
        } else if (this.$.selectionMode === 'multi') {
          this.#selectedRowIds = toggleRowSelection(this.#selectedRowIds, rowId, 'multi');
          this.#render();
          emit(this, 'sn-data-table-select', { rowId, selectedRowIds: this.selectedRowIds });
        }
      }
    },

    onBodyDblClick: (event) => {
      let td = event.target?.closest('td');
      if (!td) return;
      let tr = td.parentElement;
      if (!tr || tr.classList.contains('sn-data-table-details-row')) return;
      let rowId = tr.dataset.rowId;
      let colIndex = Array.from(tr.children).indexOf(td);

      let dataColIndex = colIndex;
      if (this.$.selectionMode === 'multi') dataColIndex--;
      let visibleRows = getTreeRows(this.#rows, this.#expandedRowIds);
      if (visibleRows.some(r => r.details)) dataColIndex--;

      let visibleColumns = sortColumns(this.#columns).filter((column) => column.visible !== false);
      if (dataColIndex >= 0 && dataColIndex < visibleColumns.length) {
        let column = visibleColumns[dataColIndex];
        let rowData = visibleRows.find(r => String(r.id) === rowId);
        if (column && rowData) {
          let cellData = resolveCell(rowData, column);
          emit(this, 'sn-data-table-edit', {
            rowId,
            columnKey: column.key,
            value: cellData.text ?? cellData,
            row: rowData,
          });
        }
      }
    },

    onScroll: (event) => {
      let scrollContainer = event.target;
      let scrollTop = scrollContainer.scrollTop;
      let clientHeight = scrollContainer.clientHeight;
      let rowHeight = getVisibleRowHeight(scrollContainer, this.getAttribute('row-height'));
      let startIndex = Math.floor(scrollTop / rowHeight);
      let endIndex = Math.min(this.#rows.length - 1, Math.ceil((scrollTop + clientHeight) / rowHeight));

      emit(this, 'sn-data-table-visible-window', {
        startIndex,
        endIndex,
        scrollTop,
        clientHeight,
      });
    },

    onBodyKeyDown: (event) => {
      const tbody = this.querySelector('tbody');
      if (!tbody) return;
      const rows = Array.from(tbody.querySelectorAll('tr:not(.sn-data-table-details-row)'));
      if (rows.length === 0) return;

      const activeEl = document.activeElement;
      let index = rows.indexOf(activeEl);

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          if (index < rows.length - 1) {
            rows[index].setAttribute('tabindex', '-1');
            rows[index + 1].setAttribute('tabindex', '0');
            rows[index + 1].focus();
          }
          break;
        case 'ArrowUp':
          event.preventDefault();
          if (index > 0) {
            rows[index].setAttribute('tabindex', '-1');
            rows[index - 1].setAttribute('tabindex', '0');
            rows[index - 1].focus();
          }
          break;
        case ' ':
        case 'Enter':
          event.preventDefault();
          if (index >= 0) {
            let tr = rows[index];
            let rowId = tr.dataset.rowId;
            if (rowId) {
              if (this.$.selectionMode === 'single') {
                this.#selectedRowIds = toggleRowSelection(this.#selectedRowIds, rowId, 'single');
                this.selectedRowId = this.#selectedRowIds.has(rowId) ? rowId : '';
                let rowData = this.#rows.find(r => String(r.id) === rowId);
                emit(this, 'sn-data-table-select', { rowId, row: rowData, selectedRowIds: this.selectedRowIds });
              } else if (this.$.selectionMode === 'multi') {
                this.#selectedRowIds = toggleRowSelection(this.#selectedRowIds, rowId, 'multi');
                this.#render();
                emit(this, 'sn-data-table-select', { rowId, selectedRowIds: this.selectedRowIds });
              }
            }
          }
          break;
        case 'ArrowRight': {
          if (index >= 0) {
            let tr = rows[index];
            let rowId = tr.dataset.rowId;
            if (rowId && tr.hasAttribute('aria-expanded') && tr.getAttribute('aria-expanded') === 'false') {
              event.preventDefault();
              this.toggleRowExpansion(rowId, true);
            }
          }
          break;
        }
        case 'ArrowLeft': {
          if (index >= 0) {
            let tr = rows[index];
            let rowId = tr.dataset.rowId;
            if (rowId && tr.hasAttribute('aria-expanded') && tr.getAttribute('aria-expanded') === 'true') {
              event.preventDefault();
              this.toggleRowExpansion(rowId, false);
            }
          }
          break;
        }
      }
    }
  };

  toggleRowExpansion(rowId, forceState) {
    this.#expandedRowIds = toggleRowExpansion(this.#expandedRowIds, rowId, forceState);
    this.#render();
  }

  setColumns(columns = []) {
    this.#columns = normalizeColumns(columns);
    this.#render();
  }

  setRows(rows = []) {
    this.#rows = rows;
    this.#render();
  }

  setData({ columns = this.#columns, rows = this.#rows, emptyText = this.$.emptyText } = {}) {
    this.#columns = normalizeColumns(columns);
    this.#rows = rows;
    this.set$({ emptyText: String(emptyText ?? 'No rows') });
    this.#render();
  }

  getData() {
    return {
      columns: [...this.#columns],
      rows: [...this.#rows],
    };
  }

  getWebMcpTargets({
    tabId = '',
    panelId = '',
    resourceType = 'data-row',
    maxRows = 6,
    targetPrefix = '',
  } = {}) {
    let prefix = targetPrefix || (tabId && panelId ? `element:${tabId}:${panelId}:row` : 'element:data-table:row');
    return this.#rows
      .filter((row) => row && row.id != null)
      .slice(0, Math.max(0, Number(maxRows) || 0))
      .map((row) => {
        let rowId = String(row.id);
        let id = `${prefix}:${encodeTargetSegment(rowId)}`;
        let el = [...this.querySelectorAll('tr[data-row-id]')].find((candidate) => candidate.dataset?.rowId === rowId) || null;
        try { if (el) el.dataset.tourTargetId = id; } catch {}
        let title = rowTargetText(row, this.#columns, 1) || rowId;
        let summary = rowTargetText(row, this.#columns, 5) || rowId;
        return {
          id,
          kind: 'detail',
          title,
          summary,
          resourceType,
          component: 'sn-data-table',
          metadata: { rowId },
          element: el,
        };
      });
  }

  toggleColumnVisibility(key, visible) {
    this.#columns = toggleColumnVisibility(this.#columns, key, visible);
    this.#render();
  }

  setColumnWidth(key, width) {
    this.#columns = setColumnWidth(this.#columns, key, width);
    this.#render();
  }

  toggleColumnPinning(key, pinned) {
    this.#columns = toggleColumnPinning(this.#columns, key, pinned);
    this.#render();
  }

  get selectionMode() { return this.getAttribute('selection-mode') || 'single'; }
  set selectionMode(val) {
    this.setAttribute('selection-mode', String(val || 'single'));
    this.$.selectionMode = String(val || 'single');
    this.#render();
  }

  get selectedRowIds() { return Array.from(this.#selectedRowIds); }
  set selectedRowIds(val) {
    this.#selectedRowIds = new Set(Array.isArray(val) ? val.map(String) : []);
    this.#render();
  }

  get loading() { return this.hasAttribute('loading'); }
  set loading(val) {
    this.toggleAttribute('loading', Boolean(val));
    this.$.loading = Boolean(val);
  }

  get errorText() { return this.$.errorText; }
  set errorText(val) {
    this.$.errorText = String(val || '');
    this.#render();
  }

  get selectedRowId() { return this.$.selectedRowId; }
  set selectedRowId(val) {
    this.$.selectedRowId = String(val || '');
    this.setAttribute('selected-row-id', this.$.selectedRowId);
    if (this.$.selectedRowId) {
      this.#selectedRowIds.add(this.$.selectedRowId);
    } else {
      this.#selectedRowIds.clear();
    }
    this.#render();
  }

  get sortColumn() { return this.$.sortColumn; }
  set sortColumn(val) {
    this.$.sortColumn = String(val || '');
    this.#render();
  }

  get sortDirection() { return this.$.sortDirection; }
  set sortDirection(val) {
    this.$.sortDirection = String(val || '');
    this.#render();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'loading') {
      this.$.loading = newValue !== null;
    } else if (name === 'selected-row-id') {
      this.$.selectedRowId = newValue || '';
      if (this.$.selectedRowId) {
        this.#selectedRowIds.add(this.$.selectedRowId);
      } else {
        this.#selectedRowIds.clear();
      }
      this.#render();
    } else if (name === 'selection-mode') {
      this.$.selectionMode = newValue || 'single';
      this.#render();
    } else {
      super.attributeChangedCallback?.(name, oldValue, newValue);
    }
  }

  connectedCallback() {
    super.connectedCallback?.();
    this.$.loading = this.hasAttribute('loading');
    this.$.selectedRowId = this.getAttribute('selected-row-id') || '';
    if (this.$.selectedRowId) {
      this.#selectedRowIds.add(this.$.selectedRowId);
    }
    this.$.selectionMode = this.getAttribute('selection-mode') || 'single';
    this.#render();
  }

  #render() {
    let sortedCols = sortColumns(this.#columns);
    let visibleRows = getTreeRows(this.#rows, this.#expandedRowIds);
    let isEmpty = sortedCols.length === 0 || visibleRows.length === 0;
    let hasExpand = visibleRows.some(r => r.details);

    const iconNames = ['chevron_right', 'keyboard_arrow_right', 'keyboard_arrow_down'];
    const sortIcons = sortedCols.filter(c => c.sortable).map(() => 'unfold_more');
    if (sortIcons.length > 0) {
      iconNames.push('unfold_more', 'arrow_upward', 'arrow_downward');
    }
    ensureMaterialSymbols(iconNames);

    this.set$({
      headHtml: renderHead(
        sortedCols,
        this.$.sortColumn,
        this.$.sortDirection,
        hasExpand,
        this.$.selectionMode,
        this.#selectedRowIds,
        visibleRows
      ),
      bodyHtml: renderBody(sortedCols, visibleRows, this.#selectedRowIds, this.#expandedRowIds, hasExpand, this.$.selectionMode),
      isEmpty,
      showTable: !isEmpty && !this.$.errorText,
      hideTable: isEmpty || Boolean(this.$.errorText),
    });
    this.toggleAttribute('empty', isEmpty);

    setTimeout(() => {
      const tbody = this.querySelector('tbody');
      if (!tbody) return;
      const trs = Array.from(tbody.querySelectorAll('tr:not(.sn-data-table-details-row)'));
      if (trs.length > 0) {
        trs.forEach((tr) => {
          let isSelected = tr.dataset.rowId && this.#selectedRowIds.has(String(tr.dataset.rowId));
          tr.setAttribute('tabindex', isSelected ? '0' : '-1');
        });
        if (!trs.some(t => t.getAttribute('tabindex') === '0')) {
          trs[0].setAttribute('tabindex', '0');
        }
      }
    }, 0);
  }
}

DataTable.template = template;
DataTable.rootStyles = css;
DataTable.reg('sn-data-table');

export default DataTable;
