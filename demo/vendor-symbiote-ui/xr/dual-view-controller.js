/**
 * @file xr/dual-view-controller.js
 * @description Synchronization bridge between 2D Canvas Graph, 3D Preview, and XR Immersive modes.
 */

/**
 * Creates a dual view controller to manage modes and state sync.
 *
 * @param {Object} [options]
 * @param {string} [options.initialMode] - '2d' | '3d-preview' | 'xr'. Default: '2d'
 * @returns {Object} Dual view controller.
 */
export function createDualViewController(options = {}) {
  let mode = options.initialMode || '2d';
  let activeNodeId = options.activeNodeId || options.selectedNodeId || null;
  let focusedNodeId = options.focusedNodeId || null;
  let lastMovedNodeId = null;
  let sessionAdapter = null;
  let nodePositions = new Map(Object.entries(options.nodePositions || {}));
  let pinnedNodeIds = new Set(options.pinnedNodeIds || []);
  let visiblePanelIds = new Set(options.visiblePanelIds || []);
  let callbacks = new Set();

  function snapshot() {
    return {
      mode,
      activeNodeId,
      focusedNodeId,
      selectedNodeId: activeNodeId,
      lastMovedNodeId,
      nodePositions: Object.fromEntries(nodePositions.entries()),
      pinnedNodeIds: [...pinnedNodeIds],
      visiblePanelIds: [...visiblePanelIds],
    };
  }

  function notify() {
    let state = snapshot();
    for (const callback of callbacks) {
      try {
        callback(state);
      } catch {
        // Subscriber failures are host-owned; keep reusable controller quiet.
      }
    }
  }

  return {
    getMode: () => mode,
    enter2D: () => {
      mode = '2d';
      notify();
    },
    enter3DPreview: () => {
      mode = '3d-preview';
      notify();
    },
    enterXR: (adapter) => {
      sessionAdapter = adapter || null;
      mode = 'xr';
      notify();
    },
    focusNode: (nodeId) => {
      focusedNodeId = nodeId ? String(nodeId) : null;
      notify();
    },
    selectNode: (nodeId) => {
      activeNodeId = nodeId ? String(nodeId) : null;
      notify();
    },
    updateNodePosition: (nodeId, position) => {
      nodePositions.set(String(nodeId), [Number(position[0]), Number(position[1]), Number(position[2])]);
      lastMovedNodeId = String(nodeId);
      notify();
    },
    pinNode: (nodeId, position) => {
      let id = String(nodeId);
      pinnedNodeIds.add(id);
      if (position) {
        nodePositions.set(id, [Number(position[0]), Number(position[1]), Number(position[2])]);
        lastMovedNodeId = id;
      }
      notify();
    },
    unpinNode: (nodeId) => {
      pinnedNodeIds.delete(String(nodeId));
      notify();
    },
    setVisiblePanels: (panelIds = []) => {
      visiblePanelIds = new Set(panelIds.map(String));
      notify();
    },
    showPanel: (panelId) => {
      visiblePanelIds.add(String(panelId));
      notify();
    },
    hidePanel: (panelId) => {
      visiblePanelIds.delete(String(panelId));
      notify();
    },
    getState: snapshot,
    subscribe: (callback) => {
      callbacks.add(callback);
      callback(snapshot());
      return () => {
        callbacks.delete(callback);
      };
    },
    destroy: () => {
      callbacks.clear();
      nodePositions.clear();
      pinnedNodeIds.clear();
      visiblePanelIds.clear();
      sessionAdapter = null;
    }
  };
}
