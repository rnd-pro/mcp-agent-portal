const READINESS_VARIANTS = {
  ready: 'success',
  warning: 'warning',
  blocked: 'error',
};

const READINESS_LABELS = {
  ready: 'Ready',
  warning: 'Review',
  blocked: 'Blocked',
};

const NEXT_ACTION_LABELS = {
  construct: 'Construct',
  'review-package-readiness': 'Review readiness',
  'fix-package-context': 'Fix package context',
};

const MISSING_KEYS = ['components', 'plugins', 'packages', 'hostServices', 'runtimeSlots'];

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function readinessVariant(readiness) {
  if (!isObject(readiness)) return 'neutral';
  return READINESS_VARIANTS[readiness.status] || 'neutral';
}

export function readinessLabel(readiness) {
  if (!isObject(readiness)) return '';
  return READINESS_LABELS[readiness.status] || 'Unknown';
}

export function nextActionLabel(readiness) {
  if (!isObject(readiness) || !readiness.nextAction) return '';
  return NEXT_ACTION_LABELS[readiness.nextAction] || readiness.nextAction;
}

export function flattenMissingCapabilities(missing) {
  if (!isObject(missing)) return [];
  let items = [];
  for (let key of MISSING_KEYS) {
    let values = missing[key];
    if (!Array.isArray(values)) continue;
    for (let value of values) {
      if (typeof value === 'string' && value.trim()) items.push({ group: key, id: value });
    }
  }
  return items;
}

export function normalizePackageSummary(workspacePackage) {
  let manifest = isObject(workspacePackage?.manifest) ? workspacePackage.manifest : {};
  let dependencies = isObject(manifest.dependencies) ? manifest.dependencies : {};
  let assets = isObject(manifest.assets) ? manifest.assets : {};
  let compatibility = isObject(manifest.compatibility) ? manifest.compatibility : {};
  return {
    id: typeof manifest.id === 'string' ? manifest.id : '',
    name: typeof manifest.name === 'string' ? manifest.name : '',
    version: typeof manifest.version === 'string' ? manifest.version : '',
    description: typeof manifest.description === 'string' ? manifest.description : '',
    tags: Array.isArray(manifest.tags) ? manifest.tags.filter((tag) => typeof tag === 'string') : [],
    permissions: Array.isArray(manifest.permissions)
      ? manifest.permissions.filter((value) => typeof value === 'string')
      : [],
    compatibility,
    dependencies: {
      plugins: Array.isArray(dependencies.plugins) ? dependencies.plugins : [],
      components: Array.isArray(dependencies.components) ? dependencies.components : [],
      packages: Array.isArray(dependencies.packages) ? dependencies.packages : [],
    },
    assets: {
      docs: Array.isArray(assets.docs) ? assets.docs : [],
      examples: Array.isArray(assets.examples) ? assets.examples : [],
      previews: Array.isArray(assets.previews) ? assets.previews : [],
    },
  };
}
