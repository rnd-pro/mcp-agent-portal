const CODE_TOOLS = new Set([
  'default_api:view_file',
  'default_api:replace_file_content',
  'default_api:multi_replace_file_content',
  'default_api:write_to_file',
]);

const GRAPH_TOOLS = new Set([
  'default_api:mcp_project-graph_navigate',
  'default_api:mcp_project-graph_get_skeleton',
]);

const LIST_TOOLS = new Set([
  'default_api:list_dir',
  'default_api:grep_search',
]);

function parseOutput(output) {
  try {
    return JSON.parse(output);
  } catch {
    return output;
  }
}

function toPreviewGraph(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  if (Array.isArray(data.nodes)) return data;

  let nodeMap = data.n && typeof data.n === 'object' ? data.n : {};
  let nodes = Object.entries(nodeMap).map(([id, node]) => ({
    id,
    label: node?.label || node?.name || node?.title || id,
    kind: node?.kind || node?.type || 'node',
    description: node?.description || node?.summary || '',
  }));

  let edges = Array.isArray(data.e) ? data.e.map((edge, index) => ({
    id: edge.id || `edge-${index + 1}`,
    source: edge.source || edge.from || edge.a || '',
    target: edge.target || edge.to || edge.b || '',
    label: edge.label || edge.name || '',
    kind: edge.kind || edge.type || 'edge',
  })) : [];

  return { nodes, edges };
}

function buildPreview(event) {
  if (event.type === 'tool_call') return { type: 'empty' };
  if (event.success === false || !event.output) {
    return { type: 'error', value: event.output || 'Error' };
  }

  let output = String(event.output ?? '');
  let data = parseOutput(output);

  if (CODE_TOOLS.has(event.tool)) return { type: 'code', value: output, lang: 'plain' };
  if (GRAPH_TOOLS.has(event.tool)) return { type: 'graph', value: toPreviewGraph(data), title: 'Graph output' };
  if (LIST_TOOLS.has(event.tool)) return { type: 'list', value: data, title: 'List output' };
  return { type: 'raw', value: output };
}

export function toToolEventFeedItem(event) {
  return {
    direction: event.type === 'tool_call' ? 'call' : 'result',
    tool: event.tool,
    timestamp: event.ts,
    durationText: event.duration_ms ? `${event.duration_ms}ms` : '',
    success: event.success !== false,
    args: event.args || {},
    preview: buildPreview(event),
  };
}

export function toToolEventFeedItems(events) {
  return Array.isArray(events) ? events.map(toToolEventFeedItem) : [];
}
