/**
 * dep-graph.js — Visual Project Graph
 *
 * Renders the project dependency graph as an interactive
 * symbiote-node graph visualization.
 * Uses symbiote-node's NodeCanvas with orthogonal routing,
 * readonly mode, and auto-layout.
 *
 * Phase 1: File-level graph (each file = node, imports = traces).
 */
import Symbiote from '@symbiotejs/symbiote';
import {
  buildCanvasGraphModelFromSkeleton,
  buildFileGraph,
  buildGraphStatItems,
  buildStructuredGraph,
  normalizeProjectGraphMetadata,
  prepareGraphBuild,
} from 'symbiote-node/graph';
import {
  Frame,
  addGraphDirectoryFrames as addDirectoryFrames,
  buildFlatPathHash,
  computeAutoLayout,
  computeTreeLayout,
  computeInitialGraphPositions,
  createForceLayoutPayload,
  getFileSelectionNodeId,
  getFlatFocusRestoreKey,
  getGraphHashNavigationState,
  getDrillableFiles,
  getGraphCacheKey,
  getGraphUrlParams,
  getOrBuildGraph,
  getNextGraphPathStyle as getNextPathStyle,
  parseGraphHash,
  renderClusterPanel,
  renderGraphPathStyleButton as renderPathStyleButton,
  renderGraphStats,
  renderGraphViewModeButton as renderViewModeButton,
  resolveFlatHashChange,
  resolveGraphNodeClick,
  resolveInitialGraphViewMode as resolveInitialViewMode,
  resolveToolbarAction,
  selectGraphLabelMode as selectLabelMode,
  setGraphLayerVisible,
  shouldClearFocusOnSelection,
  shouldFitForceLayoutInitialTick,
  shouldRestoreFlatFocus,
  SubgraphRouter,
  PinExpansion,
  toggleGraphLayerButtonState as toggleLayerButtonState,
  ForceLayout,
  updateHashParam,
} from 'symbiote-node/ui';
import { findConnectionPath, resolveSymbolFile } from 'symbiote-node/graph';
import { api, state, events, emit, getActiveRouteProjectId, resolveProjectPath, skeletonMatchesProject } from '../app.js';
import { emit as dashEmit, events as dashEvents, state as dashState } from '../dashboard-state.js';
import { persistUiValue, readUiValue } from '../common/ui-state.js';

import PCB_CSS from './dep-graph.css.js';
import DEP_GRAPH_TEMPLATE from './dep-graph-template.js';
export class DepGraph extends Symbiote {
  init$ = {};


  /** @type {import('symbiote-node/ui').NodeEditor|null} */
  _editor = null;
  /** @type {boolean} Tracks whether a node was dragged (suppresses click-to-focus) */
  _wasDragged = false;
  /** @type {Map<string, string>} */
  _fileMap = new Map();
  /** @type {HTMLElement|null} */
  _canvas = null;
  /** @type {object|null} Skeleton data for resolving pin names */
  _skeleton = null;
  /** @type {SubgraphRouter} */
  _router = null;
  /** @type {PinExpansion} */
  _pinExpansion = null;
  /** @type {boolean} Guard against duplicate graph builds */
  _graphBuilt = false;
  _projectGraphMetadata = normalizeProjectGraphMetadata();
  _pendingClusterId = null;
  _clusterLegendOpen = false;

  /**
   * Update the PCB preloader overlay
   * @param {number} pct - 0-100 progress percent
   * @param {string} phase - phase label
   * @param {string} [sub] - optional subtitle
   */
  _setProgress(pct, phase, sub = '') {
    this.querySelector('sn-loading-overlay')?.setProgress(pct, phase, sub);
  }

  /** Hide the PCB preloader overlay */
  _hideLoader() {
    this.querySelector('sn-loading-overlay')?.hide(() => this._replayPendingFollowFocus());
  }

  /** Show (or re-show) the PCB preloader overlay */
  _showLoader() {
    this.querySelector('sn-loading-overlay')?.show();
  }

  initCallback() {
    // Build DOM
    this.replaceChildren(document.createRange().createContextualFragment(DEP_GRAPH_TEMPLATE));

    this._canvas = this.querySelector('node-canvas');
    this._pgCanvasGraph = this.querySelector('canvas-graph');

    // Toolbar handlers
    this.querySelector('[data-action="fit"]').addEventListener('click', () => {
      if (this._viewMode === 'flat') {
        this._pgCanvasGraph?.resetView();
      } else {
        this._canvas?.fitView();
      }
    });
    
    this._pgCanvasGraph.addEventListener('path-changed', (e) => {
      if (this._viewMode === 'flat' && this._initialViewRestored) {
        const path = e.detail.path;
        if (path.startsWith('cluster:')) return;
        const { params } = parseGraphHash();
        history.replaceState(null, '', buildFlatPathHash(path, params));
      }
    });
    
    this._pgCanvasGraph.addEventListener('file-selected', (e) => {
      const path = e.detail.path;
      // Update URL with focus= so it's bookmarkable
      this._updateHashParam('focus', path);
      emit('file-selected', { path, source: 'canvas' });
      dashEmit('graph-context-selected', { type: 'file', path, source: 'dep-graph' });
    });

    this._pgCanvasGraph.addEventListener('group-selected', (e) => {
      const path = e.detail.path;
      if (path.startsWith('cluster:')) {
        this._emitClusterContext(path.slice('cluster:'.length));
        return;
      }
      // Update URL with focus= so real directory selection is bookmarkable in flat mode.
      this._updateHashParam('focus', path);
      // Sync: highlight directory in the tree sidebar (add trailing / for dir convention)
      emit('file-selected', { path: path + '/', source: 'canvas' });
      dashEmit('graph-context-selected', { type: 'file', path: path + '/', source: 'dep-graph' });
    });

    // Deselect in flat mode: clear focus= when clicking empty space
    this._pgCanvasGraph.addEventListener('node-deselected', () => {
      if (!this._initialViewRestored) return;
      if (window.location.hash.includes('focus=')) {
        this._updateHashParam('focus', null);
      }
    });

    this._pgCanvasGraph.addEventListener('layout-snapshot', (e) => {
      if (this._viewMode !== 'flat') return;
      this._persistGraphLayoutSnapshot(e.detail);
    });
    
    // Flat mode init: fitView early after a few ticks (not waiting for full convergence)
    // In continuous mode, layout-done can take seconds. Positions are usable after ~10 ticks.
    this._flatTickCount = 0;
    this._pgCanvasGraph.addEventListener('layout-tick', () => {
      if (this._viewMode !== 'flat' || this._initialViewRestored) return;
      this._flatTickCount++;
      if (this._flatTickCount >= 10) {
        this._initialViewRestored = true;
        this._restoreFlatFocus();
      }
    });
    // Fallback: also listen for layout-done in case continuous mode is disabled
    this._pgCanvasGraph.addEventListener('layout-done', () => {
      if (this._viewMode === 'flat' && !this._initialViewRestored) {
        this._initialViewRestored = true;
        this._restoreFlatFocus();
      }
    });

    // Label Mode controls
    const labelBtns = this.querySelectorAll('.label-mode-btn');
    labelBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        selectLabelMode(labelBtns, btn, this._canvas);
      });
    });

    // Phase 3: Layer toggle controls
    this.querySelectorAll('.graph-explorer-layer-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const layer = btn.getAttribute('data-layer');
        this._toggleLayer(layer, toggleLayerButtonState(btn));
      });
    });

    const urlParams = getGraphUrlParams();
    this._viewMode = resolveInitialViewMode(urlParams);
    const viewModeBtn = this.querySelector('[data-action="view-mode"]');
    renderViewModeButton(viewModeBtn, this._viewMode);
    this._updateModeVisibility(this._viewMode);
    
    this._setMode = (newMode) => {
      if (this._viewMode === newMode) return;
      this._viewMode = newMode;
      renderViewModeButton(viewModeBtn, this._viewMode);
      this._updateModeVisibility(this._viewMode);
      this._renderClusterPanel();

      // Persist mode in URL hash
      this._updateHashParam('mode', this._viewMode === 'flat' ? 'flat' : 'tree');

      // Drill up to root before rebuilding to prevent rendering
      // the full graph on top of a stale subgraph canvas state
      if (this._router?.depth > 0) {
        this._canvas.drillUp?.(0);
      }

      // Rebuild graph in new mode
      this._graphBuilt = false;
      this._initialViewRestored = false;
      this._lastFlatFocusRestoreKey = null;
      if (this._failsafeTimer) { clearTimeout(this._failsafeTimer); this._failsafeTimer = null; }
      this._showLoader();
      if (state.skeleton && skeletonMatchesProject(state.skeleton, getActiveRouteProjectId())) {
        this._buildGraph(state.skeleton);
      }
    };

    viewModeBtn?.addEventListener('click', () => {
      const wantFlat = this._viewMode !== 'flat';
      this._setMode(wantFlat ? 'flat' : 'structured');
    });

    this.querySelector('[data-action="graph-metadata"]')?.addEventListener('click', () => {
      this._openGraphMetadataEditor();
    });
    this.querySelector('[data-action="cluster-legend"]')?.addEventListener('click', () => {
      this._clusterLegendOpen = !this._clusterLegendOpen;
      this._renderClusterPanel();
    });
    this.querySelector('[data-action="save-graph-metadata"]')?.addEventListener('click', () => {
      this._saveGraphMetadataFromEditor();
    });
    this.querySelectorAll('[data-action="close-graph-metadata"]').forEach((button) => {
      button.addEventListener('click', () => {
        this._closeGraphMetadataEditor();
      });
    });
    events.addEventListener('graph-story-beat-selected', (e) => {
      this._applyStoryBeat(e.detail);
    });
    this.querySelector('.pcb-metadata-dialog')?.addEventListener('close', () => {
      this._setMetadataSaving(false);
    });
    this.querySelector('.pcb-metadata-dialog')?.addEventListener('cancel', (e) => {
      if (e.currentTarget?.hasAttribute('data-saving')) e.preventDefault();
    });

    // Connection Path Style toggling
    const pathStyleBtn = this.querySelector('[data-action="path-style"]');
    if (pathStyleBtn) {
      let currentStyle = urlParams.get('style') || readUiValue('ui/preferences/graphStyle', 'connection-style', 'pcb');
      
      const updateStyleUI = () => {
        renderPathStyleButton(pathStyleBtn, currentStyle);
      };
      updateStyleUI();
      
      pathStyleBtn.addEventListener('click', () => {
        currentStyle = getNextPathStyle(currentStyle);
        persistUiValue('ui/preferences/graphStyle', currentStyle, 'connection-style');
        this._canvas.setPathStyle(currentStyle);
        updateStyleUI();
      });
    }

    this._loadProjectGraphMetadata();

    // Setup ResizeObserver to gracefully handle "Layout preserved" (display: none) hidden panels.
    // Prevents building graphs while they have 0 width/height, dodging layout thrashing & 50,000+ DOM mutations
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      if (rect.width > 0 && rect.height > 0) {
        if (!this._graphBuilt && state.skeleton && skeletonMatchesProject(state.skeleton, getActiveRouteProjectId())) {
          // Wrap in rAF to prevent loop if ResizeObserver caught mid-render
          requestAnimationFrame(() => this._buildGraph(state.skeleton));
        }
      }
    });
    ro.observe(this);
    this._resizeObserver = ro;

    this._onSkeletonLoaded = (e) => {
      if (this._graphBuilt || this.style.display === 'none' || this.offsetWidth === 0) return;
      if (!skeletonMatchesProject(e.detail, getActiveRouteProjectId())) return;
      requestAnimationFrame(() => this._buildGraph(e.detail));
    };
    
    this._onFollowStateChanged = (e) => {
      const enabled = e.detail?.enabled;
      if (enabled && this._viewMode !== 'flat') {
        this._setMode('flat');
      }
    };
    
    this._onFollowFocusChanged = (e) => {
      this._handleFollowFocus(e.detail);
    };
    
    this._onFileSelected = (e) => {
      if (this.style.display === 'none' || this.offsetWidth === 0) return;
      if (e.detail.source === 'canvas') return; // Prevent echo from our own clicks
      const file = e.detail.path;
      if (file) {
        this._updateHashParam('focus', file);
        const nodeId = getFileSelectionNodeId(file);
        if (this._viewMode === 'flat' && this._pgCanvasGraph) {
          this._pgCanvasGraph.flyToNode(nodeId);
        } else {
          this._router?.navigateTo(file);
        }
      }
    };

    // Wait for canvas to initialize, then listen for data
    events.addEventListener('skeleton-loaded', this._onSkeletonLoaded);
    this._onActiveProjectChanged = () => {
      this._graphBuilt = false;
      this._showLoader();
      const projectId = getActiveRouteProjectId();
      api('/api/skeleton', { projectId }).then((skeleton) => {
        if (getActiveRouteProjectId() !== projectId) return;
        if (!skeletonMatchesProject(skeleton, projectId)) return;
        state.skeleton = skeleton;
        state.skeletonProjectId = projectId;
        emit('skeleton-loaded', skeleton);
      }).catch(() => {});
    };
    dashEvents.addEventListener('active-project-changed', this._onActiveProjectChanged);

    // Initial fetch if we don't have it
    if (!state.skeleton || !skeletonMatchesProject(state.skeleton, getActiveRouteProjectId())) {
      // Self-fetch skeleton (graph panel may mount before FileTree)
      const projectId = getActiveRouteProjectId();
      api('/api/skeleton', { projectId }).then((skeleton) => {
        if (getActiveRouteProjectId() !== projectId) return;
        if (!skeletonMatchesProject(skeleton, projectId)) return;
        if (skeleton && !this._graphBuilt) {
          state.skeleton = skeleton;
          state.skeletonProjectId = projectId;
          emit('skeleton-loaded', skeleton);
        }
      }).catch(() => {});
    }

    // Autopilot: listen for orchestrator events
    events.addEventListener('follow-focus-changed', this._onFollowFocusChanged);
    events.addEventListener('follow-state-changed', this._onFollowStateChanged);

    // Update route within graph section
    // On node click → save file path (just focusing)
    this._canvas?.addEventListener('click', (e) => {
      const nodeEl = e.target.closest('graph-node');
      if (!nodeEl) return;

      // Skip click-to-focus if this click came from a drag-end
      if (this._wasDragged) {
        this._wasDragged = false;
        return;
      }
      
      const nodeId = nodeEl.getAttribute('node-id');
      const path = this._idToPath?.get(nodeId);
      const symbol = this._symbolMap?.get(nodeId);
      const depth = this._router?.depth || 0;
      const clickAction = resolveGraphNodeClick({ nodeId, path, symbol, depth, hash: window.location.hash });
      if (!clickAction) return;

      for (const [key, value] of clickAction.hashUpdates) {
        this._updateHashParam(key, value);
      }
      if (clickAction.fileEvent) emit('file-selected', clickAction.fileEvent);

    });

    // Deselect: when no nodes selected → clear focus from URL
    this._canvas?.addEventListener('selection-changed', (e) => {
      if (shouldClearFocusOnSelection({
        selectedNodes: e.detail.nodes,
        initialViewRestored: this._initialViewRestored,
        hash: window.location.hash,
      })) {
        this._updateHashParam('focus', null);
      }
    });

    // Toolbar custom actions (e.g. explore, view-code, enter)
    this.addEventListener('toolbar-action', (e) => {
      const { action, nodeId } = e.detail;
      const toolbarAction = resolveToolbarAction({
        action,
        nodeId,
        viewMode: this._viewMode,
        path: this._idToPath?.get(nodeId),
        symbol: this._symbolMap?.get(nodeId),
      });

      if (toolbarAction?.type === 'fly-to-node') {
        this._pgCanvasGraph?.flyToNode(toolbarAction.nodeId);
      } else if (toolbarAction?.type === 'explore-node') {
        this._exploreFromNode(toolbarAction.nodeId);
      } else if (toolbarAction?.type === 'open-file') {
        window.location.hash = toolbarAction.hash;
      } else if (toolbarAction?.type === 'drill-node') {
        this._pgCanvasGraph?.drill(toolbarAction.nodeId);
      }
    });

    events.addEventListener('file-selected', this._onFileSelected);

    // React to hash changes from file-tree, back/forward, or external URL paste
    this._onHashChange = () => {
      const hash = window.location.hash;
      if (!hash.startsWith('#graph')) return;
      
      if (this._viewMode === 'flat') {
        const flatHash = resolveFlatHashChange(hash);
        if (flatHash && this._pgCanvasGraph) {
          this._pgCanvasGraph.setPath(flatHash.path);
          if (shouldRestoreFlatFocus({
            lastKey: this._lastFlatFocusRestoreKey,
            path: flatHash.path,
            focus: flatHash.focus,
          })) {
            this._lastFlatFocusRestoreKey = getFlatFocusRestoreKey(flatHash);
            this._pgCanvasGraph.flyToNode(flatHash.focus);
          }
        }
        return;
      }
      
      if (!this._router || !this._editor || !this._initialViewRestored) return;
      
      let attempts = 0;
      const doRestore = () => {
        if (this.offsetWidth > 0 && this.offsetHeight > 0) {
          this._router.restoreFromHash(this._editor);
        } else if (attempts < 20) {
          attempts++;
          requestAnimationFrame(doRestore);
        }
      };
      doRestore();
    };
    window.addEventListener('hashchange', this._onHashChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    if (this._onSkeletonLoaded) events.removeEventListener('skeleton-loaded', this._onSkeletonLoaded);
    if (this._onActiveProjectChanged) dashEvents.removeEventListener('active-project-changed', this._onActiveProjectChanged);
    if (this._onFollowStateChanged) events.removeEventListener('follow-state-changed', this._onFollowStateChanged);
    if (this._onFollowFocusChanged) events.removeEventListener('follow-focus-changed', this._onFollowFocusChanged);
    if (this._onFileSelected) events.removeEventListener('file-selected', this._onFileSelected);
    if (this._onHashChange) window.removeEventListener('hashchange', this._onHashChange);
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  /**
   * Count total files in skeleton (quick, no graph construction)
   * @param {object} skeleton
   * @returns {number}
   */
  _countSkeletonFiles(skeleton) {
    const files = new Set();
    for (const data of Object.values(skeleton.n || {})) if (data.f) files.add(data.f);
    for (const file of Object.keys(skeleton.X || {})) files.add(file);
    for (const [dir, names] of Object.entries(skeleton.f || {}))
      for (const name of names) files.add(dir === './' ? name : dir + name);
    for (const [dir, names] of Object.entries(skeleton.a || {}))
      for (const name of names) files.add(dir === './' ? name : dir + name);
    return files.size;
  }

  /**
   * Restore focus= from URL in flat mode (where SubgraphRouter is not available).
   * Parses the hash, extracts path drill + focus param, and calls flyToNode.
   */
  _restoreFlatFocus() {
    const { path: pathStr, params } = parseGraphHash();
    if (pathStr && this._pgCanvasGraph) {
      this._pgCanvasGraph.setPath(pathStr);
    }
    
    // Apply focus= if present
    if (params.size) {
      const focusParam = params.get('focus');
      if (focusParam && this._pgCanvasGraph) {
        const decoded = decodeURIComponent(focusParam);
        const focusKey = getFlatFocusRestoreKey({ path: pathStr, focus: decoded });
        if (this._lastFlatFocusRestoreKey === focusKey) return;
        this._lastFlatFocusRestoreKey = focusKey;
        // Skip if focus target is the same group we just drilled into
        const focusClean = decoded.replace(/\/$/, '');
        if (focusClean === pathStr) {
          // We're already inside this group — just fit the view
          return;
        }
        requestAnimationFrame(() => {
          this._pgCanvasGraph.flyToNode(decoded);
        });
        // Check if focus target is a group (directory) — tree uses trailing / for dirs
        const graphNode = this._pgCanvasGraph.graphDB?.nodes.get(decoded);
        const treePath = (graphNode && graphNode.isGroup) ? decoded + '/' : decoded;
        // Sync tree sidebar
        state.activeFile = treePath;
        emit('file-selected', { path: treePath, source: 'canvas' });
        setTimeout(() => emit('file-selected', { path: treePath, source: 'canvas' }), 500);
        return;
      }
    }
    
    // No focus param — fit the full view
    if (this._pgCanvasGraph) {
      this._pgCanvasGraph.fitView?.();
    }
  }

  /**
   * Show/hide toolbar buttons that only apply in one graph mode.
   * @param {string} mode - 'flat' or 'structured'
   */
  _updateModeVisibility(mode) {
    const hideStructuredOnly = mode === 'flat';
    this.querySelectorAll('.graph-explorer-structured-only').forEach(el => {
      el.hidden = hideStructuredOnly;
    });
    const hideFlatOnly = mode !== 'flat';
    this.querySelectorAll('.graph-explorer-flat-only').forEach(el => {
      el.hidden = hideFlatOnly;
    });
  }

  async _loadProjectGraphMetadata() {
    try {
      let res = await fetch(this._getProjectGraphMetadataUrl());
      if (!res.ok) throw new Error(`metadata load failed: ${res.status}`);
      let data = await res.json();
      this._projectGraphMetadata = normalizeProjectGraphMetadata(data.metadata || {});
      this._renderClusterPanel();
      if (state.skeleton && this._graphBuilt && this._projectGraphMetadata.clusters.length > 0) {
        this._rebuildWithGraphMetadata();
      }
    } catch (err) {
      console.warn(`Project graph metadata unavailable: ${err.message}`);
      this._projectGraphMetadata = normalizeProjectGraphMetadata();
      this._renderClusterPanel();
    }
  }

  _renderClusterPanel() {
    let panel = this.querySelector('.pcb-clusters');
    let toggle = this.querySelector('[data-action="cluster-legend"]');
    renderClusterPanel({
      panel,
      toggle,
      clusters: this._projectGraphMetadata?.clusters || [],
      viewMode: this._viewMode,
      isOpen: this._clusterLegendOpen,
    });
  }

  _openSemanticCluster(clusterId, emitContext = true) {
    if (!clusterId) return;
    if (emitContext) this._emitClusterContext(clusterId);
    if (this._viewMode !== 'flat') {
      this._pendingClusterId = clusterId;
      this._setMode('flat');
      return;
    }
    this._pendingClusterId = null;
    this._focusSemanticCluster(clusterId);
  }

  _focusSemanticCluster(clusterId) {
    let nodeId = `cluster:${clusterId}`;
    this._pgCanvasGraph?.focusSemanticCluster?.(nodeId);
  }

  _emitClusterContext(clusterId) {
    let cluster = this._projectGraphMetadata?.clusters?.find((item) => item.id === clusterId);
    if (!cluster) return;
    dashEmit('graph-context-selected', {
      type: 'graph-cluster',
      clusterId: cluster.id,
      label: cluster.label,
      description: cluster.description,
      paths: cluster.paths,
      source: 'dep-graph',
    });
  }

  _applyStoryBeat(beat) {
    if (!beat) return;
    if (beat.clusterId) {
      this._openSemanticCluster(beat.clusterId, false);
      return;
    }
    if (beat.focusPath) {
      this._updateHashParam('focus', beat.focusPath);
      emit('file-selected', { path: beat.focusPath, source: 'graph-flows' });
      dashEmit('graph-context-selected', { type: 'file', path: beat.focusPath, source: 'graph-flows' });
    }
  }

  _updateHashParam(key, value) {
    updateHashParam(key, value);
  }

  _getGraphLayoutStorageKey(groupId = parseGraphHash().path || '') {
    const params = getGraphUrlParams();
    const projectId = params.get('project') || state.activeProjectId || 'global';
    const mode = this._viewMode === 'flat' ? 'flat' : 'tree';
    return `pg-graph-layout-v1-${projectId}-${mode}-${encodeURIComponent(groupId || 'root')}`;
  }

  _getGraphLayoutStatePath(storageKey) {
    return `ui/graphLayouts/${encodeURIComponent(storageKey)}`;
  }

  _readGraphLayoutSnapshot(groupId = parseGraphHash().path || '') {
    const storageKey = this._getGraphLayoutStorageKey(groupId);
    const snapshot = readUiValue(this._getGraphLayoutStatePath(storageKey), storageKey, null);
    if (!snapshot || typeof snapshot !== 'object') return null;
    if ((snapshot.groupId || '') !== (groupId || '')) return null;
    return snapshot;
  }

  _persistGraphLayoutSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    const groupId = snapshot.groupId || '';
    const positions = snapshot.positions && typeof snapshot.positions === 'object' ? snapshot.positions : null;
    if (!positions || Object.keys(positions).length === 0) return;
    const storageKey = this._getGraphLayoutStorageKey(groupId);
    persistUiValue(this._getGraphLayoutStatePath(storageKey), snapshot, storageKey);
  }

  _getProjectGraphMetadataUrl() {
    let qs = new URLSearchParams({ projectPath: resolveProjectPath('.') });
    return `/api/project-graph-metadata?${qs.toString()}`;
  }

  _setMetadataStatus(text, isError = false, isSuccess = false) {
    let status = this.querySelector('.pcb-metadata-status');
    if (!status) return;
    status.textContent = text || '';
    status.toggleAttribute('data-error', Boolean(isError));
    status.toggleAttribute('data-success', Boolean(isSuccess) && !isError);
  }

  _setMetadataSaving(isSaving) {
    let dialog = this.querySelector('.pcb-metadata-dialog');
    if (!dialog) return;
    dialog.toggleAttribute('data-saving', Boolean(isSaving));
    this.querySelectorAll(
      '[data-action="save-graph-metadata"], [data-action="close-graph-metadata"], .pcb-icon-btn',
    ).forEach((button) => {
      button.disabled = Boolean(isSaving);
    });
  }

  _openGraphMetadataEditor() {
    let dialog = this.querySelector('.pcb-metadata-dialog');
    let textarea = dialog?.querySelector('textarea');
    if (!dialog || !textarea) return;
    textarea.value = JSON.stringify(this._projectGraphMetadata || normalizeProjectGraphMetadata(), null, 2);
    this._setMetadataStatus('');
    this._setMetadataSaving(false);
    dialog.showModal();
    requestAnimationFrame(() => textarea.focus());
  }

  _closeGraphMetadataEditor() {
    let dialog = this.querySelector('.pcb-metadata-dialog');
    if (!dialog || dialog.hasAttribute('data-saving')) return;
    dialog.close('cancel');
  }

  _rebuildWithGraphMetadata() {
    this._renderClusterPanel();
    if (!state.skeleton || !this._graphBuilt) return;
    this._graphBuilt = false;
    this._showLoader();
    this._buildGraph(state.skeleton);
  }

  async _saveGraphMetadataFromEditor() {
    let dialog = this.querySelector('.pcb-metadata-dialog');
    let textarea = dialog?.querySelector('textarea');
    if (!dialog || !textarea || dialog.hasAttribute('data-saving')) return;

    let parsed;
    try {
      parsed = JSON.parse(textarea.value);
    } catch (err) {
      this._setMetadataStatus(`Invalid JSON: ${err.message}`, true);
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      this._setMetadataStatus('Invalid metadata: expected a JSON object.', true);
      return;
    }

    this._setMetadataStatus('Saving...');
    this._setMetadataSaving(true);
    try {
      let res = await fetch('/api/project-graph-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: resolveProjectPath('.'), metadata: parsed }),
      });
      let text = await res.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (parseErr) {
          if (res.ok) throw new Error(`Save failed: invalid server response: ${parseErr.message}`);
        }
      }
      if (!res.ok) throw new Error(data.error || `Save failed: ${res.status}`);
      this._projectGraphMetadata = normalizeProjectGraphMetadata(data.metadata || parsed);
      this._rebuildWithGraphMetadata();
      this._setMetadataStatus('Saved.', false, true);
      dialog.close();
    } catch (err) {
      this._setMetadataStatus(err.message, true);
    } finally {
      this._setMetadataSaving(false);
    }
  }

  /**
   * Start radial exploration from a focus node.
   * Shows the node at center with imports (left) and dependents (right).
   * @param {string} nodeId
   */
  _exploreFromNode(nodeId) {
    const editor = this._editor;
    if (!editor || !this._canvas) return;

    const conns = editor.getConnections();
    const nodePath = this._idToPath?.get(nodeId) || nodeId;

    // Find imports (outgoing from this node) and dependents (incoming to this node)
    const imports = [];     // files this node imports
    const dependents = [];  // files that import this node

    for (const c of conns) {
      if (c.from === nodeId && c.to !== nodeId) imports.push(c.to);
      if (c.to === nodeId && c.from !== nodeId) dependents.push(c.from);
    }

    // Dedup
    const importSet = [...new Set(imports)];
    const dependentSet = [...new Set(dependents)];

    // Save pre-explore state for back navigation
    if (!this._exploreStack) this._exploreStack = [];
    this._exploreStack.push({
      positions: this._canvas.getPositions(),
      zoom: this._canvas.$.zoom,
      panX: this._canvas.$.panX,
      panY: this._canvas.$.panY,
    });

    // Radial layout: focus at center
    // Imports on LEFT hemisphere, dependents on RIGHT
    const RADIUS_INNER = 500;
    const positions = {};
    positions[nodeId] = { x: 0, y: 0 };

    // Place imports (left hemisphere: angles from 90° to 270°)
    importSet.forEach((id, i) => {
      const t = (i + 1) / (importSet.length + 1); // 0..1 evenly spaced
      const angle = Math.PI / 2 + Math.PI * t;     // 90° → 270° (left)
      positions[id] = {
        x: RADIUS_INNER * Math.cos(angle),
        y: RADIUS_INNER * Math.sin(angle),
      };
    });

    // Place dependents (right hemisphere: angles from -90° to 90°)
    dependentSet.forEach((id, i) => {
      const t = (i + 1) / (dependentSet.length + 1);
      const angle = -Math.PI / 2 + Math.PI * t;     // -90° → 90° (right)
      positions[id] = {
        x: RADIUS_INNER * Math.cos(angle),
        y: RADIUS_INNER * Math.sin(angle),
      };
    });

    // Move explore nodes to radial positions, push others far below
    this._canvas.setBatchMode(true);
    const allNodes = editor.getNodes();
    for (const n of allNodes) {
      if (positions[n.id]) {
        this._canvas.setNodePosition(n.id, positions[n.id].x, positions[n.id].y);
      } else {
        // Move non-explore nodes far offscreen (below)
        this._canvas.setNodePosition(n.id, 0, 50000 + Math.random() * 1000);
      }
    }
    this._canvas.setBatchMode(false);
    this._canvas.syncPhantom?.();

    // Highlight explore connections
    const exploreConnIds = conns
      .filter(c => c.from === nodeId || c.to === nodeId)
      .map(c => c.id);
    this._canvas.setActiveConnections?.(exploreConnIds);

    // Fly to focus node
    this._canvas.flyToNode(nodeId, { zoom: 0.5 });

    // Update URL to reflect explore mode
    this._updateHashParam('explore', nodePath);

    // Mark explore mode active
    this._exploreMode = true;
    this._exploreNodeId = nodeId;

    // Dispatch event for status bar / UI feedback
    this.dispatchEvent(new CustomEvent('explore-started', {
      detail: {
        nodeId,
        path: nodePath,
        imports: importSet.length,
        dependents: dependentSet.length,
      },
      bubbles: true,
    }));
  }

  /**
   * Exit explore mode — restore graph to pre-explore state.
   */
  _exitExploreMode() {
    if (!this._exploreStack?.length || !this._canvas) return;

    const state = this._exploreStack.pop();

    this._canvas.setBatchMode(true);
    for (const [nodeId, pos] of Object.entries(state.positions)) {
      this._canvas.setNodePosition(nodeId, pos.x, pos.y);
    }
    this._canvas.setBatchMode(false);
    this._canvas.syncPhantom?.();

    // Restore zoom/pan
    this._canvas.$.zoom = state.zoom;
    this._canvas.$.panX = state.panX;
    this._canvas.$.panY = state.panY;
    this._canvas.refreshConnections();

    // Clear highlight
    this._canvas.setActiveConnections?.(null);

    this._exploreMode = false;
    this._exploreNodeId = null;
    this._updateHashParam('explore', null);
  }

  /**
   * Build and render a complete dependency graph from skeleton data.
   * @param {object} skeleton
   * @returns {void}
   */
  _buildGraph(skeleton) {
    if (!skeleton || !this._canvas) return;
    // Guard: both ResizeObserver and skeleton-loaded schedule rAF calls
    // that check _graphBuilt BEFORE the rAF. If both fire in the same
    // frame, _buildGraph runs twice → double nodes. Guard here too.
    if (this._graphBuilt) return;
    this._graphBuilt = true;

    // ── Tear down previous build state ──
    // Disconnect stale ResizeObserver to prevent old callbacks firing on new nodes
    if (this._nodeObserver) {
      this._nodeObserver.disconnect();
      this._nodeObserver = null;
    }
    // Cancel pending layout timers/rAFs from previous build
    if (this._layoutPassTimer) { clearTimeout(this._layoutPassTimer); this._layoutPassTimer = null; }
    if (this._failsafeTimer) { clearTimeout(this._failsafeTimer); this._failsafeTimer = null; }
    if (this._refreshRaf) { cancelAnimationFrame(this._refreshRaf); this._refreshRaf = null; }
    // Reset the view-restored flag so the new build can do its own initial stabilization
    this._initialViewRestored = false;
    this._runRelayoutPass = null;

    // Hide canvas during build to prevent visible flicker (pass 1 → pass 2 jump)
    if (this._canvas) {
      this._canvas.style.opacity = '0';
      this._canvas.style.transition = 'none';
    }

    // Show (or re-show) the preloader overlay — safe to call multiple times
    this._showLoader();

    // Phase 0: Parsing
    this._setProgress(10, 'Parsing graph…', '');

    const isStructured = this._viewMode === 'structured';

    if (!isStructured) {
      if (this._canvas) this._canvas.hidden = true;
      if (this._pgCanvasGraph) {
        this._pgCanvasGraph.hidden = false;
        
        // Listen to canvas-graph for first tick or done to hide loader
        const hideCanvasLoader = () => {
          this._pgCanvasGraph.removeEventListener('layout-tick', hideCanvasLoader);
          this._pgCanvasGraph.removeEventListener('layout-done', hideCanvasLoader);
          this._hideLoader();
        };
        this._pgCanvasGraph.addEventListener('layout-tick', hideCanvasLoader);
        this._pgCanvasGraph.addEventListener('layout-done', hideCanvasLoader);
        
        const graphModel = buildCanvasGraphModelFromSkeleton(skeleton, this._projectGraphMetadata);
        this._pgCanvasGraph.setLayoutSnapshot?.(this._readGraphLayoutSnapshot());
        this._pgCanvasGraph.setGraphModel(graphModel);
        
        // Restore path from URL
        this._pgCanvasGraph.setPath(parseGraphHash().path);
        if (this._pendingClusterId) {
          this._focusSemanticCluster(this._pendingClusterId);
          this._pendingClusterId = null;
        }
      } else {
        this._hideLoader();
      }
      this._graphBuilt = true;
      return;
    }

    if (this._pgCanvasGraph) this._pgCanvasGraph.hidden = true;
    if (this._canvas) this._canvas.hidden = false;

    // Cache key: reuse previously built graph for same skeleton+mode
    const cacheKey = getGraphCacheKey(isStructured);
    if (!this._graphCache) this._graphCache = {};

    const wasCached = this._graphCache[cacheKey]?.skeleton === skeleton;
    if (!wasCached) {
      this._setProgress(15, 'Parsing graph…', isStructured ? 'structured mode' : 'flat mode');
    }
    const { graph, cached, groups, drillableFiles } = prepareGraphBuild({
      cache: this._graphCache,
      skeleton,
      isStructured,
      projectGraphMetadata: this._projectGraphMetadata,
      getOrBuildGraphFn: getOrBuildGraph,
      getDrillableFilesFn: getDrillableFiles,
      buildStructuredGraphFn: buildStructuredGraph,
      buildFileGraphFn: buildFileGraph,
    });
    const { editor, fileMap, dirFiles, dirNodeMap, idToPath, symbolMap } = graph;
    this._setProgress(40, 'Building nodes…', `${editor.getNodes().length} nodes${cached ? ' (cached)' : ''}`);

    this._editor = editor;
    this._fileMap = fileMap;
    this._dirNodeMap = dirNodeMap;
    this._idToPath = idToPath;
    this._symbolMap = symbolMap;
    this._drillableFiles = drillableFiles;

    if (this._router) this._router.destroy();
    this._router = new SubgraphRouter(this._canvas, {
      hashPrefix: 'graph',
      fileMap,
      dirNodeMap,
      symbolMap,
      drillableFiles: this._drillableFiles,
      onNavigate: (_path) => {
        // Optional hook: focus/pulse upon non-visual navigation
      }
    });

    // Set editor on canvas

    this._setProgress(55, 'Building nodes…', 'rendering DOM');
    this._canvas.setEditor(editor);

    this._setProgress(70, 'Placing nodes…', '');

    // Apply settings
    this._canvas.setReadonly(true);
    const urlParams = getGraphUrlParams();
    this._canvas.setPathStyle(urlParams.get('style') || readUiValue('ui/preferences/graphStyle', 'connection-style', 'pcb'));

    // --- Layout strategy depends on mode ---
    const positions = computeInitialGraphPositions({
      editor,
      isStructured,
      dirFiles,
      dirNodeMap,
      groups,
      computeTreeLayoutFn: computeTreeLayout,
    });

    this._canvas.setBatchMode(true);
    for (const [nodeId, pos] of Object.entries(positions)) {
      this._canvas.setNodePosition(nodeId, pos.x, pos.y);
    }
    this._canvas.setBatchMode(false);

    // Force sync updated phantom positions to renderer immediately
    // Without this, subsequent fitView/redraw uses stale (0,0) phantom data
    this._canvas.syncPhantom?.();

    // For large graphs (>200 nodes) the ResizeObserver in Pass 2 will never fire
    // because phantom-mode nodes have no real DOM elements to observe.
    // We must start ForceLayout HERE (Pass 1) with the circular seed positions.
    // The canvas stays hidden; onDone reveals it.
    const nodeCount = editor.getNodes().length;
    if (!isStructured && nodeCount > 50) {
      if (!this._forceLayout) {
        this._forceLayout = new ForceLayout(ForceLayout.defaultWorkerUrl());
      }

      const editorNodes = [...editor.getNodes()];
      const editorConns = [...editor.getConnections()];
      const forcePayload = createForceLayoutPayload({
        nodes: editorNodes,
        connections: editorConns,
        positions,
        groups,
        continuous: true,
      });

      // Live tick updates so user sees nodes moving rather than a freeze
      this._forceLayout.onTick = (tickPositions) => {
        if (!this._canvas) return;
        this._canvas.setBatchMode(true);
        for (const [nodeId, pos] of Object.entries(tickPositions)) {
          this._canvas.setNodePosition(nodeId, pos.x, pos.y);
        }
        this._canvas.setBatchMode(false);
        this._canvas.syncPhantom?.();
        // Throttle refreshConnections — expensive for 2000+ nodes
        if (!this._forceTickRaf) {
          this._forceTickRaf = requestAnimationFrame(() => {
            this._forceTickRaf = null;
            this._canvas?.refreshConnections();
          });
        }
        // Show canvas and hide loader on first tick so user gets live feedback
        if (!this._initialViewRestored) {
          this._initialViewRestored = true;
          this._hideLoader();
          this._canvas.style.transition = 'opacity 0.2s ease-in';
          this._canvas.style.opacity = '1';
          // Only fitView on first tick if there's no focus= param to preserve
          if (shouldFitForceLayoutInitialTick(window.location.hash)) {
            this._canvas.fitView();
          }
          // In continuous mode: restore hash navigation after initial convergence settles
          setTimeout(() => {
            if (getGraphHashNavigationState(window.location.hash).shouldRestore) {
              if (this._router) {
                this._router.restoreFromHash(editor);
              } else if (this._pgCanvasGraph) {
                this._restoreFlatFocus();
              }
            }
          }, 800);
        }
      };

      this._forceLayout.onDone = (finalPositions) => {
        if (!this._canvas) return;
        this._forceTickRaf = null;

        this._canvas.setBatchMode(true);
        for (const [nodeId, pos] of Object.entries(finalPositions)) {
          this._canvas.setNodePosition(nodeId, pos.x, pos.y);
        }
        this._canvas.setBatchMode(false);
        this._canvas.syncPhantom?.();
        this._canvas.refreshConnections();
        // Ensure canvas is visible and loader is gone
        if (!this._initialViewRestored) {
          this._initialViewRestored = true;
          this._hideLoader();
          this._canvas.style.transition = 'opacity 0.2s ease-in';
          this._canvas.style.opacity = '1';
        } else {
          this._hideLoader();
        }
        // Restore focus/hash navigation now that all node positions are final
        if (getGraphHashNavigationState(window.location.hash).shouldRestore) {
          if (this._router) {
            this._router.restoreFromHash(editor);
          } else if (this._pgCanvasGraph) {
            this._restoreFlatFocus();
          }
        } else {
          this._canvas.fitView();
        }
      };

      this._setProgress(85, 'Simulating layout…', `${editorNodes.length} nodes · ${editorConns.length} edges`);
      this._forceLayout.start({
        nodes: forcePayload.nodes,
        edges: forcePayload.edges,
        groups: forcePayload.groups,
        options: forcePayload.options,
      });

      // Hook drag events to pin/unpin nodes in force simulation
      // When user picks up a node → pin it (fix position in simulation)
      // When user moves it → update pinned position (neighbors react)
      // When user drops it → unpin (let simulation settle naturally)
      editor.on('nodepicked', (node) => {
        if (!this._forceLayout?.running) return;
        const el = this._canvas?.getNodeView?.(node.id) || this._canvas?.querySelector(`[node-id="${node.id}"]`);
        const pos = el?._position;
        if (pos) {
          this._forceLayout.pin(node.id, pos.x, pos.y);
        }
      });

      editor.on('nodetranslated', ({ id, position }) => {
        if (!this._forceLayout?.running) return;
        this._forceLayout.pin(id, position.x, position.y);
      });

      editor.on('nodedragged', ({ id }) => {
        this._wasDragged = true;
        if (!this._forceLayout?.running) return;
        this._forceLayout.unpin(id);
      });

      // Don't wait for ResizeObserver — we already started the worker above.
      // Skip the rest of the Pass 1 initialization (pass 2 will be a no-op since
      // _initialViewRestored will be true by the time ResizeObserver fires).
    }



    // Post-drill-in layout: recalculate inner node positions using real DOM sizes
    // Pre-computed innerPositions use hardcoded nodeHeight which may not match actual rendered heights
    // IMPORTANT: Must be registered BEFORE restoreFromHash, which may trigger drillDown on page refresh
    if (!this._drillLayoutListener) {
      this._drillLayoutListener = (e) => {
        if (!this._canvas) return;
        const enteredNode = e.detail?.node;
        if (!enteredNode?._isSubgraph) return;
        const innerEditor = enteredNode.getInnerEditor();
        if (!innerEditor) return;

        // Wait for inner nodes to render, then re-layout with measured sizes
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const nodeSizes = this._canvas.measureNodeSizes();
            if (!nodeSizes || Object.keys(nodeSizes).length === 0) return;

            const corrected = computeAutoLayout(innerEditor, {
              nodeSizes,
              nodeHeight: 80,
              gapY: 100,
              gapX: 120,
            });

            this._canvas.setBatchMode(true);
            for (const [nodeId, pos] of Object.entries(corrected)) {
              this._canvas.setNodePosition(nodeId, pos.x, pos.y);
            }
            this._canvas.setBatchMode(false);
            this._canvas.refreshConnections();

            if (window.location.hash.includes('focus=')) {
              const params = getGraphUrlParams();
              const focusParam = params.get('focus');
              if (focusParam && this._router) {
                // Defer to allow DOM to settle, then fly to the correct newly measured position
                requestAnimationFrame(() => this._router.navigateTo(decodeURIComponent(focusParam)));
              }
            } else if (this._canvas.fitView) {
              requestAnimationFrame(() => this._canvas.fitView());
            }
          });
        });
      };
      this._canvas.addEventListener('subgraph-enter', this._drillLayoutListener);
    }

    // Safety net: update URL on subgraph exit (back to root)
    // SubgraphRouter's handleExit should handle this, but as defense-in-depth
    if (!this._exitUrlListener) {
      this._exitUrlListener = (e) => {
        const level = e.detail?.level;
        if (level === 0) {
          // Exiting to root — extract parent directory from current URL to use as focus
          const hash = window.location.hash;
          const pathMatch = hash.match(/#graph\/([^?&]+)/);
          if (pathMatch) {
            let focusDir = pathMatch[1];
            // Walk up to find known directory
            if (this._dirNodeMap) {
              const segments = focusDir.replace(/\/$/, '').split('/');
              while (segments.length > 0) {
                const candidate = segments.join('/') + '/';
                if (this._dirNodeMap.has(candidate)) {
                  focusDir = candidate;
                  break;
                }
                segments.pop();
              }
            }
            if (focusDir) {
              this._updateHashParam('focus', focusDir);
            } else {
              this._updateHashParam('focus', null);
            }
          } else {
            this._updateHashParam('focus', null);
          }
        }
      };
      this._canvas.addEventListener('subgraph-exit', this._exitUrlListener);
    }

    // NOTE: restoreFromHash is NOT called here (pass 1) because positions aren't stable yet.
    // It will be called from _runRelayoutPass (pass 2) after node sizes are measured.

    // Dedicated node ResizeObserver ensures that late inflation of inner ports
    // triggers not only a line refresh, but initially schedules a full Pass 2 layout
    // so things don't overlap vertically in a messy stack.
    if (!this._nodeObserver) {
      this._nodeObserver = new ResizeObserver((entries) => {
          if (!this._canvas) return;
          let needsRefresh = false;
          for (const entry of entries) {
            if (entry.target.tagName.toLowerCase() === 'graph-node') {
              const el = entry.target;
              const newW = entry.contentRect.width;
              const newH = entry.contentRect.height;
              
              // Ignore culling-induced resizes (when contentVisibility: hidden makes dimensions 0)
              if (newW === 0 || newH === 0) continue;
              
              // Ignore if the dimensions are practically identical to cached (allow up to 3px jitter for transform/zoom text rendering rounding)
              if (el._cachedW && Math.abs(el._cachedW - newW) <= 3 && Math.abs(el._cachedH - newH) <= 3) {
                continue;
              }
              
              // Real resize detected! Update cache and flag refresh
              el._cachedW = newW;
              el._cachedH = newH;
              needsRefresh = true;
            }
          }

          if (needsRefresh) {
          // Immediately secure connections
          if (this._refreshRaf) cancelAnimationFrame(this._refreshRaf);
          this._refreshRaf = requestAnimationFrame(() => this._canvas.refreshConnections());

          // Trigger full layout recalculation debounced ONLY during initial load
          if (!this._initialViewRestored) {
            if (this._layoutPassTimer) clearTimeout(this._layoutPassTimer);
            this._layoutPassTimer = setTimeout(() => {
              this._runRelayoutPass(isStructured, dirFiles, dirNodeMap, editor, groups);
            }, 150);
          }
        }
      });
    }

    // Attach ResizeObserver to all graph-nodes
    requestAnimationFrame(() => {
      if (!this._canvas || !this._nodeObserver) return;
      const nodes = this._canvas.querySelectorAll('graph-node');
      for (const el of nodes) {
        this._nodeObserver.observe(el);
      }
    });

    // Provide the dynamic layout function which replaces the old static setTimeout
    this._runRelayoutPass = (isStructured, dirFiles, dirNodeMap, editor, groups) => {
      if (!this._canvas) return;
      const nodeSizes = this._canvas.measureNodeSizes();
      
      let correctedPositions;
      if (isStructured && dirFiles) {
        const dirPaths = {};
        const rootNodeIds = new Set(editor.getNodes().map(n => n.id));
        for (const [dir, nodeId] of dirNodeMap.entries()) {
          if (rootNodeIds.has(nodeId)) {
            dirPaths[nodeId] = dir;
          }
        }
        correctedPositions = computeTreeLayout(editor, {
          dirPaths, nodeSizes,
          nodeWidth: 250, nodeHeight: 100,
          gapX: 40, gapY: 60,
          startX: 60, startY: 60,
        });
      } else {
        // FLAT mode: force-directed layout with group-aware circular initial positions
        const editorNodes = [...editor.getNodes()];
        const editorConns = [...editor.getConnections()];

        // For small graphs, static AutoLayout is fast enough
        if (editorNodes.length < 50) {
          const layoutResult = computeAutoLayout(editor, {
            groups, nodeSizes, existingPositions: this._canvas.getPositions()
          });
          correctedPositions = layoutResult.positions ? layoutResult.positions : layoutResult;
        } else {
          correctedPositions = computeInitialGraphPositions({ editor, groups });

          if (!this._forceLayout) {
            this._forceLayout = new ForceLayout(ForceLayout.defaultWorkerUrl());
          }

          const forcePayload = createForceLayoutPayload({
            nodes: editorNodes,
            connections: editorConns,
            positions: correctedPositions,
            groups,
            nodeSizes,
          });

          // onTick: provide live visual feedback so user sees nodes spreading, not a freeze.
          this._forceLayout.onTick = (tickPositions) => {
            if (!this._canvas) return;
            this._canvas.setBatchMode(true);
            for (const [nodeId, pos] of Object.entries(tickPositions)) {
              this._canvas.setNodePosition(nodeId, pos.x, pos.y);
            }
            this._canvas.setBatchMode(false);
            // Throttle connection refresh: expensive for large graphs
            if (!this._forceTickRaf) {
              this._forceTickRaf = requestAnimationFrame(() => {
                this._forceTickRaf = null;
                this._canvas?.refreshConnections();
              });
            }
          };

          this._forceLayout.onDone = (finalPositions) => {
            if (!this._canvas) return;
            this._forceTickRaf = null;

            this._canvas.setBatchMode(true);
            for (const [nodeId, pos] of Object.entries(finalPositions)) {
              this._canvas.setNodePosition(nodeId, pos.x, pos.y);
            }
            this._canvas.setBatchMode(false);
            this._canvas.syncPhantom?.();
            this._canvas.refreshConnections();
            // Reveal canvas and fit view on convergence
            if (!this._initialViewRestored) {
              this._initialViewRestored = true;
              if (getGraphHashNavigationState(window.location.hash).shouldRestore) {
                if (this._router) {
                  this._router.restoreFromHash(editor);
                } else if (this._pgCanvasGraph) {
                  this._restoreFlatFocus();
                }
              } else {
                this._canvas.fitView();
              }
              requestAnimationFrame(() => {
                if (this._canvas) {
                  this._hideLoader();
                  this._canvas.style.transition = 'opacity 0.15s ease-in';
                  this._canvas.style.opacity = '1';
                }
              });
            } else {
              this._canvas.fitView();
            }
          };

          this._forceLayout.start({
            nodes: forcePayload.nodes,
            edges: forcePayload.edges,
            groups: forcePayload.groups,
            options: forcePayload.options,
          });

          // Keep the circular seed in forcePayload until the worker emits real positions.
          return;
        }
      }




      // Apply positions (only for non-force paths: small flat graphs and tree mode)
      this._canvas.setBatchMode(true);
      for (const [nodeId, pos] of Object.entries(correctedPositions)) {
        this._canvas.setNodePosition(nodeId, pos.x, pos.y);
      }
      this._canvas.setBatchMode(false);

      requestAnimationFrame(() => this._canvas.refreshConnections());

      // Only restore view focus/drill-down once after first layout stabilizes
      if (!this._initialViewRestored) {
        this._initialViewRestored = true;

        // restoreFromHash handles path, ?focus=, and ?in= params
        if (getGraphHashNavigationState(window.location.hash).shouldRestore) {
          if (this._router) {
            this._router.restoreFromHash(editor);
          } else if (this._pgCanvasGraph) {
            this._restoreFlatFocus();
          }
        } else {
          this._canvas.fitView();
        }



        // Reveal canvas after layout is stable
        requestAnimationFrame(() => {
          if (this._canvas) {
            this._hideLoader();
            this._canvas.style.transition = 'opacity 0.15s ease-in';
            this._canvas.style.opacity = '1';
          }
        });
      }

    };

    // Failsafe: if the node dimensions were completely cached/synchronous and 
    // ResizeObserver didn't have anything new to report, we trigger it once manually.
    if (!this._failsafeTimer) {
       this._failsafeTimer = setTimeout(() => {
          if (!this._initialViewRestored && this._runRelayoutPass) {
             this._runRelayoutPass(isStructured, dirFiles, dirNodeMap, editor, groups);
          } else {
             // Handle late layout updates for drilled views
             if (window.location.hash.includes('focus=')) {
               const params = getGraphUrlParams();
               const focusParam = params.get('focus');
               if (focusParam && this._router) {
                 this._router.navigateTo(decodeURIComponent(focusParam));
               }
             } else if (this._canvas.fitView) {
               this._canvas.fitView();
             }
             this._canvas.refreshConnections();
          }
       }, 300);
    }
    this._skeleton = skeleton;
    this._pinExpansion?.clearPins();
    if (!isStructured) {
      if (!this._pinExpansion) {
        this._pinExpansion = new PinExpansion(this._canvas, {
          onPinClick: (pin, _nodeId) => {
            if (pin.file) {
              state.activeFile = pin.file;
              emit('file-selected', { path: pin.file, line: pin.line || 1 });
            }
          }
        });
      }
      this._buildPinCache(skeleton, fileMap);
    }

    // Update stats
    const viaCount = editor.getConnections().filter(c => c._via).length;
    const statsEl = this.querySelector('.pcb-stats');
    if (statsEl) {
      renderGraphStats(statsEl, buildGraphStatItems({
        skeletonStats: skeleton.s || {},
        fileCount: fileMap.size,
        edgeCount: editor.getConnections().length,
        viaCount,
      }));
    }
  }


  /**
   * Post-render reflow: measure actual DOM SubgraphNode sizes and re-position
   * to eliminate overlaps. Uses a simple top-to-bottom column packing approach.
   * @param {import('symbiote-node/ui').NodeEditor} editor
   * @param {Object} _initialPositions
   * @returns {void}
   */
  _reflowStructuredNodes(editor, _initialPositions) {
    if (!this._canvas) return;

    // Collect actual dimensions from DOM
    const entries = [];
    for (const node of editor.getNodes()) {
      const el = this._canvas.getNodeView?.(node.id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const zoom = this._canvas.$.zoom || 1;
      // Convert screen dimensions to world-space
      const w = rect.width / zoom;
      const h = rect.height / zoom;
      const pos = el._position || { x: 0, y: 0 };
      entries.push({ id: node.id, x: pos.x, y: pos.y, w, h });
    }

    if (entries.length === 0) return;

    // Sort by original Y position (preserve column ordering from AutoLayout)
    entries.sort((a, b) => {
      const dx = Math.abs(a.x - b.x);
      // Same column if within 50px horizontally
      if (dx < 50) return a.y - b.y;
      return a.x - b.x;
    });

    // Group into columns (nodes within 50px x-distance = same column)
    const GAP = 40; // px gap between nodes
    const columns = [];
    let currentCol = [entries[0]];
    for (let i = 1; i < entries.length; i++) {
      if (Math.abs(entries[i].x - currentCol[0].x) < 50) {
        currentCol.push(entries[i]);
      } else {
        columns.push(currentCol);
        currentCol = [entries[i]];
      }
    }
    columns.push(currentCol);

    // Reflow each column vertically
    this._canvas.setBatchMode(true);
    for (const col of columns) {
      col.sort((a, b) => a.y - b.y);
      let nextY = col[0].y;
      for (const entry of col) {
        if (entry.y < nextY) {
          this._canvas.setNodePosition(entry.id, entry.x, nextY);
          entry.y = nextY;
        }
        nextY = entry.y + entry.h + GAP;
      }
    }
    this._canvas.setBatchMode(false);

    if (this._router) {
      this._router.restoreFromHash(editor);
    } else if (this._pgCanvasGraph) {
      this._restoreFlatFocus();
    }
    this._canvas.refreshConnections();
    // Only fit the full view if no focus= was applied (focus already positions the viewport)
    if (!window.location.hash.includes('focus=')) {
      this._canvas.fitView();
    }
  }

  /**
   * Restore drill-down state from a path (directory or file).
   * Finds the SubgraphNode whose params.path matches and drills in.
   * @param {string} targetPath - e.g. 'src/core/' or 'src/core/parser.js'
   * @param {import('symbiote-node/ui').NodeEditor} editor
   * @returns {boolean}
   */

  // ── Phase 2: IC Chip Expansion ──

  /**
   * Build pin cache: for each file node, resolve its exported symbol names
   * from skeleton.X (minified IDs) via skeleton.L (legend)
   * @param {object} skeleton
   * @param {Map<string, string>} fileMap
   */
  _buildPinCache(skeleton, fileMap) {
    const X = skeleton.X || {};
    const L = skeleton.L || {};
    const n = skeleton.n || {};

    // Build reverse legend: minifiedId → fullName
    const revL = {};
    for (const [minId, fullName] of Object.entries(L)) {
      revL[minId] = fullName;
    }

    for (const [filePath, nodeId] of fileMap) {
      const symbols = X[filePath] || [];
      const pins = [];

      for (const sym of symbols) {
        // Phase 4: X entries can be {id, l} objects with line numbers or plain strings
        const symId = typeof sym === 'object' ? sym.id : sym;
        const line = typeof sym === 'object' ? sym.l : null;
        const fullName = revL[symId] || symId;
        // Determine kind: class or function
        const nodeData = n[symId];
        const kind = nodeData ? 'class' : 'fn';
        pins.push({ name: fullName, kind, line, file: filePath });
      }

      // Also check classes that belong to this file (from skeleton.n)
      for (const [id, data] of Object.entries(n)) {
        if (data.f === filePath) {
          const fullName = revL[id] || id;
          // Avoid duplicates (already in X)
          if (!pins.some(p => p.name === fullName)) {
            pins.push({ name: fullName, kind: 'class', line: data.l || null, file: filePath });
          }
        }
      }

      if (pins.length > 0) {
        this._pinExpansion?.setPins(nodeId, pins);
      }
    }
  }



  // ── Phase 3: Directory Frames & Via Markers ──

  /**
   * Create directory grouping frames from dirFiles map and node positions
   * @param {import('symbiote-node/ui').NodeEditor} editor
   * @param {Map<string, string>} fileMap
   * @param {Map<string, string[]>} dirFiles
   * @param {Object<string, {x: number, y: number}>} positions
   */
  _addDirectoryFrames(editor, fileMap, dirFiles, positions) {
    addDirectoryFrames({ editor, fileMap, dirFiles, positions, FrameClass: Frame });
  }

  /**
   * Toggle layer visibility
   * @param {'zones'|'vias'} layer
   * @param {boolean} visible
   */
  _toggleLayer(layer, visible) {
    setGraphLayerVisible(this._canvas, layer, visible);
  }

  /**
   * Handle orchestrated visual focus from FollowController
   * @param {object} detail 
   */
  _handleFollowFocus({ type, target, action }) {
    if (type !== 'graph' && type !== 'file') return;

    // If graph isn't ready yet, queue the focus and replay after build
    if (!this._editor || !this._canvas || !this._graphBuilt) {
      this._pendingFollowFocus = { type, target, action };
      return;
    }

    this._executeFollowFocus(type, target, action);
  }

  /**
   * Execute a follow focus action (called when graph is confirmed ready).
   */
  _executeFollowFocus(type, target, action) {
    if (type === 'graph') {
      if (action === 'focus' && target) {
        this._focusSymbol(target);
      } else if (action === 'deps' && target) {
        this._highlightDeps(target);
      } else if (action === 'chain' && target.from && target.to) {
        this._highlightCallChain(target.from, target.to);
      } else if (action === 'fit') {
        this._canvas.fitView();
      }
    } else if (type === 'file' && target) {
      this._focusFile(target);
      this._pulseFile(target);
    }
  }

  /**
   * Replay any pending follow focus that was queued before the graph was ready.
   */
  _replayPendingFollowFocus() {
    if (this._pendingFollowFocus) {
      const { type, target, action } = this._pendingFollowFocus;
      this._pendingFollowFocus = null;
      this._executeFollowFocus(type, target, action);
    }
  }

  // ── Phase 4: Camera Animation & Code Drill-down ──

  /**
   * Smooth camera animation to a node position
   * @param {string} nodeId
   * @param {number} [targetZoom=1]
   * @param {number} [duration=400]
   */
  _animateToNode(nodeId, targetZoom = 1, duration = 400) {
    if (!this._canvas) return;
    const positions = this._canvas.getPositions();
    const pos = positions[nodeId];
    if (!pos) return;

    const canvasRect = this._canvas.getBoundingClientRect();
    const targetPanX = canvasRect.width / 2 - pos[0] * targetZoom;
    const targetPanY = canvasRect.height / 2 - pos[1] * targetZoom;

    const startZoom = this._canvas.$.zoom;
    const startPanX = this._canvas.$.panX;
    const startPanY = this._canvas.$.panY;
    const startTime = performance.now();

    const animate = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3);

      this._canvas.$.zoom = startZoom + (targetZoom - startZoom) * ease;
      this._canvas.$.panX = startPanX + (targetPanX - startPanX) * ease;
      this._canvas.$.panY = startPanY + (targetPanY - startPanY) * ease;

      if (t < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }

  /**
   * Focus on a file node with smooth animation
   * @param {string} filePath
   */
  _focusFile(filePath) {
    const nodeId = this._fileMap.get(filePath);
    if (!nodeId) return;
    this._animateToNode(nodeId, 1, 400);
  }

  /**
   * Focus on a symbol (resolve to file first)
   * @param {string} symbol
   */
  _focusSymbol(symbol) {
    if (!this._skeleton) return;
    const filePath = resolveSymbolFile(this._skeleton, symbol);
    if (!filePath) return;
    this._focusFile(filePath);
    this._pulseFile(filePath);
  }

  /**
   * Highlight dependencies of a symbol with flow animation
   * @param {string} symbol
   */
  _highlightDeps(symbol) {
    if (!this._skeleton) return;
    const filePath = resolveSymbolFile(this._skeleton, symbol);
    if (!filePath) return;

    // Focus + pulse the main file
    this._focusFile(filePath);
    this._pulseFile(filePath);

    // Highlight connections from this file
    const nodeId = this._fileMap.get(filePath);
    if (!nodeId) return;

    const connections = this._editor.getConnections()
      .filter(c => c.from === nodeId || c.to === nodeId);

    for (const conn of connections) {
      this._canvas.setFlowing(conn.id, true);
    }

    // Stop flow animation after 3 seconds
    setTimeout(() => {
      for (const conn of connections) {
        this._canvas.setFlowing(conn.id, false);
      }
    }, 3000);
  }

  /**
   * Highlight a call chain: animate sequential connection flow from source to target
   * @param {string} fromSymbol
   * @param {string} toSymbol
   */
  _highlightCallChain(fromSymbol, toSymbol) {
    if (!this._skeleton) return;

    // Resolve files
    const fromFile = resolveSymbolFile(this._skeleton, fromSymbol);
    const toFile = resolveSymbolFile(this._skeleton, toSymbol);
    if (!fromFile || !toFile) return;

    const fromId = this._fileMap.get(fromFile);
    const toId = this._fileMap.get(toFile);
    if (!fromId || !toId) return;

    const path = findConnectionPath(this._editor.getConnections(), fromId, toId);
    if (path.length === 0) return;

    // Focus on source node first
    this._animateToNode(fromId, 0.8, 300);

    // Animate flow along the path sequentially
    const stepDuration = 800;
    path.forEach((connId, idx) => {
      setTimeout(() => {
        this._canvas.setFlowing(connId, true);
      }, idx * stepDuration);
    });

    // Stop all flow after chain completes + hold time
    setTimeout(() => {
      for (const connId of path) {
        this._canvas.setFlowing(connId, false);
      }
      // Pan to destination
      this._animateToNode(toId, 1, 400);
      this._pulseFile(toFile);
    }, path.length * stepDuration + 1000);
  }

  /**
   * Pulse a file node (brief highlight)
   * @param {string} filePath
   */
  _pulseFile(filePath) {
    const nodeId = this._fileMap.get(filePath);
    if (!nodeId) return;
    this._canvas.highlightTrace([{ nodeId }], 200);
  }
}

DepGraph.rootStyles = PCB_CSS;
DepGraph.reg('pg-dep-graph');
