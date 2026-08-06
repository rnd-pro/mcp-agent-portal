const DEFAULT_LIST_LIMIT = 50;
const DEFAULT_GRAPH_NODE_LIMIT = 80;
const DEFAULT_GRAPH_EDGE_LIMIT = 160;

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringifyPrimitive(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function valueKind(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function stableId(prefix, index) {
  return `${prefix}-${index + 1}`;
}

function truncateText(value, maxLength) {
  let text = String(value || '');
  if (!Number.isFinite(maxLength) || maxLength <= 0 || text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}...`;
}

function readFirst(record, keys) {
  for (let key of keys) {
    let value = record[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function describeValue(value, maxLength) {
  if (!isRecord(value) && !Array.isArray(value)) {
    return truncateText(stringifyPrimitive(value), maxLength);
  }
  try {
    return truncateText(JSON.stringify(value), maxLength);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function coerceArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  if (isRecord(value)) {
    if (Array.isArray(value.items)) return value.items;
    if (Array.isArray(value.results)) return value.results;
    if (Array.isArray(value.entries)) return value.entries;
    return Object.entries(value).map(([key, itemValue]) => ({ key, value: itemValue }));
  }
  return [value];
}

function normalizeListItem(item, index, options) {
  let maxTextLength = options.maxTextLength ?? 160;
  if (!isRecord(item)) {
    return {
      id: stableId('item', index),
      label: describeValue(item, maxTextLength) || `Item ${index + 1}`,
      description: '',
      meta: valueKind(item),
      kind: valueKind(item),
      status: '',
      value: item,
    };
  }

  let id = readFirst(item, ['id', 'key', 'name', 'label']);
  let label = readFirst(item, ['label', 'title', 'name', 'key', 'id']);
  let description = readFirst(item, ['description', 'summary', 'text', 'message', 'value']);
  let meta = readFirst(item, ['meta', 'detail', 'type', 'kind']);
  let kind = readFirst(item, ['kind', 'type']);
  let status = readFirst(item, ['status', 'state']);

  return {
    id: id === undefined ? stableId('item', index) : String(id),
    label: truncateText(label === undefined ? `Item ${index + 1}` : label, maxTextLength),
    description: truncateText(description === undefined ? '' : description, maxTextLength),
    meta: truncateText(meta === undefined ? '' : meta, maxTextLength),
    kind: kind === undefined ? 'item' : String(kind),
    status: status === undefined ? '' : String(status),
    value: item.value === undefined ? item : item.value,
  };
}

/**
 * @param {*} value
 * @param {Object} [options]
 * @param {number} [options.limit]
 * @param {number} [options.maxTextLength]
 * @returns {{ items: Array<object>, total: number, visible: number, truncated: boolean, empty: boolean }}
 */
export function normalizeOutputList(value, options = {}) {
  let sourceItems = coerceArray(value);
  let limit = Number.isFinite(options.limit) ? Math.max(0, options.limit) : DEFAULT_LIST_LIMIT;
  let items = sourceItems
    .slice(0, limit)
    .map((item, index) => normalizeListItem(item, index, options));

  return {
    items,
    total: sourceItems.length,
    visible: items.length,
    truncated: sourceItems.length > items.length,
    empty: items.length === 0,
  };
}

function readNodeId(node, index) {
  if (!isRecord(node)) return stableId('node', index);
  let id = readFirst(node, ['id', 'key', 'name']);
  return id === undefined ? stableId('node', index) : String(id);
}

function normalizeGraphNode(node, index, options) {
  let maxTextLength = options.maxTextLength ?? 120;
  if (!isRecord(node)) {
    return {
      id: stableId('node', index),
      label: describeValue(node, maxTextLength) || `Node ${index + 1}`,
      kind: valueKind(node),
      description: '',
      status: '',
      meta: '',
      x: null,
      y: null,
      value: node,
    };
  }

  let position = isRecord(node.position) ? node.position : {};
  let id = readNodeId(node, index);
  let label = readFirst(node, ['label', 'title', 'name', 'id']);
  let kind = readFirst(node, ['kind', 'type']);
  let description = readFirst(node, ['description', 'summary', 'text']);
  let status = readFirst(node, ['status', 'state']);
  let meta = readFirst(node, ['meta', 'detail']);
  let x = Number.isFinite(node.x) ? node.x : Number.isFinite(position.x) ? position.x : null;
  let y = Number.isFinite(node.y) ? node.y : Number.isFinite(position.y) ? position.y : null;

  return {
    id,
    label: truncateText(label === undefined ? id : label, maxTextLength),
    kind: kind === undefined ? 'node' : String(kind),
    description: truncateText(description === undefined ? '' : description, maxTextLength),
    status: status === undefined ? '' : String(status),
    meta: truncateText(meta === undefined ? '' : meta, maxTextLength),
    x,
    y,
    value: node.value === undefined ? node : node.value,
  };
}

function readEndpoint(endpoint, fallbackKeys) {
  if (typeof endpoint === 'string' || typeof endpoint === 'number') return String(endpoint);
  if (isRecord(endpoint)) {
    let id = readFirst(endpoint, ['id', 'nodeId', 'node', ...fallbackKeys]);
    if (id !== undefined) return String(id);
  }
  return '';
}

function normalizeGraphEdge(edge, index, options) {
  let maxTextLength = options.maxTextLength ?? 120;
  if (!isRecord(edge)) {
    return {
      id: stableId('edge', index),
      source: '',
      target: '',
      label: describeValue(edge, maxTextLength),
      kind: valueKind(edge),
      value: edge,
    };
  }

  let source = readEndpoint(edge.source, ['from']);
  let target = readEndpoint(edge.target, ['to']);
  if (!source) source = readEndpoint(edge.from, ['source']);
  if (!target) target = readEndpoint(edge.to, ['target']);

  let id = readFirst(edge, ['id', 'key']);
  let label = readFirst(edge, ['label', 'title', 'name']);
  let kind = readFirst(edge, ['kind', 'type']);

  return {
    id: id === undefined ? stableId('edge', index) : String(id),
    source,
    target,
    label: truncateText(label === undefined ? '' : label, maxTextLength),
    kind: kind === undefined ? 'edge' : String(kind),
    value: edge.value === undefined ? edge : edge.value,
  };
}

function readGraphArrays(value) {
  if (!isRecord(value)) {
    return {
      nodes: coerceArray(value),
      edges: [],
    };
  }

  return {
    nodes: Array.isArray(value.nodes) ? value.nodes : coerceArray(value.items || []),
    edges: Array.isArray(value.edges)
      ? value.edges
      : Array.isArray(value.connections)
        ? value.connections
        : Array.isArray(value.links)
          ? value.links
          : [],
  };
}

/**
 * @param {*} value
 * @param {Object} [options]
 * @param {number} [options.nodeLimit]
 * @param {number} [options.edgeLimit]
 * @param {number} [options.maxTextLength]
 * @returns {{ nodes: Array<object>, edges: Array<object>, totalNodes: number, totalEdges: number, truncated: boolean, empty: boolean }}
 */
export function normalizePreviewGraph(value, options = {}) {
  let graph = readGraphArrays(value);
  let nodeLimit = Number.isFinite(options.nodeLimit)
    ? Math.max(0, options.nodeLimit)
    : DEFAULT_GRAPH_NODE_LIMIT;
  let edgeLimit = Number.isFinite(options.edgeLimit)
    ? Math.max(0, options.edgeLimit)
    : DEFAULT_GRAPH_EDGE_LIMIT;

  let nodes = graph.nodes
    .slice(0, nodeLimit)
    .map((node, index) => normalizeGraphNode(node, index, options));
  let nodeIds = new Set(nodes.map((node) => node.id));
  let edges = graph.edges
    .slice(0, edgeLimit)
    .map((edge, index) => normalizeGraphEdge(edge, index, options))
    .filter((edge) => edge.source && edge.target && nodeIds.has(edge.source) && nodeIds.has(edge.target));

  return {
    nodes,
    edges,
    totalNodes: graph.nodes.length,
    totalEdges: graph.edges.length,
    truncated: graph.nodes.length > nodes.length || graph.edges.length > edges.length,
    empty: nodes.length === 0,
  };
}
