/**
 * Authenticated principal layer for the workflow board control plane.
 *
 * Identity is server-derived, never taken from a request payload. `derivePrincipal`
 * is the single chokepoint that turns a transport descriptor into a least-privilege
 * principal; the legacy free-text `actor` only survives as a derived audit label.
 *
 * @module server/principal
 */

/**
 * Capability slugs granted to principals. Enforcement (the gate engine) lands in
 * Phase 2 (S6); this module only defines and assigns them.
 */
export const CAP = {
  READ: 'board:read',
  WRITE_CARD: 'board:write-card',
  TRANSITION: 'board:transition',
  ORCHESTRATE: 'board:orchestrate',
  CONTROL: 'board:control',
  DEFINE: 'board:define',
  AUTHOR: 'board:author',
  AUDIT: 'board:audit',
  DAEMON: 'board:daemon',
};

const HUMAN_CAPABILITIES = [
  CAP.READ,
  CAP.WRITE_CARD,
  CAP.TRANSITION,
  CAP.ORCHESTRATE,
  CAP.CONTROL,
  CAP.DEFINE,
  CAP.AUTHOR,
  CAP.AUDIT,
];

const AGENT_CAPABILITIES = [
  CAP.READ,
  CAP.WRITE_CARD,
  CAP.TRANSITION,
  CAP.ORCHESTRATE,
  CAP.CONTROL,
];

function normalizeTransport(transport = {}) {
  return transport && typeof transport === 'object' ? transport : {};
}

function textOrNull(value) {
  if (value === undefined || value === null) return null;
  let text = String(value).trim();
  return text.length > 0 ? text : null;
}

/**
 * Read-only floor for unauthenticated callers. Fail-closed: no write, transition,
 * author, or audit capability.
 * @param {object} transport
 */
export function anonymousPrincipal(transport = {}) {
  return {
    kind: 'anonymous',
    id: 'anonymous',
    capabilities: [CAP.READ],
    label: 'anonymous',
    transport: normalizeTransport(transport),
  };
}

/**
 * Unverified local MCP client (e.g. the operator's IDE connection, with no per-task
 * secret). Under the same-uid trust model a local loopback HTTP request already maps to
 * a FULL human principal, so a local MCP client granted READ + WRITE_CARD is strictly
 * LESS privileged than what the same operator already has via the UI — it can submit and
 * edit work items (drop an idea into the board), but it cannot transition, orchestrate,
 * control, author policy, or sign audits. Identity stays server-derived (a fixed id,
 * never a payload value), so this grants intake without enabling identity laundering.
 * @param {object} transport
 */
export function mcpClientPrincipal(transport = {}) {
  return {
    kind: 'mcp',
    id: 'mcp-client',
    capabilities: [CAP.READ, CAP.WRITE_CARD],
    label: 'mcp-client',
    transport: normalizeTransport(transport),
  };
}

/**
 * Privileged bootstrap identity under the accepted same-uid trust model. Separated
 * duty (splitting AUTHOR/AUDIT out) is a later slice.
 * @param {{ id?: string, label?: string, transport?: object }} input
 */
export function humanPrincipal({ id, label, transport } = {}) {
  return {
    kind: 'human',
    id: textOrNull(id) ?? 'human',
    capabilities: [...HUMAN_CAPABILITIES],
    label: textOrNull(label) ?? 'human',
    transport: normalizeTransport(transport),
  };
}

/**
 * Agent identity. Agents execute work; they cannot author boards/policy (no DEFINE,
 * no AUTHOR) or sign audits (no AUDIT). `slug` is server-assigned, never payload text.
 * @param {{ slug: string, label?: string, transport?: object }} input
 */
export function agentPrincipal({ slug, label, transport } = {}) {
  let id = textOrNull(slug) ?? 'anonymous';
  return {
    kind: 'agent',
    id,
    capabilities: [...AGENT_CAPABILITIES],
    label: textOrNull(label) ?? `mcp:${id}`,
    transport: normalizeTransport(transport),
  };
}

/**
 * Board self-driven automation identity. Schedule-driven slot/step bookkeeping only —
 * no arbitrary transition or grant rights.
 * @param {object} transport
 */
export function daemonPrincipal(transport = {}) {
  return {
    kind: 'daemon',
    id: 'daemon',
    capabilities: [CAP.DAEMON],
    label: 'daemon',
    transport: normalizeTransport({ channel: 'daemon', ...normalizeTransport(transport) }),
  };
}

/**
 * Single chokepoint that derives a principal from a transport descriptor. Identity
 * is decided here from server-verified provenance only — body-supplied `actor`,
 * `agent_slug`, or any payload identity is ignored entirely.
 *
 * @param {{ channel?: string, human?: boolean, id?: string, label?: string, verifiedSlug?: string }} transport
 * @returns {{ kind: string, id: string, capabilities: string[], label: string, transport: object }}
 */
export function derivePrincipal(transport = {}) {
  let normalized = normalizeTransport(transport);
  let channel = textOrNull(normalized.channel);

  if (channel === 'http-session' && normalized.human === true) {
    return humanPrincipal({ id: normalized.id, label: normalized.label, transport: normalized });
  }
  if (channel === 'loopback') {
    return humanPrincipal({
      id: normalized.id ?? 'local-human',
      label: textOrNull(normalized.label) ?? 'local-human',
      transport: normalized,
    });
  }
  if (channel === 'mcp') {
    let verifiedSlug = textOrNull(normalized.verifiedSlug);
    if (verifiedSlug) {
      return agentPrincipal({ slug: verifiedSlug, label: normalized.label, transport: normalized });
    }
    // No server-verified slug → the local intake floor: a local MCP client may read and submit/edit
    // work items, but not drive (transition/orchestrate/control) or author (define/author/audit) the
    // board. Strictly less than the loopback-human rights the same local operator already holds.
    return mcpClientPrincipal(normalized);
  }
  if (channel === 'daemon') {
    return daemonPrincipal(normalized);
  }
  return anonymousPrincipal(normalized);
}

/**
 * Frozen intent → capability map (S6). Every mutating board intent declares the single
 * capability that authorizes it. Two of those — DEFINE and AUTHOR — are policy-authorship
 * capabilities: a principal that lacks them does not get a hard block, it gets
 * `pendingApproval` (inv 8: a policy edit by a non-author defaults to approval, not denial).
 * An intent type absent from this map fails closed.
 */
export const INTENT_CAPABILITY = {
  read: CAP.READ,
  'card.write': CAP.WRITE_CARD,
  'card.transition': CAP.TRANSITION,
  'card.orchestrate': CAP.ORCHESTRATE,
  'card.control': CAP.CONTROL,
  'checks.write.floor': CAP.AUDIT,
  'checks.write.basic': CAP.WRITE_CARD,
  'policy.define': CAP.DEFINE,
  'policy.author': CAP.AUTHOR,
  'board.control': CAP.CONTROL,
  'daemon.bookkeeping': CAP.DAEMON,
};

// Policy-authorship capabilities: absence yields pendingApproval, not a hard block.
const POLICY_AUTHORSHIP_CAPABILITIES = new Set([CAP.DEFINE, CAP.AUTHOR]);

/**
 * Frozen mutation-policy entrypoint and single gate engine (S6). Maps `intent.type` to its
 * required capability and decides the verdict purely from `principal.capabilities`:
 *   - holds the capability        → `{ ok: true, verdict: 'accepted' }`
 *   - lacks an operational cap     → `{ ok: false, verdict: 'blocked', reason, capability }`
 *   - lacks a policy-authorship cap (DEFINE/AUTHOR) → `{ ok: false, verdict: 'pendingApproval', reason, capability }`
 *   - unknown intent type          → fail closed `{ ok: false, verdict: 'blocked', reason: 'unknown intent', capability: null }`
 *
 * Identity is read ONLY from `principal`; `intent` and `context` never supply or override it.
 *
 * @param {{ type: string, boardId?: string, cardId?: string, fromColumnId?: string, toColumnId?: string, capability?: string }} intent
 * @param {{ kind: string, id: string, capabilities: string[], label: string, transport: object }} principal
 * @param {{ board?: object, card?: object, now?: number }} [context]
 * @returns {{ ok: boolean, verdict: 'accepted'|'blocked'|'pendingApproval'|'rolledBack', reason?: string, capability?: string }}
 */
export function evaluateIntent(intent, principal, context) {
  void context;
  let type = textOrNull(intent?.type);
  let required = type ? INTENT_CAPABILITY[type] : undefined;
  if (!required) {
    return { ok: false, verdict: 'blocked', reason: 'unknown intent', capability: null };
  }
  let held = Array.isArray(principal?.capabilities) ? principal.capabilities : [];
  if (held.includes(required)) {
    return { ok: true, verdict: 'accepted' };
  }
  let verdict = POLICY_AUTHORSHIP_CAPABILITIES.has(required) ? 'pendingApproval' : 'blocked';
  return {
    ok: false,
    verdict,
    reason: `Principal "${principal?.label ?? 'unknown'}" lacks capability ${required} for intent ${type}.`,
    capability: required,
  };
}
