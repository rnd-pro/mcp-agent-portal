/**
 * Canonical geometry scale — the single source for spacing, radius, sizing,
 * typography, and connector geometry rungs.
 *
 * The rung TOKEN NAMES (`--sn-space-md`, `--sn-node-radius`, ...) are the stable
 * contract every component must consume; the concrete px values are
 * register-scoped through named profiles. Dense tool/IDE surfaces and airy
 * product surfaces share the same rung names and differ only in profile values,
 * so "use the scale" is a membership check, not an arithmetic guess.
 *
 * Node-safe: no DOM access. Themes and `themes/Skin.js` build their geometry
 * from these profiles; `audit.js`/`discover.js` read them to validate and expose
 * the scale.
 *
 * @module symbiote-ui/tokens/scale
 */

/** Spacing rung names, smallest → largest. The numbered axis the rest derives from. */
export const SPACE_RUNGS = Object.freeze(['xs', 'sm', 'md', 'lg', 'xl']);

/**
 * Register-scoped geometry profiles. `product` is the airy default. Spacing is
 * no longer a hand-authored px table per register — it is the step ladder
 * generated from two knobs: `base` (the grid quantum) and `density` (the
 * register multiplier). product=1 (exact legacy px), tool=0.75 (dense),
 * spacious=1.25 (airy). Any design re-tunes these two numbers.
 */
const PROFILES = {
  product: {
    registers: ['product', 'agent-workspace', 'media-studio', 'brand'],
    skin: 'modern',
    base: 2,
    density: 1,
    radius: { node: 'md', comment: 'sm' },
    socketSize: 'md',
    socketBorderWidth: 2,
    connWidth: 2,
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    shadowGeometry: '0 4px 16px',
    shadowAlpha: 0.3,
  },
  tool: {
    registers: ['tool', 'admin', 'editor'],
    skin: 'compact',
    base: 2,
    density: 0.75,
    radius: { node: 'md', comment: 'sm' },
    socketSize: 'md',
    socketBorderWidth: 1.5,
    connWidth: 1.5,
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    shadowGeometry: '0 2px 8px',
    shadowAlpha: 0.2,
  },
  spacious: {
    registers: ['presentation'],
    skin: 'rounded',
    base: 2,
    density: 1.25,
    radius: { node: 'lg', comment: 'md' },
    socketSize: 'md',
    socketBorderWidth: 2.5,
    connWidth: 2.5,
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 14,
    shadowGeometry: '0 6px 24px',
    shadowAlpha: 0.25,
  },
};

export const GEOMETRY_PROFILES = deepFreeze(PROFILES);
export const GEOMETRY_PROFILE_NAMES = Object.freeze(Object.keys(PROFILES));
export const DEFAULT_GEOMETRY_PROFILE = 'product';

/** Canonical geometry token names that components are allowed to consume. */
const GEOMETRY_TOKENS = Object.freeze([
  ...SPACE_RUNGS.map((rung) => `--sn-space-${rung}`),
  '--sn-node-radius',
  '--sn-comment-radius',
  '--sn-socket-size',
  '--sn-socket-border-width',
  '--sn-grid-size',
  '--sn-conn-width',
  '--sn-font-size',
]);

const GEOMETRY_TOKEN_SET = new Set(GEOMETRY_TOKENS);

/** CSS properties grouped by the geometry axis their values must come from. */
const SPACING_PROPERTIES = new Set([
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'margin-block', 'margin-inline', 'margin-block-start', 'margin-block-end',
  'margin-inline-start', 'margin-inline-end',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'padding-block', 'padding-inline', 'padding-block-start', 'padding-block-end',
  'padding-inline-start', 'padding-inline-end',
  'gap', 'row-gap', 'column-gap',
  'inset', 'inset-block', 'inset-inline', 'top', 'right', 'bottom', 'left',
]);

const RADIUS_PROPERTIES = new Set([
  'border-radius',
  'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
  'border-start-start-radius', 'border-start-end-radius',
  'border-end-start-radius', 'border-end-end-radius',
]);

const FONT_SIZE_PROPERTIES = new Set(['font-size']);

/**
 * Canonical type scale — the de-facto font sizes already in the system, named
 * so a new module picks a rung instead of an arbitrary px. Absolute (not
 * register-scoped); `--sn-font-size` remains the register-scoped body default
 * and equals `--sn-text-md`.
 */
export const TYPE_SCALE = Object.freeze({
  '2xs': 10, 'xs': 11, 'sm': 12, 'md': 13, 'lg': 14, 'xl': 16, '2xl': 18,
});
const TYPE_RUNGS = Object.freeze(Object.keys(TYPE_SCALE));
const TYPE_TOKENS = Object.freeze(TYPE_RUNGS.map((rung) => `--sn-text-${rung}`));
const TYPE_TOKEN_SET = new Set(TYPE_TOKENS);

/** Canonical font weights in use, named. */
export const WEIGHT_SCALE = Object.freeze({ normal: 400, medium: 500, semibold: 600, bold: 700 });

/**
 * Canonical motion durations (ms). `transition` rungs are for interaction
 * feedback, `animation` rungs for longer ambient motion. Mirrors the
 * `--sn-transition-*` / `--sn-animation-duration-*` root tokens.
 */
export const MOTION_SCALE = Object.freeze({
  transition: { fast: 120, normal: 240, slow: 400 },
  animation: { fast: 600, normal: 1000, slow: 1500, slower: 2000 },
});

function parseMs(rawValue) {
  let text = String(rawValue || '').trim();
  let match = text.match(/^(\d*\.?\d+)(ms|s)$/);
  if (!match) return null;
  return match[2] === 's' ? Number(match[1]) * 1000 : Number(match[1]);
}

/**
 * Snap a raw duration to the nearest motion token.
 * @param {string|number} rawValue e.g. '0.2s', '200ms'
 * @param {'transition'|'animation'} [kind]
 * @returns {{token: string, exact: boolean, nearestMs: number}|null}
 */
export function snapDurationToToken(rawValue, kind = 'transition') {
  let ms = parseMs(rawValue);
  if (ms === null) return null;
  let rungs = MOTION_SCALE[kind] || MOTION_SCALE.transition;
  let prefix = kind === 'animation' ? '--sn-animation-duration' : '--sn-transition';
  let best = null;
  for (let [rung, value] of Object.entries(rungs)) {
    let distance = Math.abs(ms - value);
    if (!best || distance < best.distance) best = { rung, value, distance };
  }
  return { token: `var(${prefix}-${best.rung})`, exact: best.distance < 1, nearestMs: best.value };
}

/** @returns {Object} agent-facing descriptor of the motion scale. */
export function getMotionScaleDescriptor() {
  return {
    version: 'motion-scale-v1',
    transition: Object.entries(MOTION_SCALE.transition).map(([rung, ms]) => ({ rung, token: `--sn-transition-${rung}`, ms })),
    animation: Object.entries(MOTION_SCALE.animation).map(([rung, ms]) => ({ rung, token: `--sn-animation-duration-${rung}`, ms })),
    note: 'Use --sn-transition-* for interaction feedback, --sn-animation-duration-* for ambient motion; both scale with the theme motion factor.',
  };
}

/** @param {string} name @returns {boolean} */
export function isTypeToken(name) {
  return TYPE_TOKEN_SET.has(String(name || '').trim());
}

/** @returns {string[]} */
export function listTypeTokens() {
  return [...TYPE_TOKENS];
}

/** The `--sn-text-*` map for seeding the root cascade. */
export function typeScaleTokens() {
  let tokens = {};
  for (let rung of TYPE_RUNGS) tokens[`--sn-text-${rung}`] = `${TYPE_SCALE[rung]}px`;
  return tokens;
}

/**
 * Snap a raw font-size to the nearest type-scale token.
 * @param {string|number} rawValue
 * @returns {{token: string, exact: boolean, nearestPx: number}|null}
 */
export function snapFontSizeToToken(rawValue) {
  let value = parsePx(rawValue);
  if (value === null) return null;
  let best = null;
  for (let rung of TYPE_RUNGS) {
    let distance = Math.abs(value - TYPE_SCALE[rung]);
    if (!best || distance < best.distance) best = { rung, px: TYPE_SCALE[rung], distance };
  }
  return { token: `var(--sn-text-${best.rung})`, exact: best.distance < 0.5, nearestPx: best.px };
}

/**
 * Canonical radius scale — the de-facto corner radii, named. Components should
 * prefer their semantic radius token (`--sn-card-radius`, `--sn-node-radius`,
 * which density-scale); these rungs define those tokens and cover new surfaces.
 * `full` is the pill/round case.
 */
export const RADIUS_SCALE = Object.freeze({ xs: 2, sm: 4, md: 6, lg: 8, xl: 12 });
const RADIUS_RUNGS = Object.freeze(Object.keys(RADIUS_SCALE));
const RADIUS_FULL_PX = 9999;
const RADIUS_TOKENS = Object.freeze([...RADIUS_RUNGS.map((r) => `--sn-radius-${r}`), '--sn-radius-full']);
const RADIUS_TOKEN_SET = new Set(RADIUS_TOKENS);

/** @param {string} name @returns {boolean} */
export function isRadiusToken(name) {
  return RADIUS_TOKEN_SET.has(String(name || '').trim());
}

/** @returns {string[]} */
export function listRadiusTokens() {
  return [...RADIUS_TOKENS];
}

/** The `--sn-radius-*` map for seeding the root cascade. */
export function radiusScaleTokens() {
  let tokens = {};
  for (let rung of RADIUS_RUNGS) tokens[`--sn-radius-${rung}`] = `${RADIUS_SCALE[rung]}px`;
  tokens['--sn-radius-full'] = `${RADIUS_FULL_PX}px`;
  return tokens;
}

/**
 * Snap a raw border-radius to the nearest radius token (large values → pill).
 * @param {string|number} rawValue
 * @returns {{token: string, exact: boolean, nearestPx: number}|null}
 */
export function snapRadiusToToken(rawValue) {
  let value = parsePx(rawValue);
  if (value === null) return null;
  if (value >= 100) return { token: 'var(--sn-radius-full)', exact: true, nearestPx: RADIUS_FULL_PX };
  let best = null;
  for (let rung of RADIUS_RUNGS) {
    let distance = Math.abs(value - RADIUS_SCALE[rung]);
    if (!best || distance < best.distance) best = { rung, px: RADIUS_SCALE[rung], distance };
  }
  return { token: `var(--sn-radius-${best.rung})`, exact: best.distance < 0.5, nearestPx: best.px };
}

/** @returns {Object} agent-facing descriptor of the radius scale. */
export function getRadiusScaleDescriptor() {
  return {
    version: 'radius-scale-v1',
    tokens: [...RADIUS_TOKENS],
    rungs: RADIUS_RUNGS.map((rung) => ({ name: rung, token: `--sn-radius-${rung}`, px: RADIUS_SCALE[rung] })),
    full: { token: '--sn-radius-full', px: RADIUS_FULL_PX },
    preferSemantic: 'Use the component semantic radius token (e.g. --sn-card-radius) when one exists; these rungs define those and cover new surfaces.',
  };
}

/** @returns {Object} agent-facing descriptor of the type scale. */
export function getTypeScaleDescriptor() {
  return {
    version: 'type-scale-v1',
    tokens: [...TYPE_TOKENS],
    rungs: TYPE_RUNGS.map((rung) => ({ name: rung, token: `--sn-text-${rung}`, px: TYPE_SCALE[rung] })),
    weights: { ...WEIGHT_SCALE },
    bodyTokenName: '--sn-font-size',
  };
}

/**
 * @param {string} property
 * @returns {'space'|'radius'|'font-size'|null}
 */
export function geometryAxisForProperty(property) {
  let prop = String(property || '').trim().toLowerCase();
  if (SPACING_PROPERTIES.has(prop)) return 'space';
  if (RADIUS_PROPERTIES.has(prop)) return 'radius';
  if (FONT_SIZE_PROPERTIES.has(prop)) return 'font-size';
  return null;
}

/** @param {string} name @returns {boolean} */
export function isGeometryToken(name) {
  return GEOMETRY_TOKEN_SET.has(String(name || '').trim());
}

/** @returns {string[]} */
export function listGeometryTokens() {
  return [...GEOMETRY_TOKENS];
}

function getProfile(profileName) {
  return PROFILES[profileName] || PROFILES[DEFAULT_GEOMETRY_PROFILE];
}

function parsePx(rawValue) {
  let text = String(rawValue || '').trim();
  let match = text.match(/^(-?\d*\.?\d+)px$/);
  if (match) return Number(match[1]);
  if (/^-?\d*\.?\d+$/.test(text)) return Number(text);
  return null;
}

/**
 * Canonical step ladder — the universal spacing primitive. Integer rung indices
 * `--sn-step-0..12` whose px = `STEP_MULTIPLES[n] × base × density`. Base 2px at
 * density 1 (product) yields the de-facto vocabulary 0/2/4/6/8/10/12/14/16/20/
 * 24/28/32; a denser or airier design re-resolves the same names by setting a
 * different `--sn-base` / `--sn-density`. The legacy `--sn-space-xs/sm/md/lg/xl`
 * names are permanent aliases onto even rungs (see `LEGACY_SPACE_STEP`).
 */
export const STEP_MULTIPLES = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16]);
export const STEP_BASE_PX = 2;
const STEP_TOKENS = Object.freeze(STEP_MULTIPLES.map((_, index) => `--sn-step-${index}`));
const STEP_TOKEN_SET = new Set(STEP_TOKENS);

/** Legacy t-shirt spacing name → step index (4/8/12/16/24px at the product base). */
export const LEGACY_SPACE_STEP = Object.freeze({ xs: 2, sm: 4, md: 6, lg: 8, xl: 10 });

/** Steps in the de-facto vocabulary, by px, for descriptor hints. */
const STEP_DEFACTO = Object.freeze({ 2: '2px', 3: '6px', 5: '10px', 7: '14px', 9: '20px' });

/** @param {string} name @returns {boolean} */
export function isStepToken(name) {
  return STEP_TOKEN_SET.has(String(name || '').trim());
}

/** @returns {string[]} */
export function listStepTokens() {
  return [...STEP_TOKENS];
}

/** px for a step at a given base/density, or null for an out-of-range index. */
export function stepPx(step, base = STEP_BASE_PX, density = 1) {
  let k = STEP_MULTIPLES[step];
  return k === undefined ? null : k * base * density;
}

/** The `--sn-step-*` map (flat px) for a fixed base/density — used by exported skins. */
export function stepScaleTokens(base = STEP_BASE_PX, density = 1) {
  let tokens = {};
  for (let index = 0; index < STEP_MULTIPLES.length; index++) {
    tokens[`--sn-step-${index}`] = `${STEP_MULTIPLES[index] * base * density}px`;
  }
  return tokens;
}

/**
 * Density-aware step ladder for the live root cascade. Each rung is
 * `calc(K × var(--sn-base) × var(--sn-density))`, so the whole ladder re-resolves
 * from the two knobs at runtime: a register toggle or the density slider moves
 * `--sn-density` and every step — and everything derived from a step — follows.
 * At base 2px / density 1 it is pixel-identical to `stepScaleTokens()`.
 */
export function stepLadderCalcTokens() {
  let tokens = {};
  for (let index = 0; index < STEP_MULTIPLES.length; index++) {
    let k = STEP_MULTIPLES[index];
    tokens[`--sn-step-${index}`] = k === 0 ? '0px' : `calc(${k} * var(--sn-base) * var(--sn-density))`;
  }
  return tokens;
}

/**
 * Live root spacing primitives: the density-aware step ladder plus the permanent
 * `--sn-space-*` t-shirt aliases onto even rungs. This is what the provider root
 * seeds so every spacing token reacts to `--sn-base` / `--sn-density`.
 */
export function rootSpacePrimitives() {
  let primitives = stepLadderCalcTokens();
  for (let rung of SPACE_RUNGS) primitives[`--sn-space-${rung}`] = `var(--sn-step-${LEGACY_SPACE_STEP[rung]})`;
  return primitives;
}

/**
 * Register density knobs — the values a geometry-register preview writes onto a
 * target so it reads at that register. A register is the two knobs (`base`,
 * `density`) plus the legacy `--sn-theme-*` scale aliases the density slider also
 * drives. Writing them from one selection moves both the step ladder (via
 * `--sn-density`) and every `calc(px × var(--sn-theme-density))` semantic token,
 * so the whole surface shifts register with no double-density. The density itself
 * lives in `--sn-theme-spacing-scale` / `--sn-theme-density` (the same vars the
 * slider sets); `--sn-density` carries the root *formula* rather than a pinned
 * number, so it keeps deriving from those vars — the preview composes with the
 * slider, and it works on a subtree target that lacks the root rule.
 */
export function geometryRegisterScaleTokens(profileName = DEFAULT_GEOMETRY_PROFILE) {
  let p = getProfile(profileName);
  let density = String(p.density);
  return {
    '--sn-base': `${p.base}px`,
    '--sn-density': 'var(--sn-theme-spacing-scale, 1)',
    '--sn-theme-density': density,
    '--sn-theme-spacing-scale': density,
    '--sn-theme-radius-scale': '1',
  };
}

/**
 * Snap a raw spacing value to the nearest step rung (product base).
 * @param {string|number} rawValue
 * @returns {{token: string, exact: boolean, nearestPx: number}|null}
 */
export function snapSpaceToStep(rawValue) {
  let value = parsePx(rawValue);
  if (value === null) return null;
  let best = null;
  for (let index = 0; index < STEP_MULTIPLES.length; index++) {
    let px = STEP_MULTIPLES[index] * STEP_BASE_PX;
    let distance = Math.abs(value - px);
    if (!best || distance < best.distance) best = { step: index, px, distance };
  }
  return { token: `var(--sn-step-${best.step})`, exact: best.distance < 0.5, nearestPx: best.px };
}

/** @returns {Object} agent-facing descriptor of the step ladder. */
export function getStepScaleDescriptor() {
  return {
    version: 'step-scale-v1',
    basePx: STEP_BASE_PX,
    model: 'px = STEP_MULTIPLES[n] * --sn-base * --sn-density; the rung index is register-agnostic, the px register-scoped.',
    steps: STEP_MULTIPLES.map((k, index) => ({ step: index, token: `--sn-step-${index}`, k, productPx: k * STEP_BASE_PX, defacto: STEP_DEFACTO[index] || null })),
    legacyAliases: Object.fromEntries(Object.entries(LEGACY_SPACE_STEP).map(([rung, step]) => [`--sn-space-${rung}`, `--sn-step-${step}`])),
    registers: GEOMETRY_PROFILE_NAMES.map((name) => ({ name, base: PROFILES[name].base, density: PROFILES[name].density })),
    preferSemantic: 'Prefer a semantic token (e.g. --sn-card-padding) when a family owns the role; otherwise a --sn-step-* rung. The --sn-space-* t-shirt names are permanent aliases onto even rungs.',
  };
}

/**
 * Snap a raw geometry value to the nearest canonical scale token for a profile.
 * @param {string} property CSS property name (decides the axis)
 * @param {string|number} rawValue e.g. '12px'
 * @param {string} [profileName]
 * @returns {{token: string, exact: boolean, nearestPx: number, axis: string}|null}
 */
export function snapValueToToken(property, rawValue, profileName = DEFAULT_GEOMETRY_PROFILE) {
  let axis = geometryAxisForProperty(property);
  if (!axis) return null;
  let value = parsePx(rawValue);
  if (value === null) return null;
  let profile = getProfile(profileName);

  if (axis === 'font-size') {
    return {
      token: 'var(--sn-font-size)',
      exact: Math.abs(value - profile.fontSize) < 0.5,
      nearestPx: profile.fontSize,
      axis,
    };
  }

  let snap = snapSpaceToStep(value);
  if (!snap) return null;
  return { token: snap.token, exact: snap.exact, nearestPx: snap.nearestPx, axis };
}

/**
 * The spacing-rung primitives for a profile, as a `--sn-space-*` map.
 *
 * This is the subset of the scale that seeds the root cascade so component CSS
 * can consume `var(--sn-space-md)` app-wide. Derived tokens (node-radius, grid,
 * sockets) are intentionally excluded — they are owned by the skin / provider
 * root and must not be re-seeded here.
 * @param {string} [profileName]
 * @returns {Object<string,string>}
 */
export function geometrySpacePrimitives(profileName = DEFAULT_GEOMETRY_PROFILE) {
  let p = getProfile(profileName);
  let primitives = stepScaleTokens(p.base, p.density);
  for (let rung of SPACE_RUNGS) primitives[`--sn-space-${rung}`] = `var(--sn-step-${LEGACY_SPACE_STEP[rung]})`;
  return primitives;
}

/**
 * Build the geometry custom-property map for a profile. This is the single
 * source `themes/Skin.js` skins are generated from.
 * @param {string} profileName
 * @returns {Object<string,string>}
 */
export function buildSkinGeometry(profileName) {
  let p = getProfile(profileName);
  let geometry = stepScaleTokens(p.base, p.density);
  for (let rung of SPACE_RUNGS) geometry[`--sn-space-${rung}`] = `var(--sn-step-${LEGACY_SPACE_STEP[rung]})`;
  geometry['--sn-node-radius'] = `var(--sn-space-${p.radius.node})`;
  geometry['--sn-comment-radius'] = `var(--sn-space-${p.radius.comment})`;
  geometry['--sn-socket-size'] = `var(--sn-space-${p.socketSize})`;
  geometry['--sn-socket-border-width'] = `${p.socketBorderWidth}px`;
  geometry['--sn-grid-size'] = 'var(--sn-space-xl)';
  geometry['--sn-conn-width'] = String(p.connWidth);
  geometry['--sn-font'] = p.fontFamily;
  geometry['--sn-font-size'] = `${p.fontSize}px`;
  geometry['--sn-shadow-geometry'] = p.shadowGeometry;
  geometry['--sn-node-shadow'] = `var(--sn-shadow-geometry) var(--sn-shadow-color, rgba(0, 0, 0, ${p.shadowAlpha}))`;
  return geometry;
}

/**
 * Emit the geometry scale as a CSS custom-property block for a profile.
 * @param {string} [profileName]
 * @returns {string}
 */
export function geometryScaleCss(profileName = DEFAULT_GEOMETRY_PROFILE) {
  let geometry = buildSkinGeometry(profileName);
  return Object.entries(geometry)
    .map(([token, value]) => `  ${token}: ${value};`)
    .join('\n');
}

/**
 * Native `@property` registrations for the concrete geometry tokens.
 *
 * Only primitives with a computationally-independent initial value are
 * registered — derived aliases (`--sn-node-radius: var(--sn-space-md)`) cannot
 * carry a `var()` initial-value and inherit their validity from the primitive.
 *
 * `inherits: true` is deliberate and overrides the original spec note of
 * `inherits:false`: these are cascade tokens (SYM-011), so they must inherit or
 * the cascade-token model breaks. Registration still gives the wanted benefit —
 * an invalid value computes to `initial-value` instead of poisoning the cascade.
 *
 * @param {string} [profileName]
 * @returns {Array<{name:string,syntax:string,inherits:boolean,initialValue:string}>}
 */
export function geometryAtPropertyRegistrations(profileName = DEFAULT_GEOMETRY_PROFILE) {
  let p = getProfile(profileName);
  // --sn-space-* are var() aliases onto step rungs now, so (like --sn-node-radius)
  // they are not @property-registrable; only the concrete step primitives are.
  let registrations = [];
  for (let index = 0; index < STEP_MULTIPLES.length; index++) {
    registrations.push({ name: `--sn-step-${index}`, syntax: '<length>', inherits: true, initialValue: `${STEP_MULTIPLES[index] * p.base * p.density}px` });
  }
  registrations.push(
    { name: '--sn-base', syntax: '<length>', inherits: true, initialValue: `${p.base}px` },
    { name: '--sn-density', syntax: '<number>', inherits: true, initialValue: String(p.density) },
    { name: '--sn-socket-border-width', syntax: '<length>', inherits: true, initialValue: `${p.socketBorderWidth}px` },
    { name: '--sn-conn-width', syntax: '<number>', inherits: true, initialValue: String(p.connWidth) },
    { name: '--sn-font-size', syntax: '<length>', inherits: true, initialValue: `${p.fontSize}px` },
  );
  return registrations;
}

/**
 * Emit the geometry `@property` registrations as a CSS block.
 * @param {string} [profileName]
 * @returns {string}
 */
export function geometryAtPropertyCss(profileName = DEFAULT_GEOMETRY_PROFILE) {
  return geometryAtPropertyRegistrations(profileName)
    .map((reg) => [
      `@property ${reg.name} {`,
      `  syntax: '${reg.syntax}';`,
      `  inherits: ${reg.inherits};`,
      `  initial-value: ${reg.initialValue};`,
      '}',
    ].join('\n'))
    .join('\n');
}

/**
 * Agent-facing descriptor of the geometry scale for `discover`.
 * @returns {Object}
 */
export function getGeometryScaleDescriptor() {
  return {
    version: 'geometry-scale-v1',
    defaultProfile: DEFAULT_GEOMETRY_PROFILE,
    spaceRungs: [...SPACE_RUNGS],
    tokens: listGeometryTokens(),
    profiles: GEOMETRY_PROFILE_NAMES.map((name) => ({
      name,
      registers: [...PROFILES[name].registers],
      skin: PROFILES[name].skin,
      base: PROFILES[name].base,
      density: PROFILES[name].density,
      fontSize: PROFILES[name].fontSize,
    })),
    axes: {
      space: [...SPACING_PROPERTIES],
      radius: [...RADIUS_PROPERTIES],
      'font-size': [...FONT_SIZE_PROPERTIES],
    },
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (let child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const CONNECTION_MARKER_METRICS = deepFreeze({
  portClearance: 24,
  bendClearance: 16,
  labelClearance: 30,
  minMarkerLength: 15,
  minTrunk: 10,
  minTail: 10,
  flowWidth: 28.8,
  flowHeight: 16,
  flowArrowTailX: -7.2,
  flowArrowTipX: 6,
  flowArrowHalfHeight: 5,
  flowBidirectionalTipX: 10.8,
  flowBidirectionalBaseX: 2.4,
  flowBidirectionalHalfHeight: 4,
  junctionRadius: 14,
  junctionInnerRadius: 6,
  gateSize: 32,
  protectedRouteHalfWidth: 1.5,
});
