/**
 * dep-graph.js — Visual Project Graph (PCB Board Style)
 *
 * Renders the project dependency graph as an interactive
 * node-canvas visualization styled like a printed circuit board.
 * Uses symbiote-node's NodeCanvas with orthogonal routing,
 * readonly mode, and auto-layout.
 *
 * Phase 1: File-level graph (each file = node, imports = traces).
 */
import Symbiote from '@symbiotejs/symbiote';
import {
  NodeEditor,
  Node,
  SubgraphNode,
  Connection,
  Socket,
  Input,
  Output,
  NodeCanvas,
  Frame,
  computeAutoLayout,
  computeTreeLayout,
  applyTheme,
  SubgraphRouter,
  LODManager,
  PinExpansion,
  ForceLayout,
  PCB_DARK,
} from 'symbiote-node';
import { api, state, events, emit } from '../app.js';

import { buildFileGraph, buildStructuredGraph } from "../services/skeleton-parser.js";
import '../components/LoadingOverlay/LoadingOverlay.js';
// ── Consumer-specific CSS (toolbar, stats, pin overlay) ──
// Node styling, chip decorations, connection strokes, frame styling
// are all handled by the PCB_DARK theme in the library.
const PCB_CSS = `
  pg-dep-graph {
    display: block;
    height: 100%;
    position: relative;
    overflow: hidden;
    background: var(--sn-bg, #1a1a1a);
    /* Prevent scrollbar oscillation in parent .panel-content (overflow:auto)
       Canvas manages its own viewport — no scrollbars needed */
    contain: strict;
  }

  pg-dep-graph node-canvas,
  pg-dep-graph pg-canvas-graph {
    width: 100%;
    height: 100%;
  }

  /* Toolbar */
  .pcb-toolbar {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 6px;
    z-index: 200;
  }

  .pcb-btn {
    background: var(--sn-node-bg, #222222);
    border: 1px solid var(--sn-node-border, rgba(255,255,255,0.12));
    color: var(--sn-text, #e0e0e0);
    border-radius: 3px;
    padding: 4px 10px;
    font-family: var(--sn-font, 'SF Mono', monospace);
    font-size: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: background 150ms, border-color 150ms;
  }

  .pcb-btn:hover {
    background: var(--sn-node-hover, #2d2d2d);
  }

  .pcb-btn[data-active] {
    border-color: var(--sn-node-selected, #d4a04a);
    background: rgba(212, 160, 74, 0.1);
  }

  .pcb-btn .material-symbols-outlined {
    font-size: 14px;
  }

  .pcb-stats {
    position: absolute;
    bottom: 8px;
    left: 8px;
    display: flex;
    gap: 12px;
    z-index: 10;
    font-family: var(--sn-font, 'SF Mono', monospace);
    font-size: 10px;
    color: var(--sn-text-dim, #888888);
    background: rgba(26, 26, 26, 0.9);
    padding: 4px 10px;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .pcb-stat-val {
    color: var(--sn-text, #e0e0e0);
    font-weight: 600;
  }

  /* ── Pin Labels (dep-graph-specific feature) ── */
  .pcb-pin-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 2;
    opacity: 0;
    transition: opacity 0.25s ease-in-out;
  }
  .pcb-pin-overlay[data-visible] {
    opacity: 1;
  }
  .pcb-pin {
    position: absolute;
    font-family: var(--sn-font, 'JetBrains Mono', monospace);
    font-size: 8px;
    line-height: 1;
    white-space: nowrap;
    color: var(--sn-text-dim, #888);
    pointer-events: auto;
    cursor: default;
  }
  .pcb-pin::before {
    content: '';
    position: absolute;
    top: 50%;
    width: 4px;
    height: 4px;
    background: var(--sn-conn-color, #c87533);
    border-radius: 50%;
    transform: translateY(-50%);
  }
  .pcb-pin[data-side="left"] {
    left: -4px;
    transform: translateX(-100%);
    text-align: right;
    padding-right: 8px;
  }
  .pcb-pin[data-side="left"]::before {
    right: 0;
  }
  .pcb-pin[data-side="right"] {
    right: -4px;
    transform: translateX(100%);
    text-align: left;
    padding-left: 8px;
  }
  .pcb-pin[data-side="right"]::before {
    left: 0;
  }
  .pcb-pin[data-kind="class"] {
    color: var(--sn-cat-control, #d4a04a);
    font-weight: 600;
  }
  .pcb-pin[data-kind="fn"] {
    color: var(--sn-text, #e0e0e0);
  }
  .pcb-pin:hover {
    color: var(--sn-node-selected, #d4a04a) !important;
    text-shadow: 0 0 4px rgba(212, 160, 74, 0.4);
  }
  .pcb-pin[style*="cursor: pointer"]:hover::after {
    content: '→';
    margin-left: 3px;
    font-size: 7px;
    opacity: 0.6;
  }

  /* Toolbar separator */
  .pcb-toolbar-sep {
    width: 1px;
    background: rgba(255,255,255,0.1);
    margin: 0 4px;
    align-self: stretch;
  }

  /* Layer toggle buttons */
  .pcb-layer-btn {
    font-size: 9px;
    padding: 3px 6px;
    opacity: 0.7;
  }
  .pcb-layer-btn[data-active] {
    opacity: 1;
  }
  .pcb-layer-btn[data-hidden] {
    opacity: 0.3;
    text-decoration: line-through;
  }
`;

export class DepGraph extends Symbiote {
  init$ = {};


  /** @type {NodeEditor|null} */
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
  /** @type {LODManager} */
  _lodManager = null;
  /** @type {boolean} Guard against duplicate graph builds */
  _graphBuilt = false;

  /**
   * Update the PCB preloader overlay
   * @param {number} pct - 0-100 progress percent
   * @param {string} phase - phase label
   * @param {string} [sub] - optional subtitle
   */
  _setProgress(pct, phase, sub = '') {
    this.querySelector('loading-overlay')?.setProgress(pct, phase, sub);
  }

  /** Hide the PCB preloader overlay */
  _hideLoader() {
    this.querySelector('loading-overlay')?.hide(() => this._replayPendingFollowFocus());
  }

  /** Show (or re-show) the PCB preloader overlay */
  _showLoader() {
    this.querySelector('loading-overlay')?.show();
  }

  initCallback() {
    // Build DOM
    this.innerHTML = `
      <div class="pcb-toolbar">
        <button class="pcb-btn" data-action="fit" title="Fit view">
          <span class="material-symbols-outlined">fit_screen</span>
          FIT
        </button>
        <div class="pcb-toolbar-sep"></div>
        <button class="pcb-btn label-mode-btn pcb-structured-only" data-mode="always" data-active title="Always show labels">LBL:ALW</button>
        <button class="pcb-btn label-mode-btn pcb-structured-only" data-mode="hover" title="Hover labels">LBL:HOV</button>
        <button class="pcb-btn label-mode-btn pcb-structured-only" data-mode="focus" title="Focus labels">LBL:FOC</button>
        <div class="pcb-toolbar-sep pcb-structured-only"></div>
        <button class="pcb-btn pcb-layer-btn pcb-structured-only" data-layer="zones" data-active title="Toggle directory zones">ZONES</button>
        <button class="pcb-btn pcb-layer-btn pcb-structured-only" data-layer="vias" data-active title="Toggle via markers">VIAS</button>
        <div class="pcb-toolbar-sep"></div>
        <button class="pcb-btn" data-action="view-mode" title="Toggle view: Flat ↔ Structured">
          <span class="material-symbols-outlined">account_tree</span>
          FLAT
        </button>
        <button class="pcb-btn pcb-structured-only" data-action="path-style" title="Toggle lines: PCB ↔ Bezier">
          <span class="material-symbols-outlined">route</span>
          PCB
        </button>
      </div>
      <loading-overlay ref="loader"></loading-overlay>
      <node-canvas connection-engine="canvas"></node-canvas>
      <pg-canvas-graph></pg-canvas-graph>
      <div class="pcb-stats"></div>
    `;

    this._canvas = this.querySelector('node-canvas');
    this._pgCanvasGraph = this.querySelector('pg-canvas-graph');

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
        const hash = path ? `#graph/${path}` : `#graph`;
        // Preserve mode query param but clear focus= when returning to root
        let searchStr = window.location.hash.includes('?') ? '?' + window.location.hash.split('?')[1] : '';
        if (!path && searchStr) {
          // Remove focus param when exiting to root
          const params = new URLSearchParams(searchStr.slice(1));
          params.delete('focus');
          searchStr = params.toString() ? '?' + params.toString() : '';
        }
        history.replaceState(null, '', hash + searchStr);
      }
    });
    
    this._pgCanvasGraph.addEventListener('file-selected', (e) => {
      const path = e.detail.path;
      // Update URL with focus= so it's bookmarkable
      this._updateHashParam('focus', path);
      emit('file-selected', { path, source: 'canvas' });
    });

    this._pgCanvasGraph.addEventListener('group-selected', (e) => {
      const path = e.detail.path;
      // Update URL with focus= so group selection is also bookmarkable in flat mode
      this._updateHashParam('focus', path);
      // Sync: highlight directory in the tree sidebar (add trailing / for dir convention)
      emit('file-selected', { path: path + '/', source: 'canvas' });
    });

    // Deselect in flat mode: clear focus= when clicking empty space
    this._pgCanvasGraph.addEventListener('node-deselected', () => {
      if (!this._initialViewRestored) return;
      if (window.location.hash.includes('focus=')) {
        this._updateHashParam('focus', null);
      }
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
      btn.addEventListener('click', (e) => {
        labelBtns.forEach(b => b.removeAttribute('data-active'));
        btn.setAttribute('data-active', '');
        const mode = btn.getAttribute('data-mode');
        this._canvas.setAttribute('data-label-mode', mode);
      });
    });

    // Phase 3: Layer toggle controls
    this.querySelectorAll('.pcb-layer-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const layer = btn.getAttribute('data-layer');
        const isActive = btn.hasAttribute('data-active');
        if (isActive) {
          btn.removeAttribute('data-active');
          btn.setAttribute('data-hidden', '');
        } else {
          btn.setAttribute('data-active', '');
          btn.removeAttribute('data-hidden');
        }
        this._toggleLayer(layer, !isActive);
      });
    });

    const searchStr = window.location.search || (window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '');
    const urlParams = new URLSearchParams(searchStr);
    // Support both ?mode=flat and legacy ?flat=true
    const modeParam = urlParams.get('mode') || (urlParams.get('flat') === 'true' ? 'flat' : null);
    this._viewMode = modeParam === 'flat' ? 'flat' : 'structured';
    const viewModeBtn = this.querySelector('[data-action="view-mode"]');
    if (viewModeBtn) {
      const icon = modeParam === 'flat' ? 'account_tree' : 'grid_view';
      const text = modeParam === 'flat' ? 'FLAT' : 'TREE';
      viewModeBtn.innerHTML = `<span class="material-symbols-outlined">${icon}</span>${text}`;
      if (modeParam === 'flat') {
        viewModeBtn.removeAttribute('data-active');
      }
    }
    this._updateStructuredOnlyVisibility(this._viewMode);
    
    this._setMode = (newMode) => {
      if (this._viewMode === newMode) return;
      this._viewMode = newMode;
      const label = this._viewMode === 'flat' ? 'FLAT' : 'TREE';
      const icon = this._viewMode === 'flat' ? 'account_tree' : 'grid_view';
      if (viewModeBtn) {
        viewModeBtn.innerHTML = `<span class="material-symbols-outlined">${icon}</span>${label}`;
        if (this._viewMode === 'structured') {
          viewModeBtn.setAttribute('data-active', '');
        } else {
          viewModeBtn.removeAttribute('data-active');
        }
      }
      this._updateStructuredOnlyVisibility(this._viewMode);

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
      if (this._failsafeTimer) { clearTimeout(this._failsafeTimer); this._failsafeTimer = null; }
      this._showLoader();
      if (state.skeleton) {
        this._buildGraph(state.skeleton);
      }
    };

    viewModeBtn?.addEventListener('click', () => {
      const wantFlat = this._viewMode !== 'flat';
      this._setMode(wantFlat ? 'flat' : 'structured');
    });

    // Connection Path Style toggling
    const pathStyleBtn = this.querySelector('[data-action="path-style"]');
    if (pathStyleBtn) {
      let currentStyle = urlParams.get('style') || window.localStorage.getItem('connection-style') || 'pcb';
      const styles = ['pcb', 'bezier', 'orthogonal', 'straight'];
      
      const updateStyleUI = () => {
        let icon, text;
        switch(currentStyle) {
          case 'bezier': icon = 'timeline'; text = 'BEZIER'; break;
          case 'orthogonal': icon = 'polyline'; text = 'ORTHO'; break;
          case 'straight': icon = 'horizontal_rule'; text = 'STRAIGHT'; break;
          case 'pcb':
          default:
            icon = 'route'; text = 'PCB'; break;
        }
        pathStyleBtn.innerHTML = `<span class="material-symbols-outlined">${icon}</span>${text}`;
        if (currentStyle === 'pcb') {
          pathStyleBtn.setAttribute('data-active', '');
        } else {
          pathStyleBtn.removeAttribute('data-active');
        }
      };
      updateStyleUI();
      
      pathStyleBtn.addEventListener('click', () => {
        const idx = styles.indexOf(currentStyle);
        currentStyle = styles[(idx + 1) % styles.length] || 'pcb';
        window.localStorage.setItem('connection-style', currentStyle);
        this._canvas.setPathStyle(currentStyle);
        updateStyleUI();
      });
    }

    // Apply PCB theme
    applyTheme(this._canvas, PCB_DARK);

    // Setup ResizeObserver to gracefully handle "Layout preserved" (display: none) hidden panels.
    // Prevents building graphs while they have 0 width/height, dodging layout thrashing & 50,000+ DOM mutations
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      if (rect.width > 0 && rect.height > 0) {
        if (!this._graphBuilt && state.skeleton) {
          // Wrap in rAF to prevent loop if ResizeObserver caught mid-render
          requestAnimationFrame(() => this._buildGraph(state.skeleton));
        }
      }
    });
    ro.observe(this);
    this._resizeObserver = ro;

    this._onSkeletonLoaded = (e) => {
      if (this._graphBuilt || this.style.display === 'none' || this.offsetWidth === 0) return;
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
        // Strip trailing slash for directory paths — canvas-graph stores dirs without trailing /
        const nodeId = file.endsWith('/') ? file.replace(/\/$/, '') : file;
        if (this._viewMode === 'flat' && this._pgCanvasGraph) {
          this._pgCanvasGraph.flyToNode(nodeId);
        } else {
          this._router?.navigateTo(file);
        }
      }
    };

    // Wait for canvas to initialize, then listen for data
    events.addEventListener('skeleton-loaded', this._onSkeletonLoaded);

    // Initial fetch if we don't have it
    if (!state.skeleton) {
      // Self-fetch skeleton (graph panel may mount before FileTree)
      api('/api/skeleton', {}).then((skeleton) => {
        if (skeleton && !this._graphBuilt) {
          state.skeleton = skeleton;
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
      const isSymbol = this._symbolMap?.has(nodeId);
      const depth = this._router?.depth || 0;

      if (isSymbol) {
        // Symbol click: keep current drill URL, append &symbol=
        const sym = this._symbolMap.get(nodeId);
        this._updateHashParam('symbol', sym.name);
        // Highlight the parent file in the tree sidebar
        if (sym.file) {
          emit('file-selected', { path: sym.file, source: 'canvas' });
        }
      } else if (path) {
        if (depth === 0) {
          // Root level: path goes into ?focus= parameter
          this._updateHashParam('focus', path);
          this._updateHashParam('in', null);

        } else {
          // Inside a group: preserve drill context URL, set &focus= with relative name
          const drillBase = window.location.hash.split('?')[0]; // e.g. #graph/src/analysis/
          const drillPath = drillBase.replace('#graph/', '');
          // Get relative name inside the drilled group
          const relativeName = path.startsWith(drillPath) ? path.slice(drillPath.length) : path;
          // Keep existing parameters except we update focus and ensure in=1 is set
          this._updateHashParam('focus', relativeName);
          this._updateHashParam('in', '1');
          

        }
        // Sync: highlight file in the tree sidebar
        emit('file-selected', { path, source: 'canvas' });
      }

    });

    // Deselect: when no nodes selected → clear focus from URL
    this._canvas?.addEventListener('selection-changed', (e) => {
      if (e.detail.nodes.length > 0) return; // Still has selection
      if (!this._initialViewRestored) return; // Don't clear URL during initial load
      const hash = window.location.hash;
      if (hash.includes('focus=')) {
        this._updateHashParam('focus', null);
      }
    });

    // Toolbar custom actions (e.g. explore, view-code, enter)
    this.addEventListener('toolbar-action', (e) => {
      const { action, nodeId } = e.detail;
      if (action === 'explore') {
        if (this._viewMode === 'flat') {
          this._pgCanvasGraph?.flyToNode(nodeId);
        } else {
          this._exploreFromNode(nodeId);
        }
      } else if (action === 'view-code') {
        let file;
        if (this._viewMode === 'flat') {
          file = nodeId;
        } else {
          const path = this._idToPath?.get(nodeId);
          const isSymbol = this._symbolMap?.has(nodeId);
          file = isSymbol ? this._symbolMap.get(nodeId).file : path;
        }
        if (file) {
          window.location.hash = `#explorer/${file}`;
        }
      } else if (action === 'enter') {
        if (this._viewMode === 'flat' && this._pgCanvasGraph) {
          this._pgCanvasGraph.drill(nodeId);
        }
      }
    });

    events.addEventListener('file-selected', this._onFileSelected);

    // React to hash changes from file-tree, back/forward, or external URL paste
    this._onHashChange = () => {
      const hash = window.location.hash;
      if (!hash.startsWith('#graph')) return;
      
      if (this._viewMode === 'flat') {
        const [hashBase, queryStr] = hash.replace('#', '').split('?');
        const hashParams = hashBase.split('/');
        if (hashParams[0] === 'graph') hashParams.shift();
        const pathStr = hashParams.join('/');
        if (this._pgCanvasGraph) this._pgCanvasGraph.setPath(pathStr);
        // Parse and apply focus= parameter
        if (queryStr) {
          const params = new URLSearchParams(queryStr);
          const focusParam = params.get('focus');
          if (focusParam && this._pgCanvasGraph) {
            this._pgCanvasGraph.flyToNode(decodeURIComponent(focusParam));
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
    const hash = window.location.hash;
    const [hashBase, queryStr] = hash.replace('#', '').split('?');
    
    // Apply drill path if present: #graph/src/core/ → setPath('src/core')
    const hashParams = hashBase.split('/');
    if (hashParams[0] === 'graph') hashParams.shift();
    const pathStr = hashParams.join('/');
    if (pathStr && this._pgCanvasGraph) {
      this._pgCanvasGraph.setPath(pathStr);
    }
    
    // Apply focus= if present
    if (queryStr) {
      const params = new URLSearchParams(queryStr);
      const focusParam = params.get('focus');
      if (focusParam && this._pgCanvasGraph) {
        const decoded = decodeURIComponent(focusParam);
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
   * Update a single URL hash parameter without page reload.
   * Preserves existing hash path and other params.
   * @param {string} key - Parameter name (e.g. 'mode', 'focus')
   * @param {string|null} value - Parameter value, null to remove
   */
  /**
   * Show/hide toolbar buttons that only apply in structured mode.
   * @param {string} mode - 'flat' or 'structured'
   */
  _updateStructuredOnlyVisibility(mode) {
    const hide = mode === 'flat';
    this.querySelectorAll('.pcb-structured-only').forEach(el => {
      el.style.display = hide ? 'none' : '';
    });
  }

  _updateHashParam(key, value) {
    const hash = window.location.hash;
    const [basePath, queryStr] = hash.split('?');
    const params = new URLSearchParams(queryStr || '');
    if (value === null || value === undefined) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const newQuery = params.toString();
    const newHash = newQuery ? `${basePath}?${newQuery}` : basePath;
    history.replaceState(null, '', newHash);
  }

  /**
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
    const allExplore = new Set([nodeId, ...importSet, ...dependentSet]);

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
      if (this._canvas) this._canvas.style.display = 'none';
      if (this._pgCanvasGraph) {
        this._pgCanvasGraph.style.display = 'block';
        
        // Listen to canvas-graph for first tick or done to hide loader
        const hideCanvasLoader = () => {
          this._pgCanvasGraph.removeEventListener('layout-tick', hideCanvasLoader);
          this._pgCanvasGraph.removeEventListener('layout-done', hideCanvasLoader);
          this._hideLoader();
        };
        this._pgCanvasGraph.addEventListener('layout-tick', hideCanvasLoader);
        this._pgCanvasGraph.addEventListener('layout-done', hideCanvasLoader);
        
        this._pgCanvasGraph.setSkeleton(skeleton);
        
        // Restore path from URL
        const hashData = location.hash.replace('#', '').split('?')[0];
        const hashParams = hashData.split('/');
        if (hashParams[0] === 'graph') {
          hashParams.shift(); // remove "graph"
        }
        const pathStr = hashParams.join('/');
        this._pgCanvasGraph.setPath(pathStr);
      } else {
        this._hideLoader();
      }
      this._graphBuilt = true;
      return;
    }

    if (this._pgCanvasGraph) this._pgCanvasGraph.style.display = 'none';
    if (this._canvas) this._canvas.style.display = '';

    // Cache key: reuse previously built graph for same skeleton+mode
    const cacheKey = isStructured ? 'structured' : 'flat';
    if (!this._graphCache) this._graphCache = {};

    let editor, fileMap, dirFiles, dirNodeMap, idToPath, symbolMap;

    if (this._graphCache[cacheKey] && this._graphCache[cacheKey].skeleton === skeleton) {
      // Reuse cached build result — avoids 5+ second rebuild on mode toggle
      ({ editor, fileMap, dirFiles, dirNodeMap, idToPath, symbolMap } = this._graphCache[cacheKey]);
      this._setProgress(40, 'Building nodes…', `${editor.getNodes().length} nodes (cached)`);
    } else {

      this._setProgress(15, 'Parsing graph…', isStructured ? 'structured mode' : 'flat mode');
      if (isStructured) {
        ({ editor, fileMap, dirFiles, dirNodeMap, idToPath, symbolMap } = buildStructuredGraph(skeleton));
      } else {
        ({ editor, fileMap, dirFiles, idToPath, symbolMap: symbolMap = new Map() } = buildFileGraph(skeleton));
      }

      this._setProgress(40, 'Building nodes…', `${editor.getNodes().length} nodes`);
      this._graphCache[cacheKey] = { skeleton, editor, fileMap, dirFiles, dirNodeMap, idToPath, symbolMap };
    }
    this._editor = editor;
    this._fileMap = fileMap;
    this._dirNodeMap = dirNodeMap;
    this._idToPath = idToPath;
    this._symbolMap = symbolMap;
    this._drillableFiles = new Set([...symbolMap.values()].map(s => s.file));

    if (this._router) this._router.destroy();
    this._router = new SubgraphRouter(this._canvas, {
      hashPrefix: 'graph',
      fileMap,
      dirNodeMap,
      symbolMap,
      drillableFiles: this._drillableFiles,
      onNavigate: (path) => {
        // Optional hook: focus/pulse upon non-visual navigation
      }
    });

    // Set editor on canvas

    this._setProgress(55, 'Building nodes…', 'rendering DOM');
    this._canvas.setEditor(editor);

    this._setProgress(70, 'Placing nodes…', '');

    // Apply settings
    this._canvas.setReadonly(true);
    const searchStr = window.location.search || (window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '');
    const urlParams = new URLSearchParams(searchStr);
    this._canvas.setPathStyle(urlParams.get('style') || window.localStorage.getItem('connection-style') || 'pcb');

    // Auto-layout
    const rawPos = this._canvas.getPositions() || {};
    const existingPositions = {};
    for (const [id, coords] of Object.entries(rawPos)) {
      if (typeof coords[0] === 'number' && !isNaN(coords[0]) &&
          typeof coords[1] === 'number' && !isNaN(coords[1])) {
        existingPositions[id] = { x: coords[0], y: coords[1] };
      }
    }

    // Groups for layout clustering (flat mode only — structured has fewer top-level nodes)
    const groups = {};
    if (!isStructured && dirFiles) {
      for (const [dir, files] of dirFiles.entries()) {
        const nodeIds = [];
        for (const f of files) {
          if (fileMap.has(f)) nodeIds.push(fileMap.get(f));
        }
        if (nodeIds.length > 0) groups[dir] = nodeIds;
      }
    }

    // --- Layout strategy depends on mode ---
    let positions;

    if (isStructured && dirFiles) {
      // TREE mode: directory tree layout (like file explorer)
      // Build dirPaths map ONLY for nodes that are in the root editor
      const dirPaths = {};
      const rootNodeIds = new Set(editor.getNodes().map(n => n.id));
      for (const [dir, nodeId] of dirNodeMap.entries()) {
        if (rootNodeIds.has(nodeId)) {
          dirPaths[nodeId] = dir;
        }
      }

      positions = computeTreeLayout(editor, {
        dirPaths,
        nodeWidth: 250,
        nodeHeight: 100,
        gapX: 40,
        gapY: 60,
        startX: 60,
        startY: 60,
      });
    } else {
      // FLAT mode: group-aware circular initial positions for force simulation.
      // AutoLayout (Sugiyama) creates a vertical line that ForceWorker cannot fix,
      // so we start with a balanced 2D circular layout.
      const allNodes = [...editor.getNodes()];
      const totalNodes = allNodes.length;
      const groupEntries = Object.entries(groups);
      positions = {};

      if (groupEntries.length > 1) {
        // Place each group's centroid on a spiral, fan members around it
        const globalRadius = Math.sqrt(totalNodes) * 80;
        let groupIdx = 0;
        for (const [, memberIds] of groupEntries) {
          const angle = (2 * Math.PI * groupIdx) / groupEntries.length;
          const r = globalRadius * (0.3 + 0.7 * (groupIdx / groupEntries.length));
          const cx = Math.cos(angle) * r;
          const cy = Math.sin(angle) * r;
          const memberRadius = Math.sqrt(memberIds.length) * 60;
          for (let mi = 0; mi < memberIds.length; mi++) {
            const mAngle = (2 * Math.PI * mi) / memberIds.length;
            positions[memberIds[mi]] = {
              x: cx + Math.cos(mAngle) * memberRadius + (Math.random() - 0.5) * 20,
              y: cy + Math.sin(mAngle) * memberRadius + (Math.random() - 0.5) * 20,
            };
          }
          groupIdx++;
        }
      }

      // Fill ungrouped nodes in a ring
      for (const n of allNodes) {
        if (!positions[n.id]) {
          const angle = Math.random() * 2 * Math.PI;
          const r = Math.sqrt(totalNodes) * 50 + Math.random() * 200;
          positions[n.id] = { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
        }
      }
    }

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
        const workerUrl = new URL('/packages/symbiote-node/canvas/ForceWorker.js', import.meta.url).href;
        this._forceLayout = new ForceLayout(workerUrl);
      }

      const editorNodes = [...editor.getNodes()];
      const editorConns = [...editor.getConnections()];
      const forceNodes = editorNodes.map(n => ({
        id: n.id,
        x: positions[n.id]?.x ?? 0,
        y: positions[n.id]?.y ?? 0,
        group: groups ? Object.entries(groups).find(([, ids]) => ids.includes(n.id))?.[0] : null,
        w: n.params?.calculatedWidth || 260,
        h: n.params?.calculatedHeight || 60,
      }));
      const forceEdges = editorConns.map(c => ({ from: c.from, to: c.to }));

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
          const _hashHasFocus = window.location.hash.includes('?') || window.location.hash.includes('focus=');
          if (!_hashHasFocus) {
            this._canvas.fitView();
          }
          // In continuous mode: restore hash navigation after initial convergence settles
          setTimeout(() => {
            const fullHash = window.location.hash;
            const hasPath = /^#graph\//.test(fullHash);
            const hasParams = fullHash.includes('?');
            if (hasPath || hasParams) {
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
        const fullHash = window.location.hash;
        const hasPath = /^#graph\//.test(fullHash);
        const hasParams = fullHash.includes('?');
        if (hasPath || hasParams) {
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
        nodes: forceNodes,
        edges: forceEdges,
        groups: groups || {},
        options: {
          chargeStrength: nodeCount > 500 ? -300 : -150,
          linkDistance: nodeCount > 500 ? 100 : 150,
          nodeWidth: 260,
          nodeHeight: 40,
          mode: 'continuous',
          brownian: 0,
        },
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
              const searchStr = window.location.search || (window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '');
              const params = new URLSearchParams(searchStr);
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
      if (!this._canvas) return;
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
          // ── Group-aware circular initial positions ──
          // Instead of Sugiyama (vertical line), place groups in concentric rings.
          // This gives the force simulation a balanced 2D starting point.
          correctedPositions = {};
          const groupEntries = groups ? Object.entries(groups) : [];
          const totalNodes = editorNodes.length;

          if (groupEntries.length > 1) {
            // Place each group's centroid on a spiral, then fan members around it
            const globalRadius = Math.sqrt(totalNodes) * 80;
            let groupIdx = 0;
            for (const [, memberIds] of groupEntries) {
              const angle = (2 * Math.PI * groupIdx) / groupEntries.length;
              const r = globalRadius * (0.3 + 0.7 * (groupIdx / groupEntries.length));
              const cx = Math.cos(angle) * r;
              const cy = Math.sin(angle) * r;

              const memberRadius = Math.sqrt(memberIds.length) * 60;
              for (let mi = 0; mi < memberIds.length; mi++) {
                const mAngle = (2 * Math.PI * mi) / memberIds.length;
                correctedPositions[memberIds[mi]] = {
                  x: cx + Math.cos(mAngle) * memberRadius + (Math.random() - 0.5) * 20,
                  y: cy + Math.sin(mAngle) * memberRadius + (Math.random() - 0.5) * 20,
                };
              }
              groupIdx++;
            }
          }

          // Fill any ungrouped nodes in a ring
          for (const n of editorNodes) {
            if (!correctedPositions[n.id]) {
              const angle = Math.random() * 2 * Math.PI;
              const r = Math.sqrt(totalNodes) * 50 + Math.random() * 200;
              correctedPositions[n.id] = {
                x: Math.cos(angle) * r,
                y: Math.sin(angle) * r,
              };
            }
          }

          // Start force simulation. Apply circular seed BEFORE starting so there's no
          // position race between the random seed write (below) and the first worker tick.
          if (!this._forceLayout) {
            const workerUrl = new URL('/packages/symbiote-node/canvas/ForceWorker.js', import.meta.url).href;
            this._forceLayout = new ForceLayout(workerUrl);
          }

          const forceNodes = editorNodes.map(n => ({
            id: n.id,
            x: correctedPositions[n.id]?.x ?? 0,
            y: correctedPositions[n.id]?.y ?? 0,
            group: groups ? Object.entries(groups).find(([, ids]) => ids.includes(n.id))?.[0] : null,
            w: nodeSizes[n.id]?.w || n.params?.calculatedWidth || 260,
            h: nodeSizes[n.id]?.h || n.params?.calculatedHeight || 60,
          }));

          const forceEdges = editorConns.map(c => ({
            from: c.from,
            to: c.to,
          }));

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
              const fullHash = window.location.hash;
              const hasPath = /^#graph\//.test(fullHash);
              const hasParams = fullHash.includes('?');
              if (hasPath || hasParams) {
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
            nodes: forceNodes,
            edges: forceEdges,
            groups: groups || {},
            options: {
              chargeStrength: totalNodes > 500 ? -300 : -150,
              linkDistance: totalNodes > 500 ? 100 : 150,
            },
          });

          // BUG-FIX: Do NOT write correctedPositions to canvas here.
          // The circular seed has already been applied to forceNodes above.
          // Writing it now would overwrite the first worker tick with stale random positions.
          return;
        } // end if (editorNodes.length >= 50)
      } // end outer else (flat/tree mode branch)




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
        const fullHash = window.location.hash;
        const hasPath = /^#graph\//.test(fullHash);
        const hasParams = fullHash.includes('?');
        if (hasPath || hasParams) {
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
               const searchStr = window.location.search || (window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '');
               const params = new URLSearchParams(searchStr);
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
    // Phase 3: Directory frames (flat mode only)
    // DISABLED: Zone group frames temporarily turned off

    // Store skeleton for Phase 2 pin resolution (flat mode only)
    this._skeleton = skeleton;
    this._pinExpansion?.clearPins();
    if (!isStructured) {
      if (!this._pinExpansion) {
        this._pinExpansion = new PinExpansion(this._canvas, {
          onPinClick: (pin, nodeId) => {
            if (pin.file) {
              state.activeFile = pin.file;
              emit('file-selected', { path: pin.file, line: pin.line || 1 });
            }
          }
        });
      }
      /*
      if (!this._lodManager) {
        this._lodManager = new LODManager(this._canvas, { threshold: 0.7 });
        this._lodManager.onLodChange((lod) => {
          this._pinExpansion?.applyLOD(lod);
        });
        this._lodManager.attach();
      }
      this._lodManager.update();
      */
      this._buildPinCache(skeleton, fileMap);
    }

    // Update stats
    const stats = skeleton.s || {};
    const viaCount = editor.getConnections().filter(c => c._via).length;
    const statsEl = this.querySelector('.pcb-stats');
    if (statsEl) {
      statsEl.innerHTML = `
        <span><span class="pcb-stat-val">${fileMap.size}</span> files</span>
        <span><span class="pcb-stat-val">${stats.functions || 0}</span> fn</span>
        <span><span class="pcb-stat-val">${stats.classes || 0}</span> cls</span>
        <span><span class="pcb-stat-val">${editor.getConnections().length}</span> edges</span>
        ${viaCount > 0 ? `<span><span class="pcb-stat-val">${viaCount}</span> vias</span>` : ''}
      `;
    }
  }


  /**
   * Post-render reflow: measure actual DOM SubgraphNode sizes and re-position
   * to eliminate overlaps. Uses a simple top-to-bottom column packing approach.
   * @param {NodeEditor} editor
   * @param {Object} initialPositions
   */
  _reflowStructuredNodes(editor, initialPositions) {
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
   * @param {NodeEditor} editor
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

  /** @type {string[]} Directory color palette — PCB silkscreen tones */
  static DIR_COLORS = [
    'rgba(200, 117, 51, 0.25)',  // copper
    'rgba(212, 160, 74, 0.20)',  // gold
    'rgba(100, 180, 120, 0.20)', // solder mask green
    'rgba(80, 150, 200, 0.20)',  // blue layer
    'rgba(160, 100, 200, 0.20)', // purple trace
    'rgba(200, 80, 80, 0.20)',   // power layer red
    'rgba(120, 200, 200, 0.20)', // teal
    'rgba(200, 180, 80, 0.20)',  // yellow
  ];

  /**
   * Create directory grouping frames from dirFiles map and node positions
   * @param {NodeEditor} editor
   * @param {Map<string, string>} fileMap
   * @param {Map<string, string[]>} dirFiles
   * @param {Object<string, {x: number, y: number}>} positions
   */
  _addDirectoryFrames(editor, fileMap, dirFiles, positions) {
    if (!dirFiles || dirFiles.size < 2) return; // frames only useful with 2+ dirs

    const padding = 30;
    const nodeW = 120;
    const nodeH = 80;
    let colorIdx = 0;

    for (const [dir, files] of dirFiles) {
      if (files.length < 2) continue; // skip single-file dirs

      // Compute bounding box of all nodes in this directory
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let hasPositions = false;

      for (const file of files) {
        const nodeId = fileMap.get(file);
        if (!nodeId) continue;
        const pos = positions[nodeId];
        if (!pos) continue;
        hasPositions = true;

        if (pos.x < minX) minX = pos.x;
        if (pos.y < minY) minY = pos.y;
        if (pos.x + nodeW > maxX) maxX = pos.x + nodeW;
        if (pos.y + nodeH > maxY) maxY = pos.y + nodeH;
      }

      if (!hasPositions) continue;

      // Create frame with padding
      const dirLabel = dir.replace(/\/$/, '').split('/').pop() || 'root';
      const color = DepGraph.DIR_COLORS[colorIdx % DepGraph.DIR_COLORS.length];
      colorIdx++;

      try {
        const frame = new Frame(dirLabel, {
          x: minX - padding,
          y: minY - padding,
          width: (maxX - minX) + padding * 2,
          height: (maxY - minY) + padding * 2,
          color,
        });
        editor.addFrame(frame);
      } catch {
        // Skip if frame creation fails
      }
    }
  }

  /**
   * Toggle layer visibility
   * @param {'zones'|'vias'} layer
   * @param {boolean} visible
   */
  _toggleLayer(layer, visible) {
    if (!this._canvas) return;

    if (layer === 'zones') {
      // Toggle all graph-frame elements
      const frames = this._canvas.querySelectorAll('graph-frame');
      for (const frame of frames) {
        frame.style.display = visible ? '' : 'none';
      }
    } else if (layer === 'vias') {
      // Toggle dash styling on via connections
      // We use a data attribute on the canvas itself, CSS handles the rest
      if (visible) {
        this._canvas.removeAttribute('data-hide-vias');
      } else {
        this._canvas.setAttribute('data-hide-vias', '');
      }
    }
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
    // Try to find the file containing this symbol
    for (const [key, data] of Object.entries(this._skeleton.n || {})) {
      if (key === symbol && data.f) {
        this._focusFile(data.f);
        this._pulseFile(data.f);
        return;
      }
    }
  }

  /**
   * Highlight dependencies of a symbol with flow animation
   * @param {string} symbol
   */
  _highlightDeps(symbol) {
    if (!this._skeleton) return;
    const data = (this._skeleton.n || {})[symbol];
    if (!data?.f) return;

    // Focus + pulse the main file
    this._focusFile(data.f);
    this._pulseFile(data.f);

    // Highlight connections from this file
    const nodeId = this._fileMap.get(data.f);
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
    const fromData = (this._skeleton.n || {})[fromSymbol];
    const toData = (this._skeleton.n || {})[toSymbol];
    const fromFile = fromData?.f;
    const toFile = toData?.f;
    if (!fromFile || !toFile) return;

    const fromId = this._fileMap.get(fromFile);
    const toId = this._fileMap.get(toFile);
    if (!fromId || !toId) return;

    // Find shortest path via BFS on connection graph
    const adj = new Map();
    for (const conn of this._editor.getConnections()) {
      if (!adj.has(conn.from)) adj.set(conn.from, []);
      adj.get(conn.from).push({ to: conn.to, connId: conn.id });
    }

    const visited = new Set([fromId]);
    const queue = [[fromId, []]];
    let path = null;

    while (queue.length > 0) {
      const [current, connPath] = queue.shift();
      if (current === toId) {
        path = connPath;
        break;
      }
      for (const edge of (adj.get(current) || [])) {
        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          queue.push([edge.to, [...connPath, edge.connId]]);
        }
      }
    }

    if (!path || path.length === 0) return;

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