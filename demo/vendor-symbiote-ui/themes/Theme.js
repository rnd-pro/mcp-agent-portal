/**
 * Theme — JSON-driven CSS token system for node graph styling
 *
 * Applies design tokens as CSS custom properties on a target element.
 * Themes are plain objects — AI can generate them on the fly.
 *
 * @module symbiote-ui/themes/Theme
 */

/**
 * @typedef {Object} ThemeDefinition
 * @property {string} name - Theme identifier
 * @property {Object<string, string>} tokens - CSS custom property key-value pairs
 */


export { DEFAULT_PROVIDER_THEME } from './default-provider.js';
export { DEFAULT_PROVIDER_THEME as DEFAULT_THEME } from './default-provider.js';
export {
  applyCascadeTheme,
  applyCascadeThemeBundle,
  applyCascadeThemeScope,
  applyCascadeThemeScopes,
  applyCascadeGeometryRegister,
  CASCADE_THEME_DEFAULTS,
  CASCADE_THEME_DESCRIPTOR,
  CASCADE_THEME_REGISTER_STORAGE_SUFFIX,
  CASCADE_THEME_TAB_SHAPES,
  CASCADE_THEME_TOKEN_TARGETS,
  CASCADE_THEME_VARIANTS,
  CASCADE_THEME_VARIANT_PRESETS,
  clearCascadeGeometryRegister,
  clearCascadeThemeInlineTokens,
  createCascadeTheme,
  getCascadeThemeRecipe,
  getCascadeThemeRecipeDescriptor,
  getCascadeThemeRelation,
  getCascadeThemeVariantPreset,
  getReadableTextForHsl,
  getCascadeThemeControls,
  isBoundedThemeOverride,
  isCascadeThemeBundle,
  listCascadeThemeRecipes,
  listCascadeThemeRelations,
  normalizeCascadeGeometryRegister,
  normalizeCascadeTabShape,
  normalizeCascadeThemeOptions,
  normalizeCascadeThemeVariant,
  normalizeThemeOverrides,
  persistCascadeThemeScopeRegister,
  persistCascadeThemeScopeState,
  readCascadeThemeScopeState,
  removeCascadeThemeScopeState,
  resetCascadeThemeScopes,
  resolveCascadeThemeRecipe,
  resolveCascadeThemeScopeTarget,
  resolveCascadeThemeVariantState,
  seedCascadeThemeScopeState,
  serializeCascadeThemeBundle,
  THEME_RECIPE_CATALOG,
  THEME_RECIPE_NAMES,
  THEME_RELATION_DEFINITIONS,
} from './cascade-theme.js';

export {
  applyMotion,
  DEFAULT_MOTION,
  SMOOTH_MOTION,
  FAST_MOTION,
  DISABLED_MOTION,
  ScopedAnimationScope,
  animateSpring,
  stagger,
  makeDraggable,
} from './Motion.js';

export {
  applyThemePresets,
  resolveThemePresets,
  resolveThemePresetsForTask,
  PANEL_THEME_PRESETS,
  COLOR_PRESETS,
  SKIN_PRESETS,
  MOTION_PRESETS,
} from './ThemeFactory.js';

/**
 * Mapping from layout global tokens to symbiote-ui tokens.
 * Layout module uses --bg-*, --text-* format; this bridges them.
 * @type {Object<string, string>}
 */
const LAYOUT_TOKEN_MAP = {
  '--bg-panel': '--sn-sys-surface-raised',
  '--bg-deeper': '--sn-sys-surface',
  '--layout-gap-bg': '--sn-layout-gap-bg',
  '--bg-header': '--sn-node-header-bg',
  '--bg-popup': '--sn-sys-surface-overlay',
  '--text-main': '--sn-sys-on-surface',
  '--text-dim': '--sn-sys-on-surface-dim',
  '--text-muted': '--sn-sys-on-surface-dim',
  '--layout-border': '--sn-layout-border',
  '--layout-highlight': '--sn-sys-accent',
  '--border-popup': '--sn-ctx-border',
  '--accent': '--sn-sys-accent',
  '--font-main': '--sn-font',
};

/**
 * Apply a theme to a DOM element
 * @param {HTMLElement} element
 * @param {ThemeDefinition} theme
 */
export function applyTheme(element, theme) {
  ensureSystemCascade(element?.ownerDocument ?? globalThis.document);
  for (const [key, value] of Object.entries(theme.tokens)) {
    element.style.setProperty(key, value);
  }

  for (const [layoutToken, snToken] of Object.entries(LAYOUT_TOKEN_MAP)) {
    let value = theme.tokens[snToken];
    if (value) {
      element.style.setProperty(layoutToken, value);
    }
  }

  if (theme.extraCSS) {
    let existing = element.querySelector('style[data-theme]');
    if (existing) existing.remove();
    let style = document.createElement('style');
    style.setAttribute('data-theme', theme.name || 'custom');
    style.textContent = theme.extraCSS;
    element.prepend(style);
  }
}

/**
 * Extract current theme tokens from an element
 * @param {HTMLElement} element
 * @param {ThemeDefinition} reference - reference theme for token keys
 * @returns {ThemeDefinition}
 */
export function extractTheme(element, reference) {
  let tokens = {};
  let computed = getComputedStyle(element);
  for (const key of Object.keys(reference.tokens)) {
    tokens[key] = computed.getPropertyValue(key).trim() || reference.tokens[key];
  }
  return { name: 'extracted', tokens };
}

export {
  applyTailwindBridge,
  hasTailwind,
} from './TailwindBridge.js';

export {
  STATUS_HUE_OFFSETS,
  systemCascadeCss,
  undeclaredSystemRoles,
} from './system-cascade.js';
import { ensureSystemCascade } from './system-cascade.js';
export { ensureSystemCascade };
