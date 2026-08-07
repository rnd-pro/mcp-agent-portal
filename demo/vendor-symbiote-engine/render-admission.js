import { cleanString, isObject } from './render-utils.js';
import { normalizeExecutionTier } from './contracts/render-capability.js';
import { buildRenderWorkerCapacityProof } from './render-proof.js';

export const RENDER_ADMISSION_VERSION = 'render-admission-v1';

const GATED_FIELDS = Object.freeze([
  { field: 'width', limitKey: 'maxWidth' },
  { field: 'height', limitKey: 'maxHeight' },
  { field: 'dpr', limitKey: 'maxDpr' },
  { field: 'fps', limitKey: 'maxFps' },
  { field: 'workerCount', limitKey: 'maxWorkers', integer: true },
]);

const ESTIMATE_FIELDS = Object.freeze([
  { field: 'estMemoryBytes', limitKey: 'availableMemoryBytes' },
  { field: 'estStorageBytes', limitKey: 'availableStorageBytes' },
]);

function numberOrNull(value) {
  let number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isProvided(value) {
  return value !== undefined && value !== null && value !== '';
}

function validateGatedField({ field, limitKey, integer }, request, limits, rejections) {
  let rawLimit = limits[limitKey];
  let limit = Number(rawLimit);
  if (!Number.isFinite(limit) || limit <= 0) {
    rejections.push({ field, requested: numberOrNull(request[field]), limit: numberOrNull(rawLimit), reason: `${field}-limit-missing` });
    return;
  }
  let raw = request[field];
  let value = Number(raw);
  let valid = isProvided(raw) && Number.isFinite(value) && value > 0 && (!integer || Number.isInteger(value));
  if (!valid) {
    rejections.push({ field, requested: numberOrNull(raw), limit, reason: `${field}-invalid` });
    return;
  }
  if (value > limit) {
    rejections.push({ field, requested: value, limit, reason: `${field}-over-limit` });
  }
}

function validateEstimateField({ field, limitKey }, request, limits, rejections) {
  let raw = request[field];
  if (!isProvided(raw)) return;
  let value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    rejections.push({ field, requested: numberOrNull(raw), limit: numberOrNull(limits[limitKey]), reason: `${field}-invalid` });
    return;
  }
  let rawLimit = limits[limitKey];
  let limit = Number(rawLimit);
  if (!Number.isFinite(limit) || limit <= 0) {
    rejections.push({ field, requested: value, limit: numberOrNull(rawLimit), reason: `${field}-limit-missing` });
    return;
  }
  if (value > limit) {
    rejections.push({ field, requested: value, limit, reason: `${field}-over-limit` });
  }
}

export function admitRenderRequest({ request = {}, limits = {}, capacity } = {}) {
  let safeRequest = isObject(request) ? request : {};
  let safeLimits = isObject(limits) ? limits : {};
  let rejections = [];

  let tier = null;
  try {
    tier = normalizeExecutionTier(safeRequest.tier, 'request.tier');
  } catch {
    rejections.push({ field: 'tier', requested: cleanString(safeRequest.tier, ''), limit: '', reason: 'tier-invalid' });
  }

  if (tier) {
    let allowedTiers = Array.isArray(safeLimits.allowedTiers)
      ? safeLimits.allowedTiers.map((value) => cleanString(value, '')).filter(Boolean)
      : [];
    if (!allowedTiers.length) {
      rejections.push({ field: 'tier', requested: tier, limit: '', reason: 'allowed-tiers-missing' });
    } else if (!allowedTiers.includes(tier)) {
      rejections.push({ field: 'tier', requested: tier, limit: allowedTiers.join(','), reason: 'tier-not-allowed' });
    }
  }

  for (let spec of GATED_FIELDS) {
    validateGatedField(spec, safeRequest, safeLimits, rejections);
  }

  if (tier === 'sequential-realtime' && Number(safeRequest.workerCount) !== 1) {
    rejections.push({
      field: 'workerCount',
      requested: numberOrNull(safeRequest.workerCount),
      limit: 1,
      reason: 'sequential-realtime-single-worker',
    });
  }

  for (let spec of ESTIMATE_FIELDS) {
    validateEstimateField(spec, safeRequest, safeLimits, rejections);
  }

  let capacityProof;
  if (isObject(capacity)) {
    capacityProof = buildRenderWorkerCapacityProof(capacity);
    if (!capacityProof.ok) {
      rejections.push({
        field: 'workerCount',
        requested: capacityProof.requestedWorkers,
        limit: capacityProof.maxAdmittedWorkers,
        reason: 'worker-capacity-exceeded',
      });
    }
    let requestedWorkers = Number(safeRequest.workerCount);
    if (Number.isFinite(requestedWorkers) && requestedWorkers > capacityProof.maxAdmittedWorkers) {
      rejections.push({
        field: 'workerCount',
        requested: requestedWorkers,
        limit: capacityProof.maxAdmittedWorkers,
        reason: 'worker-count-over-capacity',
      });
    }
  }

  let ok = rejections.length === 0;
  return {
    version: RENDER_ADMISSION_VERSION,
    ok,
    admitted: ok,
    rejections,
    ...(capacityProof ? { capacityProof } : {}),
  };
}
