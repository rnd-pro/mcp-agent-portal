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

export function shouldClearFocusOnSelection({ selectedNodes = [], initialViewRestored, hash = '' }) {
  return selectedNodes.length === 0 && Boolean(initialViewRestored) && hash.includes('focus=');
}

export function resolveFlatHashChange(hash) {
  if (!hash.startsWith('#graph')) return null;

  const [hashBase, queryStr] = hash.replace('#', '').split('?');
  const hashParams = hashBase.split('/');
  if (hashParams[0] === 'graph') hashParams.shift();

  const path = hashParams.join('/');
  const params = new URLSearchParams(queryStr || '');
  const focus = params.get('focus');

  return {
    path,
    focus: focus ? decodeURIComponent(focus) : null,
  };
}

export function getGraphHashNavigationState(hash = '') {
  const hasPath = /^#graph\//.test(hash);
  const hasParams = hash.includes('?');

  return {
    hasPath,
    hasParams,
    shouldRestore: hasPath || hasParams,
  };
}

export function shouldFitForceLayoutInitialTick(hash = '') {
  return !(hash.includes('?') || hash.includes('focus='));
}
