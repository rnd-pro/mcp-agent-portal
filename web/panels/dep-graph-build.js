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
