import {
  findClusterForPath,
  normalizeProjectGraphMetadata,
} from './project-graph-metadata.js';
import { collectSkeletonFiles, dirOf, resolveImport } from './project-graph-skeleton-utils.js';

function classifyFile(file, classFiles) {
  const name = file.split('/').pop().toLowerCase();
  const ext = name.split('.').pop();

  if (name.includes('test') || name.includes('spec')) return 'external';
  if (name === 'index.js' || name === 'index.mjs') return 'output';
  if (name === 'package.json' || name.startsWith('.env') || name.startsWith('.git')) return 'config';

  if (ext === 'css' || ext === 'scss' || ext === 'less') return 'style';
  if (ext === 'html' || ext === 'tpl' || ext === 'vue' || ext === 'jsx' || ext === 'tsx') return 'output';
  if (ext === 'json' || ext === 'yaml' || ext === 'yml' || ext === 'toml') return 'config';
  if (ext === 'md' || ext === 'txt' || ext === 'csv') return 'docs';
  if (ext === 'svg' || ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'ico') return 'asset';
  if (ext === 'js' || ext === 'ts' || ext === 'mjs' || ext === 'py' || ext === 'go' || ext === 'rs') return 'action';

  if (classFiles.has(file)) return 'action';
  return 'data';
}

export function buildCanvasGraphModelFromSkeleton(skeleton, metadata = null) {
  const projectGraphMetadata = normalizeProjectGraphMetadata(metadata);
  const { files: allFiles, classFiles } = collectSkeletonFiles(skeleton);
  const nodes = [];
  const nodesById = new Map();
  const edges = [];
  const rootNodes = [];
  const semanticAssignments = new Map();
  const semanticClusterFiles = new Map();

  const addNode = (node) => {
    nodes.push(node);
    nodesById.set(node.id, node);
    return node;
  };

  for (const file of allFiles) {
    const cluster = findClusterForPath(file, projectGraphMetadata);
    if (!cluster) continue;
    const clusterId = `cluster:${cluster.id}`;
    semanticAssignments.set(file, cluster);
    if (!semanticClusterFiles.has(clusterId)) {
      semanticClusterFiles.set(clusterId, { cluster, files: [] });
    }
    semanticClusterFiles.get(clusterId).files.push(file);
  }

  const dirs = new Set();
  for (const file of allFiles) {
    if (semanticAssignments.has(file)) continue;
    const parts = file.split('/');
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join('/'));
    }
  }

  for (const [clusterId, { cluster, files }] of semanticClusterFiles.entries()) {
    if (files.length === 0) continue;
    addNode({
      id: clusterId,
      label: cluster.label,
      w: 180,
      h: 48,
      type: 'group',
      color: cluster.color,
      description: cluster.description,
      isGroup: true,
      isSemanticCluster: true,
      parentId: null,
      children: [],
    });
    rootNodes.push(clusterId);
  }

  for (const dir of [...dirs].sort()) {
    const parentDir = dir.includes('/') ? dir.substring(0, dir.lastIndexOf('/')) : null;
    const label = dir.split('/').pop();
    addNode({ id: dir, label, w: 160, h: 40, type: 'group', isGroup: true, parentId: parentDir, children: [] });
    if (!parentDir || !dirs.has(parentDir)) {
      rootNodes.push(dir);
    }
  }

  for (const node of nodesById.values()) {
    if (node.parentId && nodesById.has(node.parentId)) {
      nodesById.get(node.parentId).children.push(node.id);
    }
  }

  for (const file of allFiles) {
    const parentId = dirOf(file).replace(/\/$/, '') || null;
    const cluster = semanticAssignments.get(file);
    const clusterParent = cluster ? `cluster:${cluster.id}` : null;
    const actualParent = clusterParent || (parentId && nodesById.has(parentId) ? parentId : null);
    const type = classifyFile(file, classFiles);
    const label = file.split('/').pop();
    addNode({
      id: file,
      label,
      w: 160,
      h: 40,
      type,
      isGroup: false,
      parentId: actualParent,
      children: [],
      exports: Array.isArray(skeleton.X?.[file]) ? skeleton.X[file] : undefined,
      lines: skeleton.L?.[file],
    });
    if (actualParent) {
      nodesById.get(actualParent).children.push(file);
    } else {
      rootNodes.push(file);
    }
  }

  const edgeSet = new Set();
  for (const [srcFile, imports] of Object.entries(skeleton.I || {})) {
    if (!allFiles.has(srcFile)) continue;
    for (const impPath of imports) {
      if (!impPath.startsWith('.') && !impPath.startsWith('/')) continue;
      const targetFile = resolveImport(impPath, srcFile, allFiles);
      if (!targetFile || targetFile === srcFile) continue;
      const key = srcFile + '>' + targetFile;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({ from: srcFile, to: targetFile });
    }
  }

  return { nodes, edges, rootNodes };
}
