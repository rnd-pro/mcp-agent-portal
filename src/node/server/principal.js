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
    return anonymousPrincipal(normalized);
  }
  if (channel === 'daemon') {
    return daemonPrincipal(normalized);
  }
  return anonymousPrincipal(normalized);
}

/**
 * Frozen mutation-policy entrypoint. Policy enforcement (capability checks against
 * the intent) lands in Phase 2 — the gate engine, S6. This slice freezes the
 * signature and is the named home for that decision; the stub is permissive so
 * current behavior does not regress.
 *
 * @param {{ type: string, boardId?: string, cardId?: string, fromColumnId?: string, toColumnId?: string, capability?: string }} intent
 * @param {{ kind: string, id: string, capabilities: string[], label: string, transport: object }} principal
 * @param {{ board?: object, card?: object, now?: number }} [context]
 * @returns {{ ok: boolean, verdict: 'accepted'|'blocked'|'pendingApproval'|'rolledBack', reason?: string, capability?: string }}
 */
export function evaluateIntent(intent, principal, context) {
  void intent;
  void principal;
  void context;
  return { ok: true, verdict: 'accepted' };
}
