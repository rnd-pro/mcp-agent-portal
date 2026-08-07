export const BROWSER_CODEC_SUPPORT_VERSION = 'browser-codec-support/1';

const BROWSER_CODEC_PROBES = Object.freeze(['declared', 'runtime']);
const BROWSER_CODEC_HW = Object.freeze(['no-preference', 'prefer-hardware', 'prefer-software']);

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
  if (value === undefined || value === null || value === '') return BROWSER_CODEC_SUPPORT_VERSION;
  let version = cleanString(value, '');
  if (version !== BROWSER_CODEC_SUPPORT_VERSION) {
    fail(path, `must equal "${BROWSER_CODEC_SUPPORT_VERSION}"`);
  }
  return version;
}

function normalizeCodecList(value, path) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(path, 'must be an array of codec strings');
  let seen = new Set();
  let codecs = [];
  value.forEach((entry, index) => {
    let codec = cleanString(entry, '');
    if (!codec) fail(`${path}[${index}]`, 'must be a non-empty codec string');
    if (!seen.has(codec)) {
      seen.add(codec);
      codecs.push(codec);
    }
  });
  return codecs;
}

function normalizeCodecDirection(value, path) {
  let direction = value === undefined || value === null ? {} : requireObject(value, path);
  if (typeof direction.supported !== 'boolean') {
    fail(`${path}.supported`, 'must be an explicit boolean');
  }
  return {
    supported: direction.supported,
    codecs: normalizeCodecList(direction.codecs, `${path}.codecs`),
  };
}

export function normalizeBrowserCodecSupport(support = {}, context = {}) {
  let path = cleanString(context.path, 'browserCodecSupport') || 'browserCodecSupport';
  requireObject(support, path);
  let version = resolveVersion(support.version, `${path}.version`);
  let api = cleanString(support.api, 'webcodecs') || 'webcodecs';
  if (api !== 'webcodecs') fail(`${path}.api`, 'must be "webcodecs"');
  let probe = cleanString(support.probe, '');
  if (!BROWSER_CODEC_PROBES.includes(probe)) {
    fail(`${path}.probe`, `must be one of ${BROWSER_CODEC_PROBES.join(', ')}`);
  }
  let hardwareAcceleration;
  if (support.hardwareAcceleration !== undefined
    && support.hardwareAcceleration !== null
    && support.hardwareAcceleration !== '') {
    hardwareAcceleration = cleanString(support.hardwareAcceleration, '');
    if (!BROWSER_CODEC_HW.includes(hardwareAcceleration)) {
      fail(`${path}.hardwareAcceleration`, `must be one of ${BROWSER_CODEC_HW.join(', ')}`);
    }
  }
  return {
    version,
    api,
    decode: normalizeCodecDirection(support.decode, `${path}.decode`),
    encode: normalizeCodecDirection(support.encode, `${path}.encode`),
    ...(hardwareAcceleration ? { hardwareAcceleration } : {}),
    probe,
  };
}
