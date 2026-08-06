import { applyCascadeTheme } from './cascade-theme.js';
import {
  MOTION_PRESET_DEFINITIONS,
  getMotionPresetOptions,
} from './Motion.js';

export const COLOR_PRESETS = Object.freeze({
  carbon: { mode: 'dark', hue: 218, chroma: 0, brightness: 0, contrast: 58 },
  neon: { mode: 'dark', hue: 280, chroma: 80, brightness: 5, contrast: 65 },
  pcb: { mode: 'dark', hue: 148, chroma: 70, brightness: 2, contrast: 60 },
  ebook: { mode: 'light', hue: 35, chroma: 12, brightness: 0, contrast: 55 },
  dark: { mode: 'dark', hue: 218, chroma: 89, brightness: 0, contrast: 100 },
  light: { mode: 'light', hue: 218, chroma: 89, brightness: 0, contrast: 100 },
});

export const SKIN_PRESETS = Object.freeze({
  modern: { density: 100, outline: 38, type: 100, heading: 100 },
  compact: { density: 80, outline: 50, type: 90, heading: 90 },
  rounded: { density: 120, outline: 30, type: 110, heading: 110 },
});

export const MOTION_PRESETS = Object.freeze(Object.fromEntries(
  Object.keys(MOTION_PRESET_DEFINITIONS).map((name) => [name, getMotionPresetOptions(name)])
));

export const PANEL_THEME_PRESETS = Object.freeze({
  chat: { color: 'dark', skin: 'modern', motion: 'smooth' },
  editor: { color: 'carbon', skin: 'compact', motion: 'fast' },
  monitor: { color: 'pcb', skin: 'compact', motion: 'fast' },
  terminal: { color: 'carbon', skin: 'compact', motion: 'disabled' },
});

/**
 * Combine preset names into resolved cascade theme parameters
 * @param {object} [presets]
 * @param {string} [presets.color]
 * @param {string} [presets.skin]
 * @param {string} [presets.motion]
 * @returns {object} resolved cascade options
 */
export function resolveThemePresets(presets = {}) {
  let colorName = presets.color || presets.colorPreset || presets.palette || 'dark';
  let skinName = presets.skin || presets.skinPreset || presets.layout || 'modern';
  let motionName = presets.motion || presets.motionPreset || 'default';

  let colorOpts = COLOR_PRESETS[colorName] || COLOR_PRESETS['dark'];
  let skinOpts = SKIN_PRESETS[skinName] || SKIN_PRESETS['modern'];
  let motionOpts = MOTION_PRESETS[motionName] || MOTION_PRESETS['default'];

  return {
    ...colorOpts,
    ...skinOpts,
    ...motionOpts,
  };
}

/**
 * Composes presets and applies the cascade theme to an element
 * @param {HTMLElement} element
 * @param {object} [presets]
 * @returns {object} cascade theme representation
 */
export function applyThemePresets(element, presets = {}) {
  let resolved = resolveThemePresets(presets);
  return applyCascadeTheme(element, resolved);
}

/**
 * Returns preset combination for a semantic task/panel type
 * @param {string} task - e.g. 'chat', 'editor', 'monitor', 'terminal'
 * @returns {object} presets mapping { color, skin, motion }
 */
export function resolveThemePresetsForTask(task) {
  let normalized = String(task || '').toLowerCase();
  return PANEL_THEME_PRESETS[normalized] || PANEL_THEME_PRESETS['chat'];
}
