export const PATH_STYLES = ['pcb', 'bezier', 'orthogonal', 'straight'];

export function resolveInitialViewMode(urlParams) {
  const modeParam = urlParams.get('mode') || (urlParams.get('flat') === 'true' ? 'flat' : null);
  return modeParam === 'flat' ? 'flat' : 'structured';
}

export function renderViewModeButton(button, viewMode) {
  if (!button) return;
  const label = viewMode === 'flat' ? 'FLAT' : 'TREE';
  const icon = viewMode === 'flat' ? 'account_tree' : 'grid_view';
  button.innerHTML = `<span class="material-symbols-outlined">${icon}</span>${label}`;
  if (viewMode === 'structured') {
    button.setAttribute('data-active', '');
  } else {
    button.removeAttribute('data-active');
  }
}

export function getNextPathStyle(currentStyle) {
  const index = PATH_STYLES.indexOf(currentStyle);
  return PATH_STYLES[(index + 1) % PATH_STYLES.length] || 'pcb';
}

export function getPathStyleDisplay(style) {
  switch (style) {
    case 'bezier':
      return { icon: 'timeline', text: 'BEZIER', active: false };
    case 'orthogonal':
      return { icon: 'polyline', text: 'ORTHO', active: false };
    case 'straight':
      return { icon: 'horizontal_rule', text: 'STRAIGHT', active: false };
    case 'pcb':
    default:
      return { icon: 'route', text: 'PCB', active: true };
  }
}

export function renderPathStyleButton(button, style) {
  if (!button) return;
  const { icon, text, active } = getPathStyleDisplay(style);
  button.innerHTML = `<span class="material-symbols-outlined">${icon}</span>${text}`;
  if (active) {
    button.setAttribute('data-active', '');
  } else {
    button.removeAttribute('data-active');
  }
}
