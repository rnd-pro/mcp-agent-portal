export function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function cleanString(value, fallback = '') {
  let text = String(value ?? fallback ?? '').replace(/\s+/g, ' ').trim();
  return text && text !== 'undefined' && text !== 'null' ? text : String(fallback || '').trim();
}

export function finiteNonNegativeNumber(value, fallback = null) {
  let number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export function finitePositiveNumber(value, fallback = 0) {
  let number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
