import { buildSemanticGroups } from './project-graph-metadata.js';

export function buildFlatGroups(dirFiles, fileMap, projectGraphMetadata = null) {
  let semanticGroups = buildSemanticGroups(fileMap, projectGraphMetadata);
  let groups = { ...semanticGroups };
  let assignedNodeIds = new Set(Object.values(semanticGroups).flat());

  if (!dirFiles) return groups;

  for (let [dir, files] of dirFiles.entries()) {
    let nodeIds = [];
    for (let file of files) {
      let nodeId = fileMap.get(file);
      if (nodeId && !assignedNodeIds.has(nodeId)) nodeIds.push(nodeId);
    }
    if (nodeIds.length > 0) groups[dir] = nodeIds;
  }
  return groups;
}

export function prepareGraphBuild({
  cache,
  skeleton,
  isStructured,
  projectGraphMetadata,
  getOrBuildGraphFn,
  getDrillableFilesFn,
  buildStructuredGraphFn,
  buildFileGraphFn,
}) {
  let { graph, cached } = getOrBuildGraphFn({
    cache,
    skeleton,
    isStructured,
    buildStructuredGraphFn,
    buildFileGraphFn,
  });
  let { dirFiles, fileMap, symbolMap } = graph;

  return {
    graph,
    cached,
    groups: isStructured ? {} : buildFlatGroups(dirFiles, fileMap, projectGraphMetadata),
    drillableFiles: getDrillableFilesFn(symbolMap),
  };
}

export function buildGraphStatItems({
  skeletonStats = {},
  fileCount,
  edgeCount,
  viaCount,
}) {
  let items = [
    [fileCount, 'files'],
    [skeletonStats.functions || 0, 'fn'],
    [skeletonStats.classes || 0, 'cls'],
    [edgeCount, 'edges'],
  ];

  if (viaCount > 0) {
    items.push([viaCount, 'vias']);
  }

  return items;
}
