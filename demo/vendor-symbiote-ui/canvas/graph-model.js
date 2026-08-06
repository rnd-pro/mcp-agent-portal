function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];
  let result = [];
  let seen = new Set();
  for (const item of value) {
    const id = String(item || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function normalizeNode(rawNode) {
  if (!rawNode || typeof rawNode !== 'object') return null;
  const id = String(rawNode.id || '').trim();
  if (!id) return null;
  const children = normalizeIdList(rawNode.children);
  return {
    ...rawNode,
    id,
    label: rawNode.label == null ? id : String(rawNode.label),
    type: rawNode.type || 'data',
    parentId: rawNode.parentId == null ? null : String(rawNode.parentId),
    group: rawNode.group == null ? null : String(rawNode.group),
    isGroup: Boolean(rawNode.isGroup || children.length > 0),
    children,
  };
}

function normalizeEdge(rawEdge) {
  if (!rawEdge || typeof rawEdge !== 'object') return null;
  const rawFrom = rawEdge.from ?? rawEdge.source?.node ?? rawEdge.source?.id ?? rawEdge.source;
  const rawTo = rawEdge.to ?? rawEdge.target?.node ?? rawEdge.target?.id ?? rawEdge.target;
  const from = String(rawFrom || '').trim();
  const to = String(rawTo || '').trim();
  if (!from || !to) return null;
  return { ...rawEdge, from, to };
}

function normalizeGroupMemberList(rawGroup) {
  if (Array.isArray(rawGroup)) return normalizeIdList(rawGroup);
  if (!rawGroup || typeof rawGroup !== 'object') return [];
  return normalizeIdList(
    rawGroup.nodeIds
    || rawGroup.nodes
    || rawGroup.children
    || rawGroup.members
    || []
  );
}

function getRawGroupEntries(rawGroups) {
  if (Array.isArray(rawGroups)) {
    return rawGroups
      .map((group) => [String(group?.id || '').trim(), normalizeGroupMemberList(group)])
      .filter(([id]) => id);
  }
  if (rawGroups && typeof rawGroups === 'object') {
    return Object.entries(rawGroups)
      .map(([id, group]) => [String(id || '').trim(), normalizeGroupMemberList(group)])
      .filter(([id]) => id);
  }
  return [];
}

function addGroupMembers(groups, nodesById, groupId, memberIds, { includeGroupNode = true } = {}) {
  const id = String(groupId || '').trim();
  if (!id) return;
  let members = groups[id] || [];
  let seen = new Set(members);

  if (includeGroupNode && nodesById.has(id) && !seen.has(id)) {
    members.push(id);
    seen.add(id);
  }

  for (const rawMemberId of memberIds || []) {
    const memberId = String(rawMemberId || '').trim();
    if (!memberId || !nodesById.has(memberId) || seen.has(memberId)) continue;
    members.push(memberId);
    seen.add(memberId);
  }

  if (members.length > 0) groups[id] = members;
}

export function normalizeCanvasGraphGroups({ model = {}, nodes = [], nodesById = new Map() } = {}) {
  const groups = {};

  for (const [groupId, memberIds] of getRawGroupEntries(model.groups)) {
    addGroupMembers(groups, nodesById, groupId, memberIds);
  }

  for (const view of Object.values(model.views || {})) {
    for (const [groupId, memberIds] of getRawGroupEntries(view?.groups)) {
      addGroupMembers(groups, nodesById, groupId, memberIds);
    }
  }

  for (const node of nodes) {
    if (node.children.length > 0) {
      addGroupMembers(groups, nodesById, node.id, node.children);
    }
    if (node.parentId && nodesById.has(node.parentId)) {
      addGroupMembers(groups, nodesById, node.parentId, [node.id]);
    }
    if (node.group) {
      addGroupMembers(groups, nodesById, node.group, [node.id]);
    }
  }

  return groups;
}

export function normalizeCanvasGraphModel(model = {}) {
  const nodes = [];
  const nodesById = new Map();
  const edges = [];
  const rootNodes = [];

  for (const rawNode of model.nodes || []) {
    const node = normalizeNode(rawNode);
    if (!node || nodesById.has(node.id)) continue;
    nodes.push(node);
    nodesById.set(node.id, node);
  }

  for (const node of nodes) {
    node.children = node.children.filter((childId) => nodesById.has(childId));
    if (node.children.length > 0) node.isGroup = true;
  }

  const parentChildren = new Map();
  for (const node of nodes) {
    if (!node.parentId || !nodesById.has(node.parentId)) continue;
    if (!parentChildren.has(node.parentId)) parentChildren.set(node.parentId, []);
    parentChildren.get(node.parentId).push(node.id);
  }
  for (const [parentId, childIds] of parentChildren) {
    const parent = nodesById.get(parentId);
    let merged = normalizeIdList([...(parent.children || []), ...childIds]);
    parent.children = merged;
    parent.isGroup = true;
  }

  const rawEdges = Array.isArray(model.connections) ? model.connections : model.edges || [];
  for (const rawEdge of rawEdges) {
    const edge = normalizeEdge(rawEdge);
    if (!edge || !nodesById.has(edge.from) || !nodesById.has(edge.to)) continue;
    edges.push(edge);
  }

  const explicitRoots = Array.isArray(model.rootNodes) ? model.rootNodes.map(String) : [];
  for (const id of explicitRoots) {
    if (nodesById.has(id) && !rootNodes.includes(id)) rootNodes.push(id);
  }

  if (rootNodes.length === 0) {
    for (const node of nodes) {
      if (!node.parentId || !nodesById.has(node.parentId)) rootNodes.push(node.id);
    }
  }

  return {
    nodes,
    edges,
    rootNodes,
    groups: normalizeCanvasGraphGroups({ model, nodes, nodesById }),
  };
}

export function createCanvasGraphStore(model = {}) {
  const normalized = normalizeCanvasGraphModel(model);
  return {
    nodes: new Map(normalized.nodes.map((node) => [node.id, node])),
    edges: normalized.edges,
    rootNodes: normalized.rootNodes,
    groups: normalized.groups,
  };
}

/**
 * Groups multiple nodes under a new group node in the editor.
 * @param {import('../core/Editor.js').NodeEditor} editor
 * @param {string[]} nodeIds
 * @param {string} groupId
 * @param {string} [groupLabel='Group']
 * @returns {object|null}
 */
export function groupNodes(editor, nodeIds, groupId, groupLabel = 'Group') {
  if (!editor || !nodeIds || nodeIds.length === 0) return null;
  let gId = groupId || 'group-' + Date.now();
  let groupNode = {
    id: gId,
    label: groupLabel,
    type: 'group',
    category: 'group',
    shape: 'group',
    inputs: {},
    outputs: {},
    controls: {},
    params: {},
    parentId: null,
    isGroup: true,
    children: [],
  };

  for (const id of nodeIds) {
    let node = editor.getNode(id);
    if (node) {
      node.parentId = gId;
      groupNode.children.push(id);
    }
  }

  editor.addNode(groupNode);
  return groupNode;
}

/**
 * Removes a group node and un-parents its child nodes in the editor.
 * @param {import('../core/Editor.js').NodeEditor} editor
 * @param {string} groupId
 * @returns {boolean}
 */
export function ungroupNodes(editor, groupId) {
  if (!editor) return false;
  let groupNode = editor.getNode(groupId);
  if (!groupNode) return false;

  let children = groupNode.children || [];
  for (const childId of children) {
    let childNode = editor.getNode(childId);
    if (childNode) {
      childNode.parentId = null;
    }
  }

  editor.removeNode(groupId);
  return true;
}

/**
 * Adds nodes to an existing group in the editor.
 * @param {import('../core/Editor.js').NodeEditor} editor
 * @param {string} groupId
 * @param {string[]} nodeIds
 * @returns {boolean}
 */
export function addNodesToGroup(editor, groupId, nodeIds) {
  if (!editor || !nodeIds || nodeIds.length === 0) return false;
  let groupNode = editor.getNode(groupId);
  if (!groupNode) return false;

  groupNode.isGroup = true;
  groupNode.children = groupNode.children || [];

  for (const id of nodeIds) {
    let node = editor.getNode(id);
    if (node) {
      node.parentId = groupId;
      if (!groupNode.children.includes(id)) {
        groupNode.children.push(id);
      }
    }
  }
  return true;
}

/**
 * Removes nodes from their parent groups in the editor.
 * @param {import('../core/Editor.js').NodeEditor} editor
 * @param {string[]} nodeIds
 * @returns {boolean}
 */
export function removeNodesFromGroup(editor, nodeIds) {
  if (!editor || !nodeIds || nodeIds.length === 0) return false;

  for (const id of nodeIds) {
    let node = editor.getNode(id);
    if (node && node.parentId) {
      let groupNode = editor.getNode(node.parentId);
      if (groupNode && groupNode.children) {
        groupNode.children = groupNode.children.filter((cid) => cid !== id);
        if (groupNode.children.length === 0) {
          groupNode.isGroup = false;
        }
      }
      node.parentId = null;
    }
  }
  return true;
}
