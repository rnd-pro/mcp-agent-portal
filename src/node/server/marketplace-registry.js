// @ctx marketplace-registry.ctx
/**
 * Curated MCP Server Registry — trusted sources only.
 * Categories: rnd-pro, official, google, community
 *
 * Each entry: { name, description, command, args, category, source, envHint? }
 *   - envHint: required env vars the user must set before install
 */

export let REGISTRY = [
  // ── RND-PRO (our own) ──────────────────────────────────
  {
    name: 'project-graph',
    description: 'AST-based codebase analysis, navigation, code quality, and documentation',
    command: 'npx',
    args: ['-y', 'project-graph-mcp'],
    category: 'rnd-pro',
    source: 'https://github.com/rnd-pro/project-graph-mcp',
  },
  {
    name: 'agent-pool',
    description: 'Multi-agent task delegation, scheduling, pipelines, and peer review',
    command: 'npx',
    args: ['-y', 'agent-pool-mcp'],
    category: 'rnd-pro',
    source: 'https://github.com/nicholasgriffintn/agent-pool-mcp',
  },
  {
    name: 'context-x',
    description: 'Global Memory and Team Context synchronization via Git',
    command: 'node',
    args: ['packages/context-x-mcp/src/mcp-server.js'],
    category: 'rnd-pro',
    source: 'local',
  },

  // ── Official (modelcontextprotocol) ────────────────────
  {
    name: 'filesystem',
    description: 'Secure local filesystem access — read, write, search files',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    category: 'official',
    source: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    name: 'github',
    description: 'GitHub API — repos, issues, PRs, code search',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    category: 'official',
    source: 'https://github.com/modelcontextprotocol/servers',
    envHint: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
  },
  {
    name: 'slack',
    description: 'Slack API — channels, messages, users, reactions',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    category: 'official',
    source: 'https://github.com/modelcontextprotocol/servers',
    envHint: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'],
  },
  {
    name: 'postgres',
    description: 'PostgreSQL — query databases, inspect schema',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/mydb'],
    category: 'official',
    source: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    name: 'sqlite',
    description: 'SQLite — query and manage local databases',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite', '/tmp/test.db'],
    category: 'official',
    source: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    name: 'memory',
    description: 'Knowledge graph memory — entities and relations for persistent context',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    category: 'official',
    source: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    name: 'puppeteer',
    description: 'Browser automation — navigate, screenshot, interact with web pages',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    category: 'official',
    source: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    name: 'brave-search',
    description: 'Web and local search via Brave Search API',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    category: 'official',
    source: 'https://github.com/modelcontextprotocol/servers',
    envHint: ['BRAVE_API_KEY'],
  },
  {
    name: 'fetch',
    description: 'HTTP fetch — retrieve and convert web content to markdown',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    category: 'official',
    source: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    name: 'sequential-thinking',
    description: 'Dynamic problem-solving through thought sequences with branching and revision',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    category: 'official',
    source: 'https://github.com/modelcontextprotocol/servers',
  },

  // ── Google ─────────────────────────────────────────────
  {
    name: 'google-maps',
    description: 'Google Maps API — geocoding, directions, places, elevation',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-google-maps'],
    category: 'google',
    source: 'https://github.com/modelcontextprotocol/servers',
    envHint: ['GOOGLE_MAPS_API_KEY'],
  },
  {
    name: 'gdrive',
    description: 'Google Drive — search and read files from your drive',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gdrive'],
    category: 'google',
    source: 'https://github.com/modelcontextprotocol/servers',
  },

  // ── Community (verified) ───────────────────────────────
  {
    name: 'docker',
    description: 'Docker — manage containers, images, volumes, and networks',
    command: 'npx',
    args: ['-y', 'mcp-server-docker'],
    category: 'community',
    source: 'https://github.com/ckreiling/mcp-server-docker',
  },
  {
    name: 'git',
    description: 'Git operations — log, diff, branch, commit, status',
    command: 'npx',
    args: ['-y', 'mcp-server-git'],
    category: 'community',
    source: 'https://github.com/modelcontextprotocol/servers',
  },
  {
    name: 'sentry',
    description: 'Sentry — query error tracking and performance data',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sentry'],
    category: 'community',
    source: 'https://github.com/modelcontextprotocol/servers',
    envHint: ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG'],
  },
  {
    name: 'linear',
    description: 'Linear — issues, projects, teams, cycles management',
    command: 'npx',
    args: ['-y', 'mcp-linear'],
    category: 'community',
    source: 'https://github.com/jerhadf/linear-mcp-server',
    envHint: ['LINEAR_API_KEY'],
  },
];

/**
 * Get registry grouped by category.
 * @returns {Record<string, typeof REGISTRY>}
 */
export function getRegistryByCategory() {
  let grouped = {};
  for (let entry of REGISTRY) {
    if (!grouped[entry.category]) grouped[entry.category] = [];
    grouped[entry.category].push(entry);
  }
  return grouped;
}

/**
 * Find a registry entry by name.
 * @param {string} name
 * @returns {typeof REGISTRY[0] | undefined}
 */
export function findInRegistry(name) {
  return REGISTRY.find(e => e.name === name);
}
