/**
 * No-browser WCAG contrast math over resolvable CSS colors.
 *
 * Operates on concrete colors (hex, rgb()/rgba(), hsl()/hsla() with literal
 * numbers). It cannot resolve `hsl(var(--sn-hue) ...)` cascade chains — that
 * needs a computed style. Callers pass already-resolved foreground/background
 * pairs (or literal theme values) and get a ratio + WCAG level back.
 *
 * @module symbiote-ui/tokens/contrast
 */

const HEX_REG = /^#([0-9a-f]{3,8})$/i;
const RGB_REG = /^rgba?\(([^)]+)\)$/i;
const HSL_REG = /^hsla?\(([^)]+)\)$/i;

/** @param {string} input @returns {?{r:number,g:number,b:number}} sRGB 0-255, or null if unresolvable */
export function parseColor(input) {
  let text = String(input || '').trim();
  let hex = text.match(HEX_REG);
  if (hex) return parseHex(hex[1]);
  let rgb = text.match(RGB_REG);
  if (rgb) return parseRgb(rgb[1]);
  let hsl = text.match(HSL_REG);
  if (hsl) return parseHsl(hsl[1]);
  return null;
}

function parseHex(body) {
  let h = body.length === 3 || body.length === 4
    ? body.split('').map((ch) => ch + ch).join('')
    : body;
  if (h.length !== 6 && h.length !== 8) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function parseRgb(body) {
  let parts = body.split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  return { r: clampByte(parts[0]), g: clampByte(parts[1]), b: clampByte(parts[2]) };
}

function parseHsl(body) {
  let parts = body.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  let h = Number(parts[0]);
  let s = Number(String(parts[1]).replace('%', '')) / 100;
  let l = Number(String(parts[2]).replace('%', '')) / 100;
  if ([h, s, l].some((n) => Number.isNaN(n))) return null;
  return hslToRgb(h, s, l);
}

function hslToRgb(h, s, l) {
  let c = (1 - Math.abs(2 * l - 1)) * s;
  let hp = ((h % 360) + 360) % 360 / 60;
  let x = c * (1 - Math.abs((hp % 2) - 1));
  let [r1, g1, b1] = hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  let m = l - c / 2;
  return { r: clampByte((r1 + m) * 255), g: clampByte((g1 + m) * 255), b: clampByte((b1 + m) * 255) };
}

function clampByte(n) { return Math.max(0, Math.min(255, Math.round(n))); }

function relativeLuminance({ r, g, b }) {
  let [rl, gl, bl] = [r, g, b].map((channel) => {
    let v = channel / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/**
 * WCAG 2.x contrast ratio (1–21). Returns null if either color is unresolvable.
 * @param {string} foreground
 * @param {string} background
 * @returns {?number}
 */
export function contrastRatio(foreground, background) {
  let fg = parseColor(foreground);
  let bg = parseColor(background);
  if (!fg || !bg) return null;
  let lf = relativeLuminance(fg);
  let lb = relativeLuminance(bg);
  let ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
  return Math.round(ratio * 100) / 100;
}

/**
 * @param {number} ratio
 * @param {{largeText?: boolean}} [opts]
 * @returns {'AAA'|'AA'|'fail'}
 */
export function wcagLevel(ratio, { largeText = false } = {}) {
  let aa = largeText ? 3 : 4.5;
  let aaa = largeText ? 4.5 : 7;
  if (ratio >= aaa) return 'AAA';
  if (ratio >= aa) return 'AA';
  return 'fail';
}

/**
 * Check a foreground/background pair against WCAG AA.
 * @param {string} foreground
 * @param {string} background
 * @param {{largeText?: boolean}} [opts]
 * @returns {{ratio: ?number, level: string, passesAA: boolean, resolved: boolean}}
 */
export function checkContrast(foreground, background, opts = {}) {
  let ratio = contrastRatio(foreground, background);
  if (ratio === null) return { ratio: null, level: 'unresolved', passesAA: false, resolved: false };
  let level = wcagLevel(ratio, opts);
  return { ratio, level, passesAA: level !== 'fail', resolved: true };
}
