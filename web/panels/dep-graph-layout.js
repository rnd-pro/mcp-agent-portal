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

export function computeInitialGraphPositions({ editor, isStructured, dirFiles, dirNodeMap, groups, computeTreeLayoutFn }) {
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
        positions[memberIds[memberIdx]] = {
          x: cx + Math.cos(memberAngle) * memberRadius + (Math.random() - 0.5) * 20,
          y: cy + Math.sin(memberAngle) * memberRadius + (Math.random() - 0.5) * 20,
        };
      }
      groupIdx++;
    }
  }

  for (const node of allNodes) {
    if (!positions[node.id]) {
      const angle = Math.random() * 2 * Math.PI;
      const radius = Math.sqrt(totalNodes) * 50 + Math.random() * 200;
      positions[node.id] = {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      };
    }
  }

  return positions;
}
