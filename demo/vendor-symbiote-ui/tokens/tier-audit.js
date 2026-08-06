/**
 * Tier-contract audit checks (docs/cascade-theme-architecture.md, error level since wave 3).
 * Pure functions over CSS text — `scripts/tier-audit.js` is the CLI walker; `audit.js` runs
 * them in the main pipeline. Node-safe, no DOM, no filesystem here.
 *
 * Checks:
 *  - `literal-color`: component CSS must not carry literal colors (LITERAL_COLOR_ALLOWLIST
 *    excepted) — every color resolves through a token chain terminating in a T2 role.
 *  - `tier-direction`: a token definition may only reference tokens its tier is allowed to
 *    see (component→sys, sys→ref, domain→ref/sys; nothing→component).
 *  - `state-layer`: :hover/:active/[aria-selected] rules that recolor without the state-mix
 *    system are bespoke effects (SYM-017).
 *
 * @module symbiote-ui/tokens/tier-audit
 */

import { classifyToken, aliasingAllowed, LITERAL_COLOR_ALLOWLIST } from './tiers.js';

const LITERAL_COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:hsla?|rgba?)\(/g;
const TOKEN_DEF_RE = /(--sn-[a-z0-9-]+)\s*:\s*([^;]+);/g;
const TOKEN_REF_RE = /var\(\s*(--sn-[a-z0-9-]+)/g;
// hover/active/pressed/selected/dragged: pseudo-classes and data-state/aria-* attribute
// selectors alike (SYM-017 — the only sanctioned recolor path is the state-mix system).
const STATE_SELECTOR_RE = /[^{}]*(?::hover|:active|:focus(?:-visible)?|\[aria-(?:selected|pressed)[^\]]*\]|\[data-(?:state|pressed|selected|dragged|drop-active)[^\]]*\])[^{}]*\{[^{}]*\}/g;
const COLOR_PROP_RE = /(?:^|;|\{)\s*(?:background|background-color|color|border-color|outline-color)\s*:/;

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/** Literal colors outside the allowlist in one CSS text. */
export function findLiteralColors(text, { file = '' } = {}) {
  let findings = [];
  for (let match of text.matchAll(LITERAL_COLOR_RE)) {
    let literal = match[0];
    if (LITERAL_COLOR_ALLOWLIST.includes(literal)) continue;
    findings.push({
      check: 'literal-color',
      file,
      line: lineOf(text, match.index),
      detail: `literal color \`${literal.trim()}\` — resolve through a token chain ending in a T2 role`,
    });
  }
  return findings;
}

/** Tier-direction violations across all `--sn-*: … var(--sn-*)` definitions in one CSS text. */
export function findTierViolations(text, { file = '' } = {}) {
  let findings = [];
  for (let def of text.matchAll(TOKEN_DEF_RE)) {
    let fromTier = classifyToken(def[1]);
    if (!fromTier) continue;
    for (let ref of def[2].matchAll(TOKEN_REF_RE)) {
      let toTier = classifyToken(ref[1]);
      if (!toTier || toTier === fromTier && fromTier === 'component') continue;
      if (!aliasingAllowed(fromTier, toTier)) {
        findings.push({
          check: 'tier-direction',
          file,
          line: lineOf(text, def.index),
          detail: `${def[1]} (${fromTier}) references ${ref[1]} (${toTier}) — direction not allowed`,
        });
      }
    }
  }
  return findings;
}

/** Bespoke state effects: interactive-state rules that recolor without the state-mix tokens. */
export function findBespokeStateEffects(text, { file = '' } = {}) {
  let findings = [];
  for (let match of text.matchAll(STATE_SELECTOR_RE)) {
    let rule = match[0];
    if (!COLOR_PROP_RE.test(rule)) continue;
    if (rule.includes('--sn-sys-state-') || rule.includes('color-mix')) continue;
    findings.push({
      check: 'state-layer',
      file,
      line: lineOf(text, match.index),
      detail: 'interactive-state recolor without the state-mix system (use color-mix + --sn-sys-state-*-mix)',
    });
  }
  return findings;
}

/**
 * Run all checks over one file's CSS text. `kind: 'component'` applies every check; theme/token
 * sources legitimately hold literals and ramp math, so they get tier-direction only.
 */
export function auditCssText(text, { file = '', kind = 'component' } = {}) {
  let findings = [...findTierViolations(text, { file })];
  if (kind === 'component') {
    findings.push(...findLiteralColors(text, { file }));
    findings.push(...findBespokeStateEffects(text, { file }));
  }
  return findings;
}
