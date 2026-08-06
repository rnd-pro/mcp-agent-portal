export function createEventFeedAdapter(options = {}) {
  const codeTools = new Set(options.codeTools || [])
  const graphTools = new Set(options.graphTools || [])
  const listTools = new Set(options.listTools || [])

  function parseOutput(output) {
    try {
      return JSON.parse(output)
    } catch {
      return output
    }
  }

  function toPreviewGraph(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return data
    if (Array.isArray(data.nodes)) return data

    let nodeMap = data.n && typeof data.n === 'object' ? data.n : {}
    let nodes = Object.entries(nodeMap).map(([id, node]) => ({
      id,
      label: node?.label || node?.name || node?.title || id,
      kind: node?.kind || node?.type || 'node',
      description: node?.description || node?.summary || '',
    }))

    let edges = Array.isArray(data.e) ? data.e.map((edge, index) => ({
      id: edge.id || `edge-${index + 1}`,
      source: edge.source || edge.from || edge.a || '',
      target: edge.target || edge.to || edge.b || '',
      label: edge.label || edge.name || '',
      kind: edge.kind || edge.type || 'edge',
    })) : []

    return { nodes, edges }
  }

  function buildPreview(event) {
    if (event.type === 'tool_call') return { type: 'empty' }
    if (event.success === false || !event.output) {
      return { type: 'error', value: event.output || 'Error' }
    }

    let output = String(event.output ?? '')
    let data = parseOutput(output)

    if (codeTools.has(event.tool)) return { type: 'code', value: output, lang: 'plain' }
    if (graphTools.has(event.tool)) return { type: 'graph', value: toPreviewGraph(data), title: 'Graph output' }
    if (listTools.has(event.tool)) return { type: 'list', value: data, title: 'List output' }
    return { type: 'raw', value: output }
  }

  function toToolEventFeedItem(event) {
    return {
      direction: event.type === 'tool_call' ? 'call' : 'result',
      tool: event.tool,
      timestamp: event.ts,
      durationText: event.duration_ms ? `${event.duration_ms}ms` : '',
      success: event.success !== false,
      args: event.args || {},
      preview: buildPreview(event),
    }
  }

  function toToolEventFeedItems(events) {
    return Array.isArray(events) ? events.map(toToolEventFeedItem) : []
  }

  return {
    toToolEventFeedItem,
    toToolEventFeedItems
  }
}
