import { buildGraphModelFromSkeleton } from '../graph/index.js';
import { createSimulation, forceCenter3D, forceLink3D, forceManyBody3D, forceCluster3D } from './force-layout.js';

export const XR_DEEP_GRAPH_SCENE_VERSION = 'xr-deep-graph-v1';
export const XR_DEEP_GRAPH_DIAGNOSTICS_VERSION = 'xr-deep-graph-diagnostics-v1';
export const XR_DEEP_GRAPH_PREVIEW_VERSION = 'xr-deep-graph-preview-v1';
export const XR_DEEP_GRAPH_PREVIEW_SUMMARY_VERSION = 'xr-deep-graph-preview-summary-v1';
export const XR_PROJECT_DEEP_GRAPH_PROJECTION_VERSION = 'xr-project-deep-graph-projection-v1';

const DEFAULTS = Object.freeze({
  radius: 1.2,
  layerGap: 0.55,
  y: 1.35,
  centerZ: -1.8,
  nodeRadius: 0.055,
  edgeRadius: 0.008,
});

function numberOr(value, fallback) {
  let number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function arrayOr(value) {
  return Array.isArray(value) ? value : [];
}

function vectorOr(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  return fallback.map((item, index) => numberOr(value[index], item));
}

function stableString(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function nodeId(node, index) {
  return stableString(node?.id || node?.path || node?.name, `node-${index + 1}`);
}

function edgeId(edge, index) {
  let from = edgeEndpointId(edge?.from || edge?.source);
  let to = edgeEndpointId(edge?.to || edge?.target);
  return stableString(edge?.id, `edge-${stableString(from, 'unknown')}-${stableString(to, 'unknown')}-${index + 1}`);
}

function edgeEndpointId(endpoint) {
  if (typeof endpoint === 'string') return endpoint;
  return stableString(endpoint?.nodeId || endpoint?.id || endpoint?.path || endpoint?.name, '');
}

function resolveParentDepth(node, nodesById, depthById, seen = new Set()) {
  let id = node.id;
  if (depthById.has(id)) return depthById.get(id);
  if (!node.parentId || !nodesById.has(node.parentId) || seen.has(id)) {
    depthById.set(id, 0);
    return 0;
  }
  seen.add(id);
  let parent = nodesById.get(node.parentId);
  let depth = resolveParentDepth(parent, nodesById, depthById, seen) + 1;
  depthById.set(id, depth);
  return depth;
}

function normalizeNodes(input) {
  let nodes = Array.isArray(input?.nodes) ? input.nodes : [];
  let normalized = nodes.map((node, index) => ({
    id: nodeId(node, index),
    label: stableString(node?.label || node?.name || node?.path || node?.params?.path, nodeId(node, index)),
    type: stableString(node?.type || node?.kind, 'node'),
    path: typeof node?.path === 'string' ? node.path : typeof node?.params?.path === 'string' ? node.params.path : null,
    parentId: stableString(node?.parentId, ''),
    depth: Number.isFinite(Number(node?.depth ?? node?.layer))
      ? Math.max(0, Math.round(numberOr(node?.depth ?? node?.layer, 0)))
      : null,
    weight: Math.max(1, numberOr(node?.weight, 1)),
    source: node,
  }));
  let nodesById = new Map(normalized.map((node) => [node.id, node]));
  let depthById = new Map();
  return normalized.map((node) => ({
    ...node,
    depth: node.depth == null ? resolveParentDepth(node, nodesById, depthById) : node.depth,
  }));
}

function normalizeEdges(input, nodes) {
  let nodeIds = new Set(nodes.map((node) => node.id));
  let edges = Array.isArray(input?.edges) ? input.edges : [];
  return edges
    .map((edge, index) => ({
      id: edgeId(edge, index),
      from: stableString(edgeEndpointId(edge?.from || edge?.source), ''),
      to: stableString(edgeEndpointId(edge?.to || edge?.target), ''),
      type: stableString(edge?.type || edge?.kind, 'edge'),
      source: edge,
    }))
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));
}

function groupByDepth(nodes) {
  let groups = new Map();
  for (let node of nodes) {
    if (!groups.has(node.depth)) groups.set(node.depth, []);
    groups.get(node.depth).push(node);
  }
  return [...groups.entries()].sort(([left], [right]) => left - right);
}

function round(value) {
  return Number(value.toFixed(4));
}

function multiplyMatrix(a, b) {
  let out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        a[0 * 4 + row] * b[column * 4 + 0] +
        a[1 * 4 + row] * b[column * 4 + 1] +
        a[2 * 4 + row] * b[column * 4 + 2] +
        a[3 * 4 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

function identityMatrix() {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

function translationMatrix([x = 0, y = 0, z = 0] = []) {
  let out = identityMatrix();
  out[12] = Number(x || 0);
  out[13] = Number(y || 0);
  out[14] = Number(z || 0);
  return out;
}

export function projectWorldToCss3D(position, camera) {
  let model = translationMatrix(position);
  let mvp = multiplyMatrix(camera.projectionMatrix, multiplyMatrix(camera.viewMatrix, model));
  return `matrix3d(${[...mvp].map(round).join(',')})`;
}

function placeNodes(nodes, options) {
  let radius = numberOr(options.radius, DEFAULTS.radius);
  let layerGap = numberOr(options.layerGap, DEFAULTS.layerGap);
  let y = numberOr(options.y, DEFAULTS.y);
  let centerZ = numberOr(options.centerZ, DEFAULTS.centerZ);
  let origin = vectorOr(options.origin, [0, 0, 0]);
  let positioned = [];

  if (options.placementStrategy === 'force-directed') {
    let rawEdges = options.graph ? normalizeEdges(options.graph, nodes) : [];
    let simNodes = nodes.map((n) => {
      const isFixed = n.parentId === '' && n.depth === 0;
      return {
        id: n.id,
        x: isFixed ? origin[0] : (Math.random() - 0.5) * 2,
        y: isFixed ? (origin[1] + y) : ((Math.random() - 0.5) * 2 + y),
        z: isFixed ? (origin[2] + centerZ) : ((Math.random() - 0.5) * 2 + centerZ),
        fixed: isFixed
      };
    });

    let sim = createSimulation(simNodes);
    sim.force('center', forceCenter3D(origin[0], origin[1] + y, origin[2] + centerZ));
    sim.force('charge', forceManyBody3D().strength(-1.5));

    let simLinks = rawEdges.map((e) => ({
      source: e.from,
      target: e.to,
      distance: 0.5
    }));
    sim.force('link', forceLink3D(simLinks));
    sim.force('cluster', forceCluster3D().strength(0.1));

    for (let i = 0; i < 120; i++) {
      sim.tick();
    }

    let simNodesMap = new Map(simNodes.map((n) => [n.id, n]));
    for (let node of nodes) {
      let sn = simNodesMap.get(node.id);
      positioned.push({
        id: node.id,
        label: node.label,
        type: node.type,
        path: node.path,
        depth: node.depth,
        position: [round(sn.x), round(sn.y), round(sn.z)],
        rotation: [0, 0, 0],
        radius: numberOr(options.nodeRadius, DEFAULTS.nodeRadius),
        visualRole: node.depth === 0 ? 'root-node' : 'detail-node',
        source: node.source,
      });
    }
    return positioned;
  }

  for (let [depth, layerNodes] of groupByDepth(nodes)) {
    let layerRadius = radius + depth * layerGap;
    let z = centerZ - depth * layerGap;
    let step = (Math.PI * 2) / Math.max(1, layerNodes.length);
    layerNodes.forEach((node, index) => {
      let angle = -Math.PI / 2 + index * step;
      let x = Math.cos(angle) * layerRadius;
      let zOffset = Math.sin(angle) * layerRadius * 0.28;
      positioned.push({
        id: node.id,
        label: node.label,
        type: node.type,
        path: node.path,
        depth,
        position: [round(origin[0] + x), round(origin[1] + y), round(origin[2] + z + zOffset)],
        rotation: [0, round((-angle * 180) / Math.PI), 0],
        radius: numberOr(options.nodeRadius, DEFAULTS.nodeRadius),
        visualRole: depth === 0 ? 'root-node' : 'detail-node',
        source: node.source,
      });
    });
  }

  return positioned;
}

function midpoint(from, to) {
  return [
    round((from[0] + to[0]) / 2),
    round((from[1] + to[1]) / 2 + 0.08),
    round((from[2] + to[2]) / 2),
  ];
}

function createSpatialEdges(edges, nodesById, options) {
  return edges.map((edge) => {
    let from = nodesById.get(edge.from);
    let to = nodesById.get(edge.to);
    return {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      type: edge.type,
      radius: numberOr(options.edgeRadius, DEFAULTS.edgeRadius),
      points: [
        from.position,
        midpoint(from.position, to.position),
        to.position,
      ],
      visualRole: 'dependency-link',
      source: edge.source,
    };
  });
}

function incrementCount(map, key) {
  let id = stableString(key, 'unknown');
  map.set(id, (map.get(id) || 0) + 1);
}

function sortedCountObject(map) {
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function projectPoint(position, options = {}) {
  let pixelsPerMeter = numberOr(options.pixelsPerMeter, 118);
  let eyeHeight = numberOr(options.eyeHeight, 1.6);
  let depthScale = numberOr(options.depthScale, 1);
  return {
    x: round(numberOr(position?.[0], 0) * pixelsPerMeter),
    y: round((eyeHeight - numberOr(position?.[1], eyeHeight)) * pixelsPerMeter),
    z: round(numberOr(position?.[2], 0) * pixelsPerMeter * depthScale),
  };
}

function lineBetween(from, to) {
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  return {
    x: from.x,
    y: from.y,
    z: round((from.z + to.z) / 2),
    length: round(Math.sqrt(dx * dx + dy * dy)),
    angle: round((Math.atan2(dy, dx) * 180) / Math.PI),
  };
}

function selectPreviewNodeIds(nodes, edges, maxNodes, options = {}) {
  let nodeIds = new Set(nodes.map((node) => node.id));
  let selected = new Set();
  let ordered = [];
  let push = (id) => {
    if (selected.size >= maxNodes || !nodeIds.has(id) || selected.has(id)) return;
    selected.add(id);
    ordered.push(id);
  };
  let focusNodeId = typeof options.focusNodeId === 'string' && nodeIds.has(options.focusNodeId)
    ? options.focusNodeId
    : null;
  if (focusNodeId) push(focusNodeId);

  if (focusNodeId) {
    for (let edge of edges) {
      if (selected.size >= maxNodes) break;
      if (edge.from !== focusNodeId && edge.to !== focusNodeId) continue;
      push(edge.from);
      push(edge.to);
    }
  }

  for (let edge of edges) {
    if (selected.size >= maxNodes) break;
    push(edge.from);
    push(edge.to);
  }

  for (let node of nodes) {
    if (selected.size >= maxNodes) break;
    push(node.id);
  }
  return ordered;
}

function orderPreviewEdges(edges, options = {}) {
  let focusNodeId = typeof options.focusNodeId === 'string' && options.focusNodeId ? options.focusNodeId : null;
  if (!focusNodeId) return edges;
  let focusEdges = [];
  let otherEdges = [];
  for (let edge of edges) {
    if (edge.from === focusNodeId || edge.to === focusNodeId) {
      focusEdges.push(edge);
    } else {
      otherEdges.push(edge);
    }
  }
  return [...focusEdges, ...otherEdges];
}

function pickProjectDeepGraphFocusNodeId(graphModel, focusPath) {
  if (typeof focusPath !== 'string' || !focusPath.trim()) return null;
  let normalized = focusPath.trim().replace(/^\//, '').replace(/\/$/, '');
  if (graphModel.nodesById?.has(normalized)) return normalized;
  if (graphModel.nodesById?.has(`${normalized}/`)) return `${normalized}/`;
  return graphModel.nodes.find((node) => node.params?.path === normalized)?.id || null;
}

export function createXRDeepGraphScene(graph, options = {}) {
  let nodes = placeNodes(normalizeNodes(graph), options);
  let normalizedEdges = normalizeEdges(graph, nodes);
  let nodesById = new Map(nodes.map((node) => [node.id, node]));
  let edges = createSpatialEdges(normalizedEdges, nodesById, options);

  return {
    version: XR_DEEP_GRAPH_SCENE_VERSION,
    unit: 'meter',
    mode: options.mode || 'project-graph-deep-dive',
    coordinateSystem: options.coordinateSystem || 'webxr-local-floor',
    placement: {
      strategy: options.placementStrategy || 'depth-ring',
      roomAware: Boolean(options.roomAware),
      anchorPolicy: options.anchorPolicy || 'manual-hit-test-first',
    },
    nodes,
    edges,
    interaction: {
      pointerModel: 'ray-to-node-normalized',
      supportsVoiceCommands: Boolean(options.supportsVoiceCommands),
      supportedOperations: ['select-node', 'focus-node', 'open-panel', 'expand-neighborhood'],
    },
    diagnostics: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      maxDepth: nodes.reduce((max, node) => Math.max(max, node.depth), 0),
    },
  };
}

export function createXRDeepGraphDiagnostics(scene, options = {}) {
  let nodes = Array.isArray(scene?.nodes) ? scene.nodes : [];
  let edges = Array.isArray(scene?.edges) ? scene.edges : [];
  let nodeIds = new Set(nodes.map((node) => node.id));
  let connectedIds = new Set();
  let nodeTypes = new Map();
  let edgeTypes = new Map();
  let depthCounts = new Map();
  let inDegree = new Map();
  let outDegree = new Map();

  for (let node of nodes) {
    incrementCount(nodeTypes, node.type);
    incrementCount(depthCounts, String(Number.isFinite(Number(node.depth)) ? Number(node.depth) : 0));
  }

  for (let edge of orderPreviewEdges(edges, { focusNodeId: options.focusNodeId })) {
    incrementCount(edgeTypes, edge.type);
    if (nodeIds.has(edge.from)) {
      connectedIds.add(edge.from);
      outDegree.set(edge.from, (outDegree.get(edge.from) || 0) + 1);
    }
    if (nodeIds.has(edge.to)) {
      connectedIds.add(edge.to);
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    }
  }

  let focusNodeId = typeof options.focusNodeId === 'string' && options.focusNodeId ? options.focusNodeId : null;
  let focusNode = focusNodeId ? nodes.find((node) => node.id === focusNodeId) : null;
  let sampleLimit = Math.max(0, Math.min(20, Math.round(numberOr(options.sampleLimit, 5))));

  return {
    version: XR_DEEP_GRAPH_DIAGNOSTICS_VERSION,
    sceneVersion: scene?.version || null,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    connectedNodeCount: connectedIds.size,
    orphanNodeCount: Math.max(0, nodes.length - connectedIds.size),
    maxDepth: nodes.reduce((max, node) => Math.max(max, Number.isFinite(Number(node.depth)) ? Number(node.depth) : 0), 0),
    depthCounts: sortedCountObject(depthCounts),
    nodeTypes: sortedCountObject(nodeTypes),
    edgeTypes: sortedCountObject(edgeTypes),
    focus: focusNodeId
      ? {
        nodeId: focusNodeId,
        found: Boolean(focusNode),
        depth: focusNode ? focusNode.depth : null,
        incoming: inDegree.get(focusNodeId) || 0,
        outgoing: outDegree.get(focusNodeId) || 0,
      }
      : null,
    samples: {
      nodes: nodes.slice(0, sampleLimit).map((node) => ({
        id: node.id,
        type: node.type,
        depth: node.depth,
        path: node.path || null,
      })),
      edges: edges.slice(0, sampleLimit).map((edge) => ({
        from: edge.from,
        to: edge.to,
        type: edge.type,
      })),
    },
  };
}

export function createXRDeepGraphPreview(scene, options = {}) {
  let nodes = Array.isArray(scene?.nodes) ? scene.nodes : [];
  let edges = Array.isArray(scene?.edges) ? scene.edges : [];
  let maxNodes = Math.max(0, Math.min(500, Math.round(numberOr(options.maxNodes, 160))));
  let maxEdges = Math.max(0, Math.min(1000, Math.round(numberOr(options.maxEdges, 260))));
  let focusNodeId = typeof options.focusNodeId === 'string' && options.focusNodeId ? options.focusNodeId : null;
  let sourceFocusEdgeCount = focusNodeId
    ? edges.filter((edge) => edge.from === focusNodeId || edge.to === focusNodeId).length
    : 0;
  let previewOptions = {
    pixelsPerMeter: numberOr(options.pixelsPerMeter, 118),
    eyeHeight: numberOr(options.eyeHeight, 1.6),
    depthScale: numberOr(options.depthScale, 1),
  };
  let visibleNodeIds = selectPreviewNodeIds(nodes, edges, maxNodes, {
    focusNodeId,
  });
  let nodesById = new Map(nodes.map((node) => [node.id, node]));
  let visibleIdSet = new Set(visibleNodeIds);
  let visibleNodes = visibleNodeIds.map((id) => nodesById.get(id)).filter(Boolean).map((node) => {
    let point = projectPoint(node.position, previewOptions);
    let radius = Math.max(4, numberOr(node.radius, DEFAULTS.nodeRadius) * previewOptions.pixelsPerMeter);
    return {
      id: node.id,
      label: node.label,
      type: node.type,
      path: node.path || null,
      depth: node.depth,
      visualRole: node.visualRole,
      x: point.x,
      y: point.y,
      z: point.z,
      radius: round(radius),
      transform: [
        `translate3d(calc(-50% + ${point.x}px), calc(-50% + ${point.y}px), ${point.z}px)`,
        `rotateX(${numberOr(node.rotation?.[0], 0)}deg)`,
        `rotateY(${numberOr(node.rotation?.[1], 0)}deg)`,
        `rotateZ(${numberOr(node.rotation?.[2], 0)}deg)`,
      ].join(' '),
    };
  });
  let pointsById = new Map(visibleNodes.map((node) => [node.id, node]));
  let visibleEdges = [];
  for (let edge of orderPreviewEdges(edges, { focusNodeId })) {
    if (visibleEdges.length >= maxEdges) break;
    if (!visibleIdSet.has(edge.from) || !visibleIdSet.has(edge.to)) continue;
    let from = pointsById.get(edge.from);
    let to = pointsById.get(edge.to);
    if (!from || !to) continue;
    visibleEdges.push({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      type: edge.type,
      ...lineBetween(from, to),
    });
  }
  let visibleFocusEdgeCount = focusNodeId
    ? visibleEdges.filter((edge) => edge.from === focusNodeId || edge.to === focusNodeId).length
    : 0;

  return {
    version: XR_DEEP_GRAPH_PREVIEW_VERSION,
    sceneVersion: scene?.version || null,
    renderer: 'dom-perspective-overlay',
    unit: 'pixel',
    source: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
    limits: {
      maxNodes,
      maxEdges,
    },
    focus: focusNodeId
      ? {
        nodeId: focusNodeId,
        visible: pointsById.has(focusNodeId),
        edges: {
          visible: visibleFocusEdgeCount,
          source: sourceFocusEdgeCount,
        },
      }
      : null,
    nodes: visibleNodes,
    edges: visibleEdges,
  };
}

export function createXRDeepGraphPreviewSummary(preview, options = {}) {
  let sourceNodeCount = Math.max(0, Math.round(numberOr(preview?.source?.nodeCount, 0)));
  let sourceEdgeCount = Math.max(0, Math.round(numberOr(preview?.source?.edgeCount, 0)));
  let visibleNodeCount = Array.isArray(preview?.nodes) ? preview.nodes.length : 0;
  let visibleEdgeCount = Array.isArray(preview?.edges) ? preview.edges.length : 0;
  let hiddenNodeCount = Math.max(0, sourceNodeCount - visibleNodeCount);
  let hiddenEdgeCount = Math.max(0, sourceEdgeCount - visibleEdgeCount);
  let nodeCoverage = sourceNodeCount ? round(visibleNodeCount / sourceNodeCount) : 1;
  let edgeCoverage = sourceEdgeCount ? round(visibleEdgeCount / sourceEdgeCount) : 1;
  let warningThreshold = Math.max(0, Math.min(1, numberOr(options.warningCoverage, 0.2)));
  let status = hiddenNodeCount || hiddenEdgeCount
    ? (nodeCoverage < warningThreshold || edgeCoverage < warningThreshold ? 'limited' : 'bounded')
    : 'complete';

  return {
    version: XR_DEEP_GRAPH_PREVIEW_SUMMARY_VERSION,
    previewVersion: preview?.version || null,
    renderer: preview?.renderer || null,
    status,
    nodes: {
      visible: visibleNodeCount,
      source: sourceNodeCount,
      hidden: hiddenNodeCount,
      coverage: nodeCoverage,
      limit: Math.max(0, Math.round(numberOr(preview?.limits?.maxNodes, 0))),
    },
    edges: {
      visible: visibleEdgeCount,
      source: sourceEdgeCount,
      hidden: hiddenEdgeCount,
      coverage: edgeCoverage,
      limit: Math.max(0, Math.round(numberOr(preview?.limits?.maxEdges, 0))),
    },
    focus: preview?.focus
      ? {
        nodeId: stableString(preview.focus.nodeId, ''),
        visible: Boolean(preview.focus.visible),
        edges: {
          visible: Math.max(0, Math.round(numberOr(preview.focus.edges?.visible, 0))),
          source: Math.max(0, Math.round(numberOr(preview.focus.edges?.source, 0))),
        },
      }
      : null,
  };
}

export function createXRDeepGraphFocus(scene, nodeId, options = {}) {
  let node = scene?.nodes?.find((item) => item.id === nodeId);
  if (!node) {
    return {
      ok: false,
      reason: 'node-not-found',
      nodeId,
    };
  }

  let distance = numberOr(options.panelDistance, 0.42);
  return {
    ok: true,
    nodeId,
    node,
    panel: {
      id: stableString(options.panelId, `${node.id}-detail-panel`),
      anchorNodeId: node.id,
      component: options.component || 'sn-graph-node-detail',
      position: [
        round(node.position[0]),
        round(node.position[1] + 0.16),
        round(node.position[2] - distance),
      ],
      size: vectorOr(options.size, [0.72, 0.42]),
      rotation: vectorOr(options.rotation, node.rotation),
      themeScope: options.themeScope || 'xr.deepGraph.nodeDetail',
    },
  };
}

export function createXRDeepGraphPreviewOverlay(preview, options = {}) {
  let documentRef = options.document;
  if (!documentRef?.createElement) {
    return {
      ok: false,
      reason: 'missing-document',
      previewVersion: preview?.version || null,
    };
  }
  let classNames = {
    overlay: options.classNames?.overlay || 'sn-xr-deep-graph',
    edge: options.classNames?.edge || 'sn-xr-deep-edge',
    node: options.classNames?.node || 'sn-xr-deep-node',
  };
  let overlay = documentRef.createElement('section');
  overlay.className = classNames.overlay;
  overlay.dataset.version = preview?.version || '';
  overlay.dataset.nodes = String(Array.isArray(preview?.nodes) ? preview.nodes.length : 0);
  overlay.dataset.edges = String(Array.isArray(preview?.edges) ? preview.edges.length : 0);
  overlay.setAttribute('aria-label', options.label || 'XR deep graph preview');

  for (let edge of arrayOr(preview?.edges)) {
    let line = documentRef.createElement('span');
    line.className = classNames.edge;
    line.dataset.edgeId = edge.id;
    line.dataset.edgeType = edge.type;
    line.style.setProperty('--sn-xr-deep-edge-x', `${edge.x}px`);
    line.style.setProperty('--sn-xr-deep-edge-y', `${edge.y}px`);
    line.style.setProperty('--sn-xr-deep-edge-z', `${edge.z}px`);
    line.style.setProperty('--sn-xr-deep-edge-length', `${edge.length}px`);
    line.style.setProperty('--sn-xr-deep-edge-angle', `${edge.angle}deg`);
    if (options.legacyCssVars) {
      line.style.setProperty('--psl-edge-x', `${edge.x}px`);
      line.style.setProperty('--psl-edge-y', `${edge.y}px`);
      line.style.setProperty('--psl-edge-z', `${edge.z}px`);
      line.style.setProperty('--psl-edge-length', `${edge.length}px`);
      line.style.setProperty('--psl-edge-angle', `${edge.angle}deg`);
    }
    overlay.append(line);
  }

  for (let graphNode of arrayOr(preview?.nodes)) {
    let node = documentRef.createElement('button');
    node.className = classNames.node;
    node.type = 'button';
    node.dataset.nodeId = graphNode.id;
    node.dataset.nodeType = graphNode.type;
    node.dataset.depth = String(graphNode.depth);
    node.dataset.focus = String(options.focusNodeId === graphNode.id);
    node.title = graphNode.path || graphNode.label || graphNode.id;
    node.style.setProperty('--sn-xr-deep-node-size', `${graphNode.radius * 2}px`);
    node.style.setProperty('transform', graphNode.transform);
    if (options.legacyCssVars) {
      node.style.setProperty('--psl-node-size', `${graphNode.radius * 2}px`);
    }
    node.textContent = graphNode.label || graphNode.id;
    overlay.append(node);
  }

  return {
    ok: true,
    overlay,
    nodeCount: Number(overlay.dataset.nodes),
    edgeCount: Number(overlay.dataset.edges),
  };
}

export function createXRProjectDeepGraphProjection(skeleton, options = {}) {
  let graphModel = buildGraphModelFromSkeleton(skeleton || {}, options.metadata || null);
  let scene = createXRDeepGraphScene(graphModel, {
    mode: options.mode || 'project-graph-deep-dive',
    coordinateSystem: options.coordinateSystem || 'webxr-local-floor',
    placementStrategy: options.placementStrategy || 'depth-ring',
    roomAware: Boolean(options.roomAware),
    supportsVoiceCommands: Boolean(options.supportsVoiceCommands),
    ...(options.sceneOptions || {}),
  });
  let focusNodeId = pickProjectDeepGraphFocusNodeId(graphModel, options.focusPath);
  let focus = focusNodeId
    ? createXRDeepGraphFocus(scene, focusNodeId, {
      component: options.focusComponent || 'sn-source-viewer',
      themeScope: options.themeScope || 'section.graph',
    })
    : null;
  let diagnostics = createXRDeepGraphDiagnostics(scene, {
    focusNodeId,
    sampleLimit: options.sampleLimit,
  });
  let preview = createXRDeepGraphPreview(scene, {
    focusNodeId,
    pixelsPerMeter: options.pixelsPerMeter,
    depthScale: options.depthScale,
    eyeHeight: options.eyeHeight,
    maxNodes: options.maxNodes,
    maxEdges: options.maxEdges,
  });
  let previewSummary = createXRDeepGraphPreviewSummary(preview, {
    warningCoverage: options.warningCoverage,
  });

  return {
    version: XR_PROJECT_DEEP_GRAPH_PROJECTION_VERSION,
    graphModel,
    scene,
    preview,
    previewSummary,
    focus,
    diagnostics: {
      ...diagnostics,
      focusNodeId,
      graphVersion: graphModel.version,
    },
  };
}
