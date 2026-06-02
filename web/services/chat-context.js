import {
  normalizeAttachedContextItem as _normalize,
  mergeAttachedContext as _merge,
  removeAttachedContext as _remove,
  formatAttachedContextBlock as _format,
  FILE_TYPE_HANDLER,
} from 'symbiote-node/chat/chat-context.js';

// --- Portal-specific type handlers ---

const GRAPH_CLUSTER_HANDLER = {
  normalize(input) {
    let clusterId = String(input.clusterId || '').trim();
    let label = String(input.label || input.name || clusterId).trim();
    let paths = Array.isArray(input.paths) ? input.paths.map(String).filter(Boolean) : [];
    return {
      type: 'graph-cluster',
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
  },
  contextKey(item) {
    return item.key || `graph-cluster:${item.clusterId}`;
  },
  formatPayload(item) {
    return {
      type: item.type,
      clusterId: item.clusterId,
      label: item.label,
      description: item.description,
      pathPatterns: item.paths,
      source: item.source,
    };
  },
};

const GRAPH_STORY_BEAT_HANDLER = {
  normalize(input) {
    let storyId = String(input.storyId || '').trim();
    let beatId = String(input.beatId || '').trim();
    let storyLabel = String(input.storyLabel || '').trim();
    let beatLabel = String(input.beatLabel || input.name || beatId).trim();
    return {
      type: 'graph-story-beat',
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
  },
  contextKey(item) {
    return item.key || `graph-story-beat:${item.storyId}:${item.beatId}`;
  },
  formatPayload(item) {
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
  },
};

const TYPE_HANDLERS = {
  'file': FILE_TYPE_HANDLER,
  'graph-cluster': GRAPH_CLUSTER_HANDLER,
  'graph-story-beat': GRAPH_STORY_BEAT_HANDLER,
};

// --- Public API (same signatures as before) ---

export function normalizeAttachedContextItem(input) {
  return _normalize(input, TYPE_HANDLERS);
}

export function mergeAttachedContext(current, input) {
  return _merge(current, input, TYPE_HANDLERS);
}

export function removeAttachedContext(current, key) {
  return _remove(current, key, TYPE_HANDLERS);
}

export function formatAttachedContextBlock(context) {
  return _format(context, TYPE_HANDLERS);
}

export function extractAttachedFilePaths(context = []) {
  let paths = [];
  for (let item of context || []) {
    let normalized = normalizeAttachedContextItem(item);
    if (normalized.type !== 'file') continue;
    if (!normalized.path) continue;
    paths.push(normalized.path);
  }
  return [...new Set(paths)];
}
