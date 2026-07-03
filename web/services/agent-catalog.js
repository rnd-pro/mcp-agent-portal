/**
 * Agent identity catalog — slug → { icon, color, description, role, resourceGroup } as declared
 * in each agent's team-memory frontmatter (served by GET /api/agents). One shared TTL cache so
 * every panel (board chips, card inspector) renders the same agent identity without re-fetching.
 */

const AGENT_CATALOG_ENDPOINT = '/api/agents';
const CACHE_TTL_MS = 60_000;

let _cache = null;
let _cacheAt = 0;
let _inflight = null;

export async function fetchAgentCatalog(options = {}) {
  if (_cache && Date.now() - _cacheAt < CACHE_TTL_MS && !options.force) return _cache;
  if (_inflight) return _inflight;

  let fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return _cache ?? new Map();

  _inflight = (async () => {
    try {
      let response = await fetchImpl(options.endpoint || AGENT_CATALOG_ENDPOINT, {
        headers: { Accept: 'application/json' },
        signal: options.signal,
      });
      if (!response.ok) return _cache ?? new Map();
      let payload = await response.json();
      let map = new Map();
      for (let agent of Array.isArray(payload?.agents) ? payload.agents : []) {
        if (agent?.slug) map.set(agent.slug, agent);
      }
      _cache = map;
      _cacheAt = Date.now();
      return map;
    } catch {
      return _cache ?? new Map();
    } finally {
      _inflight = null;
    }
  })();
  return _inflight;
}

/** Synchronous read of the last loaded catalog (empty until the first fetch resolves). */
export function agentCatalogSnapshot() {
  return _cache ?? new Map();
}
