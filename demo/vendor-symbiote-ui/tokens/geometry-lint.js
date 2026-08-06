/**
 * Consumption linting for component CSS.
 *
 * The canonical scale (`tokens/scale.js`) defines which geometry values are
 * legal; this module checks that component `.css.js` files actually consume
 * them. It is the enforcement half of the contract: the catalog validates the
 * token set, this validates the usage.
 *
 * Node-safe and DOM-free so both `audit.js` (bulk scan) and `discover.js`
 * (`validateComponent` for a single snippet) share one detector.
 *
 * Honest scope: linting is single-file. A value of `var(--sn-card-padding)`
 * satisfies the membership check here; whether that semantic token ultimately
 * resolves to a scale rung is a catalog concern, not resolvable from one file.
 *
 * @module symbiote-ui/tokens/geometry-lint
 */

import {
  DEFAULT_GEOMETRY_PROFILE,
  geometryAxisForProperty,
  snapDurationToToken,
  snapFontSizeToToken,
  snapRadiusToToken,
  snapValueToToken,
} from './scale.js';

/** Values that are never geometry literals and must not be flagged. */
const IGNORE_VALUES = new Set([
  '0', 'auto', 'inherit', 'initial', 'unset', 'revert', 'revert-layer',
  'none', 'normal', 'currentColor', 'transparent', 'fit-content',
  'min-content', 'max-content', 'subgrid',
]);

/** Selectors that legitimately seed primitive scale tokens into the cascade. */
const ROOT_SELECTOR_REG = /(^|[\s,])(:root|:host|html|\[data-theme)/;

/** Comment escapes that suppress a finding on a line (shared with color lint). */
const ESCAPE_MARKERS = ['lint-allow', 'audit-ok', 'audit-allow', 'lint-ok'];

const PRIMITIVE_TOKEN_REG = /var\(\s*(--sn-(?:step-[0-9]+|space-(?:xs|sm|md|lg|xl)))\s*[,)]/g;
const RAW_LENGTH_REG = /(?<![\w.#-])(-?\d*\.?\d+)(px|rem|em)\b/g;
const RAW_DURATION_REG = /(?<![\w.#-])(\d*\.?\d+)(ms|s)\b/g;
const MOTION_PROPERTIES = new Set(['transition', 'transition-duration', 'animation', 'animation-duration']);

function hasEscape(line) {
  return ESCAPE_MARKERS.some((marker) => line.includes(marker));
}

/** Strip spans the literal scanners must not look inside. */
function maskAllowedSpans(value) {
  return value
    .replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, ' ')
    .replace(/url\([^)]*\)/g, ' ');
}

/**
 * @param {string} property
 * @param {string} value raw declaration value (no trailing `;`)
 * @param {string} profileName
 * @returns {Array<{kind:string,property:string,value:string,literal:string,suggestion:?string,exact:?boolean}>}
 */
export function lintGeometryValue(property, value, profileName = DEFAULT_GEOMETRY_PROFILE) {
  let axis = geometryAxisForProperty(property);
  if (!axis) return [];
  let masked = maskAllowedSpans(value);
  let findings = [];
  for (let match of masked.matchAll(RAW_LENGTH_REG)) {
    let literal = match[0];
    let numeric = `${match[1]}${match[2]}`;
    if (IGNORE_VALUES.has(literal)) continue;
    let snap = axis === 'font-size'
      ? snapFontSizeToToken(numeric)
      : axis === 'radius'
        ? snapRadiusToToken(numeric)
        : snapValueToToken(property, numeric, profileName);
    findings.push({
      kind: 'raw-geometry',
      property,
      value: value.trim(),
      literal,
      suggestion: snap ? snap.token : null,
      exact: snap ? snap.exact : null,
    });
  }
  return findings;
}

/**
 * @param {string} property
 * @param {string} value
 * @returns {Array<{kind:string,property:string,literal:string,suggestion:string}>}
 */
export function lintMotionValue(property, value) {
  if (!MOTION_PROPERTIES.has(property)) return [];
  let kind = property.startsWith('animation') ? 'animation' : 'transition';
  let masked = maskAllowedSpans(value);
  let findings = [];
  for (let match of masked.matchAll(RAW_DURATION_REG)) {
    let snap = snapDurationToToken(match[0], kind);
    findings.push({
      kind: 'raw-motion',
      property,
      literal: match[0],
      suggestion: snap ? snap.token : 'var(--sn-transition-*) or var(--sn-animation-duration-*)',
    });
  }
  return findings;
}

/** Pull `property: value` declarations out of a CSS block, tracking line + selector. */
function* iterateDeclarations(content) {
  let lines = content.split('\n');
  let selector = '';
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let braceOpen = line.lastIndexOf('{');
    if (braceOpen !== -1) selector = line.slice(0, braceOpen);
    let match = line.match(/(?:^|[{;])\s*(-{0,2}[a-zA-Z][\w-]*)\s*:\s*([^;{}]+)/);
    if (match) {
      yield { property: match[1].toLowerCase(), value: match[2].trim(), line: i + 1, raw: line, selector };
    }
  }
}

/** Distinct anti-slop heuristics (huashu); >=2 in one file flags. */
function detectAntiSlop(content) {
  let triggers = [];
  let lower = content.toLowerCase();
  // Diagonal purple->cyan gradient (the canonical AI-slop hero).
  if (/linear-gradient\([^)]*\b(13[5-9]|14[0-5]|225)deg/.test(lower)
    && /(27\d|28\d)\s+\d/.test(lower) && /(18\d|19\d|20\d)\s+\d/.test(lower)) {
    triggers.push('diagonal purple→cyan gradient');
  }
  // System font promoted to a display/heading surface.
  if (/font-family[^;]*\b(system-ui|-apple-system)/.test(lower)
    && /font-size[^;]*\b([2-9]\d|\d{3})(px|rem)/.test(lower)) {
    triggers.push('system font as display type');
  }
  // Border-radius clustering: many bespoke radius values instead of the scale.
  let radii = new Set((lower.match(/border-radius\s*:\s*([^;]+)/g) || [])
    .map((d) => d.replace(/border-radius\s*:\s*/, '').trim())
    .filter((v) => !v.includes('var(')));
  if (radii.size >= 3) triggers.push(`border-radius clustering (${radii.size} bespoke values)`);
  // Decorative emoji baked into content.
  if (/content\s*:\s*["'][^"']*[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(content)) {
    triggers.push('decorative emoji in content');
  }
  return triggers;
}

/**
 * Lint one component CSS source for geometry/motion/cascade/anti-slop findings.
 * @param {Object} input
 * @param {string} input.content
 * @param {string} [input.file]
 * @param {string} [input.profile]
 * @returns {{findings: Array<Object>}}
 */
export function lintComponentCss({ content, file = '<snippet>', profile = DEFAULT_GEOMETRY_PROFILE } = {}) {
  let findings = [];

  for (let decl of iterateDeclarations(content)) {
    if (hasEscape(decl.raw)) continue;

    for (let hit of lintGeometryValue(decl.property, decl.value, profile)) {
      findings.push({
        type: 'geometry-lint',
        severity: 'warning',
        file,
        line: decl.line,
        property: hit.property,
        message: hit.suggestion
          ? `Hardcoded ${hit.property} '${hit.literal}'. Use a scale token${hit.exact ? '' : ' (nearest)'}: ${hit.suggestion}.`
          : `Hardcoded ${hit.property} '${hit.literal}'. Use a --sn-* cascade token instead of a raw value.`,
        suggestion: hit.suggestion,
      });
    }

    for (let hit of lintMotionValue(decl.property, decl.value)) {
      findings.push({
        type: 'motion-lint',
        severity: 'warning',
        file,
        line: decl.line,
        property: hit.property,
        message: `Hardcoded ${hit.property} duration '${hit.literal}'. Use ${hit.suggestion}.`,
        suggestion: hit.suggestion,
      });
    }

    // Primitive-vs-semantic cascade (SYM-011): primitive rungs seed the root,
    // component selectors consume semantic tokens.
    if (!ROOT_SELECTOR_REG.test(decl.selector)) {
      for (let match of decl.value.matchAll(PRIMITIVE_TOKEN_REG)) {
        findings.push({
          type: 'cascade-lint',
          severity: 'info',
          file,
          line: decl.line,
          property: decl.property,
          message: `Primitive scale token '${match[1]}' used in a component selector. Prefer a semantic token (e.g. --sn-card-padding) and let primitives seed :root/:host only.`,
          suggestion: null,
        });
      }
    }
  }

  let slop = detectAntiSlop(content);
  if (slop.length >= 2) {
    findings.push({
      type: 'anti-slop',
      severity: 'info',
      file,
      line: 1,
      message: `Possible AI-slop styling (${slop.length} signals: ${slop.join('; ')}). Derive from brand tokens and the scale instead.`,
      suggestion: null,
    });
  }

  return { findings };
}
