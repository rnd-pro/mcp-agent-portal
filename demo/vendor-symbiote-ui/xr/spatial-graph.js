/**
 * @file xr/spatial-graph.js
 * @description Pure functions to manage and query a 3D spatial graph model.
 */

/**
 * Creates a normalized spatial graph model from raw input.
 * Preserves host metadata without leaking product-specific fields.
 *
 * @param {Object} input
 * @param {Array} [input.nodes]
 * @param {Array} [input.links]
 * @param {Object} [options]
 * @returns {Object} Spatial graph model v1.
 */
export function createSpatialGraphModel(input = {}, options = {}) {
  const nodes = (input.nodes || []).map((node) => {
    const defaultPos = options.defaultPosition || [0, 0, 0];
    const rawPos = node.position || [node.x ?? defaultPos[0], node.y ?? defaultPos[1], node.z ?? defaultPos[2]];
    return {
      id: String(node.id),
      label: String(node.label || node.id || ''),
      type: String(node.type || 'custom'),
      position: [Number(rawPos[0]), Number(rawPos[1]), Number(rawPos[2])],
      radius: Number(node.radius ?? 0.08),
      color: String(node.color || 'var(--sn-cat-data)'),
      icon: String(node.icon || 'hub'),
      fixed: Boolean(node.fixed),
      metadata: { ...(node.metadata || {}) }
    };
  });

  const links = (input.links || []).map((link) => {
    return {
      id: String(link.id || `${link.source}-${link.target}`),
      source: String(link.source),
      target: String(link.target),
      type: String(link.type || 'dependency'),
      strength: Number(link.strength ?? 1),
      metadata: { ...(link.metadata || {}) }
    };
  });

  const activeNodeId = input.selection?.activeNodeId || null;
  const focusedNodeId = input.selection?.focusedNodeId || null;

  return {
    version: 'spatial-graph-v1',
    nodes,
    links,
    selection: {
      activeNodeId,
      focusedNodeId
    }
  };
}

/**
 * Updates a node's position inside the spatial graph model.
 *
 * @param {Object} model
 * @param {string} nodeId
 * @param {Array<number>} position
 * @param {Object} [options]
 * @returns {Object} Updated model.
 */
export function updateSpatialNodePosition(model, nodeId, position, options = {}) {
  const nodes = model.nodes.map((node) => {
    if (node.id === nodeId) {
      return {
        ...node,
        position: [Number(position[0]), Number(position[1]), Number(position[2])]
      };
    }
    return node;
  });
  return { ...model, nodes };
}

/**
 * Selects an active node.
 *
 * @param {Object} model
 * @param {string|null} nodeId
 * @param {Object} [options]
 * @returns {Object} Updated model.
 */
export function selectSpatialNode(model, nodeId, options = {}) {
  return {
    ...model,
    selection: {
      ...model.selection,
      activeNodeId: nodeId ? String(nodeId) : null
    }
  };
}

/**
 * Focuses a node.
 *
 * @param {Object} model
 * @param {string|null} nodeId
 * @param {Object} [options]
 * @returns {Object} Updated model.
 */
export function focusSpatialNode(model, nodeId, options = {}) {
  return {
    ...model,
    selection: {
      ...model.selection,
      focusedNodeId: nodeId ? String(nodeId) : null
    }
  };
}

/**
 * Pins a node at a specific position.
 *
 * @param {Object} model
 * @param {string} nodeId
 * @param {Array<number>} position
 * @returns {Object} Updated model.
 */
export function pinSpatialNode(model, nodeId, position) {
  const nodes = model.nodes.map((node) => {
    if (node.id === nodeId) {
      return {
        ...node,
        fixed: true,
        position: [Number(position[0]), Number(position[1]), Number(position[2])]
      };
    }
    return node;
  });
  return { ...model, nodes };
}

/**
 * Unpins a node (sets fixed to false).
 *
 * @param {Object} model
 * @param {string} nodeId
 * @returns {Object} Updated model.
 */
export function unpinSpatialNode(model, nodeId) {
  const nodes = model.nodes.map((node) => {
    if (node.id === nodeId) {
      return {
        ...node,
        fixed: false
      };
    }
    return node;
  });
  return { ...model, nodes };
}
