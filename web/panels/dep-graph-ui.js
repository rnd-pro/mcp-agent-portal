export function buildFlatPathHash(path, params = new URLSearchParams()) {
  const nextParams = new URLSearchParams(params);
  const hash = path ? `#graph/${path}` : '#graph';

  if (!path) {
    nextParams.delete('focus');
  }

  const query = nextParams.toString();
  return query ? `${hash}?${query}` : hash;
}

export function selectLabelMode(buttons, selectedButton, canvas) {
  for (const button of buttons) {
    button.removeAttribute('data-active');
  }
  selectedButton.setAttribute('data-active', '');

  const mode = selectedButton.getAttribute('data-mode');
  if (mode) canvas?.setAttribute('data-label-mode', mode);

  return mode;
}

export function getFileSelectionNodeId(filePath) {
  return filePath?.endsWith('/') ? filePath.replace(/\/$/, '') : filePath;
}

export function resolveGraphNodeClick({ nodeId, path, symbol, depth = 0, hash = '' }) {
  if (symbol) {
    return {
      hashUpdates: [['symbol', symbol.name]],
      fileEvent: symbol.file ? { path: symbol.file, source: 'canvas' } : null,
    };
  }

  if (!path) return null;

  if (depth === 0) {
    return {
      hashUpdates: [['focus', path], ['in', null]],
      fileEvent: { path, source: 'canvas' },
    };
  }

  const drillBase = hash.split('?')[0];
  const drillPath = drillBase.replace('#graph/', '');
  const relativeName = path.startsWith(drillPath) ? path.slice(drillPath.length) : path;

  return {
    hashUpdates: [['focus', relativeName], ['in', '1']],
    fileEvent: { path, source: 'canvas' },
  };
}

export function resolveToolbarAction({ action, nodeId, viewMode, path, symbol }) {
  if (action === 'explore') {
    return viewMode === 'flat'
      ? { type: 'fly-to-node', nodeId }
      : { type: 'explore-node', nodeId };
  }

  if (action === 'view-code') {
    const file = viewMode === 'flat' ? nodeId : (symbol ? symbol.file : path);
    return file ? { type: 'open-file', hash: `#explorer/${file}` } : null;
  }

  if (action === 'enter' && viewMode === 'flat') {
    return { type: 'drill-node', nodeId };
  }

  return null;
}
