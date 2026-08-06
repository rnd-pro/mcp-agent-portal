import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getAllSocketTypes,
  getNodeMenu,
  listDrivers,
  listPacks,
  loadHandlers,
  watchHandlers,
} from 'symbiote-engine';

import { HTML_IN_CANVAS_RENDERER } from './canvas/html-in-canvas.js';
import {
  getTheme,
  getThemeControls,
  getThemeRecipeModel,
  getThemeRecipe,
  getThemeTokens,
  getUiSchema,
  listGraphAnalysisOperations,
  listAgentComponentDescriptions,
  listComponents,
  listGraphSchemas,
  listProjectSchemas,
  listRules,
  listThemeElementGroups,
  listThemeRecipes,
  listThemeRelations,
  listThemeRuntimeDescriptors,
  listThemeRuleBlocks,
  listTokenFiles,
  hasComponent,
  RULESETS,
  THEME_NAMES,
  UI_SCHEMA_VERSIONS,
  getProviderConformanceAtlas,
  XR_SPATIAL_EVIDENCE_CONTRACT,
  listXRSpatialSchemas,
} from './manifest/index.js';
import { DEFAULT_LOCALE, LOCALE_CATALOG_KEYS, SUPPORTED_LOCALES } from './locale/index.js';
import { getGeometryScaleDescriptor, getStepScaleDescriptor, getTypeScaleDescriptor, getRadiusScaleDescriptor, getMotionScaleDescriptor } from './tokens/scale.js';
import { getSemanticTokenCatalog, tokensForFamily } from './tokens/semantic-catalog.js';
import { getComponentRecipesDescriptor } from './manifest/component-recipes.js';
import { lintComponentCss } from './tokens/geometry-lint.js';
import { checkContrast } from './tokens/contrast.js';
import { WEBXR_RENDERER, XR_THREE_WEBXR_ADAPTER } from './xr/index.js';
import {
  COLOR_PRESETS,
  SKIN_PRESETS,
  MOTION_PRESETS,
  PANEL_THEME_PRESETS,
} from './themes/ThemeFactory.js';

let __dirname = dirname(fileURLToPath(import.meta.url));
let PKG_PATH = resolve(__dirname, 'package.json');
let PKG = JSON.parse(readFileSync(PKG_PATH, 'utf-8'));

const EXPORT_ENTRYPOINTS = [
  {
    specifier: 'symbiote-ui',
    kind: 'node-safe',
    description: 'Node-safe provider graph/core API, themes, shapes, plugins, and pure UI utilities.',
  },
  {
    specifier: 'symbiote-ui/core',
    kind: 'node-safe',
    description: 'Core graph editor data model primitives.',
  },
  {
    specifier: 'symbiote-engine',
    kind: 'node-safe',
    description: 'Server-side graph runtime, registry, executor, and serialization helpers.',
  },
  {
    specifier: 'symbiote-ui/graph',
    kind: 'node-safe',
    description: 'Universal graph models, projections, and deterministic layout quality analysis.',
  },
  {
    specifier: 'symbiote-ui/locale',
    kind: 'node-safe',
    description: 'Node-safe localization catalogs and translation helpers for built-in UI strings.',
  },
  {
    specifier: 'symbiote-ui/contracts/resource-tree',
    kind: 'node-safe',
    description: 'Node-safe resource-tree builder re-exported from the engine contract without the broad contracts catalog.',
  },
  {
    specifier: 'symbiote-ui/canvas/graph-explorer.js',
    kind: 'node-safe',
    description: 'Pure graph-view helper constants and menu descriptors for graph explorer hosts.',
  },
  {
    specifier: 'symbiote-ui/layout/LayoutTree',
    kind: 'node-safe',
    description: 'Node-safe BSP layout tree model and layout behavior normalization helpers.',
  },
  {
    specifier: 'symbiote-ui/manifest',
    kind: 'node-safe',
    description: 'Agent-readable component, theme, token, rule, and schema catalogs.',
  },
  {
    specifier: 'symbiote-ui/layout',
    kind: 'ssr-entry-safe',
    description: 'Layout tree, section registry, and router helpers without browser components.',
  },
  {
    specifier: 'symbiote-ui/runtime',
    kind: 'ssr-entry-safe',
    description: 'Agent UI construction helpers for component creation, state updates, intent routing, layout insertion, and teardown.',
  },
  {
    specifier: 'symbiote-ui/runtime/product-context',
    kind: 'node-safe',
    description: 'Host-owned product context normalization for exposing product identity, views, entities, actions, component refs, and event logs to agents.',
  },
  {
    specifier: 'symbiote-ui/xr',
    kind: 'ssr-entry-safe',
    description: 'WebXR capability, spatial layout projection, and XR pointer helpers without renderer lock-in.',
  },
  {
    specifier: 'symbiote-ui/ui',
    kind: 'browser',
    description: 'Browser Web Components, layout modules, themes, router helpers, chat, navigation, and display modules.',
  },
  {
    specifier: 'symbiote-ui/ui/screencast-recorder.js',
    kind: 'browser',
    description: 'Screen Capture API hotkey controller for browser screencast recording with captured tab/display audio requested by default and no built-in UI chrome.',
  },
  {
    specifier: 'symbiote-ui/ui/tour-screencast.js',
    kind: 'browser',
    description: 'Presentation tour screencast wrapper that records the live browser surface while the host-owned tour player runs.',
  },
  {
    specifier: 'symbiote-ui/ui/tour-audio-provider.js',
    kind: 'browser',
    description: 'Web Audio provider for adding explicit tour timeline audio streams to rendered presentation videos.',
  },
  {
    specifier: 'symbiote-ui/ui/tour-media-renderer.js',
    kind: 'browser',
    description: 'Canvas Capture and MediaRecorder helper for rendering agent tour timelines to video, with explicit audio-provider diagnostics.',
  },
  {
    specifier: 'symbiote-ui/ui/locale.js',
    kind: 'browser',
    description: 'Browser localization helpers for navigator locale detection and browser localization configuration.',
  },
  {
    specifier: 'symbiote-ui/icons/material-symbols',
    kind: 'browser',
    description: 'Material Symbols host control for configuring and ensuring ligature font loading.',
  },
  {
    specifier: 'symbiote-ui/ui/host-adapters.js',
    kind: 'browser',
    description: 'Host-adapter helpers for wiring list-item and tree-panel host surfaces.',
  },
  {
    specifier: 'symbiote-ui/ui/media',
    kind: 'browser-component',
    description: 'Media provider registry with built-in image and YouTube adapters plus the self-registering sn-media-host element.',
  },
  {
    specifier: 'symbiote-ui/canvas/canvas-graph',
    kind: 'browser-component',
    description: 'Direct browser component entrypoint for the hierarchical canvas-graph overview renderer.',
  },
  {
    specifier: 'symbiote-ui/layout/panel-layout',
    kind: 'browser-component',
    description: 'Direct browser component entrypoint for the panel-based application layout shell.',
  },
  {
    specifier: 'symbiote-ui/control/segmented-control',
    kind: 'browser-component',
    description: 'Direct browser component entrypoint for the segmented radio-group control.',
  },
  {
    specifier: 'symbiote-ui/board',
    kind: 'browser-component',
    description: 'Direct browser component entrypoint for reusable kanban boards with host-owned columns, cards, actions, selection, and move intents.',
  },
  {
    specifier: 'symbiote-ui/display/code-block',
    kind: 'browser-component',
    description: 'Direct browser component entrypoint for code, markdown, image, and diagnostics display.',
  },
  {
    specifier: 'symbiote-ui/display/source-viewer',
    kind: 'browser-component',
    description: 'Direct browser component entrypoint for source, markdown, image, directory, metadata, and transform display.',
  },
  {
    specifier: 'symbiote-ui/display/source-editor',
    kind: 'browser-component',
    description: 'Direct browser component entrypoint for generic editable or readonly source text surfaces.',
  },
  {
    specifier: 'symbiote-ui/tree/TreeView',
    kind: 'browser-component',
    description: 'Direct browser component entrypoint for reusable resource tree rendering.',
  },
  {
    specifier: 'symbiote-ui/tree/TreePanel',
    kind: 'browser-component',
    description: 'Direct browser component entrypoint for tree panel chrome, filtering, placeholders, and expand/collapse state.',
  },
  {
    specifier: 'symbiote-ui/webmcp',
    kind: 'ssr-entry-safe',
    description: 'Explicit WebMCP descriptor helpers and native registration utilities that no-op without a model context.',
  },
  {
    specifier: 'symbiote-ui/custom-elements.json',
    kind: 'metadata',
    description: 'Custom Elements manifest for editor/docs/design-system tooling.',
  },
  {
    specifier: 'symbiote-ui/tokens/*',
    kind: 'metadata',
    description: 'Design token JSON files.',
  },
  {
    specifier: 'symbiote-ui/rules/*',
    kind: 'metadata',
    description: 'Machine-readable library and Symbiote rules.',
  },
  {
    specifier: 'symbiote-ui/schemas/*',
    kind: 'metadata',
    description: 'Graph, UI, runtime, theme, WebMCP, and XR spatial evidence schema JSON files.',
  },
];

function listPackageExportSubpaths() {
  return Object.keys(PKG.exports || {}).sort().map((subpath) => {
    let target = PKG.exports[subpath];
    let importTarget = typeof target === 'string' ? target : target?.import || target?.default || null;
    return {
      subpath,
      specifier: subpath === '.' ? PKG.name : `${PKG.name}/${subpath.replace(/^\.\//, '')}`,
      target: importTarget,
    };
  });
}

function inferDriverSuggestedComponents(driverRecord) {
  let driver = driverRecord?.driver || {};
  let category = String(driverRecord?.category || '').toLowerCase();
  let type = String(driverRecord?.type || '').toLowerCase();
  let portTypes = [
    ...(driver.inputs || []).map((input) => input.type),
    ...(driver.outputs || []).map((output) => output.type),
  ].map((value) => String(value || '').toLowerCase());
  let suggestions = new Set(['graph-node', 'sn-card', 'sn-status-badge']);

  if (category.includes('compound') || type.includes('compound')) {
    suggestions.add('node-canvas');
    suggestions.add('graph-explorer-shell');
  }
  if (category.includes('chat') || type.includes('chat')) {
    suggestions.add('chat-composer');
    suggestions.add('chat-transcript');
  }
  if (category.includes('data') || portTypes.some((value) => ['json', 'object', 'array', 'table'].includes(value))) {
    suggestions.add('sn-data-table');
    suggestions.add('sn-event-feed');
  }
  if (category.includes('tree') || portTypes.includes('tree')) {
    suggestions.add('sn-tree-panel');
  }
  if (Object.keys(driver.params || {}).length) {
    suggestions.add('sn-field');
  }

  return [...suggestions].filter((tagName) => hasComponent(tagName));
}

function normalizeDriverAgent(driverRecord) {
  let agent = driverRecord?.driver?.agent || {};
  let explicitSuggestions = Array.isArray(agent.suggestedComponents)
    ? agent.suggestedComponents.filter(Boolean)
    : [];
  if (explicitSuggestions.length) return agent;
  let suggestedComponents = inferDriverSuggestedComponents(driverRecord);
  return {
    ...agent,
    suggestedComponents,
    suggestedComponentsSource: 'symbiote-ui-defaults',
  };
}

async function loadRuntimePacks(packs) {
  let packList = Array.isArray(packs) ? packs : String(packs).split(',');
  for (let pack of packList) {
    let packName = pack.trim();
    if (packName) {
      await import(`symbiote-engine/packs/${packName}-pack.js`);
    }
  }
}

/**
 * Discover provider catalogs, rules, themes, schemas, and runtime menu data.
 * @param {Object} [options]
 * @returns {Promise<object>}
 */
export async function cmdDiscover(options = {}) {
  if (options.pack) {
    await loadRuntimePacks(options.pack);
  }

  if (options.handlers) {
    let dir = resolve(/** @type {string} */ (options.handlers));
    await loadHandlers(dir);
  }

  let drivers = listDrivers();
  let menu = getNodeMenu();
  let socketTypes = getAllSocketTypes();
  let packs = listPacks();

  return {
    command: 'discover',
    package: {
      name: PKG.name,
      version: PKG.version,
      description: PKG.description,
    },
    exports: {
      subpaths: listPackageExportSubpaths(),
      entrypoints: EXPORT_ENTRYPOINTS,
    },
    registry: {
      totalDrivers: drivers.length,
      drivers: drivers.map((d) => ({
        type: d.type,
        category: d.category,
        icon: d.icon,
        inputs: (d.driver.inputs || []).map((inp) => ({ name: inp.name, type: inp.type, label: inp.label })),
        outputs: (d.driver.outputs || []).map((out) => ({ name: out.name, type: out.type, label: out.label })),
        description: d.driver.description,
        params: Object.entries(d.driver.params || {}).map(([name, p]) => ({ name, type: p.type, required: p.required, default: p.default })),
        agent: normalizeDriverAgent(d),
      })),
      menu: menu.map((group) => ({
        category: group.category,
        nodes: group.nodes,
      })),
      packs,
    },
    socketTypes: [...socketTypes.entries()].map(([name, s]) => ({
      name,
      label: s.label || name,
      color: s.color || null,
      description: s.description || null,
    })),
    manifest: {
      localization: {
        defaultLocale: DEFAULT_LOCALE,
        supportedLocales: [...SUPPORTED_LOCALES],
        autoDetection: 'browser-navigator-languages',
        catalogKeys: [...LOCALE_CATALOG_KEYS],
      },
      renderers: [
        HTML_IN_CANVAS_RENDERER,
        WEBXR_RENDERER,
        XR_THREE_WEBXR_ADAPTER,
      ],
      components: listComponents().map((c) => ({
        tagName: c.tagName,
        className: c.className,
        module: c.module,
        specifier: c.specifier,
        exportName: c.exportName,
        importKind: c.importKind,
        category: c.category,
        description: c.description,
        componentDescription: c.componentDescription,
        agent: c.agent,
        contract: c.contract || null,
      })),
      componentAgentCatalog: listAgentComponentDescriptions(),
      themes: THEME_NAMES.map((name) => ({
        name,
        ...getTheme(name),
        tokens: getThemeTokens(name),
      })),
      themePresets: {
        colors: Object.keys(COLOR_PRESETS),
        skins: Object.keys(SKIN_PRESETS),
        motions: Object.keys(MOTION_PRESETS),
        panels: PANEL_THEME_PRESETS,
      },
      themeRuntimeDescriptors: listThemeRuntimeDescriptors(),
      themeRecipeModel: getThemeRecipeModel(),
      themeRelations: listThemeRelations(),
      themeRuleBlocks: listThemeRuleBlocks(),
      themeControls: {
        ...Object.fromEntries(THEME_NAMES.map((name) => [name, getThemeControls(name)])),
        ...Object.fromEntries(listThemeRuntimeDescriptors().map((descriptor) => [descriptor.name, descriptor.controls])),
      },
      themeElementGroups: listThemeElementGroups(),
      themeRecipes: [
        ...THEME_NAMES.map((name) => getThemeRecipe(name)).filter(Boolean),
        ...listThemeRecipes(),
      ],
      tokenFiles: listTokenFiles(),
      geometryScale: getGeometryScaleDescriptor(),
      stepScale: getStepScaleDescriptor(),
      typeScale: getTypeScaleDescriptor(),
      radiusScale: getRadiusScaleDescriptor(),
      motionScale: getMotionScaleDescriptor(),
      semanticTokenCatalog: getSemanticTokenCatalog(),
      componentRecipes: getComponentRecipesDescriptor(),
      graphAnalysis: listGraphAnalysisOperations(),
      xrSpatialEvidence: XR_SPATIAL_EVIDENCE_CONTRACT,
      rulesets: RULESETS.map((rs) => ({
        name: rs.name,
        version: rs.version,
        path: rs.path,
        description: rs.description,
        rules: listRules({ ruleset: rs.name }),
      })),
      rules: listRules(),
      schemas: [
        ...listGraphSchemas(),
        ...listProjectSchemas(),
        ...listXRSpatialSchemas(),
        ...UI_SCHEMA_VERSIONS.map((sv) => ({
          version: sv.version,
          path: sv.path,
          description: sv.description,
          ...getUiSchema(sv.version),
        })),
      ],
      conformanceAtlas: getProviderConformanceAtlas({ includeCases: false }),
    },
  };
}

/**
 * Best-effort guess of a component's semantic family from its host selector
 * (`sn-<family> { … }`) or its file basename, returning it only when that
 * family actually owns catalog tokens (so a wrong guess produces no hint).
 * @param {string} css
 * @param {string} file
 * @returns {string}
 */
function inferComponentFamily(css, file) {
  for (let match of String(css).matchAll(/(?:^|[\s,{}])(sn-[a-z][a-z0-9-]*)/g)) {
    let family = match[1].replace(/^sn-/, '');
    if (tokensForFamily(family).length) return family;
  }
  let base = String(file).split(/[\\/]/).pop().replace(/\.(css\.js|tpl\.js|js)$/i, '');
  let kebab = base.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[_\s]+/g, '-').toLowerCase();
  return tokensForFamily(kebab).length ? kebab : '';
}

/**
 * Validate a component CSS source against the geometry scale and cascade
 * contract. Thin agent-facing wrapper over the shared consumption linter.
 * @param {Object} input
 * @param {string} input.css component `.css.js` source (or a CSS snippet)
 * @param {string} [input.file]
 * @param {string} [input.profile] register profile for snap suggestions
 * @param {Array<[string,string,Object=]>} [input.contrastPairs] resolved fg/bg pairs to WCAG-check
 * @returns {{command:string,file:string,valid:boolean,findings:Array<Object>,contrast:Array<Object>,summary:Object}}
 */
export function validateComponent({ css = '', file = '<component>', profile, contrastPairs = [], family = '' } = {}) {
  let { findings } = lintComponentCss({ content: css, file, profile });
  let contrast = contrastPairs.map(([fg, bg, opts]) => ({ fg, bg, ...checkContrast(fg, bg, opts || {}) }));
  let failingContrast = contrast.filter((entry) => entry.resolved && !entry.passesAA);
  let errors = findings.filter((finding) => finding.severity === 'error');
  let warnings = findings.filter((finding) => finding.severity === 'warning');
  let info = findings.filter((finding) => finding.severity === 'info');

  let result = {
    command: 'validate-component',
    file,
    valid: errors.length === 0 && failingContrast.length === 0,
    findings,
    contrast,
    summary: {
      errors: errors.length,
      warnings: warnings.length,
      info: info.length,
      contrastChecked: contrast.length,
      contrastFailures: failingContrast.length,
    },
  };

  // Organic-fit hint: when the component belongs to a known semantic family,
  // surface that family's tokens so it reuses them instead of re-deriving.
  // Family is taken explicitly, or inferred from the host selector / filename.
  let resolvedFamily = family || inferComponentFamily(css, file);
  let familyTokens = resolvedFamily ? tokensForFamily(resolvedFamily) : [];
  if (family || familyTokens.length) {
    result.family = resolvedFamily;
    result.familyInferred = !family && Boolean(resolvedFamily);
    result.familyTokens = familyTokens;
    result.fit = familyTokens.length
      ? `This is the '${resolvedFamily}' family — consume its ${familyTokens.length} semantic tokens (e.g. ${familyTokens.slice(0, 3).map((t) => t.token).join(', ')}) instead of re-deriving the surface from primitives.`
      : `No semantic family '${resolvedFamily}' exists — treat this as a new surface and compose from the scale rungs.`;
  }

  return result;
}

/**
 * Map every hardcoded geometry/motion literal in a component to its nearest
 * scale token. The `{ literal → --sn-* }` view agents use to auto-fix.
 * @param {Object} input
 * @param {string} input.css
 * @param {string} [input.profile]
 * @returns {Array<{line:number,property:string,literal:string,suggestion:?string,message:string}>}
 */
export function validateTokenUsage({ css = '', profile } = {}) {
  let { findings } = lintComponentCss({ content: css, profile });
  return findings
    .filter((finding) => finding.type === 'geometry-lint' || finding.type === 'motion-lint')
    .map((finding) => ({
      line: finding.line,
      property: finding.property,
      suggestion: finding.suggestion,
      message: finding.message,
    }));
}

/**
 * Watch a directory of handlers for changes and notify on rediscovery.
 * @param {Object} options
 * @param {string} [options.handlers] - Directory of handlers to watch
 * @param {function} callback - Callback function(newManifest, changedInfo)
 * @returns {{ close: function }} Watcher handle
 */
export function watchDiscover(options = {}, callback) {
  if (!options.handlers) {
    return { close: () => {} };
  }

  let dir = resolve(/** @type {string} */ (options.handlers));

  let watcher = watchHandlers(dir, {
    onRegister: async (type, filePath) => {
      try {
        let manifest = await cmdDiscover(options);
        callback(manifest, { type: 'register', nodeType: type, filePath });
      } catch (err) {
        console.error('[watchDiscover] failed to update on register:', err);
      }
    },
    onError: (filePath, err) => {
      console.error(`[watchDiscover] error for ${filePath}:`, err);
    },
  });

  return watcher;
}
