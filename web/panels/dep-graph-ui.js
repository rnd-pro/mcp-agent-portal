export {
  resolveGraphNodeClick,
  resolveToolbarAction,
} from 'symbiote-node/ui';

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

export function getFlatFocusRestoreKey({ path = '', focus = null } = {}) {
  return `${path || ''}::${focus || ''}`;
}

export function shouldRestoreFlatFocus({ lastKey = null, path = '', focus = null } = {}) {
  if (!focus) return false;
  return getFlatFocusRestoreKey({ path, focus }) !== lastKey;
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

