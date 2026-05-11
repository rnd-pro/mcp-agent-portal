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
  return Object.entries(groups).find(([, ids]) => ids.includes(nodeId))?.[0] ?? null;
}

export function getForceLayoutOptions(nodeCount, { continuous = false } = {}) {
  const options = {
    chargeStrength: nodeCount > 500 ? -300 : -150,
    linkDistance: nodeCount > 500 ? 100 : 150,
  };

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
    nodes: nodes.map((node) => ({
      id: node.id,
      x: positions[node.id]?.x ?? 0,
      y: positions[node.id]?.y ?? 0,
      group: findForceNodeGroup(groups, node.id),
      w: nodeSizes[node.id]?.w || node.params?.calculatedWidth || 260,
      h: nodeSizes[node.id]?.h || node.params?.calculatedHeight || 60,
    })),
    edges: connections.map((connection) => ({
      from: connection.from,
      to: connection.to,
    })),
    groups: groups || {},
    options: getForceLayoutOptions(nodes.length, { continuous }),
  };
}
