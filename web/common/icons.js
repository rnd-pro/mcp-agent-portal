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
  '[icon:ok]': { name: 'check_circle', kind: 'ok' },
  '[icon:error]': { name: 'cancel', kind: 'error' },
  '[icon:wait]': { name: 'hourglass_empty', kind: 'wait' },
  '[icon:warn]': { name: 'warning', kind: 'warn' },
  '[icon:run]': { name: 'sync', kind: 'run' },
  '[icon:info]': { name: 'info', kind: 'info' },
  '[icon:stop]': { name: 'block', kind: 'stop' },
  '[icon:pause]': { name: 'pause_circle', kind: 'pause' },
  '[icon:skip]': { name: 'skip_next', kind: 'skip' },
  '[icon:bounce]': { name: 'reply', kind: 'bounce' }
};

/**
 * Returns the HTML string for an icon marker.
 * @param {string} marker
 * @returns {string}
 */
export function renderIconHtml(marker) {
  let config = ICON_MAP[marker];
  if (!config) return '';
  let spin = marker === ICONS.RUN ? 'spin-icon' : '';
  return `<span class="material-symbols-outlined portal-inline-icon portal-inline-icon-${config.kind} ${spin}">${config.name}</span>`;
}

/**
 * Replaces all icon markers in a text with their HTML equivalents.
 * Safe to use after HTML escaping.
 * @param {string} text
 * @returns {string}
 */
export function replaceIconsWithHtml(text) {
  if (!text) return '';
  return text.replace(/\[icon:[a-z]+\]/g, match => renderIconHtml(match) || match);
}
