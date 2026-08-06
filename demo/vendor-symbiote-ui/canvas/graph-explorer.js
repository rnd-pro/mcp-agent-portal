export const GRAPH_PATH_STYLES = ['pcb', 'bezier', 'orthogonal', 'straight'];
export const GRAPH_VIEW_MODES = ['structured', 'flat'];
export const GRAPH_PATH_STYLE_MENU_GROUP = Object.freeze({
  group: 'path',
  groupLabel: 'Connections',
  groupOrder: 20,
});
export const GRAPH_PATH_STYLE_MENU_ITEMS = Object.freeze({
  pcb: Object.freeze({ label: 'Routed', icon: 'route' }),
  orthogonal: Object.freeze({ label: 'Right angles', icon: 'account_tree' }),
  bezier: Object.freeze({ label: 'Curved', icon: 'gesture' }),
  straight: Object.freeze({ label: 'Straight', icon: 'trending_flat' }),
});

export const GRAPH_DIRECTORY_FRAME_COLORS = [
  'var(--sn-graph-cluster-0)',
  'var(--sn-graph-cluster-1)',
  'var(--sn-graph-cluster-2)',
  'var(--sn-graph-cluster-3)',
  'var(--sn-graph-cluster-4)',
  'var(--sn-graph-cluster-5)',
  'var(--sn-graph-cluster-6)',
];

export function resolveInitialGraphViewMode(urlParams) {
  const modeParam = urlParams.get('mode');
  return modeParam === 'flat' ? 'flat' : 'structured';
}

export function normalizeGraphExplorerViewMode(mode) {
  return mode === 'flat' ? 'flat' : 'structured';
}

export const normalizeGraphViewMode = normalizeGraphExplorerViewMode;

function supportsGraphPathStyleMenuActions(mode) {
  return mode === 'structured';
}

export function resolveGraphPathStyleAction(actionId) {
  const id = String(actionId || '');
  if (!id.startsWith('path:')) return '';
  const style = id.slice('path:'.length);
  return GRAPH_PATH_STYLES.includes(style) ? style : '';
}

export function createGraphPathStyleMenuActions({
  mode = 'structured',
  pathStyle = 'pcb',
  labels = {},
  titles = {},
  group = GRAPH_PATH_STYLE_MENU_GROUP.group,
  groupLabel = GRAPH_PATH_STYLE_MENU_GROUP.groupLabel,
  groupOrder = GRAPH_PATH_STYLE_MENU_GROUP.groupOrder,
} = {}) {
  if (!supportsGraphPathStyleMenuActions(mode)) return [];
  return GRAPH_PATH_STYLES.map((style) => {
    const item = GRAPH_PATH_STYLE_MENU_ITEMS[style] || {};
    const label = labels[style] || item.label || style;
    return {
      id: `path:${style}`,
      label,
      icon: item.icon || 'route',
      title: titles[style] || `Use ${label} connection paths`,
      group,
      groupLabel,
      groupOrder,
      active: style === pathStyle,
    };
  });
}

function scheduleGraphExplorerFrame(callback) {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(callback);
  } else {
    callback();
  }
}

function resolveGraphExplorerElement(root, selector, fallback) {
  return fallback || root?.querySelector?.(selector) || null;
}

function normalizeFocusNodeIds(nodeIds) {
  let ids = Array.isArray(nodeIds) ? nodeIds : [nodeIds];
  let normalized = [];
  let seen = new Set();
  for (let id of ids) {
    let normalizedId = String(id || '').trim();
    if (!normalizedId || seen.has(normalizedId)) continue;
    seen.add(normalizedId);
    normalized.push(normalizedId);
  }
  return normalized;
}

export function applyGraphExplorerViewMode({
  mode = 'structured',
  shell = null,
  structuredCanvas = null,
  flatGraph = null,
  refresh = true,
} = {}) {
  const normalized = normalizeGraphExplorerViewMode(mode);
  const root = shell || structuredCanvas?.parentElement || flatGraph?.parentElement || null;
  const resolvedStructured = resolveGraphExplorerElement(root, 'node-canvas', structuredCanvas);
  const resolvedFlat = resolveGraphExplorerElement(root, 'canvas-graph', flatGraph);

  shell?.setMode?.(normalized);
  shell?.setAttribute?.('data-mode', normalized);

  if (resolvedStructured) {
    resolvedStructured.hidden = normalized === 'flat';
    resolvedStructured.setAttribute?.('data-graph-mode', normalized);
    if (normalized === 'flat') {
      resolvedStructured.suspendLayout?.({ reason: 'view-mode-hidden', releaseDom: true });
    } else {
      resolvedStructured.resumeLayout?.({ reason: 'view-mode-active' });
    }
  }
  if (resolvedFlat) {
    resolvedFlat.hidden = normalized !== 'flat';
    resolvedFlat.setAttribute?.('data-graph-mode', normalized);
    if (normalized === 'flat') {
      resolvedFlat.resumeLayout?.({ reason: 'view-mode-active' });
    } else {
      resolvedFlat.suspendLayout?.({ reason: 'view-mode-hidden' });
    }
  }

  if (refresh) {
    scheduleGraphExplorerFrame(() => {
      if (normalized === 'flat') {
        resolvedFlat?.resizeCanvas?.();
      } else {
        resolvedStructured?.refreshConnections?.();
      }
    });
  }

  return {
    mode: normalized,
    structuredCanvas: resolvedStructured,
    flatGraph: resolvedFlat,
  };
}

export function createGraphExplorerViewController({
  shell = null,
  structuredCanvas = null,
  flatGraph = null,
  mode = 'structured',
  initialMode = null,
  pathStyle = 'pcb',
  structuredEditor = null,
  structuredModel = null,
  flatModel = null,
  flatPath = null,
  path = null,
  onModeChange = null,
} = {}) {
  let state = {
    shell,
    structuredCanvas,
    flatGraph,
    mode: normalizeGraphExplorerViewMode(initialMode ?? mode),
    pathStyle,
    structuredEditor,
    structuredModel,
    flatModel,
    flatPath: flatPath ?? path,
  };
  let subscribers = new Set();
  let pendingFlatFocusCleanup = null;

  function snapshot() {
    return {
      shell: state.shell,
      structuredCanvas: state.structuredCanvas,
      flatGraph: state.flatGraph,
      mode: state.mode,
      pathStyle: state.pathStyle,
      structuredEditor: state.structuredEditor,
      structuredModel: state.structuredModel,
      flatModel: state.flatModel,
      flatPath: state.flatPath,
    };
  }

  function notify(event) {
    let current = snapshot();
    for (let subscriber of subscribers) {
      subscriber(current, event);
    }
  }

  function clearPendingFlatFocus() {
    if (typeof pendingFlatFocusCleanup === 'function') pendingFlatFocusCleanup();
    pendingFlatFocusCleanup = null;
  }

  function runFlatFocus(nodeIds, options = {}, { fit = false } = {}) {
    let ids = normalizeFocusNodeIds(nodeIds);
    if (ids.length === 0 || !state.flatGraph) return false;

    if (fit || ids.length > 1 || options.fit === true || options.drill === false) {
      let focusOptions = { padding: 80, ...options, fit: true };
      let focused = Boolean(
        state.flatGraph.focusNodes?.(ids, focusOptions)
        || state.flatGraph.fitNodes?.(ids, focusOptions)
      );
      if (focused && focusOptions.pulse !== false) {
        let selectedId = typeof focusOptions.select === 'string' ? focusOptions.select : ids[0];
        let pulseId = ids.includes(selectedId) ? selectedId : ids[0];
        state.flatGraph.pulseNode?.(pulseId, focusOptions.pulseMs ?? 900);
      }
      return focused;
    }

    let focused = Boolean(state.flatGraph.flyToNode?.(ids[0], { zoom: 1.1, ...options }));
    if (focused && options.pulse !== false) {
      state.flatGraph.pulseNode?.(ids[0], options.pulseMs ?? 900);
    }
    return focused;
  }

  function deferFlatFocus(nodeIds, options = {}, focusOptions = {}) {
    if (!state.flatGraph?.addEventListener || options.defer === false) return;
    clearPendingFlatFocus();
    let attempts = 0;
    let done = false;
    let hasTickFocus = false;
    let cleanupTimer = typeof globalThis.setTimeout === 'function'
      ? globalThis.setTimeout(() => {
        done = true;
        clearPendingFlatFocus();
      }, focusOptions.fit ? 5600 : 1200)
      : null;
    let retry = (event) => {
      if (done) return;
      if (focusOptions.fit && event?.type === 'layout-tick' && hasTickFocus) {
        return;
      }
      attempts += 1;
      if (event?.type === 'layout-tick') hasTickFocus = true;
      let focused = runFlatFocus(
        nodeIds,
        { ...options, defer: false, pulse: attempts === 1 && options.pulse !== false },
        focusOptions
      );
      let finalAttempt = event?.type === 'layout-done';
      let maxAttempts = focusOptions.fit ? Number.POSITIVE_INFINITY : 12;
      if (focused || finalAttempt || attempts >= maxAttempts) {
        done = true;
        clearPendingFlatFocus();
      }
    };
    let cleanup = () => {
      if (cleanupTimer) globalThis.clearTimeout?.(cleanupTimer);
      cleanupTimer = null;
      state.flatGraph?.removeEventListener?.('layout-tick', retry);
      state.flatGraph?.removeEventListener?.('layout-done', retry);
    };
    pendingFlatFocusCleanup = cleanup;
    state.flatGraph.addEventListener('layout-tick', retry);
    state.flatGraph.addEventListener('layout-done', retry);
  }

  let api = {
    get mode() {
      return state.mode;
    },

    get structuredCanvas() {
      return state.structuredCanvas;
    },

    get flatGraph() {
      return state.flatGraph;
    },

    getState() {
      return snapshot();
    },

    subscribe(callback) {
      if (typeof callback !== 'function') return () => {};
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },

    connect(next = {}) {
      state = {
        ...state,
        ...next,
        mode: normalizeGraphExplorerViewMode(next.initialMode ?? next.mode ?? state.mode),
        flatPath: next.flatPath ?? next.path ?? state.flatPath,
      };
      if (state.structuredEditor) api.setStructuredEditor(state.structuredEditor);
      if (state.structuredModel) api.setStructuredModel(state.structuredModel);
      if (state.flatModel) api.setFlatModel(state.flatModel);
      if (state.flatPath != null) api.setFlatPath(state.flatPath);
      api.setPathStyle(state.pathStyle);
      api.setMode(state.mode, { notify: false });
      return api;
    },

    setMode(nextMode, { notify: shouldNotify = true, refresh = true } = {}) {
      let result = applyGraphExplorerViewMode({
        mode: nextMode,
        shell: state.shell,
        structuredCanvas: state.structuredCanvas,
        flatGraph: state.flatGraph,
        refresh,
      });
      state.mode = result.mode;
      state.structuredCanvas = result.structuredCanvas;
      state.flatGraph = result.flatGraph;
      if (shouldNotify) {
        onModeChange?.(state.mode);
        api.notify('mode');
      }
      return state.mode;
    },

    toggleMode(options = {}) {
      return api.setMode(state.mode === 'flat' ? 'structured' : 'flat', options);
    },

    setStructuredEditor(editor) {
      state.structuredEditor = editor;
      state.structuredCanvas?.setEditor?.(editor);
      notify('structured-editor');
      return api;
    },

    setStructuredModel(model) {
      state.structuredModel = model;
      state.structuredCanvas?.setEditorModel?.(model);
      notify('structured-model');
      return api;
    },

    setFlatModel(model) {
      state.flatModel = model;
      state.flatGraph?.setGraphModel?.(model);
      notify('flat-model');
      return api;
    },

    setFlatPath(path = null) {
      state.flatPath = path;
      state.flatGraph?.setPath?.(path);
      notify('flat-path');
      return api;
    },

    setPath(path = null) {
      return api.setFlatPath(path);
    },

    setModels({
      structured = undefined,
      structuredEditor: nextStructuredEditor = undefined,
      structuredModel: nextStructuredModel = undefined,
      flat = undefined,
      flatModel: nextFlatModel = undefined,
      flatPath: nextFlatPath = undefined,
      path: nextPath = undefined,
    } = {}) {
      let structuredValue = nextStructuredEditor ?? structured;
      if (structuredValue !== undefined) {
        if (structuredValue?.nodes && typeof structuredValue.toJSON !== 'function') {
          api.setStructuredModel(structuredValue);
        } else {
          api.setStructuredEditor(structuredValue);
        }
      }
      if (nextStructuredModel !== undefined) api.setStructuredModel(nextStructuredModel);
      let flatValue = nextFlatModel ?? flat;
      if (flatValue !== undefined) api.setFlatModel(flatValue);
      let pathValue = nextFlatPath ?? nextPath;
      if (pathValue !== undefined) api.setFlatPath(pathValue);
      return api;
    },

    setPathStyle(style = 'pcb') {
      state.pathStyle = style;
      state.shell?.setPathStyle?.(style);
      state.structuredCanvas?.setPathStyle?.(style);
      state.structuredCanvas?.refreshConnections?.();
      notify('path-style');
      return api;
    },

    getPathStyleMenuActions(options = {}) {
      return createGraphPathStyleMenuActions({
        ...options,
        mode: state.mode,
        pathStyle: state.pathStyle,
      });
    },

    runPathStyleMenuAction(actionId) {
      const style = resolveGraphPathStyleAction(actionId);
      if (!style || state.mode !== 'structured') return false;
      api.setPathStyle(style);
      return true;
    },

    fitView({ structuredArgs = [], flatArgs = [] } = {}) {
      if (state.mode === 'flat') {
        state.flatGraph?.fitView?.(...flatArgs);
      } else {
        state.structuredCanvas?.fitView?.(...structuredArgs);
      }
      return api;
    },

    focusNode({
      nodeId = '',
      structuredNodeIds = null,
      flatNodeId = nodeId,
      flatNodeIds = null,
      structuredOptions = {},
      flatOptions = {},
    } = {}) {
      if (state.mode === 'flat') {
        let explicitFlatNodeIds = flatNodeIds != null;
        let ids = normalizeFocusNodeIds(explicitFlatNodeIds ? flatNodeIds : flatNodeId);
        if (ids.length > 0) {
          let options = { fit: explicitFlatNodeIds, ...flatOptions };
          let didFocus = runFlatFocus(ids, options, { fit: explicitFlatNodeIds });
          if (!didFocus) {
            deferFlatFocus(ids, { ...options, pulse: !didFocus }, { fit: explicitFlatNodeIds });
          }
        }
        return api;
      }

      let nodeIds = structuredNodeIds || (nodeId ? [nodeId] : []);
      if (nodeIds.length > 0) {
        state.structuredCanvas?.focusNodes?.(nodeIds, structuredOptions);
      }
      return api;
    },

    notify(event = 'state') {
      notify(event);
      return api;
    },

    destroy() {
      clearPendingFlatFocus();
      subscribers.clear();
      state = {
        shell: null,
        structuredCanvas: null,
        flatGraph: null,
        mode: 'structured',
        pathStyle: 'pcb',
        structuredEditor: null,
        structuredModel: null,
        flatModel: null,
        flatPath: null,
      };
    },
  };

  return api.connect();
}

export const createGraphViewModeController = createGraphExplorerViewController;

function setGraphButtonVisual(button, icon, label) {
  const iconElement = button.querySelector?.('.material-symbols-outlined');
  if (!iconElement) {
    button.textContent = label;
    return;
  }

  iconElement.textContent = icon;
  const labelNode = [...(button.childNodes || [])]
    .find((node) => node !== iconElement && node.nodeType === 3 && node.textContent.trim());

  if (labelNode) {
    labelNode.textContent = ` ${label}`;
  } else {
    button.append?.(` ${label}`);
  }
}

export function renderGraphViewModeButton(button, viewMode) {
  if (!button) return;
  const label = viewMode === 'flat' ? 'FLAT' : 'TREE';
  const icon = viewMode === 'flat' ? 'account_tree' : 'grid_view';
  setGraphButtonVisual(button, icon, label);
  if (viewMode === 'structured') {
    button.setAttribute('data-active', '');
  } else {
    button.removeAttribute('data-active');
  }
}

export function getNextGraphPathStyle(currentStyle) {
  const index = GRAPH_PATH_STYLES.indexOf(currentStyle);
  return GRAPH_PATH_STYLES[(index + 1) % GRAPH_PATH_STYLES.length] || 'pcb';
}

export function getGraphPathStyleDisplay(style) {
  switch (style) {
    case 'bezier':
      return { icon: 'timeline', text: 'BEZIER', active: false };
    case 'orthogonal':
      return { icon: 'polyline', text: 'ORTHO', active: false };
    case 'straight':
      return { icon: 'horizontal_rule', text: 'STRAIGHT', active: false };
    case 'pcb':
    default:
      return { icon: 'route', text: 'PCB', active: true };
  }
}

export function renderGraphPathStyleButton(button, style) {
  if (!button) return;
  const { icon, text, active } = getGraphPathStyleDisplay(style);
  setGraphButtonVisual(button, icon, text);
  if (active) {
    button.setAttribute('data-active', '');
  } else {
    button.removeAttribute('data-active');
  }
}

export function addGraphDirectoryFrames({
  editor,
  fileMap,
  dirFiles,
  positions,
  FrameClass,
  colors = GRAPH_DIRECTORY_FRAME_COLORS,
}) {
  if (!dirFiles || dirFiles.size < 2) return;

  const padding = 30;
  const nodeWidth = 120;
  const nodeHeight = 80;
  let colorIdx = 0;

  for (const [dir, files] of dirFiles) {
    if (files.length < 2) continue;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let hasPositions = false;

    for (const file of files) {
      const nodeId = fileMap.get(file);
      if (!nodeId) continue;
      const pos = positions[nodeId];
      if (!pos) continue;
      hasPositions = true;

      if (pos.x < minX) minX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.x + nodeWidth > maxX) maxX = pos.x + nodeWidth;
      if (pos.y + nodeHeight > maxY) maxY = pos.y + nodeHeight;
    }

    if (!hasPositions) continue;

    const dirLabel = dir.replace(/\/$/, '').split('/').pop() || 'root';
    const color = colors[colorIdx % colors.length];
    colorIdx++;

    try {
      const frame = new FrameClass(dirLabel, {
        x: minX - padding,
        y: minY - padding,
        width: (maxX - minX) + padding * 2,
        height: (maxY - minY) + padding * 2,
        color,
      });
      editor.addFrame(frame);
    } catch {
      // Invalid frame geometry should not prevent rendering the graph.
    }
  }
}

export function setGraphLayerVisible(canvas, layer, visible) {
  if (!canvas) return;

  if (layer === 'zones') {
    const frames = canvas.querySelectorAll('graph-frame');
    for (const frame of frames) {
      frame.style.display = visible ? '' : 'none';
      frame.hidden = !visible;
    }
  } else if (layer === 'vias') {
    if (visible) {
      canvas.removeAttribute('data-hide-vias');
    } else {
      canvas.setAttribute('data-hide-vias', '');
    }
  }
}

export function toggleGraphLayerButtonState(button) {
  const isActive = button.hasAttribute('data-active');
  if (isActive) {
    button.removeAttribute('data-active');
    button.setAttribute('data-hidden', '');
  } else {
    button.setAttribute('data-active', '');
    button.removeAttribute('data-hidden');
  }
  return !isActive;
}

export function buildFlatPathHash(path, params = new URLSearchParams()) {
  const nextParams = new URLSearchParams(params);
  const hash = path ? `#graph/${path}` : '#graph';

  if (!path) {
    nextParams.delete('focus');
  }

  const query = nextParams.toString();
  return query ? `${hash}?${query}` : hash;
}

export function selectGraphLabelMode(buttons, selectedButton, canvas) {
  for (const button of buttons) {
    button.removeAttribute('data-active');
  }
  selectedButton.setAttribute('data-active', '');

  const mode = selectedButton.getAttribute('data-mode');
  if (mode) canvas?.setAttribute('data-label-mode', mode);

  return mode;
}

export function getFileSelectionNodeId(filePath) {
  return filePath?.endsWith('/') ? filePath.replace(/\/$/, '') : filePath;
}

export function shouldClearFocusOnSelection({ selectedNodes = [], initialViewRestored, hash = '' }) {
  return selectedNodes.length === 0 && Boolean(initialViewRestored) && hash.includes('focus=');
}

export function resolveFlatHashChange(hash) {
  if (!hash.startsWith('#graph')) return null;

  const [hashBase, queryStr] = hash.replace('#', '').split('?');
  const hashParams = hashBase.split('/');
  if (hashParams[0] === 'graph') hashParams.shift();

  const path = hashParams.join('/');
  const params = new URLSearchParams(queryStr || '');
  const focus = params.get('focus');

  return {
    path,
    focus: focus ? decodeURIComponent(focus) : null,
  };
}

export function getFlatFocusRestoreKey({ path = '', focus = null } = {}) {
  return `${path || ''}::${focus || ''}`;
}

export function shouldRestoreFlatFocus({ lastKey = null, path = '', focus = null } = {}) {
  if (!focus) return false;
  return getFlatFocusRestoreKey({ path, focus }) !== lastKey;
}

export function getGraphHashNavigationState(hash = '') {
  const hasPath = /^#graph\//.test(hash);
  const hasParams = hash.includes('?');

  return {
    hasPath,
    hasParams,
    shouldRestore: hasPath || hasParams,
  };
}

export function shouldFitForceLayoutInitialTick(hash = '') {
  return !(hash.includes('?') || hash.includes('focus='));
}

export function resolveGraphNodeClick({ nodeId, path, symbol, depth = 0, hash = '' }) {
  if (symbol) {
    return {
      hashUpdates: [['symbol', symbol.name]],
      fileEvent: symbol.file ? { path: symbol.file, source: 'canvas' } : null,
    }
  }

  if (!path) return null

  if (depth === 0) {
    return {
      hashUpdates: [['focus', path], ['in', null]],
      fileEvent: { path, source: 'canvas' },
    }
  }

  const drillBase = hash.split('?')[0]
  const drillPath = drillBase.replace('#graph/', '')
  const relativeName = path.startsWith(drillPath) ? path.slice(drillPath.length) : path

  return {
    hashUpdates: [['focus', relativeName], ['in', '1']],
    fileEvent: { path, source: 'canvas' },
  }
}

export function resolveToolbarAction({ action, nodeId, viewMode, path, symbol }) {
  if (action === 'explore') {
    return viewMode === 'flat'
      ? { type: 'fly-to-node', nodeId }
      : { type: 'explore-node', nodeId }
  }

  if (action === 'view-code') {
    const file = viewMode === 'flat' ? nodeId : (symbol ? symbol.file : path)
    return file ? { type: 'open-file', hash: `#explorer/${file}` } : null
  }

  if (action === 'enter' && viewMode === 'flat') {
    return { type: 'drill-node', nodeId }
  }

  return null
}

export function renderClusterPanel({
  panel,
  toggle,
  clusters = [],
  viewMode,
  isOpen,
  doc = typeof document !== 'undefined' ? document : null,
}) {
  if (!panel || !doc) return
  let hasFlatLegend = clusters.length > 0 && viewMode === 'flat'

  if (toggle) {
    toggle.hidden = !hasFlatLegend
    toggle.toggleAttribute('data-active', hasFlatLegend && isOpen)
    toggle.setAttribute(
      'title',
      isOpen ? 'Hide semantic color legend' : 'Show semantic color legend',
    )
  }

  if (!hasFlatLegend || !isOpen) {
    panel.hidden = true
    panel.replaceChildren()
    return
  }

  panel.hidden = false
  panel.replaceChildren(...clusters.map((cluster) => {
    let row = doc.createElement('div')
    let swatch = doc.createElement('span')
    let label = doc.createElement('span')
    let pathCount = cluster.paths.length

    row.className = 'pcb-cluster-row'
    row.title = cluster.description || `${cluster.label}: ${pathCount} paths`
    swatch.className = 'pcb-cluster-swatch'
    swatch.style.background = cluster.color
    label.className = 'pcb-cluster-label'
    label.textContent = cluster.label
    row.replaceChildren(swatch, label)
    return row
  }))
}

export function renderGraphStats(statsEl, items, doc = typeof document !== 'undefined' ? document : null) {
  if (!statsEl || !doc) return
  statsEl.replaceChildren(...items.map(([value, label]) => {
    let item = doc.createElement('span')
    let valueEl = doc.createElement('span')
    valueEl.className = 'graph-explorer-stat-val'
    valueEl.textContent = String(value)
    item.append(valueEl, ` ${label}`)
    return item
  }))
}
