export const DEFAULT_VOICE_WAKE_COMMAND = "О'кей Агент";

export const LEGACY_VOICE_WAKE_COMMANDS = Object.freeze({
  en: 'voice input',
  ru: 'голосовой ввод',
  es: 'entrada de voz',
});

export function defaultWakeCommandPhrases() {
  return {
    en: DEFAULT_VOICE_WAKE_COMMAND,
    ru: DEFAULT_VOICE_WAKE_COMMAND,
    es: DEFAULT_VOICE_WAKE_COMMAND,
  };
}

export function normalizeWakeCommandPhrase(value, locale) {
  let command = String(value || '').trim();
  let fallback = DEFAULT_VOICE_WAKE_COMMAND;
  if (!command) return fallback;
  if (command === LEGACY_VOICE_WAKE_COMMANDS[locale]) return fallback;
  return command;
}
