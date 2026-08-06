import { getNavigatorLocalePreferences } from '../locale/index.js';
import { normalizeVoiceLanguageMode } from './voice-settings.js';

export const VOICE_LOCALE_LANGS = Object.freeze({
  en: 'en-US',
  ru: 'ru-RU',
  es: 'es-ES',
});

const DEFAULT_SPEECH_LANG = 'en-US';

export function resolveDefaultVoiceLocale(navigatorLike = globalThis.navigator) {
  try {
    let preferences = getNavigatorLocalePreferences(navigatorLike);
    for (let preference of preferences) {
      let locale = normalizeVoiceLanguageMode(preference, '');
      if (locale) return locale;
    }
  } catch (_) {}
  return 'en';
}

export function localeToSpeechLang(locale) {
  let value = String(locale || '').trim();
  if (value.includes('-')) return value;
  return VOICE_LOCALE_LANGS[value.toLowerCase()] || DEFAULT_SPEECH_LANG;
}
