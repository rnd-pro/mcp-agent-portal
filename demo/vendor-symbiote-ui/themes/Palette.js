/**
 * Palette — color-only design tokens
 *
 * Contains only chromatic properties: backgrounds, text colors,
 * accents, category colors, connection colors.
 * Separated from geometry (Skin) for independent swapping.
 *
 * @module symbiote-ui/themes/Palette
 */

/**
 * @typedef {Object} PaletteDefinition
 * @property {string} name
 * @property {Object<string, string>} colors
 */


export { DEFAULT_PROVIDER_PALETTE } from './default-provider.js';
export { DEFAULT_PROVIDER_PALETTE as DEFAULT_PALETTE } from './default-provider.js';

/**
 * Apply palette to element
 * @param {HTMLElement} element
 * @param {PaletteDefinition} palette
 */
export function applyPalette(element, palette) {
  for (const [key, value] of Object.entries(palette.colors)) {
    element.style.setProperty(key, value);
  }
}
