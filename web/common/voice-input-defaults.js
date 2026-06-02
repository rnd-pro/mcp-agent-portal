export const DEFAULT_VOICE_WAKE_COMMANDS = Object.freeze({
  en: 'Okay Agent',
  ru: "О'кей Агент",
  es: 'Okey Agente',
});

export const DEFAULT_VOICE_WAKE_COMMAND = DEFAULT_VOICE_WAKE_COMMANDS.ru;

export const LEGACY_VOICE_WAKE_COMMANDS = Object.freeze({
  en: ['voice input', DEFAULT_VOICE_WAKE_COMMAND],
  ru: ['голосовой ввод'],
  es: ['entrada de voz', DEFAULT_VOICE_WAKE_COMMAND],
});

export function defaultWakeCommandPhrases() {
  return { ...DEFAULT_VOICE_WAKE_COMMANDS };
}

export function normalizeWakeCommandPhrase(value, locale) {
  let command = String(value || '').trim();
  let fallback = DEFAULT_VOICE_WAKE_COMMANDS[locale] || DEFAULT_VOICE_WAKE_COMMAND;
  if (!command) return fallback;
  let legacyCommands = LEGACY_VOICE_WAKE_COMMANDS[locale] || [];
  let commandKey = command.toLocaleLowerCase();
  if (legacyCommands.some((legacy) => String(legacy).toLocaleLowerCase() === commandKey)) return fallback;
  return command;
}
