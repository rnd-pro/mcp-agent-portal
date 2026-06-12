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
 * @param {{ projectRoot?: string, env?: NodeJS.ProcessEnv, config?: object }} options
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
    issues: [],
  };
}
