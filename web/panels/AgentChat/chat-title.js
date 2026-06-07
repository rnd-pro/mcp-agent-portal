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
