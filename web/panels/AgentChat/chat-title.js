const CHAT_TITLE_MAX_WORDS = 8;
const CHAT_TITLE_MAX_LENGTH = 72;

function trimTitle(value = '') {
  let title = String(value || '')
    .replace(/[`*_#[\](){}<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'«“]+|["'»”]+$/g, '')
    .trim();

  if (!title) return '';

  let words = title.split(/\s+/).filter(Boolean).slice(0, CHAT_TITLE_MAX_WORDS);
  title = words.join(' ').slice(0, CHAT_TITLE_MAX_LENGTH).trim();
  return title.replace(/[.,;:!?-]+$/g, '').trim();
}

export function buildChatTitleRequestNote(locale = 'en') {
  if (locale === 'ru') {
    return [
      '[Служебная инструкция: это первое сообщение нового чата.',
      'В конце финального ответа добавь отдельную строку <chat-title>Короткое название</chat-title>.',
      'Название должно быть на языке пользователя, до 8 слов. Не объясняй эту строку.]',
    ].join(' ');
  }
  if (locale === 'es') {
    return [
      '[Instruccion interna: este es el primer mensaje de un chat nuevo.',
      'Al final de la respuesta final, agrega una linea separada <chat-title>Titulo breve</chat-title>.',
      'El titulo debe usar el idioma del usuario y tener hasta 8 palabras. No expliques esta linea.]',
    ].join(' ');
  }
  return [
    '[Internal instruction: this is the first message in a new chat.',
    'At the end of the final answer, add one separate line <chat-title>Short title</chat-title>.',
    'Use the user language and keep the title under 8 words. Do not explain this line.]',
  ].join(' ');
}

export function extractChatTitleFromAgentText(text = '') {
  let source = String(text || '');
  let match = source.match(/(?:^|\n)\s*<chat-title>\s*([^<\n]+?)\s*<\/chat-title>\s*(?=\n|$)/i);
  if (!match) return { title: '', text: source, changed: false };

  let title = trimTitle(match[1]);
  let cleanText = source.replace(match[0], '\n').replace(/\n{3,}/g, '\n\n').trim();
  return {
    title,
    text: cleanText,
    changed: cleanText !== source,
  };
}
