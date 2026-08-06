import {
  CASCADE_THEME_DEFAULTS,
  CASCADE_THEME_PARAM_NAMES,
} from './cascade-theme-controls.js';

const CASCADE_PARAM_NAMES = CASCADE_THEME_PARAM_NAMES;
const CASCADE_PARAM_SET = new Set(CASCADE_PARAM_NAMES);

const RELATION_DEFINITIONS = {
  surfaceLadder: {
    name: 'surfaceLadder',
    family: 'color',
    description: 'Relative separation between root, panel, hover, overlay, and selected surfaces.',
    parameters: [
      { name: 'depth', type: 'number', min: -2, max: 2, default: 0 },
      { name: 'contrastBias', type: 'number', min: -2, max: 2, default: 0 },
    ],
    affects: ['brightness', 'contrast', 'pattern', '--sn-sys-surface-panel', '--sn-sys-state-hover-mix'],
  },
  stateLayers: {
    name: 'stateLayers',
    family: 'color',
    description: 'Relative emphasis for selected, hover, status, focus, and engine-state layers.',
    parameters: [
      { name: 'strength', type: 'number', min: -2, max: 2, default: 0 },
      { name: 'focus', type: 'number', min: -2, max: 2, default: 0 },
    ],
    affects: ['outline', 'chroma', '--sn-effect-focus-ring'],
  },
  radiusCurve: {
    name: 'radiusCurve',
    family: 'geometry',
    description: 'Relative corner curve for repeated controls, tables, source actions, and graph chrome.',
    parameters: [
      { name: 'scale', type: 'number', min: 0.5, max: 1.6, default: 1 },
      { name: 'compactness', type: 'number', min: -2, max: 2, default: 0 },
    ],
    affects: ['density', 'radius', '--sn-data-table-radius', '--sn-source-action-radius', '--sn-graph-explorer-button-radius'],
  },
  elevation: {
    name: 'elevation',
    family: 'depth',
    description: 'Relative shadow and overlay strength without replacing the surface cascade.',
    parameters: [
      { name: 'scale', type: 'number', min: 0, max: 1.8, default: 1 },
      { name: 'ambient', type: 'number', min: -2, max: 2, default: 0 },
    ],
    affects: ['brightness', '--sn-theme-elevation-scale'],
  },
  typographyCurve: {
    name: 'typographyCurve',
    family: 'typography',
    description: 'Relative body and heading balance for dense tools, editors, decks, and reading surfaces.',
    parameters: [
      { name: 'body', type: 'number', min: -2, max: 2, default: 0 },
      { name: 'heading', type: 'number', min: -2, max: 2, default: 0 },
    ],
    affects: ['type', 'heading'],
  },
  spacingCurve: {
    name: 'spacingCurve',
    family: 'geometry',
    description: 'Relative spacing and hit-target rhythm for panels, rows, tables, graph nodes, and chat surfaces.',
    parameters: [
      { name: 'density', type: 'number', min: -2, max: 2, default: 0 },
      { name: 'panelRhythm', type: 'number', min: -2, max: 2, default: 0 },
    ],
    affects: ['density', 'outline'],
  },
  motionCurve: {
    name: 'motionCurve',
    family: 'motion',
    description: 'Relative motion intensity for feedback, transitions, and status animation.',
    parameters: [
      { name: 'speed', type: 'number', min: -2, max: 2, default: 0 },
      { name: 'feedback', type: 'number', min: -2, max: 2, default: 0 },
    ],
    affects: ['motion', 'pattern'],
  },
  semanticHues: {
    name: 'semanticHues',
    family: 'color',
    description: 'Relative hue and chroma bias for status, syntax, graph types, and data accents.',
    parameters: [
      { name: 'hueShift', type: 'number', min: -60, max: 60, default: 0 },
      { name: 'semanticSpread', type: 'number', min: -2, max: 2, default: 0 },
    ],
    affects: ['hue', 'chroma', '--sn-hue-success', '--sn-hue-warning', '--sn-hue-danger', '--sn-hue-data'],
  },
  graphDataPalette: {
    name: 'graphDataPalette',
    family: 'data',
    description: 'Relative graph, chart, cluster, socket, and data-table color emphasis.',
    parameters: [
      { name: 'dataChroma', type: 'number', min: -2, max: 2, default: 0 },
      { name: 'clusterContrast', type: 'number', min: -2, max: 2, default: 0 },
    ],
    affects: ['chroma', 'contrast', 'outline', '--sn-graph-cluster-0', '--sn-graph-cluster-1'],
  },
  materialTexture: {
    name: 'materialTexture',
    family: 'surface',
    description: 'Relative animated cell dot visibility.',
    parameters: [
      { name: 'grain', type: 'number', min: -2, max: 2, default: 0 },
    ],
    affects: ['pattern', '--sn-cell-base-alpha', '--sn-cell-alpha-span'],
  },
};

export const THEME_RELATION_DEFINITIONS = deepFreeze(RELATION_DEFINITIONS);

const RECIPE_CATALOG = {
  'agent-console': {
    name: 'agent-console',
    version: 'theme-recipe-v1',
    base: 'default-provider',
    designRegisters: ['agent-workspace', 'tool'],
    description: 'Dense agent operations console with clear status layers and fast feedback.',
    params: { mode: 'dark', hue: 218, chroma: 72, brightness: 2, contrast: 64, density: 86, outline: 52, type: 92, heading: 94, motion: 70, pattern: 58 },
    relations: {
      surfaceLadder: { depth: 1, contrastBias: 1 },
      stateLayers: { strength: 1.2, focus: 1 },
      spacingCurve: { density: -1.2, panelRhythm: -0.5 },
      motionCurve: { speed: 1, feedback: 0.8 },
      semanticHues: { semanticSpread: 0.8 },
    },
    overrides: {
      '--sn-theme-elevation-scale': '1.05',
    },
  },
  'ops-dashboard': {
    name: 'ops-dashboard',
    version: 'theme-recipe-v1',
    base: 'default-provider',
    designRegisters: ['admin', 'tool'],
    description: 'Operational dashboard direction with strong scan layers, tables, metrics, and statuses.',
    params: { mode: 'dark', hue: 196, chroma: 56, brightness: 4, contrast: 66, density: 92, outline: 58, type: 94, heading: 96, motion: 65, pattern: 52 },
    relations: {
      surfaceLadder: { depth: 1.4, contrastBias: 1 },
      stateLayers: { strength: 1.4, focus: 0.8 },
      graphDataPalette: { dataChroma: 0.8, clusterContrast: 1.2 },
      spacingCurve: { density: -0.8, panelRhythm: -0.4 },
      motionCurve: { speed: 1.1, feedback: 0.7 },
    },
    overrides: {
      '--sn-data-table-radius': 'calc(6px * var(--sn-theme-density) * var(--sn-theme-radius-scale))',
      '--sn-theme-elevation-scale': '1.1',
    },
  },
  'editor-pro': {
    name: 'editor-pro',
    version: 'theme-recipe-v1',
    base: 'default-provider',
    designRegisters: ['editor', 'tool'],
    description: 'Low-chroma professional editor direction for source panes, diagnostics, and dense navigation.',
    params: { mode: 'dark', hue: 218, chroma: 18, brightness: 1, contrast: 62, density: 82, outline: 50, type: 90, heading: 90, motion: 55, pattern: 42 },
    relations: {
      surfaceLadder: { depth: 0.8, contrastBias: 0.7 },
      stateLayers: { strength: 0.8, focus: 0.9 },
      spacingCurve: { density: -1.6, panelRhythm: -1 },
      typographyCurve: { body: -0.8, heading: -1 },
      motionCurve: { speed: 1.5, feedback: -0.5 },
      semanticHues: { semanticSpread: -0.7 },
    },
    overrides: {
      '--sn-source-action-radius': 'calc(3px * var(--sn-theme-density) * var(--sn-theme-radius-scale))',
      '--sn-graph-explorer-button-radius': 'calc(3px * var(--sn-theme-density) * var(--sn-theme-radius-scale))',
      '--sn-theme-elevation-scale': '0.75',
    },
  },
  'data-lab': {
    name: 'data-lab',
    version: 'theme-recipe-v1',
    base: 'default-provider',
    designRegisters: ['tool', 'admin'],
    description: 'Analytical lab direction for graphs, charts, tables, clusters, and data-heavy panels.',
    params: { mode: 'dark', hue: 176, chroma: 64, brightness: 3, contrast: 64, density: 90, outline: 54, type: 94, heading: 98, motion: 75, pattern: 62 },
    relations: {
      surfaceLadder: { depth: 1.1, contrastBias: 0.8 },
      graphDataPalette: { dataChroma: 1.5, clusterContrast: 1.4 },
      semanticHues: { hueShift: -10, semanticSpread: 1 },
      stateLayers: { strength: 1 },
      materialTexture: { grain: 0.8 },
    },
    overrides: {
      '--sn-theme-elevation-scale': '1',
    },
  },
  'media-studio': {
    name: 'media-studio',
    version: 'theme-recipe-v1',
    base: 'default-provider',
    designRegisters: ['media-studio'],
    description: 'Creative production direction with richer accents, more spacious surfaces, and visible media states.',
    params: { mode: 'dark', hue: 284, chroma: 72, brightness: 6, contrast: 64, density: 106, outline: 42, type: 102, heading: 108, motion: 105, pattern: 70 },
    relations: {
      surfaceLadder: { depth: 1.2, contrastBias: 0.7 },
      stateLayers: { strength: 1.1, focus: 1 },
      materialTexture: { grain: 1.1 },
      radiusCurve: { scale: 1.25, compactness: 0.4 },
      motionCurve: { speed: -0.4, feedback: 1.2 },
      semanticHues: { semanticSpread: 0.8 },
    },
    overrides: {
      '--sn-theme-elevation-scale': '1.2',
      '--sn-data-table-radius': 'calc(10px * var(--sn-theme-density) * var(--sn-theme-radius-scale))',
    },
  },
  'presentation-clean': {
    name: 'presentation-clean',
    version: 'theme-recipe-v1',
    base: 'default-provider',
    designRegisters: ['presentation'],
    description: 'Clean presentation direction with restrained chrome, larger type, and calmer motion.',
    params: { mode: 'light', hue: 214, chroma: 46, brightness: 3, contrast: 60, density: 118, outline: 30, type: 112, heading: 122, motion: 90, pattern: 30 },
    relations: {
      surfaceLadder: { depth: -0.4, contrastBias: 0.2 },
      stateLayers: { strength: -0.4, focus: 0.7 },
      typographyCurve: { body: 1, heading: 1.7 },
      spacingCurve: { density: 1.1, panelRhythm: 1 },
      radiusCurve: { scale: 1.15, compactness: 0 },
      motionCurve: { speed: -0.3, feedback: -0.2 },
    },
    overrides: {
      '--sn-theme-elevation-scale': '0.8',
    },
  },
  'brand-demo': {
    name: 'brand-demo',
    version: 'theme-recipe-v1',
    base: 'default-provider',
    designRegisters: ['brand'],
    description: 'Brand demonstration direction that exposes stronger accent identity while staying token-relative.',
    params: { mode: 'dark', hue: 262, chroma: 78, brightness: 5, contrast: 66, density: 108, outline: 44, type: 104, heading: 116, motion: 100, pattern: 64 },
    relations: {
      semanticHues: { semanticSpread: 1.2 },
      stateLayers: { strength: 1.1, focus: 1 },
      surfaceLadder: { depth: 1, contrastBias: 0.8 },
      radiusCurve: { scale: 1.3, compactness: 0.2 },
      motionCurve: { speed: -0.2, feedback: 0.9 },
      materialTexture: { grain: 0.6 },
    },
    overrides: {
      '--sn-theme-elevation-scale': '1.15',
    },
  },
  'ebook-light': {
    name: 'ebook-light',
    version: 'theme-recipe-v1',
    base: 'default-provider',
    designRegisters: ['editor', 'presentation'],
    description: 'Warm light reading direction for long-form pages, documents, and reference panes.',
    params: { mode: 'light', hue: 35, chroma: 14, brightness: 2, contrast: 56, density: 116, outline: 26, type: 108, heading: 114, motion: 70, pattern: 24 },
    relations: {
      surfaceLadder: { depth: -0.8, contrastBias: -0.2 },
      stateLayers: { strength: -0.7, focus: 0.3 },
      typographyCurve: { body: 0.8, heading: 1 },
      spacingCurve: { density: 0.8, panelRhythm: 0.8 },
      semanticHues: { semanticSpread: -0.8 },
      materialTexture: { grain: -0.4 },
    },
    overrides: {
      '--sn-theme-elevation-scale': '0.45',
      '--sn-data-table-radius': 'calc(7px * var(--sn-theme-density) * var(--sn-theme-radius-scale))',
    },
  },
};

export const THEME_RECIPE_CATALOG = deepFreeze(RECIPE_CATALOG);
export const THEME_RECIPE_NAMES = Object.freeze(Object.keys(THEME_RECIPE_CATALOG));

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (let child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function copyData(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function finiteNumber(value, fallback = 0) {
  let number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hue(value) {
  return (((finiteNumber(value) % 360) + 360) % 360);
}

function addParam(params, name, delta) {
  params[name] = finiteNumber(params[name], CASCADE_THEME_DEFAULTS[name]) + delta;
}

function setOverride(overrides, name, value) {
  if (isBoundedThemeOverride(name, value)) {
    overrides[name] = String(value);
  }
}

function relationValue(modifier, name, fallback = 0) {
  if (!modifier || modifier === true) return fallback;
  if (typeof modifier === 'number') return modifier;
  return finiteNumber(modifier[name], fallback);
}

function relationScaleToken(px, scale) {
  return `calc(${px}px * ${Number(scale).toFixed(2)} * var(--sn-theme-density) * var(--sn-theme-radius-scale))`;
}

function rotateHue(base, offset) {
  return String(hue(finiteNumber(base) + finiteNumber(offset)).toFixed(0));
}

function applySemanticHueOverrides(params, overrides, modifier) {
  let spread = relationValue(modifier, 'semanticSpread');
  setOverride(overrides, '--sn-hue-success', rotateHue(params.hue, -96 - spread * 5));
  setOverride(overrides, '--sn-hue-warning', rotateHue(params.hue, 178 + spread * 5));
  setOverride(overrides, '--sn-hue-danger', rotateHue(params.hue, 146 + spread * 7));
  setOverride(overrides, '--sn-hue-data', rotateHue(params.hue, -30 - spread * 8));
}

function applyRelation(params, overrides, name, modifier) {
  if (modifier === false || !(name in THEME_RELATION_DEFINITIONS)) return;

  if (name === 'surfaceLadder') {
    let depth = relationValue(modifier, 'depth');
    let contrastBias = relationValue(modifier, 'contrastBias');
    addParam(params, 'brightness', depth * 2.4);
    addParam(params, 'contrast', depth * 1.8 + contrastBias * 2.4);
    addParam(params, 'pattern', depth * 2);
  } else if (name === 'stateLayers') {
    let strength = relationValue(modifier, 'strength');
    let focus = relationValue(modifier, 'focus');
    addParam(params, 'outline', strength * 7 + focus * 2);
    addParam(params, 'chroma', strength * 2.5);
    setOverride(overrides, '--sn-effect-focus-ring', `0 0 0 calc(${(1.5 + Math.max(0, focus) * 0.8).toFixed(1)}px) hsl(var(--sn-hue-accent) var(--sn-theme-chroma) 63% / 0.35)`);
  } else if (name === 'radiusCurve') {
    let scale = relationValue(modifier, 'scale', 1);
    let compactness = relationValue(modifier, 'compactness');
    addParam(params, 'density', compactness * 2);
    addParam(params, 'radius', (scale - 1) * 20 + compactness * 2);
    setOverride(overrides, '--sn-data-table-radius', relationScaleToken(8, scale));
    setOverride(overrides, '--sn-source-action-radius', relationScaleToken(4, scale));
    setOverride(overrides, '--sn-graph-explorer-button-radius', relationScaleToken(3, scale));
    setOverride(overrides, '--sn-chat-list-badge-radius', relationScaleToken(3, scale));
  } else if (name === 'elevation') {
    let scale = relationValue(modifier, 'scale', 1);
    let ambient = relationValue(modifier, 'ambient');
    addParam(params, 'brightness', ambient * 1.2);
    setOverride(overrides, '--sn-theme-elevation-scale', String(Math.max(0, Math.min(1.8, scale))));
  } else if (name === 'typographyCurve') {
    addParam(params, 'type', relationValue(modifier, 'body') * 5);
    addParam(params, 'heading', relationValue(modifier, 'heading') * 6);
  } else if (name === 'spacingCurve') {
    addParam(params, 'density', relationValue(modifier, 'density') * 6);
    addParam(params, 'outline', relationValue(modifier, 'panelRhythm') * 2);
  } else if (name === 'motionCurve') {
    addParam(params, 'motion', relationValue(modifier, 'speed') * -18 + relationValue(modifier, 'feedback') * 6);
    addParam(params, 'pattern', relationValue(modifier, 'feedback') * 3);
  } else if (name === 'semanticHues') {
    let hueShift = relationValue(modifier, 'hueShift');
    let spread = relationValue(modifier, 'semanticSpread');
    addParam(params, 'hue', hueShift);
    addParam(params, 'chroma', spread * 4);
    applySemanticHueOverrides(params, overrides, modifier);
  } else if (name === 'graphDataPalette') {
    addParam(params, 'chroma', relationValue(modifier, 'dataChroma') * 5);
    addParam(params, 'contrast', relationValue(modifier, 'clusterContrast') * 2);
    addParam(params, 'outline', relationValue(modifier, 'clusterContrast') * 3);
  } else if (name === 'materialTexture') {
    let grain = relationValue(modifier, 'grain');
    addParam(params, 'pattern', grain * 8);
    setOverride(overrides, '--sn-cell-base-alpha', (0.08 + Math.max(-2, Math.min(2, grain)) * 0.018).toFixed(3));
  }
}

function normalizeRecipeName(input) {
  if (typeof input === 'string') return input;
  return input?.recipe || input?.theme?.recipe || input?.themeRecipe || input?.name || null;
}

function extractParams(input = {}) {
  let params = {};
  for (let source of [input.theme?.params, input.params, input]) {
    if (!source || typeof source !== 'object') continue;
    for (let key of CASCADE_PARAM_NAMES) {
      if (source[key] !== undefined) params[key] = source[key];
    }
  }
  return params;
}

function normalizeRelations(...sources) {
  let relations = {};
  for (let source of sources) {
    if (!source) continue;
    if (Array.isArray(source)) {
      for (let item of source) {
        if (typeof item === 'string') {
          relations[item] = {};
        } else if (item?.name) {
          let { name, ...modifier } = item;
          relations[name] = modifier;
        }
      }
    } else if (typeof source === 'object') {
      for (let [name, modifier] of Object.entries(source)) {
        if (!(name in THEME_RELATION_DEFINITIONS)) continue;
        relations[name] = modifier === true ? {} : { ...(relations[name] || {}), ...(modifier || {}) };
      }
    }
  }
  return relations;
}

export function isBoundedThemeOverride(name, value) {
  if (!/^--sn-[a-z0-9-]+$/.test(String(name || ''))) return false;
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  let text = String(value);
  if (text.length > 180) return false;
  return !/[{}<>;]/.test(text) && !/@import|javascript:|expression\(|url\(/i.test(text);
}

export function normalizeThemeOverrides(...sources) {
  let overrides = {};
  for (let source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (let [name, value] of Object.entries(source)) {
      setOverride(overrides, name, value);
    }
  }
  return overrides;
}

export function getCascadeThemeRecipe(name) {
  return copyData(THEME_RECIPE_CATALOG[name]);
}

export function listCascadeThemeRecipes(filter = {}) {
  return THEME_RECIPE_NAMES
    .map((name) => getCascadeThemeRecipe(name))
    .filter((recipe) => {
      if (!filter.designRegister) return true;
      return recipe.designRegisters.includes(filter.designRegister);
    });
}

export function getCascadeThemeRelation(name) {
  return copyData(THEME_RELATION_DEFINITIONS[name]);
}

export function listCascadeThemeRelations() {
  return Object.keys(THEME_RELATION_DEFINITIONS).map((name) => getCascadeThemeRelation(name));
}

export function getCascadeThemeRecipeDescriptor() {
  return {
    version: 'theme-recipe-v1',
    cascadeOrder: ['default-provider', 'recipe.params', 'recipe.relations', 'user.params', 'bounded-overrides'],
    params: CASCADE_PARAM_NAMES.map((name) => ({ name, default: CASCADE_THEME_DEFAULTS[name] })),
    relationNames: Object.keys(THEME_RELATION_DEFINITIONS),
    recipeNames: [...THEME_RECIPE_NAMES],
    boundedOverrides: {
      tokenPattern: '^--sn-[a-z0-9-]+$',
      valueTypes: ['string', 'number'],
      maxValueLength: 180,
      blockedValuePatterns: ['{', '}', '<', '>', ';', '@import', 'url(', 'javascript:', 'expression('],
    },
  };
}

export function resolveCascadeThemeRecipe(input = {}) {
  let recipeName = normalizeRecipeName(input);
  let recipe = recipeName ? getCascadeThemeRecipe(recipeName) : null;
  let params = {
    ...CASCADE_THEME_DEFAULTS,
    ...(recipe?.params || {}),
  };
  let relationOverrides = {};
  let recipeRelations = normalizeRelations(recipe?.relations);
  let userRelations = normalizeRelations(input?.theme?.relations, input?.relations);

  for (let [name, modifier] of Object.entries(recipeRelations)) {
    applyRelation(params, relationOverrides, name, modifier);
  }
  for (let [name, modifier] of Object.entries(userRelations)) {
    applyRelation(params, relationOverrides, name, modifier);
  }

  Object.assign(params, extractParams(input));
  let relations = normalizeRelations(recipeRelations, userRelations);
  if (relations.semanticHues) {
    applySemanticHueOverrides(params, relationOverrides, relations.semanticHues);
  }

  let overrides = normalizeThemeOverrides(
    relationOverrides,
    recipe?.overrides,
    input?.theme?.overrides,
    input?.overrides
  );
  for (let name of Object.keys(params)) {
    if (!CASCADE_PARAM_SET.has(name)) delete params[name];
  }

  return {
    version: 'theme-recipe-v1',
    recipe: recipe?.name || null,
    base: recipe?.base || 'default-provider',
    params,
    relations,
    overrides,
    source: recipe ? 'recipe-catalog' : 'cascade-defaults',
  };
}
