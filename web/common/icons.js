/**
 * Unified icon mapping and rendering for both Frontend and Backend.
 * Replaces hardcoded emojis with standard Material Symbols.
 */

export const ICONS = {
  OK: '[icon:ok]',
  ERROR: '[icon:error]',
  WAIT: '[icon:wait]',
  WARN: '[icon:warn]',
  RUN: '[icon:run]',
  INFO: '[icon:info]',
  STOP: '[icon:stop]',
  PAUSE: '[icon:pause]',
  SKIP: '[icon:skip]',
  BOUNCE: '[icon:bounce]'
};

export const ICON_MAP = {
  '[icon:ok]': { name: 'check_circle', color: 'hsl(140,40%,50%)' },
  '[icon:error]': { name: 'cancel', color: 'hsl(0,60%,60%)' },
  '[icon:wait]': { name: 'hourglass_empty', color: 'var(--sn-cat-user)' },
  '[icon:warn]': { name: 'warning', color: 'hsl(40,80%,50%)' },
  '[icon:run]': { name: 'sync', color: 'var(--sn-cat-server)' },
  '[icon:info]': { name: 'info', color: 'var(--sn-text-dim)' },
  '[icon:stop]': { name: 'block', color: 'hsl(0,60%,60%)' },
  '[icon:pause]': { name: 'pause_circle', color: 'var(--sn-text-dim)' },
  '[icon:skip]': { name: 'skip_next', color: 'var(--sn-text-dim)' },
  '[icon:bounce]': { name: 'reply', color: 'var(--sn-cat-server)' }
};

/**
 * Returns the HTML string for an icon marker.
 * @param {string} marker 
 */
export function renderIconHtml(marker) {
  let config = ICON_MAP[marker];
  if (!config) return '';
  let spin = marker === ICONS.RUN ? 'spin-icon' : '';
  return `<span class="material-symbols-outlined ${spin}" style="font-size:inherit; vertical-align:-3px; margin-right:4px; color:${config.color}">${config.name}</span>`;
}

/**
 * Replaces all icon markers in a text with their HTML equivalents.
 * Safe to use after HTML escaping.
 * @param {string} text 
 */
export function replaceIconsWithHtml(text) {
  if (!text) return '';
  return text.replace(/\[icon:[a-z]+\]/g, match => renderIconHtml(match) || match);
}
