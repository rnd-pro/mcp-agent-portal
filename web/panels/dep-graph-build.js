import { buildFlatGroups } from './dep-graph-layout.js';

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
