function buildTable(title, headers, rows) {
  const fragment = document.createDocumentFragment();
  const heading = document.createElement('div');
  heading.className = 'api-section-title';
  heading.textContent = title;
  fragment.appendChild(heading);

  const table = document.createElement('table');
  table.className = 'api-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const h of headers) {
    const th = document.createElement('th');
    th.textContent = h;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const cells of rows) {
    const tr = document.createElement('tr');
    for (const cell of cells) {
      const td = document.createElement('td');
      td.textContent = cell == null ? '' : cell;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  fragment.appendChild(table);
  return fragment;
}

function eventDetailText(detail) {
  return detail
    .map(p => {
      const type = p.type?.text ?? p.type;
      return type ? `${p.name}:${type}` : p.name;
    })
    .join(', ');
}

export function renderApiTables(model) {
  const fragment = document.createDocumentFragment();

  if (model.attributes.length) {
    fragment.appendChild(buildTable(
      'Attributes',
      ['Name', 'Type', 'Description'],
      model.attributes.map(a => [a.name, a.type, a.description]),
    ));
  }
  if (model.properties.length) {
    fragment.appendChild(buildTable(
      'Properties',
      ['Name', 'Type', 'Description'],
      model.properties.map(p => [p.name, p.type, p.description]),
    ));
  }
  if (model.methods.length) {
    fragment.appendChild(buildTable(
      'Methods',
      ['Name', 'Signature', 'Description'],
      model.methods.map(m => [m.name, m.type, m.description]),
    ));
  }
  if (model.slots.length) {
    fragment.appendChild(buildTable(
      'Slots',
      ['Name', 'Description'],
      model.slots.map(s => [s.name || 'default', s.description]),
    ));
  }
  if (model.events.length) {
    fragment.appendChild(buildTable(
      'Events',
      ['Name', 'Detail', 'Description'],
      model.events.map(e => [e.name, eventDetailText(e.detail), e.description]),
    ));
  }
  if (model.cssProperties.length) {
    fragment.appendChild(buildTable(
      'CSS Custom Properties',
      ['Name', 'Description'],
      model.cssProperties.map(p => [p.name, p.description]),
    ));
  }

  return fragment;
}
