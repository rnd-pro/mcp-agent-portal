import { DEFAULT_PROVIDER_THEME } from '../themes/default-provider.js';
import {
  createCascadeTheme,
  getCascadeThemeControls,
} from '../themes/cascade-theme.js';
import {
  getCascadeThemeRecipeDescriptor,
  listCascadeThemeRecipes,
  listCascadeThemeRelations,
} from '../themes/theme-recipes.js';

export let THEME_NAMES = [
  'default-provider',
];

export let THEME_METADATA = {
  'default-provider': {
    role: 'neutral-default',
    aliases: ['symbiote-default', 'default-provider', 'DEFAULT_PROVIDER_THEME'],
    defaultExport: 'DEFAULT_PROVIDER_THEME',
    description: 'Cascadeable neutral provider default for symbiote-ui reusable components.',
    origin: 'Provider-neutral Symbiote UI tokens generalized for agent-built interfaces.',
    cascade: 'Apply once at :root, an app shell, or a subtree boundary; components inherit --sn-* tokens through the CSS cascade.',
    colorModel: ['native-css-hsl', 'alpha-hsl', 'color-mix'],
    engineStates: ['idle', 'running', 'success', 'error'],
    controlTokens: [
      '--sn-theme-hue',
      '--sn-theme-chroma',
      '--sn-theme-bg-lightness',
      '--sn-theme-surface-lightness',
      '--sn-theme-text-lightness',
      '--sn-theme-density',
      '--sn-theme-radius-scale',
      '--sn-theme-cell-radius-scale',
      '--sn-theme-composer-radius-scale',
      '--sn-scroll-shadow-size',
      '--sn-theme-pattern-brightness',
      '--sn-theme-motion-scale',
      '--sn-motion-enabled',
      '--sn-animation-play-state',
      '--sn-animation-duration-scale',
      '--sn-animation-duration-fast',
      '--sn-animation-duration-normal',
      '--sn-animation-duration-slow',
      '--sn-animation-duration-slower',
      '--sn-transition-easing',
      '--sn-theme-elevation-scale',
    ],
    tokenFamilies: ['source-control', 'source-accent', 'color-cascade', 'geometry-cascade', 'semantic-alias', 'component-alias', 'motion-effects'],
  },
};

export let TOKEN_FILES = [
  { name: 'base', path: 'tokens/base.json', kind: 'base' },
  ...THEME_NAMES.map((name) => ({
    name,
    ...(THEME_METADATA[name] || {}),
    path: `tokens/themes/${name}.json`,
    kind: 'theme',
    extends: 'tokens/base.json',
  })),
];

export let THEME_RUNTIME_DESCRIPTORS = [
  createCascadeTheme().descriptor,
];

export let THEME_RECIPE_MODEL = getCascadeThemeRecipeDescriptor();

export let THEME_RELATIONS = listCascadeThemeRelations();

export let THEME_RECIPES = listCascadeThemeRecipes();

const RUNTIME_THEMES = {
  'default-provider': DEFAULT_PROVIDER_THEME,
};

const CSS_TOKEN_CLASSIFIERS = [
  { kind: 'source-control', group: 'control', pattern: /^--sn-theme-/ },
  { kind: 'source-accent', group: 'color', pattern: /^--sn-hue-/ },
  { kind: 'color-cascade', group: 'color', pattern: /^--sn-(sat($|-)|lit-|alpha-)/ },
  { kind: 'color-cascade', group: 'accent', pattern: /^--sn-accent-/ },
  { kind: 'semantic-alias', group: 'surface', pattern: /^--sn-(bg|panel-bg|surface|border|node-bg|node-border|node-selected|node-accent|node-hover|node-header-bg|node-radius|node-shadow|node-min-width|node-max-width|node-border-width|node-font-size|node-items-|node-callout-|node-active-border|node-error-frame-|text|text-dim|bg-overlay|overlay-z-base|shadow-color)/ },
  { kind: 'semantic-alias', group: 'status', pattern: /^--sn-(success|warning|danger|status|engine|cat|type|subgraph|accent-warn|message-event)-/ },
  { kind: 'semantic-alias', group: 'provider-accent', pattern: /^--sn-provider-/ },
  { kind: 'component-alias', group: 'layout', pattern: /^--sn-(layout|portal-bridge|panel-menu)-/ },
  { kind: 'component-alias', group: 'xr', pattern: /^--sn-xr-/ },
  { kind: 'component-alias', group: 'surface', pattern: /^--sn-(card|dialog|output-preview)-/ },
  { kind: 'component-alias', group: 'data-table', pattern: /^--sn-data-table-/ },
  { kind: 'component-alias', group: 'control', pattern: /^--sn-(button|field)-/ },
  { kind: 'component-alias', group: 'status', pattern: /^--sn-(badge|banner|empty-state)-/ },
  { kind: 'component-alias', group: 'metric', pattern: /^--sn-metric-/ },
  { kind: 'component-alias', group: 'navigation-row', pattern: /^--sn-(tree|list-item|list-detail)-/ },
  { kind: 'component-alias', group: 'navigation-shell', pattern: /^--sn-sidebar-/ },
  { kind: 'component-alias', group: 'chat', pattern: /^--sn-(composer|chat)-/ },
  { kind: 'component-alias', group: 'tabs', pattern: /^--sn-tabs-/ },
  { kind: 'component-alias', group: 'source', pattern: /^--sn-(source|editor)-/ },
  { kind: 'component-alias', group: 'syntax', pattern: /^--sn-syntax-/ },
  { kind: 'component-alias', group: 'diagnostic', pattern: /^--sn-diagnostic-/ },
  { kind: 'component-alias', group: 'loading', pattern: /^--sn-loading-/ },
  { kind: 'component-alias', group: 'graph', pattern: /^--sn-(socket|conn|grid|shape|dot|graph-explorer|type|graph-type|graph-cluster|minimap)-/ },
  { kind: 'component-alias', group: 'context-menu', pattern: /^--sn-ctx-/ },
  { kind: 'component-alias', group: 'toolbar', pattern: /^--sn-toolbar-/ },
  { kind: 'component-alias', group: 'comment', pattern: /^--sn-comment-/ },
  { kind: 'component-alias', group: 'frame', pattern: /^--sn-frame-/ },
  { kind: 'typography-cascade', group: 'typography', pattern: /^--sn-(font|icon-font)/ },
  { kind: 'motion-effects', group: 'effect', pattern: /^--sn-(effect|shadow|cell|motion|animation|transition)-/ },
  { kind: 'motion-effects', group: 'scrollbar', pattern: /^--sn-scrollbar-/ },
  { kind: 'motion-effects', group: 'scroll-shadow', pattern: /^--sn-scroll-shadow-/ },
  { kind: 'host-bridge-alias', group: 'host-bridge', pattern: /^--(bg-level-2|border-color|text-color|text-color-muted)$/ },
];

function copyData(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function classifyCssToken(cssVar) {
  let classifier = CSS_TOKEN_CLASSIFIERS.find((item) => item.pattern.test(cssVar));
  if (!classifier) {
    return { kind: 'unclassified', group: 'unknown' };
  }
  return { kind: classifier.kind, group: classifier.group };
}

export let THEME_CONTROLS = {
  'default-provider': [
    { name: 'hue', type: 'number', default: '218', cssVar: '--sn-theme-hue', description: 'Primary accent hue in native CSS HSL space.' },
    { name: 'chroma', type: 'percentage', default: '89%', cssVar: '--sn-theme-chroma', description: 'Primary accent saturation/chroma used by selected, focus, and loading states.' },
    { name: 'backgroundLightness', type: 'percentage', default: '10%', cssVar: '--sn-theme-bg-lightness', description: 'Root surface lightness; can move the preset between darker and lighter modes.' },
    { name: 'surfaceLightness', type: 'percentage', default: '15.1%', cssVar: '--sn-theme-surface-lightness', description: 'Panel and control surface lightness derived near the background.' },
    { name: 'textLightness', type: 'percentage', default: '98.0%', cssVar: '--sn-theme-text-lightness', description: 'Foreground text lightness inherited by text aliases.' },
    { name: 'density', type: 'number', default: '1', cssVar: '--sn-theme-density', description: 'Density multiplier for repeated navigation row height.' },
    { name: 'radius', type: 'number', default: '1', cssVar: '--sn-theme-radius-scale', description: 'Radius multiplier for node, row, list, and source action corners.' },
    { name: 'cellRadius', type: 'number', default: '1', cssVar: '--sn-theme-cell-radius-scale', description: 'Cellular background dot-radius multiplier, independent from UI corner radius.' },
    { name: 'composerRadius', type: 'number', default: '1', cssVar: '--sn-theme-composer-radius-scale', description: 'Chat composer corner-radius multiplier, independent from UI corner radius.' },
    { name: 'pattern', type: 'number', default: '1.00', cssVar: '--sn-theme-pattern-brightness', description: 'Animated cell dot intensity; gradients, glare, and noise stay independent.' },
    { name: 'motion', type: 'number', default: '1', cssVar: '--sn-theme-motion-scale', description: 'Global motion multiplier for transitions and feedback effects.' },
    { name: 'elevation', type: 'number', default: '1', cssVar: '--sn-theme-elevation-scale', description: 'Global shadow and overlay intensity multiplier.' },
  ],
  'cascade-theme': getCascadeThemeControls(),
};

export let THEME_ELEMENT_GROUPS = [
  {
    name: 'panel',
    description: 'Framed layout surfaces such as sidebars, graph panels, source panes, and dialogs.',
    tokens: ['--sn-sys-surface-panel', '--sn-sys-surface-raised', '--sn-border', '--sn-card-bg', '--sn-card-border', '--sn-card-radius', '--sn-card-padding', '--sn-dialog-bg', '--sn-dialog-border', '--sn-dialog-radius', '--sn-dialog-shadow', '--sn-dialog-backdrop', '--sn-sys-outline', '--sn-node-shadow', '--sn-node-radius', '--sn-overlay-z-base', '--sn-canvas-overlay-z-base'],
    usedBy: ['panel-layout', 'sn-card', 'source-viewer', 'source-editor', 'chat-transcript', 'sn-loading-overlay'],
  },
  {
    name: 'control',
    description: 'Interactive controls including buttons, icon buttons, toolbar actions, labels, inputs, selects, and textareas.',
    tokens: ['--sn-button-bg', '--sn-button-border', '--sn-button-color', '--sn-button-hover-border', '--sn-button-primary-bg', '--sn-button-danger-color', '--sn-field-control-bg', '--sn-field-control-border', '--sn-field-control-subtle-border', '--sn-field-label-color', '--sn-field-control-focus-border', '--sn-field-select-indicator', '--sn-field-toggle-bg', '--sn-field-toggle-thumb-bg', '--sn-field-toggle-thumb-active-bg', '--sn-toolbar-bg', '--sn-toolbar-border', '--sn-toolbar-color', '--sn-toolbar-hover', '--sn-toolbar-occlusion-bg', '--sn-toolbar-z', '--sn-toolbar-title-color', '--sn-toolbar-title-min-width', '--sn-toolbar-title-max-width', '--sn-toolbar-title-lines', '--sn-effect-hover-transition', '--sn-effect-focus-ring'],
    usedBy: ['sn-button', 'sn-field', 'project-tabs', 'source-viewer', 'chat-composer'],
  },
  {
    name: 'row',
    description: 'Reusable list/tree/navigation rows with hover, active, selected, and focus states.',
    tokens: ['--sn-tree-row-height', '--sn-tree-panel-row-min-height', '--sn-tree-row-hover-bg', '--sn-tree-row-selected-bg', '--sn-list-item-hover-bg', '--sn-list-item-active-bg', '--sn-list-detail-bg', '--sn-list-detail-border'],
    usedBy: ['sn-tree-view', 'sn-tree-panel', 'sn-list-item', 'sn-list-detail-shell', 'chat-list-item', 'chat-sidebar-item'],
  },
  {
    name: 'input',
    description: 'Text entry, code entry, composer, and textarea surfaces.',
    tokens: ['--sn-composer-bg', '--sn-source-editor-bg', '--sn-editor-border', '--sn-editor-font', '--sn-effect-focus-ring'],
    usedBy: ['chat-composer', 'source-editor'],
  },
  {
    name: 'code-surface',
    description: 'Read-only and editable source/code surfaces.',
    tokens: ['--sn-source-bg', '--sn-source-header-bg', '--sn-source-border', '--sn-source-toolbar-gap', '--sn-source-stats-max-inline-size', '--sn-source-toggle-label-max-inline-size', '--sn-source-editor-bg', '--sn-source-editor-color', '--sn-syntax-keyword', '--sn-syntax-string', '--sn-syntax-comment', '--sn-diagnostic-error-bg', '--sn-diagnostic-warning-bg'],
    usedBy: ['source-viewer', 'source-editor'],
  },
  {
    name: 'status',
    description: 'Badges, loading, success, warning, danger, and transient status feedback.',
    tokens: ['--sn-sys-success', '--sn-success-bg', '--sn-success-bg-hover', '--sn-success-border-hover', '--sn-sys-warning', '--sn-sys-danger', '--sn-danger-bg', '--sn-status-info', '--sn-status-success', '--sn-status-warning', '--sn-status-error', '--sn-status-neutral', '--sn-status-info-bg', '--sn-status-success-bg', '--sn-status-warning-bg', '--sn-status-error-bg', '--sn-status-neutral-bg', '--sn-engine-idle-color', '--sn-engine-running-color', '--sn-engine-success-color', '--sn-engine-error-color', '--sn-engine-state-color', '--sn-engine-state-bg', '--sn-engine-state-border', '--sn-subgraph-bg', '--sn-subgraph-bg-hover', '--sn-subgraph-border', '--sn-subgraph-border-hover', '--sn-badge-bg', '--sn-badge-border', '--sn-badge-color', '--sn-badge-success-bg', '--sn-badge-warning-bg', '--sn-badge-error-bg', '--sn-badge-neutral-bg', '--sn-banner-bg', '--sn-banner-border', '--sn-banner-color', '--sn-banner-success-bg', '--sn-banner-warning-bg', '--sn-banner-error-bg', '--sn-empty-state-color', '--sn-loading-bar-bg', '--sn-effect-loading-pulse'],
    usedBy: ['sn-loading-overlay', 'chat-transcript', 'chat-composer', 'inspector-panel'],
  },
  {
    name: 'engine-state',
    description: 'Runtime engine states that cascade into node, status, loading, and host-selected surfaces.',
    tokens: ['--sn-engine-idle-color', '--sn-engine-running-color', '--sn-engine-success-color', '--sn-engine-error-color', '--sn-engine-state-color', '--sn-engine-state-bg', '--sn-engine-state-border', '--sn-animation-play-state', '--sn-animation-duration-scale', '--sn-animation-duration-fast', '--sn-animation-duration-normal', '--sn-animation-duration-slow', '--sn-animation-duration-slower'],
    states: ['idle', 'running', 'success', 'error'],
    usedBy: ['node-canvas', 'graph-node', 'sn-loading-overlay', 'sn-status-ribbon', 'host runtime shells'],
  },
  {
    name: 'metric',
    description: 'Reusable label/value summaries for stats, settings metadata, and health cards.',
    tokens: ['--sn-metric-gap', '--sn-metric-padding', '--sn-metric-border', '--sn-metric-color', '--sn-metric-label-color', '--sn-metric-label-size', '--sn-metric-value-color', '--sn-metric-value-size', '--sn-metric-value-weight', '--sn-metric-value-font', '--sn-metric-success-color', '--sn-metric-warning-color', '--sn-metric-error-color'],
    usedBy: ['sn-metric'],
  },
  {
    name: 'data-table',
    description: 'Reusable tabular data surfaces with headers, row dividers, empty states, and inline markers.',
    tokens: ['--sn-data-table-bg', '--sn-data-table-border', '--sn-data-table-radius', '--sn-data-table-color', '--sn-data-table-header-bg', '--sn-data-table-header-color', '--sn-data-table-header-border', '--sn-data-table-row-border', '--sn-data-table-cell-padding', '--sn-data-table-cell-size', '--sn-data-table-empty-color'],
    usedBy: ['sn-data-table'],
  },
  {
    name: 'graph',
    description: 'Graph nodes, edges, clusters, pins, sockets, and graph canvas feedback.',
    tokens: ['--sn-sys-surface-raised', '--sn-sys-outline', '--sn-sys-accent', '--sn-conn-color', '--sn-type-data', '--sn-type-action', '--sn-type-project', '--sn-type-profile', '--sn-type-pulse', '--sn-type-skill', '--sn-graph-type-data', '--sn-graph-type-action', '--sn-graph-type-project', '--sn-graph-type-profile-photo', '--sn-graph-type-pulse', '--sn-graph-type-skill', '--sn-canvas-graph-panel-bg', '--sn-canvas-graph-panel-border', '--sn-canvas-graph-ghost', '--sn-graph-cluster-0', '--sn-graph-cluster-1', '--sn-minimap-bg', '--sn-minimap-node', '--sn-minimap-viewport', '--sn-cat-server', '--sn-cat-control', '--sn-cat-data', '--sn-subgraph-accent'],
    usedBy: ['node-canvas', 'canvas-graph', 'graph-explorer-shell', 'node-minimap'],
  },
  {
    name: 'xr',
    description: 'Spatial panel material aliases derived from the default provider theme.',
    tokens: ['--sn-xr-panel-bg', '--sn-xr-panel-border', '--sn-xr-panel-radius', '--sn-xr-panel-shadow', '--sn-xr-pointer-color'],
    usedBy: ['panel-layout'],
  },
  {
    name: 'tab',
    description: 'Project and document tabs with active, hover, divider, and close affordances.',
    tokens: ['--sn-tabs-bg', '--sn-tabs-border', '--sn-tabs-active-bg', '--sn-tabs-active-color', '--sn-tabs-active-border', '--sn-tabs-hover-bg', '--sn-tabs-accent', '--sn-tabs-corner-radius', '--sn-tabs-radius'],
    usedBy: ['project-tabs'],
  },
];

export let THEME_RULE_BLOCKS = [
  {
    name: 'default-provider-source-accents',
    theme: 'default-provider',
    kind: 'source-accent',
    description: 'Minimal human or agent-selected inputs for the default provider theme.',
    parameters: [
      { name: 'hue', type: 'number', default: '218', description: 'Native CSS HSL hue for primary accent and derived state colors.' },
      { name: 'chroma', type: 'percentage', default: '89%', description: 'Native CSS HSL saturation/chroma for accent-derived colors.' },
      { name: 'backgroundLightness', type: 'percentage', default: '10%', description: 'Root surface lightness, adjustable from darker to lighter modes.' },
      { name: 'surfaceLightness', type: 'percentage', default: '15.1%', description: 'Panel and control surface lightness near the root background.' },
      { name: 'textLightness', type: 'percentage', default: '98.0%', description: 'Primary foreground lightness for contrast tuning.' },
      { name: 'density', type: 'number', default: '1', description: 'User density modifier for repeated operational surfaces.' },
    ],
    inputs: ['hue', 'chroma', 'backgroundLightness', 'surfaceLightness', 'textLightness', 'density'],
    outputs: ['color.accent', 'color.success', 'color.warning', 'color.danger', 'color.background'],
    formula: 'Source accents define the stable roots used by color, semantic, and component aliases.',
    derivations: [
      { output: 'color.background', inputs: ['backgroundLightness'], expression: 'hsl(0 0% backgroundLightness)', description: 'The page and root app background derive from the neutral lightness control.' },
      { output: 'color.surface', inputs: ['surfaceLightness'], expression: 'hsl(0 0% surfaceLightness)', description: 'Panel surfaces derive from the surface lightness control.' },
      { output: 'color.accent', inputs: ['hue', 'chroma'], expression: 'hsl(hue chroma 63%)', description: 'The primary accent is native CSS HSL so agents can shift hue and chroma at runtime.' },
    ],
  },
  {
    name: 'default-provider-color-cascade',
    theme: 'default-provider',
    kind: 'color-cascade',
    description: 'Derives surfaces, text, borders, overlays, hover, and selected states from source accents.',
    parameters: [
      { name: 'surface.step', type: 'color-mix', default: '+8% luminance over background', description: 'Panel surface offset from the root background.' },
      { name: 'border.alpha', type: 'alpha', default: '0.1', description: 'Subtle divider contrast for dense dark UI.' },
      { name: 'accent.alpha', type: 'alpha', default: '0.06|0.12|0.2', description: 'Subtle, normal, and border accent opacities.' },
    ],
    inputs: ['color.background', 'color.surface', 'color.accent'],
    outputs: [
      'color.text',
      'color.textDim',
      'color.border',
      'color.overlay',
      'syntax.keyword',
      'syntax.string',
      'syntax.comment',
      'diagnostic.errorBackground',
      'diagnostic.warningBackground',
      'provider.rndPro.color',
      'provider.official.color',
      'provider.google.color',
      'provider.community.color',
      'component.accentBackground',
      'component.accentBackgroundSubtle',
      'component.accentBorder',
      'component.successBackground',
      'component.successBorder',
      'component.successBackgroundHover',
      'component.successBorderHover',
      'component.dangerBackground',
      'component.dangerBorder',
      'component.subgraphBackground',
      'component.subgraphBackgroundHover',
      'component.subgraphBorder',
      'component.subgraphBorderHover',
      'component.layoutPreviewJoinBackground',
      'component.layoutPreviewJoinBorder',
    ],
    formula: 'Surface and state colors are derived as transparent mixes over the background and accent roots.',
    derivations: [
      { output: 'color.text', inputs: ['color.background'], expression: 'contrastText(color.background, 0.92)', description: 'Primary text keeps high contrast over the root background.' },
      { output: 'color.border', inputs: ['color.text'], expression: 'hsl(text.h text.s text.l / 0.1)', description: 'Borders are text-tinted dividers, not independent colors.' },
      { output: 'component.accentBackgroundSubtle', inputs: ['color.accent'], expression: 'hsl(accent.h accent.s accent.l / 0.06)', description: 'Selected rows and active list items reuse the same subtle accent wash.' },
      { output: 'component.accentBackground', inputs: ['color.accent'], expression: 'hsl(accent.h accent.s accent.l / 0.12)', description: 'Stronger accent surfaces use the same accent at doubled opacity.' },
      { output: 'component.accentBorder', inputs: ['color.accent'], expression: 'hsl(accent.h accent.s accent.l / 0.2)', description: 'Accent borders are a higher-opacity form of the primary accent.' },
      { output: 'component.successBackground', inputs: ['color.success'], expression: 'color-mix(success, 18%, transparent)', description: 'Positive status chips derive their surface from the success branch.' },
      { output: 'component.successBorder', inputs: ['color.success'], expression: 'color-mix(success, 32%, transparent)', description: 'Positive status chip borders use the same success branch at stronger opacity.' },
      { output: 'component.successBackgroundHover', inputs: ['color.success'], expression: 'color-mix(success, 28%, transparent)', description: 'Positive action hover surfaces derive from the same success branch.' },
      { output: 'component.successBorderHover', inputs: ['color.success'], expression: 'color-mix(success, 52%, transparent)', description: 'Positive action hover borders use the success branch at stronger opacity.' },
      { output: 'component.dangerBackground', inputs: ['color.danger'], expression: 'color-mix(danger, 18%, transparent)', description: 'Negative status chips derive their surface from the danger branch.' },
      { output: 'component.dangerBorder', inputs: ['color.danger'], expression: 'color-mix(danger, 32%, transparent)', description: 'Negative status chip borders use the same danger branch at stronger opacity.' },
      { output: 'component.layoutPreviewJoinBackground', inputs: ['color.danger'], expression: 'color-mix(danger, 30%, transparent)', description: 'Join previews use the danger branch to indicate a destructive layout merge target.' },
      { output: 'component.layoutPreviewJoinBorder', inputs: ['color.danger'], expression: 'color-mix(danger, 60%, transparent)', description: 'Join preview outlines use the danger branch at stronger opacity.' },
      { output: 'component.subgraphBackground', inputs: ['color.data'], expression: 'linear-gradient(data accent at 12% and 8%)', description: 'Subgraph entry actions use a data-accent gradient exposed as a reusable token.' },
      { output: 'component.subgraphBackgroundHover', inputs: ['color.data'], expression: 'linear-gradient(data accent at 22% and 15%)', description: 'Subgraph entry hover surfaces strengthen the same data-accent gradient.' },
      { output: 'component.subgraphBorder', inputs: ['color.data'], expression: 'color-mix(data, 30%, transparent)', description: 'Subgraph action borders follow the data accent branch.' },
      { output: 'component.subgraphBorderHover', inputs: ['color.data'], expression: 'color-mix(data, 50%, transparent)', description: 'Subgraph action hover borders follow the data accent branch at stronger opacity.' },
      { output: 'syntax.keyword', inputs: ['color.danger'], expression: 'hsl(danger.hue vivid 86%)', description: 'Syntax keywords use the danger hue branch at readable high lightness.' },
      { output: 'syntax.string', inputs: ['color.warning'], expression: 'hsl(warning.hue vivid 70%)', description: 'String and numeric syntax tokens use the warning branch.' },
      { output: 'syntax.comment', inputs: ['color.textDim'], expression: 'color.textDim', description: 'Comments inherit muted text so they follow contrast controls.' },
      { output: 'diagnostic.errorBackground', inputs: ['color.danger'], expression: 'color-mix(danger, 7%, transparent)', description: 'Diagnostic error rows reuse the danger branch.' },
      { output: 'diagnostic.warningBackground', inputs: ['color.warning'], expression: 'color-mix(warning, 5%, transparent)', description: 'Diagnostic warning rows reuse the warning branch.' },
      { output: 'provider.rndPro.color', inputs: ['color.data'], expression: 'var(--sn-cat-data)', description: 'RND-PRO provider badges use the data accent branch instead of fixed purple values.' },
      { output: 'provider.official.color', inputs: ['color.accent'], expression: 'var(--sn-sys-accent)', description: 'Official provider badges follow the primary accent.' },
      { output: 'provider.google.color', inputs: ['color.success'], expression: 'var(--sn-sys-success)', description: 'Google provider badges follow the success branch.' },
      { output: 'provider.community.color', inputs: ['color.warning'], expression: 'var(--sn-sys-warning)', description: 'Community provider badges follow the warning branch.' },
    ],
  },
  {
    name: 'default-provider-geometry-cascade',
    theme: 'default-provider',
    kind: 'geometry-cascade',
    description: 'Derives density, panel gaps, row heights, radii, and control sizes from one spacing scale.',
    parameters: [
      { name: 'size.unit', type: 'dimension', default: '4px', unit: 'px', description: 'Smallest visual spacing unit.' },
      { name: 'density.compactRow', type: 'dimension', default: '22px', unit: 'px', description: 'Default tree row height for dense project navigation.' },
      { name: 'radius.unit', type: 'dimension', default: '4px', unit: 'px', description: 'Base radius used by rows, source actions, and list items.' },
    ],
    inputs: ['size.grid', 'density.scale'],
    outputs: [
      'component.layoutGapBackground',
      'geometry.treeRowHeight',
      'geometry.composerInputMinHeight',
      'geometry.composerInputPadding',
      'radius.node',
      'radius.control',
    ],
    formula: 'Spacing values are multiples of the base grid; radii and control sizes follow density scale.',
    derivations: [
      { output: 'geometry.treeGap', inputs: ['size.unit'], expression: 'size.unit', description: 'Tree vertical rhythm starts at the base spacing unit.' },
      { output: 'geometry.treeIndent', inputs: ['size.unit'], expression: 'size.unit * 4', description: 'Nested tree levels indent by four spacing units.' },
      { output: 'geometry.treeRowHeight', inputs: ['size.unit', 'density.scale'], expression: 'size.unit * 5.5 when density.scale = compact', description: 'Compact navigation rows stay scan-friendly without wasting vertical space.' },
      { output: 'geometry.tabsHeight', inputs: ['size.unit'], expression: 'size.unit * 9.5', description: 'Project tabs keep enough height for icon, label, and close affordance.' },
      { output: 'geometry.composerRadius', inputs: ['--sn-theme-composer-radius-scale'], expression: '20px * composer radius scale', description: 'The main chat input uses its own pill radius scale independent from the general UI radius.' },
      { output: 'geometry.composerInputPadding', inputs: ['geometry.composerRadius', 'density.scale'], expression: '4px * density plus 45% of composer radius inline', description: 'Composer textarea text inset expands with rounded corners so placeholder and input text stay optically aligned.' },
    ],
  },
  {
    name: 'default-provider-typography-cascade',
    theme: 'default-provider',
    kind: 'typography-cascade',
    description: 'Defines compact application typography for panels, lists, chat, and code surfaces.',
    parameters: [
      { name: 'font.family', type: 'fontFamily', default: 'Inter, system-ui', description: 'Primary application UI font stack.' },
      { name: 'font.mono', type: 'fontFamily', default: 'JetBrains Mono, Fira Code, monospace', description: 'Code and source display font stack.' },
      { name: 'font.bodySize', type: 'dimension', default: '12px', unit: 'px', description: 'Dense body text size for operational panels.' },
    ],
    inputs: ['font.family', 'font.scale'],
    outputs: ['typography.treeLabelSize', 'typography.listItemDescriptionSize', 'typography.listItemMetaSize', 'typography.iconFont'],
    formula: 'Typography sizes use a compact fixed scale suitable for repeated operational UI work.',
    derivations: [
      { output: 'typography.treeLabelSize', inputs: ['font.bodySize'], expression: 'font.bodySize', description: 'Tree labels inherit the dense body size.' },
      { output: 'typography.listItemDescriptionSize', inputs: ['font.bodySize'], expression: 'font.bodySize - 1px', description: 'Secondary descriptions step down one pixel from body text.' },
      { output: 'typography.listItemMetaSize', inputs: ['font.bodySize'], expression: 'font.bodySize - 2px', description: 'Metadata text is two pixels below body text.' },
      { output: 'typography.iconFont', inputs: ['font.icon'], expression: 'Material Symbols Outlined', description: 'Icon buttons use the shared Material Symbols font family.' },
    ],
  },
  {
    name: 'default-provider-motion-effects',
    theme: 'default-provider',
    kind: 'motion-effects',
    description: 'Defines transition, animation, and shadow aliases for hover, active, focus, drag, loading, and engine states.',
    parameters: [
      { name: 'motion.duration.fast', type: 'time', default: '120ms', description: 'Fast hover/focus response duration.' },
      { name: 'motion.easing.standard', type: 'easing', default: 'ease', description: 'Default easing for small UI state changes.' },
      { name: 'motion.enabled', type: 'boolean', default: 'true', description: 'Global motion enablement exposed as --sn-motion-enabled and --sn-animation-play-state.' },
      { name: 'focus.alpha', type: 'alpha', default: '0.35', description: 'Focus ring strength derived from the primary accent.' },
    ],
    inputs: ['motion.duration.fast', 'motion.easing.standard', 'motion.enabled', 'shadow.node'],
    outputs: ['effect.hoverTransition', 'effect.focusRing', 'effect.dragShadow', 'effect.loadingPulse', 'animation.playState', 'animation.durationScale'],
    formula: 'Interactive effects reuse fast duration, a shared easing token, and explicit animation play-state tokens.',
    derivations: [
      { output: 'effect.hoverTransition', inputs: ['motion.duration.fast', 'motion.easing.standard'], expression: 'background-color var(--sn-transition-fast) var(--sn-transition-easing), border-color var(--sn-transition-fast) var(--sn-transition-easing)', description: 'Hover transitions affect only inexpensive paint properties and inherit disabled motion through transition duration and easing tokens.' },
      { output: 'animation.playState', inputs: ['motion.enabled'], expression: 'running when enabled, paused when disabled', description: 'Animated runtime states can pause without requiring each component to branch in JavaScript.' },
      { output: 'effect.focusRing', inputs: ['color.accent', 'focus.alpha'], expression: '0 0 0 2px hsl(accent.h accent.s accent.l / focus.alpha)', description: 'Focus rings derive from the same primary accent as selected states.' },
      { output: 'effect.loadingPulse', inputs: ['color.accent'], expression: 'linear-gradient(90deg, transparent, hsl(accent.h accent.s accent.l / 0.6), transparent)', description: 'Loading effects reuse accent color without new component-specific colors.' },
    ],
  },
  {
    name: 'default-provider-engine-state-cascade',
    theme: 'default-provider',
    kind: 'semantic-alias',
    description: 'Maps standardized engine states to inherited status colors, state backgrounds, borders, and animation play state.',
    states: ['idle', 'running', 'success', 'error'],
    inputs: ['color.accent', 'color.success', 'color.danger', 'color.textDim', 'motion.enabled'],
    outputs: ['--sn-engine-state-color', '--sn-engine-state-bg', '--sn-engine-state-border', '--sn-sys-surface-raised', '--sn-sys-outline'],
    formula: 'Hosts set data-engine-state on a reusable surface; CSS variables cascade state color and motion without product-owned style branches.',
    derivations: [
      { output: 'engine.idle', inputs: ['color.textDim'], expression: 'var(--sn-sys-on-surface-dim)', description: 'Idle state keeps neutral muted status styling.' },
      { output: 'engine.running', inputs: ['color.accent', 'motion.enabled'], expression: 'accent border plus pulse animation with var(--sn-animation-play-state)', description: 'Running state uses the primary accent and pauses when motion is disabled.' },
      { output: 'engine.success', inputs: ['color.success'], expression: 'success color mixed into surface and border', description: 'Success state inherits the success semantic branch.' },
      { output: 'engine.error', inputs: ['color.danger'], expression: 'danger color mixed into surface and border', description: 'Error state inherits the danger semantic branch.' },
    ],
  },
  {
    name: 'default-provider-semantic-aliases',
    theme: 'default-provider',
    kind: 'semantic-alias',
    description: 'Maps cascade outputs to semantic application aliases without component ownership.',
    parameters: [
      { name: 'semantic.scope', type: 'string', default: '--sn-*', description: 'Public CSS custom property namespace exposed by symbiote-ui.' },
    ],
    inputs: ['color.*', 'size.*', 'radius.*', 'shadow.*', 'font.*'],
    outputs: ['--sn-sys-surface', '--sn-sys-surface-panel', '--sn-sys-surface-raised', '--sn-sys-outline', '--sn-sys-on-surface', '--sn-sys-on-surface-dim', '--sn-success-bg', '--sn-danger-bg'],
    formula: 'Semantic aliases are CSS custom properties consumed through normal cascade inheritance.',
    derivations: [
      { output: '--sn-sys-surface', inputs: ['color.background'], expression: 'color.background', description: 'Root background token.' },
      { output: '--sn-sys-surface-panel', inputs: ['color.surface'], expression: 'color.surface', description: 'Panel background token.' },
      { output: '--sn-sys-outline', inputs: ['color.border'], expression: 'color.border', description: 'Default node and source border token.' },
      { output: '--sn-sys-accent', inputs: ['color.accent'], expression: 'color.accent', description: 'Selected and focus accent token.' },
      { output: '--sn-sys-on-surface-dim', inputs: ['color.textDim'], expression: 'color.textDim', description: 'Muted readable text token.' },
      { output: '--sn-success-bg', inputs: ['component.successBackground'], expression: 'color-mix(in oklab, var(--sn-sys-success) 18%, transparent)', description: 'Positive status surfaces follow the success branch.' },
      { output: '--sn-danger-bg', inputs: ['component.dangerBackground'], expression: 'color-mix(in oklab, var(--sn-sys-danger) 18%, transparent)', description: 'Negative status surfaces follow the danger branch.' },
    ],
  },
  {
    name: 'default-provider-component-aliases',
    theme: 'default-provider',
    kind: 'component-alias',
    description: 'Maps semantic theme aliases to reusable symbiote-ui component surfaces.',
    parameters: [
      { name: 'component.scope', type: 'string', default: 'layout|surface|control|status|metric|tree|chat|tabs|source|list|loading', description: 'Component token domains served by the default provider theme.' },
    ],
    inputs: ['--sn-*'],
    outputs: [
      '--sn-layout-gap-bg',
      '--sn-layout-border',
      '--sn-card-bg',
      '--sn-card-border',
      '--sn-button-bg',
      '--sn-button-border',
      '--sn-button-primary-bg',
      '--sn-field-control-bg',
      '--sn-field-control-border',
      '--sn-field-control-focus-border',
      '--sn-field-control-subtle-border',
      '--sn-field-select-indicator',
      '--sn-field-toggle-bg',
      '--sn-field-toggle-thumb-bg',
      '--sn-field-toggle-thumb-active-bg',
      '--sn-badge-bg',
      '--sn-badge-border',
      '--sn-badge-success-bg',
      '--sn-badge-info-color',
      '--sn-badge-info-bg',
      '--sn-badge-warning-bg',
      '--sn-badge-error-bg',
      '--sn-badge-neutral-bg',
      '--sn-metric-border',
      '--sn-metric-label-color',
      '--sn-metric-value-color',
      '--sn-metric-success-color',
      '--sn-metric-warning-color',
      '--sn-metric-error-color',
      '--sn-data-table-bg',
      '--sn-data-table-border',
      '--sn-data-table-radius',
      '--sn-data-table-color',
      '--sn-data-table-header-bg',
      '--sn-data-table-header-color',
      '--sn-data-table-header-border',
      '--sn-data-table-row-border',
      '--sn-data-table-cell-padding',
      '--sn-data-table-cell-size',
      '--sn-data-table-empty-color',
      '--sn-banner-bg',
      '--sn-banner-border',
      '--sn-banner-info-bg',
      '--sn-banner-info-color',
      '--sn-banner-success-bg',
      '--sn-banner-warning-bg',
      '--sn-banner-error-bg',
      '--sn-empty-state-color',
      '--sn-empty-state-padding',
      '--sn-tree-row-height',
      '--sn-tree-panel-row-min-height',
      '--sn-tree-row-selected-bg',
      '--sn-composer-bg',
      '--sn-chat-message-bg',
      '--sn-chat-user-message-bg',
      '--sn-chat-agent-message-bg',
      '--sn-tabs-active-bg',
      '--sn-tabs-active-color',
      '--sn-tabs-active-border',
      '--sn-source-header-bg',
      '--sn-source-editor-bg',
      '--sn-syntax-keyword',
      '--sn-syntax-string',
      '--sn-syntax-comment',
      '--sn-syntax-function',
      '--sn-syntax-property',
      '--sn-diagnostic-error-bg',
      '--sn-diagnostic-warning-bg',
      '--sn-list-item-active-bg',
      '--sn-list-detail-bg',
      '--sn-list-detail-border',
      '--sn-list-detail-radius',
      '--sn-list-detail-sidebar-width',
      '--sn-list-detail-sidebar-bg',
      '--sn-list-detail-main-bg',
      '--sn-list-detail-header-bg',
      '--sn-list-detail-header-padding',
      '--sn-list-detail-main-padding',
      '--sn-list-detail-title-size',
      '--sn-list-detail-title-color',
      '--sn-success-bg-hover',
      '--sn-success-border-hover',
      '--sn-subgraph-bg',
      '--sn-subgraph-bg-hover',
      '--sn-subgraph-border',
      '--sn-subgraph-border-hover',
      '--sn-xr-panel-bg',
      '--sn-xr-panel-border',
      '--sn-xr-panel-radius',
      '--sn-xr-panel-shadow',
      '--sn-xr-pointer-color',
    ],
    appliesTo: ['panel-layout', 'sn-card', 'sn-button', 'sn-field', 'sn-badge', 'sn-metric', 'sn-data-table', 'sn-banner', 'sn-empty-state', 'sn-tree-view', 'sn-tree-panel', 'chat-composer', 'chat-transcript', 'project-tabs', 'source-viewer', 'source-editor', 'sn-list-item', 'sn-list-detail-shell', 'sn-loading-overlay'],
    formula: 'Component aliases bridge design tokens to component CSS without product-level style patches.',
    derivations: [
      { output: '--sn-layout-border', inputs: ['component.layoutBorder'], expression: 'transparent', description: 'Layout split gaps stay transparent without mutating the generic node border.' },
      { output: '--sn-card-bg', inputs: ['--sn-sys-surface-raised'], expression: 'var(--sn-sys-surface-raised)', description: 'Cards inherit the reusable node surface by default.' },
      { output: '--sn-card-border', inputs: ['--sn-sys-outline'], expression: 'var(--sn-sys-outline)', description: 'Cards share the provider border color.' },
      { output: '--sn-button-bg', inputs: ['--sn-sys-surface-raised'], expression: 'var(--sn-sys-surface-raised)', description: 'Default action controls inherit the normal node surface.' },
      { output: '--sn-button-primary-bg', inputs: ['--sn-sys-accent'], expression: 'var(--sn-sys-accent)', description: 'Primary actions use the shared selected/accent color.' },
      { output: '--sn-field-control-bg', inputs: ['--sn-sys-surface'], expression: 'var(--sn-sys-surface)', description: 'Form controls inherit the app background inside reusable fields.' },
      { output: '--sn-field-control-focus-border', inputs: ['--sn-sys-accent'], expression: 'var(--sn-sys-accent)', description: 'Field focus uses the shared selected/accent color.' },
      { output: '--sn-field-control-subtle-border', inputs: ['color.text'], expression: 'hsl(text / faint alpha)', description: 'Inspector-local control borders use a provider-owned faint text divider.' },
      { output: '--sn-field-toggle-bg', inputs: ['color.text'], expression: 'hsl(text / 0.1)', description: 'Toggle tracks derive from the faint text branch.' },
      { output: '--sn-badge-bg', inputs: ['--sn-sys-surface-raised'], expression: 'var(--sn-sys-surface-raised)', description: 'Badges inherit compact reusable node surfaces.' },
      { output: '--sn-badge-success-bg', inputs: ['--sn-status-success-bg'], expression: 'var(--sn-status-success-bg)', description: 'Success badges inherit the shared semantic status surface.' },
      { output: '--sn-badge-warning-bg', inputs: ['--sn-status-warning-bg'], expression: 'var(--sn-status-warning-bg)', description: 'Warning badges inherit the shared semantic status surface.' },
      { output: '--sn-badge-error-bg', inputs: ['--sn-status-error-bg'], expression: 'var(--sn-status-error-bg)', description: 'Error badges inherit the shared semantic status surface.' },
      { output: '--sn-badge-info-color', inputs: ['--sn-sys-accent'], expression: 'var(--sn-sys-accent)', description: 'Informational badges use the shared selected/accent color.' },
      { output: '--sn-metric-border', inputs: ['--sn-sys-outline-subtle'], expression: 'var(--sn-sys-outline-subtle)', description: 'Metric dividers inherit the reusable low-contrast divider branch.' },
      { output: '--sn-metric-label-color', inputs: ['--sn-sys-on-surface-dim'], expression: 'var(--sn-sys-on-surface-dim)', description: 'Metric labels inherit muted readable text.' },
      { output: '--sn-metric-value-color', inputs: ['--sn-sys-on-surface'], expression: 'var(--sn-sys-on-surface)', description: 'Metric values inherit primary readable text.' },
      { output: '--sn-metric-success-color', inputs: ['--sn-sys-success'], expression: 'var(--sn-sys-success)', description: 'Positive metric values follow the success branch.' },
      { output: '--sn-metric-warning-color', inputs: ['--sn-sys-warning'], expression: 'var(--sn-sys-warning)', description: 'Warning metric values follow the warning branch.' },
      { output: '--sn-metric-error-color', inputs: ['--sn-sys-danger'], expression: 'var(--sn-sys-danger)', description: 'Error metric values follow the danger branch.' },
      { output: '--sn-data-table-bg', inputs: ['--sn-sys-surface-raised'], expression: 'var(--sn-sys-surface-raised)', description: 'Data tables inherit the reusable node surface.' },
      { output: '--sn-data-table-border', inputs: ['--sn-sys-outline'], expression: 'var(--sn-sys-outline)', description: 'Data table frames use the provider border.' },
      { output: '--sn-data-table-header-bg', inputs: ['--sn-sys-surface-panel'], expression: 'var(--sn-sys-surface-panel)', description: 'Data table headers inherit panel surfaces.' },
      { output: '--sn-data-table-row-border', inputs: ['--sn-sys-outline-subtle'], expression: 'var(--sn-sys-outline-subtle)', description: 'Data table row dividers use the low-contrast row branch.' },
      { output: '--sn-data-table-empty-color', inputs: ['--sn-sys-on-surface-dim'], expression: 'var(--sn-sys-on-surface-dim)', description: 'Data table empty states inherit muted readable text.' },
      { output: '--sn-banner-bg', inputs: ['--sn-sys-surface-raised'], expression: 'var(--sn-sys-surface-raised)', description: 'Banners inherit the normal node surface for inline status feedback.' },
      { output: '--sn-banner-info-bg', inputs: ['--sn-status-info-bg'], expression: 'var(--sn-status-info-bg)', description: 'Informational banners inherit the shared semantic status surface.' },
      { output: '--sn-banner-success-bg', inputs: ['--sn-status-success-bg'], expression: 'var(--sn-status-success-bg)', description: 'Success banners inherit the shared semantic status surface.' },
      { output: '--sn-banner-warning-bg', inputs: ['--sn-status-warning-bg'], expression: 'var(--sn-status-warning-bg)', description: 'Warning banners inherit the shared semantic status surface.' },
      { output: '--sn-banner-error-bg', inputs: ['--sn-status-error-bg'], expression: 'var(--sn-status-error-bg)', description: 'Error banners inherit the shared semantic status surface.' },
      { output: '--sn-banner-info-color', inputs: ['--sn-sys-accent'], expression: 'var(--sn-sys-accent)', description: 'Informational and running banners use the shared selected/accent color.' },
      { output: '--sn-empty-state-color', inputs: ['--sn-sys-on-surface-dim'], expression: 'var(--sn-sys-on-surface-dim)', description: 'Empty states inherit muted readable text.' },
      { output: '--sn-empty-state-padding', inputs: ['geometry.spacing'], expression: '20px', description: 'Empty states use the provider spacing scale for placeholder breathing room.' },
      { output: '--sn-tree-row-selected-bg', inputs: ['--sn-accent-bg-subtle'], expression: 'var(--sn-accent-bg-subtle)', description: 'Tree selection uses the shared subtle accent surface.' },
      { output: '--sn-tree-panel-row-min-height', inputs: ['--sn-tree-row-min-height'], expression: 'var(--sn-tree-row-min-height)', description: 'Tree panels inherit the tree row geometry unless a host specializes the panel.' },
      { output: '--sn-list-detail-bg', inputs: ['--sn-sys-surface-panel'], expression: 'var(--sn-sys-surface-panel)', description: 'List/detail shells inherit the shared panel surface.' },
      { output: '--sn-list-detail-border', inputs: ['--sn-sys-outline'], expression: 'var(--sn-sys-outline)', description: 'List/detail shell dividers follow the provider border.' },
      { output: '--sn-success-bg-hover', inputs: ['component.successBackgroundHover'], expression: 'color-mix(in oklab, var(--sn-sys-success) 28%, transparent)', description: 'Positive action hover backgrounds follow the success branch.' },
      { output: '--sn-success-border-hover', inputs: ['component.successBorderHover'], expression: 'color-mix(in oklab, var(--sn-sys-success) 52%, transparent)', description: 'Positive action hover borders follow the success branch.' },
      { output: '--sn-subgraph-bg', inputs: ['component.subgraphBackground'], expression: 'var(--sn-subgraph-accent) gradient token', description: 'Subgraph action backgrounds are provider-owned gradient tokens.' },
      { output: '--sn-subgraph-bg-hover', inputs: ['component.subgraphBackgroundHover'], expression: 'var(--sn-subgraph-accent) hover gradient token', description: 'Subgraph action hover backgrounds are provider-owned gradient tokens.' },
      { output: '--sn-subgraph-border', inputs: ['component.subgraphBorder'], expression: 'color-mix(in oklab, var(--sn-subgraph-accent) 30%, transparent)', description: 'Subgraph action borders follow the data accent branch.' },
      { output: '--sn-subgraph-border-hover', inputs: ['component.subgraphBorderHover'], expression: 'color-mix(in oklab, var(--sn-subgraph-accent) 50%, transparent)', description: 'Subgraph action hover borders follow the data accent branch.' },
      { output: '--sn-xr-panel-bg', inputs: ['--sn-sys-surface-panel'], expression: 'var(--sn-sys-surface-panel)', description: 'XR panel materials inherit provider panel surfaces.' },
      { output: '--sn-xr-panel-border', inputs: ['--sn-sys-outline'], expression: 'var(--sn-sys-outline)', description: 'XR panel edges follow the shared provider border.' },
      { output: '--sn-xr-panel-radius', inputs: ['--sn-node-radius'], expression: 'var(--sn-node-radius)', description: 'XR panel geometry follows the provider radius cascade.' },
      { output: '--sn-xr-panel-shadow', inputs: ['--sn-node-shadow'], expression: 'var(--sn-node-shadow)', description: 'XR panel elevation follows the provider shadow cascade.' },
      { output: '--sn-xr-pointer-color', inputs: ['--sn-sys-accent'], expression: 'var(--sn-sys-accent)', description: 'XR pointer feedback follows the shared selected/accent color.' },
      { output: '--sn-composer-bg', inputs: ['--sn-sys-surface-raised'], expression: 'var(--sn-sys-surface-raised)', description: 'Chat composer inherits the normal node surface.' },
      { output: '--sn-tabs-active-bg', inputs: ['--sn-sys-surface-raised'], expression: 'var(--sn-sys-surface-raised)', description: 'Active project tabs align with node surfaces.' },
      { output: '--sn-tabs-active-color', inputs: ['--sn-sys-on-surface'], expression: 'var(--sn-sys-on-surface)', description: 'Active project tab text follows readable provider foreground text.' },
      { output: '--sn-tabs-active-border', inputs: ['--sn-tabs-accent'], expression: 'color-mix(in oklab, var(--tab-accent, var(--sn-tabs-accent)) 44%, transparent)', description: 'Active project tab outlines can be themed or made transparent by the cascade.' },
      { output: '--sn-tabs-accent', inputs: ['--sn-sys-accent'], expression: 'var(--sn-sys-accent)', description: 'Project tab icons inherit the shared selected/accent color unless the host supplies a semantic tab accent.' },
      { output: '--sn-source-editor-bg', inputs: ['--sn-sys-surface'], expression: 'var(--sn-sys-surface)', description: 'Source editing uses the root background for code contrast.' },
      { output: '--sn-syntax-keyword', inputs: ['syntax.keyword'], expression: 'hsl(var(--sn-hue-danger) var(--sn-sat-vivid) 86%)', description: 'Code keywords derive from the status hue cascade.' },
      { output: '--sn-syntax-string', inputs: ['syntax.string'], expression: 'hsl(var(--sn-hue-warning) var(--sn-sat-vivid) 70%)', description: 'Code strings derive from the warning hue cascade.' },
      { output: '--sn-syntax-comment', inputs: ['--sn-sys-on-surface-dim'], expression: 'var(--sn-sys-on-surface-dim)', description: 'Code comments inherit muted text.' },
      { output: '--sn-diagnostic-error-bg', inputs: ['--sn-sys-danger'], expression: 'color-mix(in oklab, var(--sn-sys-danger) 7%, transparent)', description: 'Diagnostic error backgrounds derive from danger color.' },
      { output: '--sn-diagnostic-warning-bg', inputs: ['--sn-sys-warning'], expression: 'color-mix(in oklab, var(--sn-sys-warning) 5%, transparent)', description: 'Diagnostic warning backgrounds derive from warning color.' },
    ],
  },
];

export let THEME_TOKENS = {
  "default-provider": {
    "name": "default-provider",
    "extends": "../base.json",
    "$description": "Cascadeable neutral provider default for symbiote-ui reusable components. Runtime CSS variables derive neutral surfaces, accents, controls, geometry, motion, engine state, and elevation from native HSL controls and color-mix aliases.",
    "$extensions": {
      "symbioteUi": {
        "role": "neutral-default",
        "origin": "Provider-neutral Symbiote UI tokens generalized for agent-built interfaces.",
        "cascade": "Apply once at :root, an app shell, or a subtree boundary; components inherit --sn-* tokens through the CSS cascade.",
        "engineStates": [
          "idle",
          "running",
          "success",
          "error"
        ],
        "colorModel": [
          "native-css-hsl",
          "alpha-hsl",
          "color-mix"
        ],
        "controlTokens": [
          "--sn-theme-hue",
          "--sn-theme-chroma",
          "--sn-theme-bg-lightness",
          "--sn-theme-surface-lightness",
          "--sn-theme-text-lightness",
          "--sn-theme-density",
          "--sn-theme-radius-scale",
          "--sn-theme-cell-radius-scale",
          "--sn-theme-composer-radius-scale",
          "--sn-theme-pattern-brightness",
          "--sn-theme-motion-scale",
          "--sn-motion-enabled",
          "--sn-animation-play-state",
          "--sn-animation-duration-scale",
          "--sn-animation-duration-fast",
          "--sn-animation-duration-normal",
          "--sn-animation-duration-slow",
          "--sn-animation-duration-slower",
          "--sn-transition-easing",
          "--sn-theme-elevation-scale"
        ],
        "geometryFamilies": [
          "density",
          "radius",
          "layout",
          "row",
          "control",
          "graph",
          "chat",
          "source",
          "loading"
        ]
      }
    },
    "control": {
      "hue": {
        "$type": "number",
        "$value": "218"
      },
      "chroma": {
        "$type": "percentage",
        "$value": "89%"
      },
      "backgroundLightness": {
        "$type": "percentage",
        "$value": "10%"
      },
      "surfaceLightness": {
        "$type": "percentage",
        "$value": "15.1%"
      },
      "textLightness": {
        "$type": "percentage",
        "$value": "98.0%"
      },
      "density": {
        "$type": "number",
        "$value": "1"
      },
      "radius": {
        "$type": "number",
        "$value": "1"
      },
      "pattern": {
        "$type": "number",
        "$value": "1.00"
      },
      "cellRadius": {
        "$type": "number",
        "$value": "1"
      },
      "motion": {
        "$type": "number",
        "$value": "1"
      },
      "elevation": {
        "$type": "number",
        "$value": "1"
      }
    },
    "color": {
      "background": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-bg))"
      },
      "surface": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-surface))"
      },
      "border": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-text) / 0.1)"
      },
      "text": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-text))"
      },
      "textDim": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-text-dim))"
      },
      "accent": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-accent) var(--sn-sat-vivid) var(--sn-lit-accent))"
      },
      "success": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-success) var(--sn-sat-vivid) 57%)"
      },
      "warning": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-warning) var(--sn-sat-vivid) 58%)"
      },
      "danger": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-danger) var(--sn-sat-vivid) 58%)"
      },
      "overlay": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) 0% / 0.45)"
      },
      "statusOkBg": {
        "$type": "color",
        "$value": "color-mix(in oklab, var(--sn-sys-success) 12%, transparent)"
      },
      "statusErrorBg": {
        "$type": "color",
        "$value": "color-mix(in oklab, var(--sn-sys-danger) 12%, transparent)"
      },
      "messageEventBg": {
        "$type": "color",
        "$value": "color-mix(in oklab, var(--sn-cat-server) 10%, transparent)"
      }
    },
    "component": {
      "panelBackground": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-surface))"
      },
      "layoutGapBackground": {
        "$type": "color",
        "$value": "transparent"
      },
      "layoutBorder": {
        "$type": "color",
        "$value": "transparent"
      },
      "layoutResizerBackground": {
        "$type": "color",
        "$value": "transparent"
      },
      "layoutResizerHoverBackground": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-text) / 0.08)"
      },
      "xrPanelBackground": {
        "$type": "color",
        "$value": "var(--sn-sys-surface-panel)"
      },
      "xrPanelBorder": {
        "$type": "color",
        "$value": "var(--sn-sys-outline)"
      },
      "xrPanelRadius": {
        "$type": "dimension",
        "$value": "var(--sn-node-radius)"
      },
      "xrPanelShadow": {
        "$type": "shadow",
        "$value": "var(--sn-node-shadow)"
      },
      "xrPointerColor": {
        "$type": "color",
        "$value": "var(--sn-sys-accent)"
      },
      "accentBackground": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-accent) var(--sn-sat-vivid) var(--sn-lit-accent) / 0.12)"
      },
      "accentBackgroundSubtle": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-accent) var(--sn-sat-vivid) var(--sn-lit-accent) / 0.06)"
      },
      "accentBorder": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-accent) var(--sn-sat-vivid) var(--sn-lit-accent) / 0.2)"
      },
      "successBackground": {
        "$type": "color",
        "$value": "color-mix(in oklab, var(--sn-sys-success) 18%, transparent)"
      },
      "successBackgroundHover": {
        "$type": "color",
        "$value": "color-mix(in oklab, var(--sn-sys-success) 28%, transparent)"
      },
      "successBorderHover": {
        "$type": "color",
        "$value": "color-mix(in oklab, var(--sn-sys-success) 52%, transparent)"
      },
      "dangerBackground": {
        "$type": "color",
        "$value": "color-mix(in oklab, var(--sn-sys-danger) 18%, transparent)"
      },
      "subgraphBackground": {
        "$type": "gradient",
        "$value": "linear-gradient(135deg, color-mix(in oklab, var(--sn-subgraph-accent) 12%, transparent) 0%, color-mix(in oklab, var(--sn-subgraph-accent) 8%, transparent) 100%)"
      },
      "subgraphBackgroundHover": {
        "$type": "gradient",
        "$value": "linear-gradient(135deg, color-mix(in oklab, var(--sn-subgraph-accent) 22%, transparent) 0%, color-mix(in oklab, var(--sn-subgraph-accent) 15%, transparent) 100%)"
      },
      "subgraphBorder": {
        "$type": "color",
        "$value": "color-mix(in oklab, var(--sn-subgraph-accent) 30%, transparent)"
      },
      "subgraphBorderHover": {
        "$type": "color",
        "$value": "color-mix(in oklab, var(--sn-subgraph-accent) 50%, transparent)"
      },
      "subgraphPreviewConnection": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-text) / 0.12)"
      },
      "subgraphPreviewCompletedConnection": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-success) var(--sn-sat-vivid) 57% / 0.5)"
      },
      "subgraphPreviewProcessingFill": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-accent) var(--sn-sat-vivid) var(--sn-lit-accent) / 0.25)"
      },
      "subgraphPreviewProcessingStroke": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-accent) var(--sn-sat-vivid) var(--sn-lit-accent) / 0.8)"
      },
      "subgraphPreviewProcessingGlow": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-accent) var(--sn-sat-vivid) var(--sn-lit-accent) / 0.6)"
      },
      "subgraphPreviewCompletedFill": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-success) var(--sn-sat-vivid) 57% / 0.2)"
      },
      "subgraphPreviewCompletedStroke": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-success) var(--sn-sat-vivid) 57% / 0.7)"
      },
      "subgraphPreviewIdleFill": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-text) / 0.08)"
      },
      "subgraphPreviewIdleStroke": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-text) / 0.2)"
      },
      "dialogBackground": {
        "$type": "color",
        "$value": "var(--sn-sys-surface-panel)"
      },
      "dialogColor": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface)"
      },
      "dialogBorder": {
        "$type": "color",
        "$value": "var(--sn-sys-outline)"
      },
      "dialogBorderWidth": {
        "$type": "dimension",
        "$value": "1px"
      },
      "dialogRadius": {
        "$type": "dimension",
        "$value": "calc(8px * var(--sn-theme-radius-scale))"
      },
      "dialogShadow": {
        "$type": "shadow",
        "$value": "var(--sn-shadow-lg)"
      },
      "dialogBackdrop": {
        "$type": "color",
        "$value": "var(--sn-bg-overlay)"
      },
      "dialogBodyPadding": {
        "$type": "dimension",
        "$value": "calc(20px * var(--sn-theme-density))"
      },
      "dialogFontSize": {
        "$type": "dimension",
        "$value": "14px"
      },
      "dialogMinWidth": {
        "$type": "dimension",
        "$value": "250px"
      },
      "dialogMessageGap": {
        "$type": "dimension",
        "$value": "calc(20px * var(--sn-theme-density))"
      },
      "dialogPromptMessageGap": {
        "$type": "dimension",
        "$value": "calc(10px * var(--sn-theme-density))"
      },
      "dialogActionsGap": {
        "$type": "dimension",
        "$value": "calc(10px * var(--sn-theme-density))"
      },
      "dialogActionsMarginBlockStart": {
        "$type": "dimension",
        "$value": "calc(20px * var(--sn-theme-density))"
      },
      "fieldControlSubtleBorder": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-text) / var(--sn-alpha-faint))"
      },
      "fieldSelectIndicator": {
        "$type": "gradient",
        "$value": "linear-gradient(45deg, transparent 50%, var(--sn-sys-on-surface-dim) 50%), linear-gradient(135deg, var(--sn-sys-on-surface-dim) 50%, transparent 50%)"
      },
      "fieldToggleBackground": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-text) / 0.1)"
      },
      "fieldToggleThumbBackground": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface-dim)"
      },
      "fieldToggleThumbActiveBackground": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface)"
      },
      "scrollbarThumb": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-text) / 0.08)"
      },
      "scrollbarThumbHover": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-text) / 0.25)"
      },
      "scrollbarTrack": {
        "$type": "color",
        "$value": "transparent"
      },
      "scrollbarWidth": {
        "$type": "string",
        "$value": "thin"
      },
      "scrollbarSize": {
        "$type": "dimension",
        "$value": "10px"
      },
      "scrollbarRadius": {
        "$type": "dimension",
        "$value": "999px"
      },
      "scrollbarThumbBorder": {
        "$type": "border",
        "$value": "3px solid transparent"
      },
      "scrollbarThumbMinSize": {
        "$type": "dimension",
        "$value": "36px"
      },
      "scrollShadowSize": {
        "$type": "dimension",
        "$value": "14px"
      },
      "nodeActiveBorder": {
        "$type": "color",
        "$value": "color-mix(in oklab, var(--sn-sys-accent) 50%, transparent)"
      },
      "connectionLinecap": {
        "$type": "string",
        "$value": "round"
      },
      "connectionLinejoin": {
        "$type": "string",
        "$value": "round"
      },
      "connectionDotFill": {
        "$type": "color",
        "$value": "var(--sn-conn-color)"
      },
      "connectionDotStroke": {
        "$type": "color",
        "$value": "var(--sn-sys-surface-raised)"
      },
      "dotOutput": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-warning) var(--sn-sat-vivid) 63%)"
      },
      "dotInput": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-accent) var(--sn-sat-vivid) 63%)"
      },
      "dotExec": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-warning) var(--sn-sat-vivid) 64%)"
      },
      "dotCtrl": {
        "$type": "color",
        "$value": "var(--sn-sys-success)"
      },
      "outputPreviewBorder": {
        "$type": "color",
        "$value": "var(--sn-border)"
      },
      "outputPreviewBackground": {
        "$type": "color",
        "$value": "var(--sn-sys-surface-raised)"
      },
      "outputPreviewMuted": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface-dim)"
      },
      "outputPreviewTitle": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface)"
      },
      "outputPreviewLabel": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface)"
      },
      "outputPreviewGrid": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-text) / 0.04)"
      },
      "outputPreviewItemBorder": {
        "$type": "color",
        "$value": "var(--sn-border)"
      },
      "outputPreviewItemBackground": {
        "$type": "color",
        "$value": "var(--sn-sys-surface-raised)"
      },
      "outputPreviewEdgeBackground": {
        "$type": "color",
        "$value": "color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-output-preview-bg))"
      },
      "chatItemIconColor": {
        "$type": "color",
        "$value": "currentColor"
      },
      "chatItemChildShadow": {
        "$type": "shadow",
        "$value": "2px 0 4px color-mix(in oklab, var(--sn-sys-surface) 70%, transparent)"
      },
      "listItemDisabledColor": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface-dim)"
      },
      "listItemIconColor": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface-dim)"
      },
      "listItemLabelColor": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface)"
      },
      "listItemDescriptionColor": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface-dim)"
      },
      "listItemMetaColor": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface-dim)"
      },
      "listDetailColor": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface)"
      },
      "listDetailIconColor": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface-dim)"
      },
      "listDetailTitleColor": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface)"
      },
      "listDetailDescriptionColor": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface-dim)"
      },
      "sourceEditorPlaceholderColor": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface-dim)"
      },
      "metricGap": {
        "$type": "dimension",
        "$value": "12px"
      },
      "metricPadding": {
        "$type": "dimension",
        "$value": "5px 0"
      },
      "metricBorder": {
        "$type": "color",
        "$value": "var(--sn-sys-outline-subtle)"
      },
      "metricColor": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface)"
      },
      "metricLabelColor": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface-dim)"
      },
      "metricLabelSize": {
        "$type": "dimension",
        "$value": "12px"
      },
      "metricValueColor": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface)"
      },
      "metricValueSize": {
        "$type": "dimension",
        "$value": "12px"
      },
      "metricValueWeight": {
        "$type": "number",
        "$value": "600"
      },
      "metricValueFont": {
        "$type": "fontFamily",
        "$value": "var(--sn-font-mono)"
      },
      "metricSuccessColor": {
        "$type": "color",
        "$value": "var(--sn-sys-success)"
      },
      "metricWarningColor": {
        "$type": "color",
        "$value": "var(--sn-sys-warning)"
      },
      "metricErrorColor": {
        "$type": "color",
        "$value": "var(--sn-sys-danger)"
      },
      "dataTableBackground": {
        "$type": "color",
        "$value": "var(--sn-sys-surface-raised)"
      },
      "dataTableBorder": {
        "$type": "color",
        "$value": "var(--sn-sys-outline)"
      },
      "dataTableRadius": {
        "$type": "dimension",
        "$value": "calc(8px * var(--sn-theme-radius-scale))"
      },
      "dataTableColor": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface)"
      },
      "dataTableHeaderBackground": {
        "$type": "color",
        "$value": "var(--sn-sys-surface-panel)"
      },
      "dataTableHeaderColor": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface-dim)"
      },
      "dataTableHeaderBorder": {
        "$type": "color",
        "$value": "var(--sn-sys-outline)"
      },
      "dataTableHeaderSize": {
        "$type": "dimension",
        "$value": "11px"
      },
      "dataTableHeaderWeight": {
        "$type": "number",
        "$value": "500"
      },
      "dataTableHeaderTransform": {
        "$type": "string",
        "$value": "uppercase"
      },
      "dataTableRowBorder": {
        "$type": "color",
        "$value": "var(--sn-sys-outline-subtle)"
      },
      "dataTableCellPadding": {
        "$type": "dimension",
        "$value": "12px 15px"
      },
      "dataTableCellSize": {
        "$type": "dimension",
        "$value": "13px"
      },
      "dataTableCellGap": {
        "$type": "dimension",
        "$value": "10px"
      },
      "dataTableLineHeight": {
        "$type": "number",
        "$value": "1.4"
      },
      "dataTableMinWidth": {
        "$type": "dimension",
        "$value": "0"
      },
      "dataTableMarkerSize": {
        "$type": "dimension",
        "$value": "12px"
      },
      "dataTableMarkerRadius": {
        "$type": "dimension",
        "$value": "50%"
      },
      "dataTableEmptyPadding": {
        "$type": "dimension",
        "$value": "12px 15px"
      },
      "dataTableEmptyColor": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface-dim)"
      }
    },
    "geometry": {
      "layoutResizerSize": {
        "$type": "dimension",
        "$value": "6px"
      },
      "treeGap": {
        "$type": "dimension",
        "$value": "4px"
      },
      "treeIndent": {
        "$type": "dimension",
        "$value": "16px"
      },
      "treeRowHeight": {
        "$type": "dimension",
        "$value": "22px"
      },
      "treeRowPaddingBlock": {
        "$type": "dimension",
        "$value": "2px"
      },
      "treeRowRadius": {
        "$type": "dimension",
        "$value": "4px"
      },
      "treeIconSize": {
        "$type": "dimension",
        "$value": "15px"
      },
      "treeBadgeRadius": {
        "$type": "dimension",
        "$value": "8px"
      },
      "listItemRadius": {
        "$type": "dimension",
        "$value": "4px"
      },
      "listItemGap": {
        "$type": "dimension",
        "$value": "10px"
      },
      "listItemMinHeight": {
        "$type": "dimension",
        "$value": "34px"
      },
      "tabsHeight": {
        "$type": "dimension",
        "$value": "38px"
      },
      "tabsItemHeight": {
        "$type": "dimension",
        "$value": "32px"
      },
      "composerRadius": {
        "$type": "dimension",
        "$value": "calc(20px * var(--sn-theme-composer-radius-scale, 1))"
      },
      "composerControlGap": {
        "$type": "dimension",
        "$value": "8px"
      },
      "composerInputMinHeight": {
        "$type": "dimension",
        "$value": "20px"
      },
      "composerInputPadding": {
        "$type": "dimension",
        "$value": "calc(4px * var(--sn-theme-density)) max(0px, calc(var(--sn-composer-radius) * 0.45))"
      },
      "chatGap": {
        "$type": "dimension",
        "$value": "8px"
      },
      "chatMetaIconSize": {
        "$type": "dimension",
        "$value": "12px"
      },
      "chatStatusIconSize": {
        "$type": "dimension",
        "$value": "12px"
      },
      "chatToolIconSize": {
        "$type": "dimension",
        "$value": "14px"
      },
      "chatSummaryIconSize": {
        "$type": "dimension",
        "$value": "16px"
      },
      "sourceActionRadius": {
        "$type": "dimension",
        "$value": "4px"
      },
      "sourceEditorFontSize": {
        "$type": "dimension",
        "$value": "12px"
      },
      "loadingOverlayGap": {
        "$type": "dimension",
        "$value": "16px"
      },
      "loadingOverlayZ": {
        "$type": "number",
        "$value": "500"
      },
      "overlayZBase": {
        "$type": "number",
        "$value": "20000"
      },
      "toolbarOcclusionBackground": {
        "$type": "color",
        "$value": "var(--sn-sys-surface-panel)"
      },
      "loadingLabelSize": {
        "$type": "dimension",
        "$value": "11px"
      },
      "loadingPhaseSize": {
        "$type": "dimension",
        "$value": "10px"
      },
      "loadingTrackWidth": {
        "$type": "dimension",
        "$value": "200px"
      },
      "loadingTrackHeight": {
        "$type": "dimension",
        "$value": "2px"
      },
      "loadingTrackRadius": {
        "$type": "dimension",
        "$value": "2px"
      },
      "loadingSubSize": {
        "$type": "dimension",
        "$value": "9px"
      },
      "nodeMinWidth": {
        "$type": "dimension",
        "$value": "180px"
      },
      "nodeMaxWidth": {
        "$type": "dimension",
        "$value": "280px"
      },
      "nodeBorderWidth": {
        "$type": "dimension",
        "$value": "2px"
      },
      "nodeFontSize": {
        "$type": "dimension",
        "$value": "13px"
      },
      "connectionDotStrokeWidth": {
        "$type": "dimension",
        "$value": "var(--sn-socket-border-width)"
      },
      "connectionDotRadius": {
        "$type": "dimension",
        "$value": "calc((var(--sn-socket-size) + var(--sn-conn-dot-stroke-width)) / 2)"
      },
      "graphExplorerOverlayZ": {
        "$type": "number",
        "$value": "100"
      },
      "graphExplorerToolbarTop": {
        "$type": "dimension",
        "$value": "8px"
      },
      "graphExplorerToolbarRight": {
        "$type": "dimension",
        "$value": "8px"
      },
      "graphExplorerToolbarGap": {
        "$type": "dimension",
        "$value": "6px"
      },
      "graphExplorerToolbarZ": {
        "$type": "number",
        "$value": "200"
      },
      "graphExplorerStatsBottom": {
        "$type": "dimension",
        "$value": "8px"
      },
      "graphExplorerStatsLeft": {
        "$type": "dimension",
        "$value": "8px"
      },
      "graphExplorerStatsZ": {
        "$type": "number",
        "$value": "10"
      },
      "graphTypeAction": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-danger) var(--sn-sat-vivid) 82%)"
      },
      "graphTypeOutput": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-success) var(--sn-sat-vivid) 65%)"
      },
      "graphTypeData": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-accent) var(--sn-sat-vivid) 79%)"
      },
      "graphTypeConfig": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-warning) var(--sn-sat-vivid) 68%)"
      },
      "graphTypeExternal": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-data) var(--sn-sat-vivid) 76%)"
      },
      "graphTypeStyle": {
        "$type": "color",
        "$value": "hsl(calc(var(--sn-hue-danger) + 315) var(--sn-sat-vivid) 78%)"
      },
      "graphTypeDocs": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) 85%)"
      },
      "graphTypeAsset": {
        "$type": "color",
        "$value": "hsl(calc(var(--sn-hue-accent) - 40) var(--sn-sat-vivid) 74%)"
      },
      "graphTypeGroup": {
        "$type": "color",
        "$value": "hsl(calc(var(--sn-hue-warning) + 8) var(--sn-sat-vivid) 67%)"
      },
      "graphTypeDirectory": {
        "$type": "color",
        "$value": "var(--sn-type-directory)"
      },
      "graphTypeFile": {
        "$type": "color",
        "$value": "var(--sn-type-file)"
      },
      "graphTypeSource": {
        "$type": "color",
        "$value": "var(--sn-type-source)"
      },
      "graphTypeCanvas": {
        "$type": "color",
        "$value": "var(--sn-type-canvas)"
      },
      "graphTypeLayout": {
        "$type": "color",
        "$value": "var(--sn-type-layout)"
      },
      "graphTypeControls": {
        "$type": "color",
        "$value": "var(--sn-type-controls)"
      },
      "graphTypeControl": {
        "$type": "color",
        "$value": "var(--sn-type-control)"
      },
      "graphTypeProfile": {
        "$type": "color",
        "$value": "var(--sn-type-profile)"
      },
      "graphTypeProfilePhoto": {
        "$type": "color",
        "$value": "var(--sn-type-profile-photo)"
      },
      "graphTypeBio": {
        "$type": "color",
        "$value": "var(--sn-type-bio)"
      },
      "graphTypePortal": {
        "$type": "color",
        "$value": "var(--sn-type-portal)"
      },
      "graphTypeProject": {
        "$type": "color",
        "$value": "var(--sn-type-project)"
      },
      "graphTypePulse": {
        "$type": "color",
        "$value": "var(--sn-type-pulse)"
      },
      "graphTypeSkill": {
        "$type": "color",
        "$value": "var(--sn-type-skill)"
      },
      "graphTypeFunction": {
        "$type": "color",
        "$value": "var(--sn-type-function)"
      },
      "graphTypeClass": {
        "$type": "color",
        "$value": "var(--sn-type-class)"
      },
      "graphTypeModule": {
        "$type": "color",
        "$value": "var(--sn-type-module)"
      },
      "canvasGraphBackground": {
        "$type": "color",
        "$value": "var(--sn-sys-surface)"
      },
      "canvasGraphEdge": {
        "$type": "color",
        "$value": "var(--sn-conn-color)"
      },
      "canvasGraphPulse": {
        "$type": "color",
        "$value": "var(--sn-sys-accent)"
      },
      "canvasGraphDanger": {
        "$type": "color",
        "$value": "var(--sn-sys-danger)"
      },
      "canvasGraphText": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface)"
      },
      "canvasGraphTextDim": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface-dim)"
      },
      "canvasGraphPanelBackground": {
        "$type": "color",
        "$value": "var(--sn-sys-surface-panel)"
      },
      "canvasGraphPanelBorder": {
        "$type": "color",
        "$value": "var(--sn-sys-outline)"
      },
      "canvasGraphGhost": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface-dim)"
      },
      "canvasGraphRadialIcon": {
        "$type": "color",
        "$value": "var(--sn-sys-surface)"
      },
      "graphCluster0": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-accent) var(--sn-sat-vivid) 74%)"
      },
      "graphCluster1": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-success) var(--sn-sat-vivid) 66%)"
      },
      "graphCluster2": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-warning) var(--sn-sat-vivid) 68%)"
      },
      "graphCluster3": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-danger) var(--sn-sat-vivid) 74%)"
      },
      "graphCluster4": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-data) var(--sn-sat-vivid) 76%)"
      },
      "graphCluster5": {
        "$type": "color",
        "$value": "hsl(calc(var(--sn-hue-accent) - 40) var(--sn-sat-vivid) 72%)"
      },
      "graphCluster6": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) 82%)"
      },
      "minimapBg": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-bg) / 0.85)"
      },
      "minimapNode": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-accent) var(--sn-sat-vivid) var(--sn-lit-accent) / 0.6)"
      },
      "minimapNodeStroke": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-accent) var(--sn-sat-vivid) var(--sn-lit-accent) / 0.3)"
      },
      "minimapBypassedNode": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-text-dim) / 0.5)"
      },
      "minimapViewport": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-text) / 0.6)"
      },
      "minimapViewportFill": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-text) / 0.04)"
      },
      "treeBadgeMaxWidth": {
        "$type": "dimension",
        "$value": "88px"
      },
      "treeKindMaxWidth": {
        "$type": "dimension",
        "$value": "120px"
      },
      "treeKindSize": {
        "$type": "dimension",
        "$value": "10px"
      },
      "nodeErrorFrameOffset": {
        "$type": "dimension",
        "$value": "10px"
      },
      "nodeErrorFrameMinWidth": {
        "$type": "dimension",
        "$value": "140px"
      },
      "nodeErrorFrameMaxWidth": {
        "$type": "dimension",
        "$value": "320px"
      },
      "nodeErrorFrameBorderWidth": {
        "$type": "dimension",
        "$value": "2px"
      },
      "nodeErrorFrameRadius": {
        "$type": "dimension",
        "$value": "calc(12px * var(--sn-theme-radius-scale))"
      },
      "tabsCornerSize": {
        "$type": "dimension",
        "$value": "12px"
      },
      "tabsCornerCut": {
        "$type": "dimension",
        "$value": "11.5px"
      },
      "treeToggleWidth": {
        "$type": "dimension",
        "$value": "18px"
      },
      "treeIconWidth": {
        "$type": "dimension",
        "$value": "18px"
      },
      "composerSendSize": {
        "$type": "dimension",
        "$value": "32px"
      },
      "composerSendIconSize": {
        "$type": "dimension",
        "$value": "18px"
      },
      "composerCollapsedControlWidth": {
        "$type": "dimension",
        "$value": "10px"
      },
      "composerCollapsedControlPadding": {
        "$type": "dimension",
        "$value": "10px"
      },
      "sidebarWidth": {
        "$type": "dimension",
        "$value": "220px"
      },
      "sidebarCollapsedWidth": {
        "$type": "dimension",
        "$value": "48px"
      },
      "sidebarResizeWidth": {
        "$type": "dimension",
        "$value": "5px"
      },
      "sidebarResizeOffset": {
        "$type": "dimension",
        "$value": "2px"
      },
      "outputPreviewGap": {
        "$type": "dimension",
        "$value": "8px"
      },
      "outputPreviewPadding": {
        "$type": "dimension",
        "$value": "10px"
      },
      "outputPreviewRadius": {
        "$type": "dimension",
        "$value": "calc(6px * var(--sn-theme-radius-scale))"
      },
      "outputPreviewCanvasRadius": {
        "$type": "dimension",
        "$value": "calc(5px * var(--sn-theme-radius-scale))"
      },
      "outputPreviewItemRadius": {
        "$type": "dimension",
        "$value": "calc(5px * var(--sn-theme-radius-scale))"
      },
      "chatLiveIconSize": {
        "$type": "dimension",
        "$value": "14px"
      },
      "treePanelTitleGap": {
        "$type": "dimension",
        "$value": "5px"
      },
      "treePanelTitlePadding": {
        "$type": "dimension",
        "$value": "6px 8px"
      },
      "treePanelTitleSize": {
        "$type": "dimension",
        "$value": "11px"
      },
      "treePanelIconSize": {
        "$type": "dimension",
        "$value": "14px"
      },
      "treePanelInputPadding": {
        "$type": "dimension",
        "$value": "4px 8px"
      },
      "treePanelInputRadius": {
        "$type": "dimension",
        "$value": "calc(4px * var(--sn-theme-radius-scale))"
      },
      "treePanelInputSize": {
        "$type": "dimension",
        "$value": "11px"
      },
      "treePanelCollapsePadding": {
        "$type": "dimension",
        "$value": "0 6px"
      },
      "treePanelContentPadding": {
        "$type": "dimension",
        "$value": "4px"
      },
      "treePanelPlaceholderPadding": {
        "$type": "dimension",
        "$value": "8px"
      },
      "treePanelPlaceholderSize": {
        "$type": "dimension",
        "$value": "12px"
      },
      "listItemIconSize": {
        "$type": "dimension",
        "$value": "18px"
      },
      "listItemIconFontSize": {
        "$type": "dimension",
        "$value": "16px"
      },
      "listItemLabelWeight": {
        "$type": "number",
        "$value": "500"
      },
      "listItemMetaMaxWidth": {
        "$type": "dimension",
        "$value": "38%"
      },
      "listDetailMinHeight": {
        "$type": "dimension",
        "$value": "0"
      },
      "listDetailHeight": {
        "$type": "dimension",
        "$value": "100%"
      },
      "listDetailHeaderGap": {
        "$type": "dimension",
        "$value": "8px"
      },
      "listDetailHeaderMinHeight": {
        "$type": "dimension",
        "$value": "42px"
      },
      "listDetailIconSize": {
        "$type": "dimension",
        "$value": "18px"
      },
      "listDetailListPadding": {
        "$type": "dimension",
        "$value": "8px"
      },
      "listDetailEmptyPadding": {
        "$type": "dimension",
        "$value": "12px"
      },
      "listDetailTitleWeight": {
        "$type": "number",
        "$value": "600"
      },
      "listDetailTitleTransform": {
        "$type": "string",
        "$value": "uppercase"
      },
      "listDetailDescriptionSize": {
        "$type": "dimension",
        "$value": "11px"
      },
      "sourceEditorTabSize": {
        "$type": "number",
        "$value": "2"
      }
    },
    "typography": {
      "fontUi": {
        "$type": "fontFamily",
        "$value": "var(--sn-font)"
      },
      "fontMono": {
        "$type": "fontFamily",
        "$value": "'JetBrains Mono', 'Fira Code', monospace"
      },
      "iconFont": {
        "$type": "fontFamily",
        "$value": "'Material Symbols Outlined'"
      },
      "treeLabelSize": {
        "$type": "dimension",
        "$value": "12px"
      },
      "treeBadgeSize": {
        "$type": "dimension",
        "$value": "10px"
      },
      "listItemLabelSize": {
        "$type": "dimension",
        "$value": "12px"
      },
      "listItemDescriptionSize": {
        "$type": "dimension",
        "$value": "11px"
      },
      "listItemMetaSize": {
        "$type": "dimension",
        "$value": "10px"
      }
    },
    "alias": {
      "layoutGapBackground": {
        "$type": "color",
        "$value": "var(--sn-layout-gap-bg)"
      },
      "layoutBorder": {
        "$type": "color",
        "$value": "var(--sn-layout-border)"
      },
      "treeRowSelectedBackground": {
        "$type": "color",
        "$value": "var(--sn-accent-bg-subtle)"
      },
      "treeRowSelectedBorder": {
        "$type": "color",
        "$value": "transparent"
      },
      "listItemActiveBackground": {
        "$type": "color",
        "$value": "var(--sn-accent-bg-subtle)"
      },
      "listDetailBackground": {
        "$type": "color",
        "$value": "var(--sn-sys-surface-panel)"
      },
      "listDetailBorder": {
        "$type": "color",
        "$value": "var(--sn-sys-outline)"
      },
      "listDetailRadius": {
        "$type": "dimension",
        "$value": "var(--sn-card-radius)"
      },
      "listDetailSidebarWidth": {
        "$type": "dimension",
        "$value": "minmax(220px, 30%)"
      },
      "listDetailSidebarBackground": {
        "$type": "color",
        "$value": "var(--sn-sys-surface-raised)"
      },
      "listDetailMainBackground": {
        "$type": "color",
        "$value": "transparent"
      },
      "listDetailHeaderBackground": {
        "$type": "color",
        "$value": "transparent"
      },
      "listDetailHeaderPadding": {
        "$type": "dimension",
        "$value": "10px 12px"
      },
      "listDetailMainPadding": {
        "$type": "dimension",
        "$value": "12px"
      },
      "listDetailTitleSize": {
        "$type": "dimension",
        "$value": "12px"
      },
      "listDetailTitleColor": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface)"
      },
      "composerBackground": {
        "$type": "color",
        "$value": "var(--sn-sys-surface-raised)"
      },
      "composerActionBackground": {
        "$type": "color",
        "$value": "color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-composer-bg))"
      },
      "tabsBackground": {
        "$type": "color",
        "$value": "transparent"
      },
      "tabsActiveBackground": {
        "$type": "color",
        "$value": "var(--sn-sys-surface-raised)"
      },
      "tabsAccent": {
        "$type": "color",
        "$value": "var(--sn-sys-accent)"
      },
      "sourceBackground": {
        "$type": "color",
        "$value": "var(--sn-sys-surface)"
      },
      "sourceHeaderBackground": {
        "$type": "color",
        "$value": "var(--sn-node-header-bg)"
      },
      "sourceEditorBackground": {
        "$type": "color",
        "$value": "var(--sn-sys-surface)"
      },
      "loadingBackground": {
        "$type": "color",
        "$value": "var(--sn-sys-surface)"
      },
      "loadingLabelColor": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface-dim)"
      },
      "loadingPhaseColor": {
        "$type": "color",
        "$value": "var(--sn-sys-accent)"
      },
      "loadingTrackBg": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-text) / 0.08)"
      },
      "loadingBarBg": {
        "$type": "color",
        "$value": "var(--sn-sys-accent)"
      },
      "loadingBarShadow": {
        "$type": "shadow",
        "$value": "0 0 8px color-mix(in oklab, var(--sn-sys-accent) 45%, transparent)"
      },
      "loadingSubColor": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface-dim)"
      },
      "categoryDirectory": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-warning) var(--sn-sat-vivid) 60%)"
      },
      "categoryFile": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-accent) var(--sn-sat-vivid) 66%)"
      },
      "categoryFunction": {
        "$type": "color",
        "$value": "var(--sn-sys-success)"
      },
      "categoryClass": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-data) var(--sn-sat-vivid) 72%)"
      },
      "categoryModule": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-danger) var(--sn-sat-vivid) 70%)"
      },
      "typeDefault": {
        "$type": "color",
        "$value": "var(--sn-node-category-accent)"
      },
      "typeAction": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-danger) var(--sn-sat-vivid) 82%)"
      },
      "typeOutput": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-success) var(--sn-sat-vivid) 65%)"
      },
      "typeData": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-accent) var(--sn-sat-vivid) 79%)"
      },
      "typeConfig": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-warning) var(--sn-sat-vivid) 68%)"
      },
      "typeExternal": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-data) var(--sn-sat-vivid) 76%)"
      },
      "typeStyle": {
        "$type": "color",
        "$value": "hsl(calc(var(--sn-hue-danger) + 315) var(--sn-sat-vivid) 78%)"
      },
      "typeDocs": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) 85%)"
      },
      "typeAsset": {
        "$type": "color",
        "$value": "hsl(calc(var(--sn-hue-accent) - 40) var(--sn-sat-vivid) 74%)"
      },
      "typeGroup": {
        "$type": "color",
        "$value": "hsl(calc(var(--sn-hue-warning) + 8) var(--sn-sat-vivid) 67%)"
      },
      "typeDirectory": {
        "$type": "color",
        "$value": "var(--sn-cat-directory)"
      },
      "typeFile": {
        "$type": "color",
        "$value": "var(--sn-cat-file)"
      },
      "typeFunction": {
        "$type": "color",
        "$value": "var(--sn-cat-function)"
      },
      "typeClass": {
        "$type": "color",
        "$value": "var(--sn-cat-class)"
      },
      "typeModule": {
        "$type": "color",
        "$value": "var(--sn-cat-module)"
      },
      "typeControl": {
        "$type": "color",
        "$value": "var(--sn-cat-control)"
      },
      "typeControls": {
        "$type": "color",
        "$value": "var(--sn-cat-control)"
      },
      "typeSource": {
        "$type": "color",
        "$value": "var(--sn-cat-server)"
      },
      "typeCanvas": {
        "$type": "color",
        "$value": "var(--sn-cat-module)"
      },
      "typeLayout": {
        "$type": "color",
        "$value": "var(--sn-cat-data)"
      },
      "typeProfile": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-data) var(--sn-sat-vivid) 58%)"
      },
      "typeProfilePhoto": {
        "$type": "color",
        "$value": "var(--sn-type-profile)"
      },
      "typeProfileInfo": {
        "$type": "color",
        "$value": "var(--sn-sys-success)"
      },
      "typeBio": {
        "$type": "color",
        "$value": "var(--sn-type-profile-info)"
      },
      "typePortal": {
        "$type": "color",
        "$value": "var(--sn-cat-control)"
      },
      "typeProject": {
        "$type": "color",
        "$value": "hsl(24 var(--sn-sat-vivid) 62%)"
      },
      "typePulse": {
        "$type": "color",
        "$value": "var(--sn-type-docs)"
      },
      "typeSkill": {
        "$type": "color",
        "$value": "var(--sn-cat-control)"
      },
      "accentWarning": {
        "$type": "color",
        "$value": "var(--sn-sys-warning)"
      },
      "statusOkBg": {
        "$type": "color",
        "$value": "{color.statusOkBg}"
      },
      "statusErrorBg": {
        "$type": "color",
        "$value": "{color.statusErrorBg}"
      },
      "messageEventBg": {
        "$type": "color",
        "$value": "{color.messageEventBg}"
      }
    },
    "provider": {
      "rndPro": {
        "color": {
          "$type": "color",
          "$value": "var(--sn-cat-data)"
        },
        "background": {
          "$type": "color",
          "$value": "color-mix(in oklab, var(--sn-provider-rnd-pro-color) 20%, transparent)"
        }
      },
      "official": {
        "color": {
          "$type": "color",
          "$value": "var(--sn-sys-accent)"
        },
        "background": {
          "$type": "color",
          "$value": "color-mix(in oklab, var(--sn-provider-official-color) 20%, transparent)"
        }
      },
      "google": {
        "color": {
          "$type": "color",
          "$value": "var(--sn-sys-success)"
        },
        "background": {
          "$type": "color",
          "$value": "color-mix(in oklab, var(--sn-provider-google-color) 20%, transparent)"
        }
      },
      "community": {
        "color": {
          "$type": "color",
          "$value": "var(--sn-sys-warning)"
        },
        "background": {
          "$type": "color",
          "$value": "color-mix(in oklab, var(--sn-provider-community-color) 20%, transparent)"
        }
      },
      "default": {
        "color": {
          "$type": "color",
          "$value": "var(--sn-sys-on-surface-dim)"
        },
        "background": {
          "$type": "color",
          "$value": "color-mix(in oklab, var(--sn-provider-default-color) 20%, transparent)"
        }
      }
    },
    "syntax": {
      "keyword": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-danger) var(--sn-sat-vivid) 86%)"
      },
      "string": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-warning) var(--sn-sat-vivid) 70%)"
      },
      "comment": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface-dim)"
      },
      "function": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-accent) var(--sn-sat-vivid) 84%)"
      },
      "number": {
        "$type": "color",
        "$value": "var(--sn-syntax-string)"
      },
      "builtin": {
        "$type": "color",
        "$value": "var(--sn-syntax-function)"
      },
      "property": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-data) var(--sn-sat-vivid) 78%)"
      },
      "literal": {
        "$type": "color",
        "$value": "var(--sn-syntax-keyword)"
      },
      "doc": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-success) 22% 56%)"
      },
      "docTag": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-success) 50% 70%)"
      },
      "docType": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-accent) 72% 72%)"
      },
      "template": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-warning) 44% 64%)"
      },
      "templateTag": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-accent) 48% 58%)"
      },
      "templateAttr": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-accent) var(--sn-sat-vivid) 80%)"
      },
      "templateBracket": {
        "$type": "color",
        "$value": "var(--sn-sys-on-surface-dim)"
      },
      "templateInterpolation": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-warning) 50% 76%)"
      },
      "templateSelector": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-warning) 56% 68%)"
      },
      "templateProperty": {
        "$type": "color",
        "$value": "var(--sn-syntax-template-attr)"
      },
      "templateValue": {
        "$type": "color",
        "$value": "var(--sn-syntax-template)"
      }
    },
    "diagnostic": {
      "errorBackground": {
        "$type": "color",
        "$value": "color-mix(in oklab, var(--sn-sys-danger) 7%, transparent)"
      },
      "errorBorder": {
        "$type": "color",
        "$value": "color-mix(in oklab, var(--sn-sys-danger) 55%, transparent)"
      },
      "warningBackground": {
        "$type": "color",
        "$value": "color-mix(in oklab, var(--sn-sys-warning) 5%, transparent)"
      },
      "warningBorder": {
        "$type": "color",
        "$value": "color-mix(in oklab, var(--sn-sys-warning) 45%, transparent)"
      }
    },
    "radius": {
      "node": {
        "$type": "dimension",
        "$value": "8px"
      },
      "control": {
        "$type": "dimension",
        "$value": "4px"
      }
    },
    "effect": {
      "hoverTransition": {
        "$type": "transition",
        "$value": "background-color var(--sn-transition-fast) var(--sn-transition-easing), border-color var(--sn-transition-fast) var(--sn-transition-easing), color var(--sn-transition-fast) var(--sn-transition-easing)"
      },
      "focusRing": {
        "$type": "shadow",
        "$value": "0 0 0 2px hsl(var(--sn-hue-accent) var(--sn-sat-vivid) var(--sn-lit-accent) / 0.35)"
      },
      "dragShadow": {
        "$type": "shadow",
        "$value": "0 14px calc(32px * var(--sn-theme-elevation-scale)) hsl(var(--sn-hue-base) var(--sn-sat-muted) 0% / 0.35)"
      },
      "loadingPulse": {
        "$type": "gradient",
        "$value": "linear-gradient(90deg, transparent, hsl(var(--sn-hue-accent) var(--sn-sat-vivid) var(--sn-lit-accent) / 0.6), transparent)"
      },
      "cellBackground": {
        "$type": "color",
        "$value": "var(--sn-sys-surface)"
      },
      "cellDot": {
        "$type": "color",
        "$value": "color-mix(in oklab, var(--sn-sys-on-surface-dim) 55%, var(--sn-sys-surface))"
      },
      "cellBaseAlpha": {
        "$type": "number",
        "$value": "0.047"
      },
      "cellAlphaSpan": {
        "$type": "number",
        "$value": "0.175"
      },
      "chatCellBaseAlpha": {
        "$type": "number",
        "$value": "0.012"
      },
      "chatCellAlphaSpan": {
        "$type": "number",
        "$value": "0.070"
      },
      "cellGlare": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-text) / 0.019)"
      },
      "cellVignetteMid": {
        "$type": "color",
        "$value": "hsl(var(--sn-hue-base) var(--sn-sat-muted) var(--sn-lit-bg) / 0.7)"
      },
      "cellVignetteEdge": {
        "$type": "color",
        "$value": "var(--sn-sys-surface)"
      },
      "cellNoise": {
        "$type": "asset",
        "$value": "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.5' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.030'/%3E%3C/svg%3E\")"
      },
      "shadowSmall": {
        "$type": "shadow",
        "$value": "0 1px calc(4px * var(--sn-theme-elevation-scale)) hsl(var(--sn-hue-base) var(--sn-sat-muted) 0% / 0.22)"
      },
      "shadowMedium": {
        "$type": "shadow",
        "$value": "0 2px calc(8px * var(--sn-theme-elevation-scale)) hsl(var(--sn-hue-base) var(--sn-sat-muted) 0% / 0.28)"
      },
      "shadowLarge": {
        "$type": "shadow",
        "$value": "0 6px calc(18px * var(--sn-theme-elevation-scale)) hsl(var(--sn-hue-base) var(--sn-sat-muted) 0% / 0.28)"
      },
      "shadowExtraLarge": {
        "$type": "shadow",
        "$value": "0 -8px calc(28px * var(--sn-theme-elevation-scale)) hsl(var(--sn-hue-base) var(--sn-sat-muted) 0% / 0.32)"
      }
    }
  }
};
export function listThemes() {
  return THEME_NAMES.map((name) => getTheme(name));
}

export function getTheme(name) {
  if (!THEME_NAMES.includes(name)) return undefined;
  return TOKEN_FILES.find((file) => file.name === name);
}

export function getThemeTokens(name) {
  if (!THEME_NAMES.includes(name)) return undefined;
  return THEME_TOKENS[name];
}

export function listTokenFiles() {
  return [...TOKEN_FILES];
}

export function listThemeRuleBlocks(filter = {}) {
  return THEME_RULE_BLOCKS.filter((block) => {
    for (let [key, value] of Object.entries(filter)) {
      if (block[key] !== value) return false;
    }
    return true;
  });
}

export function getThemeRuleBlocks(themeName) {
  return listThemeRuleBlocks({ theme: themeName });
}

export function getThemeControls(themeName) {
  return copyData(THEME_CONTROLS[themeName] || []);
}

export function listThemeRuntimeDescriptors() {
  return copyData(THEME_RUNTIME_DESCRIPTORS);
}

export function getThemeRuntimeDescriptor(name) {
  return copyData(THEME_RUNTIME_DESCRIPTORS.find((descriptor) => descriptor.name === name));
}

export function getThemeRecipeModel() {
  return copyData(THEME_RECIPE_MODEL);
}

export function listThemeRelations() {
  return copyData(THEME_RELATIONS);
}

export function getThemeRelation(name) {
  return copyData(THEME_RELATIONS.find((relation) => relation.name === name));
}

export function listThemeRecipes(filter = {}) {
  return copyData(THEME_RECIPES.filter((recipe) => {
    if (!filter.designRegister) return true;
    return recipe.designRegisters.includes(filter.designRegister);
  }));
}

export function getThemeRecipeDirection(name) {
  return copyData(THEME_RECIPES.find((recipe) => recipe.name === name));
}

export function listThemeElementGroups() {
  return copyData(THEME_ELEMENT_GROUPS);
}

export function getThemeCssTokens(themeName) {
  return { ...(RUNTIME_THEMES[themeName]?.tokens || {}) };
}

export function listThemeCssTokenClassifications(themeName) {
  return Object.entries(getThemeCssTokens(themeName)).map(([cssVar, value]) => {
    let classification = classifyCssToken(cssVar);
    return {
      cssVar,
      value,
      ...classification,
    };
  });
}

export function getThemeRecipe(themeName) {
  let theme = getTheme(themeName);
  let tokens = getThemeTokens(themeName);
  if (!theme || !tokens) return undefined;
  let cssTokens = getThemeCssTokens(themeName);
  return {
    name: themeName,
    theme: { ...theme },
    metadata: copyData(THEME_METADATA[themeName] || {}),
    tokenFile: theme.path,
    tokens: copyData(tokens),
    flatTokens: copyData(flattenTokens(tokens)),
    cssTokens,
    cssTokenClassifications: listThemeCssTokenClassifications(themeName),
    cssTokenSource: RUNTIME_THEMES[themeName] ? 'runtime-theme' : 'not-runtime-complete',
    controls: getThemeControls(themeName),
    elementGroups: listThemeElementGroups(),
    ruleBlocks: copyData(getThemeRuleBlocks(themeName)),
  };
}

export function flattenTokens(tokenTree, prefix = '', out = {}) {
  for (let [key, value] of Object.entries(tokenTree || {})) {
    if (key.startsWith('$') || key === 'name' || key === 'extends') continue;
    let nextKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && '$value' in value) {
      out[nextKey] = value;
    } else if (value && typeof value === 'object') {
      flattenTokens(value, nextKey, out);
    }
  }
  return out;
}
