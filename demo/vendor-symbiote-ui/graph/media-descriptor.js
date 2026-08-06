/**
 * Node-safe media descriptor contract shared by graph models, hosts, and adapters.
 * Pure ESM, no DOM access.
 */

/** Canonical `$id` of the normalized media descriptor JSON Schema. */
export const MEDIA_DESCRIPTOR_SCHEMA_ID = 'https://rnd-pro.github.io/symbiote-ui/schemas/media-descriptor-v1.json';

const FIT_SYNONYMS = { fit: 'contain', crop: 'cover', contain: 'contain', cover: 'cover' };

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeFit(value) {
  return FIT_SYNONYMS[String(value ?? '').trim().toLowerCase()];
}

function normalizeTargetIds(value) {
  if (!Array.isArray(value)) return [];
  let ids = [];
  for (const entry of value) {
    let id = String(entry ?? '').trim();
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Normalize a raw media descriptor into the stable contract shape.
 * @param {unknown} raw
 * @returns {{ kind: string, poster: string, alt: string, fit?: string, activation: { provider: string, [key: string]: unknown }, targetIds: string[] }}
 */
export function normalizeMediaDescriptor(raw) {
  if (!isPlainObject(raw)) throw new Error('media descriptor must be an object');

  let kind = String(raw.kind ?? '').trim();
  if (!kind) throw new Error('media.kind is required');

  let activationData = isPlainObject(raw.activation) ? raw.activation : {};
  let provider = String(activationData.provider ?? '').trim();
  if (!provider) throw new Error('media.activation.provider is required');
  let { provider: _provider, ...providerData } = activationData;

  let descriptor = {
    kind,
    poster: String(raw.poster ?? '').trim(),
    alt: String(raw.alt ?? '').trim(),
  };

  let fit = normalizeFit(raw.fit);
  if (fit) descriptor.fit = fit;

  descriptor.activation = { provider, ...providerData };
  descriptor.targetIds = normalizeTargetIds(raw.targetIds);
  return descriptor;
}

/**
 * Cheap, throw-free check that a value is an activatable media descriptor.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isMediaDescriptor(value) {
  if (!isPlainObject(value)) return false;
  if (typeof value.kind !== 'string' || !value.kind.trim()) return false;
  let { activation } = value;
  return isPlainObject(activation) && typeof activation.provider === 'string' && Boolean(activation.provider.trim());
}
