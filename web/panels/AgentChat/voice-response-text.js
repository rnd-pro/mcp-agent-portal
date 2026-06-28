import { sanitizeVoiceResponseText as sanitizeVoiceResponseTextGeneral } from 'symbiote-ui/chat/voice-response-sanitizer.js';

function summarizeOperationalReply(text) {
  let value = String(text || '').trim();
  if (/^pong$/i.test(value)) {
    return 'Связь есть.';
  }
  if (/^Готово\.\s+Закоммичено и запушено/i.test(value)) {
    if (/voice response sanitizer|voice-response-text|CODE_TOKEN_RE|CLI_FLAG_RE|фильтр[а-яё\s]+озвуч/i.test(value)) {
      return 'Готово. Изменения закоммичены и запушены. Обновлён фильтр озвучки ответов и добавлены тесты.';
    }
    return 'Готово. Изменения закоммичены и запушены.';
  }
  if (/^Готово\.\s+Закоммичено и запущено/i.test(value)) {
    return 'Готово. Исправление закоммичено и запущено.';
  }
  if (/^Готово\.\s+Закоммичено/i.test(value)) {
    return 'Готово. Изменения закоммичены.';
  }
  if (/^Все изменения закоммичены/i.test(value)) {
    return 'Все изменения закоммичены.';
  }
  if (/^(Наш[её]л причину|Вот что происходило)/i.test(value) && /(_pullMessages|setMessages|chat-ws-client|перерендер|pull-timer)/i.test(value)) {
    return 'Нашёл причину. Проблема была в периодическом обновлении сообщений: чат заново заменял список и перерисовывал транскрипт. Фикс добавляет проверку, чтобы не обновлять список без изменений.';
  }
  if (/^(Now I see the changes|Changes already staged)/i.test(value) && /\b(?:commit|submodule|staged)\b/i.test(value)) {
    return 'Агент проверяет изменения перед коммитом.';
  }
  return '';
}

export function sanitizeVoiceResponseText(text, options = {}) {
  return sanitizeVoiceResponseTextGeneral(text, { ...options, summarize: summarizeOperationalReply });
}
