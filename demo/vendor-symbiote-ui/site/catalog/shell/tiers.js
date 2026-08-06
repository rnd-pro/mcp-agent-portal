export const STATIC_TAGS = new Set([
  'code-block', 'source-viewer', 'sn-badge', 'sn-banner', 'sn-card',
  'sn-empty-state', 'sn-event-feed', 'sn-checkbox', 'sn-field', 'sn-metric', 'sn-radio',
  'sn-switch', 'sn-slider', 'sn-rating', 'sn-segmented-control', 'sn-tooltip', 'sn-dialog',
  'sn-select', 'sn-toast', 'sn-toast-region', 'sn-listbox', 'sn-popover', 'sn-combobox', 'sn-drawer',
]);

export const CLIENT_CATEGORIES = new Set([
  'canvas', 'effects', 'inspector', 'menu', 'navigation', 'node', 'palette', 'toolbar',
]);

export const HYDRATE_FIXTURES = {
  'sn-kanban-board': el => el.setBoard({ columns: [{ id: 'c1', title: 'To do', cards: [{ id: 'k1', title: 'Card' }] }] }),
  'sn-tree-view': el => el.setItems([{ id: 't1', label: 'Item', children: [] }]),
  'sn-tree-panel': el => el.setItems([{ id: 't1', label: 'Item', children: [] }]),
  'chat-transcript': el => el.setMessageItems([{ id: 'm1', role: 'user', content: 'Hello' }]),
  'chat-list': el => el.setItems([{ id: 'l1', title: 'Chat', preview: 'Preview' }]),
  'sn-list-item': el => el.setItem({ label: 'Label', description: 'Description', meta: '' }),
  'project-tabs': el => { el.setTabs([{ id: 'p1', label: 'Tab' }]); el.activeId = 'p1'; },
  'sn-loading-overlay': el => el.setProgress(66, 'Loading', 'preview'),
  'sn-data-table': el => el.setData({
    columns: [{ key: 'name', label: 'Name' }, { key: 'role', label: 'Role' }],
    rows: [{ name: 'Aria', role: 'agent' }, { name: 'Cas', role: 'host' }],
  }),
  'sn-description-list': el => {
    el.innerHTML = '<sn-description-item label="Status">Active</sn-description-item>'
      + '<sn-description-item label="Owner">agent</sn-description-item>';
  },
};

export function tierOf(tag, category) {
  if (STATIC_TAGS.has(tag)) return 'STATIC';
  if (CLIENT_CATEGORIES.has(category)) return 'CLIENT';
  return 'HYDRATE';
}
