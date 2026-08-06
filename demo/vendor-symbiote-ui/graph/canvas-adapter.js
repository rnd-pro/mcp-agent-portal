import { normalizeGraphEdge, normalizeGraphModel } from './model.js';

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function copyObject(value) {
  return { ...asObject(value) };
}

function normalizeId(value, fieldName) {
  const id = String(value ?? '').trim();
  if (!id) throw new Error(`${fieldName} is required`);
  return id;
}

function normalizeCanvasNode(rawNode) {
  const data = asObject(rawNode);
  const id = normalizeId(data.id, 'canvas node.id');
  const children = Array.isArray(data.children) ? data.children.map((childId) => normalizeId(childId, 'canvas node.children')) : [];
  const node = {
    ...data,
    id,
    label: data.label == null ? id : String(data.label),
    type: String(data.type ?? data.kind ?? 'data'),
    isGroup: Boolean(data.isGroup),
    children,
  };

  if (data.parentId != null) node.parentId = normalizeId(data.parentId, 'canvas node.parentId');
  return node;
}

function normalizeCanvasEdge(rawEdge) {
  const data = asObject(rawEdge);
  const from = normalizeId(data.from ?? data.source?.nodeId ?? data.source?.node ?? data.source?.id, 'canvas edge.from');
  const to = normalizeId(data.to ?? data.target?.nodeId ?? data.target?.node ?? data.target?.id, 'canvas edge.to');
  return {
    ...data,
    from,
    to,
    out: data.out == null ? 'default' : String(data.out),
    in: data.in == null ? 'default' : String(data.in),
  };
}

function resolveView(graph, view) {
  if (!view) return null;
  if (typeof view === 'string') return graph.views[view] || null;
  return asObject(view);
}

function visibleNodeIdsForView(graph, view) {
  const rootIds = Array.isArray(view?.roots) ? view.roots : [];
  if (rootIds.length === 0) return null;

  const visible = new Set();
  const visit = (id) => {
    if (visible.has(id)) return;
    const node = graph.nodesById.get(id);
    if (!node) return;
    visible.add(id);
    for (const childId of node.children || []) visit(childId);
  };
  for (const id of rootIds) visit(id);
  return visible;
}

function canvasNodeFromGraphNode(node) {
  const design = asObject(node.design);
  const canvas = asObject(design.canvas);
  const canvasNode = {
    ...canvas,
    id: node.id,
    label: node.label,
    type: String(design.variant ?? node.kind),
    kind: node.kind,
    parentId: node.parentId ?? null,
    isGroup: Boolean(design.isGroup ?? node.children.length > 0),
    children: [...node.children],
    flow: copyObject(node.flow),
    params: copyObject(node.params),
    design: copyObject(node.design),
    state: copyObject(node.state),
  };

  if (design.width != null) canvasNode.w = design.width;
  if (design.height != null) canvasNode.h = design.height;
  if (design.color != null) canvasNode.color = String(design.color);
  if (node.themeScope != null) canvasNode.themeScope = node.themeScope;
  if (node.metadata != null) canvasNode.metadata = copyObject(node.metadata);

  return canvasNode;
}

function rootNodesForCanvas(graph, visibleNodeIds, view) {
  const explicitRoots = Array.isArray(view?.roots) ? view.roots : [];
  const roots = [];

  for (const id of explicitRoots) {
    if (graph.nodesById.has(id) && (!visibleNodeIds || visibleNodeIds.has(id))) roots.push(id);
  }
  if (roots.length > 0) return roots;

  for (const node of graph.nodes) {
    if (visibleNodeIds && !visibleNodeIds.has(node.id)) continue;
    if (!node.parentId || !graph.nodesById.has(node.parentId) || (visibleNodeIds && !visibleNodeIds.has(node.parentId))) {
      roots.push(node.id);
    }
  }
  return roots;
}

export function graphModelToCanvasGraphModel(rawModel, options = {}) {
  const graph = normalizeGraphModel(rawModel);
  const view = resolveView(graph, options.view);
  const visibleNodeIds = visibleNodeIdsForView(graph, view);
  const nodes = graph.nodes
    .filter((node) => !visibleNodeIds || visibleNodeIds.has(node.id))
    .map(canvasNodeFromGraphNode);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges
    .filter((edge) => nodeIds.has(edge.source.nodeId) && nodeIds.has(edge.target.nodeId))
    .map((edge) => ({
      id: edge.id,
      from: edge.source.nodeId,
      to: edge.target.nodeId,
      out: edge.source.port,
      in: edge.target.port,
      type: edge.kind,
      kind: edge.kind,
      direction: edge.direction || 'none',
      design: copyObject(edge.design),
      label: edge.label,
      params: copyObject(edge.params),
      metadata: copyObject(edge.metadata),
    }));

  return {
    nodes,
    edges,
    rootNodes: rootNodesForCanvas(graph, visibleNodeIds, view),
  };
}

export function canvasGraphModelToGraphModel(rawCanvasModel = {}, options = {}) {
  const data = asObject(rawCanvasModel);
  const nodes = (data.nodes || []).map(normalizeCanvasNode);
  const nodesById = new Set(nodes.map((node) => node.id));
  const edges = (data.edges ?? data.connections ?? []).map(normalizeCanvasEdge);
  const rootNodes = Array.isArray(data.rootNodes)
    ? data.rootNodes.map((id) => normalizeId(id, 'canvas rootNodes')).filter((id) => nodesById.has(id))
    : [];

  return normalizeGraphModel({
    version: 'graph-model-v1',
    metadata: copyObject(options.metadata),
    nodes: nodes.map((node) => {
      const design = {
        ...copyObject(node.design),
        component: node.design?.component ?? options.component ?? (node.isGroup ? 'graph-group' : 'graph-node'),
      };
      if (node.w != null) design.width = node.w;
      if (node.h != null) design.height = node.h;
      if (node.color != null) design.color = node.color;
      design.canvas = {
        ...copyObject(design.canvas),
        ...copyCanvasData(node),
      };

      const graphNode = {
        id: node.id,
        kind: String(node.kind ?? node.type ?? 'ui.node'),
        label: node.label,
        flow: copyObject(node.flow),
        params: copyObject(node.params),
        design,
        children: node.children,
        state: copyObject(node.state),
      };
      if (node.parentId != null) graphNode.parentId = node.parentId;
      if (node.themeScope != null) graphNode.themeScope = node.themeScope;
      if (node.metadata != null) graphNode.metadata = copyObject(node.metadata);
      return graphNode;
    }),
    edges: edges.map((edge) => normalizeGraphEdge({
      id: edge.id,
      kind: edge.kind ?? edge.type,
      direction: edge.direction,
      design: edge.design,
      label: edge.label,
      source: { nodeId: edge.from, port: edge.out },
      target: { nodeId: edge.to, port: edge.in },
      params: edge.params,
      metadata: edge.metadata,
    })),
    views: {
      canvas: {
        kind: 'canvas-graph',
        roots: rootNodes,
      },
    },
  });
}

function copyCanvasData(node) {
  const skip = new Set([
    'id',
    'label',
    'type',
    'kind',
    'parentId',
    'isGroup',
    'children',
    'flow',
    'params',
    'design',
    'state',
    'w',
    'h',
    'color',
    'themeScope',
    'metadata',
  ]);
  return Object.fromEntries(
    Object.entries(node).filter(([key, value]) => !skip.has(key) && value !== undefined)
  );
}
