import { normalizeGraphModel } from './model.js';
import { getThemeControls } from '../manifest/theme-catalog.js';

const LOCAL_PATH_PATTERN = /(^|[\s"'=:])(?:\/Users\/|\/home\/|[A-Za-z]:\\)/;
const PROVIDER_THEME_ALIASES = new Map([
  ['symbiote-default', 'default-provider'],
  ['symbiote-default-provider', 'default-provider'],
  ['default-provider', 'default-provider'],
]);

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeId(value, fieldName) {
  const id = String(value ?? '').trim();
  if (!id) throw new Error(`${fieldName} is required`);
  return id;
}

function assertNoLocalPaths(value) {
  const text = JSON.stringify(value);
  if (LOCAL_PATH_PATTERN.test(text)) {
    throw new Error('project package contains an absolute local path');
  }
}

function normalizeEntry(entry = {}) {
  const data = asObject(entry);
  return {
    graph: normalizeId(data.graph ?? 'main', 'entry.graph'),
    layout: normalizeId(data.layout ?? 'main', 'entry.layout'),
    theme: normalizeId(data.theme ?? 'default', 'entry.theme'),
  };
}

function normalizeNamedRecord(record, normalizer) {
  return Object.fromEntries(
    Object.entries(asObject(record)).map(([id, value]) => [id, normalizer(value, id)])
  );
}

function normalizeLayout(layout, id) {
  const data = asObject(layout);
  return {
    ...data,
    id,
    version: String(data.version ?? 'runtime-ui-v1'),
  };
}

function normalizeTheme(theme, id) {
  const data = asObject(theme);
  const extendsTheme = String(data.extends ?? 'symbiote-default');
  const modifiers = asObject(data.modifiers);
  validateThemeModifiers(extendsTheme, modifiers, id);
  return {
    ...data,
    id,
    extends: extendsTheme,
    modifiers,
  };
}

function validateThemeModifiers(extendsTheme, modifiers, themeId) {
  const providerTheme = PROVIDER_THEME_ALIASES.get(extendsTheme);
  if (!providerTheme) return;

  const controls = getThemeControls(providerTheme);
  const controlNames = new Set(controls.map((control) => control.name));
  for (const name of Object.keys(modifiers)) {
    if (!controlNames.has(name)) {
      throw new Error(`theme "${themeId}" modifier "${name}" is not defined by ${extendsTheme}`);
    }
  }
}

function normalizePacks(packs) {
  if (!Array.isArray(packs)) return [];
  return packs.map((pack) => {
    const data = asObject(pack);
    return {
      ...data,
      id: normalizeId(data.id, 'pack.id'),
      kind: String(data.kind ?? 'provider'),
    };
  });
}

export function normalizeProjectPackage(rawProject = {}) {
  assertNoLocalPaths(rawProject);

  const data = asObject(rawProject);
  const version = String(data.version ?? 'project-package-v1');
  if (version !== 'project-package-v1') {
    throw new Error(`unsupported project package version "${version}"`);
  }

  const graphs = normalizeNamedRecord(data.graphs, (graph) => normalizeGraphModel(graph));
  const layouts = normalizeNamedRecord(data.layouts, normalizeLayout);
  const themes = normalizeNamedRecord(data.themes, normalizeTheme);
  const entry = normalizeEntry(data.entry);

  if (!graphs[entry.graph]) throw new Error(`entry graph "${entry.graph}" is not defined`);
  if (!layouts[entry.layout]) throw new Error(`entry layout "${entry.layout}" is not defined`);
  if (!themes[entry.theme]) throw new Error(`entry theme "${entry.theme}" is not defined`);

  return {
    version,
    id: normalizeId(data.id, 'project.id'),
    name: data.name == null ? normalizeId(data.id, 'project.id') : String(data.name),
    entry,
    packs: normalizePacks(data.packs),
    graphs,
    layouts,
    themes,
    dataSources: asObject(data.dataSources),
    agents: {
      rules: Array.isArray(data.agents?.rules) ? data.agents.rules.map(String) : [],
      allowedTransactions: Array.isArray(data.agents?.allowedTransactions)
        ? data.agents.allowedTransactions.map(String)
        : [],
    },
    graphsById: new Map(Object.entries(graphs)),
    layoutsById: new Map(Object.entries(layouts)),
    themesById: new Map(Object.entries(themes)),
  };
}
