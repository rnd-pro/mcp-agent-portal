export function normalizeQuickOpenItems(items = []) {
  return items
    .map((item) => {
      if (typeof item === 'string') {
        return {
          id: item,
          label: item.split('/').pop() || item,
          path: item.includes('/') ? item.substring(0, item.lastIndexOf('/')) : '',
          value: item,
        };
      }

      let value = item.value || item.file || item.path || item.id || item.label || '';
      let label = item.label || item.name || String(value).split('/').pop() || String(value);
      let path = item.path || '';
      if (!path && typeof value === 'string' && value.includes('/')) {
        path = value.substring(0, value.lastIndexOf('/'));
      }

      return {
        ...item,
        id: item.id || value || label,
        label,
        path,
        value,
      };
    })
    .filter((item) => item.value || item.label);
}

export function fuzzyScore(query, candidate) {
  if (!query) return 0;
  if (candidate.includes(query)) {
    return 100 + (query.length / candidate.length) * 50;
  }

  let queryIdx = 0;
  let streak = 0;
  let score = 0;

  for (let i = 0; i < candidate.length && queryIdx < query.length; i++) {
    if (candidate[i] === query[queryIdx]) {
      queryIdx++;
      score += 10 + streak;
      streak += 5;

      if (i === 0 || candidate[i - 1] === '/' || candidate[i - 1] === '-' || candidate[i - 1] === '.') {
        score += 15;
      }
    } else {
      streak = 0;
    }
  }

  return queryIdx === query.length ? score : 0;
}

export function searchQuickOpenItems(items = [], query = '', limit = 15) {
  let normalizedQuery = query.toLowerCase().trim();
  let normalizedItems = normalizeQuickOpenItems(items);

  if (!normalizedQuery) {
    return normalizedItems.slice(0, limit).map((item) => ({ item, score: 0 }));
  }

  let results = [];
  for (let item of normalizedItems) {
    let haystack = [item.label, item.path, item.value].filter(Boolean).join('/').toLowerCase();
    let score = fuzzyScore(normalizedQuery, haystack);
    if (score > 0) results.push({ item, score });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export function collectQuickOpenFilesFromSkeleton(skeleton = {}) {
  let files = new Set();

  for (let file of Object.keys(skeleton.X || {})) {
    files.add(file);
  }

  for (let node of Object.values(skeleton.n || {})) {
    if (node.f) files.add(node.f);
  }

  for (let [dir, entries] of Object.entries(skeleton.f || {})) {
    for (let file of entries) {
      files.add(dir === './' ? file : `${dir}${file}`);
    }
  }

  for (let [dir, entries] of Object.entries(skeleton.a || {})) {
    for (let file of entries) {
      files.add(dir === './' ? file : `${dir}${file}`);
    }
  }

  return [...files].sort();
}
