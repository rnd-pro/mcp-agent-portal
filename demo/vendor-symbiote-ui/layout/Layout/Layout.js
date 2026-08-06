/**
 * @fileoverview Layout - Root container for panel layouts.
 * Uses LayoutNode for recursive BSP tree rendering.
 * Handles explicit panel menu events for split/remove operations.
 */

import Symbiote from '@symbiotejs/symbiote';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import * as LayoutTree from './../LayoutTree.js';
import { resumeLayoutSubtree, suspendLayoutSubtree } from './../lifecycle.js';
import { template } from './Layout.tpl.js';
import { styles } from './Layout.css.js';
import './../LayoutNode/LayoutNode.js';
import './../PanelMenu/PanelMenu.js';

function setAttributeIfChanged(element, name, value) {
  let next = String(value);
  if (element.getAttribute(name) !== next) {
    element.setAttribute(name, next);
  }
}

function toggleAttributeIfChanged(element, name, value) {
  let next = Boolean(value);
  if (element.hasAttribute(name) !== next) {
    element.toggleAttribute(name, next);
  }
}

function setStylePropertyIfChanged(style, name, value) {
  if (style.getPropertyValue(name) !== value) {
    style.setProperty(name, value);
  }
}

function setImportantStylePropertyIfChanged(style, name, value) {
  if (style.getPropertyValue(name) !== value || style.getPropertyPriority(name) !== 'important') {
    style.setProperty(name, value, 'important');
  }
}

function syncOptionalAttribute(element, name, value) {
  if (value === undefined || value === null || value === '') {
    if (element.hasAttribute(name)) element.removeAttribute(name);
    return;
  }
  setAttributeIfChanged(element, name, value);
}

function drawerTranslateTransform(value) {
  return `translate3d(${value}, 0, 0)`;
}

const LAYOUT_PEER_GROUPS = new Map();
const LAYOUT_PEER_PENDING_GROUPS = new Set();
let layoutPeerRefreshFrame = 0;

function normalizeLayoutPeerGroup(value) {
  return String(value || '').trim();
}

function hasHiddenAncestor(element) {
  for (let node = element; node; node = node.parentElement) {
    if (node.hidden || node.style?.display === 'none') return true;
  }
  return false;
}

function getLayoutPeerRect(layout) {
  return layout.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
}

function isVisibleLayoutPeer(layout) {
  if (!layout?.isConnected || hasHiddenAncestor(layout)) return false;
  let rect = getLayoutPeerRect(layout);
  return (rect.width || rect.height) ? true : layout.hasAttribute('root-collapsed');
}

function compareLayoutDocumentOrder(a, b) {
  let position = a.compareDocumentPosition?.(b) || 0;
  if (position & 4) return -1;
  if (position & 2) return 1;
  return 0;
}

function resolvePeerCollapseInfo(layout, peers) {
  let visiblePeers = peers.filter((peer) => peer !== layout && isVisibleLayoutPeer(peer));
  if (!visiblePeers.length) {
    return { hasPeers: false, direction: 'horizontal', slot: 'first' };
  }

  let ownRect = getLayoutPeerRect(layout);
  let ownCenterX = ownRect.left + (ownRect.width || 0) / 2;
  let ownCenterY = ownRect.top + (ownRect.height || 0) / 2;
  let peerCenters = visiblePeers.map((peer) => {
    let rect = getLayoutPeerRect(peer);
    return {
      x: rect.left + (rect.width || 0) / 2,
      y: rect.top + (rect.height || 0) / 2,
    };
  });
  let peerCenterX = peerCenters.reduce((sum, item) => sum + item.x, 0) / peerCenters.length;
  let peerCenterY = peerCenters.reduce((sum, item) => sum + item.y, 0) / peerCenters.length;
  let dx = peerCenterX - ownCenterX;
  let dy = peerCenterY - ownCenterY;

  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
    if (Math.abs(dx) >= Math.abs(dy)) {
      return { hasPeers: true, direction: 'horizontal', slot: dx < 0 ? 'second' : 'first' };
    }
    return { hasPeers: true, direction: 'vertical', slot: dy < 0 ? 'second' : 'first' };
  }

  let ordered = [layout, ...visiblePeers].sort(compareLayoutDocumentOrder);
  return {
    hasPeers: true,
    direction: 'horizontal',
    slot: ordered.indexOf(layout) === 0 ? 'first' : 'second',
  };
}

function refreshLayoutPeerGroup(group) {
  let layouts = LAYOUT_PEER_GROUPS.get(group);
  if (!layouts) return;
  for (let layout of Array.from(layouts)) {
    if (!layout.isConnected) {
      layouts.delete(layout);
      continue;
    }
    layout._syncLayoutPeerState?.();
  }
  if (!layouts.size) LAYOUT_PEER_GROUPS.delete(group);
}

function scheduleLayoutPeerGroupRefresh(group) {
  group = normalizeLayoutPeerGroup(group);
  if (!group) return;
  LAYOUT_PEER_PENDING_GROUPS.add(group);
  if (layoutPeerRefreshFrame) return;
  let schedule = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (callback) => setTimeout(callback, 0);
  layoutPeerRefreshFrame = schedule(() => {
    layoutPeerRefreshFrame = 0;
    let groups = Array.from(LAYOUT_PEER_PENDING_GROUPS);
    LAYOUT_PEER_PENDING_GROUPS.clear();
    groups.forEach(refreshLayoutPeerGroup);
  });
}

export class Layout extends Symbiote {
  static isoMode = true;

  init$ = {

    '@storage-key': '',
    '@min-panel-size': 50,
    '@min-panel-inline-size': 220,
    '@min-panel-block-size': 160,
    '@responsive-mode': 'preserve',
    '@responsive-breakpoint': 720,
    '@swipe-control': 'edge',
    '@overflow-mode': 'collapse',
    '@auto-collapse': true,
    '@drawer-hover-open': false,
    '@layout-peer-group': '',


    layoutTree: null,
    layoutBehavior: null,


    panelTypes: {},

    panelChrome: true,


    fullscreenPanelId: null,


    hasFullscreenTabs: false,
    tabItems: [],

    drawerStartOpen: false,
    drawerEndOpen: false,
    drawerStartPanelId: '',
    drawerEndPanelId: '',


    onTabClick: (e) => {
      let panelId = e.target.closest('[data-panel-id]')?.dataset.panelId;
      if (panelId && panelId !== this.$.fullscreenPanelId) {
        this._switchFullscreenPanel(panelId);
      }
    },


    onDrawerBackdropClick: () => this.closeDrawer(),
  };

  connectedCallback() {
    super.connectedCallback?.();
    this._syncPeerGroupRegistration();
  }

  /**
   * Register panel type
   * @param {string} name - Panel type name
   * @param {Object} config - Panel configuration
   * @param {string} [config.title] - Default title
   * @param {string} [config.icon] - Material Symbols icon name
   * @param {string} [config.component] - Custom element tag name
   * @param {Array} [config.menuActions] - Fold-down header menu action descriptors
   * @param {import('./../LayoutTree.js').LayoutBehavior} [config.behavior] - Default behavior for panels of this type
   */
  registerPanelType(name, config) {
    ensureMaterialSymbols([config.icon || 'dashboard']);
    this.$.panelTypes = {
      ...this.$.panelTypes,
      [name]: config,
    };
  }

  initCallback() {
    ensureMaterialSymbols(['dashboard', 'chevron_left', 'chevron_right']);
    this._loadLayout();


    this.addEventListener('layout-change', () => this._saveLayout());


    this.addEventListener('panel-type-menu', (e) => this._onPanelTypeMenu(e));
    this.addEventListener('panel-type-select', (e) => this._onPanelTypeSelect(e));
    this.addEventListener('panel-fullscreen', (e) => this._onPanelFullscreen(e));
    this.addEventListener('panel-collapse-toggle', (e) => this._onPanelCollapseToggle(e));
    this.addEventListener('panel-menu-action', (e) => this._onPanelMenuAction(e));
    this.addEventListener('panel-close', (e) => this._onPanelClose(e));
    this._drawerPointerMoveHandler = (e) => this._onDrawerPointerMove(e);
    this._drawerPointerUpHandler = (e) => this._onDrawerPointerUp(e);
    this._drawerPointerCancelHandler = (e) => this._onDrawerPointerCancel(e);
    this.addEventListener('pointermove', this._drawerPointerMoveHandler);
    this.addEventListener('pointerup', this._drawerPointerUpHandler);
    this.addEventListener('pointercancel', this._drawerPointerCancelHandler);
    this._drawerRailPointerDownHandler = (e) => this._onDrawerRailPointerDown(e);
    this._drawerRailPointerOverHandler = (e) => this._onDrawerRailHover(e);
    this.addEventListener('pointerdown', this._drawerRailPointerDownHandler);
    this.addEventListener('pointerover', this._drawerRailPointerOverHandler);
    this.addEventListener('mouseover', this._drawerRailPointerOverHandler);
    this._drawerClickCaptureHandler = (e) => this._onDrawerClickCapture(e);
    this.addEventListener('click', this._drawerClickCaptureHandler, true);


    this._resizeFallback = () => {
      this._scheduleResponsiveLayout();
      scheduleLayoutPeerGroupRefresh(this._layoutPeerGroup);
    };
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => {
        this._scheduleResponsiveLayout();
        scheduleLayoutPeerGroupRefresh(this._layoutPeerGroup);
      });
      this._resizeObserver.observe(this);
    } else if (typeof window !== 'undefined') {
      window.addEventListener('resize', this._resizeFallback);
    }
  }

  disconnectedCallback() {
    this._unregisterPeerGroup();
    this._resizeObserver?.disconnect();
    if (this._resizeFallback && typeof window !== 'undefined') {
      window.removeEventListener('resize', this._resizeFallback);
    }
    if (this._responsiveFrame && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this._responsiveFrame);
      this._responsiveFrame = 0;
    }
    if (this._drawerPointerMoveHandler) {
      this.removeEventListener('pointermove', this._drawerPointerMoveHandler);
      this.removeEventListener('pointerup', this._drawerPointerUpHandler);
      this.removeEventListener('pointercancel', this._drawerPointerCancelHandler);
    }
    if (this._drawerRailPointerDownHandler) {
      this.removeEventListener('pointerdown', this._drawerRailPointerDownHandler);
      this.removeEventListener('pointerover', this._drawerRailPointerOverHandler);
      this.removeEventListener('mouseover', this._drawerRailPointerOverHandler);
    }
    if (this._drawerClickCaptureHandler) {
      this.removeEventListener('click', this._drawerClickCaptureHandler, true);
    }
    this._clearDrawerRailPeek();
    super.disconnectedCallback?.();
  }

  renderCallback() {
    this._renderRoot();
    this._scheduleResponsiveLayout();
    this.sub('@layout-peer-group', () => this._syncPeerGroupRegistration());
    this.sub('layoutTree', () => {
      this._renderRoot();
      this._scheduleResponsiveLayout();

      if (this.$.fullscreenPanelId) {

        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(() => {
            let allPanels = this.querySelectorAll('layout-node[node-type="panel"]');

            let panelExists = Array.from(allPanels).some(
              (p) => p.$.nodeId === this.$.fullscreenPanelId
            );
            if (panelExists) {
              this._updateTabItems(allPanels, this.$.fullscreenPanelId);
            } else {

              this.$.fullscreenPanelId = null;
              this.$.hasFullscreenTabs = false;
              this.$.tabItems = [];
              allPanels.forEach((p) => {
                p.removeAttribute('fullscreen');
                p.$.isFullscreen = false;
                this.#setPanelVisible(p, true);
              });
            }
          });
        }
      }
    });
  }

  _loadLayout() {
    let storageKey = this.$['@storage-key'];


    if (storageKey && typeof localStorage !== 'undefined') {
      let stored = localStorage.getItem(storageKey);
      if (stored) {
        try {
          this.$.layoutTree = LayoutTree.deserialize(stored);
          return;
        } catch (e) {
          void e;
        }
      }
    }


    let layoutAttr = this.getAttribute('layout');
    if (layoutAttr) {
      try {
        this.$.layoutTree = JSON.parse(layoutAttr);
        return;
      } catch (e) {
        void e;
      }
    }


    this.$.layoutTree = LayoutTree.createPanel('default');
  }

  _saveLayout() {
    let storageKey = this.$['@storage-key'];
    if (storageKey && this.$.layoutTree && typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey, LayoutTree.serialize(this.$.layoutTree));
    }
  }

  _getAttributeBehavior() {
    let autoCollapseAttr = this.getAttribute('auto-collapse');
    let autoCollapse = autoCollapseAttr === null
      ? this.$['@auto-collapse'] !== false
      : autoCollapseAttr !== 'false' && autoCollapseAttr !== 'never';
    return LayoutTree.normalizeLayoutBehavior({
      minInlineSize: this.getAttribute('min-panel-inline-size') || this.$['@min-panel-inline-size'],
      minBlockSize: this.getAttribute('min-panel-block-size') || this.$['@min-panel-block-size'],
      collapse: autoCollapse ? 'auto' : 'never',
      overflow: this.getAttribute('overflow-mode') || this.$['@overflow-mode'],
      responsiveMode: this.getAttribute('responsive-mode') || this.$['@responsive-mode'],
      responsiveBreakpoint: this.getAttribute('responsive-breakpoint') || this.$['@responsive-breakpoint'],
      swipeControl: this.getAttribute('swipe-control') || this.$['@swipe-control'],
      drawerHoverOpen: this.getAttribute('drawer-hover-open') === null
        ? this.$['@drawer-hover-open']
        : this.getAttribute('drawer-hover-open') !== 'false',
    });
  }

  _getRootBehavior() {
    return LayoutTree.normalizeLayoutBehavior(this.$.layoutBehavior || {}, this._getAttributeBehavior());
  }

  _renderRoot() {
    if (!this.$.layoutTree || !this.ref.root) return;

    let rootNodes = Array.from(this.ref.root.children)
      .filter((child) => child.localName === 'layout-node');
    let rootNode = rootNodes.find((node) => node.$?.nodeId === this.$.layoutTree.id);
    if (!rootNode) {
      let promotedRoot = Array.from(this.ref.root.querySelectorAll('layout-node'))
        .find((node) => node.$?.nodeId === this.$.layoutTree.id);
      if (promotedRoot) {
        if (promotedRoot.parentElement !== this.ref.root) {
          suspendLayoutSubtree(promotedRoot, { reason: 'layout-move' });
          try {
            this.ref.root.insertBefore(promotedRoot, rootNodes[0] || null);
          } finally {
            resumeLayoutSubtree(promotedRoot, { reason: 'layout-move' });
          }
        }
        rootNode = promotedRoot;
      }
    }
    if (!rootNode) {
      let reusableRoot = rootNodes.find((node) => {
        let nodeId = node.$?.nodeId;
        return nodeId && LayoutTree.findNode(this.$.layoutTree, nodeId);
      });
      if (reusableRoot) {
        rootNode = document.createElement('layout-node');
        this.ref.root.insertBefore(rootNode, reusableRoot);
      }
    }
    if (!rootNode) {
      rootNode = rootNodes[0];
    }
    if (!rootNode) {
      rootNode = document.createElement('layout-node');
      this.ref.root.appendChild(rootNode);
    }

    let chromeEnabled = this.$.panelChrome !== false;
    rootNode.$.panelChrome = chromeEnabled;
    rootNode.setAttribute('panel-chrome', chromeEnabled ? 'default' : 'none');
    rootNode.$.nodeData = this.$.layoutTree;

    for (let node of Array.from(this.ref.root.children)) {
      if (node.localName === 'layout-node' && node !== rootNode) {
        node.remove();
      }
    }
    this._syncLayoutPeerState();
  }

  _syncPeerGroupRegistration() {
    let nextGroup = normalizeLayoutPeerGroup(this.getAttribute('layout-peer-group') || this.$?.['@layout-peer-group']);
    let previousGroup = this._layoutPeerGroup || '';
    if (previousGroup === nextGroup) {
      this._syncLayoutPeerState();
      return;
    }

    if (previousGroup) {
      let previousLayouts = LAYOUT_PEER_GROUPS.get(previousGroup);
      previousLayouts?.delete(this);
      if (!previousLayouts?.size) LAYOUT_PEER_GROUPS.delete(previousGroup);
      scheduleLayoutPeerGroupRefresh(previousGroup);
    }

    this._layoutPeerGroup = nextGroup;
    if (nextGroup) {
      if (!LAYOUT_PEER_GROUPS.has(nextGroup)) LAYOUT_PEER_GROUPS.set(nextGroup, new Set());
      LAYOUT_PEER_GROUPS.get(nextGroup).add(this);
      scheduleLayoutPeerGroupRefresh(nextGroup);
    }
    this._syncLayoutPeerState();
  }

  _unregisterPeerGroup() {
    let group = this._layoutPeerGroup || '';
    if (!group) return;
    let layouts = LAYOUT_PEER_GROUPS.get(group);
    layouts?.delete(this);
    if (!layouts?.size) LAYOUT_PEER_GROUPS.delete(group);
    this._layoutPeerGroup = '';
    scheduleLayoutPeerGroupRefresh(group);
  }

  _syncLayoutPeerState() {
    let group = this._layoutPeerGroup || '';
    let layouts = group ? Array.from(LAYOUT_PEER_GROUPS.get(group) || []) : [];
    let peerInfo = group && isVisibleLayoutPeer(this)
      ? resolvePeerCollapseInfo(this, layouts)
      : { hasPeers: false, direction: 'horizontal', slot: 'first' };

    toggleAttributeIfChanged(this, 'layout-peer-active', peerInfo.hasPeers);
    syncOptionalAttribute(this, 'layout-peer-collapse-dir', peerInfo.hasPeers ? peerInfo.direction : '');
    syncOptionalAttribute(this, 'layout-peer-collapse-side', peerInfo.hasPeers ? peerInfo.slot : '');

    let rootNode = this.ref.root?.querySelector?.(':scope > layout-node');
    if (!rootNode?.$) {
      toggleAttributeIfChanged(this, 'root-collapsed', false);
      syncOptionalAttribute(this, 'root-collapse-dir', '');
      syncOptionalAttribute(this, 'root-collapse-side', '');
      return;
    }

    rootNode.$.hasLayoutPeers = peerInfo.hasPeers;
    rootNode.$.peerCollapseDirection = peerInfo.direction;
    rootNode.$.peerCollapseSlot = peerInfo.slot;
    rootNode.$.peerCollapseGroup = group;
    rootNode._updatePanelInfo?.();

    let rootCollapsed = rootNode.getAttribute('node-type') === 'panel' && Boolean(rootNode.$.isCollapsed);
    toggleAttributeIfChanged(this, 'root-collapsed', rootCollapsed);
    syncOptionalAttribute(this, 'root-collapse-dir', rootCollapsed ? rootNode.$.collapseDirection : '');
    syncOptionalAttribute(this, 'root-collapse-side', rootCollapsed ? rootNode.$.collapseSlot : '');
  }

  _scheduleResponsiveLayout() {
    if (typeof requestAnimationFrame === 'undefined') {
      this._applyResponsiveLayout();
      return;
    }
    if (this._responsiveFrame) return;
    this._responsiveFrame = requestAnimationFrame(() => {
      this._responsiveFrame = 0;
      this._applyResponsiveLayout();
    });
  }

  _applyResponsiveLayout() {
    if (!this.$.layoutTree || !this.isConnected) return;
    let behavior = this._getRootBehavior();
    let rect = this.getBoundingClientRect();
    let tree = this.$.layoutTree;
    let resolvePanelBehavior = (node, branchBehavior) => {
      let typeBehavior = this.$.panelTypes[node.panelType]?.behavior || {};
      return LayoutTree.getNodeBehavior(node, LayoutTree.normalizeLayoutBehavior(typeBehavior, branchBehavior));
    };
    let layoutMinSize = LayoutTree.resolveLayoutMinSize(tree, {
      fallbackBehavior: behavior,
      resolvePanelBehavior,
    });
    let responsiveState = LayoutTree.resolveResponsiveLayoutState(behavior, {
      inlineSize: rect.width,
      blockSize: rect.height,
      layoutMinSize,
    });

    setAttributeIfChanged(this, 'responsive-mode', behavior.responsiveMode);
    setAttributeIfChanged(this, 'swipe-control', behavior.swipeControl);
    setAttributeIfChanged(this, 'overflow-mode', behavior.overflow);
    toggleAttributeIfChanged(this, 'responsive-active', responsiveState.responsiveActive);
    toggleAttributeIfChanged(this, 'scroll-inline-active', responsiveState.scrollInline);
    toggleAttributeIfChanged(this, 'scroll-block-active', responsiveState.scrollBlock);
    for (let [name, value] of Object.entries(responsiveState.cssVars)) {
      setStylePropertyIfChanged(this.style, name, value);
    }
    this._syncFullscreenBounds();
    this._lastResponsiveState = responsiveState;
    this._lastDrawerBehavior = behavior;
    this._syncDrawerProjection(responsiveState, behavior, tree);

    if (this.$.fullscreenPanelId) return;

    let compressionChanged = responsiveState.collapseAllowed
      ? LayoutTree.applyPriorityCompression(tree, {
        inlineSize: rect.width,
        blockSize: rect.height,
        fallbackBehavior: behavior,
      }, {
        fallbackBehavior: behavior,
        resolvePanelBehavior,
      })
      : LayoutTree.clearPriorityCompression(tree);
    if (compressionChanged) {
      this._renderRoot();
      this._scheduleResponsiveLayout();
      return;
    }

    if (!responsiveState.collapseAllowed) {
      if (this._clearAutoCollapsedPanels(tree)) {
        this.$.layoutTree = { ...tree };
        this._saveLayout();
      }
      return;
    }

    if (this._restoreAutoCollapsedPanels(tree)) {
      this.$.layoutTree = { ...tree };
      this._saveLayout();
      this._scheduleResponsiveLayout();
      return;
    }

    let candidates = this._collectAutoCollapseCandidates(tree, behavior)
      .sort((a, b) => a.behavior.importance - b.behavior.importance);

    for (let candidate of candidates) {
      let node = LayoutTree.findNode(tree, candidate.node.id);
      if (!node || node.collapsed || !this._canAutoCollapseNode(tree, node, candidate.behavior)) continue;
      node.collapsed = true;
      node.autoCollapsed = true;
      node.manualExpanded = false;
      this.$.layoutTree = { ...tree };
      this._saveLayout();
      this._scheduleResponsiveLayout();
      return;
    }
  }

  _collectAutoCollapseCandidates(tree, fallbackBehavior) {
    let candidates = [];
    let walk = (node, fallback) => {
      if (!node) return;
      let branchBehavior = LayoutTree.getNodeBehavior(node, fallback);
      if (node.type === 'panel') {
        let typeBehavior = this.$.panelTypes[node.panelType]?.behavior || {};
        let behavior = LayoutTree.getNodeBehavior(node, LayoutTree.normalizeLayoutBehavior(typeBehavior, branchBehavior));
        let panelNode = this._findPanelNode(node.id);
        if (!panelNode || node.collapsed) return;
        let rect = panelNode.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        if (rect.width < behavior.minInlineSize || rect.height < behavior.minBlockSize) {
          candidates.push({ node, behavior, rect });
        }
        return;
      }
      walk(node.first, branchBehavior);
      walk(node.second, branchBehavior);
    };
    walk(tree, fallbackBehavior);
    return candidates;
  }

  _restoreAutoCollapsedPanels(tree) {
    let changed = false;
    let walk = (node, fallback) => {
      if (!node) return;
      let branchBehavior = LayoutTree.getNodeBehavior(node, fallback);
      if (node.type === 'panel') {
        let typeBehavior = this.$.panelTypes[node.panelType]?.behavior || {};
        let behavior = LayoutTree.getNodeBehavior(node, LayoutTree.normalizeLayoutBehavior(typeBehavior, branchBehavior));
        if (
          node.collapsed &&
          node.autoCollapsed &&
          this._hasExpandedSpace(tree, node, behavior) &&
          this._canRestoreAutoCollapsedPanel(tree, node)
        ) {
          node.collapsed = false;
          node.autoCollapsed = false;
          changed = true;
        }
        return;
      }
      walk(node.first, branchBehavior);
      walk(node.second, branchBehavior);
    };
    walk(tree, this._getRootBehavior());
    return changed;
  }

  _clearAutoCollapsedPanels(tree) {
    let changed = false;
    let walk = (node) => {
      if (!node) return;
      if (node.type === 'panel') {
        if (node.autoCollapsed) {
          node.collapsed = false;
          node.autoCollapsed = false;
          changed = true;
        }
        return;
      }
      walk(node.first);
      walk(node.second);
    };
    walk(tree);
    return changed;
  }

  _canAutoCollapseNode(tree, node, behavior) {
    if (behavior.collapse !== 'auto') return false;
    if (node.manualExpanded) return false;
    let parentInfo = LayoutTree.findParent(tree, node.id);
    if (!parentInfo) return false;
    let sibling = parentInfo.which === 'first' ? parentInfo.parent.second : parentInfo.parent.first;
    return !sibling?.collapsed;
  }

  _hasExpandedSpace(tree, node, behavior) {
    let parentInfo = LayoutTree.findParent(tree, node.id);
    let rect = this.getBoundingClientRect();
    let inlineSize = rect.width;
    let blockSize = rect.height;

    if (parentInfo) {
      let parentNode = this._findLayoutNode(parentInfo.parent.id);
      let parentRect = parentNode?.getBoundingClientRect();
      if (parentRect?.width > 0 && parentRect?.height > 0) {
        let ratio = parentInfo.parent.ratio || 0.5;
        let share = parentInfo.which === 'first' ? ratio : 1 - ratio;
        if (parentInfo.parent.direction === 'horizontal') {
          inlineSize = parentRect.width * share;
          blockSize = parentRect.height;
        } else {
          inlineSize = parentRect.width;
          blockSize = parentRect.height * share;
        }
      }
    }

    return inlineSize >= behavior.minInlineSize * 1.08 && blockSize >= behavior.minBlockSize * 1.08;
  }

  _canRestoreAutoCollapsedPanel(tree, targetNode) {
    let rect = this.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    return LayoutTree.branchFitsExpandedState(
      tree,
      rect.width,
      rect.height,
      {
        fallbackBehavior: this._getRootBehavior(),
        restoringNodeId: targetNode.id,
        resolvePanelBehavior: (node, branchBehavior) => {
          let typeBehavior = this.$.panelTypes[node.panelType]?.behavior || {};
          return LayoutTree.getNodeBehavior(
            node,
            LayoutTree.normalizeLayoutBehavior(typeBehavior, branchBehavior)
          );
        },
      }
    );
  }

  _syncDrawerProjection(responsiveState, behavior, tree) {
    let active = Boolean(responsiveState.drawerActive) && !this.$.fullscreenPanelId;
    toggleAttributeIfChanged(this, 'drawer-mode-active', active);
    if (!active) {
      this._clearDrawerProjection();
      return;
    }

    let projection = LayoutTree.resolveMobileDrawerLayout(tree, {
      fallbackBehavior: behavior,
      resolvePanelBehavior: (node, branchBehavior) => {
        let typeBehavior = this.$.panelTypes[node.panelType]?.behavior || {};
        return LayoutTree.getNodeBehavior(
          node,
          LayoutTree.normalizeLayoutBehavior(typeBehavior, branchBehavior)
        );
      },
    });
    this._drawerProjection = projection;

    let hasStart = projection.startPanelIds.length > 0;
    let hasEnd = projection.endPanelIds.length > 0;
    let startPanelId = this._resolveDrawerPanelId('start', projection.startPanelIds);
    let endPanelId = this._resolveDrawerPanelId('end', projection.endPanelIds);
    let startOpen = hasStart && this.$.drawerStartOpen;
    let endOpen = hasEnd && this.$.drawerEndOpen;
    let startRail = projection.panels.some((panel) => panel.dock === 'start' && panel.swipeControl === 'rail');
    let endRail = projection.panels.some((panel) => panel.dock === 'end' && panel.swipeControl === 'rail');
    toggleAttributeIfChanged(this, 'drawer-start-open', startOpen);
    toggleAttributeIfChanged(this, 'drawer-end-open', endOpen);
    toggleAttributeIfChanged(this, 'drawer-start-rail', startRail);
    toggleAttributeIfChanged(this, 'drawer-end-rail', endRail);
    if (startPanelId) {
      setAttributeIfChanged(this, 'drawer-start-panel-id', startPanelId);
    } else {
      this.removeAttribute('drawer-start-panel-id');
    }
    if (endPanelId) {
      setAttributeIfChanged(this, 'drawer-end-panel-id', endPanelId);
    } else {
      this.removeAttribute('drawer-end-panel-id');
    }
    if (projection.primaryPanelId) {
      setAttributeIfChanged(this, 'drawer-primary-panel-id', projection.primaryPanelId);
    } else {
      this.removeAttribute('drawer-primary-panel-id');
    }

    let panelMap = new Map(projection.panels.map((panel) => [panel.id, panel]));
    for (let node of this.querySelectorAll('layout-node[node-type="panel"]')) {
      let panel = panelMap.get(node.$?.nodeId);
      if (!panel) {
        this._clearDrawerNode(node);
        continue;
      }
      setAttributeIfChanged(node, 'mobile-dock', panel.dock);
      toggleAttributeIfChanged(node, 'drawer-primary', panel.dock === 'primary');
      let open = (
        (panel.dock === 'start' && startOpen && panel.id === startPanelId) ||
        (panel.dock === 'end' && endOpen && panel.id === endPanelId)
      );
      let rail = panel.swipeControl === 'rail' && (panel.dock === 'start' || panel.dock === 'end');
      this._syncDrawerNodeInteractionState(node, panel, open, rail);
      toggleAttributeIfChanged(
        node,
        'drawer-active-panel',
        (panel.dock === 'start' && panel.id === startPanelId) ||
          (panel.dock === 'end' && panel.id === endPanelId)
      );
      toggleAttributeIfChanged(node, 'drawer-open', open);
      if (panel.dock === 'start' || panel.dock === 'end') {
        let closedTranslate = this._getDrawerClosedTranslate(panel.dock, panel.swipeControl, open);
        let translate = open ? '0%' : closedTranslate;
        setStylePropertyIfChanged(
          node.style,
          '--sn-layout-drawer-translate',
          translate
        );
        setImportantStylePropertyIfChanged(node.style, 'transform', drawerTranslateTransform(translate));
        if (panel.dock === 'start') {
          setStylePropertyIfChanged(
            node.style,
            'inset-inline-start',
            '0px'
          );
          node.style.removeProperty('inset-inline-end');
        } else {
          setStylePropertyIfChanged(
            node.style,
            'inset-inline-end',
            '0px'
          );
          node.style.removeProperty('inset-inline-start');
        }
      } else {
        node.style.removeProperty('--sn-layout-drawer-translate');
        node.style.removeProperty('transform');
        node.style.removeProperty('inset-inline-start');
        node.style.removeProperty('inset-inline-end');
      }
    }
    this._scheduleDrawerRailPeek(startOpen, endOpen);
  }

  _clearDrawerProjection() {
    this._clearDrawerRailPeek();
    this.removeAttribute('drawer-mode-active');
    this.removeAttribute('drawer-start-open');
    this.removeAttribute('drawer-end-open');
    this.removeAttribute('drawer-start-rail');
    this.removeAttribute('drawer-end-rail');
    this.removeAttribute('drawer-primary-panel-id');
    this.removeAttribute('drawer-start-panel-id');
    this.removeAttribute('drawer-end-panel-id');
    this.removeAttribute('drawer-dragging');
    this._drawerProjection = null;
    for (let node of this.querySelectorAll('layout-node[mobile-dock], layout-node[drawer-open]')) {
      this._clearDrawerNode(node);
    }
  }

  _clearDrawerNode(node) {
    node.removeAttribute('mobile-dock');
    node.removeAttribute('drawer-primary');
    node.removeAttribute('drawer-open');
    node.removeAttribute('drawer-active-panel');
    node.removeAttribute('drawer-dragging');
    node.removeAttribute('drawer-expanded');
    node.removeAttribute('drawer-rail');
    node.removeAttribute('drawer-rail-collapsed');
    node.removeAttribute('drawer-hover-open');
    delete node.dataset.drawerDock;
    delete node.dataset.drawerPanelId;
    delete node.dataset.swipeControl;
    this._restoreDrawerNodeCollapseState(node);
    node.style.removeProperty('transform');
    node.style.removeProperty('--sn-layout-drawer-translate');
    node.style.removeProperty('inset-inline-start');
    node.style.removeProperty('inset-inline-end');
  }

  _syncDrawerNodeInteractionState(node, panel, open, rail) {
    let dock = panel.dock;
    toggleAttributeIfChanged(node, 'drawer-rail', rail);
    toggleAttributeIfChanged(node, 'drawer-hover-open', rail && panel.drawerHoverOpen);
    if (dock === 'start' || dock === 'end') {
      node.dataset.drawerDock = dock;
      node.dataset.drawerPanelId = panel.id;
      node.dataset.swipeControl = panel.swipeControl;
    } else {
      delete node.dataset.drawerDock;
      delete node.dataset.drawerPanelId;
      delete node.dataset.swipeControl;
    }
    if (rail && !open) {
      this._setDrawerNodeRail(node, dock);
      return;
    }
    node.removeAttribute('drawer-rail-collapsed');
    this._setDrawerNodeExpanded(node, true);
  }

  _scheduleDrawerRailPeek(startOpen, endOpen) {
    if (this._drawerRailPeekPlayed || this._drawerRailPeekTimer || this._drawerRailPeekClearTimer) return;
    if (startOpen || endOpen || this.$.fullscreenPanelId) return;
    let nodes = this.querySelectorAll('layout-node[drawer-rail][drawer-rail-collapsed][data-drawer-dock]');
    if (!nodes.length) return;
    this._drawerRailPeekPlayed = true;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      return;
    }
    this._drawerRailPeekTimer = setTimeout(() => {
      this._drawerRailPeekTimer = 0;
      this._runDrawerRailPeek();
    }, 220);
  }

  _runDrawerRailPeek() {
    if (!this.hasAttribute('drawer-mode-active') || this.$.drawerStartOpen || this.$.drawerEndOpen) return;
    let nodes = this.querySelectorAll('layout-node[drawer-rail][drawer-rail-collapsed][data-drawer-dock]');
    if (!nodes.length) return;
    for (let node of nodes) {
      let dock = node.dataset.drawerDock;
      let distance = dock === 'start'
        ? 'var(--sn-layout-drawer-rail-peek-distance, 10px)'
        : 'calc(var(--sn-layout-drawer-rail-peek-distance, 10px) * -1)';
      node.setAttribute('drawer-rail-peeking', '');
      setImportantStylePropertyIfChanged(node.style, 'transform', drawerTranslateTransform(distance));
    }
    this._drawerRailPeekClearTimer = setTimeout(() => {
      this._drawerRailPeekClearTimer = 0;
      this._clearDrawerRailPeek();
    }, 360);
  }

  _clearDrawerRailPeek() {
    if (this._drawerRailPeekTimer) {
      clearTimeout(this._drawerRailPeekTimer);
      this._drawerRailPeekTimer = 0;
    }
    if (this._drawerRailPeekClearTimer) {
      clearTimeout(this._drawerRailPeekClearTimer);
      this._drawerRailPeekClearTimer = 0;
    }
    for (let node of this.querySelectorAll('layout-node[drawer-rail-peeking]')) {
      node.removeAttribute('drawer-rail-peeking');
      if (!node.hasAttribute('drawer-rail-collapsed')) continue;
      let dock = node.dataset.drawerDock;
      let closedTranslate = this._getDrawerClosedTranslateForNode(node, dock);
      setImportantStylePropertyIfChanged(node.style, 'transform', drawerTranslateTransform(closedTranslate));
    }
  }

  _setDrawerNodeExpanded(node, expanded) {
    toggleAttributeIfChanged(node, 'drawer-expanded', expanded);
    if (!expanded) {
      this._restoreDrawerNodeCollapseState(node);
      return;
    }
    if (node.$) {
      node.$.isCollapsed = false;
      node.$.collapseIcon = node._getCollapseIcon?.() || node.$.collapseIcon;
    }
    node.removeAttribute('collapsed');
    node.removeAttribute('auto-collapsed');
    node.removeAttribute('collapse-dir');
    if (node.ref?.panelContent) {
      node.ref.panelContent.hidden = false;
    }
    node._syncCollapsePresentation?.();
  }

  _setDrawerNodeRail(node, dock) {
    node.removeAttribute('drawer-expanded');
    node.setAttribute('drawer-rail-collapsed', '');
    node.setAttribute('collapse-dir', 'horizontal');
    if (node.$) {
      node.$.collapseDirection = 'horizontal';
      node.$.collapseSlot = dock === 'end' ? 'second' : 'first';
      node.$.isCollapsed = true;
      node.$.collapseIcon = node._getCollapseIcon?.() || node.$.collapseIcon;
    }
    if (node.ref?.panelContent) {
      node.ref.panelContent.hidden = true;
    }
    node._syncCollapsePresentation?.();
  }

  _restoreDrawerNodeCollapseState(node) {
    let nodeData = node.$?.nodeData;
    if (!nodeData || nodeData.type !== 'panel') return;
    let collapsed = Boolean(nodeData.collapsed);
    if (node.$) {
      node.$.isCollapsed = collapsed;
    }
    toggleAttributeIfChanged(node, 'collapsed', collapsed);
    toggleAttributeIfChanged(node, 'auto-collapsed', Boolean(nodeData.autoCollapsed));
    if (node.ref?.panelContent) {
      node.ref.panelContent.hidden = collapsed;
    }
    node._syncCollapsePresentation?.();
  }

  _resolveDrawerPanelId(dock, ids = []) {
    let prop = dock === 'start' ? 'drawerStartPanelId' : 'drawerEndPanelId';
    let current = this.$[prop] || '';
    if (!ids.includes(current)) {
      current = ids[0] || '';
      this.$[prop] = current;
    }
    return current;
  }

  _setActiveDrawerPanelId(dock, panelId) {
    if (!panelId) return;
    if (dock === 'start') {
      this.$.drawerStartPanelId = panelId;
    } else if (dock === 'end') {
      this.$.drawerEndPanelId = panelId;
    }
  }

  _getActiveDrawerPanelId(dock) {
    return dock === 'start' ? this.$.drawerStartPanelId : this.$.drawerEndPanelId;
  }

  openDrawer(dock, panelId = '') {
    this._setDrawerOpen(dock, true, panelId);
  }

  closeDrawer(dock = 'all') {
    if (dock === 'start' || dock === 'all') this.$.drawerStartOpen = false;
    if (dock === 'end' || dock === 'all') this.$.drawerEndOpen = false;
    this._clearDrawerDrag(dock);
    this._resyncDrawerProjection();
  }

  toggleDrawer(dock, panelId = '') {
    let activePanelId = this._getActiveDrawerPanelId(dock);
    let nextPanelId = panelId || activePanelId;
    let sameOpenPanel = this._isDrawerOpen(dock) && (!panelId || panelId === activePanelId);
    this._setDrawerOpen(dock, !sameOpenPanel, nextPanelId);
  }

  _setDrawerOpen(dock, open, panelId = '') {
    this._clearDrawerRailPeek();
    if (dock === 'start') {
      if (panelId) this.$.drawerStartPanelId = panelId;
      this.$.drawerStartOpen = Boolean(open);
      if (open) this.$.drawerEndOpen = false;
    } else if (dock === 'end') {
      if (panelId) this.$.drawerEndPanelId = panelId;
      this.$.drawerEndOpen = Boolean(open);
      if (open) this.$.drawerStartOpen = false;
    }
    this._clearDrawerDrag('all');
    this._resyncDrawerProjection();
  }

  _isDrawerOpen(dock) {
    return dock === 'start' ? Boolean(this.$.drawerStartOpen) : Boolean(this.$.drawerEndOpen);
  }

  _resyncDrawerProjection() {
    if (!this._lastResponsiveState || !this._lastDrawerBehavior || !this.$.layoutTree) return;
    this._syncDrawerProjection(this._lastResponsiveState, this._lastDrawerBehavior, this.$.layoutTree);
  }

  _onDrawerDockPointerDown(e) {
    if (!this.hasAttribute('drawer-mode-active')) return;
    if (e.button !== undefined && e.button !== 0) return;
    let target = this._getDrawerGestureTarget(e);
    let dock = target?.dataset?.drawerDock;
    if (dock !== 'start' && dock !== 'end') return;
    let panelId = target?.dataset?.drawerPanelId || this._getActiveDrawerPanelId(dock);
    let activePanelId = this._getActiveDrawerPanelId(dock);
    let startOpen = this._isDrawerOpen(dock) && (!panelId || panelId === activePanelId);
    let drawerNode = this._getDrawerNode(dock, panelId);
    let width = drawerNode?.getBoundingClientRect?.().width || this._getFallbackDrawerWidth();
    if (target?.dataset?.swipeControl === 'rail') {
      width = this._getFallbackDrawerWidth();
    }
    if (width <= 0) width = this._getFallbackDrawerWidth();
    this._drawerGesture = {
      pointerId: e.pointerId,
      dock,
      panelId,
      startX: e.clientX,
      width,
      startOpen,
      prepared: false,
      moved: false,
      target,
    };
    this._setDrawerGestureDragging(this._drawerGesture);
    target?.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  _onDrawerRailPointerDown(e) {
    if (!this.hasAttribute('drawer-mode-active')) return;
    if (e.button !== undefined && e.button !== 0) return;
    this._clearDrawerRailPeek();
    let target = e.target?.closest?.('layout-node[drawer-rail][drawer-rail-collapsed][data-drawer-dock]');
    if (target && this.contains(target)) {
      let dock = target.dataset.drawerDock;
      let openDock = this.$.drawerStartOpen ? 'start' : this.$.drawerEndOpen ? 'end' : '';
      if (openDock && openDock !== dock) {
        this._ignoreNextRailCollapseToggle = target.dataset.drawerPanelId || '';
        this.closeDrawer(openDock);
        this._suppressDrawerContentClicks();
        e.preventDefault();
        return;
      }
      this._onDrawerDockPointerDown(e);
      if (this._drawerGesture) {
        this._drawerGesture.source = 'rail';
      }
      return;
    }
    this._onDrawerContentPointerDown(e);
    if (!this._drawerGesture) {
      this._onDrawerPrimaryPointerDown(e);
    }
  }

  _onDrawerContentPointerDown(e) {
    if (this._isDrawerContentSwipeBlocked(e.target)) return;
    let target = e.target?.closest?.('layout-node[drawer-open][drawer-expanded][data-drawer-dock]');
    if (!target || !this.contains(target)) return;
    if (target.dataset.swipeControl !== 'rail') return;
    let dock = target.dataset.drawerDock;
    if (dock !== 'start' && dock !== 'end') return;
    let panelId = target.dataset.drawerPanelId || this._getActiveDrawerPanelId(dock);
    let width = target.getBoundingClientRect?.().width || this._getFallbackDrawerWidth();
    if (width <= 0) width = this._getFallbackDrawerWidth();
    this._drawerGesture = {
      pointerId: e.pointerId,
      dock,
      panelId,
      startX: e.clientX,
      startY: e.clientY,
      width,
      startOpen: true,
      prepared: false,
      moved: false,
      pending: true,
      target,
      source: 'content',
    };
    this._captureDrawerGesturePointer(this._drawerGesture);
  }

  _isDrawerContentSwipeBlocked(target) {
    return Boolean(target?.closest?.(
      'button, a, input, textarea, select, [contenteditable="true"], .split-resizer, canvas, node-canvas, canvas-graph'
    ));
  }

  _onDrawerPrimaryPointerDown(e) {
    if (this.$.drawerStartOpen || this.$.drawerEndOpen) return;
    if (this._isDrawerContentSwipeBlocked(e.target)) return;
    let target = e.target?.closest?.('layout-node[drawer-primary]');
    if (!target || !this.contains(target)) return;
    this._drawerGesture = {
      pointerId: e.pointerId,
      dock: '',
      panelId: '',
      startX: e.clientX,
      startY: e.clientY,
      width: this._getFallbackDrawerWidth(),
      startOpen: false,
      prepared: false,
      moved: false,
      pending: true,
      target,
      source: 'primary',
    };
    this._captureDrawerGesturePointer(this._drawerGesture);
  }

  _onDrawerRailHover(e) {
    if (!this.hasAttribute('drawer-mode-active')) return;
    if (e.pointerType && e.pointerType !== 'mouse') return;
    let target = e.target?.closest?.('layout-node[drawer-rail][drawer-rail-collapsed][drawer-hover-open][data-drawer-dock]');
    if (!target || !this.contains(target)) return;
    let dock = target.dataset.drawerDock;
    let panelId = target.dataset.drawerPanelId || '';
    if (dock !== 'start' && dock !== 'end') return;
    this.openDrawer(dock, panelId);
  }

  _getDrawerGestureTarget(e) {
    let currentTarget = e.currentTarget;
    if (currentTarget?.dataset?.drawerDock) return currentTarget;
    return e.target?.closest?.('[data-drawer-dock]');
  }

  _onDrawerPointerMove(e) {
    let gesture = this._drawerGesture;
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    let delta = e.clientX - gesture.startX;
    if (gesture.pending && !this._activatePendingDrawerGesture(gesture, e, delta)) return;
    if (Math.abs(delta) > 4) gesture.moved = true;
    if (gesture.moved && !gesture.prepared) {
      this._setActiveDrawerPanelId(gesture.dock, gesture.panelId);
      this._prepareDrawerPanelForGesture(gesture.dock, gesture.panelId);
      gesture.prepared = true;
    }
    let progress = this._getDrawerGestureProgress(gesture, delta);
    this._applyDrawerProgress(gesture.dock, progress, gesture.width, gesture.panelId);
    e.preventDefault();
  }

  _onDrawerPointerUp(e) {
    let gesture = this._drawerGesture;
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    if (gesture.pending) {
      gesture.target?.releasePointerCapture?.(gesture.pointerId);
      this._drawerGesture = null;
      return;
    }
    let delta = e.clientX - gesture.startX;
    let progress = this._getDrawerGestureProgress(gesture, delta);
    let committedDrag = gesture.moved && Math.abs(delta) >= this._getDrawerGestureDragThreshold(gesture);
    let open = committedDrag
      ? progress >= 0.5
      : gesture.source === 'rail' ? !gesture.startOpen : progress >= 0.5;
    if (gesture.moved) {
      this._ignoreNextDrawerClick = true;
      this._suppressDrawerContentClicks();
      e.preventDefault();
    }
    if (gesture.source === 'rail') {
      this._ignoreNextRailCollapseToggle = gesture.panelId;
    }
    gesture.target?.releasePointerCapture?.(gesture.pointerId);
    this._clearDrawerDrag(gesture.dock);
    this._drawerGesture = null;
    this._setDrawerOpen(gesture.dock, open, gesture.panelId);
    if (open && !gesture.startOpen) this._suppressDrawerContentClicks();
  }

  _onDrawerPointerCancel(e) {
    let gesture = this._drawerGesture;
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    gesture.target?.releasePointerCapture?.(gesture.pointerId);
    if (!gesture.pending) {
      this._clearDrawerDrag(gesture.dock);
    }
    this._drawerGesture = null;
    this._setDrawerOpen(gesture.dock, gesture.startOpen, gesture.panelId);
  }

  _activatePendingDrawerGesture(gesture, e, delta) {
    let absX = Math.abs(delta);
    let absY = Math.abs((e.clientY ?? gesture.startY) - gesture.startY);
    if (absX < 16 && absY < 16) return false;
    if (absX < 16 || absX <= absY) {
      gesture.target?.releasePointerCapture?.(gesture.pointerId);
      this._drawerGesture = null;
      return false;
    }
    if (gesture.source === 'primary') {
      let dock = delta > 0 ? 'start' : 'end';
      let panelId = this._getActiveDrawerPanelId(dock);
      let drawerNode = this._getDrawerNode(dock, panelId);
      if (!panelId || !drawerNode) {
        this._drawerGesture = null;
        return false;
      }
      gesture.dock = dock;
      gesture.panelId = panelId;
      gesture.width = drawerNode.getBoundingClientRect?.().width || this._getFallbackDrawerWidth();
      if (gesture.width <= 0) gesture.width = this._getFallbackDrawerWidth();
    }
    gesture.pending = false;
    gesture.moved = true;
    this._setDrawerGestureDragging(gesture);
    this._captureDrawerGesturePointer(gesture);
    return true;
  }

  _captureDrawerGesturePointer(gesture) {
    try {
      gesture?.target?.setPointerCapture?.(gesture.pointerId);
    } catch {
      // Pointer capture can fail for synthetic or already-cancelled pointers.
    }
  }

  _getDrawerGestureProgress(gesture, delta) {
    let width = Math.max(1, gesture.width);
    let raw = gesture.dock === 'start'
      ? (gesture.startOpen ? 1 + delta / width : delta / width)
      : (gesture.startOpen ? 1 - delta / width : -delta / width);
    return Math.max(0, Math.min(1, raw));
  }

  _getDrawerGestureDragThreshold(gesture) {
    if (gesture.source !== 'rail') return 4;
    return Math.min(48, Math.max(16, gesture.width * 0.08));
  }

  _drawerNow() {
    return globalThis.performance?.now?.() || Date.now();
  }

  _suppressDrawerContentClicks(duration = 360) {
    this._drawerClickSuppressUntil = Math.max(
      this._drawerClickSuppressUntil || 0,
      this._drawerNow() + duration
    );
  }

  _onDrawerClickCapture(e) {
    if (!this.hasAttribute('drawer-mode-active')) return;
    let target = e.target;
    let drawerNode = target?.closest?.('layout-node[mobile-dock="start"], layout-node[mobile-dock="end"]');
    if (!drawerNode || !this.contains(drawerNode)) return;
    let suppressActive = this._drawerNow() < (this._drawerClickSuppressUntil || 0);
    let suppress = suppressActive
      || drawerNode.hasAttribute('drawer-rail-collapsed')
      || drawerNode.hasAttribute('drawer-dragging');
    if (!suppress) return;
    if (target.closest?.('.collapse-btn')) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
  }

  _prepareDrawerPanelForGesture(dock, panelId) {
    for (let node of this.querySelectorAll(`layout-node[mobile-dock="${dock}"]`)) {
      let active = node.$?.nodeId === panelId;
      toggleAttributeIfChanged(node, 'drawer-active-panel', active);
      if (active && node.hasAttribute('drawer-rail')) {
        node.removeAttribute('drawer-rail-collapsed');
        this._setDrawerNodeExpanded(node, true);
      }
      if (!active) {
        node.removeAttribute('drawer-open');
        let closedTranslate = this._getDrawerClosedTranslateForNode(node, dock);
        setStylePropertyIfChanged(node.style, '--sn-layout-drawer-translate', closedTranslate);
        setImportantStylePropertyIfChanged(node.style, 'transform', drawerTranslateTransform(closedTranslate));
      }
    }
  }

  _applyDrawerProgress(dock, progress, width = this._getFallbackDrawerWidth(), panelId = '') {
    let node = this._getDrawerNode(dock, panelId);
    let rail = node?.dataset?.swipeControl === 'rail';
    let translate = dock === 'start'
      ? (progress - 1) * 100
      : (1 - progress) * 100;
    if (node) {
      node.setAttribute('drawer-dragging', '');
      if (rail) {
        let railWidth = this._getDrawerRailWidth();
        let travel = Math.max(0, width - railWidth);
        let translatePx = dock === 'start'
          ? -travel + progress * travel
          : travel - progress * travel;
        setStylePropertyIfChanged(node.style, '--sn-layout-drawer-translate', `${translatePx}px`);
        setImportantStylePropertyIfChanged(node.style, 'transform', drawerTranslateTransform(`${translatePx}px`));
      } else {
        setStylePropertyIfChanged(node.style, '--sn-layout-drawer-translate', `${translate}%`);
        setImportantStylePropertyIfChanged(node.style, 'transform', drawerTranslateTransform(`${translate}%`));
      }
      if (dock === 'start') {
        setStylePropertyIfChanged(node.style, 'inset-inline-start', '0px');
        node.style.removeProperty('inset-inline-end');
      } else {
        setStylePropertyIfChanged(node.style, 'inset-inline-end', '0px');
        node.style.removeProperty('inset-inline-start');
      }
    }
  }

  _setDrawerGestureDragging(gesture) {
    this.setAttribute('drawer-dragging', '');
    gesture?.target?.setAttribute('drawer-dragging', '');
    let dock = gesture?.dock;
    if (dock !== 'start' && dock !== 'end') return;
    this._getDrawerNode(dock, gesture.panelId)?.setAttribute('drawer-dragging', '');
  }

  _clearDrawerDrag(dock) {
    this.removeAttribute('drawer-dragging');
    if (dock === 'all') {
      for (let node of this.querySelectorAll('layout-node[drawer-dragging]')) {
        node.removeAttribute('drawer-dragging');
      }
      return;
    }
    for (let node of this.querySelectorAll(`layout-node[mobile-dock="${dock}"]`)) {
      node.removeAttribute('drawer-dragging');
    }
  }

  _getDrawerNode(dock, panelId = '') {
    if (panelId) {
      for (let node of this.querySelectorAll(`layout-node[mobile-dock="${dock}"]`)) {
        if (node.$?.nodeId === panelId) return node;
      }
    }
    return this.querySelector(`layout-node[mobile-dock="${dock}"][drawer-active-panel]`) ||
      this.querySelector(`layout-node[mobile-dock="${dock}"]`);
  }

  _getFallbackDrawerWidth() {
    let rect = this.getBoundingClientRect?.();
    let inlineSize = rect?.width || 360;
    return Math.max(240, Math.min(inlineSize * 0.86, 360));
  }

  _getDrawerRailWidth() {
    return LayoutTree.COLLAPSED_PANEL_INLINE_SIZE || 32;
  }

  _getDrawerClosedTranslate(dock, swipeControl = 'edge', open = false) {
    if (swipeControl === 'rail' && !open) {
      return '0px';
    }
    return dock === 'start' ? '-100%' : '100%';
  }

  _getDrawerClosedTranslateForNode(node, dock) {
    return this._getDrawerClosedTranslate(dock, node?.dataset?.swipeControl || 'edge');
  }

  _getDrawerDockForPanel(panelId) {
    let panel = this._drawerProjection?.panels?.find((item) => item.id === panelId);
    return panel?.dock === 'start' || panel?.dock === 'end' ? panel.dock : '';
  }

  /**
   * Show panel type selection menu
   * @param {CustomEvent} e
   */
  _onPanelTypeMenu(e) {
    if (this.$.panelChrome === false) return;
    let { panelId, currentType, x, y } = e.detail;
    let menu = this.ref.menu;
    if (!menu) return;


    let items = Object.entries(this.$.panelTypes).map(([type, config]) => ({
      type,
      title: config.title || type,
      icon: config.icon || 'dashboard',
    }));

    menu.show(x, y, panelId, currentType, items);
  }

  /**
   * Handle panel type change
   * @param {CustomEvent} e
   */
  _onPanelTypeSelect(e) {
    if (this.$.panelChrome === false) return;
    let { panelId, type } = e.detail;


    let tree = this.$.layoutTree;
    if (!tree) return;

    let updateNode = (node) => {
      if (!node) return;
      if (node.id === panelId) {
        node.panelType = type;
        return;
      }
      if (node.first) updateNode(node.first);
      if (node.second) updateNode(node.second);
    };

    updateNode(tree);
    this.$.layoutTree = { ...tree };
    this._saveLayout();
  }

  /**
   * Toggle panel collapse state
   * @param {CustomEvent} e
   */
  _onPanelCollapseToggle(e) {
    if (this.$.panelChrome === false) return;
    let { panelId, collapsed } = e.detail;
    if (this._ignoreNextRailCollapseToggle === panelId) {
      this._ignoreNextRailCollapseToggle = '';
      e.preventDefault?.();
      return;
    }
    let drawerDock = this.hasAttribute('drawer-mode-active')
      ? this._getDrawerDockForPanel(panelId)
      : '';
    if (drawerDock) {
      if (collapsed) {
        this.closeDrawer(drawerDock);
      } else {
        this._suppressDrawerContentClicks();
        this.openDrawer(drawerDock, panelId);
      }
      return;
    }
    let tree = this.$.layoutTree;
    if (!tree) return;


    LayoutTree.updateNode(tree, panelId, {
      collapsed,
      autoCollapsed: false,
      manualExpanded: !collapsed,
    });


    this.$.layoutTree = { ...tree };
    this._renderRoot();
    this._saveLayout();


    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        let panelNode = this._findPanelNode(panelId);
        if (panelNode) {

          let container = panelNode.parentElement;
          if (
            container?.classList.contains('split-first') ||
            container?.classList.contains('split-second')
          ) {
            let siblingContainer = container.classList.contains('split-first')
              ? container.parentElement?.querySelector('.split-second')
              : container.parentElement?.querySelector('.split-first');


            if (siblingContainer) {
              let siblingPanel = siblingContainer.querySelector('layout-node[node-type="panel"]');
              if (siblingPanel?._updatePanelInfo) {
                siblingPanel._updatePanelInfo();
              }
            }


            if (panelNode._updatePanelInfo) {
              panelNode._updatePanelInfo();
            }
          }
        }
      });
    }
  }

  _onPanelMenuAction(e) {
    if (this.$.panelChrome === false) return;
    let { panelId, actionId } = e.detail || {};
    if (!panelId || !String(actionId || '').startsWith('layout:')) return;

    e.stopPropagation();

    if (actionId === 'layout:split-horizontal') {
      this.splitPanel(panelId, 'horizontal', 0.5);
    } else if (actionId === 'layout:split-vertical') {
      this.splitPanel(panelId, 'vertical', 0.5);
    } else if (actionId === 'layout:duplicate') {
      this.duplicatePanel(panelId, 'horizontal', 0.5);
    } else if (actionId === 'layout:close-ui-panel') {
      let panelNode = this._findPanelNode(panelId);
      let panelType = panelNode?.$?.nodeData?.panelType;
      if (panelType) this.closeUiPanel(panelType);
    } else if (actionId === 'layout:remove-ui-panel') {
      let panelNode = this._findPanelNode(panelId);
      let panelType = panelNode?.$?.nodeData?.panelType;
      if (panelType) this.removeUiPanel(panelType);
    } else if (actionId === 'layout:remove') {
      let panelNode = this._findPanelNode(panelId);
      if (panelNode?.$?.nodeData?.panelState?.removable === true) {
        this.joinPanels(panelId);
      }
    }
  }

  _onPanelClose(e) {
    if (this.$.panelChrome === false) return;
    let panelId = e.detail?.panelId;
    if (!panelId) return;
    e.stopPropagation();
    let panelNode = this._findPanelNode(panelId);
    let panelState = panelNode?.$?.nodeData?.panelState || {};
    if (panelState.uiInvoked) {
      let panelType = panelNode?.$?.nodeData?.panelType;
      if (panelType) this.closeUiPanel(panelType);
    } else if (panelState.removable === true) {
      this.joinPanels(panelId);
    }
  }

  /**
   * Toggle panel fullscreen
   * @param {CustomEvent} e
   */
  _onPanelFullscreen(e) {
    if (this.$.panelChrome === false) return;
    let { panelId } = e.detail;
    let panelNode = this._findPanelNode(panelId);
    if (!panelNode) return;

    let allPanels = this.querySelectorAll('layout-node[node-type="panel"]');

    if (this.$.fullscreenPanelId === panelId) {

      this.$.fullscreenPanelId = null;
      this.$.hasFullscreenTabs = false;
      this.$.tabItems = [];
      this._syncFullscreenBounds();

      panelNode.removeAttribute('fullscreen');
      panelNode.$.isFullscreen = false;
      panelNode.$.fullscreenIcon = 'fullscreen';


      allPanels.forEach((p) => {
        p.removeAttribute('fullscreen');
        p.$.isFullscreen = false;
        p.$.fullscreenIcon = 'fullscreen';
        this.#setPanelVisible(p, true);
      });


      this._renderRoot();
      this._scheduleResponsiveLayout();
      this.dispatchEvent(new CustomEvent('layout-change', { bubbles: true }));
    } else {

      this.$.fullscreenPanelId = panelId;
      this._syncFullscreenBounds();
      this._clearDrawerProjection();


      allPanels.forEach((p) => {
        if (p === panelNode) {
          p.toggleAttribute('fullscreen', true);
          p.$.isFullscreen = true;
          p.$.fullscreenIcon = 'fullscreen_exit';
          this.#setPanelVisible(p, true);
        } else {
          this.#setPanelVisible(p, false);
        }
      });


      this._updateTabItems(allPanels, panelId);
      this.$.hasFullscreenTabs = true;
    }
  }

  _syncFullscreenBounds() {
    if (!this.$.fullscreenPanelId) {
      this.removeAttribute('fullscreen-active');
      this.style.removeProperty('--sn-layout-fullscreen-host-top');
      this.style.removeProperty('--sn-layout-fullscreen-host-right');
      this.style.removeProperty('--sn-layout-fullscreen-host-bottom');
      this.style.removeProperty('--sn-layout-fullscreen-host-left');
      return;
    }
    setAttributeIfChanged(this, 'fullscreen-active', 'true');
    setStylePropertyIfChanged(this.style, '--sn-layout-fullscreen-host-top', '0px');
    setStylePropertyIfChanged(this.style, '--sn-layout-fullscreen-host-left', '0px');
    setStylePropertyIfChanged(this.style, '--sn-layout-fullscreen-host-right', '0px');
    setStylePropertyIfChanged(this.style, '--sn-layout-fullscreen-host-bottom', '0px');
  }

  /**
   * Update tabItems array for Itemize-based tab bar
   * @param {NodeListOf<Element>} [allPanels] - Optional, will query DOM if not provided
   * @param {string} [activePanelId] - Optional, defaults to fullscreenPanelId
   * @returns {void}
   */
  _updateTabItems(allPanels, activePanelId) {
    let panels = allPanels || this.querySelectorAll('layout-node[node-type="panel"]');
    let activeId = activePanelId || this.$.fullscreenPanelId;

    this.$.tabItems = Array.from(panels).map((p) => {
      let nodeData = p.$.nodeData;
      let panelType = nodeData?.panelType || 'panel';
      let typeConfig = this.$.panelTypes[panelType] || {};

      return {
        panelId: p.$.nodeId,
        icon: typeConfig.icon || 'dashboard',
        title: typeConfig.title || panelType,
        isActive: p.$.nodeId === activeId,
      };
    });
  }

  /**
   * Switch fullscreen to another panel
   * @param {string} panelId - Panel ID to switch to
   */
  _switchFullscreenPanel(panelId) {
    let allPanels = this.querySelectorAll('layout-node[node-type="panel"]');
    let newPanel = this._findPanelNode(panelId);
    if (!newPanel) return;

    this.$.fullscreenPanelId = panelId;
    this._syncFullscreenBounds();
    this._clearDrawerProjection();

    allPanels.forEach((p) => {
      if (p.$.nodeId === panelId) {
        p.toggleAttribute('fullscreen', true);
        p.$.isFullscreen = true;
        p.$.fullscreenIcon = 'fullscreen_exit';
        this.#setPanelVisible(p, true);
      } else {
        p.removeAttribute('fullscreen');
        p.$.isFullscreen = false;
        p.$.fullscreenIcon = 'fullscreen';
        this.#setPanelVisible(p, false);
      }
    });


    this._updateTabItems(allPanels, panelId);
  }

  /**
   * Find a panel node by ID
   * @param {string} panelId
   * @returns {HTMLElement|null}
   */
  _findPanelNode(panelId) {
    let nodes = this.querySelectorAll('layout-node[node-type="panel"]');
    for (const node of nodes) {
      if (node.$.nodeId === panelId) {
        return node;
      }
    }
    return null;
  }

  _findLayoutNode(nodeId) {
    let nodes = this.querySelectorAll('layout-node');
    for (const node of nodes) {
      if (node.$.nodeId === nodeId) {
        return node;
      }
    }
    return null;
  }

  /**
   * Split a panel
   * @param {string} panelId - Panel ID to split
   * @param {'horizontal' | 'vertical'} direction - Split direction
   * @param {number} [ratio=0.5] - Split ratio
   * @param {string} [newPanelType] - Type for new panel
   */
  splitPanel(panelId, direction, ratio = 0.5, newPanelType) {
    let newTree = LayoutTree.splitPanel(
      LayoutTree.clone(this.$.layoutTree),
      panelId,
      direction,
      ratio,
      newPanelType
    );

    if (newTree) {
      this.$.layoutTree = newTree;
      this._saveLayout();
    }
  }

  /**
   * Join panels (remove one)
   * @param {string} panelToRemove - Panel ID to remove
   */
  joinPanels(panelToRemove) {
    let newTree = LayoutTree.joinPanels(LayoutTree.clone(this.$.layoutTree), panelToRemove);

    if (newTree) {
      this.$.layoutTree = newTree;
      this._saveLayout();
    }
  }

  /**
   * Duplicate a panel.
   * @param {string} panelId - Panel ID to duplicate
   * @param {'horizontal' | 'vertical'} [direction='horizontal'] - Split direction
   * @param {number} [ratio=0.5] - Split ratio
   */
  duplicatePanel(panelId, direction = 'horizontal', ratio = 0.5) {
    let newTree = LayoutTree.duplicatePanel(
      LayoutTree.clone(this.$.layoutTree),
      panelId,
      direction,
      ratio
    );

    if (newTree) {
      this.$.layoutTree = newTree;
      this._saveLayout();
    }
  }

  /**
   * Open a panel type inside the current layout tree.
   * @param {string} panelType
   * @param {Object} [options]
   * @param {'horizontal' | 'vertical'} [options.direction]
   * @param {number} [options.ratio]
   * @param {Object} [options.panelState]
   * @param {import('./../LayoutTree.js').LayoutBehavior} [options.behavior]
   * @param {boolean} [options.reuseExisting]
   * @param {boolean} [options.uiInvoked]
   * @param {string} [options.source]
   * @returns {string|null} opened or reused panel id
   */
  openPanel(panelType, options = {}) {
    if (options.uiInvoked) {
      this._captureUiPanelRestoreTree();
    }

    let result = LayoutTree.openPanel(
      LayoutTree.clone(this.$.layoutTree),
      panelType,
      options
    );

    if (!result.panel) return null;
    if (result.root) this.$.layoutTree = result.root;
    this._saveLayout();
    this._scheduleResponsiveLayout();
    this.dispatchEvent(new CustomEvent('layout-ui-panel-open', {
      bubbles: true,
      composed: true,
      detail: {
        panelId: result.panel.id,
        panelType,
        created: result.created,
        source: options.source || '',
        uiInvoked: Boolean(result.panel.panelState?.uiInvoked),
        panelState: result.panel.panelState || {},
      },
    }));
    return result.panel.id;
  }

  /**
   * Close a panel previously opened by UI/agent intent.
   * @param {string} panelType
   * @returns {boolean}
   */
  closeUiPanel(panelType) {
    let result = LayoutTree.closeUiPanel(LayoutTree.clone(this.$.layoutTree), panelType);
    if (!result.closed) return false;
    this.$.layoutTree = result.root || LayoutTree.createPanel('default');
    this._saveLayout();
    this._scheduleResponsiveLayout();
    this.dispatchEvent(new CustomEvent('layout-ui-panel-close', {
      bubbles: true,
      composed: true,
      detail: {
        panelId: result.panel.id,
        panelType,
        closed: true,
        removed: false,
        restored: false,
        source: result.panel.panelState?.source || '',
      },
    }));
    return true;
  }

  /**
   * Remove a panel previously opened by UI/agent intent.
   * @param {string} panelType
   * @returns {boolean}
   */
  removeUiPanel(panelType) {
    let result = LayoutTree.removeUiPanel(LayoutTree.clone(this.$.layoutTree), panelType, {
      fallbackRoot: this._uiPanelRestoreTree,
    });
    if (!result.removed) return false;
    this.$.layoutTree = result.root || LayoutTree.createPanel('default');
    this._saveLayout();
    this._scheduleResponsiveLayout();
    this.dispatchEvent(new CustomEvent('layout-ui-panel-remove', {
      bubbles: true,
      composed: true,
      detail: {
        panelId: result.panel.id,
        panelType,
        closed: false,
        removed: true,
        restored: Boolean(result.restored),
        source: result.panel.panelState?.source || '',
      },
    }));
    this._clearUiPanelRestoreTreeWhenSettled();
    return true;
  }

  _captureUiPanelRestoreTree() {
    if (this._uiPanelRestoreTree || !this.$.layoutTree) return;
    let hasUiPanel = LayoutTree.collectPanels(this.$.layoutTree)
      .some((panel) => panel.panelState?.uiInvoked);
    if (!hasUiPanel) {
      this._uiPanelRestoreTree = LayoutTree.clone(this.$.layoutTree);
    }
  }

  _clearUiPanelRestoreTreeWhenSettled() {
    if (!this._uiPanelRestoreTree || !this.$.layoutTree) return;
    let hasUiPanel = LayoutTree.collectPanels(this.$.layoutTree)
      .some((panel) => panel.panelState?.uiInvoked);
    if (!hasUiPanel) {
      this._uiPanelRestoreTree = null;
    }
  }

  /**
   * Set the fold-down header menu actions for a panel.
   * @param {string} panelId
   * @param {Array<{id: string, label?: string, icon?: string, title?: string, active?: boolean, disabled?: boolean}>} actions
   */
  setPanelMenuActions(panelId, actions = []) {
    let panelNode = this._findPanelNode(panelId);
    panelNode?.setPanelMenuActions?.(actions);
  }

  /**
   * Set root layout behavior used for auto-collapse and responsive overflow.
   * @param {import('./../LayoutTree.js').LayoutBehavior} behavior
   */
  setLayoutBehavior(behavior = {}) {
    this.$.layoutBehavior = LayoutTree.normalizeLayoutBehavior(behavior, this._getAttributeBehavior());
    this._scheduleResponsiveLayout();
  }

  /**
   * Set responsive behavior for a concrete layout tree insertion point.
   * @param {string} nodeId
   * @param {import('./../LayoutTree.js').LayoutBehavior} behavior
   * @returns {boolean}
   */
  setNodeBehavior(nodeId, behavior = {}) {
    let tree = LayoutTree.clone(this.$.layoutTree);
    let updated = LayoutTree.setNodeBehavior(tree, nodeId, behavior, this._getRootBehavior());
    if (!updated) return false;
    this.$.layoutTree = tree;
    this._saveLayout();
    this._scheduleResponsiveLayout();
    return true;
  }

  /**
   * Get current layout
   * @returns {import('./../LayoutTree.js').LayoutNode}
   */
  getLayout() {
    return LayoutTree.clone(this.$.layoutTree);
  }

  /**
   * Set layout
   * @param {import('./../LayoutTree.js').LayoutNode} layout
   */
  setLayout(layout) {
    let allPanels = this.querySelectorAll('layout-node[node-type="panel"]');
    allPanels.forEach((panelNode) => {
      panelNode.removeAttribute('fullscreen');
      panelNode.$.isFullscreen = false;
      panelNode.$.fullscreenIcon = 'fullscreen';
      this.#setPanelVisible(panelNode, true);
      this.#clearInlineProperties(panelNode, ['left', 'width']);
    });

    if (this.$.fullscreenPanelId) {
      let panelNode = this._findPanelNode(this.$.fullscreenPanelId);
      if (panelNode) {
        panelNode.removeAttribute('fullscreen');
        panelNode.$.isFullscreen = false;
        panelNode.$.fullscreenIcon = 'fullscreen';
        this.#clearInlineProperties(panelNode, ['left', 'width']);
      }
      this.$.fullscreenPanelId = null;
      this.$.hasFullscreenTabs = false;
      this.$.tabItems = [];
    }


    this.querySelectorAll('layout-node[stripe]').forEach((node) => {
      node.removeAttribute('stripe');
      this.#clearInlineProperties(node, ['left', 'top', 'width', 'height']);
    });


    this.querySelectorAll('layout-node[collapsed]').forEach((node) => {
      node.removeAttribute('collapsed');
      node.removeAttribute('collapse-dir');
      node.$.isCollapsed = false;

      node._syncCollapsePresentation?.();
    });


    this.querySelectorAll('[collapsed-child]').forEach((el) => {
      el.removeAttribute('collapsed-child');
      el.removeAttribute('saved-ratio');
      this.#clearInlineProperties(el, ['width', 'height', 'flex']);
    });

    this.$.layoutTree = layout;
    this._uiPanelRestoreTree = null;
    this._saveLayout();
    this._scheduleResponsiveLayout();
  }

  #setPanelVisible(panel, visible) {
    let style = panel.style;
    style.display = visible ? '' : 'none';
  }

  #clearInlineProperties(el, properties) {
    let style = el.style;
    properties.forEach((property) => style.removeProperty(property));
  }
}

Layout.template = template;
Layout.rootStyles = styles;

Layout.reg('panel-layout');
