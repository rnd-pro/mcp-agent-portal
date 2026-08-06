import {
  getCascadeThemeRecipeDescriptor,
  resolveCascadeThemeRecipe,
} from './theme-recipes.js';
import { ensureSystemCascade } from './system-cascade.js';
import { geometryRegisterScaleTokens, GEOMETRY_PROFILE_NAMES } from '../tokens/scale.js';
import {
  CASCADE_THEME_CONTROL_LIST,
  CASCADE_THEME_DEFAULTS,
  CASCADE_THEME_TAB_SHAPES,
  CASCADE_THEME_VARIANTS,
  CASCADE_THEME_VARIANT_PRESETS,
} from './cascade-theme-controls.js';
export {
  CASCADE_THEME_DEFAULTS,
  CASCADE_THEME_TAB_SHAPES,
  CASCADE_THEME_VARIANTS,
  CASCADE_THEME_VARIANT_PRESETS,
} from './cascade-theme-controls.js';

const CASCADE_THEME_RADIUS_BASE = 17;
const CASCADE_THEME_TAB_RADIUS_BASE = 17;
const CASCADE_THEME_CELL_RADIUS_BASE = 17;
const CASCADE_THEME_OUTLINE_BASE = 21;
// Keep a measurable margin above WCAG AA after browsers quantize colors to 8-bit RGB.
const CASCADE_THEME_READABLE_TEXT_CONTRAST_TARGET = 4.55;

export const CASCADE_THEME_TOKEN_TARGETS = Object.freeze({
  color: [
    '--sn-theme-name',
    '--sn-theme-variant',
    '--sn-theme-hue',
    '--sn-theme-chroma',
    '--sn-theme-bg-lightness',
    '--sn-theme-surface-lightness',
    '--sn-theme-text-lightness',
    '--sn-theme-pattern-brightness',
    '--sn-sys-surface',
    '--sn-sys-surface-panel',
    '--sn-sys-surface-sunken',
    '--sn-sys-surface-raised',
    '--sn-sys-on-surface',
    '--sn-sys-on-surface-dim',
    '--sn-sys-surface-overlay',
    '--sn-lit-hover',
    '--sn-lit-text-dim',
    '--sn-lit-accent',
    '--sn-hue-accent',
    '--sn-hue-success',
    '--sn-hue-warning',
    '--sn-hue-danger',
    '--sn-hue-data',
    '--sn-sys-accent',
    '--sn-sys-state-hover-mix',
    '--sn-sys-state-selected-mix',
    '--sn-cat-server',
    '--sn-cat-instance',
    '--sn-cat-control',
    '--sn-cat-data',
    '--sn-cat-default',
    '--sn-subgraph-accent',
    '--sn-type-default',
    '--sn-type-action',
    '--sn-type-output',
    '--sn-type-data',
    '--sn-type-config',
    '--sn-type-external',
    '--sn-type-style',
    '--sn-type-docs',
    '--sn-type-asset',
    '--sn-type-group',
    '--sn-type-source',
    '--sn-type-canvas',
    '--sn-type-layout',
    '--sn-type-controls',
    '--sn-type-control',
    '--sn-type-directory',
    '--sn-type-file',
    '--sn-type-function',
    '--sn-type-class',
    '--sn-type-module',
    '--sn-type-profile',
    '--sn-type-profile-photo',
    '--sn-type-profile-info',
    '--sn-type-bio',
    '--sn-type-portal',
    '--sn-type-project',
    '--sn-type-pulse',
    '--sn-type-skill',
    '--sn-graph-type-data',
    '--sn-graph-type-action',
    '--sn-graph-type-output',
    '--sn-graph-type-config',
    '--sn-graph-type-external',
    '--sn-graph-type-style',
    '--sn-graph-type-docs',
    '--sn-graph-type-asset',
    '--sn-graph-type-group',
    '--sn-graph-type-directory',
    '--sn-graph-type-file',
    '--sn-graph-type-source',
    '--sn-graph-type-canvas',
    '--sn-graph-type-layout',
    '--sn-graph-type-controls',
    '--sn-graph-type-control',
    '--sn-graph-type-profile',
    '--sn-graph-type-profile-photo',
    '--sn-graph-type-bio',
    '--sn-graph-type-portal',
    '--sn-graph-type-project',
    '--sn-graph-type-pulse',
    '--sn-graph-type-skill',
    '--sn-graph-type-function',
    '--sn-graph-type-class',
    '--sn-graph-type-module',
    '--sn-tabs-accent',
    '--sn-tabs-shape',
    '--sn-tabs-active-color',
    '--sn-tabs-active-border',
    '--sn-tab-accent-0',
    '--sn-tab-accent-1',
    '--sn-tab-accent-2',
    '--sn-tab-accent-3',
    '--sn-tab-accent-4',
    '--sn-tab-accent-5',
    '--sn-button-primary-bg',
    '--sn-button-primary-border',
    '--sn-button-primary-color',
    '--sn-button-success-bg',
    '--sn-button-success-border',
    '--sn-button-success-color',
    '--sn-button-danger-hover-bg',
    '--sn-button-danger-hover-border',
    '--sn-button-danger-hover-color',
    '--sn-layout-panel-card-bg',
    '--sn-layout-sidebar-header-bg',
    '--sn-layout-sidebar-header-button-hover-bg',
    '--sn-layout-sidebar-header-button-active-bg',
    '--sn-scrollbar-thumb',
    '--sn-scrollbar-thumb-hover',
    '--sn-scroll-area-padding',
    '--sn-media-studio-bg',
    '--sn-media-studio-border',
    '--sn-media-studio-preview-bg',
    '--sn-media-studio-preview-shadow',
    '--sn-media-studio-timeline-bg',
    '--sn-media-studio-pane-bg',
    '--sn-media-studio-progress-color',
    '--sn-media-studio-toolbar-bg',
    '--sn-media-studio-status-bg',
    '--sn-media-studio-checker-a',
    '--sn-media-studio-checker-b',
    '--sn-media-studio-track-video-bg',
    '--sn-media-studio-track-audio-bg',
    '--sn-media-studio-playhead-color',
    '--sn-grid-dot',
    '--sn-cell-bg',
    '--sn-cell-dot',
    '--sn-cell-base-alpha',
    '--sn-cell-alpha-span',
    '--sn-chat-cell-base-alpha',
    '--sn-chat-cell-alpha-span',
    '--sn-cell-glare',
    '--sn-cell-vignette-mid',
    '--sn-cell-vignette-edge',
    '--sn-cell-noise',
    '--sn-chat-bg',
    '--sn-chat-message-bg',
    '--sn-chat-user-message-bg',
    '--sn-chat-agent-message-bg',
    '--sn-composer-bg',
    '--sn-composer-action-bg',
    '--sn-composer-send-hover-bg',
    '--sn-syntax-keyword',
    '--sn-syntax-string',
    '--sn-syntax-comment',
    '--sn-syntax-function',
    '--sn-syntax-property',
  ],
  outline: [
    '--sn-outline-color',
    '--sn-outline-color-soft',
    '--sn-sys-outline',
    '--sn-layout-panel-card-border',
    '--sn-node-border-width',
    '--sn-layout-sidebar-header-border',
    '--sn-shape-stroke',
    '--sn-shape-stroke-width',
    '--sn-shape-port-hint-stroke-width',
    '--sn-conn-width',
    '--sn-conn-hover-width',
    '--sn-conn-selected-width',
    '--sn-layout-border',
    '--sn-ctx-border',
    '--sn-composer-border',
    '--sn-effect-focus-ring',
  ],
  typography: [
    '--sn-theme-type-scale',
    '--sn-theme-heading-scale',
    '--sn-node-font-size',
    '--sn-node-label-size',
    '--sn-node-item-title-size',
    '--sn-node-summary-size',
    '--sn-node-icon-size',
    '--sn-port-label-size',
    '--sn-control-input-size',
    '--sn-card-title-size',
    '--sn-markdown-h1-size',
    '--sn-markdown-h2-size',
    '--sn-markdown-h3-size',
    '--sn-markdown-h4-size',
    '--sn-chat-markdown-h1-size',
    '--sn-chat-markdown-h2-size',
    '--sn-chat-markdown-h3-size',
    '--sn-chat-markdown-h4-size',
    '--sn-chat-live-icon-size',
    '--sn-chat-meta-icon-size',
    '--sn-chat-status-icon-size',
    '--sn-chat-tool-icon-size',
    '--sn-chat-summary-icon-size',
    '--sn-chat-message-font-size',
    '--sn-chat-small-size',
    '--sn-chat-tool-font-size',
    '--sn-chat-tool-label-size',
    '--sn-chat-code-size',
    '--sn-chat-table-size',
    '--sn-chat-status-card-size',
    '--sn-chat-sidebar-title-size',
    '--sn-chat-sidebar-meta-size',
    '--sn-chat-sidebar-button-size',
    '--sn-chat-sidebar-button-icon-size',
    '--sn-chat-sidebar-icon-size',
    '--sn-chat-sidebar-delete-size',
    '--sn-chat-sidebar-delete-icon-size',
    '--sn-chat-sidebar-expand-icon-size',
    '--sn-chat-sidebar-child-size',
    '--sn-chat-list-title-size',
    '--sn-chat-list-icon-size',
    '--sn-chat-list-empty-icon-size',
    '--sn-chat-list-new-icon-size',
    '--sn-chat-list-filter-button-size',
    '--sn-chat-list-badge-size',
    '--sn-chat-list-name-size',
    '--sn-chat-list-adapter-size',
    '--sn-chat-list-preview-size',
    '--sn-chat-list-meta-size',
    '--sn-chat-list-delete-size',
    '--sn-code-font-size',
    '--sn-code-markdown-size',
    '--sn-code-table-size',
    '--sn-composer-send-icon-size',
    '--sn-composer-input-size',
    '--sn-composer-footer-size',
    '--sn-composer-chip-size',
    '--sn-composer-popup-header-size',
    '--sn-composer-popup-item-size',
    '--sn-composer-popup-hint-size',
    '--sn-composer-voice-label-size',
    '--sn-composer-voice-preview-size',
    '--sn-composer-voice-status-size',
    '--sn-composer-footer-icon-size',
    '--sn-composer-footer-toggle-icon-size',
    '--sn-layout-header-title-size',
    '--sn-layout-header-button-size',
    '--sn-layout-header-icon-size',
    '--sn-layout-menu-action-size',
    '--sn-layout-menu-icon-size',
    '--sn-lab-menu-button-size',
    '--sn-lab-menu-icon-size',
    '--sn-panel-menu-icon-size',
    '--sn-shape-icon-size',
  ],
  density: [
    '--sn-theme-density',
    '--sn-theme-spacing-scale',
    '--sn-theme-radius-scale',
    '--sn-theme-tab-radius-scale',
    '--sn-theme-cell-radius-scale',
    '--sn-theme-composer-radius-scale',
    '--sn-node-header-gap',
    '--sn-node-header-padding',
    '--sn-node-collapsed-body-padding',
    '--sn-node-lod-body-padding',
    '--sn-node-body-padding',
    '--sn-node-body-gap',
    '--sn-node-pill-body-padding',
    '--sn-node-pill-body-gap',
    '--sn-node-circle-header-padding',
    '--sn-node-circle-body-padding',
    '--sn-node-comment-body-padding',
    '--sn-node-content-padding',
    '--sn-node-link-gap',
    '--sn-node-link-margin-block-start',
    '--sn-node-items-padding',
    '--sn-node-items-gap',
    '--sn-node-item-gap',
    '--sn-node-item-padding',
    '--sn-node-controls-padding',
    '--sn-node-error-frame-header-gap',
    '--sn-node-error-frame-header-padding',
    '--sn-node-error-frame-body-padding',
    '--sn-node-preview-text-padding',
    '--sn-port-padding',
    '--sn-port-min-height',
    '--sn-control-padding',
    '--sn-description-list-padding',
    '--sn-layout-header-gap',
    '--sn-layout-header-padding',
    '--sn-layout-header-title-line-height',
    '--sn-layout-header-min-height',
    '--sn-layout-header-block-size',
    '--sn-layout-header-button-gap',
    '--sn-layout-header-button-padding',
    '--sn-layout-header-button-radius',
    '--sn-layout-header-button-min-inline-size',
    '--sn-layout-header-button-min-block-size',
    '--sn-layout-header-button-block-size',
    '--sn-layout-panel-card-radius',
    '--sn-layout-panel-card-inline-size',
    '--sn-layout-panel-card-min-block-size',
    '--sn-media-studio-preview-radius',
    '--sn-media-studio-pane-width',
    '--sn-media-studio-timeline-height',
    '--sn-media-studio-control-height',
    '--sn-media-studio-panel-gap',
    '--sn-layout-sidebar-item-block-size',
    '--sn-layout-sidebar-item-padding',
    '--sn-layout-menu-min-height',
    '--sn-layout-menu-row-height',
    '--sn-layout-menu-padding',
    '--sn-layout-menu-row-padding',
    '--sn-layout-menu-row-label-width',
    '--sn-layout-menu-label-padding',
    '--sn-layout-menu-label-size',
    '--sn-layout-menu-gap',
    '--sn-layout-menu-action-gap',
    '--sn-layout-menu-action-height',
    '--sn-layout-menu-action-padding',
    '--sn-layout-overflow-inline-size',
    '--sn-layout-scroll-inline-extra',
    '--sn-layout-overflow-block-size',
    '--sn-layout-responsive-panel-min-block-size',
    '--sn-scroll-shadow-size',
    '--sn-tabs-active-border-bottom',
    '--sn-tabs-active-corner-display',
    '--sn-tabs-bar-align',
    '--sn-tabs-corner-radius',
    '--sn-tabs-item-border-bottom',
    '--sn-lab-menu-gap',
    '--sn-lab-menu-separator-height',
    '--sn-lab-menu-button-gap',
    '--sn-lab-menu-button-height',
    '--sn-lab-menu-button-padding',
    '--sn-lab-tabs-height',
    '--sn-lab-tabs-item-height',
    '--sn-layout-collapsed-horizontal-size',
    '--sn-sidebar-collapsed-width',
    '--sn-sidebar-collapsed-item-size',
    '--sn-sidebar-collapsed-item-radius',
    '--sn-sidebar-collapsed-sections-padding',
    '--sn-chat-gap',
    '--sn-chat-transcript-padding',
    '--sn-chat-scroll-bottom',
    '--sn-chat-message-padding',
    '--sn-chat-tool-padding',
    '--sn-chat-code-padding',
    '--sn-chat-status-card-padding',
    '--sn-chat-status-card-gap',
    '--sn-chat-sidebar-width',
    '--sn-chat-sidebar-collapsed-width',
    '--sn-chat-sidebar-resize-hit-size',
    '--sn-chat-sidebar-header-gap',
    '--sn-chat-sidebar-header-padding',
    '--sn-chat-sidebar-header-min-height',
    '--sn-chat-sidebar-collapsed-header-padding',
    '--sn-chat-sidebar-collapsed-header-gap',
    '--sn-chat-sidebar-button-padding',
    '--sn-chat-sidebar-button-radius',
    '--sn-chat-sidebar-items-padding',
    '--sn-chat-sidebar-compact-label-min',
    '--sn-chat-sidebar-compact-label-ch-width',
    '--sn-chat-sidebar-compact-label-extra',
    '--sn-chat-sidebar-compact-label-max',
    '--sn-chat-sidebar-compact-delete-width',
    '--sn-chat-sidebar-row-gap',
    '--sn-chat-sidebar-row-padding',
    '--sn-chat-sidebar-row-min-height',
    '--sn-chat-sidebar-active-border-width',
    '--sn-chat-sidebar-active-padding-left',
    '--sn-chat-sidebar-group-divider-margin',
    '--sn-chat-sidebar-group-divider-padding',
    '--sn-chat-sidebar-group-divider-inset',
    '--sn-chat-sidebar-group-divider-width',
    '--sn-chat-sidebar-group-divider-height',
    '--sn-chat-sidebar-icon-box-size',
    '--sn-chat-sidebar-status-margin',
    '--sn-chat-sidebar-meta-margin',
    '--sn-chat-sidebar-type-padding',
    '--sn-chat-sidebar-type-radius',
    '--sn-chat-sidebar-delete-box-size',
    '--sn-chat-sidebar-delete-radius',
    '--sn-chat-sidebar-child-gap',
    '--sn-chat-sidebar-child-padding',
    '--sn-chat-sidebar-child-min-height',
    '--sn-chat-sidebar-child-line-left',
    '--sn-chat-sidebar-child-deep-padding-left',
    '--sn-chat-sidebar-child-active-padding-left',
    '--sn-chat-sidebar-child-deep-active-padding-left',
    '--sn-chat-sidebar-child-deep-line-left',
    '--sn-chat-sidebar-compact-label-inset',
    '--sn-chat-sidebar-compact-label-padding',
    '--sn-chat-sidebar-compact-label-offset',
    '--sn-chat-list-header-gap',
    '--sn-chat-list-header-min-height',
    '--sn-chat-list-header-padding',
    '--sn-chat-list-empty-icon-margin',
    '--sn-chat-list-items-padding',
    '--sn-chat-list-filter-gap',
    '--sn-chat-list-filter-padding',
    '--sn-chat-list-filter-button-padding',
    '--sn-chat-list-filter-button-radius',
    '--sn-chat-list-filter-button-min-height',
    '--sn-chat-list-item-padding',
    '--sn-chat-list-item-gap',
    '--sn-chat-list-item-active-border-width',
    '--sn-chat-list-item-active-padding-left',
    '--sn-chat-list-item-top-gap',
    '--sn-chat-list-item-nested-margin',
    '--sn-chat-list-item-nested-border-width',
    '--sn-chat-list-item-branch-top',
    '--sn-chat-list-item-branch-width',
    '--sn-chat-list-badge-padding',
    '--sn-chat-list-badge-radius',
    '--sn-chat-list-meta-gap',
    '--sn-chat-list-delete-padding',
    '--sn-composer-radius',
    '--sn-composer-padding',
    '--sn-composer-body-padding',
    '--sn-composer-control-gap',
    '--sn-composer-send-size',
    '--sn-composer-input-min-height',
    '--sn-composer-input-min-inline-size',
    '--sn-composer-input-padding',
    '--sn-composer-footer-gap',
    '--sn-composer-footer-padding',
    '--sn-composer-footer-btn-min-height',
    '--sn-composer-footer-btn-padding',
    '--sn-composer-collapsed-control-width',
    '--sn-composer-collapsed-control-padding',
    '--sn-composer-chip-gap',
    '--sn-composer-chip-padding',
    '--sn-composer-autocomplete-padding',
    '--sn-composer-autocomplete-item-padding',
    '--sn-composer-popup-inset',
    '--sn-composer-voice-label-max',
    '--sn-composer-wake-command-max',
    '--sn-composer-voice-command-max',
    '--sn-code-padding',
    '--sn-code-gutter-padding',
    '--sn-code-gutter-width',
    '--sn-code-markdown-padding',
    '--sn-code-table-cell-padding',
    '--sn-grid-size',
    '--sn-cell-size',
    '--sn-cell-min-radius',
    '--sn-cell-max-radius',
    '--sn-cell-step-ms',
    '--sn-cell-fade-rate',
    '--sn-socket-hit-size',
  ],
  motion: [
    '--sn-theme-motion-scale',
    '--sn-motion-enabled',
    '--sn-animation-play-state',
    '--sn-animation-duration-scale',
    '--sn-animation-duration-fast',
    '--sn-animation-duration-normal',
    '--sn-animation-duration-slow',
    '--sn-animation-duration-slower',
    '--sn-transition-fast',
    '--sn-transition-normal',
    '--sn-transition-slow',
    '--sn-transition-easing',
  ],
});

export const CASCADE_THEME_DESCRIPTOR = Object.freeze({
  name: 'cascade-theme',
  kind: 'runtime-theme-contract',
  description: 'Runtime cascade theme contract for agent-built Symbiote UI, graph canvases, layouts, scrollbars, and VR-ready panels.',
  entrypoint: 'symbiote-ui/themes/cascade-theme.js',
    exports: [
      'createCascadeTheme',
      'applyCascadeTheme',
      'normalizeCascadeThemeOptions',
      'resolveCascadeThemeRecipe',
      'serializeCascadeThemeBundle',
      'applyCascadeThemeBundle',
      'isCascadeThemeBundle',
      'resetCascadeThemeScopes',
      'readCascadeThemeScopeState',
      'persistCascadeThemeScopeState',
      'persistCascadeThemeScopeRegister',
      'seedCascadeThemeScopeState',
      'removeCascadeThemeScopeState',
      'resolveCascadeThemeScopeTarget',
      'applyCascadeThemeScope',
      'applyCascadeThemeScopes',
      'clearCascadeGeometryRegister',
      'applyCascadeGeometryRegister',
      'normalizeCascadeGeometryRegister',
      'getCascadeThemeVariantPreset',
      'getCascadeThemeControls',
      'getReadableTextForHsl',
      'normalizeCascadeTabShape',
      'normalizeCascadeThemeVariant',
      'resolveCascadeThemeVariantState',
    ],
  cascade: 'Apply once at :root, an app shell, or a subtree boundary. Components consume inherited --sn-* tokens through the CSS cascade.',
  controls: CASCADE_THEME_CONTROL_LIST,
  recipeModel: getCascadeThemeRecipeDescriptor(),
  tokenTargets: CASCADE_THEME_TOKEN_TARGETS,
  webmcp: {
    name: 'symbiote-ui.createCascadeTheme',
    description: 'Generate cascade theme tokens from bounded controls for agent-composed Symbiote UI and graph layouts.',
    inputSchema: {
      type: 'object',
      properties: {
        recipe: {
          type: 'string',
          enum: getCascadeThemeRecipeDescriptor().recipeNames,
          description: 'Optional relative theme recipe direction resolved before user/editor params.',
        },
        params: {
          type: 'object',
          additionalProperties: false,
          description: 'User/editor cascade controls applied over the selected recipe.',
          properties: Object.fromEntries(CASCADE_THEME_CONTROL_LIST.map((control) => [
            control.name,
            control.type === 'enum'
              ? { type: 'string', enum: control.values, default: control.default, description: control.description }
              : { type: 'number', minimum: control.min, maximum: control.max, default: control.default, description: control.description },
          ])),
        },
        relations: {
          type: 'object',
          additionalProperties: true,
          description: 'Relative relation modifiers such as surfaceLadder, stateLayers, typographyCurve, and graphDataPalette.',
        },
        overrides: {
          type: 'object',
          additionalProperties: { type: ['string', 'number'] },
          propertyNames: { pattern: '^--sn-[a-z0-9-]+$' },
          description: 'Bounded escape hatch for concrete --sn-* CSS custom properties.',
        },
        ...Object.fromEntries(CASCADE_THEME_CONTROL_LIST.map((control) => [
          control.name,
          control.type === 'enum'
            ? { type: 'string', enum: control.values, default: control.default, description: control.description }
            : { type: 'number', minimum: control.min, maximum: control.max, default: control.default, description: control.description },
        ])),
      },
      additionalProperties: false,
    },
    annotations: {
      title: 'Create Symbiote cascade theme',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    visibility: 'agent-readable',
    permissions: ['theme:read', 'theme:compose'],
  },
});

const CASCADE_TOKEN_TARGET_CLASSIFIERS = [
  { group: 'color', pattern: /^--sn-(theme-|hue-|lit-|sys-|bg|panel-bg|layout-bg|node-bg|surface|text|text-dim|cat-|type-|graph-type-|canvas-graph-|tab|tabs|button|cell|chat-bg|chat-message|chat-user|chat-agent|composer-bg|composer-action|composer-send|syntax-|field-|tree-|data-table|list-|card|banner|badge|source|ctx-|xr-)/ },
  { group: 'outline', pattern: /^--sn-(theme-outline|outline|node-border|shape-|conn-|pseudo-conn|plus-indicator|layout-border|layout-resizer|ctx-border|composer-border|effect-focus|panel-menu-border|card-border|field-control-border)/ },
  { group: 'typography', pattern: /-(size|font-size)$/ },
  { group: 'motion', pattern: /^--sn-(theme-motion-scale|transition-)/ },
  { group: 'density', pattern: /-(padding|gap|height|width|size|radius|margin|inset|offset|extra|min|top|left|step-ms|fade-rate|line-left|ch-width|hit-size)$/ },
];

function cloneTokenTargets(tokenTargets) {
  return Object.fromEntries(
    Object.entries(tokenTargets).map(([group, tokens]) => [group, Array.from(new Set(tokens))])
  );
}

function getTokenTargetGroup(token) {
  for (let [group, tokens] of Object.entries(CASCADE_THEME_TOKEN_TARGETS)) {
    if (tokens.includes(token)) return group;
  }
  return CASCADE_TOKEN_TARGET_CLASSIFIERS.find((item) => item.pattern.test(token))?.group || 'density';
}

function completeCascadeThemeDescriptor(tokens = {}) {
  let tokenTargets = cloneTokenTargets(CASCADE_THEME_TOKEN_TARGETS);
  for (let token of Object.keys(tokens)) {
    let group = getTokenTargetGroup(token);
    tokenTargets[group] ||= [];
    if (!tokenTargets[group].includes(token)) tokenTargets[group].push(token);
  }
  for (let group of Object.keys(tokenTargets)) {
    tokenTargets[group] = Array.from(new Set(tokenTargets[group])).sort();
  }
  return Object.freeze({
    ...CASCADE_THEME_DESCRIPTOR,
    controls: CASCADE_THEME_CONTROL_LIST.map((control) => ({ ...control })),
    tokenTargets,
  });
}

function finiteNumber(value, fallback) {
  let number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback = min) {
  let number = finiteNumber(value, fallback);
  return Math.min(max, Math.max(min, number));
}

function percent(value) {
  return `${value}%`;
}

function typeToken(px) {
  return `calc(${px}px * var(--sn-theme-type-scale))`;
}

function headingToken(px) {
  return `calc(${px}px * var(--sn-theme-type-scale) * var(--sn-theme-heading-scale))`;
}

function hueRotate(hue, offset) {
  return String((((finiteNumber(hue, CASCADE_THEME_DEFAULTS.hue) + finiteNumber(offset, 0)) % 360) + 360) % 360);
}

function densityToken(px) {
  return `calc(${px}px * var(--sn-theme-density))`;
}

function radiusToken(px) {
  return `calc(${px}px * var(--sn-theme-density) * var(--sn-theme-radius-scale))`;
}

function svgStrokeToken(px, outlineStrength) {
  let defaultOutlineStrength = CASCADE_THEME_OUTLINE_BASE / 100;
  let scale = defaultOutlineStrength <= 0 ? outlineStrength : outlineStrength / defaultOutlineStrength;
  return (px * scale).toFixed(2);
}

function hslToRgb(hue, saturation, lightness) {
  let h = (((finiteNumber(hue, CASCADE_THEME_DEFAULTS.hue) % 360) + 360) % 360) / 360;
  let s = clamp(saturation, 0, 100, 0) / 100;
  let l = clamp(lightness, 0, 100, 0) / 100;

  if (s === 0) {
    let value = l * 255;
    return [value, value, value];
  }

  let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  let p = 2 * l - q;
  let channel = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255];
}

function relativeLuminance(rgb) {
  let channels = rgb.map((channel) => {
    let value = clamp(Math.round(channel), 0, 255, 0) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(a, b) {
  let lighter = Math.max(a, b);
  let darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getReadableTextForHsl(hue, saturation, lightness, preferredLightness) {
  let bgLum = relativeLuminance(hslToRgb(hue, saturation, lightness));
  let safeLightness = clamp(lightness, 0, 100, 50);
  let preferred = finiteNumber(preferredLightness, safeLightness > 50 ? 8 : 98);
  let createCandidate = (candidateLightness) => {
    let luminance = relativeLuminance(hslToRgb(0, 0, candidateLightness));
    return {
      hue: 0,
      saturation: 0,
      lightness: candidateLightness,
      luminance,
      ratio: contrastRatio(bgLum, luminance),
    };
  };
  let candidates = [preferred, 7.5, 98].map(createCandidate);
  let winner = candidates.sort((a, b) => b.ratio - a.ratio)[0];
  let direction = winner.luminance <= bgLum ? -1 : 1;
  let lightnessTenths = Math.round(winner.lightness * 10);
  while (winner.ratio < CASCADE_THEME_READABLE_TEXT_CONTRAST_TARGET) {
    lightnessTenths += direction;
    if (lightnessTenths < 0 || lightnessTenths > 1000) break;
    winner = createCandidate(lightnessTenths / 10);
  }
  return `hsl(${winner.hue} ${winner.saturation}% ${winner.lightness.toFixed(1)}%)`;
}

export function getCascadeThemeControls() {
  return CASCADE_THEME_CONTROL_LIST.map((control) => ({ ...control }));
}

export function normalizeCascadeThemeVariant(value) {
  return CASCADE_THEME_VARIANTS.includes(value) ? value : CASCADE_THEME_DEFAULTS.themeVariant;
}

export function normalizeCascadeTabShape(value) {
  return CASCADE_THEME_TAB_SHAPES.includes(value) ? value : CASCADE_THEME_DEFAULTS.tabShape;
}

export function getCascadeThemeVariantPreset(variant) {
  let normalized = normalizeCascadeThemeVariant(variant);
  return { ...CASCADE_THEME_VARIANT_PRESETS[normalized] };
}

export function resolveCascadeThemeVariantState(variant, overrides = {}) {
  let normalized = normalizeCascadeThemeVariant(variant);
  return normalizeCascadeThemeOptions({
    ...getCascadeThemeVariantPreset(normalized),
    ...(overrides && typeof overrides === 'object' ? overrides : {}),
    themeVariant: normalized,
  });
}

function hasExplicitCascadeParam(input, key) {
  if (!input || typeof input !== 'object') return false;
  return input?.theme?.params?.[key] !== undefined
    || input?.params?.[key] !== undefined
    || input[key] !== undefined;
}

function applyVariantDefaults(params, input) {
  let variant = normalizeCascadeThemeVariant(params.themeVariant);
  let preset = CASCADE_THEME_VARIANT_PRESETS[variant] || CASCADE_THEME_VARIANT_PRESETS.modern;
  let merged = { ...params, themeVariant: variant };
  for (let [key, value] of Object.entries(preset)) {
    if (key === 'themeVariant') continue;
    if (!hasExplicitCascadeParam(input, key)) merged[key] = value;
  }
  merged.tabShape = normalizeCascadeTabShape(merged.tabShape);
  return merged;
}

export const CASCADE_BUNDLE_VERSION = 1;
const CASCADE_BUNDLE_NAMED_MARKER = '::win::';
export const CASCADE_THEME_REGISTER_STORAGE_SUFFIX = '::geometry-register';
const CASCADE_BUNDLE_REGISTER_SUFFIX = CASCADE_THEME_REGISTER_STORAGE_SUFFIX;

function getCascadeThemeStorage() {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  return null;
}

function parseStoredState(value) {
  if (!value) return null;
  try {
    let parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    void error;
    return null;
  }
}

function scopeStorageKey(scope) {
  if (typeof scope === 'string') return scope;
  return scope?.storageKey || '';
}

export function normalizeCascadeGeometryRegister(register) {
  if (register === 'default') return '';
  return GEOMETRY_PROFILE_NAMES.includes(register) ? register : '';
}

export function isCascadeThemeBundle(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && value.version === CASCADE_BUNDLE_VERSION
    && value.scopes
    && typeof value.scopes === 'object'
  );
}

export function serializeCascadeThemeBundle(scopeDefs, options = {}) {
  let storage = options.storage || getCascadeThemeStorage();
  let namedMarker = options.namedMarker || CASCADE_BUNDLE_NAMED_MARKER;
  let scopes = {};
  let named = {};
  if (!storage) return { version: CASCADE_BUNDLE_VERSION, scopes, named };

  let readRegister = (key) => {
    try {
      return storage.getItem(key + CASCADE_BUNDLE_REGISTER_SUFFIX) || '';
    } catch (error) {
      void error;
      return '';
    }
  };

  for (let scopeDef of scopeDefs || []) {
    if (!scopeDef || !scopeDef.id || !scopeDef.storageKey) continue;
    let stored;
    try {
      stored = parseStoredState(storage.getItem(scopeDef.storageKey));
    } catch (error) {
      void error;
      stored = null;
    }
    let register = readRegister(scopeDef.storageKey);
    if (!stored) {
      let hasDefault = scopeDef.defaultState !== undefined || options.defaultState !== undefined;
      if (!hasDefault) continue;
      let fallback = readScopeDefaultState(scopeDef, options.defaultState);
      scopes[scopeDef.id] = {
        ...fallback.state,
        register: register || fallback.register,
      };
      continue;
    }
    scopes[scopeDef.id] = {
      ...normalizeCascadeThemeOptions(stored),
      register,
    };
  }

  let keys = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      let key = storage.key(index);
      if (typeof key === 'string') keys.push(key);
    }
  } catch (error) {
    void error;
  }

  for (let key of keys) {
    if (!key.includes(namedMarker)) continue;
    if (key.endsWith(CASCADE_BUNDLE_REGISTER_SUFFIX)) continue;
    let stored;
    try {
      stored = parseStoredState(storage.getItem(key));
    } catch (error) {
      void error;
      stored = null;
    }
    if (!stored) continue;
    let name = key.slice(key.indexOf(namedMarker) + namedMarker.length);
    named[name] = {
      ...normalizeCascadeThemeOptions(stored),
      register: readRegister(key),
    };
  }

  return { version: CASCADE_BUNDLE_VERSION, scopes, named };
}

export function applyCascadeThemeBundle(bundle, scopeDefs, options = {}) {
  if (!isCascadeThemeBundle(bundle)) return;
  let storage = options.storage || getCascadeThemeStorage();
  let namedMarker = options.namedMarker || CASCADE_BUNDLE_NAMED_MARKER;
  let namedStorageBase = options.namedStorageBase || '';
  let applyState = typeof options.applyState === 'function' ? options.applyState : null;
  let resolveScopeTarget = typeof options.resolveScopeTarget === 'function'
    ? options.resolveScopeTarget
    : (scopeDef) => scopeDef?.selector;
  let resolveNamed = typeof options.resolveNamed === 'function' ? options.resolveNamed : null;

  let persist = (storageKey, entry) => {
    if (!storage || !storageKey) return;
    let { register, ...params } = entry || {};
    try {
      storage.setItem(storageKey, JSON.stringify(params));
      storage.setItem(storageKey + CASCADE_BUNDLE_REGISTER_SUFFIX, register || '');
    } catch (error) {
      void error;
    }
  };

  let runApply = (target, entry) => {
    if (!applyState || target == null) return;
    let { register, ...params } = entry || {};
    try {
      applyState(target, params);
      applyCascadeGeometryRegister(target, register);
    } catch (error) {
      void error;
    }
  };

  for (let [id, entry] of Object.entries(bundle.scopes || {})) {
    let scopeDef = (scopeDefs || []).find((def) => def && def.id === id);
    if (!scopeDef) continue;
    persist(scopeDef.storageKey, entry);
    runApply(resolveScopeTarget(scopeDef), entry);
  }

  for (let [name, entry] of Object.entries(bundle.named || {})) {
    let storageKey = namedStorageBase + namedMarker + name;
    persist(storageKey, entry);
    let targets = resolveNamed ? resolveNamed(name) : null;
    for (let target of targets || []) {
      runApply(target, entry);
    }
  }
}

export function clearCascadeThemeInlineTokens(element) {
  if (!element?.style) return;
  for (let prop of Array.from(element.style)) {
    if (prop.startsWith('--sn')) element.style.removeProperty(prop);
  }
  element.removeAttribute?.('data-cascade-theme-variant');
  element.removeAttribute?.('data-cascade-tab-shape');
}

export function clearCascadeGeometryRegister(element) {
  if (!element?.style) return;
  for (let token of Object.keys(geometryRegisterScaleTokens('product'))) {
    element.style.removeProperty(token);
  }
}

export function applyCascadeGeometryRegister(element, register) {
  clearCascadeGeometryRegister(element);
  let normalized = normalizeCascadeGeometryRegister(register);
  if (!normalized) return '';
  for (let [token, value] of Object.entries(geometryRegisterScaleTokens(normalized))) {
    element.style.setProperty(token, value);
  }
  return normalized;
}

function removeCascadeThemeStorage(storage, storageKey) {
  if (!storage || !storageKey) return;
  try {
    storage.removeItem(storageKey);
    storage.removeItem(storageKey + CASCADE_BUNDLE_REGISTER_SUFFIX);
  } catch (error) {
    void error;
  }
}

function readScopeDefaultState(scope, fallback) {
  let raw = scope?.defaultState || fallback || CASCADE_THEME_DEFAULTS;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    let { register, ...params } = raw;
    return {
      state: normalizeCascadeThemeOptions(params),
      register: normalizeCascadeGeometryRegister(register),
    };
  }
  return { state: normalizeCascadeThemeOptions(raw), register: '' };
}

function defaultResolveThemeTarget(scope, doc) {
  if (!doc) return null;
  if (scope?.selector) return doc.querySelector(scope.selector);
  return doc.documentElement;
}

export function readCascadeThemeScopeState(scope, options = {}) {
  let storage = options.storage || getCascadeThemeStorage();
  let storageKey = scopeStorageKey(scope);
  let stored = null;
  if (storage && storageKey) {
    try {
      stored = parseStoredState(storage.getItem(storageKey));
    } catch (error) {
      void error;
    }
  }
  let base = stored
    ? readScopeDefaultState({ defaultState: stored }, options.defaultState)
    : readScopeDefaultState(scope, options.defaultState);
  let register = base.register;
  if (storage && storageKey) {
    try {
      let rawRegister = storage.getItem(storageKey + CASCADE_BUNDLE_REGISTER_SUFFIX);
      if (rawRegister !== null) register = normalizeCascadeGeometryRegister(rawRegister);
    } catch (error) {
      void error;
    }
  }
  return { ...base.state, register };
}

export function persistCascadeThemeScopeState(scope, state = {}, options = {}) {
  let storage = options.storage || getCascadeThemeStorage();
  let storageKey = scopeStorageKey(scope);
  if (!storage || !storageKey) return readCascadeThemeScopeState(scope, options);
  let source = state && typeof state === 'object' ? state : {};
  let { register, ...params } = source;
  let normalized = normalizeCascadeThemeOptions(params);
  try {
    storage.setItem(storageKey, JSON.stringify(normalized));
    if ('register' in source) {
      storage.setItem(storageKey + CASCADE_BUNDLE_REGISTER_SUFFIX, normalizeCascadeGeometryRegister(register));
    }
  } catch (error) {
    void error;
  }
  return 'register' in source
    ? { ...normalized, register: normalizeCascadeGeometryRegister(register) }
    : readCascadeThemeScopeState(scope, options);
}

export function persistCascadeThemeScopeRegister(scope, register, options = {}) {
  let storage = options.storage || getCascadeThemeStorage();
  let storageKey = scopeStorageKey(scope);
  let normalized = normalizeCascadeGeometryRegister(register);
  if (!storage || !storageKey) return normalized;
  try {
    storage.setItem(storageKey + CASCADE_BUNDLE_REGISTER_SUFFIX, normalized);
  } catch (error) {
    void error;
  }
  return normalized;
}

export function seedCascadeThemeScopeState(scope, options = {}) {
  let storage = options.storage || getCascadeThemeStorage();
  let storageKey = scopeStorageKey(scope);
  let fallback = readScopeDefaultState(scope, options.defaultState);
  if (!storage || !storageKey) return { ...fallback.state, register: fallback.register };
  let stored = null;
  try {
    stored = parseStoredState(storage.getItem(storageKey));
    if (!stored) storage.setItem(storageKey, JSON.stringify(fallback.state));
    if (storage.getItem(storageKey + CASCADE_BUNDLE_REGISTER_SUFFIX) === null && fallback.register) {
      storage.setItem(storageKey + CASCADE_BUNDLE_REGISTER_SUFFIX, fallback.register);
    }
  } catch (error) {
    void error;
  }
  return readCascadeThemeScopeState(scope, { ...options, storage });
}

export function removeCascadeThemeScopeState(scope, options = {}) {
  let storage = options.storage || getCascadeThemeStorage();
  removeCascadeThemeStorage(storage, scopeStorageKey(scope));
}

export function resolveCascadeThemeScopeTarget(scope, options = {}) {
  let doc = options.document || (typeof document !== 'undefined' ? document : null);
  return defaultResolveThemeTarget(scope, doc);
}

export function applyCascadeThemeScope(scope, options = {}) {
  let target = options.target || resolveCascadeThemeScopeTarget(scope, options);
  if (!target) return null;
  let rawState = options.state
    ? { ...options.state }
    : readCascadeThemeScopeState(scope, options);
  let { register, ...params } = rawState;
  let theme = applyCascadeTheme(target, normalizeCascadeThemeOptions(params), {
    notify: options.notify ?? false,
    source: options.source || 'theme-scope',
    targetSelector: scope?.selector,
    ...(options.eventOptions || {}),
  });
  let normalizedRegister = applyCascadeGeometryRegister(target, register);
  if (options.persist) {
    persistCascadeThemeScopeState(scope, { ...theme.state, register: normalizedRegister }, options);
  }
  return {
    scope,
    target,
    state: theme.state,
    register: normalizedRegister,
    theme,
  };
}

export function applyCascadeThemeScopes(scopeDefs = [], options = {}) {
  let results = [];
  for (let scope of scopeDefs || []) {
    let result = applyCascadeThemeScope(scope, options);
    if (result) results.push(result);
  }
  return results;
}

export function resetCascadeThemeScopes(scopeDefs = [], options = {}) {
  let doc = options.document || (typeof document !== 'undefined' ? document : null);
  let storage = options.storage || getCascadeThemeStorage();
  let source = options.source || 'reset';
  void source;
  let fallbackState = options.defaultState || CASCADE_THEME_DEFAULTS;
  let scopes = Array.isArray(scopeDefs) && scopeDefs.length
    ? scopeDefs
    : [{ id: 'default', selector: options.activeSelector || '', storageKey: options.activeStorageKey || '', defaultState: fallbackState }];
  let resolveScopeTarget = typeof options.resolveScopeTarget === 'function'
    ? options.resolveScopeTarget
    : (scope) => defaultResolveThemeTarget(scope, doc);
  let isNamedScope = typeof options.isNamedScope === 'function' ? options.isNamedScope : () => false;
  let namedSelector = options.namedSelector || '[data-theme-key]';
  let appliedTargets = new Set();
  let keptScopes = [];
  let activeState = null;
  let activeRegister = '';
  let resetScopes = [];

  for (let scope of scopes) {
    if (!scope) continue;
    let target = resolveScopeTarget(scope);
    if (isNamedScope(scope)) {
      clearCascadeThemeInlineTokens(target);
      removeCascadeThemeStorage(storage, scope.storageKey);
      continue;
    }
    keptScopes.push(scope);
    let { state, register } = readScopeDefaultState(scope, fallbackState);
    if (target) {
      appliedTargets.add(target);
      clearCascadeThemeInlineTokens(target);
      let theme = applyCascadeTheme(target, state, { notify: false });
      if (register) applyCascadeGeometryRegister(target, register);
      resetScopes.push({ scope, target, state: theme.state, register, theme });
    }
    if (
      (options.activeId && scope.id === options.activeId)
      || (options.activeStorageKey && scope.storageKey === options.activeStorageKey)
      || (options.activeSelector && scope.selector === options.activeSelector)
      || (!activeState && !options.activeId && !options.activeStorageKey && !options.activeSelector)
    ) {
      activeState = state;
      activeRegister = register;
    }
    removeCascadeThemeStorage(storage, scope.storageKey);
  }

  if (doc && namedSelector) {
    for (let target of doc.querySelectorAll(namedSelector)) {
      if (appliedTargets.has(target)) continue;
      clearCascadeThemeInlineTokens(target);
      removeCascadeThemeStorage(storage, target.dataset?.themeKey);
    }
  }

  if (options.clearStorage === true && storage) {
    try { storage.clear(); } catch (error) { void error; }
  }

  return {
    activeState: activeState || resetScopes[0]?.state || normalizeCascadeThemeOptions(fallbackState),
    activeRegister,
    appliedTargets,
    keptScopes,
    resetScopes,
  };
}

export function normalizeCascadeThemeOptions(options = {}) {
  let resolved = resolveCascadeThemeRecipe(options);
  let merged = applyVariantDefaults({ ...CASCADE_THEME_DEFAULTS, ...resolved.params }, options);
  let mode = merged.mode === 'light' ? 'light' : 'dark';
  let bgLightness = finiteNumber(merged.bgLightness, CASCADE_THEME_DEFAULTS.bgLightness);
  let surfaceLightness = finiteNumber(merged.surfaceLightness, CASCADE_THEME_DEFAULTS.surfaceLightness);
  let accentLightness = finiteNumber(merged.accentLightness, CASCADE_THEME_DEFAULTS.accentLightness);
  let accentChroma = finiteNumber(merged.accentChroma, CASCADE_THEME_DEFAULTS.accentChroma);
  return {
    themeVariant: normalizeCascadeThemeVariant(merged.themeVariant),
    tabShape: normalizeCascadeTabShape(merged.tabShape),
    mode,
    brightness: clamp(merged.brightness, 0, 100, CASCADE_THEME_DEFAULTS.brightness),
    contrast: clamp(merged.contrast, 0, 100, CASCADE_THEME_DEFAULTS.contrast),
    chroma: clamp(merged.chroma, 0, 100, CASCADE_THEME_DEFAULTS.chroma),
    hue: clamp(merged.hue, 0, 360, CASCADE_THEME_DEFAULTS.hue),
    bgLightness: bgLightness >= 0 ? clamp(bgLightness, 0, 100, CASCADE_THEME_DEFAULTS.bgLightness) : -1,
    surfaceLightness: surfaceLightness >= 0 ? clamp(surfaceLightness, 0, 100, CASCADE_THEME_DEFAULTS.surfaceLightness) : -1,
    accentLightness: accentLightness >= 0 ? clamp(accentLightness, 0, 100, CASCADE_THEME_DEFAULTS.accentLightness) : -1,
    accentChroma: accentChroma >= 0 ? clamp(accentChroma, 0, 100, CASCADE_THEME_DEFAULTS.accentChroma) : -1,
    pattern: clamp(merged.pattern, 0, 100, CASCADE_THEME_DEFAULTS.pattern),
    outline: clamp(merged.outline, 0, 100, CASCADE_THEME_DEFAULTS.outline),
    type: clamp(merged.type, 80, 130, CASCADE_THEME_DEFAULTS.type),
    heading: clamp(merged.heading, 80, 140, CASCADE_THEME_DEFAULTS.heading),
    density: clamp(merged.density, 75, 140, CASCADE_THEME_DEFAULTS.density),
    radius: clamp(merged.radius, 0, 100, CASCADE_THEME_DEFAULTS.radius),
    tabRadius: clamp(merged.tabRadius, 0, 100, CASCADE_THEME_DEFAULTS.tabRadius),
    cellRadius: clamp(merged.cellRadius, 0, 100, CASCADE_THEME_DEFAULTS.cellRadius),
    composerRadius: clamp(merged.composerRadius, 0, 100, CASCADE_THEME_DEFAULTS.composerRadius),
    scrollShadow: clamp(merged.scrollShadow, 0, 48, CASCADE_THEME_DEFAULTS.scrollShadow),
    frameRadius: clamp(merged.frameRadius, 0, 200, CASCADE_THEME_DEFAULTS.frameRadius),
    frameGap: clamp(merged.frameGap, 0, 20, CASCADE_THEME_DEFAULTS.frameGap),
    motion: clamp(merged.motion, 0, 200, CASCADE_THEME_DEFAULTS.motion),
  };
}

export function createCascadeTheme(options = {}) {
  let resolvedRecipe = resolveCascadeThemeRecipe(options);
  let state = normalizeCascadeThemeOptions(options);
  resolvedRecipe = { ...resolvedRecipe, params: state };
  let dark = state.mode === 'dark';
  let outlineStrength = state.outline / 100;
  let typeScale = state.type / 100;
  let headingScale = state.heading / 100;
  let densityScale = state.density / 100;
  let radiusScale = state.radius / CASCADE_THEME_RADIUS_BASE;
  let tabRadiusScale = state.tabRadius / CASCADE_THEME_TAB_RADIUS_BASE;
  let cellRadiusScale = state.cellRadius / CASCADE_THEME_CELL_RADIUS_BASE;
  let composerRadiusScale = state.composerRadius / 100;
  // frameRadius is a 0-200 dial referenced to 100 = the provider baseline (panels round
  // 12px * radius-scale). At the default (100) the emitted frame
  // tokens equal the provider's, so existing layouts are unchanged; 0 flattens, 200 doubles.
  let frameFactor = state.frameRadius / 100;
  let frameGapPx = state.frameGap;
  let frameRadiusCss = `calc(12px * var(--sn-theme-radius-scale, 1) * ${frameFactor.toFixed(3)})`;
  // padding only grows once panels round BEYOND the provider baseline, so default panels
  // keep their original (zero) content inset.
  let frameInsetCss = `calc(max(0px, ${frameRadiusCss} - 12px) * 0.7)`;
  let tabIsEar = state.tabShape === 'ear' || state.tabShape === 'classic-ear';
  let tabIsClassicEar = state.tabShape === 'classic-ear';
  let tabRadiusCss = `calc(8px * var(--sn-theme-density, 1) * ${tabRadiusScale.toFixed(3)})`;
  let tabShapeRadius = tabIsEar ? `${tabRadiusCss} ${tabRadiusCss} 0 0` : tabRadiusCss;
  let activeTabBorder = state.outline === 0
    ? 'transparent'
    : 'color-mix(in oklab, var(--tab-accent, var(--sn-tabs-accent)) 44%, transparent)';
  let motionScale = state.motion / 100;
  let patternScale = state.pattern / 100;
  let motionEnabled = motionScale > 0;
  let bg = dark
    ? 10 + state.brightness * 0.18
    : 98 - state.brightness * 0.32;
  if (state.bgLightness >= 0) bg = state.bgLightness; // explicit background lightness (full 0-100, reaches black/white)
  let surface = dark
    ? Math.min(34, bg + 3 + (state.contrast - 58) * 0.05)
    : Math.max(72, bg - 4 - state.contrast * 0.10);
  if (state.surfaceLightness >= 0) surface = state.surfaceLightness; // explicit panel / accent-background lightness
  let text = dark
    ? Math.min(98, Math.max(72, 94 + (state.contrast - 58) * 0.12))
    : Math.max(8, 34 - state.contrast * 0.26);
  let dim = dark
    ? Math.min(78, Math.max(46, 60 + (state.contrast - 58) * 0.18))
    : Math.max(24, 66 - state.contrast * 0.22);
  let hover = dark
    ? Math.min(58, Math.max(18, 27 + (state.contrast - 58) * 0.10))
    : Math.max(42, surface - 8 - state.contrast * 0.12);
  let accentLight = dark
    ? Math.min(72, Math.max(48, 63 + (state.contrast - 58) * 0.12))
    : Math.max(36, 62 - state.contrast * 0.10);
  if (state.accentLightness >= 0) accentLight = state.accentLightness; // explicit accent lightness (vivid dark/light accents, full contrast)
  let dataLight = dark
    ? Math.max(34, accentLight - 21)
    : Math.max(34, accentLight - 10);
  let actionLight = dark
    ? Math.min(82, accentLight + 15)
    : Math.max(42, accentLight - 4);
  let semanticHues = {
    accent: hueRotate(state.hue, 0),
    success: hueRotate(state.hue, -96),
    warning: hueRotate(state.hue, 178),
    danger: hueRotate(state.hue, 146),
    data: hueRotate(state.hue, -30),
  };
  let neutralChroma = percent(state.chroma);
  let accentChromaNum = state.accentChroma >= 0 ? state.accentChroma : state.chroma; // accent-only saturation override
  let accentChromaPct = percent(accentChromaNum);
  let bgColor = `hsl(0 0% ${bg.toFixed(1)}%)`;
  let panelColor = `hsl(0 0% ${surface.toFixed(1)}%)`;
  let textColor = `hsl(0 0% ${text.toFixed(1)}%)`;
  let textDimColor = `hsl(0 0% ${dim.toFixed(1)}%)`;
  let accent = `hsl(${state.hue} ${accentChromaPct} ${accentLight}%)`;
  let accentSoft = `hsl(${state.hue} ${accentChromaPct} ${accentLight}% / 0.18)`;
  let primaryButtonColor = getReadableTextForHsl(state.hue, accentChromaNum, accentLight, text);
  let successButtonColor = getReadableTextForHsl(122, state.chroma, 57, text);
  let dangerButtonColor = getReadableTextForHsl(4, state.chroma, 58, text);
  let typeAction = `hsl(${semanticHues.danger} ${neutralChroma} ${actionLight.toFixed(1)}%)`;
  let typeOutput = `hsl(${semanticHues.success} ${neutralChroma} 65%)`;
  let typeData = `hsl(${semanticHues.accent} ${neutralChroma} ${Math.min(86, accentLight + 11).toFixed(1)}%)`;
  let typeConfig = `hsl(${semanticHues.warning} ${neutralChroma} 68%)`;
  let typeExternal = `hsl(${semanticHues.data} ${neutralChroma} 76%)`;
  let typeStyle = `hsl(${hueRotate(semanticHues.danger, 315)} ${neutralChroma} 78%)`;
  let typeDocs = `hsl(0 0% ${Math.min(90, text - 13).toFixed(1)}%)`;
  let typeAsset = `hsl(${hueRotate(semanticHues.accent, -40)} ${neutralChroma} 74%)`;
  let typeGroup = `hsl(${hueRotate(semanticHues.warning, 8)} ${neutralChroma} 67%)`;
  let outlineAlpha = state.outline === 0
    ? 0
    : dark
      ? 0.02 + outlineStrength * 0.21
      : 0.04 + outlineStrength * 0.28;
  let outlineLit = dark
    ? Math.min(62, text - 10 + outlineStrength * 28)
    : Math.max(32, text + 42 - outlineStrength * 26);
  let outlineColor = `hsl(0 0% ${outlineLit.toFixed(1)}% / ${outlineAlpha.toFixed(3)})`;
  let softOutlineColor = `hsl(0 0% ${text.toFixed(1)}% / ${(outlineAlpha * 0.55).toFixed(3)})`;
  let nodeBorderWidth = `${(1 + outlineStrength).toFixed(2)}px`;
  let focusRingWidth = `${(1 + outlineStrength * 2).toFixed(1)}px`;
  let shapeStrokeWidth = svgStrokeToken(0.4, outlineStrength);
  let shapePortHintStrokeWidth = svgStrokeToken(0.5, outlineStrength);
  let connectionWidth = (1.5 + outlineStrength * 0.8).toFixed(2);
  let connectionHoverWidth = (2.4 + outlineStrength * 1.2).toFixed(2);
  let gridDotAlpha = dark
    ? 0.018 + patternScale * 0.070
    : 0.026 + patternScale * 0.078;
  let cellBaseAlpha = dark
    ? 0.012 + patternScale * 0.035
    : 0.010 + patternScale * 0.025;
  let cellAlphaSpan = dark
    ? 0.070 + patternScale * 0.105
    : 0.050 + patternScale * 0.075;
  let chatCellBaseAlpha = dark ? 0.012 : 0.010;
  let chatCellAlphaSpan = dark ? 0.070 : 0.050;
  let cellGlareAlpha = dark ? 0.019 : 0.066;
  let cellNoiseOpacity = dark ? 0.030 : 0.021;

  let tokens = {
    'color-scheme': dark ? 'dark' : 'light',
    '--sn-theme-variant': state.themeVariant,
    '--sn-tabs-shape': state.tabShape,
    '--sn-theme-name': 'cascade-theme',
    '--sn-theme-hue': String(state.hue),
    '--sn-theme-chroma': neutralChroma,
    '--sn-theme-bg-lightness': `${bg.toFixed(1)}%`,
    '--sn-theme-surface-lightness': `${surface.toFixed(1)}%`,
    '--sn-theme-text-lightness': `${text.toFixed(1)}%`,
    '--sn-theme-outline-strength': outlineStrength.toFixed(2),
    '--sn-theme-type-scale': typeScale.toFixed(2),
    '--sn-theme-heading-scale': headingScale.toFixed(2),
    '--sn-theme-density': densityScale.toFixed(2),
    '--sn-theme-spacing-scale': densityScale.toFixed(2),
    '--sn-theme-radius-scale': radiusScale.toFixed(2),
    '--sn-theme-tab-radius-scale': tabRadiusScale.toFixed(2),
    '--sn-theme-cell-radius-scale': cellRadiusScale.toFixed(2),
    '--sn-theme-composer-radius-scale': composerRadiusScale.toFixed(2),
    '--sn-theme-frame-radius-scale': frameFactor.toFixed(2),
    '--sn-frame-radius': frameRadiusCss,
    '--sn-frame-inset': frameInsetCss,
    '--sn-frame-gap': `${frameGapPx.toFixed(1)}px`,
    '--sn-theme-elevation-scale': '1',
    '--sn-theme-pattern-brightness': patternScale.toFixed(2),
    '--sn-theme-motion-scale': motionScale.toFixed(2),
    '--sn-motion-enabled': motionEnabled ? '1' : '0',
    '--sn-animation-play-state': motionEnabled ? 'running' : 'paused',
    '--sn-animation-duration-scale': motionScale.toFixed(2),
    '--sn-animation-duration-fast': `${Math.round(600 * motionScale)}ms`,
    '--sn-animation-duration-normal': `${Math.round(1000 * motionScale)}ms`,
    '--sn-animation-duration-slow': `${Math.round(1500 * motionScale)}ms`,
    '--sn-animation-duration-slower': `${Math.round(2000 * motionScale)}ms`,
    '--sn-transition-fast': `${Math.round(120 * motionScale)}ms`,
    '--sn-transition-normal': `${Math.round(240 * motionScale)}ms`,
    '--sn-transition-slow': `${Math.round(400 * motionScale)}ms`,
    '--sn-transition-easing': motionEnabled ? 'ease' : 'linear',
    '--sn-hue-accent': semanticHues.accent,
    '--sn-hue-success': semanticHues.success,
    '--sn-hue-warning': semanticHues.warning,
    '--sn-hue-danger': semanticHues.danger,
    '--sn-hue-data': semanticHues.data,
    '--sn-lit-hover': `${hover.toFixed(1)}%`,
    '--sn-lit-text-dim': `${dim.toFixed(1)}%`,
    '--sn-lit-accent': `${accentLight.toFixed(1)}%`,
    '--sn-sys-surface': bgColor,
    '--sn-sys-surface-panel': panelColor,
    '--sn-sys-surface-sunken': 'var(--sn-sys-surface)',
    '--sn-sys-surface-raised': 'var(--sn-sys-surface-panel)',
    '--sn-bg-overlay': dark ? 'hsl(0 0% 0% / 0.45)' : 'hsl(0 0% 100% / 0.55)',
    '--sn-shadow-color': dark
      ? 'hsl(0 0% 0% / 0.40)'
      : 'hsl(0 0% 0% / 0.16)',
    '--sn-shadow-sm': '0 1px calc(4px * var(--sn-theme-elevation-scale)) hsl(0 0% 0% / 0.22)',
    '--sn-shadow-md': '0 2px calc(8px * var(--sn-theme-elevation-scale)) hsl(0 0% 0% / 0.28)',
    '--sn-shadow-lg': '0 6px calc(18px * var(--sn-theme-elevation-scale)) hsl(0 0% 0% / 0.28)',
    '--sn-shadow-xl': '0 -8px calc(28px * var(--sn-theme-elevation-scale)) hsl(0 0% 0% / 0.32)',
    '--sn-chat-item-child-shadow': '2px 0 4px color-mix(in oklab, var(--sn-sys-surface) 70%, transparent)',
    '--sn-layout-drawer-shadow': 'var(--sn-shadow-xl)',
    '--sn-grid-dot': `hsl(0 0% ${text.toFixed(1)}% / ${gridDotAlpha.toFixed(3)})`,
    '--sn-grid-size': '20px',
    '--sn-cell-bg': 'var(--sn-sys-surface)',
    '--sn-cell-dot': `hsl(0 0% ${dim.toFixed(1)}%)`,
    '--sn-cell-base-alpha': cellBaseAlpha.toFixed(3),
    '--sn-cell-alpha-span': cellAlphaSpan.toFixed(3),
    '--sn-chat-cell-base-alpha': chatCellBaseAlpha.toFixed(3),
    '--sn-chat-cell-alpha-span': chatCellAlphaSpan.toFixed(3),
    '--sn-cell-glare': `hsl(0 0% ${text.toFixed(1)}% / ${cellGlareAlpha.toFixed(3)})`,
    '--sn-cell-vignette-mid': `hsl(0 0% ${bg.toFixed(1)}% / ${dark ? '0.70' : '0.36'})`,
    '--sn-cell-vignette-edge': 'var(--sn-sys-surface)',
    '--sn-cell-noise': dark
      ? `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.5' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='${cellNoiseOpacity.toFixed(3)}'/%3E%3C/svg%3E")`
      : `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='${cellNoiseOpacity.toFixed(3)}'/%3E%3C/svg%3E")`,
    '--sn-sys-on-surface': textColor,
    '--sn-sys-on-surface-dim': textDimColor,
    '--sn-outline-color': outlineColor,
    '--sn-outline-color-soft': softOutlineColor,
    '--sn-sys-danger': `hsl(${semanticHues.danger} ${neutralChroma} 58%)`,
    '--sn-sys-success': `hsl(${semanticHues.success} ${neutralChroma} 57%)`,
    '--sn-sys-warning': `hsl(${semanticHues.warning} ${neutralChroma} 58%)`,
    '--sn-status-info': 'var(--sn-sys-accent)',
    '--sn-status-success': 'var(--sn-sys-success)',
    '--sn-status-warning': 'var(--sn-sys-warning)',
    '--sn-status-error': 'var(--sn-sys-danger)',
    '--sn-status-neutral': 'var(--sn-sys-on-surface-dim)',
    '--sn-status-info-bg': 'color-mix(in oklab, var(--sn-status-info) 14%, transparent)',
    '--sn-status-success-bg': 'color-mix(in oklab, var(--sn-status-success) 14%, transparent)',
    '--sn-status-warning-bg': 'color-mix(in oklab, var(--sn-status-warning) 14%, transparent)',
    '--sn-status-error-bg': 'color-mix(in oklab, var(--sn-status-error) 14%, transparent)',
    '--sn-status-neutral-bg': 'color-mix(in oklab, var(--sn-status-neutral) 10%, transparent)',
    '--sn-status-ok-bg': 'var(--sn-status-success-bg)',
    '--sn-sys-accent': accent,
    '--sn-node-accent': accent,
    '--sn-cat-server': 'var(--sn-sys-accent)',
    '--sn-cat-instance': `hsl(${semanticHues.success} ${neutralChroma} 57%)`,
    '--sn-cat-control': `hsl(${semanticHues.warning} ${neutralChroma} 58%)`,
    '--sn-cat-data': `hsl(${semanticHues.data} ${neutralChroma} ${dataLight.toFixed(1)}%)`,
    '--sn-cat-default': `hsl(0 0% ${dim.toFixed(1)}%)`,
    '--sn-cat-directory': `hsl(${semanticHues.warning} ${neutralChroma} 60%)`,
    '--sn-cat-file': `hsl(${semanticHues.accent} ${neutralChroma} 66%)`,
    '--sn-cat-function': 'var(--sn-sys-success)',
    '--sn-cat-class': `hsl(${semanticHues.data} ${neutralChroma} 72%)`,
    '--sn-cat-module': `hsl(${semanticHues.danger} ${neutralChroma} 70%)`,
    '--sn-subgraph-accent': 'var(--sn-cat-data)',
    '--sn-type-default': 'var(--sn-node-category-accent)',
    '--sn-type-action': typeAction,
    '--sn-type-output': typeOutput,
    '--sn-type-data': typeData,
    '--sn-type-config': typeConfig,
    '--sn-type-external': typeExternal,
    '--sn-type-style': typeStyle,
    '--sn-type-docs': typeDocs,
    '--sn-type-asset': typeAsset,
    '--sn-type-group': typeGroup,
    '--sn-type-source': 'var(--sn-cat-server)',
    '--sn-type-canvas': 'var(--sn-cat-module)',
    '--sn-type-layout': 'var(--sn-cat-data)',
    '--sn-type-controls': 'var(--sn-cat-control)',
    '--sn-type-control': 'var(--sn-cat-control)',
    '--sn-type-directory': 'var(--sn-cat-directory)',
    '--sn-type-file': 'var(--sn-cat-file)',
    '--sn-type-function': 'var(--sn-cat-function)',
    '--sn-type-class': 'var(--sn-cat-class)',
    '--sn-type-module': 'var(--sn-cat-module)',
    '--sn-type-profile': `hsl(${semanticHues.data} ${neutralChroma} 58%)`,
    '--sn-type-profile-photo': 'var(--sn-type-profile)',
    '--sn-type-profile-info': 'var(--sn-sys-success)',
    '--sn-type-bio': 'var(--sn-type-profile-info)',
    '--sn-type-portal': 'var(--sn-cat-control)',
    '--sn-type-project': `hsl(24 ${neutralChroma} 62%)`,
    '--sn-type-pulse': 'var(--sn-type-docs)',
    '--sn-type-skill': 'var(--sn-cat-control)',
    '--sn-graph-type-action': 'var(--sn-type-action)',
    '--sn-graph-type-output': 'var(--sn-type-output)',
    '--sn-graph-type-data': 'var(--sn-type-data)',
    '--sn-graph-type-config': 'var(--sn-type-config)',
    '--sn-graph-type-external': 'var(--sn-type-external)',
    '--sn-graph-type-style': 'var(--sn-type-style)',
    '--sn-graph-type-docs': 'var(--sn-type-docs)',
    '--sn-graph-type-asset': 'var(--sn-type-asset)',
    '--sn-graph-type-group': 'var(--sn-type-group)',
    '--sn-graph-type-directory': 'var(--sn-type-directory)',
    '--sn-graph-type-file': 'var(--sn-type-file)',
    '--sn-graph-type-source': 'var(--sn-type-source)',
    '--sn-graph-type-canvas': 'var(--sn-type-canvas)',
    '--sn-graph-type-layout': 'var(--sn-type-layout)',
    '--sn-graph-type-controls': 'var(--sn-type-controls)',
    '--sn-graph-type-control': 'var(--sn-type-control)',
    '--sn-graph-type-profile': 'var(--sn-type-profile)',
    '--sn-graph-type-profile-photo': 'var(--sn-type-profile-photo)',
    '--sn-graph-type-bio': 'var(--sn-type-bio)',
    '--sn-graph-type-portal': 'var(--sn-type-portal)',
    '--sn-graph-type-project': 'var(--sn-type-project)',
    '--sn-graph-type-pulse': 'var(--sn-type-pulse)',
    '--sn-graph-type-skill': 'var(--sn-type-skill)',
    '--sn-graph-type-function': 'var(--sn-type-function)',
    '--sn-graph-type-class': 'var(--sn-type-class)',
    '--sn-graph-type-module': 'var(--sn-type-module)',
    '--sn-canvas-graph-bg': 'var(--sn-sys-surface)',
    '--sn-canvas-graph-edge': 'var(--sn-conn-color)',
    '--sn-canvas-graph-pulse': 'var(--sn-sys-accent)',
    '--sn-canvas-graph-danger': 'var(--sn-sys-danger)',
    '--sn-canvas-graph-text': 'var(--sn-sys-on-surface)',
    '--sn-canvas-graph-text-dim': 'var(--sn-sys-on-surface-dim)',
    '--sn-canvas-graph-panel-bg': 'var(--sn-canvas-graph-bg)',
    '--sn-canvas-graph-panel-border': outlineColor,
    '--sn-canvas-graph-ghost': `hsl(0 0% ${dim.toFixed(1)}%)`,
    '--sn-canvas-graph-radial-icon': 'var(--sn-sys-surface)',
    '--sn-tabs-accent': 'var(--sn-cat-server)',
    '--sn-tabs-active-bg': 'var(--sn-sys-surface-raised)',
    '--sn-tabs-active-color': 'var(--sn-sys-on-surface)',
    '--sn-tabs-active-border': activeTabBorder,
    '--sn-tab-accent-0': 'var(--sn-cat-server)',
    '--sn-tab-accent-1': 'var(--sn-cat-data)',
    '--sn-tab-accent-2': 'var(--sn-cat-control)',
    '--sn-tab-accent-3': 'var(--sn-cat-instance)',
    '--sn-tab-accent-4': 'var(--sn-type-action)',
    '--sn-tab-accent-5': 'var(--sn-cat-class)',
    '--sn-node-active-border': `color-mix(in oklab, ${accent} 54%, transparent)`,
    '--sn-sys-state-hover-mix': '18%',
    '--sn-sys-state-selected-mix': '26%',
    '--sn-sys-outline': outlineColor,
    '--sn-node-border-width': nodeBorderWidth,
    '--sn-node-header-bg': 'var(--sn-sys-surface-panel)',
    '--sn-node-header-border': state.outline === 0 ? 'transparent' : softOutlineColor,
    '--sn-layout-sidebar-header-bg': 'var(--sn-node-header-bg)',
    '--sn-layout-sidebar-header-border': 'var(--sn-layout-border)',
    '--sn-layout-sidebar-header-button-hover-bg': 'color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent)',
    '--sn-layout-sidebar-header-button-active-bg': 'color-mix(in oklab, var(--sn-cat-server) 10%, transparent)',
    '--sn-layout-panel-card-bg': 'transparent',
    '--sn-layout-panel-card-border': 'transparent',
    '--sn-layout-panel-card-radius': '0',
    '--sn-layout-panel-card-inline-size': '100%',
    '--sn-layout-panel-card-min-block-size': '100%',
    '--sn-media-studio-bg': 'color-mix(in oklab, var(--sn-sys-surface) 94%, black)',
    '--sn-media-studio-border': 'color-mix(in oklab, var(--sn-sys-on-surface) 16%, transparent)',
    '--sn-media-studio-preview-bg': 'color-mix(in oklab, var(--sn-sys-surface) 88%, black)',
    '--sn-media-studio-preview-radius': 'var(--sn-node-radius)',
    '--sn-media-studio-preview-shadow': 'inset 0 0 0 1px color-mix(in oklab, var(--sn-sys-on-surface) 5%, transparent), inset 0 -32px 70px color-mix(in oklab, black 36%, transparent)',
    '--sn-media-studio-timeline-bg': 'color-mix(in oklab, var(--sn-sys-surface-sunken) 86%, black)',
    '--sn-media-studio-pane-bg': 'color-mix(in oklab, var(--sn-sys-surface-panel) 92%, var(--sn-sys-surface))',
    '--sn-media-studio-pane-width': '260px',
    '--sn-media-studio-timeline-height': '172px',
    '--sn-media-studio-control-height': '28px',
    '--sn-media-studio-panel-gap': 'var(--sn-frame-gap)',
    '--sn-media-studio-toolbar-bg': 'var(--sn-sys-surface-panel)',
    '--sn-media-studio-status-bg': 'var(--sn-sys-surface-panel)',
    '--sn-media-studio-checker-a': 'color-mix(in oklab, var(--sn-sys-surface) 84%, black)',
    '--sn-media-studio-checker-b': 'color-mix(in oklab, var(--sn-sys-surface) 70%, black)',
    '--sn-media-studio-track-video-bg': 'color-mix(in oklab, var(--sn-sys-accent) 42%, var(--sn-sys-surface))',
    '--sn-media-studio-track-audio-bg': 'color-mix(in oklab, var(--sn-sys-warning) 42%, var(--sn-sys-surface))',
    '--sn-media-studio-playhead-color': 'var(--sn-sys-danger)',
    '--sn-media-studio-progress-color': 'var(--sn-sys-accent)',
    '--sn-node-item-border': state.outline === 0 ? 'transparent' : softOutlineColor,
    '--sn-canvas-overlay-z-base': '12000',
    '--sn-node-callout-z': 'var(--sn-canvas-overlay-z-base)',
    '--sn-node-callout-bg': 'color-mix(in oklab, var(--sn-sys-surface-raised) 94%, var(--sn-sys-accent) 6%)',
    '--sn-node-callout-color': 'var(--sn-sys-on-surface)',
    '--sn-shape-fill': 'var(--sn-sys-surface-raised)',
    '--sn-shape-stroke': outlineColor,
    '--sn-shape-stroke-width': shapeStrokeWidth,
    '--sn-shape-port-hint-stroke-width': shapePortHintStrokeWidth,
    '--sn-conn-color': 'var(--sn-sys-accent)',
    '--sn-conn-width': connectionWidth,
    '--sn-conn-hover-width': connectionHoverWidth,
    '--sn-conn-selected': 'var(--sn-sys-danger)',
    '--sn-conn-selected-width': connectionHoverWidth,
    '--sn-conn-dot-fill': 'var(--sn-conn-color)',
    '--sn-pseudo-conn-width': connectionWidth,
    '--sn-plus-indicator-stroke-width': connectionWidth,
    '--sn-conn-dot-stroke': 'var(--sn-sys-surface-raised)',
    '--sn-conn-dot-stroke-width': `${(1.4 + outlineStrength * 1.2).toFixed(2)}px`,
    '--sn-layout-border': outlineColor,
    '--sn-layout-resizer-hover-bg': state.outline === 0 ? 'transparent' : softOutlineColor,
    '--sn-ctx-border': outlineColor,
    '--sn-sys-surface-overlay': 'color-mix(in oklab, var(--sn-sys-surface-panel) 82%, var(--sn-sys-on-surface) 4%)',
    '--sn-ctx-z': 'var(--sn-canvas-overlay-z-base)',
    '--sn-panel-menu-border-width': nodeBorderWidth,
    '--sn-toolbar-bg': 'color-mix(in oklab, var(--sn-sys-surface-panel) 94%, transparent)',
    '--sn-toolbar-border': outlineColor,
    '--sn-toolbar-color': 'var(--sn-sys-on-surface-dim)',
    '--sn-toolbar-hover': accentSoft,
    '--sn-toolbar-active': 'var(--sn-sys-on-surface)',
    '--sn-toolbar-danger': 'color-mix(in oklab, var(--sn-sys-danger) 18%, transparent)',
    '--sn-toolbar-danger-color': 'var(--sn-sys-danger)',
    '--sn-toolbar-occlusion-bg': 'color-mix(in oklab, var(--sn-sys-surface) 28%, transparent)',
    '--sn-toolbar-z': 'var(--sn-canvas-overlay-z-base)',
    '--sn-toolbar-title-color': 'var(--sn-sys-on-surface)',
    '--sn-toolbar-title-font-size': '12px',
    '--sn-toolbar-title-font-weight': '700',
    '--sn-toolbar-title-line-height': '1.35',
    '--sn-toolbar-title-min-width': '220px',
    '--sn-toolbar-title-max-width': 'clamp(300px, 48vw, 420px)',
    '--sn-toolbar-title-lines': '2',
    '--sn-card-bg': 'var(--sn-sys-surface-raised)',
    '--sn-xr-panel-border': outlineColor,
    '--sn-xr-panel-bg': 'var(--sn-sys-surface-panel)',
    '--sn-card-border': outlineColor,
    '--sn-card-title-color': 'var(--sn-sys-on-surface-dim)',
    '--sn-button-border': outlineColor,
    '--sn-button-bg': 'var(--sn-sys-surface-raised)',
    '--sn-button-color': 'var(--sn-sys-on-surface)',
    '--sn-button-hover-bg': 'color-mix(in oklab, var(--sn-sys-surface-raised) 86%, var(--sn-sys-accent) 14%)',
    '--sn-button-primary-bg': 'var(--sn-sys-accent)',
    '--sn-button-primary-border': 'var(--sn-sys-accent)',
    '--sn-button-primary-color': primaryButtonColor,
    '--sn-button-success-bg': 'var(--sn-sys-success)',
    '--sn-button-success-border': 'var(--sn-sys-success)',
    '--sn-button-success-color': successButtonColor,
    '--sn-button-success-hover-bg': 'color-mix(in oklab, var(--sn-sys-success) 85%, var(--sn-sys-on-surface))',
    '--sn-button-success-hover-border': 'color-mix(in oklab, var(--sn-sys-success) 85%, var(--sn-sys-on-surface))',
    '--sn-button-success-hover-color': successButtonColor,
    '--sn-button-danger-bg': 'transparent',
    '--sn-button-danger-border': 'var(--sn-sys-danger)',
    '--sn-button-danger-color': 'var(--sn-sys-danger)',
    '--sn-button-danger-hover-bg': 'var(--sn-sys-danger)',
    '--sn-button-danger-hover-border': 'var(--sn-sys-danger)',
    '--sn-button-danger-hover-color': dangerButtonColor,
    '--sn-banner-border': outlineColor,
    '--sn-banner-bg': 'var(--sn-sys-surface-raised)',
    '--sn-banner-color': 'var(--sn-sys-on-surface)',
    '--sn-banner-info-bg': 'var(--sn-status-info-bg)',
    '--sn-banner-info-color': 'var(--sn-status-info)',
    '--sn-banner-info-border': 'color-mix(in oklab, var(--sn-status-info) 58%, transparent)',
    '--sn-banner-success-bg': 'var(--sn-status-success-bg)',
    '--sn-banner-success-color': 'var(--sn-status-success)',
    '--sn-banner-success-border': 'color-mix(in oklab, var(--sn-status-success) 58%, transparent)',
    '--sn-banner-warning-bg': 'var(--sn-status-warning-bg)',
    '--sn-banner-warning-color': 'var(--sn-status-warning)',
    '--sn-banner-warning-border': 'color-mix(in oklab, var(--sn-status-warning) 58%, transparent)',
    '--sn-banner-error-bg': 'var(--sn-status-error-bg)',
    '--sn-banner-error-color': 'var(--sn-status-error)',
    '--sn-banner-error-border': 'color-mix(in oklab, var(--sn-status-error) 58%, transparent)',
    '--sn-badge-border': outlineColor,
    '--sn-badge-bg': 'var(--sn-sys-surface-raised)',
    '--sn-badge-color': 'var(--sn-sys-on-surface-dim)',
    '--sn-badge-info-bg': 'var(--sn-status-info-bg)',
    '--sn-badge-info-color': 'var(--sn-status-info)',
    '--sn-badge-info-border': 'color-mix(in oklab, var(--sn-status-info) 76%, transparent)',
    '--sn-badge-success-bg': 'var(--sn-status-success-bg)',
    '--sn-badge-success-color': 'var(--sn-status-success)',
    '--sn-badge-success-border': 'color-mix(in oklab, var(--sn-status-success) 76%, transparent)',
    '--sn-badge-warning-bg': 'var(--sn-status-warning-bg)',
    '--sn-badge-warning-color': 'var(--sn-status-warning)',
    '--sn-badge-warning-border': 'color-mix(in oklab, var(--sn-status-warning) 76%, transparent)',
    '--sn-badge-error-bg': 'var(--sn-status-error-bg)',
    '--sn-badge-error-color': 'var(--sn-status-error)',
    '--sn-badge-error-border': 'color-mix(in oklab, var(--sn-status-error) 76%, transparent)',
    '--sn-badge-neutral-bg': 'var(--sn-status-neutral-bg)',
    '--sn-badge-neutral-color': 'var(--sn-status-neutral)',
    '--sn-badge-neutral-border': outlineColor,
    '--sn-field-control-border': outlineColor,
    '--sn-field-label-color': 'var(--sn-sys-on-surface-dim)',
    '--sn-field-control-bg': 'var(--sn-sys-surface)',
    '--sn-field-control-color': 'var(--sn-sys-on-surface)',
    '--sn-field-placeholder-color': 'var(--sn-sys-on-surface-dim)',
    '--sn-tree-label-color': 'var(--sn-sys-on-surface)',
    '--sn-tree-muted-color': 'var(--sn-sys-on-surface-dim)',
    '--sn-tree-icon-color': 'var(--sn-sys-on-surface-dim)',
    '--sn-tree-badge-color': 'var(--sn-sys-on-surface-dim)',
    '--sn-tree-row-selected-bg': 'color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), var(--sn-sys-surface-panel))',
    '--sn-tree-row-selected-border': state.outline === 0 ? 'transparent' : softOutlineColor,
    '--sn-data-table-bg': 'var(--sn-sys-surface-raised)',
    '--sn-data-table-border': outlineColor,
    '--sn-data-table-color': 'var(--sn-sys-on-surface)',
    '--sn-data-table-header-bg': 'var(--sn-sys-surface-panel)',
    '--sn-data-table-header-color': 'var(--sn-sys-on-surface-dim)',
    '--sn-data-table-header-border': state.outline === 0 ? 'transparent' : softOutlineColor,
    '--sn-data-table-row-border': state.outline === 0 ? 'transparent' : softOutlineColor,
    '--sn-list-detail-bg': 'var(--sn-sys-surface-panel)',
    '--sn-list-detail-border': outlineColor,
    '--sn-list-detail-color': 'var(--sn-sys-on-surface)',
    '--sn-list-detail-sidebar-bg': 'var(--sn-sys-surface-raised)',
    '--sn-list-detail-main-bg': 'var(--sn-sys-surface-panel)',
    '--sn-list-detail-header-bg': 'var(--sn-sys-surface-raised)',
    '--sn-list-detail-title-color': 'var(--sn-sys-on-surface)',
    '--sn-list-detail-description-color': 'var(--sn-sys-on-surface-dim)',
    '--sn-list-detail-icon-color': 'var(--sn-sys-accent)',
    '--sn-source-border': outlineColor,
    '--sn-source-header-bg': 'var(--sn-sys-surface-raised)',
    '--sn-source-action-bg': 'var(--sn-sys-surface-raised)',
    '--sn-source-action-hover-bg': 'color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-source-action-bg))',
    '--sn-empty-state-color': 'var(--sn-sys-on-surface-dim)',
    '--sn-empty-state-error-color': 'var(--sn-sys-danger)',
    '--sn-event-feed-bg': 'var(--sn-sys-surface-raised)',
    '--sn-event-feed-border': outlineColor,
    '--sn-event-feed-header-bg': 'var(--sn-node-header-bg)',
    '--sn-event-feed-item-bg': 'var(--sn-bg-overlay)',
    '--sn-event-feed-item-hover-bg': 'color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent)',
    '--sn-status-ribbon-border': 'var(--sn-cat-server)',
    '--sn-status-ribbon-bg': 'var(--sn-bg-overlay)',
    '--sn-status-ribbon-color': 'var(--sn-sys-on-surface)',
    '--sn-source-bg': 'var(--sn-sys-surface)',
    '--sn-source-editor-bg': 'var(--sn-sys-surface)',
    '--sn-source-editor-color': 'var(--sn-sys-on-surface)',
    '--sn-chat-bg': 'transparent',
    '--sn-chat-message-bg': 'var(--sn-sys-surface-raised)',
    '--sn-chat-user-message-bg': 'color-mix(in oklab, var(--sn-sys-surface-panel) 88%, var(--sn-sys-accent) 12%)',
    '--sn-chat-agent-message-bg': 'var(--sn-sys-surface-raised)',
    '--sn-composer-bg': 'color-mix(in oklab, var(--sn-sys-surface-panel) 90%, var(--sn-sys-on-surface) 4%)',
    '--sn-composer-border': outlineColor,
    '--sn-composer-action-bg': 'color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-composer-bg))',
    '--sn-composer-radius': 'calc(20px * var(--sn-theme-composer-radius-scale, 1))',
    '--sn-composer-send-hover-bg': 'var(--sn-sys-accent)',
    '--sn-syntax-keyword': `hsl(${semanticHues.danger} ${neutralChroma} ${Math.min(86, actionLight + 4).toFixed(1)}%)`,
    '--sn-syntax-string': `hsl(${semanticHues.warning} ${neutralChroma} ${Math.min(78, accentLight + 2).toFixed(1)}%)`,
    '--sn-syntax-comment': 'var(--sn-sys-on-surface-dim)',
    '--sn-syntax-function': `hsl(${semanticHues.accent} ${neutralChroma} ${Math.min(86, accentLight + 8).toFixed(1)}%)`,
    '--sn-syntax-number': 'var(--sn-syntax-string)',
    '--sn-syntax-builtin': 'var(--sn-syntax-function)',
    '--sn-syntax-property': `hsl(${semanticHues.data} ${neutralChroma} ${Math.min(82, dataLight + 30).toFixed(1)}%)`,
    '--sn-syntax-literal': 'var(--sn-syntax-keyword)',
    '--sn-syntax-doc': `hsl(${semanticHues.success} ${neutralChroma} ${dim.toFixed(1)}%)`,
    '--sn-syntax-doc-tag': `hsl(${semanticHues.success} ${neutralChroma} ${Math.min(78, accentLight + 5).toFixed(1)}%)`,
    '--sn-syntax-doc-type': `hsl(${semanticHues.accent} ${neutralChroma} ${Math.min(80, accentLight + 7).toFixed(1)}%)`,
    '--sn-syntax-template': `hsl(${semanticHues.warning} ${neutralChroma} ${Math.min(78, accentLight + 1).toFixed(1)}%)`,
    '--sn-syntax-template-tag': `hsl(${semanticHues.accent} ${neutralChroma} ${accentLight.toFixed(1)}%)`,
    '--sn-syntax-template-attr': 'var(--sn-syntax-function)',
    '--sn-syntax-template-bracket': 'var(--sn-sys-on-surface-dim)',
    '--sn-syntax-template-interpolation': `hsl(${semanticHues.warning} ${neutralChroma} ${Math.min(84, accentLight + 10).toFixed(1)}%)`,
    '--sn-syntax-template-selector': 'var(--sn-syntax-string)',
    '--sn-syntax-template-property': 'var(--sn-syntax-template-attr)',
    '--sn-syntax-template-value': 'var(--sn-syntax-template)',
    '--sn-effect-focus-ring': `${focusRingWidth} solid var(--sn-sys-accent)`,
    '--sn-node-font-size': typeToken(13),
    '--sn-node-label-size': headingToken(13),
    '--sn-node-summary-size': typeToken(12),
    '--sn-node-icon-size': typeToken(18),
    '--sn-node-link-size': typeToken(12),
    '--sn-node-link-icon-size': typeToken(15),
    '--sn-node-error-frame-header-size': typeToken(12),
    '--sn-node-error-frame-icon-size': typeToken(14),
    '--sn-node-error-frame-body-size': typeToken(11),
    '--sn-node-item-kicker-size': typeToken(10),
    '--sn-node-item-title-size': headingToken(13),
    '--sn-node-item-summary-size': typeToken(11),
    '--sn-port-label-size': typeToken(12),
    '--sn-control-label-size': typeToken(10),
    '--sn-control-input-size': typeToken(12),
    '--sn-node-preview-text-size': typeToken(11),
    '--sn-shape-icon-size': typeToken(40),
    '--sn-button-font-size': typeToken(12),
    '--sn-button-icon-font-size': typeToken(16),
    '--sn-layout-header-title-size': headingToken(13),
    '--sn-layout-header-title-line-height': '1.2',
    '--sn-card-title-size': headingToken(11),
    '--sn-banner-font-size': typeToken(12),
    '--sn-banner-icon-size': typeToken(18),
    '--sn-badge-font-size': typeToken(12),
    '--sn-tree-label-size': typeToken(12),
    '--sn-tree-icon-size': typeToken(15),
    '--sn-tree-kind-size': typeToken(10),
    '--sn-tree-badge-size': typeToken(10),
    '--sn-tree-panel-font-size': typeToken(12),
    '--sn-tree-panel-title-size': headingToken(11),
    '--sn-tree-panel-input-size': typeToken(11),
    '--sn-markdown-h1-size': headingToken(24),
    '--sn-markdown-h2-size': headingToken(20),
    '--sn-markdown-h3-size': headingToken(16),
    '--sn-markdown-h4-size': headingToken(14),
    '--sn-chat-markdown-h1-size': headingToken(20),
    '--sn-chat-markdown-h2-size': headingToken(18),
    '--sn-chat-markdown-h3-size': headingToken(16),
    '--sn-chat-markdown-h4-size': headingToken(14),
    '--sn-chat-message-font-size': typeToken(13),
    '--sn-chat-small-size': typeToken(11),
    '--sn-chat-tool-font-size': typeToken(12),
    '--sn-chat-tool-label-size': typeToken(10),
    '--sn-chat-code-size': typeToken(12),
    '--sn-chat-table-size': typeToken(12),
    '--sn-chat-status-card-size': typeToken(12),
    '--sn-chat-live-icon-size': typeToken(14),
    '--sn-chat-meta-icon-size': typeToken(12),
    '--sn-chat-status-icon-size': typeToken(12),
    '--sn-chat-tool-icon-size': typeToken(14),
    '--sn-chat-summary-icon-size': typeToken(16),
    '--sn-chat-sidebar-title-size': typeToken(11),
    '--sn-chat-sidebar-meta-size': typeToken(9),
    '--sn-chat-sidebar-button-size': typeToken(12),
    '--sn-chat-sidebar-button-icon-size': typeToken(16),
    '--sn-chat-sidebar-icon-size': typeToken(16),
    '--sn-chat-sidebar-delete-size': typeToken(14),
    '--sn-chat-sidebar-delete-icon-size': typeToken(15),
    '--sn-chat-sidebar-expand-icon-size': typeToken(14),
    '--sn-chat-sidebar-child-size': typeToken(12),
    '--sn-chat-list-title-size': typeToken(13),
    '--sn-chat-list-icon-size': typeToken(16),
    '--sn-chat-list-empty-icon-size': typeToken(32),
    '--sn-chat-list-new-icon-size': typeToken(14),
    '--sn-chat-list-filter-button-size': typeToken(11),
    '--sn-chat-list-badge-size': typeToken(9),
    '--sn-chat-list-name-size': typeToken(12),
    '--sn-chat-list-adapter-size': typeToken(10),
    '--sn-chat-list-preview-size': typeToken(11),
    '--sn-chat-list-meta-size': typeToken(10),
    '--sn-chat-list-delete-size': typeToken(14),
    '--sn-code-font-size': typeToken(12),
    '--sn-code-markdown-size': typeToken(14),
    '--sn-code-table-size': typeToken(13),
    '--sn-composer-input-size': typeToken(13),
    '--sn-composer-send-icon-size': typeToken(18),
    '--sn-composer-footer-size': typeToken(11),
    '--sn-composer-chip-size': typeToken(11),
    '--sn-composer-popup-header-size': typeToken(10),
    '--sn-composer-popup-item-size': typeToken(12),
    '--sn-composer-popup-hint-size': typeToken(10),
    '--sn-composer-voice-label-size': typeToken(11),
    '--sn-composer-voice-preview-size': typeToken(13),
    '--sn-composer-voice-status-size': typeToken(12),
    '--sn-composer-footer-icon-size': typeToken(12),
    '--sn-composer-footer-toggle-icon-size': typeToken(18),
    '--sn-layout-header-button-size': typeToken(12),
    '--sn-layout-header-icon-size': typeToken(16),
    '--sn-layout-header-dropdown-size': typeToken(18),
    '--sn-layout-menu-action-size': typeToken(12),
    '--sn-layout-menu-icon-size': typeToken(16),
    '--sn-layout-collapsed-icon-size': typeToken(18),
    '--sn-layout-collapsed-horizontal-icon-size': typeToken(20),
    '--sn-fullscreen-tab-size': typeToken(12),
    '--sn-fullscreen-tab-icon-size': typeToken(16),
    '--sn-panel-menu-item-size': typeToken(12),
    '--sn-panel-menu-icon-size': typeToken(18),
    '--sn-tabs-item-font-size': typeToken(12),
    '--sn-tabs-icon-size': typeToken(15),
    '--sn-tabs-close-font-size': typeToken(14),
    '--sn-tabs-add-font-size': typeToken(18),
    '--sn-data-table-header-size': typeToken(11),
    '--sn-data-table-cell-size': typeToken(12),
    '--sn-empty-state-font-size': typeToken(12),
    '--sn-empty-state-icon-size': typeToken(32),
    '--sn-list-detail-title-size': headingToken(12),
    '--sn-list-detail-description-size': typeToken(11),
    '--sn-list-detail-icon-size': typeToken(16),
    '--sn-event-feed-font-size': typeToken(12),
    '--sn-event-feed-header-size': typeToken(11),
    '--sn-event-feed-item-header-size': typeToken(11),
    '--sn-event-feed-time-size': typeToken(10),
    '--sn-event-feed-body-size': typeToken(11),
    '--sn-event-feed-raw-size': typeToken(10),
    '--sn-graph-explorer-button-size': typeToken(10),
    '--sn-graph-explorer-button-icon-size': typeToken(14),
    '--sn-graph-explorer-layer-size': typeToken(9),
    '--sn-graph-explorer-stats-size': typeToken(10),
    '--sn-source-header-size': typeToken(11),
    '--sn-source-stats-size': typeToken(10),
    '--sn-source-action-size': typeToken(10),
    '--sn-source-action-icon-size': typeToken(16),
    '--sn-status-ribbon-size': typeToken(12),
    '--sn-status-ribbon-icon-size': typeToken(16),
    '--sn-socket-size': densityToken(12),
    '--sn-socket-border-width': `${(1.5 + outlineStrength * 0.8).toFixed(2)}px`,
    '--sn-socket-hit-size': densityToken(44),
    '--sn-card-padding': densityToken(14),
    '--sn-card-title-margin-block-end': densityToken(12),
    '--sn-card-footer-gap': densityToken(8),
    // description lists (card bodies — e.g. the asset & crew panels) follow the same type
    // and density cascade as the rest of the card, instead of freezing on px fallbacks
    '--sn-description-label-size': typeToken(12),
    '--sn-description-value-size': typeToken(12),
    '--sn-description-list-padding': `${densityToken(6)} ${densityToken(8)}`,
    '--sn-description-list-gap-y': densityToken(8),
    '--sn-description-list-gap-x': densityToken(16),
    '--sn-button-padding': `${densityToken(6)} ${densityToken(14)}`,
    '--sn-button-gap': densityToken(6),
    '--sn-button-min-height': densityToken(30),
    '--sn-button-icon-size': densityToken(28),
    '--sn-tabs-corner-radius': tabRadiusCss,
    '--sn-tabs-radius': tabShapeRadius,
    '--sn-tabs-bar-align': tabIsEar ? 'flex-end' : 'center',
    '--sn-tabs-item-border-bottom': tabIsEar ? 'none' : '1px solid var(--sn-tabs-item-border, transparent)',
    '--sn-tabs-active-border-bottom': tabIsEar
      ? 'none'
      : '1px solid var(--sn-tabs-active-border, color-mix(in oklab, var(--tab-accent, var(--sn-tabs-accent)) 44%, transparent))',
    '--sn-tabs-active-corner-display': tabIsClassicEar ? 'block' : 'none',
    '--sn-tabs-corner-size': '12px',
    '--sn-tabs-corner-cut': '11.5px',
    '--sn-tabs-bar-padding': `0 ${densityToken(12)}`,
    '--sn-tabs-item-gap': densityToken(6),
    '--sn-tabs-item-padding': `0 ${densityToken(10)}`,
    '--sn-tabs-item-margin-inline': densityToken(2),
    '--sn-tabs-close-size': densityToken(16),
    '--sn-tabs-add-size': densityToken(28),
    '--sn-tabs-add-margin-left': densityToken(4),
    '--sn-tabs-add-margin-bottom': densityToken(2),
    '--sn-banner-padding': `${densityToken(10)} ${densityToken(14)}`,
    '--sn-banner-gap': densityToken(8),
    '--sn-badge-padding': `${densityToken(2)} ${densityToken(8)}`,
    '--sn-badge-gap': densityToken(4),
    '--sn-tree-gap': densityToken(4),
    '--sn-tree-row-min-height': densityToken(22),
    '--sn-tree-row-padding-block': densityToken(2),
    '--sn-tree-badge-gap': densityToken(4),
    '--sn-tree-badge-padding': `${densityToken(1)} ${densityToken(5)}`,
    '--sn-tree-panel-title-gap': densityToken(5),
    '--sn-tree-panel-title-padding': `${densityToken(6)} ${densityToken(8)}`,
    '--sn-tree-panel-toolbar-gap': densityToken(6),
    '--sn-tree-panel-toolbar-padding': `${densityToken(6)} ${densityToken(8)}`,
    '--sn-tree-panel-input-padding': `${densityToken(4)} ${densityToken(8)}`,
    '--sn-tree-panel-content-padding': densityToken(4),
    '--sn-chat-gap': densityToken(8),
    '--sn-chat-transcript-padding': `${densityToken(18)} ${densityToken(16)} ${densityToken(10)}`,
    '--sn-chat-scroll-bottom': densityToken(18),
    '--sn-chat-message-padding': `${densityToken(12)} ${densityToken(16)}`,
    '--sn-chat-tool-padding': `${densityToken(8)} ${densityToken(12)}`,
    '--sn-chat-code-padding': densityToken(8),
    '--sn-chat-status-card-padding': `${densityToken(10)} ${densityToken(12)}`,
    '--sn-chat-status-card-gap': densityToken(6),
    '--sn-chat-sidebar-width': densityToken(200),
    '--sn-chat-sidebar-collapsed-width': 'var(--sn-layout-header-block-size, calc(var(--sn-layout-header-min-height, 28px) + 3px))',
    '--sn-chat-sidebar-resize-hit-size': densityToken(4),
    '--sn-chat-sidebar-header-gap': densityToken(2),
    '--sn-chat-sidebar-header-padding': `${densityToken(2)} ${densityToken(4)}`,
    '--sn-chat-sidebar-header-min-height': densityToken(28),
    '--sn-chat-sidebar-collapsed-header-padding': `${densityToken(4)} 0`,
    '--sn-chat-sidebar-collapsed-header-gap': densityToken(8),
    '--sn-chat-sidebar-button-padding': `${densityToken(4)} ${densityToken(6)}`,
    '--sn-chat-sidebar-button-radius': radiusToken(4),
    '--sn-chat-sidebar-items-padding': `${densityToken(4)} 0`,
    '--sn-chat-sidebar-compact-label-min': densityToken(72),
    '--sn-chat-sidebar-compact-label-ch-width': densityToken(5),
    '--sn-chat-sidebar-compact-label-extra': densityToken(20),
    '--sn-chat-sidebar-compact-label-max': densityToken(320),
    '--sn-chat-sidebar-compact-delete-width': densityToken(44),
    '--sn-chat-sidebar-row-gap': densityToken(10),
    '--sn-chat-sidebar-row-padding': `${densityToken(6)} ${densityToken(14)}`,
    '--sn-chat-sidebar-row-min-height': densityToken(28),
    '--sn-chat-sidebar-active-border-width': densityToken(2),
    '--sn-chat-sidebar-active-padding-left': densityToken(12),
    '--sn-chat-sidebar-group-divider-margin': densityToken(4),
    '--sn-chat-sidebar-group-divider-padding': densityToken(4),
    '--sn-chat-sidebar-group-divider-inset': densityToken(16),
    '--sn-chat-sidebar-group-divider-width': densityToken(16),
    '--sn-chat-sidebar-group-divider-height': densityToken(1),
    '--sn-chat-sidebar-icon-box-size': densityToken(16),
    '--sn-chat-sidebar-status-margin': densityToken(4),
    '--sn-chat-sidebar-meta-margin': densityToken(6),
    '--sn-chat-sidebar-type-padding': `${densityToken(2)} ${densityToken(4)}`,
    '--sn-chat-sidebar-type-radius': radiusToken(3),
    '--sn-chat-sidebar-delete-box-size': densityToken(16),
    '--sn-chat-sidebar-delete-radius': radiusToken(3),
    '--sn-chat-sidebar-child-gap': densityToken(8),
    '--sn-chat-sidebar-child-padding': `${densityToken(4)} ${densityToken(14)} ${densityToken(4)} ${densityToken(38)}`,
    '--sn-chat-sidebar-child-min-height': densityToken(24),
    '--sn-chat-sidebar-child-line-left': densityToken(20),
    '--sn-chat-sidebar-child-deep-padding-left': densityToken(58),
    '--sn-chat-sidebar-child-active-padding-left': densityToken(36),
    '--sn-chat-sidebar-child-deep-active-padding-left': densityToken(56),
    '--sn-chat-sidebar-child-deep-line-left': densityToken(40),
    '--sn-chat-sidebar-compact-label-inset': densityToken(46),
    '--sn-chat-sidebar-compact-label-padding': `${densityToken(10)} 0`,
    '--sn-chat-sidebar-compact-label-offset': densityToken(4),
    '--sn-chat-list-header-gap': densityToken(8),
    '--sn-chat-list-header-min-height': densityToken(36),
    '--sn-chat-list-header-padding': `${densityToken(6)} ${densityToken(12)}`,
    '--sn-chat-list-empty-icon-margin': densityToken(8),
    '--sn-chat-list-items-padding': `${densityToken(4)} 0`,
    '--sn-chat-list-filter-gap': densityToken(4),
    '--sn-chat-list-filter-padding': `${densityToken(6)} ${densityToken(12)}`,
    '--sn-chat-list-filter-button-padding': `${densityToken(3)} ${densityToken(8)}`,
    '--sn-chat-list-filter-button-radius': radiusToken(4),
    '--sn-chat-list-filter-button-min-height': densityToken(24),
    '--sn-chat-list-item-padding': `${densityToken(10)} ${densityToken(14)}`,
    '--sn-chat-list-item-gap': densityToken(4),
    '--sn-chat-list-item-active-border-width': densityToken(3),
    '--sn-chat-list-item-active-padding-left': densityToken(11),
    '--sn-chat-list-item-top-gap': densityToken(6),
    '--sn-chat-list-item-nested-margin': densityToken(16),
    '--sn-chat-list-item-nested-border-width': densityToken(2),
    '--sn-chat-list-item-branch-top': densityToken(14),
    '--sn-chat-list-item-branch-width': densityToken(10),
    '--sn-chat-list-badge-padding': `${densityToken(1)} ${densityToken(5)}`,
    '--sn-chat-list-badge-radius': radiusToken(3),
    '--sn-chat-list-meta-gap': densityToken(6),
    '--sn-chat-list-delete-padding': `0 ${densityToken(2)}`,
    '--sn-composer-padding': `${densityToken(10)} ${densityToken(14)} ${densityToken(14)}`,
    '--sn-composer-body-padding': `${densityToken(8)} ${densityToken(8)} ${densityToken(8)} ${densityToken(14)}`,
    '--sn-composer-control-gap': densityToken(8),
    '--sn-composer-send-size': densityToken(32),
    '--sn-composer-input-min-height': densityToken(20),
    '--sn-composer-input-padding': `${densityToken(4)} max(0px, calc(var(--sn-composer-radius) * 0.45))`,
    '--sn-composer-footer-gap': densityToken(4),
    '--sn-composer-footer-padding': `${densityToken(6)} ${densityToken(16)} 0`,
    '--sn-composer-footer-btn-min-height': densityToken(24),
    '--sn-composer-input-min-inline-size': densityToken(160),
    '--sn-composer-footer-btn-padding': `${densityToken(3)} ${densityToken(8)}`,
    '--sn-composer-collapsed-control-width': densityToken(10),
    '--sn-composer-collapsed-control-padding': densityToken(10),
    '--sn-composer-chip-gap': densityToken(4),
    '--sn-composer-chip-padding': `${densityToken(3)} ${densityToken(8)}`,
    '--sn-composer-autocomplete-padding': densityToken(4),
    '--sn-composer-autocomplete-item-padding': `${densityToken(6)} ${densityToken(10)}`,
    '--sn-composer-popup-inset': densityToken(20),
    '--sn-composer-voice-label-max': densityToken(118),
    '--sn-composer-wake-command-max': densityToken(164),
    '--sn-composer-voice-command-max': densityToken(170),
    '--sn-code-padding': densityToken(12),
    '--sn-code-gutter-padding': `${densityToken(12)} ${densityToken(8)} ${densityToken(12)} ${densityToken(12)}`,
    '--sn-code-gutter-width': densityToken(32),
    '--sn-code-markdown-padding': `${densityToken(20)} ${densityToken(28)}`,
    '--sn-code-table-cell-padding': `${densityToken(6)} ${densityToken(12)}`,
    '--sn-data-table-radius': radiusToken(8),
    '--sn-data-table-cell-padding': `${densityToken(6)} ${densityToken(10)}`,
    '--sn-data-table-cell-gap': densityToken(6),
    '--sn-data-table-line-height': '1.35',
    '--sn-data-table-header-weight': '650',
    '--sn-data-table-header-transform': 'uppercase',
    '--sn-data-table-min-width': densityToken(360),
    '--sn-data-table-marker-size': densityToken(8),
    '--sn-data-table-marker-radius': radiusToken(8),
    '--sn-data-table-empty-padding': densityToken(18),
    '--sn-data-table-empty-color': 'var(--sn-sys-on-surface-dim)',
    '--sn-empty-state-padding': `${densityToken(18)} ${densityToken(14)}`,
    '--sn-empty-state-gap': densityToken(8),
    '--sn-empty-state-min-height': densityToken(88),
    '--sn-empty-state-height': 'auto',
    '--sn-empty-state-font-style': 'italic',
    '--sn-empty-state-line-height': '1.35',
    '--sn-list-detail-radius': radiusToken(8),
    '--sn-list-detail-sidebar-width': densityToken(180),
    '--sn-list-detail-min-height': densityToken(220),
    '--sn-list-detail-height': '100%',
    '--sn-list-detail-header-gap': densityToken(8),
    '--sn-list-detail-header-min-height': densityToken(36),
    '--sn-list-detail-header-padding': `${densityToken(8)} ${densityToken(10)}`,
    '--sn-list-detail-main-padding': densityToken(12),
    '--sn-list-detail-compact-main-padding': densityToken(8),
    '--sn-list-detail-list-padding': densityToken(8),
    '--sn-list-detail-empty-padding': densityToken(18),
    '--sn-list-detail-compact-header-min-height': densityToken(36),
    '--sn-list-detail-title-weight': '650',
    '--sn-list-detail-title-transform': 'none',
    '--sn-event-feed-header-gap': densityToken(12),
    '--sn-event-feed-header-padding': `${densityToken(6)} ${densityToken(12)}`,
    '--sn-event-feed-body-padding': densityToken(8),
    '--sn-event-feed-item-gap': densityToken(8),
    '--sn-event-feed-item-padding': densityToken(8),
    '--sn-event-feed-item-header-gap': densityToken(8),
    '--sn-event-feed-item-header-margin': densityToken(6),
    '--sn-event-feed-arrow-width': densityToken(18),
    '--sn-event-feed-code-padding': densityToken(6),
    '--sn-event-feed-empty-padding': densityToken(30),
    '--sn-event-feed-raw-max-height': densityToken(200),
    '--sn-graph-explorer-button-min-height': densityToken(28),
    '--sn-graph-explorer-button-gap': densityToken(4),
    '--sn-graph-explorer-button-padding': `${densityToken(4)} ${densityToken(10)}`,
    '--sn-graph-explorer-button-radius': radiusToken(3),
    '--sn-graph-explorer-toolbar-max-offset': densityToken(16),
    '--sn-graph-explorer-toolbar-sep-width': densityToken(1),
    '--sn-graph-explorer-toolbar-sep-margin': `0 ${densityToken(4)}`,
    '--sn-graph-explorer-layer-padding': `${densityToken(3)} ${densityToken(6)}`,
    '--sn-graph-explorer-stats-gap': densityToken(12),
    '--sn-graph-explorer-stats-max-height': densityToken(280),
    '--sn-graph-explorer-stats-padding': `${densityToken(4)} ${densityToken(10)}`,
    '--sn-graph-explorer-stats-radius': radiusToken(3),
    '--sn-source-toolbar-gap': densityToken(8),
    '--sn-source-header-padding': `${densityToken(6)} ${densityToken(12)}`,
    '--sn-source-action-gap': densityToken(3),
    '--sn-source-action-padding': `${densityToken(2)} ${densityToken(8)}`,
    '--sn-source-action-radius': radiusToken(4),
    '--sn-status-ribbon-bottom': densityToken(20),
    '--sn-status-ribbon-gap': densityToken(10),
    '--sn-status-ribbon-padding': `${densityToken(8)} ${densityToken(20)}`,
    '--sn-status-ribbon-radius': radiusToken(24),
    '--sn-status-ribbon-max-width': densityToken(500),
    '--sn-status-ribbon-dots-width': densityToken(16),
    '--sn-cell-size': densityToken(14),
    '--sn-cell-min-radius': `calc(2px * var(--sn-theme-cell-radius-scale, 1))`,
    '--sn-cell-max-radius': `calc(5px * var(--sn-theme-cell-radius-scale, 1))`,
    '--sn-cell-step-ms': `${Math.round(75 / densityScale)}ms`,
    '--sn-cell-fade-rate': `${(0.025 + (1 / densityScale) * 0.015).toFixed(3)}`,
    '--sn-lab-toolbar-gap': densityToken(12),
    '--sn-lab-toolbar-padding': `${densityToken(10)} ${densityToken(12)}`,
    '--sn-lab-title-size': headingToken(14),
    '--sn-lab-control-font-size': typeToken(12),
    '--sn-lab-menu-button-size': typeToken(12),
    '--sn-lab-menu-icon-size': typeToken(16),
    '--sn-lab-control-height': densityToken(30),
    '--sn-lab-control-gap': densityToken(8),
    '--sn-lab-menu-gap': densityToken(4),
    '--sn-lab-menu-separator-height': densityToken(20),
    '--sn-lab-menu-button-gap': densityToken(5),
    '--sn-lab-menu-button-height': densityToken(28),
    '--sn-lab-menu-button-padding': `0 ${densityToken(10)}`,
    '--sn-lab-tabs-height': densityToken(34),
    '--sn-lab-tabs-item-height': densityToken(30),
    '--sn-lab-toggle-padding': `0 ${densityToken(10)}`,
    '--sn-lab-mode-button-padding': `0 ${densityToken(9)}`,
    '--sn-lab-tuners-gap': densityToken(12),
    '--sn-lab-slider-width': densityToken(128),
    '--sn-lab-content-padding': densityToken(12),
    '--sn-lab-panel-gap': densityToken(12),
    '--sn-lab-panel-padding': densityToken(12),
    '--sn-lab-row-gap': densityToken(8),
    '--sn-lab-scroll-padding': densityToken(8),
    '--sn-lab-stack-gap': densityToken(10),
    '--sn-lab-token-gap': densityToken(8),
    '--sn-lab-token-padding': densityToken(10),
    '--sn-lab-token-label-size': typeToken(12),
    '--sn-lab-token-value-size': typeToken(11),
    '--sn-node-header-gap': densityToken(6),
    '--sn-node-header-padding': `${densityToken(8)} ${densityToken(12)}`,
    '--sn-node-collapsed-body-padding': `${densityToken(4)} 0`,
    '--sn-node-lod-body-padding': `${densityToken(2)} 0`,
    '--sn-node-body-padding': `${densityToken(8)} 0`,
    '--sn-node-body-gap': densityToken(4),
    '--sn-node-pill-body-padding': `${densityToken(8)} ${densityToken(20)}`,
    '--sn-node-pill-body-gap': densityToken(8),
    '--sn-node-circle-size': densityToken(100),
    '--sn-node-circle-icon-size': typeToken(44),
    '--sn-node-circle-media-size': '100%',
    '--sn-node-circle-port-offset': `calc(-6px * var(--sn-theme-density))`,
    '--sn-node-circle-header-padding': densityToken(6),
    '--sn-node-circle-body-padding': `0 ${densityToken(8)} ${densityToken(8)}`,
    '--sn-node-comment-body-padding': `${densityToken(12)} ${densityToken(16)}`,
    '--sn-node-content-padding': `${densityToken(8)} ${densityToken(12)} ${densityToken(10)}`,
    '--sn-node-link-gap': densityToken(5),
    '--sn-node-link-margin-block-start': densityToken(8),
    '--sn-node-items-padding': densityToken(6),
    '--sn-node-items-gap': densityToken(6),
    '--sn-node-item-gap': densityToken(3),
    '--sn-node-item-padding': `${densityToken(8)} ${densityToken(9)}`,
    '--sn-node-controls-padding': `0 ${densityToken(12)}`,
    '--sn-node-error-frame-header-gap': densityToken(6),
    '--sn-node-error-frame-header-padding': `${densityToken(5)} ${densityToken(10)}`,
    '--sn-node-error-frame-body-padding': `${densityToken(6)} ${densityToken(10)}`,
    '--sn-node-preview-text-padding': `${densityToken(6)} ${densityToken(10)}`,
    '--sn-port-gap': densityToken(6),
    '--sn-port-padding': `${densityToken(3)} ${densityToken(12)}`,
    '--sn-port-min-height': densityToken(28),
    '--sn-control-gap': densityToken(2),
    '--sn-control-margin': `${densityToken(4)} 0`,
    '--sn-control-padding': `${densityToken(4)} ${densityToken(12)}`,
    '--sn-control-input-padding': `${densityToken(4)} ${densityToken(8)}`,
    '--sn-layout-header-gap': densityToken(2),
    '--sn-layout-header-padding': `${densityToken(2)} ${densityToken(4)}`,
    '--sn-layout-header-min-height': densityToken(28),
    '--sn-layout-header-block-size': 'calc(var(--sn-layout-header-min-height, 28px) + 3px)',
    '--sn-layout-sidebar-item-block-size': 'var(--sn-layout-header-block-size, calc(var(--sn-layout-header-min-height, 28px) + 3px))',
    '--sn-layout-sidebar-item-padding': `${densityToken(4)} ${densityToken(14)}`,
    '--sn-layout-header-button-gap': densityToken(4),
    '--sn-layout-header-button-padding': `${densityToken(4)} ${densityToken(6)}`,
    '--sn-layout-header-button-radius': radiusToken(4),
    '--sn-layout-header-button-min-inline-size': densityToken(24),
    '--sn-layout-header-button-min-block-size': densityToken(24),
    '--sn-layout-header-button-block-size': 'var(--sn-layout-header-button-min-block-size)',
    '--sn-sidebar-collapsed-width': 'var(--sn-layout-header-block-size, calc(var(--sn-layout-header-min-height, 28px) + 3px))',
    '--sn-sidebar-collapsed-item-size': 'var(--sn-layout-sidebar-item-block-size)',
    '--sn-sidebar-collapsed-item-radius': radiusToken(4),
    '--sn-sidebar-collapsed-sections-padding': `${densityToken(4)} 0`,
    '--sn-layout-menu-min-height': densityToken(34),
    '--sn-layout-menu-row-height': densityToken(30),
    '--sn-layout-menu-padding': `${densityToken(3)} ${densityToken(6)}`,
    '--sn-layout-menu-row-padding': `0 ${densityToken(4)}`,
    '--sn-layout-menu-row-label-width': densityToken(66),
    '--sn-layout-menu-label-padding': `0 ${densityToken(8)}`,
    '--sn-layout-menu-label-size': typeToken(11),
    '--sn-layout-menu-gap': densityToken(4),
    '--sn-layout-menu-action-gap': densityToken(4),
    '--sn-layout-menu-action-height': densityToken(28),
    '--sn-layout-menu-action-padding': `${densityToken(4)} ${densityToken(8)}`,
    '--sn-layout-overflow-inline-size': densityToken(960),
    '--sn-layout-scroll-inline-extra': densityToken(320),
    '--sn-layout-overflow-block-size': densityToken(720),
    '--sn-layout-responsive-panel-min-block-size': densityToken(260),
    '--sn-layout-collapsed-vertical-size': densityToken(28),
    '--sn-layout-collapsed-type-padding': `${densityToken(4)} ${densityToken(8)}`,
    '--sn-layout-collapsed-button-padding': densityToken(4),
    '--sn-layout-collapsed-horizontal-size': densityToken(32),
    '--sn-layout-collapsed-horizontal-type-padding': `${densityToken(6)} ${densityToken(4)}`,
    '--sn-layout-collapsed-horizontal-button-padding': `${densityToken(8)} ${densityToken(4)}`,
    '--sn-layout-resizer-thickness': `${(1 + outlineStrength * 2).toFixed(2)}px`,
    '--sn-fullscreen-tab-bar-height': densityToken(32),
    '--sn-fullscreen-panel-z': '30010',
    '--sn-fullscreen-tab-bar-z': '30020',
    '--sn-fullscreen-tab-gap': densityToken(6),
    '--sn-fullscreen-tab-padding': `0 ${densityToken(12)}`,
    '--sn-fullscreen-tab-height': densityToken(32),
    '--sn-fullscreen-tab-active-height': densityToken(33),
    '--sn-panel-menu-padding': `${densityToken(4)} 0`,
    '--sn-panel-menu-item-gap': densityToken(8),
    '--sn-panel-menu-item-padding': `${densityToken(8)} ${densityToken(12)}`,
    '--sn-scrollbar-thumb': `hsl(0 0% ${text.toFixed(1)}% / ${dark ? 0.08 : 0.24})`,
    '--sn-scrollbar-thumb-hover': dark
      ? `hsl(0 0% ${text.toFixed(1)}% / 0.25)`
      : `hsl(${state.hue} ${neutralChroma} ${accentLight}% / 0.55)`,
    '--sn-scrollbar-track': 'transparent',
    '--sn-scrollbar-width': 'thin',
    '--sn-scrollbar-size': '10px',
    '--sn-scrollbar-radius': '999px',
    '--sn-scrollbar-thumb-border': '3px solid transparent',
    '--sn-scrollbar-thumb-min-size': '36px',
    '--sn-scroll-shadow-size': `${state.scrollShadow.toFixed(1)}px`,
    '--sn-scroll-area-padding': `${densityToken(6)} ${densityToken(8)}`,
    ...resolvedRecipe.overrides,
  };

  return {
    name: 'cascade-theme',
    descriptor: completeCascadeThemeDescriptor(tokens),
    state,
    recipe: resolvedRecipe.recipe,
    relations: resolvedRecipe.relations,
    overrides: resolvedRecipe.overrides,
    tokens,
  };
}

export {
  getCascadeThemeRecipe,
  getCascadeThemeRecipeDescriptor,
  getCascadeThemeRelation,
  isBoundedThemeOverride,
  listCascadeThemeRecipes,
  listCascadeThemeRelations,
  normalizeThemeOverrides,
  resolveCascadeThemeRecipe,
  THEME_RECIPE_CATALOG,
  THEME_RECIPE_NAMES,
  THEME_RELATION_DEFINITIONS,
} from './theme-recipes.js';

export function applyCascadeTheme(element, options = {}, eventOptions = {}) {
  ensureSystemCascade(element?.ownerDocument ?? globalThis.document);
  let theme = createCascadeTheme(options);
  for (let [key, value] of Object.entries(theme.tokens)) {
    element?.style?.setProperty(key, value);
  }
  element?.setAttribute?.('data-cascade-theme-variant', theme.state.themeVariant);
  element?.setAttribute?.('data-cascade-tab-shape', theme.state.tabShape);
  if (eventOptions.notify !== false && typeof CustomEvent === 'function') {
    element?.dispatchEvent?.(new CustomEvent('cascade-theme-change', {
      bubbles: true,
      composed: true,
      detail: {
        source: eventOptions.source || 'applyCascadeTheme',
        state: theme.state,
        theme,
        targetSelector: eventOptions.targetSelector || null,
      },
    }));
  }
  return theme;
}
