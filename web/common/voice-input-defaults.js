export const DEFAULT_VOICE_WAKE_COMMANDS = Object.freeze({
  en: 'Okay Agent',
  ru: "О'кей Агент",
  es: 'Okey Agente',
});

export const DEFAULT_VOICE_SEND_COMMANDS = Object.freeze({
  en: 'send',
  ru: 'отправить',
  es: 'enviar',
});

export const DEFAULT_VOICE_ACTION_COMMANDS = Object.freeze({
  cancel: Object.freeze({
    en: Object.freeze(['cancel', 'stop']),
    ru: Object.freeze(['отмена', 'стоп']),
    es: Object.freeze(['cancelar', 'detener']),
  }),
  delete: Object.freeze({
    en: Object.freeze(['delete', 'clear']),
    ru: Object.freeze(['удали', 'удалить', 'очистить']),
    es: Object.freeze(['borra', 'eliminar']),
  }),
  off: Object.freeze({
    en: Object.freeze(['turn off']),
    ru: Object.freeze(['выключи']),
    es: Object.freeze(['apagar']),
  }),
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

export function defaultSendCommandPhrases() {
  return { ...DEFAULT_VOICE_SEND_COMMANDS };
}

export function defaultVoiceActionCommandPhrases() {
  return Object.fromEntries(
    Object.entries(DEFAULT_VOICE_ACTION_COMMANDS).map(([action, locales]) => [
      action,
      Object.fromEntries(
        Object.entries(locales).map(([locale, commands]) => [locale, [...commands]])
      ),
    ])
  );
}

export function parseVoiceCommandList(value, fallback = []) {
  let commands = Array.isArray(value)
    ? value
    : String(value || '').split(/[,/;=\n]+/u);
  let result = commands
    .map((command) => String(command || '').trim())
    .filter(Boolean);
  return result.length > 0 ? result : [...fallback];
}

export function formatVoiceCommandList(commands = []) {
  return parseVoiceCommandList(commands).join(', ');
}

function escapeVoiceCommandRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeVoiceCommandCandidates(candidates = []) {
  let list = Array.isArray(candidates) ? candidates : [candidates];
  return list
    .map((candidate) => {
      if (candidate && typeof candidate === 'object') {
        let phrase = String(candidate.phrase || '').trim();
        return phrase ? { ...candidate, phrase } : null;
      }
      let phrase = String(candidate || '').trim();
      return phrase ? { phrase } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.phrase.length - a.phrase.length);
}

export function wakeCommandCandidates(phrases = {}, locale = '') {
  let selectedLocales = DEFAULT_VOICE_WAKE_COMMANDS[locale] ? [locale] : Object.keys(DEFAULT_VOICE_WAKE_COMMANDS);
  let commands = selectedLocales.flatMap((itemLocale) => (
    parseVoiceCommandList(phrases[itemLocale], [DEFAULT_VOICE_WAKE_COMMANDS[itemLocale]])
  ));
  return [...new Set(commands.map((command) => String(command || '').trim()).filter(Boolean))];
}

export function matchVoiceCommandAtEnd(text = '', candidates = []) {
  let value = String(text || '').trim();
  if (!value) return { matched: false, phrase: '', text: '' };
  for (let candidate of normalizeVoiceCommandCandidates(candidates)) {
    let command = escapeVoiceCommandRegExp(candidate.phrase);
    let commandPattern = new RegExp(`(?:[\\s,.;:!?]+|^)(${command})[\\s,.;:!?]*$`, 'iu');
    if (!commandPattern.test(value)) continue;
    return {
      ...candidate,
      matched: true,
      text: value.replace(commandPattern, '').trim(),
    };
  }
  return { matched: false, phrase: '', text: value };
}

export function matchVoiceCommandInText(text = '', candidates = []) {
  let value = String(text || '').trim();
  if (!value) return { matched: false, phrase: '', text: '' };
  for (let candidate of normalizeVoiceCommandCandidates(candidates)) {
    let command = escapeVoiceCommandRegExp(candidate.phrase);
    let commandPattern = new RegExp(`(?:[\\s,.;:!?]+|^)(${command})(?:[\\s,.;:!?]+|$)`, 'iu');
    if (commandPattern.test(value)) return { ...candidate, matched: true, text: value };
  }
  return { matched: false, phrase: '', text: value };
}

export function normalizeWakeCommandPhrase(value, locale) {
  let fallback = DEFAULT_VOICE_WAKE_COMMANDS[locale] || DEFAULT_VOICE_WAKE_COMMAND;
  let commands = parseVoiceCommandList(value, [fallback]);
  let legacyCommands = LEGACY_VOICE_WAKE_COMMANDS[locale] || [];
  let normalized = commands.map((command) => {
    let commandKey = String(command).toLocaleLowerCase();
    return legacyCommands.some((legacy) => String(legacy).toLocaleLowerCase() === commandKey) ? fallback : command;
  });
  let seen = new Set();
  let unique = normalized.filter((command) => {
    let key = String(command).toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return formatVoiceCommandList(unique.length ? unique : [fallback]);
}
