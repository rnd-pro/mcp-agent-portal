export function getGraphCacheKey(isStructured) {
  return isStructured ? 'structured' : 'flat';
}

export function getOrBuildGraph({
  cache,
  skeleton,
  isStructured,
  buildStructuredGraphFn,
  buildFileGraphFn,
}) {
  const cacheKey = getGraphCacheKey(isStructured);
  const cached = cache[cacheKey];

  if (cached?.skeleton === skeleton) {
    return { cacheKey, cached: true, graph: cached };
  }

  const graph = isStructured
    ? buildStructuredGraphFn(skeleton)
    : buildFileGraphFn(skeleton);

  if (!graph.symbolMap) graph.symbolMap = new Map();
  cache[cacheKey] = { skeleton, ...graph };

  return { cacheKey, cached: false, graph: cache[cacheKey] };
}

export function getDrillableFiles(symbolMap = new Map()) {
  return new Set([...symbolMap.values()].map((symbol) => symbol.file));
}

export function findForceNodeGroup(groups = {}, nodeId) {
  return Object.entries(normalizeForceGroups(groups)).find(([, ids]) => ids.includes(nodeId))?.[0] ?? null;
}

function normalizeForceGroupMembers(group) {
  let rawMembers = Array.isArray(group)
    ? group
    : group?.nodeIds || group?.nodes || group?.children || group?.members || [];
  if (!Array.isArray(rawMembers)) return [];
  let members = [];
  let seen = new Set();
  for (const rawMember of rawMembers) {
    const memberId = String(rawMember || '').trim();
    if (!memberId || seen.has(memberId)) continue;
    seen.add(memberId);
    members.push(memberId);
  }
  return members;
}

export function normalizeForceGroups(groups = {}, nodeIds = null) {
  let allowedIds = nodeIds instanceof Set
    ? nodeIds
    : Array.isArray(nodeIds)
      ? new Set(nodeIds.map((id) => String(id || '').trim()).filter(Boolean))
      : null;
  let entries = Array.isArray(groups)
    ? groups.map((group) => [String(group?.id || '').trim(), normalizeForceGroupMembers(group)])
    : Object.entries(groups || {}).map(([groupId, group]) => [String(groupId || '').trim(), normalizeForceGroupMembers(group)]);
  let normalized = {};

  for (const [groupId, members] of entries) {
    if (!groupId) continue;
    let filtered = [];
    let seen = new Set();
    for (const memberId of members) {
      if (allowedIds && !allowedIds.has(memberId)) continue;
      if (seen.has(memberId)) continue;
      seen.add(memberId);
      filtered.push(memberId);
    }
    if (filtered.length > 0) normalized[groupId] = filtered;
  }

  return normalized;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rounded(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getEdgeEndpointId(edge, key) {
  const value = edge?.[key] ?? edge?.[key === 'from' ? 'source' : 'target'];
  if (typeof value === 'string') return value;
  return String(value?.node ?? value?.id ?? '').trim();
}

function getForceGroupMetrics(nodeCount, groups = {}, edges = []) {
  const normalizedGroups = normalizeForceGroups(groups);
  const groupEntries = Object.entries(normalizedGroups);
  const memberToGroup = new Map();
  let groupedCount = 0;
  let maxGroupSize = 0;

  for (const [groupId, members] of groupEntries) {
    maxGroupSize = Math.max(maxGroupSize, members.length);
    for (const memberId of members) {
      if (!memberToGroup.has(memberId)) {
        memberToGroup.set(memberId, groupId);
        groupedCount++;
      }
    }
  }

  let edgeCount = 0;
  let internalLinks = 0;
  let crossLinks = 0;
  for (const edge of edges || []) {
    const from = getEdgeEndpointId(edge, 'from');
    const to = getEdgeEndpointId(edge, 'to');
    if (!from || !to) continue;
    edgeCount++;
    const fromGroup = memberToGroup.get(from);
    const toGroup = memberToGroup.get(to);
    if (fromGroup && toGroup && fromGroup === toGroup) internalLinks++;
    else if (fromGroup && toGroup && fromGroup !== toGroup) crossLinks++;
  }

  return {
    groupCount: groupEntries.length,
    groupedCount,
    maxGroupSize,
    edgeCount,
    internalLinks,
    crossLinks,
    groupedRatio: nodeCount > 0 ? groupedCount / nodeCount : 0,
    averageDegree: nodeCount > 0 ? (edgeCount * 2) / nodeCount : 0,
    crossLinkRatio: edgeCount > 0 ? crossLinks / edgeCount : 0,
    internalLinkRatio: edgeCount > 0 ? internalLinks / edgeCount : 0,
  };
}

function hashUnit(value) {
  let text = String(value || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function graphRandom(random, key) {
  return typeof random === 'function' ? random() : hashUnit(key);
}

export function getForceLayoutOptions(nodeCount, {
  continuous = false,
  groups = {},
  edges = null,
  connections = null,
} = {}) {
  const linkEdges = Array.isArray(edges) ? edges : Array.isArray(connections) ? connections : [];
  const metrics = getForceGroupMetrics(nodeCount, groups, linkEdges);
  const hasGroups = metrics.groupCount > 0;
  const options = {
    layoutAlgorithm: 'organic',
    chargeStrength: nodeCount > 500 ? -300 : -150,
    linkDistance: nodeCount > 500 ? 100 : 150,
  };

  if (hasGroups) {
    const densityScale = clampNumber(metrics.averageDegree / 6, 0, 1);
    const groupScale = clampNumber(metrics.groupCount / Math.max(1, Math.sqrt(Math.max(1, nodeCount))), 0, 1);
    const groupRadius = Math.sqrt(Math.max(1, metrics.maxGroupSize));
    options.chargeStrength = Math.round(
      options.chargeStrength
      - metrics.groupCount * 10
      - groupRadius * 12
      - densityScale * 48
    );
    options.linkDistance = Math.round(clampNumber(
      options.linkDistance - densityScale * 24 + metrics.crossLinkRatio * 28,
      80,
      190
    ));
    options.groupDistance = Math.round(clampNumber(
      100 + groupRadius * 18 + metrics.crossLinkRatio * 32,
      110,
      260
    ));
    options.groupStrength = rounded(clampNumber(
      0.045 + metrics.groupedRatio * 0.04 + metrics.internalLinkRatio * 0.02,
      0.045,
      0.14
    ));
    options.wellStrength = rounded(clampNumber(
      0.65 + metrics.groupedRatio * 0.28 + (1 - metrics.crossLinkRatio) * 0.16,
      0.65,
      1.2
    ));
    options.centerPull = rounded(clampNumber(
      0.12 + densityScale * 0.06 + groupScale * 0.03,
      0.12,
      0.28
    ));
    options.wellRepulsion = rounded(clampNumber(
      4 + metrics.groupCount * 1.1 + groupRadius * 0.6 + metrics.crossLinkRatio * 0.8,
      5,
      16
    ));
    options.crossLinkScale = rounded(clampNumber(
      0.32 - metrics.crossLinkRatio * 0.16 - groupScale * 0.05,
      0.08,
      0.32
    ));
  }

  if (continuous) {
    options.nodeWidth = 260;
    options.nodeHeight = 40;
    options.mode = 'continuous';
    options.brownian = 0;
  }

  return options;
}

export function createForceLayoutPayload({
  nodes,
  connections,
  positions = {},
  groups = {},
  nodeSizes = {},
  continuous = false,
}) {
  return {
    nodes: nodes.map((node) => {
      let position = positions[node.id];
      let layoutNode = {
        id: node.id,
        group: findForceNodeGroup(groups, node.id),
        w: nodeSizes[node.id]?.w || node.params?.calculatedWidth || 260,
        h: nodeSizes[node.id]?.h || node.params?.calculatedHeight || 60,
      };
      if (Number.isFinite(position?.x) && Number.isFinite(position?.y)) {
        layoutNode.x = position.x;
        layoutNode.y = position.y;
      }
      return layoutNode;
    }),
    edges: connections.map((connection) => ({
      from: connection.from,
      to: connection.to,
    })),
    groups: normalizeForceGroups(groups),
    options: getForceLayoutOptions(nodes.length, { continuous, groups, connections }),
  };
}

export function computeInitialGraphPositions({
  editor,
  isStructured = false,
  dirFiles = null,
  dirNodeMap = new Map(),
  groups = {},
  computeTreeLayoutFn,
  random = null,
}) {
  if (isStructured && dirFiles) {
    if (typeof computeTreeLayoutFn !== 'function') {
      throw new TypeError('computeTreeLayoutFn is required for structured graph layout');
    }
    const dirPaths = {};
    const rootNodeIds = new Set(editor.getNodes().map((node) => node.id));
    for (const [dir, nodeId] of dirNodeMap.entries()) {
      if (rootNodeIds.has(nodeId)) {
        dirPaths[nodeId] = dir;
      }
    }

    return computeTreeLayoutFn(editor, {
      dirPaths,
      nodeWidth: 250,
      nodeHeight: 100,
      gapX: 40,
      gapY: 60,
      startX: 60,
      startY: 60,
    });
  }

  const allNodes = [...editor.getNodes()];
  const totalNodes = allNodes.length;
  const groupEntries = Object.entries(groups);
  const positions = {};

  if (groupEntries.length > 1) {
    const globalRadius = Math.sqrt(totalNodes) * 80;
    let groupIdx = 0;
    for (const [, memberIds] of groupEntries) {
      const angle = (2 * Math.PI * groupIdx) / groupEntries.length;
      const radius = globalRadius * (0.3 + 0.7 * (groupIdx / groupEntries.length));
      const cx = Math.cos(angle) * radius;
      const cy = Math.sin(angle) * radius;
      const memberRadius = Math.sqrt(memberIds.length) * 60;
      for (let memberIdx = 0; memberIdx < memberIds.length; memberIdx++) {
        const memberAngle = (2 * Math.PI * memberIdx) / memberIds.length;
        const memberId = memberIds[memberIdx];
        positions[memberIds[memberIdx]] = {
          x: cx + Math.cos(memberAngle) * memberRadius + (graphRandom(random, `${memberId}:group:x`) - 0.5) * 20,
          y: cy + Math.sin(memberAngle) * memberRadius + (graphRandom(random, `${memberId}:group:y`) - 0.5) * 20,
        };
      }
      groupIdx++;
    }
  }

  for (const node of allNodes) {
    if (!positions[node.id]) {
      const angle = graphRandom(random, `${node.id}:angle`) * 2 * Math.PI;
      const radius = Math.sqrt(totalNodes) * 50 + graphRandom(random, `${node.id}:radius`) * 200;
      positions[node.id] = {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      };
    }
  }

  return positions;
}
