import { DEFAULT_PROVIDER_THEME } from '../themes/default-provider.js';

/**
 * XR chrome design tokens — the single Node-safe source that derives concrete
 * XR chrome/panel values from the provider theme (`themes/default-provider.js`).
 *
 * Canvas and WebGL renderers cannot consume `var(--sn-*)` CSS cascades, so this
 * module resolves the small subset of the cascade the XR chrome needs into
 * literal colors (`#rrggbb` / `rgba(...)`) and font stacks. Every consumer —
 * the Three adapter chrome visuals here, product canvas panels downstream —
 * maps its roles onto these resolved tokens instead of hardcoding values, so
 * re-theming the provider re-themes the XR chrome with it.
 *
 * Sizing is intentionally NOT duplicated here: chrome geometry stays owned by
 * `computeXRPanelChromeLayout` (panel UV zones or the meters→UV channel), and
 * the chrome textures draw in fractions of their zone, so controls scale
 * proportionally with the panel and keep matching their hit zones.
 *
 * @module symbiote-ui/xr/chrome-theme
 */

export const XR_DESIGN_TOKENS_VERSION = 'xr-design-tokens-v1';

/**
 * XR chrome roles → provider design tokens. Accent carries the primary grab
 * affordance (move bar, pointer), neutral on-surface carries the window
 * controls (close/reset/pin buttons, corner grips), success marks the pinned
 * state, and the surface family paints panel backgrounds on canvas.
 */
export const XR_CHROME_TOKEN_BINDINGS = Object.freeze({
  accent: '--sn-sys-accent',
  onSurface: '--sn-sys-on-surface',
  onSurfaceDim: '--sn-sys-on-surface-dim',
  success: '--sn-sys-success',
  warning: '--sn-sys-warning',
  danger: '--sn-sys-danger',
  surface: '--sn-sys-surface',
  surfacePanel: '--sn-sys-surface-panel',
  outline: '--sn-sys-outline',
});

export const XR_CHROME_TYPOGRAPHY_BINDINGS = Object.freeze({
  fontFamily: '--sn-font',
  fontFamilyMono: '--sn-font-mono',
});

// Reads a `var(--name[, fallback])` call starting at `from` (index of 'v');
// fallbacks may nest (`var(--a, hsl(var(--b) ...))`), so parens are balanced
// by hand instead of a flat regex.
function parseVarCall(text, from) {
  let index = from + 4;
  let depth = 1;
  let name = '';
  let fallback = null;
  while (index < text.length && depth > 0) {
    let char = text[index];
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
    if (char === ',' && depth === 1 && fallback == null) {
      fallback = '';
    } else if (fallback == null) {
      name += char;
    } else {
      fallback += char;
    }
    index += 1;
  }
  return {
    name: name.trim(),
    fallback: fallback == null ? null : fallback.trim(),
    end: index + 1,
  };
}

function expandCssVars(theme, input, depth = 0) {
  if (input == null || depth > 12) return input == null ? '' : String(input);
  let text = String(input);
  if (!text.includes('var(')) return text;
  let out = '';
  let index = 0;
  while (index < text.length) {
    if (text.startsWith('var(', index)) {
      let call = parseVarCall(text, index);
      let resolved = theme[call.name] != null
        ? expandCssVars(theme, theme[call.name], depth + 1)
        : '';
      if (resolved) {
        out += resolved;
      } else if (call.fallback != null) {
        out += expandCssVars(theme, call.fallback, depth + 1);
      } else {
        out += `var(${call.name})`;
      }
      index = call.end;
    } else {
      out += text[index];
      index += 1;
    }
  }
  return out;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hslToRgb(hue, saturation, lightness) {
  let h = ((hue % 360) + 360) % 360;
  let s = Math.max(0, Math.min(1, saturation));
  let l = Math.max(0, Math.min(1, lightness));
  let c = (1 - Math.abs(2 * l - 1)) * s;
  let hp = h / 60;
  let x = c * (1 - Math.abs((hp % 2) - 1));
  let [r1, g1, b1] = hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [c, 0, x]
    : [c, x, 0];
  let m = l - c / 2;
  return {
    r: clampByte((r1 + m) * 255),
    g: clampByte((g1 + m) * 255),
    b: clampByte((b1 + m) * 255),
  };
}

const RESOLVED_HSL = /^hsl\(\s*(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%(?:\s*\/\s*([\d.]+%?))?\s*\)$/;
const RESOLVED_RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/;

function toHexChannel(value) {
  return value.toString(16).padStart(2, '0');
}

/**
 * Normalizes a fully-resolved color expression to a canvas/WebGL-safe literal:
 * `#rrggbb` when opaque, `rgba(r, g, b, a)` when translucent. Unresolvable
 * expressions (calc, color-mix, remaining var refs) are returned unchanged so
 * callers can decide on a fallback.
 */
export function normalizeXRDesignTokenColor(value) {
  let text = String(value || '').trim();
  let hsl = text.match(RESOLVED_HSL);
  if (hsl) {
    let { r, g, b } = hslToRgb(Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100);
    let alpha = hsl[4] == null ? 1 : hsl[4].endsWith('%') ? Number(hsl[4].slice(0, -1)) / 100 : Number(hsl[4]);
    return alpha >= 1 ? `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  let rgb = text.match(RESOLVED_RGB);
  if (rgb) {
    let [r, g, b] = [clampByte(Number(rgb[1])), clampByte(Number(rgb[2])), clampByte(Number(rgb[3]))];
    let alpha = rgb[4] == null ? 1 : rgb[4].endsWith('%') ? Number(rgb[4].slice(0, -1)) / 100 : Number(rgb[4]);
    return alpha >= 1 ? `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return text;
}

/** Converts a resolved token color to a THREE-style hex number, or null when not opaque/hex. */
export function xrDesignTokenColorNumber(value) {
  let text = String(value || '').trim();
  let match = text.match(/^#([0-9a-f]{6})$/i);
  return match ? parseInt(match[1], 16) : null;
}

/**
 * Resolves the XR chrome token bindings against a provider theme object.
 * Defaults to the live `DEFAULT_PROVIDER_THEME`, so the resolved values can
 * never drift from the tokens that render the 2D provider surfaces.
 */
export function resolveXRDesignTokens(theme = DEFAULT_PROVIDER_THEME) {
  // Accepts both a ThemeDefinition ({ name, tokens }) and a bare token map.
  let candidate = theme && typeof theme === 'object' ? theme : DEFAULT_PROVIDER_THEME;
  let source = candidate.tokens && typeof candidate.tokens === 'object' ? candidate.tokens : candidate;
  let colors = {};
  for (let [role, token] of Object.entries(XR_CHROME_TOKEN_BINDINGS)) {
    colors[role] = normalizeXRDesignTokenColor(expandCssVars(source, source[token]));
  }
  let typography = {};
  for (let [role, token] of Object.entries(XR_CHROME_TYPOGRAPHY_BINDINGS)) {
    typography[role] = expandCssVars(source, source[token]).trim();
  }
  return Object.freeze({
    version: XR_DESIGN_TOKENS_VERSION,
    colors: Object.freeze(colors),
    typography: Object.freeze(typography),
    bindings: Object.freeze({
      colors: { ...XR_CHROME_TOKEN_BINDINGS },
      typography: { ...XR_CHROME_TYPOGRAPHY_BINDINGS },
    }),
  });
}

/** Resolved once at module load: the default chrome palette for XR visuals. */
export const XR_DEFAULT_DESIGN_TOKENS = resolveXRDesignTokens();
