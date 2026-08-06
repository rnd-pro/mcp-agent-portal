import { tierOf } from './tiers.js';

export const CATEGORY_ICONS = {
  display: 'dashboard',
  control: 'tune',
  layout: 'space_dashboard',
  chat: 'forum',
  board: 'view_kanban',
  canvas: 'gesture',
  graph: 'hub',
  node: 'account_tree',
  tree: 'account_tree',
  menu: 'menu',
  navigation: 'explore',
  toolbar: 'build',
  surface: 'layers',
  list: 'list',
  inspector: 'frame_inspect',
  palette: 'palette',
  themes: 'palette',
  effects: 'auto_awesome',
  icons: 'category',
  viewport: 'crop_free',
  timeline: 'timeline',
  interactions: 'touch_app',
  locale: 'translate',
  default: 'widgets',
};

function categoryIcon(id) {
  return CATEGORY_ICONS[id] || CATEGORY_ICONS.default;
}

function categoryLabel(id) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export function extract(d, category) {
  const c = d.contract || {};
  return {
    tag: d.tagName,
    category,
    description: d.description,
    componentDescription: d.componentDescription,
    semanticRole: d.agent?.semanticRole,
    usage: d.agent?.usage,
    dataOwnership: d.agent?.dataOwnership,
    attributes: (d.attributes || []).map(a => ({ name: a.name, type: a.type?.text, description: a.description })),
    properties: (c.properties || []).map(p => ({ name: p.name, type: p.type, description: p.description })),
    methods: (c.methods || []).map(m => ({ name: m.name, type: m.type, description: m.description })),
    slots: (d.slots || []).map(s => ({ name: s.name, description: s.description })),
    events: (d.events || []).map(e => ({ name: e.name, description: e.description, detail: Array.isArray(e.detail) ? e.detail : [] })),
    cssProperties: (d.cssProperties || []).map(p => ({ name: p.name, description: p.description })),
    capabilities: c.capabilities || [],
    status: c.status,
    themeAliases: c.themeAliases || [],
    ssr: c.ssr || null,
  };
}

export async function loadCatalog() {
  const cem = await fetch(new URL('./custom-elements.json', document.baseURI)).then(r => r.json());

  const models = [];
  for (const mod of cem.modules) {
    const category = mod.path.split('/')[0];
    for (const d of (mod.declarations || [])) {
      if (d.kind === 'class' && d.customElement === true && d.tagName) {
        const model = extract(d, category);
        model.tier = tierOf(model.tag, model.category);
        models.push(model);
      }
    }
  }

  const byCategory = new Map();
  for (const m of models) {
    if (!byCategory.has(m.category)) byCategory.set(m.category, []);
    byCategory.get(m.category).push(m);
  }

  const categories = [...byCategory.keys()].sort().map(id => ({
    id,
    label: categoryLabel(id),
    icon: categoryIcon(id),
    count: byCategory.get(id).length,
  }));

  return { categories, byCategory };
}
