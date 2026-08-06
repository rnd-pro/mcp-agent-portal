/**
 * System cascade — the W1 T1/T2 derivation stylesheet of the tiered token architecture
 * (docs/cascade-theme-architecture.md). Chromium-latest, modern-only:
 *
 *  - every knob and system role is a REGISTERED typed custom property (`@property`);
 *  - T1 ramps derive from knob seeds via native relative color syntax in OKLCH;
 *  - T2 roles point into ramps; state layers are `color-mix(in oklch, …)` inputs;
 *  - mode branching (surface-ladder direction, on-surface text) uses `light-dark()` +
 *    `color-scheme` — never duplicated light/dark rule blocks.
 *
 * Everything value-bearing lives in `:where(:root, :host)` — zero specificity — so any theme,
 * engine-written inline token, or component override wins unchanged: adding this stylesheet is
 * visually inert on themed surfaces (the W1 guarantee) while making the full system available
 * everywhere. The cascade-theme engine already writes the knobs this derives from
 * (`--sn-theme-hue`, `--sn-theme-chroma`, `--sn-theme-*-lightness`, `color-scheme`); `mode` is
 * read back from `color-scheme` via `light-dark()` so the derivation needs no separate mode knob.
 *
 * Delivery: rootStyles/shadowStyles (adoptedStyleSheets) only — import the string and include
 * it in the provider chain. Node-safe: pure string building, no DOM.
 *
 * @module symbiote-ui/themes/system-cascade
 */

import {
  SYSTEM_ROLES,
  STATE_LAYER_MIX,
  REF_RAMP_STOPS,
  REF_RAMP_FAMILIES,
  systemPropertyRegistrationsCss,
} from '../tokens/tiers.js';
import { DEFAULT_PROVIDER_THEME } from './default-provider.js';

/** Semantic hue offsets (degrees from the accent hue) for the status ramp families. */
export const STATUS_HUE_OFFSETS = Object.freeze({
  success: -63,
  warning: -160,
  danger: 148,
  info: 32,
});

/**
 * Numeric knob registrations. The engine writes these as plain numbers / percentages; typing
 * them makes ramp math reliable and theme changes animatable. `--sn-ref-elev-sign` is the
 * surface-ladder direction (+1 dark = raised is lighter, -1 light), resolved from the standard
 * `color-scheme` property via `light-dark()` — the engine only ever sets `color-scheme` (already
 * true today, see `cascade-theme.js`'s `'color-scheme': dark ? 'dark' : 'light'`), never a
 * separate mode flag; `accent-lightness`/`accent-chroma` are the explicit accent overrides the
 * engine's `accentLightness`/`accentChroma` knobs used to resolve only in JS — `-1` is the same
 * "auto, derive from chroma/contrast" sentinel the JS controls already use.
 */
const KNOB_REGISTRATIONS = Object.freeze([
  { name: '--sn-theme-hue', syntax: '<number>', initial: '205' },
  { name: '--sn-theme-chroma', syntax: '<number>', initial: '54' },
  { name: '--sn-theme-bg-lightness', syntax: '<percentage>', initial: '12%' },
  { name: '--sn-theme-surface-lightness', syntax: '<percentage>', initial: '16%' },
  { name: '--sn-theme-text-lightness', syntax: '<percentage>', initial: '92%' },
  { name: '--sn-theme-accent-lightness', syntax: '<number>', initial: '-1' },
  { name: '--sn-theme-accent-chroma', syntax: '<number>', initial: '-1' },
  { name: '--sn-ref-elev-sign', syntax: '<number>', initial: '1' },
]);

function knobRegistrationsCss() {
  return KNOB_REGISTRATIONS.map(({ name, syntax, initial }) => [
    `@property ${name} {`,
    `  syntax: '${syntax}';`,
    '  inherits: true;',
    `  initial-value: ${initial};`,
    '}',
  ].join('\n')).join('\n');
}

/**
 * T1 ramp registrations: every stop of every family is a typed `<color>` property.
 * Ramps are implementation, not public API (components never consume them).
 */
function rampRegistrationsCss() {
  let out = [];
  for (let family of REF_RAMP_FAMILIES) {
    for (let stop of REF_RAMP_STOPS) {
      out.push([
        `@property --sn-ref-${family}-${stop} {`,
        "  syntax: '<color>';",
        '  inherits: true;',
        '  initial-value: transparent;',
        '}',
      ].join('\n'));
    }
  }
  return out.join('\n');
}

/**
 * Mode branch, resolved once via the standard `color-scheme` property and `light-dark()` —
 * never a duplicated light/dark rule block. `--sn-ref-elev-sign` is the one ladder input this
 * flips: dark raises panels lighter (+1), light sinks them darker (-1). The engine sets
 * `color-scheme` today (`cascade-theme.js`); it never needs a second mode knob.
 */
function modeDeclarations() {
  return [
    'color-scheme: light dark;',
    '--sn-ref-elev-sign: light-dark(-1, 1);',
  ];
}

/**
 * `-1`-sentinel auto-switch: `knob` is either exactly `-1` (auto) or in `[0,100]` (explicit
 * override) — the same contract `normalizeCascadeThemeOptions` enforces in JS today. Because
 * `clamp(0, knob + 1, 1)` is exactly `0` at the sentinel and exactly `1` everywhere in
 * `[0,100]`, `switch * knobExpr + (1 - switch) * fallbackExpr` is an exact, branch-free lerp:
 * no CSS conditional (`if()`) needed, and none is available pre-baseline. `knobExpr` must already
 * carry any unit conversion (e.g. `calc(var(--knob) * 1%)`).
 */
function autoSwitchCalc(knobVar, knobExpr, fallbackExpr) {
  let sw = `clamp(0, calc(${knobVar} + 1), 1)`;
  return `calc(${sw} * (${knobExpr}) + (1 - ${sw}) * (${fallbackExpr}))`;
}

/** OKLCH seed per family, derived from the knobs the cascade engine already writes. */
function seedDeclarations() {
  // HSL saturation (0-100) maps onto usable OKLCH chroma ≈ 0-0.28; neutrals keep a whisper of
  // hue (×0.06) so dark surfaces are not dead gray — the classic pro-editor tinted neutral.
  let accentChroma = 'calc(var(--sn-theme-chroma) * 0.0028)';
  let neutralChroma = `calc(${'var(--sn-theme-chroma)'} * 0.0028 * 0.06)`;
  // accentLightness/accentChroma are explicit accent overrides (-1 = auto, matching the JS
  // controls' sentinel): the auto-switch lerp picks the override when >=0 and falls back to
  // the chroma/65%-lightness default otherwise — no JS branching.
  let accentLightnessPct = autoSwitchCalc(
    'var(--sn-theme-accent-lightness)',
    'calc(var(--sn-theme-accent-lightness) * 1%)',
    '65%'
  );
  let accentChromaFinal = autoSwitchCalc(
    'var(--sn-theme-accent-chroma)',
    'calc(var(--sn-theme-accent-chroma) * 0.0028)',
    accentChroma
  );
  let lines = [
    `--sn-ref-neutral-seed: oklch(var(--sn-theme-bg-lightness) ${neutralChroma} var(--sn-theme-hue));`,
    `--sn-ref-accent-seed: oklch(${accentLightnessPct} ${accentChromaFinal} var(--sn-theme-hue));`,
  ];
  for (let [family, offset] of Object.entries(STATUS_HUE_OFFSETS)) {
    lines.push(`--sn-ref-${family}-seed: oklch(65% ${accentChroma} calc(var(--sn-theme-hue) + ${offset}));`);
  }
  return lines;
}

/** The 13 stops of each family: pure relative-color derivations from the family seed. */
function rampDeclarations() {
  let lines = [];
  for (let family of REF_RAMP_FAMILIES) {
    for (let stop of REF_RAMP_STOPS) {
      lines.push(`--sn-ref-${family}-${stop}: oklch(from var(--sn-ref-${family}-seed) ${stop}% c h);`);
    }
  }
  return lines;
}

/**
 * T2 role defaults. The surface ladder steps off the background knob by fixed OKLCH lightness
 * offsets in the elevation direction (`--sn-ref-elev-sign`): dark mode raises panels lighter,
 * light mode sinks them darker — monotonic chrome, never hand-picked per component.
 */
function systemRoleDeclarations() {
  let ladder = (offset) =>
    `oklch(from var(--sn-ref-neutral-seed) calc(l + ${offset} * var(--sn-ref-elev-sign)) c h)`;
  let onStatus = (family) =>
    `oklch(from var(--sn-ref-${family}-seed) 96% calc(c * 0.3) h)`;
  let container = (family) =>
    `color-mix(in oklch, var(--sn-sys-${family}) 16%, ${ladder('0.06')})`;
  let onContainer = (family) =>
    `oklch(from var(--sn-ref-${family}-seed) calc(50% + 38% * var(--sn-ref-elev-sign)) calc(c * 0.85) h)`;
  let lines = [
    // surface ladder
    `--sn-sys-surface-sunken: ${ladder('-0.03')};`,
    '--sn-sys-surface: var(--sn-ref-neutral-seed);',
    `--sn-sys-surface-panel: ${ladder('0.03')};`,
    `--sn-sys-surface-raised: ${ladder('0.06')};`,
    `--sn-sys-surface-toolbar: ${ladder('0.09')};`,
    `--sn-sys-surface-overlay: ${ladder('0.12')};`,
    '--sn-sys-scrim: oklch(from var(--sn-ref-neutral-0) l c h / 55%);',
    // content
    '--sn-sys-on-surface: oklch(from var(--sn-ref-neutral-seed) var(--sn-theme-text-lightness) calc(c * 0.5) h);',
    '--sn-sys-on-surface-dim: color-mix(in oklch, var(--sn-sys-on-surface) 72%, var(--sn-sys-surface));',
    '--sn-sys-on-surface-faint: color-mix(in oklch, var(--sn-sys-on-surface) 45%, var(--sn-sys-surface));',
    '--sn-sys-on-accent: oklch(from var(--sn-ref-accent-seed) 98% calc(c * 0.2) h);',
    '--sn-sys-on-status: oklch(from var(--sn-ref-neutral-seed) 98% calc(c * 0.2) h);',
    // outline
    '--sn-sys-outline-subtle: color-mix(in oklch, var(--sn-sys-on-surface) 12%, var(--sn-sys-surface));',
    '--sn-sys-outline: color-mix(in oklch, var(--sn-sys-on-surface) 24%, var(--sn-sys-surface));',
    '--sn-sys-outline-strong: color-mix(in oklch, var(--sn-sys-on-surface) 45%, var(--sn-sys-surface));',
    '--sn-sys-outline-focus: var(--sn-sys-focus-ring);',
    // accent + status families
    '--sn-sys-accent: var(--sn-ref-accent-60);',
    `--sn-sys-accent-container: ${container('accent')};`,
  ];
  for (let family of Object.keys(STATUS_HUE_OFFSETS)) {
    lines.push(
      `--sn-sys-${family}: var(--sn-ref-${family}-60);`,
      `--sn-sys-${family}-container: ${container(family)};`,
      `--sn-sys-on-${family}-container: ${onContainer(family)};`,
    );
  }
  lines.push(
    // state layers — the ONLY sanctioned hover/press/select/drag styling inputs
    `--sn-sys-state-hover-mix: ${STATE_LAYER_MIX.hover};`,
    `--sn-sys-state-pressed-mix: ${STATE_LAYER_MIX.pressed};`,
    `--sn-sys-state-selected-mix: ${STATE_LAYER_MIX.selected};`,
    `--sn-sys-state-dragged-mix: ${STATE_LAYER_MIX.dragged};`,
    `--sn-sys-state-disabled-opacity: ${STATE_LAYER_MIX.disabledOpacity};`,
    // focus
    '--sn-sys-focus-ring: var(--sn-ref-accent-70);',
    '--sn-sys-focus-ring-width: 2px;',
    '--sn-sys-focus-ring-offset: 1px;',
    // elevation (geometry from the register profile, color from the neutral ramp)
    '--sn-sys-shadow-raised: 0 4px 16px oklch(from var(--sn-ref-neutral-0) l c h / 35%);',
    '--sn-sys-shadow-overlay: 0 8px 32px oklch(from var(--sn-ref-neutral-0) l c h / 50%);',
    // geometry indicator (read-only; the register profile is the writer)
    "--sn-sys-density: 'product';",
  );
  return lines;
}

/** The complete W1 system-cascade stylesheet. */
export function systemCascadeCss() {
  let block = [
    ...modeDeclarations(),
    ...seedDeclarations(),
    ...rampDeclarations(),
    ...systemRoleDeclarations(),
  ].map(line => `  ${line}`).join('\n');
  return [
    knobRegistrationsCss(),
    rampRegistrationsCss(),
    systemPropertyRegistrationsCss(),
    `:where(:root, :host) {\n${block}\n}`,
  ].join('\n');
}

/** Sanity: every declared system role receives a default in this stylesheet. */
export function undeclaredSystemRoles() {
  let css = systemCascadeCss();
  return SYSTEM_ROLES.filter(role => !css.includes(`${role}:`));
}

const foundationSheets = new WeakMap();
const systemCascadeSheets = new WeakMap();

/**
 * Node-safe provider-foundation CSS generator sourced directly from default provider tokens.
 * @returns {string}
 */
export function providerFoundationCss() {
  const rules = [];
  for (const [key, value] of Object.entries(DEFAULT_PROVIDER_THEME.tokens)) {
    rules.push(`  ${key}: ${value};`);
  }
  return `:where(:root, :host) {\n${rules.join('\n')}\n}`;
}

/**
 * Adopt the provider-foundation stylesheet on a document (idempotent, WeakMap-cached).
 * @param {Document} [doc]
 * @returns {CSSStyleSheet | null}
 */
export function ensureProviderFoundation(doc = globalThis.document) {
  if (!doc) return null;
  const Ctor = doc.defaultView?.CSSStyleSheet || (typeof CSSStyleSheet !== 'undefined' ? CSSStyleSheet : null);
  if (!Ctor) return null;
  let sheet = foundationSheets.get(doc);
  if (!sheet) {
    sheet = new Ctor();
    sheet.replaceSync(providerFoundationCss());
    foundationSheets.set(doc, sheet);
  }
  const systemCascadeSheet = systemCascadeSheets.get(doc);
  const index = doc.adoptedStyleSheets.indexOf(systemCascadeSheet);
  if (!doc.adoptedStyleSheets.includes(sheet)) {
    if (index !== -1) {
      const nextSheets = [...doc.adoptedStyleSheets];
      nextSheets.splice(index, 0, sheet);
      doc.adoptedStyleSheets = nextSheets;
    } else {
      doc.adoptedStyleSheets = [sheet, ...doc.adoptedStyleSheets];
    }
  }
  return sheet;
}

/**
 * Adopt the system-cascade stylesheet on a document (idempotent, WeakMap-cached).
 * Custom properties inherit into shadow trees and `@property`
 * registrations are document-global, so document-level adoption lights up the T2 roles
 * for every component regardless of shadow boundaries. No-op outside a DOM context.
 * @param {Document} [doc]
 * @returns {CSSStyleSheet | null}
 */
export function ensureSystemCascade(doc = globalThis.document) {
  if (!doc) return null;
  const Ctor = doc.defaultView?.CSSStyleSheet || (typeof CSSStyleSheet !== 'undefined' ? CSSStyleSheet : null);
  if (!Ctor) return null;
  let sheet = systemCascadeSheets.get(doc);
  if (!sheet) {
    sheet = new Ctor();
    sheet.replaceSync(systemCascadeCss());
    systemCascadeSheets.set(doc, sheet);
  }
  ensureProviderFoundation(doc);
  if (!doc.adoptedStyleSheets.includes(sheet)) {
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  }
  return sheet;
}
