import {
  configureAutoLocalization,
  configureLocalization,
  getNavigatorLocalePreferences,
  getLocalization,
  isLocalizationExplicit,
  normalizeLocaleMode,
  resolveLocale,
} from '../locale/index.js';

export function detectBrowserLocale(source = globalThis.navigator) {
  return resolveLocale(getNavigatorLocalePreferences(source));
}

export function configureBrowserLocalization(options = {}) {
  let mode = normalizeLocaleMode(options.mode, { fallback: '' });
  if (mode) {
    return configureAutoLocalization({
      mode,
      preferences: options.preferences,
      navigator: options.navigator,
      document: options.document,
      messages: options.messages,
      explicit: options.explicit,
    });
  }

  if (options.locale != null) {
    return configureLocalization({
      locale: options.locale,
      messages: options.messages,
      explicit: options.explicit,
    });
  }

  if (options.force !== true && isLocalizationExplicit()) {
    return getLocalization();
  }

  let locale = detectBrowserLocale(options.navigator ?? globalThis.navigator);
  return configureAutoLocalization({
    mode: 'auto',
    preferences: [locale],
    document: options.document,
    messages: options.messages,
    explicit: options.explicit ?? false,
  });
}
