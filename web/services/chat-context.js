function shortName(fullPath) {
  let clean = String(fullPath || '');
  let trimmed = clean.endsWith('/') ? clean.slice(0, -1) : clean;
  return (trimmed.split('/').pop() || clean) + (clean.endsWith('/') ? '/' : '');
}

function contextKey(item) {
  if (item.key) return String(item.key);
  if (item.type === 'graph-cluster') return `graph-cluster:${item.clusterId}`;
  if (item.type === 'graph-story-beat') return `graph-story-beat:${item.storyId}:${item.beatId}`;
  if (item.path) return `file:${item.path}`;
  return `${item.type || 'context'}:${item.name || item.title || ''}`;
}

export function normalizeAttachedContextItem(input = {}) {
  let type = input.type || 'file';
  if (type === 'graph-cluster') {
    let clusterId = String(input.clusterId || '').trim();
    let label = String(input.label || input.name || clusterId).trim();
    let paths = Array.isArray(input.paths) ? input.paths.map(String).filter(Boolean) : [];
    return {
      type,
      key: `graph-cluster:${clusterId}`,
      clusterId,
      name: label || 'Graph Cluster',
      title: input.description || `${label || clusterId}: ${paths.length} path patterns`,
      icon: 'account_tree',
      label,
      description: String(input.description || '').trim(),
      paths,
      source: input.source || 'dep-graph',
    };
  }

  if (type === 'graph-story-beat') {
    let storyId = String(input.storyId || '').trim();
    let beatId = String(input.beatId || '').trim();
    let storyLabel = String(input.storyLabel || '').trim();
    let beatLabel = String(input.beatLabel || input.name || beatId).trim();
    return {
      type,
      key: `graph-story-beat:${storyId}:${beatId}`,
      storyId,
      beatId,
      name: beatLabel || 'Story Beat',
      title: storyLabel ? `${storyLabel}: ${beatLabel}` : beatLabel,
      icon: 'movie',
      storyLabel,
      beatLabel,
      narrative: String(input.narrative || '').trim(),
      nodes: Array.isArray(input.nodes) ? input.nodes.map(String).filter(Boolean) : [],
      edges: Array.isArray(input.edges) ? input.edges.map(String).filter(Boolean) : [],
      clusterId: String(input.clusterId || '').trim(),
      focusPath: String(input.focusPath || '').trim(),
      source: input.source || 'graph-flows',
    };
  }

  let path = String(input.path || '').trim();
  return {
    type: 'file',
    key: `file:${path}`,
    path,
    name: input.name || shortName(path),
    title: path,
    icon: path.endsWith('/') ? 'folder' : 'description',
    source: input.source || 'manual',
  };
}

export function mergeAttachedContext(current = [], input = {}) {
  let item = normalizeAttachedContextItem(input);
  let key = contextKey(item);
  if (!key || key.endsWith(':')) return current;
  let withoutExisting = current.filter((ctx) => contextKey(ctx) !== key);
  return [...withoutExisting, item];
}

export function removeAttachedContext(current = [], key) {
  return current.filter((ctx) => contextKey(ctx) !== key);
}

export function formatAttachedContextBlock(context = []) {
  let items = context.map(normalizeAttachedContextItem).filter((item) => !contextKey(item).endsWith(':'));
  if (items.length === 0) return '';

  let payload = items.map((item) => {
    if (item.type === 'graph-cluster') {
      return {
        type: item.type,
        clusterId: item.clusterId,
        label: item.label,
        description: item.description,
        pathPatterns: item.paths,
        source: item.source,
      };
    }
    if (item.type === 'graph-story-beat') {
      return {
        type: item.type,
        storyId: item.storyId,
        beatId: item.beatId,
        storyLabel: item.storyLabel,
        beatLabel: item.beatLabel,
        narrative: item.narrative,
        nodes: item.nodes,
        edges: item.edges,
        clusterId: item.clusterId,
        focusPath: item.focusPath,
        source: item.source,
      };
    }
    return {
      type: 'file',
      path: item.path,
      source: item.source,
    };
  });

  return `[Attached Context]\n${JSON.stringify(payload, null, 2)}\n\n`;
}
