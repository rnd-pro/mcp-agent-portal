/**
 * Generate tokens/system.json — the DTCG catalog of the T2 system-role contract — from
 * tokens/tiers.js, so the public catalog can never drift from the machine contract
 * (single source of truth; see docs/cascade-theme-architecture.md).
 *
 * Usage: node scripts/build-system-tokens.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SYSTEM_ROLES,
  SYSTEM_ROLE_SYNTAX,
  STATE_LAYER_MIX,
  REF_RAMP_FAMILIES,
  REF_RAMP_STOPS,
} from '../tokens/tiers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(here, '..', 'tokens', 'system.json');

function dtcgType(role) {
  if (role.includes('-mix') || role.includes('-opacity')) return 'number';
  if (role.includes('shadow')) return 'shadow';
  if (role.includes('-width') || role.includes('-offset') || role === '--sn-sys-density') return 'dimension';
  return 'color';
}

function groupOf(role) {
  if (role.includes('surface') || role === '--sn-sys-scrim') return 'surface';
  if (role.startsWith('--sn-sys-on-')) return 'content';
  if (role.includes('outline')) return 'outline';
  if (role.includes('state')) return 'state';
  if (role.includes('focus')) return 'focus';
  if (role.includes('shadow')) return 'elevation';
  if (role === '--sn-sys-density') return 'geometry';
  return 'accent-status';
}

let catalog = {
  $schema: 'https://design-tokens.github.io/community-group/format/',
  $description: 'symbiote-ui T2 system-role contract (generated from tokens/tiers.js — do not edit by hand)',
  sys: {},
  state: Object.fromEntries(Object.entries(STATE_LAYER_MIX).map(([k, v]) => [k, {
    $type: typeof v === 'number' ? 'number' : 'dimension',
    $value: v,
  }])),
  ref: {
    $description: 'T1 ramps are implementation, not public API; listed for tooling completeness.',
    families: { $type: 'string', $value: REF_RAMP_FAMILIES.join(',') },
    stops: { $type: 'string', $value: REF_RAMP_STOPS.join(',') },
  },
};

for (let role of SYSTEM_ROLES) {
  let group = groupOf(role);
  catalog.sys[group] ??= {};
  catalog.sys[group][role.replace('--sn-sys-', '')] = {
    $type: dtcgType(role),
    $value: `var(${role})`,
    $extensions: { 'symbiote-ui': { tier: 'sys', registeredSyntax: SYSTEM_ROLE_SYNTAX[role] ?? '<color>' } },
  };
}

fs.writeFileSync(outPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`wrote ${path.relative(process.cwd(), outPath)}: ${SYSTEM_ROLES.length} roles`);
