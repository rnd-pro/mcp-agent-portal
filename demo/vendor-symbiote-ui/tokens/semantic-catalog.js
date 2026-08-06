/**
 * Semantic token catalog — the categorized index of the provider's component
 * cascade tokens (`--sn-card-*`, `--sn-button-*`, `--sn-field-*`, ...).
 *
 * `tokens/scale.js` owns the primitive RUNGS (spacing, type, radius); this module
 * owns the SEMANTIC layer that sits on top of them. An agent building a new
 * surface asks this catalog "what does a card expose?" and reuses
 * `--sn-card-bg` / `--sn-card-border` / `--sn-card-radius` instead of inventing
 * values, so the new module reads as part of the system rather than a graft.
 *
 * The catalog is DERIVED, not authored: it reads the live provider token object
 * (`themes/default-provider.js`) at call time, so it can never drift from the
 * tokens that actually render. Each token is grouped by COMPONENT FAMILY (the
 * segment(s) after `--sn-`) and tagged with a ROLE inferred from its name.
 *
 * Node-safe: no DOM access. `discover.js` exposes the catalog so agents and
 * tooling get the same view.
 *
 * @module symbiote-ui/tokens/semantic-catalog
 */

import { DEFAULT_PROVIDER_THEME } from '../themes/default-provider.js';

/** Catalog schema version, bumped when the shape of the descriptor changes. */
export const SEMANTIC_CATALOG_VERSION = 'semantic-catalog-v1';

/**
 * Component families whose name spans two segments (`--sn-list-detail-*`, not a
 * `list` family with a `detail-*` member). Family extraction is otherwise the
 * single segment after `--sn-`; this is the only place a compound name is
 * declared, and it is matched against live token names so a typo here simply
 * fails to group rather than inventing a family that does not exist.
 *
 * Ordered longest-first is unnecessary (each prefix is two segments) but the set
 * is kept explicit so the grouping rule stays auditable.
 */
const COMPOUND_FAMILIES = Object.freeze([
  'list-detail',
  'list-item',
  'tree-panel',
  'data-table',
  'output-preview',
  'empty-state',
  'source-editor',
  'node-callout',
  'node-error-frame',
  'node-header',
  'chat-item',
  'chat-user',
  'chat-agent',
  'chat-message',
  'graph-explorer',
  'graph-type',
  'graph-cluster',
  'canvas-graph',
  'tab-accent',
]);

/**
 * Primitive / global token families that are NOT component-semantic: the raw
 * scale rungs and theme controls everything else derives from. They are real
 * `--sn-*` tokens, so they are surfaced under a single `_base` family rather
 * than dropped, but they sort first and are never the answer to "reuse the
 * card's tokens". A token belongs to `_base` when its first segment is one of
 * these, or when it is a bare single-segment token (`--sn-sys-surface`, `--sn-sys-on-surface`).
 */
const BASE_FAMILY = '_base';
const BASE_SEGMENTS = Object.freeze(new Set([
  'theme', 'hue', 'sat', 'lit', 'alpha', 'space', 'text', 'radius', 'font',
  'overlay', 'shadow', 'transition', 'animation', 'motion',
]));

/** Canonical role names, in a stable display order. */
export const SEMANTIC_ROLES = Object.freeze([
  'bg', 'border', 'text', 'radius', 'spacing', 'size',
  'font-size', 'font-weight', 'shadow', 'state', 'motion', 'other',
]);

/**
 * Role keyword tables. Each token's role is decided by scanning its segments
 * (after the family) against these, in the precedence order below. Precedence
 * matters: `--sn-card-hover-bg` is a background that happens to be a state, and
 * we classify it as the concrete CSS axis (`bg`) it sets, not `state`; `state`
 * only wins when no concrete axis keyword is present (`--sn-list-item-active-bg`
 * → `bg`, but a bare `--sn-...-disabled` → `state`).
 */
const RADIUS_KEYWORDS = new Set(['radius']);
const BORDER_KEYWORDS = new Set(['border', 'outline', 'divider', 'stroke', 'ring']);
const SPACING_KEYWORDS = new Set([
  'padding', 'gap', 'margin', 'inset', 'offset', 'indent', 'top', 'right',
  'bottom', 'left', 'block', 'inline',
]);
const SIZE_KEYWORDS = new Set([
  'size', 'width', 'height', 'min', 'max', 'lines', 'line', 'scale',
]);
const BG_KEYWORDS = new Set(['bg', 'background', 'fill', 'backdrop', 'track', 'thumb', 'glare']);
const TEXT_KEYWORDS = new Set(['color', 'text', 'label', 'title', 'placeholder', 'value', 'fg', 'foreground', 'muted', 'dim']);
const FONT_WEIGHT_KEYWORDS = new Set(['weight', 'font-weight']);
const SHADOW_KEYWORDS = new Set(['shadow', 'glow', 'elevation']);
const STATE_KEYWORDS = new Set(['hover', 'active', 'selected', 'focus', 'disabled', 'pressed', 'checked', 'running', 'idle']);
const MOTION_KEYWORDS = new Set(['transition', 'duration', 'easing', 'motion', 'animation', 'spin', 'play-state']);

/**
 * Words that, when they immediately precede a trailing `-size`, mark the token
 * as a TYPE size rather than a box dimension. `--sn-card-title-size` (a font
 * size) vs `--sn-tree-icon-size` (a glyph box). Without this split, a bare
 * `-size` suffix would have to guess, and the provider mixes both spellings.
 */
const TYPE_SIZE_KEYWORDS = new Set([
  'title', 'label', 'description', 'meta', 'hint', 'phase', 'sub', 'kind',
  'header', 'cell', 'placeholder', 'value', 'text', 'name', 'panel',
]);

/**
 * Decide the role of a token from the segments that follow its family.
 * @param {string} token full custom-property name (`--sn-card-hover-bg`)
 * @param {string} family resolved family (`card`)
 * @returns {string} one of {@link SEMANTIC_ROLES}
 */
function roleForToken(token, family) {
  let body = token.startsWith(`--sn-${family}-`)
    ? token.slice(`--sn-${family}-`.length)
    : token.replace(/^--sn-/, '');
  let lower = body.toLowerCase();
  let segments = lower.split('-');

  // Explicit two-word axes first.
  if (lower.includes('font-size')) return 'font-size';
  if (lower.includes('font-weight')) return 'font-weight';

  // A trailing `-size` is the size axis, split into type vs box dimension by
  // the word before it (e.g. `title-size` is type, `icon-size` is a box).
  if (lower.endsWith('-size') && segments.length >= 2) {
    return TYPE_SIZE_KEYWORDS.has(segments.at(-2)) ? 'font-size' : 'size';
  }

  let has = (table) => segments.some((seg) => table.has(seg));

  // Concrete CSS axes win over state/other; ordered by specificity.
  if (has(RADIUS_KEYWORDS)) return 'radius';
  if (has(SHADOW_KEYWORDS)) return 'shadow';
  if (has(FONT_WEIGHT_KEYWORDS)) return 'font-weight';
  if (has(BG_KEYWORDS)) return 'bg';
  if (has(BORDER_KEYWORDS)) return 'border';
  if (has(SPACING_KEYWORDS)) return 'spacing';
  if (has(MOTION_KEYWORDS)) return 'motion';
  if (has(TEXT_KEYWORDS)) return 'text';
  if (has(SIZE_KEYWORDS)) return 'size';
  if (has(STATE_KEYWORDS)) return 'state';
  return 'other';
}

/**
 * Extract the component family from a token name.
 * @param {string} token full custom-property name
 * @returns {string} family, or {@link BASE_FAMILY} for primitives/globals
 */
function familyForToken(token) {
  if (!token.startsWith('--sn-')) return BASE_FAMILY;
  let rest = token.slice('--sn-'.length);
  let segments = rest.split('-');
  if (segments.length <= 1) return BASE_FAMILY; // bare `--sn-sys-surface`, `--sn-sys-on-surface`

  let twoSegment = `${segments[0]}-${segments[1]}`;
  if (COMPOUND_FAMILIES.includes(twoSegment)) return twoSegment;

  let head = segments[0];
  if (BASE_SEGMENTS.has(head)) return BASE_FAMILY;
  return head;
}

/**
 * Read the live provider token names. Sorted for deterministic output.
 * @returns {string[]}
 */
function providerTokenNames() {
  return Object.keys(DEFAULT_PROVIDER_THEME.tokens)
    .filter((name) => name.startsWith('--sn-'))
    .sort();
}

/**
 * Build the family → tokens index from the live provider tokens.
 * @returns {Map<string, Array<{token: string, role: string}>>}
 */
function buildIndex() {
  let index = new Map();
  for (let token of providerTokenNames()) {
    let family = familyForToken(token);
    let role = roleForToken(token, family);
    if (!index.has(family)) index.set(family, []);
    index.get(family).push({ token, role });
  }
  return index;
}

/**
 * The categorized catalog of semantic component tokens.
 *
 * `_base` (scale primitives and theme controls) is included but sorts first so
 * consumers can skip it; every component family that exposes at least one token
 * appears with its tokens and their roles.
 *
 * @returns {{
 *   version: string,
 *   totalTokens: number,
 *   roles: string[],
 *   families: Array<{ family: string, tokenCount: number, tokens: Array<{token: string, role: string}> }>,
 * }}
 */
export function getSemanticTokenCatalog() {
  let index = buildIndex();
  let usedRoles = new Set();
  let totalTokens = 0;

  let families = [...index.entries()]
    .map(([family, tokens]) => {
      let sorted = [...tokens].sort((a, b) => a.token.localeCompare(b.token));
      for (let entry of sorted) usedRoles.add(entry.role);
      totalTokens += sorted.length;
      return { family, tokenCount: sorted.length, tokens: sorted };
    })
    .filter((entry) => entry.tokenCount > 0)
    .sort((a, b) => {
      if (a.family === BASE_FAMILY) return -1;
      if (b.family === BASE_FAMILY) return 1;
      return a.family.localeCompare(b.family);
    });

  let roles = SEMANTIC_ROLES.filter((role) => usedRoles.has(role));

  return { version: SEMANTIC_CATALOG_VERSION, totalTokens, roles, families };
}

/**
 * The `{token, role}` entries for a single family (case-insensitive).
 * @param {string} name family name, e.g. `card`, `Button`, `list-detail`
 * @returns {Array<{token: string, role: string}>} empty array when unknown
 */
export function tokensForFamily(name) {
  let target = String(name || '').trim().toLowerCase();
  if (!target) return [];
  let index = buildIndex();
  for (let [family, tokens] of index) {
    if (family.toLowerCase() === target) {
      return [...tokens].sort((a, b) => a.token.localeCompare(b.token));
    }
  }
  return [];
}

/**
 * The token names within a family that fill a given role.
 * @param {string} family family name (case-insensitive)
 * @param {string} role one of {@link SEMANTIC_ROLES}
 * @returns {string[]} token names, empty when no match
 */
export function tokensByRole(family, role) {
  let target = String(role || '').trim().toLowerCase();
  if (!target) return [];
  return tokensForFamily(family)
    .filter((entry) => entry.role === target)
    .map((entry) => entry.token);
}
