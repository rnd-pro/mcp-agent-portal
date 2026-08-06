/* eslint-env browser */
/* global document, requestAnimationFrame */
/**
 * NodeCanvas — main graph viewport (facade)
 *
 * Thin orchestration layer that delegates to:
 *  - NodeViewManager (node CRUD + group drag)
 *  - ConnectionRenderer (SVG paths + gradients + flow)
 *  - PseudoConnection (temp drag line)
 *  - ViewportActions (context menu + keyboard + fitView)
 *
 * @module symbiote-ui/canvas/NodeCanvas
 */

import Symbiote from '@symbiotejs/symbiote';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import { template } from './NodeCanvas.tpl.js';
import { styles } from './NodeCanvas.css.js';
import { Drag } from '../../interactions/Drag.js';
import { Zoom } from '../../interactions/Zoom.js';
import { ConnectFlow } from '../../interactions/ConnectFlow.js';
import { Selector } from '../../interactions/Selector.js';
import { SnapGrid } from '../../interactions/SnapGrid.js';
import { isNodeInMarquee, isEdgeIntersectingRect } from '../../interactions/SelectionGeometry.js';
import { applyTheme } from '../../themes/Theme.js';
import { ensureSystemCascade } from '../../themes/system-cascade.js';
import { applyPalette } from '../../themes/Palette.js';
import { applySkin } from '../../themes/Skin.js';
import { NodeViewManager } from '../NodeViewManager.js';
import { FrameManager } from '../FrameManager.js';
import { SelectionSync } from '../SelectionSync.js';
import { CanvasViewport } from '../CanvasViewport.js';
import {
  createFocusTransitionClock,
  resolveCanvasGraphTransitionDuration,
  resolveCanvasGraphTransitionProgress,
} from '../CanvasGraph/CanvasGraphViewport.js';
import { ConnectionRenderer } from '../ConnectionRenderer.js';
import { CanvasConnectionRenderer } from '../CanvasConnectionRenderer.js';
import { PseudoConnection } from '../PseudoConnection.js';
import { ViewportActions } from '../ViewportActions.js';
import { SubgraphManager } from '../SubgraphManager.js';
import { FlowSimulator } from '../FlowSimulator.js';
import '../../menu/ContextMenu/ContextMenu.js';
import '../../toolbar/QuickToolbar/QuickToolbar.js';
import '../../node/GraphFrame/GraphFrame.js';
import '../../inspector/InspectorPanel/InspectorPanel.js';
import '../Minimap/Minimap.js';
import '../NodeSearch/NodeSearch.js';
import '../Breadcrumb/Breadcrumb.js';
import { computeAutoLayout, computeTreeLayout } from '../AutoLayout.js';
import { computeCrystalLayout } from '../CrystalLayout.js';
import { NodeEditor } from '../../core/Editor.js';
import { translate } from '../../locale/index.js';

const FLOW_DIRECTIONS = new Set(['vertical', 'horizontal']);
const NODE_LAYOUT_ALGORITHMS = new Set(['auto', 'tree', 'flow', 'crystal']);

function toFiniteNumber(value, fallback) {
  let number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeFlowPadding(value) {
  if (typeof value === 'number') {
    return { top: value, right: value, bottom: value, left: value };
  }
  if (!value || typeof value !== 'object') {
    return { top: 24, right: 24, bottom: 24, left: 24 };
  }
  return {
    top: toFiniteNumber(value.top, 24),
    right: toFiniteNumber(value.right, 24),
    bottom: toFiniteNumber(value.bottom, 24),
    left: toFiniteNumber(value.left, 24),
  };
}

function clampFlowSize(value, min, max) {
  let next = value;
  if (Number.isFinite(min)) next = Math.max(min, next);
  if (Number.isFinite(max)) next = Math.min(max, next);
  return next;
}

const FLOW_MENU_GROUP = Object.freeze({
  group: 'motion',
  groupLabel: 'Motion',
  groupOrder: 15,
});

function baseFlowMenuActions({ running = false, flowing = false, hasConnections = false } = {}) {
  return [
    {
      id: 'flow:run',
      label: 'Play',
      icon: 'play_arrow',
      title: 'Play graph flow animation',
      disabled: !hasConnections || running,
      active: running,
      ...FLOW_MENU_GROUP,
    },
    {
      id: 'flow:stop',
      label: 'Stop',
      icon: 'stop',
      title: 'Stop graph flow animation',
      disabled: !hasConnections || (!running && !flowing),
      ...FLOW_MENU_GROUP,
    },
    {
      id: 'flow:toggle',
      label: 'Flow',
      icon: 'timeline',
      title: 'Toggle persistent connection flow',
      disabled: !hasConnections,
      active: flowing,
      ...FLOW_MENU_GROUP,
    },
  ];
}

export class NodeCanvas extends Symbiote {
  static observedAttributes = ['presentation'];

  init$ = {
    zoom: 1,
    panX: 0,
    panY: 0,
    chrome: true,
    minimapToggleTitle: translate('nodeCanvas.toggleMinimap'),
    '+contentTransform': () =>
      `translate(${this.$.panX}px, ${this.$.panY}px) scale(${this.$.zoom})`,
    presentation: false,
  };

  /** @type {import('../../core/Editor.js').NodeEditor|null} */
  _editor = null;

  /** @type {Drag|null} */
  _drag = null;

  /** @type {Zoom|null} */
  _zoom = null;

  /** @type {ConnectFlow|null} */
  _connectFlow = null;

  /** @type {Map<string, HTMLElement>} */
  _nodeViews = new Map();

  /** @type {SelectionSync} */
  _selectionSync = new SelectionSync({
    canvas: this,
    getEditor: () => this._editor,
    nodeViews: this._nodeViews,
    getConnRenderer: () => this._connRenderer,
  });

  /** @type {Selector} */
  _selector = new Selector({
    onChange: (nodes, connections) => this._selectionSync.sync(nodes, connections),
  });

  /** @type {SnapGrid} */
  _snapGrid = new SnapGrid({ size: 16, dynamic: false });

  /** @type {FrameManager|null} */
  _frameManager = null;

  /** @type {boolean} */
  _readonly = false;

  /** @type {boolean} */
  _readonlyNodeDragging = false;

  /** @type {boolean} */
  _viewportLocked = false;

  /** @type {boolean} */
  _panelsEnabled = true;

  /** @type {boolean} */
  _snapEnabled = false;

  /** @type {boolean} */
  _nodeDragActive = false;

  /** @type {Set<string>} */
  _pendingConnectionNodeIds = new Set();

  /** @type {ResizeObserver|null} */
  _nodeResizeObserver = null;

  /** @type {Map<string, { width: number, height: number }>} */
  _nodeSizeCache = new Map();

  /** @type {Set<string>} */
  _suppressedResizeNodeIds = new Set();

  /** @type {number} */
  _suppressedResizeFlushTimer = 0;

  /** @type {number} */
  _connectionUpdateFrame = 0;

  /** @type {number} */
  _connectionUpdateTimer = 0;

  /** @type {number} */
  _connectionSettleFrame = 0;

  /** @type {number} */
  _connectionSettlePasses = 0;

  /** @type {number} */
  _lastConnectionUpdateTime = 0;

  /** @type {number} */
  _dragConnectionUpdateInterval = 33;

  /** @type {number} */
  _nodeDragReleaseFrame = 0;

  /** @type {string[]} */
  _nodeDragConnectionIds = [];

  /** @type {string} */
  _nodeDragId = '';

  /** @type {number|null} */
  _panAnimFrame = null;

  /** @type {string} */
  _themeName = 'default-provider';

  /** @type {NodeViewManager|null} */
  _viewManager = null;

  /** @type {import('../ConnectionRenderer.js').ConnectionRenderer | import('../CanvasConnectionRenderer.js').CanvasConnectionRenderer | null} */
  _connRenderer = null;

  /** @type {PseudoConnection|null} */
  _pseudo = null;

  /** @type {ViewportActions|null} */
  _actions = null;

  /** @type {'bezier'|'orthogonal'|'straight'|'pcb'} saved across setEditor calls */
  _pathStyle = 'bezier';

  /** @type {Map<string, { style: 'bezier'|'orthogonal'|'straight'|'pcb'|'pcb-drag-proxy', connectionIds: Iterable<string>|null, draggedNodeId?: string }>} */
  _transientPathStyleRequests = new Map();

  /** @type {Set<string>} */
  _progressiveConnectionSuspensions = new Set();

  /** @type {''|'bezier'|'orthogonal'|'straight'|'pcb'|'pcb-drag-proxy'} */
  _activeTransientPathStyle = '';

  /** @type {Object|null} */
  _flowLayout = null;

  /** @type {CanvasViewport|null} */
  _viewport = null;

  /** @type {SubgraphManager} */
  _subgraphManager = new SubgraphManager();

  /** @type {FlowSimulator|null} */
  _flowSimulator = null;

  /** @type {boolean} */
  _allConnectionsFlowing = false;

  /** @type {boolean} - guard to prevent setEditor re-init during navigation */
  _navigating = false;

  /** @type {number} */
  _lastClickTime = 0;

  /** @type {string|null} */
  _lastClickNodeId = null;

  /** @type {boolean} */
  _layoutSuspended = false;

  /** @type {string} */
  _layoutSuspendReason = '';

  /** @type {string} */
  _lastFocusTransitionNodeId = '';

  /** @type {number} */
  _focusTransitionTimer = 0;

  /** @type {number} */
  _focusTransitionCleanupTimer = 0;

  /** @type {number} */
  _focusTransitionFrame = 0;

  /** @type {Object|null} */
  _activeFocusTransitionOptions = null;

  /** @type {Object|null} */
  _activeFocusTransitionMarkerState = null;


  /**
   * Clear all existing node, connection, and frame views from the DOM.
   * Called before switching to a new editor to ensure clean state.
   */
  _clearViews() {
    this._clearScheduledConnectionUpdates();
    this._disconnectNodeResizeObserver();

    for (const [, el] of this._nodeViews) {
      if (el._previewRaf) {
        clearTimeout(el._previewRaf);
        el._previewRaf = null;
      }
      if (el._drag) el._drag.destroy();
      el._redrawPreview = null;
      el.remove();
    }
    this._nodeViews.clear();
    if (this._viewport) this._viewport.clear();
    this._lastFocusTransitionNodeId = '';
    this._hideFocusTransitionMarker();


    if (this._editor) {
      this._editor.removeAllListeners?.();
    }


    if (this._connRenderer) {
      let conns = [...this._connRenderer.data.values()];
      for (const conn of conns) {
        this._connRenderer.remove(conn);
      }
    }


    if (this._frameManager) {
      this._frameManager.clear();
    }


    if (this._selector) this._selector.unselectAll();
  }

  /**
   * Bind editor to canvas
   * @param {import('../../core/Editor.js').NodeEditor} editor
   * @returns {void}
   */
  setEditor(editor) {

    this._clearViews();
    this._stopFlowAnimation({ emit: false });

    this._editor = editor;

    let engineMode = this.getAttribute('connection-engine') || 'svg';

    if (engineMode === 'canvas') {
      this._connRenderer = new CanvasConnectionRenderer({
        canvasLayer: this.ref.connCanvas,
        dotLayer: this.ref.pseudoSvg,
        nodeViews: this._nodeViews,
        editor,
        onConnectionClick: (connId, e) => this._handleConnectionClick(connId, e),
        getZoom: () => this.$.zoom,
        getPan: () => ({ x: this.$.panX, y: this.$.panY }),
        onDotDrag: (socketData) => {
          if (this._connectFlow && !this._readonly) {
            this._connectFlow.pickSocket(socketData);
          }
        },
      });
    } else {
      this._connRenderer = new ConnectionRenderer({
        svgLayer: this.ref.connections,
        dotLayer: this.ref.pseudoSvg,
        nodeViews: this._nodeViews,
        editor,
        onConnectionClick: (connId, e) => this._handleConnectionClick(connId, e),
        getZoom: () => this.$.zoom,
        onDotDrag: (socketData) => {
          if (this._connectFlow && !this._readonly) {
            let existingConns = [];
            if (socketData.side === 'input') {
              existingConns = editor.getConnections().filter(
                (c) => c.to === socketData.nodeId && c.in === socketData.key
              );
            } else {
              existingConns = editor.getConnections().filter(
                (c) => c.from === socketData.nodeId && c.out === socketData.key
              );
            }

            if (existingConns.length > 0) {
              let conn = existingConns[0];
              let event = new CustomEvent('sn-connection-reconnect', {
                detail: {
                  connectionId: conn.id,
                  connection: conn,
                  draggedSide: socketData.side,
                  nodeId: socketData.nodeId,
                  key: socketData.key,
                },
                cancelable: true,
                bubbles: true,
              });
              this.dispatchEvent(event);
              if (event.defaultPrevented) return;

              editor.removeConnection(conn.id);

              if (socketData.side === 'input') {
                let sourceEl = this.getNodeView(conn.from);
                let sourceSocketEl = sourceEl?.querySelector(`.sn-socket[data-key="${conn.out}"]`);
                this._connectFlow.pickSocket({
                  nodeId: conn.from,
                  key: conn.out,
                  side: 'output',
                  element: sourceSocketEl,
                });
              } else {
                let targetEl = this.getNodeView(conn.to);
                let targetSocketEl = targetEl?.querySelector(`.sn-socket[data-key="${conn.in}"]`);
                this._connectFlow.pickSocket({
                  nodeId: conn.to,
                  key: conn.in,
                  side: 'input',
                  element: targetSocketEl,
                });
              }
              return;
            }

            this._connectFlow.pickSocket(socketData);
          }
        },
      });
    }

    if (this._pathStyle !== 'bezier') {
      this._connRenderer.setPathStyle(this._pathStyle);
    }
    for (const [source, request] of this._transientPathStyleRequests) {
      this._connRenderer.setTransientPathStyle?.(request.style, {
        source,
        connectionIds: request.connectionIds,
        draggedNodeId: request.draggedNodeId,
      });
    }
    for (const source of this._progressiveConnectionSuspensions) {
      this._connRenderer.suspendProgressiveRendering?.(source);
    }

    this._pseudo = new PseudoConnection(this.ref.pseudoSvg);

    this._actions = new ViewportActions({
      editor,
      selector: this._selector,
      nodeViews: this._nodeViews,
      canvas: this,
    });


    let toolbar = this.ref.quickToolbar;
    if (toolbar) {
      let actionMap = {
        delete: (nodeId) => {
          this._actions.deleteNode(nodeId);
          toolbar.hide();
        },
        duplicate: (nodeId) => {
          this._actions.cloneNode(nodeId);
        },
        enter: (nodeId) => {
          this.drillDown(nodeId);
          toolbar.hide();
        },
        mute: (nodeId) => {
          this._actions.muteNode(nodeId);
          let nodeEl = this._nodeViews.get(nodeId);
          if (nodeEl) toolbar.show(nodeId, nodeEl, { sticky: true });
        },
      };
      toolbar._onAction = (action, nodeId) => {
        let handler = actionMap[action];
        if (handler) {
          handler(nodeId);
        } else {

          this.dispatchEvent(
            new CustomEvent('toolbar-action', {
              detail: { action, nodeId },
              bubbles: true,
            })
          );
          toolbar.hide();
        }
      };
    }

    this._viewManager = new NodeViewManager({
      nodeViews: this._nodeViews,
      editor,
      selector: this._selector,
      snapGrid: this._snapGrid,
      getZoom: () => this.$.zoom,
      setNodePosition: (id, x, y) => this.setNodePosition(id, x, y),
      animateNodeToPosition: (id, x, y) => this.animateNodeToPosition(id, x, y),
      onNodeClick: (id, e) => this._handleNodeClick(id, e),
      onNodePointerEnter: (id, el) => this._handleNodePointerEnter(id, el),
      onNodePointerLeave: (id) => this._handleNodePointerLeave(id),
      onNodeDragStart: (id, el, e) => this._handleNodeDragStart(id, el, e),
      onNodeDragEnd: (id, el, e) => this._handleNodeDragEnd(id, el, e),
      nodesLayer: this.ref.nodesLayer,
      canvas: this,
      onSvgShapeReady: (nodeId) => this._connRenderer?.prewarmNodes?.([nodeId]),
      onNodeViewReady: (nodeId, el) => this._observeNodeSize(nodeId, el),
      onNodeViewRemoved: (nodeId, el) => this._unobserveNodeSize(nodeId, el),
    });
    this._viewManager.setReadonly(this._readonly);
    this._viewManager.setReadonlyNodeDragging(this._readonlyNodeDragging);

    this._frameManager = new FrameManager({
      nodeViews: this._nodeViews,
      editor,
      canvas: this,
      setNodePosition: (id, x, y) => this.setNodePosition(id, x, y),
    });

    this._viewport = new CanvasViewport({
      canvas: this,
      nodeViews: this._nodeViews,
      viewManager: this._viewManager,
      getConnRenderer: () => this._connRenderer,
    });


    this._connectFlow = new ConnectFlow(editor, {
      getNodePosition: (id) => {
        let el = this._nodeViews.get(id);
        return el?._position || { x: 0, y: 0 };
      },
      getNodeSize: (id) => {
        let el = this._nodeViews.get(id);
        return { width: el?.offsetWidth || 180, height: el?.offsetHeight || 60 };
      },
      getTransform: () => ({
        k: this.$.zoom,
        x: this.$.panX,
        y: this.$.panY,
        rect: this.ref.canvasContainer.getBoundingClientRect(),
      }),
      onPseudoStart: (sx, sy, socketData) => {
        this._actions.highlightCompatibleSockets(socketData, this.ref.nodesLayer);
      },
      onPseudoMove: (sx, sy, ex, ey) => {
        this._pseudo.show(sx, sy, ex, ey);
      },
      onPseudoEnd: () => {
        this._pseudo.hide();
        this._actions.clearSocketHighlights(this.ref.nodesLayer);
        this._actions.clearPortHints();
        this._connRenderer?.clearDotHighlights();
      },
      onCompatibleMove: (worldX, worldY, socketData) => {

        let compatibleIds = this._actions.getCompatibleNodeIds(socketData);
        this._connRenderer?.highlightDotsForNodes(compatibleIds);
      },

      onDropEmpty: (x, y, socketData) => {
        this._actions.handleDropEmpty(x, y, socketData);

        let rect = this.ref.canvasContainer.getBoundingClientRect();
        let menuX = rect.left + x * this.$.zoom + this.$.panX;
        let menuY = rect.top + y * this.$.zoom + this.$.panY;
        this.ref.contextMenu?.show(menuX, menuY, [
          {
            label: translate('nodeCanvas.addNode'),
            icon: 'add_box',
            action: () => this._editor?.emit('contextadd', { x, y }),
          },
        ], this.ref.canvasContainer);
      },
      findNearestDot: (wx, wy) => this._connRenderer?.findNearestDot(wx, wy),
    });


    editor.on('nodecreated', (node) => this._viewport.handleNodeCreated(node));
    editor.on('noderemoved', (node) => {
      this._viewManager.removeView(node);

      for (const [, conn] of this._connRenderer.data) {
        if (conn.from === node.id || conn.to === node.id) {
          this._connRenderer.remove(conn);
        }
      }
      this.refreshFlowLayout();
    });
    editor.on('connectioncreated', (conn) => {
      this._connRenderer.add(conn);
      this._emitPanelMenuActions();
      this._scheduleConnectionSettleRefresh(2);
    });
    editor.on('connectionremoved', (conn) => {
      this._connRenderer.remove(conn);
      this._selector.deselectConnection(conn.id);
      this._emitPanelMenuActions();
    });


    let refreshNodeConnections = ({ nodeId }) => {
      requestAnimationFrame(() => this._connRenderer?.updateForNode(nodeId));
    };
    editor.on('nodecollapse', refreshNodeConnections);
    editor.on('nodemute', refreshNodeConnections);


    this._viewport.initializeData(editor);


    this._connRenderer.setBatchMode?.(true);
    let allConns = editor.getConnections();
    this._connRenderer.addBatch(allConns);
    this._viewport.syncPhantom();
    this._connRenderer.setBatchMode?.(false);


    editor.on('framecreated', (frame) => this._frameManager.addView(frame));
    editor.on('frameremoved', (frame) => this._frameManager.removeView(frame));


    editor.on('nodemovetopos', ({ nodeId, x, y }) => {
      this.setNodePosition(nodeId, x, y);
    });


    for (const frame of editor.getFrames()) {
      this._frameManager.addView(frame);
    }


    if (!this._navigating) {
      this._subgraphManager.initialize(this, editor);
      let breadcrumb = this.ref.breadcrumb;
      if (breadcrumb) {
        this._subgraphManager.onNavigate((path) => {
          breadcrumb.setPath(path);
        });
        breadcrumb.onNavigate((level) => {
          this.drillUp(level);
        });
      }
    }

    this._emitPanelMenuActions();
    this._scheduleConnectionSettleRefresh(3);
  }

  /** @returns {ConnectFlow|null} */
  getConnectFlow() {
    return this._connectFlow;
  }

  /**
   * Enable/disable snap to grid
   * @param {boolean} enabled
   * @param {number} [size]
   */
  setSnapGrid(enabled, size) {
    this._snapEnabled = enabled;
    if (size) this._snapGrid.setSize(size);
    this._viewManager?.setSnapEnabled(enabled);
  }

  get presentation() {
    return this.connectedOnce ? this.$.presentation : this.init$.presentation;
  }

  set presentation(val) {
    const boolVal = !!val;
    if (this.connectedOnce) {
      this.$.presentation = boolVal;
    } else {
      this.init$.presentation = boolVal;
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'presentation') {
      this.presentation = newValue !== null;
    } else {
      super.attributeChangedCallback?.(name, oldValue, newValue);
    }
  }

  setPresentationMode(enabled) {
    this.setReadonly(enabled);
    this.setChrome(!enabled);
    this.setPanels(!enabled);
    this.setViewportLocked(enabled);
  }

  /**
   * Enable/disable readonly mode
   * @param {boolean} enabled
   */
  setReadonly(enabled) {
    this._readonly = enabled;
    this.toggleAttribute('data-readonly', enabled);
    this._viewManager?.setReadonly(enabled);
    this._actions?.setReadonly(enabled);
  }

  /**
   * Allow graph nodes to move while the canvas remains readonly.
   * @param {boolean} enabled
   */
  setReadonlyNodeDragging(enabled) {
    this._readonlyNodeDragging = enabled;
    this.toggleAttribute('data-readonly-node-dragging', enabled);
    this._viewManager?.setReadonlyNodeDragging(enabled);
  }

  /**
   * Enable or remove viewport controls, context menu, and node toolbar.
   * @param {boolean} enabled
   */
  setChrome(enabled) {
    this.$.chrome = enabled;
    this.toggleAttribute('data-chrome-none', !enabled);
    if (!enabled) {
      this.ref.quickToolbar?.hide?.();
      if (this.ref.minimap) this.ref.minimap.hidden = true;
      if (this.ref.nodeSearch) this.ref.nodeSearch.hidden = true;
      if (this.ref.breadcrumb) this.ref.breadcrumb.hidden = true;
      if (this.ref.contextMenu) this.ref.contextMenu.hidden = true;
      if (this.ref.inspector) this.ref.inspector.hidden = true;
    }
  }

  /**
   * Enable or remove canvas side panels while keeping node menus available.
   * @param {boolean} enabled
   */
  setPanels(enabled) {
    this._panelsEnabled = enabled;
    this.toggleAttribute('data-panels-none', !enabled);
    if (!enabled) {
      if (this.ref.minimap) this.ref.minimap.hidden = true;
      if (this.ref.nodeSearch) this.ref.nodeSearch.hidden = true;
      if (this.ref.breadcrumb) this.ref.breadcrumb.hidden = true;
      if (this.ref.inspector) this.ref.inspector.hidden = true;
    }
  }

  /**
   * Lock viewport pan and zoom while keeping graph rendering active.
   * @param {boolean} locked
   */
  setViewportLocked(locked) {
    this._viewportLocked = locked;
    this.toggleAttribute('data-viewport-locked', locked);
  }

  /**
   * Enable/disable compact mode (hides node body: ports & controls).
   * Use this for schematic/PCB views where nodes show only labels.
   * This is a structural setting — independent of visual theme.
   * @param {boolean} enabled
   */
  setCompactMode(enabled) {
    this.toggleAttribute('data-compact', enabled);
  }

  /**
   * Apply a theme to the canvas
   * @param {import('../../themes/Theme.js').ThemeDefinition} theme
   */
  setTheme(theme) {
    applyTheme(this, theme);
    this._themeName = theme.name;
  }

  /**
   * Apply only color palette
   * @param {import('../../themes/Palette.js').PaletteDefinition} palette
   */
  setPalette(palette) {
    applyPalette(this, palette);
  }

  /**
   * Apply only geometry skin
   * @param {import('../../themes/Skin.js').SkinDefinition} skin
   */
  setSkin(skin) {
    applySkin(this, skin);
  }

  /** @returns {string} */
  getThemeName() {
    return this._themeName;
  }

  /**
   * Set data flow animation on a connection
   * @param {string} connId
   * @param {boolean} active
   */
  setFlowing(connId, active) {
    this._connRenderer?.setFlowing(connId, active);
  }

  /**
   * Set data flow animation on all connections
   * @param {boolean} active
   */
  setAllFlowing(active) {
    this._connRenderer?.setAllFlowing(active);
    this._allConnectionsFlowing = Boolean(active);
    this._emitPanelMenuActions();
  }

  /**
   * Set connection path style (persists across setEditor/drill-down)
   * @param {'bezier'|'orthogonal'|'straight'|'pcb'} style
   */
  setPathStyle(style) {
    this._pathStyle = style;
    this._connRenderer?.setPathStyle(style);
  }

  /**
   * Temporarily override connection rendering while preserving the selected path style.
   * @param {''|'bezier'|'orthogonal'|'straight'|'pcb'|'pcb-drag-proxy'} style
   * @param {string} [source]
   */
  setTransientPathStyle(style = '', source = 'default', options = {}) {
    if (style) {
      this._transientPathStyleRequests.set(source, {
        style,
        connectionIds: options.connectionIds || null,
        draggedNodeId: options.draggedNodeId,
      });
    } else {
      this._transientPathStyleRequests.delete(source);
    }
    let nextStyle = [...this._transientPathStyleRequests.values()].pop()?.style || '';
    let connectionIds = options.connectionIds;
    this._activeTransientPathStyle = nextStyle;
    this._connRenderer?.setTransientPathStyle?.(style, {
      source,
      connectionIds,
      draggedNodeId: options.draggedNodeId,
      freezeLayer: options.freezeLayer,
      reuseFrozenPaths: options.reuseFrozenPaths,
      suspendProgressivePcb: options.suspendProgressivePcb,
    });
  }

  /**
   * @param {boolean} [enabled]
   * @param {string} [source]
   */
  setProgressiveConnectionRendering(enabled = true, source = 'default') {
    if (enabled) {
      this._progressiveConnectionSuspensions.delete(source);
      this._connRenderer?.resumeProgressiveRendering?.(source);
    } else {
      this._progressiveConnectionSuspensions.add(source);
      this._connRenderer?.suspendProgressiveRendering?.(source);
    }
  }

  /** @returns {'bezier'|'orthogonal'|'straight'|'pcb'} */
  getPathStyle() {
    return this._pathStyle;
  }

  _getSingleSelectedNodeId() {
    let selected = this._selector?.getSelectedNodes?.();
    if (selected?.size === 1) return [...selected][0];
    for (const [id, el] of this._nodeViews) {
      if (el?.hasAttribute?.('data-selected')) return id;
    }
    return this._lastFocusTransitionNodeId || '';
  }

  _getNodeViewportCenter(nodeId) {
    let el = this._nodeViews.get(nodeId);
    let container = this.ref?.canvasContainer;
    if (!el || !container) return null;
    let nodeRect = el.getBoundingClientRect();
    let containerRect = container.getBoundingClientRect();
    if (nodeRect.width <= 0 || nodeRect.height <= 0) return null;
    return {
      x: nodeRect.left - containerRect.left + nodeRect.width / 2,
      y: nodeRect.top - containerRect.top + nodeRect.height / 2,
    };
  }

  _getNodeGraphCenter(nodeId) {
    let el = this._nodeViews.get(nodeId);
    if (!el?._position) return null;
    let width = el._cachedW || el.offsetWidth || 150;
    let height = el._cachedH || el.offsetHeight || 40;
    return {
      x: el._position.x + width / 2,
      y: el._position.y + height / 2,
    };
  }

  _getNodeGraphBounds(nodeId) {
    let el = this._nodeViews.get(nodeId);
    if (!el?._position) return null;
    let width = el._cachedW || el.offsetWidth || 150;
    let height = el._cachedH || el.offsetHeight || 40;
    return {
      minX: el._position.x,
      minY: el._position.y,
      maxX: el._position.x + width,
      maxY: el._position.y + height,
    };
  }

  _getFocusTransitionBounds(nodeIds, routePoints = null) {
    let bounds = (nodeIds || [])
      .map((nodeId) => this._getNodeGraphBounds(nodeId))
      .filter(Boolean);
    if (Array.isArray(routePoints)) {
      let routeBounds = this._getRouteGraphBounds(routePoints);
      if (routeBounds) bounds.push(routeBounds);
    }
    if (!bounds.length) return null;
    return bounds.reduce((acc, item) => ({
      minX: Math.min(acc.minX, item.minX),
      minY: Math.min(acc.minY, item.minY),
      maxX: Math.max(acc.maxX, item.maxX),
      maxY: Math.max(acc.maxY, item.maxY),
    }));
  }

  _getRouteGraphBounds(routePoints) {
    let points = routePoints
      .map((point) => ({
        x: Number(point?.x),
        y: Number(point?.y),
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (!points.length) return null;
    return points.reduce((acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxX: Math.max(acc.maxX, point.x),
      maxY: Math.max(acc.maxY, point.y),
    }), {
      minX: points[0].x,
      minY: points[0].y,
      maxX: points[0].x,
      maxY: points[0].y,
    });
  }

  _graphPointToViewport(point) {
    return {
      x: point.x * this.$.zoom + this.$.panX,
      y: point.y * this.$.zoom + this.$.panY,
    };
  }

  _routeLength(points) {
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    return length;
  }

  _pointAtRouteProgress(points, progress) {
    if (!points?.length) return null;
    if (points.length === 1) return points[0];
    let total = this._routeLength(points);
    if (!Number.isFinite(total) || total <= 0) return points.at(-1);
    let target = Math.max(0, Math.min(1, progress)) * total;
    let walked = 0;
    for (let i = 1; i < points.length; i++) {
      let start = points[i - 1];
      let end = points[i];
      let segment = Math.hypot(end.x - start.x, end.y - start.y);
      if (segment <= 0) continue;
      if (walked + segment >= target) {
        let local = (target - walked) / segment;
        return {
          x: start.x + (end.x - start.x) * local,
          y: start.y + (end.y - start.y) * local,
        };
      }
      walked += segment;
    }
    return points.at(-1);
  }

  _prepareFocusTransition(targetNodeId, options = {}) {
    let target = String(targetNodeId || '');
    if (!target) return null;
    this._viewport?.ensureNodeView?.(target);
    if (!this._nodeViews.has(target)) return null;
    let fromId = this._getSingleSelectedNodeId();
    return this._prepareFocusTransitionFromIds(fromId, target, options);
  }

  _prepareFocusTransitionFromIds(fromNodeId, targetNodeId, options = {}) {
    if (options.transition === false || options.marker === false) return null;
    let fromId = String(fromNodeId || '');
    let target = String(targetNodeId || '');
    if (!fromId || !target || fromId === target) return null;
    this._viewport?.ensureNodeView?.(fromId);
    this._viewport?.ensureNodeView?.(target);
    if (!this._nodeViews.has(fromId) || !this._nodeViews.has(target)) return null;
    let fromCenter = this._getNodeViewportCenter(fromId);
    let graphFrom = this._getNodeGraphCenter(fromId);
    let graphTo = this._getNodeGraphCenter(target);
    let route = this._connRenderer?.getRouteBetweenNodes?.(fromId, target) || null;
    let routePoints = route?.points || null;
    let routeNodeIds = route?.nodeIds?.length ? route.nodeIds : [fromId, target];
    let protectedNodeIds = this._viewport?.prewarmFocusNodes?.({
      nodeIds: routeNodeIds,
    }) || routeNodeIds;
    if (!routePoints?.length) {
      if (graphFrom && graphTo) routePoints = [graphFrom, graphTo];
    } else {
      routePoints = [...routePoints];
    }
    let focusBounds = this._getFocusTransitionBounds(routeNodeIds, routePoints);
    if (!fromCenter && !routePoints?.length) return null;
    return {
      fromId,
      target,
      fromCenter,
      routePoints,
      routeNodeIds,
      routeConnectionIds: route?.connectionIds || [],
      protectedNodeIds,
      focusBounds,
    };
  }

  _resolveFocusTransitionMs(prepared, options = {}) {
    let styles = typeof getComputedStyle === 'function' ? getComputedStyle(this) : null;
    let routeDistance = prepared?.routePoints?.length >= 2
      ? this._routeLength(prepared.routePoints)
      : 0;
    let motionScale = Number(styles?.getPropertyValue('--sn-theme-motion-scale'));
    let reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    return resolveCanvasGraphTransitionDuration({
      transitionMs: options.transitionMs,
      duration: options.duration,
      transitionMarkerMs: options.transitionMarkerMs,
      routeDistance,
      distanceScale: Number.isFinite(this.$?.zoom) ? this.$.zoom : 1,
      speed: options.transitionSpeed,
      minMs: options.transitionMinMs,
      maxMs: options.transitionMaxMs,
      motionScale,
      disabled: options.transition === false
        || options.animate === false
        || styles?.getPropertyValue('--sn-motion-enabled').trim() === '0'
        || reducedMotion,
    });
  }

  _normalizeFocusTransitionOptions(prepared, options = {}) {
    if (!prepared?.routePoints?.length) return options;
    let transitionMs = this._resolveFocusTransitionMs(prepared, options);
    let routeStart = Number.isFinite(options.transitionRouteStart)
      ? Math.max(0, Math.min(0.9, options.transitionRouteStart))
      : 0;
    let routeEnd = Number.isFinite(options.transitionRouteEnd)
      ? Math.max(routeStart + 0.05, Math.min(1, options.transitionRouteEnd))
      : 1;
    let protectedNodeIds = prepared.protectedNodeIds || prepared.routeNodeIds;

    return {
      ...options,
      transitionMs,
      transitionMarkerMs: transitionMs,
      transitionClock: createFocusTransitionClock(options.transitionStartTime),
      transitionRouteStart: routeStart,
      transitionRouteEnd: routeEnd,
      viewportRoutePoints: prepared.routePoints,
      viewportRouteConnectionIds: prepared.routeConnectionIds,
      viewportRouteFitBounds: prepared.focusBounds,
      viewportRouteFitPadding: options.transitionFitPadding ?? options.viewportRouteFitPadding ?? 128,
      viewportProtectedNodeIds: protectedNodeIds,
      viewportTargetNodeId: prepared.target,
    };
  }

  _hideFocusTransitionMarker() {
    if (this._focusTransitionTimer) {
      clearTimeout(this._focusTransitionTimer);
      this._focusTransitionTimer = 0;
    }
    if (this._focusTransitionCleanupTimer) {
      clearTimeout(this._focusTransitionCleanupTimer);
      this._focusTransitionCleanupTimer = 0;
    }
    if (this._focusTransitionFrame && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._focusTransitionFrame);
      this._focusTransitionFrame = 0;
    }
    this._activeFocusTransitionMarkerState = null;
    let marker = this.ref?.focusTransitionMarker;
    if (!marker) return;
    marker.getAnimations?.().forEach((animation) => animation.cancel());
    marker.style.transition = '';
    marker.style.opacity = '0';
    marker.style.transform = '';
  }

  _renderFocusTransitionMarker(now) {
    let state = this._activeFocusTransitionMarkerState;
    let marker = this.ref?.focusTransitionMarker;
    if (!state || !marker) return 1;

    let { duration, clock, routePoints, target, start, options } = state;
    let startedAt = clock.resolveStart(now);
    let elapsed = now - startedAt;
    let progress = Math.max(0, Math.min(1, elapsed / duration));
    let ease = 1 - Math.pow(1 - progress, 3);
    let viewportPoint;
    if (routePoints) {
      let routeStart = Number.isFinite(options.transitionRouteStart) ? options.transitionRouteStart : 0;
      let routeEnd = Number.isFinite(options.transitionRouteEnd) ? options.transitionRouteEnd : 1;
      let routeProgress = routeEnd > routeStart
        ? Math.max(0, Math.min(1, (progress - routeStart) / (routeEnd - routeStart)))
        : ease;
      let routeEase = resolveCanvasGraphTransitionProgress(routeProgress);
      viewportPoint = this._graphPointToViewport(this._pointAtRouteProgress(routePoints, routeEase));
    } else {
      let end = this._getNodeViewportCenter(target);
      if (!end || !start) return progress;
      viewportPoint = {
        x: start.x + (end.x - start.x) * ease,
        y: start.y + (end.y - start.y) * ease,
      };
    }
    marker.style.transform = `translate3d(${viewportPoint.x}px, ${viewportPoint.y}px, 0) scale(0.82)`;
    return progress;
  }

  _refreshFocusTransitionMarker() {
    if (!this._activeFocusTransitionMarkerState) return;
    let now = typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
    this._renderFocusTransitionMarker(now);
  }

  _runFocusTransition(targetNodeId, prepared, options = {}) {
    let target = String(targetNodeId || '');
    if (!target) return;
    this._lastFocusTransitionNodeId = target;
    if (!prepared?.fromCenter && !prepared?.routePoints?.length) return;

    let marker = this.ref?.focusTransitionMarker;
    if (!marker) return;

    let duration = Number.isFinite(options.transitionMarkerMs)
      ? Math.max(0, options.transitionMarkerMs)
      : 680;
    if (!duration) {
      this._hideFocusTransitionMarker();
      return;
    }
    let start = prepared.fromCenter;

    let routePoints = prepared.routePoints?.length >= 2 ? prepared.routePoints : null;
    let clock = options.transitionClock || createFocusTransitionClock(options.transitionStartTime);

    this._hideFocusTransitionMarker();
    this._activeFocusTransitionMarkerState = {
      duration,
      clock,
      routePoints,
      target,
      start,
      options,
    };
    marker.style.transition = 'opacity 160ms ease';
    marker.style.opacity = '1';

    let render = (now) => {
      let progress = this._renderFocusTransitionMarker(now);

      if (progress < 1) {
        this._focusTransitionFrame = requestAnimationFrame(render);
        return;
      }

      this._focusTransitionFrame = 0;
      this._focusTransitionTimer = setTimeout(() => {
        marker.style.transition = `opacity ${Math.max(160, duration * 0.38)}ms ease`;
        marker.style.opacity = '0';
        this._focusTransitionTimer = 0;
        this._focusTransitionCleanupTimer = setTimeout(() => {
          marker.style.transition = '';
          this._activeFocusTransitionMarkerState = null;
          this._focusTransitionCleanupTimer = 0;
        }, Math.max(180, duration * 0.4));
      }, 80);
    };

    this._focusTransitionFrame = requestAnimationFrame(render);
  }

  /**
   * Programmatically select a node by ID
   * @param {string} nodeId
   */
  selectNode(nodeId) {
    let options = this._activeFocusTransitionOptions || {};
    let prepared = this._prepareFocusTransition(nodeId, options);
    this._selector?.selectNode(nodeId);
    this._runFocusTransition(nodeId, prepared, options);
  }

  /**
   * Clear all connector caches and re-render.
   * Call after initial node positioning to settle SVG connectors.
   */
  refreshConnections() {
    this._connRenderer?.refreshAll();
  }

  _settleConnectionsAfterViewport(_passes = 3) {
    this._connRenderer?.refreshViewportTransform?.();
  }

  _readNodeElementSize(el, entry = null) {
    let borderBox = Array.isArray(entry?.borderBoxSize) ? entry.borderBoxSize[0] : entry?.borderBoxSize;
    let width = borderBox?.inlineSize || entry?.contentRect?.width || el?.offsetWidth || el?._cachedW || 0;
    let height = borderBox?.blockSize || entry?.contentRect?.height || el?.offsetHeight || el?._cachedH || 0;
    return { width, height };
  }

  _cacheNodeElementSize(nodeId, el, size) {
    this._nodeSizeCache.set(nodeId, size);
    if (size.width > 0) el._cachedW = size.width;
    if (size.height > 0) el._cachedH = size.height;
  }

  _ensureNodeResizeObserver() {
    if (this._nodeResizeObserver || typeof ResizeObserver !== 'function') return this._nodeResizeObserver;
    this._nodeResizeObserver = new ResizeObserver((entries) => this._handleNodeResizeEntries(entries));
    return this._nodeResizeObserver;
  }

  _observeNodeSize(nodeId, el) {
    if (!nodeId || !el) return;
    let observer = this._ensureNodeResizeObserver();
    let id = String(nodeId);
    this._cacheNodeElementSize(id, el, this._readNodeElementSize(el));
    observer?.observe(el);
  }

  _unobserveNodeSize(nodeId, el) {
    if (el) this._nodeResizeObserver?.unobserve(el);
    if (nodeId) this._nodeSizeCache.delete(String(nodeId));
  }

  _disconnectNodeResizeObserver() {
    this._nodeResizeObserver?.disconnect();
    this._nodeResizeObserver = null;
    this._nodeSizeCache.clear();
    this._clearSuppressedNodeResizeUpdates();
  }

  _clearSuppressedNodeResizeUpdates() {
    if (this._suppressedResizeFlushTimer) {
      clearTimeout(this._suppressedResizeFlushTimer);
      this._suppressedResizeFlushTimer = 0;
    }
    this._suppressedResizeNodeIds.clear();
  }

  _flushSuppressedNodeResizeUpdates() {
    if (this._suppressedResizeFlushTimer) {
      clearTimeout(this._suppressedResizeFlushTimer);
      this._suppressedResizeFlushTimer = 0;
    }
    let nodeIds = [...this._suppressedResizeNodeIds];
    this._suppressedResizeNodeIds.clear();
    for (const nodeId of nodeIds) this._scheduleConnectionUpdate(nodeId);
    return nodeIds;
  }

  _queueSuppressedNodeResizeUpdate(nodeId, now) {
    this._suppressedResizeNodeIds.add(nodeId);
    let suppressUntil = this._viewportResizeSettleSuppressUntil || 0;
    if (!Number.isFinite(suppressUntil) || this._suppressedResizeFlushTimer) return;
    let delay = Math.max(0, suppressUntil - now);
    this._suppressedResizeFlushTimer = setTimeout(() => {
      this._suppressedResizeFlushTimer = 0;
      this._flushSuppressedNodeResizeUpdates();
    }, delay);
  }

  _handleNodeResizeEntries(entries) {
    let now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    let suppressConnectionResizeSettle = now < (this._viewportResizeSettleSuppressUntil || 0);
    let changed = false;
    for (const entry of entries) {
      let el = entry.target;
      if (!el?.isConnected) continue;
      let nodeId = el.getAttribute?.('node-id');
      if (!nodeId) continue;

      let next = this._readNodeElementSize(el, entry);
      let prev = this._nodeSizeCache.get(nodeId);
      if (
        !prev ||
        Math.abs(next.width - prev.width) > 0.5 ||
        Math.abs(next.height - prev.height) > 0.5
      ) {
        this._cacheNodeElementSize(nodeId, el, next);
        if (suppressConnectionResizeSettle) {
          this._queueSuppressedNodeResizeUpdate(nodeId, now);
        } else {
          this._scheduleConnectionUpdate(nodeId);
          changed = true;
        }
      }
    }
    if (changed) this._scheduleConnectionSettleRefresh(2);
  }

  _scheduleConnectionSettleRefresh(passes = 2) {
    this._connectionSettlePasses = Math.max(this._connectionSettlePasses, passes);
    if (this._connectionSettleFrame) return;

    let tick = () => {
      this._connectionSettleFrame = 0;
      if (!this.isConnected) {
        this._connectionSettlePasses = 0;
        return;
      }
      this.refreshConnections();
      this._connectionSettlePasses -= 1;
      if (this._connectionSettlePasses <= 0) return;
      if (typeof requestAnimationFrame === 'function') {
        this._connectionSettleFrame = requestAnimationFrame(tick);
      } else {
        tick();
      }
    };

    if (typeof requestAnimationFrame === 'function') {
      this._connectionSettleFrame = requestAnimationFrame(tick);
    } else {
      tick();
    }
  }

  _clearConnectionSettleRefresh() {
    if (this._connectionSettleFrame && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._connectionSettleFrame);
    }
    this._connectionSettleFrame = 0;
    this._connectionSettlePasses = 0;
  }

  _flowMenuActions() {
    let hasConnections = Boolean(this._editor?.getConnections?.().length);
    return baseFlowMenuActions({
      running: Boolean(this._flowSimulator?.running),
      flowing: this._allConnectionsFlowing,
      hasConnections,
    });
  }

  _emitPanelMenuActions() {
    this.dispatchEvent(new CustomEvent('panel-menu-actions', {
      bubbles: true,
      composed: true,
      detail: { actions: this._flowMenuActions() },
    }));
  }

  _startFlowAnimation() {
    if (!this._editor || !this._connRenderer || this._flowSimulator?.running) return;
    this._flowSimulator = new FlowSimulator(this._editor, this);
    this._flowSimulator.followActive = true;
    this._emitPanelMenuActions();
    this._flowSimulator.run().finally(() => {
      this._flowSimulator = null;
      this._allConnectionsFlowing = false;
      this._emitPanelMenuActions();
    });
  }

  _stopFlowAnimation({ emit = true } = {}) {
    this._flowSimulator?.stop?.();
    this._flowSimulator = null;
    this._connRenderer?.setAllFlowing?.(false);
    this._allConnectionsFlowing = false;
    if (emit) this._emitPanelMenuActions();
  }

  _togglePersistentFlow() {
    this.setAllFlowing(!this._allConnectionsFlowing);
  }

  _onPanelMenuAction = (event) => {
    let actionId = event.detail?.actionId;
    if (!String(actionId || '').startsWith('flow:')) return;
    event.stopPropagation();
    if (actionId === 'flow:run') {
      this._startFlowAnimation();
    } else if (actionId === 'flow:stop') {
      this._stopFlowAnimation();
    } else if (actionId === 'flow:toggle') {
      this._togglePersistentFlow();
    }
  };

  /**
   * Set error state on a node with frame-style error display
   * @param {string} nodeId
   * @param {string} message - Error message to display
   */
  setNodeError(nodeId, message) {
    let el = this._nodeViews.get(nodeId);
    if (!el) return;


    this.clearNodeError(nodeId);

    el.toggleAttribute('data-error', true);


    let frame = document.createElement('div');
    frame.className = 'error-frame';

    let header = document.createElement('div');
    header.className = 'error-frame-header';
    let icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.textContent = 'error';
    ensureMaterialSymbols(['error']);
    header.append(icon, ' Error');

    let body = document.createElement('div');
    body.className = 'error-frame-body';
    body.textContent = message;

    frame.append(header, body);
    el.append(frame);
  }

  /**
   * Clear error state from a node
   * @param {string} nodeId
   */
  clearNodeError(nodeId) {
    let el = this._nodeViews.get(nodeId);
    if (!el) return;
    el.removeAttribute('data-error');
    let frame = el.querySelector('.error-frame');
    if (frame) frame.remove();
  }

  /**
   * Clear all error states
   */
  clearAllErrors() {
    for (const [id] of this._nodeViews) {
      this.clearNodeError(id);
    }
  }

  /**
   * Apply a graph layout to rendered nodes.
   * @param {Object} [options]
   * @param {'auto'|'tree'|'flow'|'crystal'} [options.algorithm='auto']
   * @param {boolean} [options.fit=false]
   * @param {Object<string, string[]>|Array<object>} [options.groups]
   * @param {Object<string, {w: number, h: number}>} [options.nodeSizes]
   * @param {string} [options.rootNodeId]
   * @param {number} [options.startX=0]
   * @param {number} [options.startY=0]
   * @param {number} [options.crystalRingDistance]
   * @param {number} [options.crystalSpokes=6]
   * @param {number} [options.crystalAngleJitter=0.16]
   * @returns {{algorithm: string, positions: Object<string, {x: number, y: number}>}|null}
   */
  applyLayout(options = {}) {
    if (!this._editor) return null;

    let algorithm = options.algorithm || 'auto';
    if (!NODE_LAYOUT_ALGORITHMS.has(algorithm)) {
      throw new Error(
        `Unknown node layout algorithm "${algorithm}". Supported: ${[...NODE_LAYOUT_ALGORITHMS].join(', ')}.`,
      );
    }

    if (algorithm === 'flow') {
      let result = this.setFlowLayout(options);
      if (options.fit === true) this.fitView();
      return { algorithm, positions: result.positions, width: result.width, height: result.height };
    }

    this.clearFlowLayout();
    let layoutOptions = {
      ...options,
      nodeSizes: options.nodeSizes || this.measureNodeSizes(),
    };
    delete layoutOptions.algorithm;
    delete layoutOptions.fit;

    let positions = algorithm === 'tree'
      ? computeTreeLayout(this._editor, layoutOptions)
      : algorithm === 'crystal'
      ? computeCrystalLayout(this._editor, layoutOptions)
      : computeAutoLayout(this._editor, layoutOptions);

    this.setBatchMode(true);
    try {
      for (const [nodeId, pos] of Object.entries(positions)) {
        this.setNodePosition(nodeId, pos.x, pos.y);
      }
    } finally {
      this.setBatchMode(false);
    }
    this.syncPhantom();
    this.refreshConnections();
    if (options.fit === true) {
      this.fitView();
    }
    return { algorithm, positions };
  }

  /**
   * Apply auto layout to all nodes.
   * @param {Object} [options]
   * @returns {{algorithm: string, positions: Object<string, {x: number, y: number}>}|null}
   */
  autoLayout(options = {}) {
    return this.applyLayout({ ...options, algorithm: 'auto' });
  }

  /**
   * Fit all nodes into the viewport.
   * Calculates required zoom/pan based on current node layout,
   * accounting for the inspector panel if open.
   */
  fitView() {
    this._viewport?.fitView();
    this._settleConnectionsAfterViewport(3);
  }

  /**
   * Focus viewport on a specific node by ID.
   * Deducts inspector panel width from visibility calculation.
   * @param {string|string[]} nodeId - Target node ID or node IDs to fit together
   * @param {Object} [opts]
   * @param {number} [opts.zoom=0.8] - Target zoom level
   * @returns {boolean}
   */
  flyToNode(nodeId, opts) {
    let previousOptions = this._activeFocusTransitionOptions;
    let options = opts || {};
    let prepared = Array.isArray(nodeId) ? null : this._prepareFocusTransition(nodeId, options);
    if (prepared?.routePoints?.length >= 2) {
      options = this._normalizeFocusTransitionOptions(prepared, options);
    }
    this._activeFocusTransitionOptions = options;
    this._clearConnectionSettleRefresh();
    let result = false;
    try {
      result = this._viewport?.flyToNode(nodeId, options) || false;
    } finally {
      this._activeFocusTransitionOptions = previousOptions;
    }
    if (result) {
      if (options.select === false) {
        this._runFocusTransition(nodeId, prepared, options);
      }
      this._settleConnectionsAfterViewport(3);
    }
    return result;
  }

  /**
   * Focus viewport on multiple nodes by fitting their bounding box into view.
   * @param {string[]} nodeIds - Target node IDs
   * @param {Object} [opts]
   * @param {number} [opts.padding=80] - Screen padding around the focused group
   * @param {number} [opts.minZoom=0.08] - Minimum zoom while fitting
   * @param {number} [opts.maxZoom=1.5] - Maximum zoom while fitting
   * @param {string|boolean} [opts.select=false] - Node id to select, or true to select first
   * @returns {boolean}
   */
  flyToNodes(nodeIds, opts) {
    let previousOptions = this._activeFocusTransitionOptions;
    let options = opts || {};
    let select = options.select;
    let ids = Array.isArray(nodeIds) ? nodeIds : [nodeIds];
    if (select === true) select = ids[0];
    let transitionTarget = typeof options.transitionTarget === 'string' && options.transitionTarget
      ? options.transitionTarget
      : typeof select === 'string'
        ? select
        : ids.length === 1
          ? ids[0]
          : null;
    let prepared = typeof transitionTarget === 'string'
      ? this._prepareFocusTransition(transitionTarget, options)
      : null;
    if (prepared?.routePoints?.length >= 2) {
      options = this._normalizeFocusTransitionOptions(prepared, options);
    }
    this._activeFocusTransitionOptions = options;
    this._clearConnectionSettleRefresh();
    let result = false;
    try {
      result = this._viewport?.flyToNodes(nodeIds, options) || false;
    } finally {
      this._activeFocusTransitionOptions = previousOptions;
    }
    if (result) {
      if (options.select === false && transitionTarget) {
        this._runFocusTransition(transitionTarget, prepared, options);
      }
      this._settleConnectionsAfterViewport(3);
    }
    return result;
  }

  /**
   * Agent-facing alias for focusing one or more nodes in the viewport.
   * @param {string|string[]} nodeIds
   * @param {Object} [opts]
   * @returns {boolean}
   */
  focusNodes(nodeIds, opts) {
    return Array.isArray(nodeIds)
      ? this.flyToNodes(nodeIds, opts)
      : this.flyToNode(nodeIds, opts);
  }

  /**
   * Pause transient viewport work while the host hides this renderer.
   * Host-owned editor data and DOM node state stay intact for fast resume.
   * @param {{reason?: string, releaseDom?: boolean}} [context]
   */
  suspendLayout({ reason = 'layout-suspend', releaseDom = false } = {}) {
    this._layoutSuspended = true;
    this._layoutSuspendReason = reason;
    this.toggleAttribute('data-layout-suspended', true);
    this.ref?.quickToolbar?.hide?.();
    this.ref?.contextMenu?.hide?.();
    this.ref?.contextMenu?.setAttribute?.('hidden', '');
    if (this._panAnimFrame) {
      cancelAnimationFrame(this._panAnimFrame);
      this._panAnimFrame = null;
    }
    if (releaseDom && this._editor) {
      this._layoutReleasedDom = true;
      this._suspendedEditor = this._editor;
      this._suspendedPositions = this.getPositions();
      this._clearViews();
    }
  }

  /**
   * Resume viewport sync after a hidden layout group becomes active again.
   * @param {{reason?: string}} [context]
   */
  resumeLayout({ reason = 'layout-resume' } = {}) {
    let wasLayoutMove = this._layoutSuspendReason === 'layout-move' || reason === 'layout-move';
    this._layoutSuspended = false;
    this._layoutSuspendReason = '';
    this.toggleAttribute('data-layout-suspended', false);
    if (wasLayoutMove) return;
    if (this._layoutReleasedDom) return;
    this.syncPhantom();
    this.refreshConnections();
  }

  /**
   * Measure actual DOM sizes of all rendered nodes.
   * Returns a plain object { [nodeId]: { w, h } } suitable for AutoLayout's nodeSizes option.
   * Call after nodes are rendered to DOM (after setEditor + requestAnimationFrame).
   * @returns {Object<string, { w: number, h: number }>}
   */
  measureNodeSizes() {
    let sizes = {};
    for (const [nodeId, el] of this._nodeViews) {
      if (el && el.offsetWidth > 0) {
        sizes[nodeId] = { w: el.offsetWidth, h: el.offsetHeight };
      }
    }
    return sizes;
  }

  /**
   * Position nodes as a document-like flow and optionally make the canvas scrollable.
   * @param {Object} [options]
   * @param {string[]} [options.nodeIds] Nodes to lay out. Defaults to all editor nodes.
   * @param {'vertical'|'horizontal'} [options.direction='vertical'] Main flow direction.
   * @param {number} [options.gap=32] Main-axis spacing between nodes.
   * @param {number|{top?: number, right?: number, bottom?: number, left?: number}} [options.padding=24]
   * @param {'start'|'center'|'end'|'stretch'} [options.align='start'] Cross-axis alignment.
   * @param {number} [options.minNodeWidth] Minimum node width when sizing flow items.
   * @param {number} [options.maxNodeWidth] Maximum node width when sizing flow items.
   * @param {number} [options.minNodeHeight] Minimum node height when sizing horizontal flow items.
   * @param {number} [options.maxNodeHeight] Maximum node height when sizing horizontal flow items.
   * @param {boolean} [options.scroll=false] Enables native canvas scrolling in the flow direction.
   * @returns {{width: number, height: number, positions: Object<string, {x: number, y: number}>}}
   */
  setFlowLayout(options = {}) {
    let direction = FLOW_DIRECTIONS.has(options.direction) ? options.direction : 'vertical';
    let gap = Math.max(0, toFiniteNumber(options.gap, 32));
    let padding = normalizeFlowPadding(options.padding);
    let align = ['start', 'center', 'end', 'stretch'].includes(options.align) ? options.align : 'start';
    let nodeIds = Array.isArray(options.nodeIds)
      ? options.nodeIds
      : this._editor?.getNodes().map((node) => node.id) || [];
    let scroll = options.scroll === true;
    let viewportWidth = this.clientWidth || this.ref?.canvasContainer?.clientWidth || 0;
    let viewportHeight = this.clientHeight || this.ref?.canvasContainer?.clientHeight || 0;
    let minNodeWidth = toFiniteNumber(options.minNodeWidth, NaN);
    let maxNodeWidth = toFiniteNumber(options.maxNodeWidth, NaN);
    let minNodeHeight = toFiniteNumber(options.minNodeHeight, NaN);
    let maxNodeHeight = toFiniteNumber(options.maxNodeHeight, NaN);
    let positions = {};
    let cursor = direction === 'vertical' ? padding.top : padding.left;
    let contentWidth = viewportWidth;
    let contentHeight = viewportHeight;

    this._flowLayout = {
      ...options,
      align,
      direction,
      gap,
      padding,
      scroll,
    };

    this.setAttribute('data-flow-layout', direction);
    if (scroll) {
      this.setAttribute('data-flow-scroll', direction);
    } else {
      this.removeAttribute('data-flow-scroll');
    }

    this.setBatchMode(true);

    for (let nodeId of nodeIds) {
      let el = this._nodeViews.get(nodeId);
      if (!el) continue;

      if (direction === 'vertical') {
        let availableWidth = Math.max(0, viewportWidth - padding.left - padding.right);
        let targetWidth = align === 'stretch'
          ? clampFlowSize(availableWidth, minNodeWidth, maxNodeWidth)
          : clampFlowSize(el.offsetWidth || availableWidth, minNodeWidth, maxNodeWidth);
        if (Number.isFinite(targetWidth) && targetWidth > 0) {
          el.style.width = `${targetWidth}px`;
          el.style.setProperty('--sn-node-min-width', `${targetWidth}px`);
          el.style.setProperty('--sn-node-max-width', `${targetWidth}px`);
        }

        let width = el.offsetWidth || targetWidth || 0;
        let height = el.offsetHeight || 0;
        let x = padding.left;
        if (align === 'center') {
          x = padding.left + Math.max(0, availableWidth - width) / 2;
        } else if (align === 'end') {
          x = padding.left + Math.max(0, availableWidth - width);
        }
        let y = cursor;
        this.setNodePosition(nodeId, x, y);
        positions[nodeId] = { x, y };
        cursor += height + gap;
        contentWidth = Math.max(contentWidth, x + width + padding.right);
        contentHeight = Math.max(contentHeight, y + height + padding.bottom);
      } else {
        let availableHeight = Math.max(0, viewportHeight - padding.top - padding.bottom);
        let targetHeight = align === 'stretch'
          ? clampFlowSize(availableHeight, minNodeHeight, maxNodeHeight)
          : clampFlowSize(el.offsetHeight || availableHeight, minNodeHeight, maxNodeHeight);
        if (Number.isFinite(targetHeight) && targetHeight > 0) {
          el.style.minHeight = `${targetHeight}px`;
        }

        let width = el.offsetWidth || 0;
        let height = el.offsetHeight || targetHeight || 0;
        let x = cursor;
        let y = padding.top;
        if (align === 'center') {
          y = padding.top + Math.max(0, availableHeight - height) / 2;
        } else if (align === 'end') {
          y = padding.top + Math.max(0, availableHeight - height);
        }
        this.setNodePosition(nodeId, x, y);
        positions[nodeId] = { x, y };
        cursor += width + gap;
        contentWidth = Math.max(contentWidth, x + width + padding.right);
        contentHeight = Math.max(contentHeight, y + height + padding.bottom);
      }
    }

    this.setBatchMode(false);
    this.#setFlowContentSize(contentWidth, contentHeight);
    this.syncPhantom();
    this.refreshConnections();
    this._scheduleConnectionSettleRefresh(3);

    return { width: contentWidth, height: contentHeight, positions };
  }

  clearFlowLayout() {
    this._flowLayout = null;
    this.removeAttribute('data-flow-layout');
    this.removeAttribute('data-flow-scroll');
    this.#setFlowContentSize(0, 0);
    for (const [, el] of this._nodeViews) {
      el.style.width = '';
      el.style.minHeight = '';
      el.style.removeProperty('--sn-node-min-width');
      el.style.removeProperty('--sn-node-max-width');
    }
  }

  refreshFlowLayout() {
    if (this._flowLayout) this.setFlowLayout(this._flowLayout);
  }

  /**
   * Load a serializable graph model through the public agent-facing adapter.
   * @param {object} model
   * @returns {NodeEditor}
   */
  setEditorModel(model = {}) {
    let positions = { ...(model.positions || {}) };
    let editor = new NodeEditor().fromJSON({
      ...model,
      ui: {
        ...(model.ui || {}),
        positions: model.ui?.positions || positions,
      },
    }, positions);
    this.setEditor(editor);
    this.setReadonly(model.readonly === true);

    for (let [nodeId, position] of Object.entries(positions)) {
      let x = Array.isArray(position) ? position[0] : position?.x;
      let y = Array.isArray(position) ? position[1] : position?.y;
      if (Number.isFinite(Number(x)) && Number.isFinite(Number(y))) {
        this.setNodePosition(nodeId, Number(x), Number(y));
      }
    }
    this.refreshConnections();
    this._scheduleConnectionSettleRefresh(3);
    return editor;
  }

  #setFlowContentSize(width, height) {
    if (!width || !height) {
      this.style.removeProperty('--sn-flow-content-width');
      this.style.removeProperty('--sn-flow-content-height');
      return;
    }
    this.style.setProperty('--sn-flow-content-width', `${Math.ceil(width)}px`);
    this.style.setProperty('--sn-flow-content-height', `${Math.ceil(height)}px`);
  }

  /**
   * Set preview content on a node (image URL or text)
   * @param {string} nodeId
   * @param {string} content - Image URL or text
   * @param {'image'|'text'} [type='text']
   */
  setPreview(nodeId, content, type = 'text') {
    let el = this._nodeViews.get(nodeId);
    if (!el) return;
    let preview = el.ref?.previewArea;
    if (!preview) return;

    preview.hidden = false;
    preview.replaceChildren();
    if (type === 'image') {
      let img = document.createElement('img');
      img.src = content;
      img.alt = 'Preview';
      preview.appendChild(img);
    } else {
      let div = document.createElement('div');
      div.className = 'sn-preview-text';
      div.textContent = content;
      preview.appendChild(div);
    }
  }

  /**
   * Clear preview from a node
   * @param {string} nodeId
   */
  clearPreview(nodeId) {
    let el = this._nodeViews.get(nodeId);
    if (!el) return;
    let preview = el.ref?.previewArea;
    if (!preview) return;
    preview.hidden = true;
    preview.replaceChildren();
  }

  /**
   * Get node view element by ID (used by FlowSimulator)
   * @param {string} nodeId
   * @returns {HTMLElement|undefined}
   */
  _getNodeView(nodeId) {
    return this._nodeViews.get(nodeId);
  }

  /**
   * Alias for SubgraphManager
   * @param {string} nodeId
   * @returns {HTMLElement|undefined}
   */
  getNodeView(nodeId) {
    return this._nodeViews.get(nodeId);
  }

  /**
   * Highlight nodes sequentially based on execution trace.
   * Each node pulses green in order, then fades.
   *
   * @param {Array<{nodeId: string}>} trace - Execution trace from Fire/Run
   * @param {number} [stepDelay=300] - Delay between node highlights (ms)
   */
  highlightTrace(trace, stepDelay = 300) {
    if (!trace || !trace.length) return;


    for (const [, el] of this._nodeViews) {
      el.removeAttribute('data-fire-state');
    }


    for (const step of trace) {
      let el = this._nodeViews.get(step.nodeId);
      if (el) {
        el.setAttribute('data-fire-state', 'pending');
      }
    }


    trace.forEach((step, i) => {
      setTimeout(() => {
        let el = this._nodeViews.get(step.nodeId);
        if (!el) return;


        el.setAttribute('data-fire-state', 'active');


        setTimeout(() => {
          el.setAttribute('data-fire-state', 'complete');
        }, 600);
      }, i * stepDelay);
    });


    let totalDuration = trace.length * stepDelay + 3500;
    setTimeout(() => {
      for (const [, el] of this._nodeViews) {
        el.removeAttribute('data-fire-state');
      }
    }, totalDuration);
  }


  /**
   * Drill down into a subgraph node
   * @param {string} nodeId - SubgraphNode ID
   */
  drillDown(nodeId) {
    if (!this._editor) return;
    let node = this._editor.getNode(nodeId);
    if (!node?._isSubgraph) return;
    this._navigating = true;
    this._subgraphManager.drillDown(node);
    this._navigating = false;
    this.dispatchEvent(
      new CustomEvent('subgraph-enter', {
        detail: { node, nodeId },
        bubbles: true,
      })
    );
  }

  /**
   * Navigate up to a breadcrumb level
   * @param {number} level - 0 = root
   */
  drillUp(level) {
    this._navigating = true;
    this._subgraphManager.drillUp(level);
    this._navigating = false;
    this.dispatchEvent(
      new CustomEvent('subgraph-exit', {
        detail: { level },
        bubbles: true,
      })
    );
  }

  /**
   * Get current subgraph depth (0 = root)
   * @returns {number}
   */
  getSubgraphDepth() {
    return this._subgraphManager.depth;
  }

  /**
   * Get subgraph breadcrumb path
   * @returns {Array<{ label: string, level: number }>}
   */
  getSubgraphPath() {
    return this._subgraphManager.getPath();
  }

  /**
   * Enable/disable batch positioning mode.
   * When true, setNodePosition skips connection updates.
   * Call refreshConnections() after batch is done.
   * @param {boolean} active
   */
  setBatchMode(active) {
    this._batchMode = !!active;
    if (!this._batchMode) {
      this._viewport?.updateTransform();
    }
  }

  /**
   * Set node position
   * @param {string} nodeId
   * @param {number} x
   * @param {number} y
   */
  setNodePosition(nodeId, x, y) {
    let el = this._nodeViews.get(nodeId);
    if (!el) {
      this._viewport?.updatePhantomPosition(nodeId, x, y);
      return;
    }
    el.style.transform = `translate(${x}px, ${y}px)`;
    el._position = { x, y };


    if (this._batchMode) return;

    if (this._nodeDragActive) {
      this._scheduleConnectionUpdate(nodeId);
    } else {
      this._updateConnectionsForNode(nodeId);
    }


    let toolbar = this.ref.quickToolbar;
    if (toolbar && toolbar._nodeId === nodeId) {
      toolbar.updatePosition(el);
    }
  }

  _updateConnectionsForNode(nodeId) {
    let el = this._nodeViews.get(nodeId);
    this._connRenderer?.updateForNode(nodeId);
    if (el?.hasAttribute('data-svg-shape')) {
      this._connRenderer?.refreshFreeDots(nodeId);
    }
  }

  _scheduleConnectionUpdate(nodeId) {
    this._pendingConnectionNodeIds.add(nodeId);
    if (this._nodeDragActive) {
      this._scheduleDragConnectionUpdate();
      return;
    }
    if (this._connectionUpdateFrame) return;
    if (typeof requestAnimationFrame === 'function') {
      this._connectionUpdateFrame = requestAnimationFrame(() => {
        this._connectionUpdateFrame = 0;
        this._flushScheduledConnectionUpdates();
      });
      return;
    }
    this._flushScheduledConnectionUpdates();
  }

  _scheduleDragConnectionUpdate() {
    if (this._connectionUpdateFrame || this._connectionUpdateTimer) return;
    let now = globalThis.performance?.now?.() ?? Date.now();
    let elapsed = now - this._lastConnectionUpdateTime;
    let delay = Math.max(0, this._dragConnectionUpdateInterval - elapsed);
    let requestFrame = () => {
      if (typeof requestAnimationFrame === 'function') {
        this._connectionUpdateFrame = requestAnimationFrame(() => {
          this._connectionUpdateFrame = 0;
          this._flushScheduledConnectionUpdates();
        });
        return;
      }
      this._flushScheduledConnectionUpdates();
    };

    if (delay > 0 && typeof globalThis.setTimeout === 'function') {
      this._connectionUpdateTimer = globalThis.setTimeout(() => {
        this._connectionUpdateTimer = 0;
        requestFrame();
      }, delay);
      return;
    }

    requestFrame();
  }

  _flushScheduledConnectionUpdates() {
    if (this._connectionUpdateFrame && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._connectionUpdateFrame);
    }
    this._connectionUpdateFrame = 0;
    if (this._connectionUpdateTimer && typeof globalThis.clearTimeout === 'function') {
      globalThis.clearTimeout(this._connectionUpdateTimer);
    }
    this._connectionUpdateTimer = 0;
    if (!this._pendingConnectionNodeIds.size) return;
    let nodeIds = [...this._pendingConnectionNodeIds];
    this._pendingConnectionNodeIds.clear();
    this._lastConnectionUpdateTime = globalThis.performance?.now?.() ?? Date.now();
    for (let nodeId of nodeIds) {
      this._updateConnectionsForNode(nodeId);
    }
  }

  _clearScheduledConnectionUpdates() {
    if (this._connectionUpdateFrame && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._connectionUpdateFrame);
    }
    this._connectionUpdateFrame = 0;
    if (this._connectionUpdateTimer && typeof globalThis.clearTimeout === 'function') {
      globalThis.clearTimeout(this._connectionUpdateTimer);
    }
    this._connectionUpdateTimer = 0;
    this._pendingConnectionNodeIds.clear();
    this._clearConnectionSettleRefresh();
  }

  _cancelNodeDragRelease() {
    if (this._nodeDragReleaseFrame && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._nodeDragReleaseFrame);
    }
    this._nodeDragReleaseFrame = 0;
  }

  /**
   * Animate node to position with wires synced via RAF
   * @param {string} nodeId
   * @param {number} targetX
   * @param {number} targetY
   * @param {number} [duration=200] - Animation duration in ms
   */
  animateNodeToPosition(nodeId, targetX, targetY, duration = 200) {
    let el = this._nodeViews.get(nodeId);
    if (!el) return;

    let startX = el._position.x;
    let startY = el._position.y;
    let dx = targetX - startX;
    let dy = targetY - startY;


    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

    let startTime = performance.now();

    let animate = (now) => {
      let t = Math.min((now - startTime) / duration, 1);

      let ease = 1 - (1 - t) ** 3;
      let x = startX + dx * ease;
      let y = startY + dy * ease;

      el.style.transform = `translate(${x}px, ${y}px)`;
      el._position = { x, y };
      this._connRenderer?.updateForNode(nodeId);
      this._connRenderer?.refreshFreeDots(nodeId);

      let toolbar = this.ref.quickToolbar;
      if (toolbar && toolbar._nodeId === nodeId) {
        toolbar.updatePosition(el);
      }

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {

        el._position = { x: targetX, y: targetY };
        el.style.transform = `translate(${targetX}px, ${targetY}px)`;
        this._connRenderer?.updateForNode(nodeId);
        this._connRenderer?.refreshFreeDots(nodeId);
      }
    };

    requestAnimationFrame(animate);
  }

  /**
   * Get all node positions — includes both DOM nodes and phantom (virtualized) nodes.
   * SubgraphRouter relies on this to decide whether a node is on the current canvas layer;
   * phantom nodes DO have layout positions but no DOM element, so they must be included here.
   * @returns {Object<string, number[]>}
   */
  getPositions() {
    return this._viewport?.getPositions() || {};
  }

  /**
   * Check whether a node exists on the current canvas layer (DOM or phantom).
   * SubgraphRouter uses this to avoid spurious drillDown when layout is still in progress.
   * @param {string} nodeId
   * @returns {boolean}
   */
  hasNode(nodeId) {
    return this._viewport?.hasNode(nodeId) || false;
  }


  /**
   * Add a frame to the canvas
   * @param {import('../../core/Frame.js').Frame} frame
   */
  addFrame(frame) {
    this._editor?.addFrame(frame);
  }

  /**
   * Set frame position
   * @param {string} frameId
   * @param {number} x
   * @param {number} y
   */
  setFramePosition(frameId, x, y) {
    this._frameManager?.setPosition(frameId, x, y);
  }

  /**
   * Set frame size
   * @param {string} frameId
   * @param {number} w
   * @param {number} h
   */
  setFrameSize(frameId, w, h) {
    this._frameManager?.setSize(frameId, w, h);
  }


  _handleNodeClick(nodeId, e) {
    let accumulate = e.ctrlKey || e.metaKey;
    this._selector.selectNode(nodeId, accumulate);


    let now = Date.now();
    if (this._lastClickNodeId === nodeId && now - this._lastClickTime < 400) {
      this.drillDown(nodeId);
      this._lastClickTime = 0;
      this._lastClickNodeId = null;
    } else {
      this._lastClickTime = now;
      this._lastClickNodeId = nodeId;
    }
  }

  _handleNodePointerEnter(nodeId, nodeEl) {
    if (this._nodeDragActive) return;
    let toolbar = this.ref.quickToolbar;
    if (!toolbar) return;
    toolbar.show(nodeId, nodeEl, { sticky: false });
  }

  _handleNodePointerLeave(nodeId) {
    let toolbar = this.ref.quickToolbar;
    if (!toolbar) return;
    toolbar.scheduleHide?.(undefined, nodeId);
  }

  _connectionIdsForNode(nodeId) {
    let connections =
      this._editor?.getNodeConnections?.(nodeId) ||
      this._editor?.getConnectionsForNode?.(nodeId) ||
      this._editor?.getConnections?.()?.filter?.((conn) => conn.from === nodeId || conn.to === nodeId) ||
      [];
    return connections.map((conn) => conn.id).filter(Boolean);
  }

  _handleNodeDragStart(nodeId) {
    this._cancelNodeDragRelease();
    this._nodeDragActive = true;
    this._nodeDragId = nodeId;
    this.setAttribute('data-node-dragging', nodeId);
    if (this._pathStyle !== 'straight') {
      let connectionIds = this._connectionIdsForNode(nodeId);
      this._nodeDragConnectionIds = connectionIds;
      let dragStyle = this._pathStyle === 'pcb' ? 'pcb-drag-proxy' : 'straight';
      this.setTransientPathStyle(dragStyle, 'node-drag', {
        connectionIds,
        draggedNodeId: nodeId,
        freezeLayer: dragStyle === 'pcb-drag-proxy',
        suspendProgressivePcb: dragStyle === 'pcb-drag-proxy',
      });
    }
    this.ref.quickToolbar?.hide?.();
  }

  _handleNodeDragEnd(nodeId, nodeEl, event) {
    this._nodeDragActive = false;
    this.removeAttribute('data-node-dragging');
    this._releaseNodeDragTransient();

    if (!nodeEl?.isConnected || !this._selector.isNodeSelected(nodeId)) return;

    let restoreToolbar = () => {
      if (this._nodeDragActive || !nodeEl.isConnected || !this._selector.isNodeSelected(nodeId)) return;
      this.ref.quickToolbar?.show?.(nodeId, nodeEl, { sticky: true });
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(restoreToolbar);
    } else {
      restoreToolbar();
    }
  }

  _releaseNodeDragTransient() {
    this._nodeDragConnectionIds = [];
    this._nodeDragId = '';
    this._cancelNodeDragRelease();
    this._clearScheduledConnectionUpdates();
    this.setTransientPathStyle('', 'node-drag');
  }

  _handleConnectionClick(connId, e) {
    let accumulate = e.ctrlKey || e.metaKey;
    this._selector.selectConnection(connId, accumulate);
  }


  _updateTransform() {
    this._viewport?.updateTransform();
  }

  _cancelViewportMotionForManualInteraction() {
    this._viewport?.cancelAnimation?.();
    this._hideFocusTransitionMarker();
  }

  /** Public: force sync phantom data to renderer (for use after batch setNodePosition) */
  syncPhantom() {
    this._viewport?.syncPhantom();
  }

  _updateMarqueeDom() {
    let marquee = this.ref.marquee;
    if (!marquee || !this._marqueeStart || !this._marqueeEnd) return;

    let x1 = Math.min(this._marqueeStart.x, this._marqueeEnd.x);
    let y1 = Math.min(this._marqueeStart.y, this._marqueeEnd.y);
    let x2 = Math.max(this._marqueeStart.x, this._marqueeEnd.x);
    let y2 = Math.max(this._marqueeStart.y, this._marqueeEnd.y);

    marquee.style.left = `${x1}px`;
    marquee.style.top = `${y1}px`;
    marquee.style.width = `${x2 - x1}px`;
    marquee.style.height = `${y2 - y1}px`;
    marquee.hidden = false;
  }

  _performMarqueeSelection(accumulate = false) {
    if (!this._marqueeStart || !this._marqueeEnd) return;

    let x1 = Math.min(this._marqueeStart.x, this._marqueeEnd.x);
    let y1 = Math.min(this._marqueeStart.y, this._marqueeEnd.y);
    let x2 = Math.max(this._marqueeStart.x, this._marqueeEnd.x);
    let y2 = Math.max(this._marqueeStart.y, this._marqueeEnd.y);

    let t = {
      k: this.$.zoom,
      x: this.$.panX,
      y: this.$.panY,
    };
    let screenToWorld = (sx, sy) => ({
      x: (sx - t.x) / t.k,
      y: (sy - t.y) / t.k,
    });

    let worldStart = screenToWorld(x1, y1);
    let worldEnd = screenToWorld(x2, y2);

    let worldMarquee = {
      x: worldStart.x,
      y: worldStart.y,
      width: worldEnd.x - worldStart.x,
      height: worldEnd.y - worldStart.y,
    };

    let selectedNodeIds = [];
    for (const [nodeId, el] of this._nodeViews) {
      let pos = el._position || { x: 0, y: 0 };
      let size = {
        width: el.offsetWidth || el._cachedW || 180,
        height: el.offsetHeight || el._cachedH || 60,
      };
      let nodeRect = { x: pos.x, y: pos.y, width: size.width, height: size.height };
      if (isNodeInMarquee(nodeRect, worldMarquee, { containment: 'intersect' })) {
        selectedNodeIds.push(nodeId);
      }
    }

    let selectedConnIds = [];
    if (this._editor) {
      for (const conn of this._editor.getConnections()) {
        if (selectedNodeIds.includes(conn.from) && selectedNodeIds.includes(conn.to)) {
          selectedConnIds.push(conn.id);
        } else {
          let fromEl = this._nodeViews.get(conn.from);
          let toEl = this._nodeViews.get(conn.to);
          if (fromEl && toEl) {
            let fromPos = fromEl._position;
            let toPos = toEl._position;
            let fromW = fromEl._cachedW || fromEl.offsetWidth || 180;
            let fromH = fromEl._cachedH || fromEl.offsetHeight || 60;
            let toW = toEl._cachedW || toEl.offsetWidth || 180;
            let toH = toEl._cachedH || toEl.offsetHeight || 60;
            let p1 = { x: fromPos.x + fromW / 2, y: fromPos.y + fromH / 2 };
            let p2 = { x: toPos.x + toW / 2, y: toPos.y + toH / 2 };
            if (isEdgeIntersectingRect(p1, p2, worldMarquee)) {
              selectedConnIds.push(conn.id);
            }
          }
        }
      }
    }

    this._selector.selectNodes(selectedNodeIds, accumulate);
    this._selector.selectConnections(selectedConnIds, true);
  }

  renderCallback() {
    ensureSystemCascade(this.ownerDocument ?? globalThis.document);

    let initialPresentationRun = true;
    this.sub('presentation', (value) => {
      this.toggleAttribute('presentation', !!value);
      if (initialPresentationRun) {
        initialPresentationRun = false;
        if (!value) {
          return;
        }
      }
      this.setPresentationMode(!!value);
    });

    ensureMaterialSymbols(['map', 'play_arrow', 'stop', 'timeline']);
    this.addEventListener('panel-menu-action', this._onPanelMenuAction);

    let container = this.ref.canvasContainer;
    let content = this.ref.content;


    this._drag = new Drag();
    this._drag.initialize(
      container,
      {
        getPosition: () => this._flowLayout
          ? ({ x: -this.scrollLeft, y: -this.scrollTop })
          : ({ x: this.$.panX, y: this.$.panY }),
        getZoom: () => 1,
      },
      {
        shouldStart: () => !this._viewportLocked,
        onStart: (e) => {
          this._panStart = e ? { x: e.pageX, y: e.pageY, target: e.target } : null;
          this._isMarqueeSelection = e && e.shiftKey;
          if (this._isMarqueeSelection) {
            let rect = container.getBoundingClientRect();
            this._marqueeStart = {
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
            };
            this._marqueeEnd = { ...this._marqueeStart };
            this._updateMarqueeDom();
          }
        },
        onTranslate: (x, y, e) => {
          if (this._viewportLocked) return;
          if (this._zoom?.isTranslating()) return;
          if (this._connectFlow?.isPicking()) return;
          this._cancelViewportMotionForManualInteraction();
          if (this._isMarqueeSelection && e) {
            let rect = container.getBoundingClientRect();
            this._marqueeEnd = {
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
            };
            this._updateMarqueeDom();
            this._performMarqueeSelection(e.ctrlKey || e.metaKey);
            return;
          }
          if (this._flowLayout?.scroll) {
            this.scrollLeft = -x;
            this.scrollTop = -y;
            this.dispatchEvent(new CustomEvent('manualviewport'));
            this.toggleAttribute('data-interacting', true);
            return;
          }
          this.$.panX = x;
          this.$.panY = y;
          this._updateTransform();
          this.dispatchEvent(new CustomEvent('manualviewport'));


          this.toggleAttribute('data-interacting', true);
        },
        onDrop: (e) => {
          if (this._isMarqueeSelection) {
            this._isMarqueeSelection = false;
            if (this.ref.marquee) this.ref.marquee.hidden = true;
            this.dispatchEvent(
              new CustomEvent('sn-selection-change', {
                detail: {
                  nodes: Array.from(this._selector.getSelectedNodes()),
                  connections: Array.from(this._selector.getSelectedConnections()),
                },
                bubbles: true,
              })
            );
          }
          if (this._panStart && e) {
            let dx = Math.abs(e.pageX - this._panStart.x);
            let dy = Math.abs(e.pageY - this._panStart.y);
            let t = this._panStart.target;
            let isNode = t?.closest?.('graph-node, quick-toolbar, context-menu, inspector-panel');
            if (dx < 5 && dy < 5 && !isNode && !e.shiftKey) {
              this._selector.unselectAll();
            }
          }
          this._panStart = null;
          this.removeAttribute('data-interacting');
        },
      }
    );


    this._zoom = new Zoom(0.1);
    let interactingTimer = null;
    this._zoom.initialize(
      container,
      content,
      (delta, ox, oy) => {
        if (this._viewportLocked) return;
        this._cancelViewportMotionForManualInteraction();
        let k = this.$.zoom;
        let newK = k * (1 + delta);
        if (newK < 0.001 || newK > 5) return;
        this.$.zoom = newK;
        this.$.panX += ox;
        this.$.panY += oy;
        this._updateTransform();
        this.dispatchEvent(new CustomEvent('manualviewport'));


        this.toggleAttribute('data-interacting', true);
        clearTimeout(interactingTimer);
        interactingTimer = setTimeout(() => {
          this.removeAttribute('data-interacting');
        }, 150);
      },
      () => ({ x: this.$.panX, y: this.$.panY }),
      {
        shouldHandleWheel: (event) => {
          if (!this.hasAttribute('data-flow-scroll')) return true;
          return event.ctrlKey || event.metaKey || event.altKey;
        },
      }
    );


    container.addEventListener('contextmenu', (e) => {
      if (!this.$.chrome) return;
      this._actions?.showContextMenu(e, this.ref.contextMenu, container, {
        panX: this.$.panX,
        panY: this.$.panY,
        zoom: this.$.zoom,
      });
    });
    container.addEventListener('keydown', (e) => this._actions?.handleKeydown(e));


    container.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        this.ref.nodeSearch?.toggle();
      }
    });


    this.sub('+contentTransform', (val) => {
      if (this.ref.content) {
        this.ref.content.style.transform = val;
      }
      this._connRenderer?.refreshViewportTransform?.();
    });

    this._updateTransform();


    let minimap = this.ref.minimap;
    let minimapToggle = this.ref.minimapToggle;
    const MINIMAP_KEY = 'sn-minimap-enabled';
    let minimapEnabled = localStorage.getItem(MINIMAP_KEY) === 'true';
    let fadeTimer = null;
    const FADE_DELAY = 2000;

    let showMinimap = () => {
      if (!minimapEnabled || !minimap) return;
      minimap.hidden = false;
      minimap.removeAttribute('data-fading');
      minimap.update?.();
      clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => {
        minimap.toggleAttribute('data-fading', true);

        setTimeout(() => {
          if (minimap.hasAttribute('data-fading')) {
            minimap.hidden = true;
            minimap.removeAttribute('data-fading');
          }
        }, 400);
      }, FADE_DELAY);
    };

    let updateToggleState = () => {
      if (minimapToggle) {
        minimapToggle.toggleAttribute('data-active', minimapEnabled);
      }
      if (!minimapEnabled && minimap) {
        minimap.hidden = true;
        minimap.removeAttribute('data-fading');
        clearTimeout(fadeTimer);
      }
    };

    updateToggleState();

    if (minimapToggle) {
      minimapToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        minimapEnabled = !minimapEnabled;
        localStorage.setItem(MINIMAP_KEY, minimapEnabled);
        updateToggleState();
        if (minimapEnabled) showMinimap();
      });
    }


    if (minimap) {
      minimap.setStateGetter(() => {
        let nodes = [];
        for (const [, el] of this._nodeViews) {
          let pos = el._position || { x: 0, y: 0 };
          if (!el._cachedW) {
            el._cachedW = el.offsetWidth || 180;
            el._cachedH = el.offsetHeight || 60;
          }
          nodes.push({
            x: pos.x,
            y: pos.y,
            width: el._cachedW,
            height: el._cachedH,
            bypassed: el.hasAttribute('data-bypassed'),
          });
        }
        return {
          nodes,
          transform: { x: this.$.panX, y: this.$.panY, zoom: this.$.zoom },
          containerSize: {
            width: container.clientWidth,
            height: container.clientHeight,
          },
        };
      });


      minimap.addEventListener('minimap-navigate', (e) => {
        this.$.panX = e.detail.x;
        this.$.panY = e.detail.y;
        this._updateTransform();
      });
    }


    let nodeSearch = this.ref.nodeSearch;
    if (nodeSearch) {
      nodeSearch.configure({
        getNodes: () => {
          let result = [];
          if (this._editor) {
            for (const node of this._editor.getNodes()) {
              result.push({
                id: node.id,
                label: node.label,
                type: node.type,
                category: node.category,
              });
            }
          }
          return result;
        },
        onSelect: (nodeId) => {

          this._selector.selectNode(nodeId);

          let el = this._nodeViews.get(nodeId);
          if (el?._position) {
            let cx = container.clientWidth / 2;
            let cy = container.clientHeight / 2;
            this.$.panX = -el._position.x * this.$.zoom + cx;
            this.$.panY = -el._position.y * this.$.zoom + cy;
            this._updateTransform();
          }
        },
      });
    }
  }

  /**
   * Smoothly pan viewport to center on a node
   * @param {string} nodeId
   * @param {number} [duration=400] - Animation duration in ms
   */
  panToNode(nodeId, duration = 400) {
    this._viewport?.panToNode(nodeId, duration);
  }

  destroyCallback() {
    this.removeEventListener('panel-menu-action', this._onPanelMenuAction);
    this._stopFlowAnimation({ emit: false });
    this._clearConnectionSettleRefresh();
    this._disconnectNodeResizeObserver();
    this._hideFocusTransitionMarker();
    this._clearScheduledConnectionUpdates();
    if (this._suppressedResizeFlushTimer) {
      clearTimeout(this._suppressedResizeFlushTimer);
      this._suppressedResizeFlushTimer = 0;
    }
    if (this._panAnimFrame) {
      cancelAnimationFrame(this._panAnimFrame);
      this._panAnimFrame = null;
    }
    if (this._viewport) this._viewport.clear();
    if (this._drag) this._drag.destroy();
    if (this._zoom) this._zoom.destroy();
    if (this._connectFlow) this._connectFlow.destroy();
    for (const [, el] of this._nodeViews) {
      if (el._drag) el._drag.destroy();
    }
  }
}

NodeCanvas.template = template;
NodeCanvas.rootStyles = styles;
NodeCanvas.reg('node-canvas');
