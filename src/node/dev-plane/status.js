import fs from 'node:fs';
import path from 'node:path';

const DEV_PLANE_PACKAGE = 'symbiote-dev-plane';
const DEV_PLANE_ROOT_ENV = 'SYMBIOTE_DEV_PLANE_ROOT';

function makeIssue(severity, code, message) {
  return { severity, code, message };
}

function readJson(filePath, code, message) {
  try {
    return { value: JSON.parse(fs.readFileSync(filePath, 'utf8')), issue: null };
  } catch {
    return { value: null, issue: makeIssue('error', code, message) };
  }
}

function explicitConfigRoot(config = {}) {
  return config.agentPortal?.devPlane?.root || config.devPlane?.root || null;
}

function emptySummary() {
  return {
    packageCount: 0,
    alternateSourceCount: 0,
    browserImportCount: 0,
    groups: {},
    packageIds: [],
  };
}

function emptyMcpSummary() {
  return {
    expectedServerCount: 0,
    configuredServerCount: 0,
    npmServerCount: 0,
    localServerCount: 0,
    customServerCount: 0,
    missingServerCount: 0,
    entries: [],
    issues: [],
  };
}

function sortedObject(value) {
  let result = {};
  for (let key of Object.keys(value).sort()) {
    result[key] = value[key];
  }
  return result;
}

function summarizeManifest(manifest = {}) {
  let packages = Array.isArray(manifest.packages) ? manifest.packages : [];
  let groups = {};
  let packageIds = [];
  let browserImportCount = 0;

  for (let pkg of packages) {
    let group = String(pkg?.group || 'unknown');
    groups[group] = (groups[group] || 0) + 1;
    if (pkg?.id) packageIds.push(String(pkg.id));
    if (pkg?.browserImports && typeof pkg.browserImports === 'object') {
      browserImportCount += Object.keys(pkg.browserImports).length;
    }
  }

  return {
    packageCount: packages.length,
    alternateSourceCount: Array.isArray(manifest.alternateSources)
      ? manifest.alternateSources.length
      : 0,
    browserImportCount,
    groups: sortedObject(groups),
    packageIds: packageIds.sort(),
  };
}

function readServerEntries(mcpServers) {
  if (!mcpServers) return [];
  if (mcpServers instanceof Map) return [...mcpServers.entries()];
  if (typeof mcpServers === 'object') return Object.entries(mcpServers);
  return [];
}

function inferServerName(packageName) {
  let name = String(packageName || '');
  if (!name.endsWith('-mcp')) return null;
  return name.slice(0, -4);
}

function isLocalishValue(value) {
  let text = String(value || '').trim();
  if (!text || /^[a-z]+:\/\//i.test(text)) return false;
  return text.startsWith('/')
    || text.startsWith('./')
    || text.startsWith('../')
    || text.includes('/')
    || text.includes('\\');
}

function classifyServerResolution(settings, packageName) {
  if (!settings) {
    return {
      configured: false,
      resolution: 'missing',
      issueCode: 'dev-plane-mcp-server-unconfigured',
    };
  }

  let command = String(settings.command || '').trim();
  let args = Array.isArray(settings.args) ? settings.args.map(arg => String(arg)) : [];

  if (command === 'npx' && args.includes(packageName)) {
    return {
      configured: true,
      resolution: 'npm',
      issueCode: null,
    };
  }

  if (isLocalishValue(command) || args.some(isLocalishValue)) {
    return {
      configured: true,
      resolution: 'local',
      issueCode: 'dev-plane-mcp-server-local-command',
    };
  }

  return {
    configured: true,
    resolution: 'custom',
    issueCode: 'dev-plane-mcp-server-custom-command',
  };
}

function countResolution(summary, resolution) {
  if (resolution === 'npm') summary.npmServerCount += 1;
  if (resolution === 'local') summary.localServerCount += 1;
  if (resolution === 'custom') summary.customServerCount += 1;
  if (resolution === 'missing') summary.missingServerCount += 1;
}

function summarizeMcpSources(manifest = {}, mcpServers) {
  let serverEntries = new Map(readServerEntries(mcpServers));
  let packages = Array.isArray(manifest.packages) ? manifest.packages : [];
  let entries = [];
  let issues = [];

  for (let pkg of packages) {
    if (pkg?.group !== 'agent-portal') continue;
    let serverName = inferServerName(pkg.packageName);
    if (!serverName) continue;

    let classification = classifyServerResolution(serverEntries.get(serverName), pkg.packageName);
    let entry = {
      serverName,
      packageId: String(pkg.id || serverName),
      packageName: String(pkg.packageName),
      configured: classification.configured,
      resolution: classification.resolution,
      issueCodes: classification.issueCode ? [classification.issueCode] : [],
    };
    entries.push(entry);

    if (classification.issueCode) {
      issues.push({
        severity: classification.resolution === 'missing' ? 'info' : 'warning',
        code: classification.issueCode,
        serverName,
      });
    }
  }

  entries.sort((a, b) => a.serverName.localeCompare(b.serverName));
  let summary = {
    ...emptyMcpSummary(),
    expectedServerCount: entries.length,
    entries,
    issues,
  };

  for (let entry of entries) {
    if (entry.configured) summary.configuredServerCount += 1;
    countResolution(summary, entry.resolution);
  }

  return summary;
}

/**
 * @param {{ projectRoot?: string, env?: NodeJS.ProcessEnv, config?: object }} options
 * @returns {{ path: string, source: string, explicit: boolean }}
 */
export function resolveDevPlaneRoot(options = {}) {
  let env = options.env || process.env;
  let envRoot = env[DEV_PLANE_ROOT_ENV];
  if (envRoot) {
    return { path: path.resolve(envRoot), source: 'env', explicit: true };
  }

  let configRoot = explicitConfigRoot(options.config);
  if (configRoot) {
    return { path: path.resolve(configRoot), source: 'config', explicit: true };
  }

  let projectRoot = path.resolve(options.projectRoot || process.cwd());
  let siblingRoot = path.join(path.dirname(projectRoot), DEV_PLANE_PACKAGE);
  return {
    path: siblingRoot,
    source: fs.existsSync(siblingRoot) ? 'sibling' : 'missing',
    explicit: false,
  };
}

/**
 * @param {{ projectRoot?: string, env?: NodeJS.ProcessEnv, config?: object, mcpServers?: Map<string, object>|object }} options
 * @returns {object}
 */
export function createDevPlaneStatus(options = {}) {
  let resolved = resolveDevPlaneRoot(options);
  let root = { source: resolved.source };

  if (!fs.existsSync(resolved.path)) {
    let explicit = resolved.explicit;
    return {
      ok: false,
      state: explicit ? 'error' : 'missing',
      configured: explicit,
      root,
      manifest: null,
      summary: emptySummary(),
      mcp: emptyMcpSummary(),
      issues: [
        makeIssue(
          explicit ? 'error' : 'info',
          explicit ? 'dev-plane-root-unavailable' : 'dev-plane-not-found',
          explicit
            ? 'Configured Symbiote dev plane root is not readable.'
            : 'No Symbiote dev plane root was discovered for this project.',
        ),
      ],
    };
  }

  let packageResult = readJson(
    path.join(resolved.path, 'package.json'),
    'dev-plane-package-unreadable',
    'Symbiote dev plane package metadata could not be read.',
  );
  if (packageResult.issue) {
    return {
      ok: false,
      state: 'error',
      configured: true,
      root,
      manifest: null,
      summary: emptySummary(),
      mcp: emptyMcpSummary(),
      issues: [packageResult.issue],
    };
  }

  let packageName = packageResult.value?.name || null;
  root.name = packageName || DEV_PLANE_PACKAGE;
  if (packageName !== DEV_PLANE_PACKAGE) {
    return {
      ok: false,
      state: 'error',
      configured: true,
      root,
      manifest: null,
      summary: emptySummary(),
      mcp: emptyMcpSummary(),
      issues: [
        makeIssue(
          'error',
          'dev-plane-package-mismatch',
          `Configured dev plane package must be ${DEV_PLANE_PACKAGE}.`,
        ),
      ],
    };
  }

  let manifestResult = readJson(
    path.join(resolved.path, 'dev-plane.json'),
    'dev-plane-manifest-unreadable',
    'Symbiote dev plane manifest could not be read.',
  );
  if (manifestResult.issue) {
    return {
      ok: false,
      state: 'error',
      configured: true,
      root,
      manifest: null,
      summary: emptySummary(),
      mcp: emptyMcpSummary(),
      issues: [manifestResult.issue],
    };
  }

  let manifest = manifestResult.value || {};
  return {
    ok: true,
    state: 'ready',
    configured: true,
    root,
    manifest: {
      name: manifest.name || DEV_PLANE_PACKAGE,
      schemaVersion: manifest.schemaVersion || null,
      dirtyPolicy: manifest.localPolicy?.dirtyWorktree || null,
    },
    summary: summarizeManifest(manifest),
    mcp: summarizeMcpSources(manifest, options.mcpServers),
    issues: [],
  };
}
