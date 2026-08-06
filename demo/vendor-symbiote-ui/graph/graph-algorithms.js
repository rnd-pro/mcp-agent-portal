export function resolveSymbolFile(skeleton, symbol) {
  if (!skeleton || !symbol) return null;
  const entry = (skeleton.n || {})[symbol];
  return entry?.f || null;
}

export function findConnectionPath(connections, fromId, toId) {
  if (!fromId || !toId || fromId === toId) return [];

  const adjacency = new Map();
  for (const connection of connections || []) {
    if (!adjacency.has(connection.from)) adjacency.set(connection.from, []);
    adjacency.get(connection.from).push({ to: connection.to, id: connection.id });
  }

  const visited = new Set([fromId]);
  const queue = [[fromId, []]];

  while (queue.length > 0) {
    const [current, path] = queue.shift();
    if (current === toId) return path;

    for (const edge of adjacency.get(current) || []) {
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      queue.push([edge.to, [...path, edge.id]]);
    }
  }

  return [];
}
