export const RENDER_CAPABILITY_CONTRACT_VERSION = 'render-capability/1';

export const RENDER_EXECUTION_TIERS = Object.freeze([
  'sequential-realtime',
  'replayable-segment',
  'checkpointed-deterministic',
]);

export const RENDER_ACCELERATION_ROLES = Object.freeze(['renderer', 'encoder']);

// Named non-production oracle/diagnostic capture surfaces. These are never a
// hidden production fallback for native segment rendering.
export const RENDER_DIAGNOSTIC_SURFACES = Object.freeze(['screenshot', 'passive-cdp']);

export const RENDER_ACCELERATION_PROBES = Object.freeze([
  'none',
  'device-present',
  'renderer-identity',
  'real-encode',
]);

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value, fallback = '') {
  let text = String(value ?? fallback ?? '').replace(/\s+/g, ' ').trim();
  return text && text !== 'undefined' && text !== 'null' ? text : String(fallback || '').trim();
}

function requireObject(value, path) {
  if (!isObject(value)) fail(path, 'must be an object');
  return value;
}

function resolveVersion(value, path) {
  if (value === undefined || value === null || value === '') return RENDER_CAPABILITY_CONTRACT_VERSION;
  let version = cleanString(value, '');
  if (version !== RENDER_CAPABILITY_CONTRACT_VERSION) {
    fail(path, `must equal "${RENDER_CAPABILITY_CONTRACT_VERSION}"`);
  }
  return version;
}

function normalizeRole(value, path) {
  let role = cleanString(value, '');
  if (!RENDER_ACCELERATION_ROLES.includes(role)) {
    fail(path, `must be one of ${RENDER_ACCELERATION_ROLES.join(', ')}`);
  }
  return role;
}

export function normalizeExecutionTier(value, path = 'executionTier') {
  let tier = cleanString(value, '');
  if (!RENDER_EXECUTION_TIERS.includes(tier)) {
    fail(path, `must be one of ${RENDER_EXECUTION_TIERS.join(', ')}`);
  }
  return tier;
}

function normalizeEvidence(value, path) {
  requireObject(value, path);
  let probe = cleanString(value.probe, '');
  if (!RENDER_ACCELERATION_PROBES.includes(probe)) {
    fail(`${path}.probe`, `must be one of ${RENDER_ACCELERATION_PROBES.join(', ')}`);
  }
  let evidence = { probe };
  let detail = cleanString(value.detail, '');
  if (detail) evidence.detail = detail;
  let rendererIdentity = cleanString(value.rendererIdentity, '');
  if (rendererIdentity) evidence.rendererIdentity = rendererIdentity;
  if (value.encodeOk !== undefined) {
    if (typeof value.encodeOk !== 'boolean') fail(`${path}.encodeOk`, 'must be a boolean');
    evidence.encodeOk = value.encodeOk;
  }
  return evidence;
}

export function normalizeAccelerationCandidate(candidate, role, path = 'accelerationCandidate') {
  requireObject(candidate, path);
  let normalizedRole = normalizeRole(role, `${path}.role`);
  if (candidate.role !== undefined && cleanString(candidate.role, '') !== normalizedRole) {
    fail(`${path}.role`, `must equal "${normalizedRole}"`);
  }
  let id = cleanString(candidate.id, '');
  if (!id) fail(`${path}.id`, 'is required');
  let backend = cleanString(candidate.backend, '');
  if (!backend) fail(`${path}.backend`, 'is required');
  if (typeof candidate.available !== 'boolean') {
    fail(`${path}.available`, 'must be an explicit boolean');
  }
  let normalized = {
    id,
    role: normalizedRole,
    backend,
    available: candidate.available,
    evidence: normalizeEvidence(candidate.evidence, `${path}.evidence`),
  };
  let deviceNode = cleanString(candidate.deviceNode, '');
  if (deviceNode) normalized.deviceNode = deviceNode;
  let driver = cleanString(candidate.driver, '');
  if (driver) normalized.driver = driver;
  let driverVersion = cleanString(candidate.driverVersion, '');
  if (driverVersion) normalized.driverVersion = driverVersion;
  if (normalizedRole === 'encoder') {
    let codec = cleanString(candidate.codec, '');
    if (codec) normalized.codec = codec;
    let container = cleanString(candidate.container, '');
    if (container) normalized.container = container;
    let pixelFormat = cleanString(candidate.pixelFormat, '');
    if (pixelFormat) normalized.pixelFormat = pixelFormat;
  }
  return normalized;
}

export function accelerationCandidateProven(candidate) {
  if (!isObject(candidate)) return false;
  if (candidate.available !== true) return false;
  let evidence = candidate.evidence;
  if (!isObject(evidence)) return false;
  if (candidate.role === 'renderer') {
    return evidence.probe === 'renderer-identity'
      && typeof evidence.rendererIdentity === 'string'
      && evidence.rendererIdentity.trim() !== '';
  }
  if (candidate.role === 'encoder') {
    return evidence.probe === 'real-encode' && evidence.encodeOk === true;
  }
  return false;
}

function normalizeRoleRequest(value, role, path) {
  let request = value === undefined || value === null ? {} : requireObject(value, path);
  if (typeof request.allowFallback !== 'boolean') {
    fail(`${path}.allowFallback`, 'must be an explicit boolean');
  }
  let normalized = { allowFallback: request.allowFallback };
  let requiredBackend = cleanString(request.requiredBackend, '');
  if (requiredBackend) normalized.requiredBackend = requiredBackend;
  if (role === 'encoder') {
    let requiredCodec = cleanString(request.requiredCodec, '');
    if (requiredCodec) normalized.requiredCodec = requiredCodec;
  }
  return normalized;
}

export function normalizeCapabilityRequest(request = {}) {
  requireObject(request, 'capabilityRequest');
  return {
    version: resolveVersion(request.version, 'capabilityRequest.version'),
    tier: normalizeExecutionTier(request.tier, 'capabilityRequest.tier'),
    renderer: normalizeRoleRequest(request.renderer, 'renderer', 'capabilityRequest.renderer'),
    encoder: normalizeRoleRequest(request.encoder, 'encoder', 'capabilityRequest.encoder'),
  };
}

function normalizeSelectionRole(value, role, requestedFallback, path) {
  let entry = value === undefined || value === null ? {} : requireObject(value, path);
  let requested = entry.requested !== undefined
    ? normalizeRoleRequest(entry.requested, role, `${path}.requested`)
    : requestedFallback;
  if (!requested) fail(`${path}.requested`, 'is required');
  let selected = entry.selected === undefined || entry.selected === null
    ? null
    : normalizeAccelerationCandidate(entry.selected, role, `${path}.selected`);
  if (typeof entry.fallbackUsed !== 'boolean') {
    fail(`${path}.fallbackUsed`, 'must be an explicit boolean');
  }
  return { requested, selected, fallbackUsed: entry.fallbackUsed };
}

function normalizeRejections(value, path) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(path, 'must be an array');
  return value.map((entry, index) => {
    requireObject(entry, `${path}[${index}]`);
    let reason = cleanString(entry.reason, '');
    if (!reason) fail(`${path}[${index}].reason`, 'is required');
    return {
      role: normalizeRole(entry.role, `${path}[${index}].role`),
      candidateId: cleanString(entry.candidateId, ''),
      backend: cleanString(entry.backend, ''),
      reason,
    };
  });
}

export function normalizeAccelerationSelection(selection = {}, context = {}) {
  requireObject(selection, 'accelerationSelection');
  let request = context.request ? normalizeCapabilityRequest(context.request) : undefined;
  return {
    version: resolveVersion(selection.version, 'accelerationSelection.version'),
    tier: normalizeExecutionTier(selection.tier ?? request?.tier, 'accelerationSelection.tier'),
    ok: selection.ok === true,
    renderer: normalizeSelectionRole(
      selection.renderer,
      'renderer',
      request?.renderer,
      'accelerationSelection.renderer',
    ),
    encoder: normalizeSelectionRole(
      selection.encoder,
      'encoder',
      request?.encoder,
      'accelerationSelection.encoder',
    ),
    rejections: normalizeRejections(selection.rejections, 'accelerationSelection.rejections'),
  };
}
