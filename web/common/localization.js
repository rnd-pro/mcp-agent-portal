import { configureLocalization, normalizeLocale } from 'symbiote-node/locale';

const LOCALE_QUERY_KEYS = ['locale', 'lang'];

export function resolvePortalLocale(locationObj = globalThis.location) {
  let searchParams = new URLSearchParams(locationObj?.search || '');
  for (let key of LOCALE_QUERY_KEYS) {
    let value = searchParams.get(key);
    if (value) return normalizeLocale(value);
  }

  let path = String(locationObj?.pathname || '');
  if (path === '/ru' || path.startsWith('/ru/')) return 'ru';
  return 'en';
}

export function configurePortalLocalization(options = {}) {
  let locale = resolvePortalLocale(options.location);
  let localization = configureLocalization({ locale, explicit: true });
  let doc = options.document || globalThis.document;
  if (doc?.documentElement) {
    doc.documentElement.lang = locale;
    doc.documentElement.dir = 'ltr';
    doc.documentElement.dataset.locale = locale;
  }
  return localization;
}

configurePortalLocalization();
