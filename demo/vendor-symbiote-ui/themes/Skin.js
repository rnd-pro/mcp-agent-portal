/**
 * Skin — geometry-only design tokens
 *
 * Built on the canonical geometry scale (`tokens/scale.js`): each skin is a
 * register-scoped profile of the same T-shirt spacing rungs, so changing the
 * scale values updates all semantic tokens (radius, sockets, grid) harmoniously.
 * Shadow is split into geometry (here) and color (from Palette).
 *
 * @module symbiote-ui/themes/Skin
 */

import { buildSkinGeometry } from '../tokens/scale.js';

/**
 * @typedef {Object} SkinDefinition
 * @property {string} name
 * @property {Object<string, string>} geometry
 */

/** @type {SkinDefinition} */
export let MODERN_SKIN = {
  name: 'modern',
  geometry: buildSkinGeometry('product'),
};

/** @type {SkinDefinition} */
export let COMPACT_SKIN = {
  name: 'compact',
  geometry: buildSkinGeometry('tool'),
};

/** @type {SkinDefinition} */
export let ROUNDED_SKIN = {
  name: 'rounded',
  geometry: buildSkinGeometry('spacious'),
};

/**
 * Apply skin to element
 * @param {HTMLElement} element
 * @param {SkinDefinition} skin
 */
export function applySkin(element, skin) {
  for (const [key, value] of Object.entries(skin.geometry)) {
    element.style.setProperty(key, value);
  }
}
