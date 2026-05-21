export function mountDepGraphTemplate(host, template, doc = document) {
  host.replaceChildren(doc.createRange().createContextualFragment(template));
}

export function renderClusterPanel({
  panel,
  toggle,
  clusters = [],
  viewMode,
  isOpen,
  doc = document,
}) {
  if (!panel) return;
  let hasFlatLegend = clusters.length > 0 && viewMode === 'flat';

  if (toggle) {
    toggle.hidden = !hasFlatLegend;
    toggle.toggleAttribute('data-active', hasFlatLegend && isOpen);
    toggle.setAttribute(
      'title',
      isOpen ? 'Hide semantic color legend' : 'Show semantic color legend',
    );
  }

  if (!hasFlatLegend || !isOpen) {
    panel.hidden = true;
    panel.replaceChildren();
    return;
  }

  panel.hidden = false;
  panel.replaceChildren(...clusters.map((cluster) => {
    let row = doc.createElement('div');
    let swatch = doc.createElement('span');
    let label = doc.createElement('span');
    let pathCount = cluster.paths.length;

    row.className = 'pcb-cluster-row';
    row.title = cluster.description || `${cluster.label}: ${pathCount} paths`;
    swatch.className = 'pcb-cluster-swatch';
    swatch.style.background = cluster.color;
    label.className = 'pcb-cluster-label';
    label.textContent = cluster.label;
    row.replaceChildren(swatch, label);
    return row;
  }));
}

export function renderGraphStats(statsEl, items, doc = document) {
  if (!statsEl) return;
  statsEl.replaceChildren(...items.map(([value, label]) => {
    let item = doc.createElement('span');
    let valueEl = doc.createElement('span');
    valueEl.className = 'graph-explorer-stat-val';
    valueEl.textContent = String(value);
    item.append(valueEl, ` ${label}`);
    return item;
  }));
}
