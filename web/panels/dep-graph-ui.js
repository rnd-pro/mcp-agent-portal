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
