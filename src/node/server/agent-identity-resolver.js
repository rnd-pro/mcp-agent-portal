/**
 * Server-verified agent identity for MCP callers.
 *
 * The agent-pool runner mints a per-task secret at spawn and binds it to the
 * server-assigned slug in a shared on-disk map (see task-secret-store.js, the
 * sole owner of the hash format and store location). The spawned agent carries
 * the plaintext secret to this portal as the `X-Agent-Portal-Task-Secret`
 * request header. This module resolves that secret back to the verified slug so
 * the principal layer can mint a real `agentPrincipal` instead of the anonymous
 * read-only floor.
 *
 * Identity is server-derived only: a body/client-supplied `agent_slug` or
 * `actor` is never consulted here. Resolution is fail-closed — an absent,
 * empty, unknown, expired, or otherwise unresolvable secret yields null (the
 * caller then falls back to least privilege). The plaintext secret is never
 * logged or placed in any returned value.
 *
 * Reuse note: the parent already imports from the agent-pool-mcp package
 * (adapters, settings routes), so this binds the same TaskSecretStore that the
 * runner wrote rather than reimplementing the hash/path. Single source of truth.
 *
 * @module server/agent-identity-resolver
 */

import { getTaskSecretStore } from '../../../packages/agent-pool-mcp/src/runner/task-secret-store.js';

// Short positive cache to avoid a file read per tool call. The TTL is far below
// the secret's own lifetime (24h in task-secret-store.js), so a cached binding
// can never outlive the secret it stands for. Misses are never cached: an
// invalid secret pays a fresh lookup every time, so a later valid mint is seen.
const CACHE_TTL_MS = 5000;
const cache = new Map();

/**
 * Resolve a presented per-task secret to its server-verified slug.
 *
 * @param {string} taskSecret - Plaintext secret from the request header.
 * @param {object} [opts]
 * @param {object} [opts.store] - TaskSecretStore override (tests).
 * @param {() => number} [opts.now] - Clock override (tests).
 * @returns {string|null} The server-assigned slug, or null when unresolvable.
 */
export function resolveVerifiedSlug(taskSecret, opts = {}) {
  if (!taskSecret || typeof taskSecret !== 'string') return null;

  let now = opts.now || (() => Date.now());

  if (!opts.store) {
    let hit = cache.get(taskSecret);
    if (hit && hit.expiresAt > now()) return hit.slug;
    if (hit) cache.delete(taskSecret);
  }

  let slug = null;
  try {
    let store = opts.store || getTaskSecretStore();
    let binding = store.resolve(taskSecret);
    slug = binding?.serverAssignedSlug ?? null;
  } catch {
    // Unreadable store, parse error, or any lookup failure → least privilege.
    return null;
  }

  if (!opts.store && slug) {
    cache.set(taskSecret, { slug, expiresAt: now() + CACHE_TTL_MS });
  }
  return slug;
}

/** Clear the positive-resolution cache (tests only). */
export function _resetVerifiedSlugCache() {
  cache.clear();
}
