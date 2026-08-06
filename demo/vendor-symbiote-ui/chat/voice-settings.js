import {
  defaultSendCommandPhrases,
  defaultVoiceActionCommandPhrases,
  defaultWakeCommandPhrases,
  normalizeWakeCommandPhrase,
  parseVoiceCommandList,
} from './voice-input-defaults.js';

export const DEFAULT_VOICE_SETTINGS = Object.freeze({
  commandMode: false,
  responseEnabled: false,
  languageMode: 'en',
});

const VOICE_LOCALES = Object.freeze(['en', 'ru', 'es']);
const VOICE_ACTIONS = Object.freeze(['cancel', 'delete', 'off']);

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function normalizeVoiceLanguageMode(mode, fallbackLocale = 'en') {
  let value = String(mode || '').trim().toLowerCase();
  if (['ru', 'es', 'en'].includes(value)) return value;
  return fallbackLocale;
}

function getSafeStorage(customStorage) {
  if (customStorage) return customStorage;
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    return window.localStorage;
  }
  return null;
}

export function loadVoiceSettings(storage, fallbackLocale = 'en') {
  let safeStorage = getSafeStorage(storage);
  let commandMode = DEFAULT_VOICE_SETTINGS.commandMode;
  let responseEnabled = DEFAULT_VOICE_SETTINGS.responseEnabled;
  let languageMode = normalizeVoiceLanguageMode('', fallbackLocale);

  if (safeStorage) {
    try {
      let savedCommandMode = safeStorage.getItem('symbiote_voice_command_mode');
      if (savedCommandMode !== null) {
        commandMode = savedCommandMode === 'true';
      }
      let savedResponseEnabled = safeStorage.getItem('symbiote_voice_response_enabled');
      if (savedResponseEnabled !== null) {
        responseEnabled = savedResponseEnabled === 'true';
      }
      let savedLanguageMode = safeStorage.getItem('symbiote_voice_language_mode');
      if (savedLanguageMode !== null) {
        languageMode = normalizeVoiceLanguageMode(savedLanguageMode, fallbackLocale);
      }
    } catch (_) {}
  }

  return {
    commandMode,
    responseEnabled,
    languageMode,
  };
}

export function saveVoiceSettings(settings, storage) {
  let safeStorage = getSafeStorage(storage);
  if (!safeStorage) return false;

  try {
    if (settings.commandMode !== undefined) {
      safeStorage.setItem('symbiote_voice_command_mode', String(settings.commandMode));
    }
    if (settings.responseEnabled !== undefined) {
      safeStorage.setItem('symbiote_voice_response_enabled', String(settings.responseEnabled));
    }
    if (settings.languageMode !== undefined) {
      safeStorage.setItem('symbiote_voice_language_mode', String(settings.languageMode));
    }
    return true;
  } catch (_) {
    return false;
  }
}

export function mergeServerVoiceSettings(local, serverVoiceInput, fallbackLocale = 'en') {
  let result = { ...local };
  if (!serverVoiceInput || typeof serverVoiceInput !== 'object') {
    return result;
  }

  if (serverVoiceInput.sendByCommandEnabled !== undefined) {
    result.commandMode = Boolean(serverVoiceInput.sendByCommandEnabled);
  }
  if (serverVoiceInput.voiceResponseEnabled !== undefined) {
    result.responseEnabled = Boolean(serverVoiceInput.voiceResponseEnabled);
  }
  if (serverVoiceInput.languageMode !== undefined) {
    result.languageMode = normalizeVoiceLanguageMode(serverVoiceInput.languageMode, fallbackLocale);
  }

  return result;
}

export function normalizeVoiceCommandSettings(raw = {}) {
  let data = asObject(raw);
  let sendDefaults = defaultSendCommandPhrases();
  let wakeDefaults = defaultWakeCommandPhrases();
  let actionDefaults = defaultVoiceActionCommandPhrases();
  let savedSend = asObject(data.sendCommands);
  let savedWake = asObject(data.wakeCommands);
  let savedActions = asObject(data.actionCommands);
  let legacySendCommand = String(data.sendCommand || '').trim();

  let sendCommands = Object.fromEntries(
    VOICE_LOCALES.map((locale) => {
      let value = String(savedSend[locale] || (locale === 'en' ? legacySendCommand : '') || sendDefaults[locale]).trim();
      return [locale, value || sendDefaults[locale]];
    })
  );

  let wakeCommands = Object.fromEntries(
    VOICE_LOCALES.map((locale) => [
      locale,
      normalizeWakeCommandPhrase(savedWake[locale] || wakeDefaults[locale], locale),
    ])
  );

  let actionCommands = Object.fromEntries(
    VOICE_ACTIONS.map((action) => {
      let values = asObject(savedActions[action]);
      return [
        action,
        Object.fromEntries(
          VOICE_LOCALES.map((locale) => [
            locale,
            parseVoiceCommandList(values[locale], actionDefaults[action][locale]),
          ])
        ),
      ];
    })
  );

  return {
    sendCommands,
    wakeCommands,
    actionCommands,
  };
}
