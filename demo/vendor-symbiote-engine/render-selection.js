import {
  RENDER_CAPABILITY_CONTRACT_VERSION,
  accelerationCandidateProven,
  normalizeAccelerationCandidate,
  normalizeAccelerationSelection,
  normalizeCapabilityRequest,
} from './contracts/render-capability.js';

export const RENDER_SELECTION_VERSION = RENDER_CAPABILITY_CONTRACT_VERSION;

function classifyUnproven(candidate) {
  let probe = candidate.evidence?.probe;
  if (probe === 'device-present' || probe === 'none') return 'device-present-but-unproven';
  return 'evidence-insufficient';
}

function selectRole(role, roleRequest, candidates) {
  let requiredBackend = roleRequest.requiredBackend || '';
  let requiredCodec = role === 'encoder' ? roleRequest.requiredCodec || '' : '';
  let rejections = [];
  let proven = [];

  for (let candidate of candidates) {
    if (candidate.role === role && accelerationCandidateProven(candidate)) {
      proven.push(candidate);
      continue;
    }
    rejections.push({ role, candidateId: candidate.id, backend: candidate.backend, reason: classifyUnproven(candidate) });
  }

  let backendMatch = (candidate) => !requiredBackend || candidate.backend === requiredBackend;
  let codecMatch = (candidate) => !requiredCodec || candidate.codec === requiredCodec;
  let exact = proven.find((candidate) => backendMatch(candidate) && codecMatch(candidate));
  if (exact) {
    return { requested: roleRequest, selected: exact, fallbackUsed: false, ok: true, rejections };
  }

  let requestedReason;
  if (requiredCodec && proven.some(backendMatch)) {
    requestedReason = 'codec-mismatch';
  } else if (requiredBackend || requiredCodec) {
    requestedReason = 'required-backend-unavailable';
  } else {
    requestedReason = 'no-proven-candidate';
  }

  if (roleRequest.allowFallback && proven.length) {
    rejections.push({ role, candidateId: '', backend: requiredBackend, reason: requestedReason });
    return { requested: roleRequest, selected: proven[0], fallbackUsed: true, ok: true, rejections };
  }

  let finalReason = !roleRequest.allowFallback && proven.length && (requiredBackend || requiredCodec)
    ? 'no-fallback-allowed'
    : requestedReason;
  rejections.push({ role, candidateId: '', backend: requiredBackend, reason: finalReason });
  return { requested: roleRequest, selected: null, fallbackUsed: false, ok: false, rejections };
}

export function selectRenderAcceleration({ request, rendererCandidates = [], encoderCandidates = [] } = {}) {
  let normalizedRequest = normalizeCapabilityRequest(request);
  let renderer = selectRole(
    'renderer',
    normalizedRequest.renderer,
    (Array.isArray(rendererCandidates) ? rendererCandidates : []).map((candidate, index) =>
      normalizeAccelerationCandidate(candidate, 'renderer', `rendererCandidates[${index}]`)),
  );
  let encoder = selectRole(
    'encoder',
    normalizedRequest.encoder,
    (Array.isArray(encoderCandidates) ? encoderCandidates : []).map((candidate, index) =>
      normalizeAccelerationCandidate(candidate, 'encoder', `encoderCandidates[${index}]`)),
  );

  let receipt = {
    version: RENDER_CAPABILITY_CONTRACT_VERSION,
    tier: normalizedRequest.tier,
    ok: renderer.ok && encoder.ok,
    renderer: { requested: renderer.requested, selected: renderer.selected, fallbackUsed: renderer.fallbackUsed },
    encoder: { requested: encoder.requested, selected: encoder.selected, fallbackUsed: encoder.fallbackUsed },
    rejections: [...renderer.rejections, ...encoder.rejections],
  };
  return normalizeAccelerationSelection(receipt, { request: normalizedRequest });
}
