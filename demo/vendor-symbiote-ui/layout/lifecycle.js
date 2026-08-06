const DEFAULT_LAYOUT_LIFECYCLE_SELECTOR = [
  'chat-workspace',
  'chat-composer',
  'cell-bg',
  'canvas-graph',
  'node-canvas',
  'graph-explorer-shell',
  'panel-layout',
  'layout-node',
].join(',');

function canQuery(root) {
  return Boolean(root && typeof root.querySelectorAll === 'function');
}

function normalizeTargets(root, selector = DEFAULT_LAYOUT_LIFECYCLE_SELECTOR) {
  if (!root) return [];
  let targets = [root];
  if (canQuery(root)) {
    targets.push(...root.querySelectorAll('*'));
    targets.push(...root.querySelectorAll(selector));
  }
  return [...new Set(targets)].filter((target) => {
    return typeof target?.suspendLayout === 'function' || typeof target?.resumeLayout === 'function';
  });
}

function callLifecycle(target, method, context) {
  let fn = target?.[method];
  if (typeof fn !== 'function') return false;
  fn.call(target, context);
  return true;
}

function setLayoutSuspended(root, suspended, options = {}) {
  let {
    selector = DEFAULT_LAYOUT_LIFECYCLE_SELECTOR,
    reason = suspended ? 'layout-suspend' : 'layout-resume',
  } = options || {};
  let context = {
    ...options,
    reason,
    suspended,
  };
  let method = suspended ? 'suspendLayout' : 'resumeLayout';
  let targets = normalizeTargets(root, selector);

  for (let target of targets) {
    if (suspended) {
      target.setAttribute?.('data-layout-suspended', '');
    } else {
      target.removeAttribute?.('data-layout-suspended');
    }
    callLifecycle(target, method, context);
  }

  return targets.length;
}

export function suspendLayoutSubtree(root, options = {}) {
  return setLayoutSuspended(root, true, options);
}

export function resumeLayoutSubtree(root, options = {}) {
  return setLayoutSuspended(root, false, options);
}

export { DEFAULT_LAYOUT_LIFECYCLE_SELECTOR };
