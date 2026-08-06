import { normalizeMediaDescriptor } from './media-descriptor.js';

const DEFAULT_PORT = 'default';

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeId(value, fieldName) {
  const id = String(value ?? '').trim();
  if (!id) throw new Error(`${fieldName} is required`);
  return id;
}

function normalizePort(port) {
  const normalized = String(port ?? DEFAULT_PORT).trim();
  return normalized || DEFAULT_PORT;
}

function normalizeEndpointPort(port) {
  const normalized = String(port ?? '').trim();
  if (!normalized) throw new Error('endpoint.port is required');
  return normalized;
}

function normalizePorts(ports) {
  if (!Array.isArray(ports)) return [];
  return ports.map((port) => {
    if (typeof port === 'string') return { name: port, type: 'any' };
    const data = asObject(port);
    return {
      ...data,
      name: normalizeId(data.name, 'port.name'),
      type: String(data.type ?? 'any'),
    };
  });
}

function normalizeFlow(flow = {}) {
  const data = asObject(flow);
  return {
    ...data,
    inputs: normalizePorts(data.inputs),
    outputs: normalizePorts(data.outputs),
  };
}

function normalizeDesign(design = {}) {
  const data = asObject(design);
  return {
    ...data,
    component: String(data.component ?? 'graph-node'),
  };
}

function endpointFromObject(endpoint, fallbackPort) {
  const data = asObject(endpoint);
  return {
    nodeId: normalizeId(data.nodeId, 'endpoint.nodeId'),
    port: fallbackPort == null ? normalizeEndpointPort(data.port) : normalizePort(data.port ?? fallbackPort),
  };
}

export function normalizeGraphEndpoint(endpoint, fallbackPort) {
  return endpointFromObject(endpoint, fallbackPort);
}

export function normalizeGraphNode(rawNode) {
  const data = asObject(rawNode);
  const id = normalizeId(data.id, 'node.id');
  const kind = normalizeId(data.kind, 'node.kind');
  let params = asObject(data.params);
  if (params.media != null) params = { ...params, media: normalizeMediaDescriptor(params.media) };
  const node = {
    id,
    kind,
    label: data.label == null ? id : String(data.label),
    flow: normalizeFlow(data.flow),
    params,
    design: normalizeDesign(data.design),
    children: Array.isArray(data.children) ? data.children.map((childId) => normalizeId(childId, 'node.children')) : [],
    state: asObject(data.state),
  };

  if (data.parentId != null) node.parentId = normalizeId(data.parentId, 'node.parentId');
  if (data.themeScope != null) node.themeScope = normalizeId(data.themeScope, 'node.themeScope');
  if (data.metadata != null) node.metadata = asObject(data.metadata);

  return node;
}

export function normalizeGraphEdge(rawEdge) {
  const data = asObject(rawEdge);
  const source = normalizeGraphEndpoint(data.source);
  const target = normalizeGraphEndpoint(data.target);
  const kind = String(data.kind ?? 'dataflow');
  const id = data.id == null
    ? `${source.nodeId}:${source.port}->${target.nodeId}:${target.port}`
    : normalizeId(data.id, 'edge.id');

  const edge = {
    id,
    kind,
    source,
    target,
    params: asObject(data.params),
  };

  const allowedDirections = new Set(['none', 'forward', 'reverse', 'both']);
  edge.direction = allowedDirections.has(data.direction) ? data.direction : 'none';

  edge.design = asObject(data.design);
  edge.design.marker = asObject(edge.design.marker);
  const role = edge.design.marker.role;
  edge.design.marker.role = (role === 'flow' || role === 'gate') ? role : 'none';

  if (data.label != null) edge.label = String(data.label);
  if (data.metadata != null) edge.metadata = asObject(data.metadata);

  return edge;
}

function normalizeView(view) {
  const data = asObject(view);
  return {
    ...data,
    kind: String(data.kind ?? 'graph-canvas'),
    roots: Array.isArray(data.roots) ? data.roots.map((id) => normalizeId(id, 'view.roots')) : [],
    groups: Array.isArray(data.groups) ? data.groups.map((group) => ({
      ...asObject(group),
      id: normalizeId(asObject(group).id, 'view.group.id'),
      nodeIds: Array.isArray(asObject(group).nodeIds)
        ? asObject(group).nodeIds.map((id) => normalizeId(id, 'view.group.nodeIds'))
        : [],
    })) : [],
  };
}

function normalizeViews(views) {
  const data = asObject(views);
  return Object.fromEntries(
    Object.entries(data).map(([name, view]) => [name, normalizeView(view)])
  );
}

export function normalizeGraphModel(rawModel = {}) {
  const data = asObject(rawModel);
  const nodes = [];
  const nodesById = new Map();

  for (const rawNode of data.nodes || []) {
    const node = normalizeGraphNode(rawNode);
    if (nodesById.has(node.id)) throw new Error(`node "${node.id}" is already defined`);
    nodes.push(node);
    nodesById.set(node.id, node);
  }

  const rawEdges = data.edges ?? [];
  const edges = rawEdges.map(normalizeGraphEdge);
  const edgesById = new Map();
  for (const edge of edges) {
    if (edgesById.has(edge.id)) throw new Error(`edge "${edge.id}" is already defined`);
    if (!nodesById.has(edge.source.nodeId)) {
      throw new Error(`source node "${edge.source.nodeId}" is not defined`);
    }
    if (!nodesById.has(edge.target.nodeId)) {
      throw new Error(`target node "${edge.target.nodeId}" is not defined`);
    }
    edgesById.set(edge.id, edge);
  }

  for (const node of nodes) {
    for (const childId of node.children) {
      if (!nodesById.has(childId)) throw new Error(`child node "${childId}" is not defined`);
    }
  }

  return {
    version: 'graph-model-v1',
    metadata: asObject(data.metadata),
    nodes,
    edges,
    views: normalizeViews(data.views),
    theme: data.theme == null ? null : asObject(data.theme),
    nodesById,
    edgesById,
  };
}
