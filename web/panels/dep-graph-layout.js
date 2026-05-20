import { buildSemanticGroups } from '../services/project-graph-metadata.js';

export function buildFlatGroups(dirFiles, fileMap, projectGraphMetadata = null) {
  const semanticGroups = buildSemanticGroups(fileMap, projectGraphMetadata);
  const groups = { ...semanticGroups };
  const assignedNodeIds = new Set(Object.values(semanticGroups).flat());

  if (!dirFiles) return groups;

  for (const [dir, files] of dirFiles.entries()) {
    const nodeIds = [];
    for (const file of files) {
      let nodeId = fileMap.get(file);
      if (nodeId && !assignedNodeIds.has(nodeId)) nodeIds.push(nodeId);
    }
    if (nodeIds.length > 0) groups[dir] = nodeIds;
  }
  return groups;
}
