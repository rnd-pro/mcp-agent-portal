function typePlaceholder(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('bool')) return null;
  if (t.includes('number') || t.includes('int')) return '0';
  return '…';
}

export function synthesizeSnippet(model) {
  const { tag, attributes, slots } = model;
  const attrParts = [];
  for (const a of attributes.slice(0, 4)) {
    if (!a.name) continue;
    const ph = typePlaceholder(a.type);
    if (ph === null) attrParts.push(a.name);
    else attrParts.push(`${a.name}="${ph}"`);
  }
  const open = attrParts.length ? `<${tag} ${attrParts.join(' ')}>` : `<${tag}>`;

  const hasDefaultSlot = slots.some(s => !s.name || s.name === 'default');
  const namedSlots = slots.filter(s => s.name && s.name !== 'default');

  if (hasDefaultSlot) {
    return `${open}\n  …\n</${tag}>`;
  }
  if (namedSlots.length) {
    const children = namedSlots
      .slice(0, 4)
      .map(s => `  <span slot="${s.name}">…</span>`)
      .join('\n');
    return `${open}\n${children}\n</${tag}>`;
  }
  return `<${tag}></${tag}>`;
}
