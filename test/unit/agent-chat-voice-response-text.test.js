import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { sanitizeVoiceResponseText } from '../../web/panels/AgentChat/voice-response-text.js';

describe('agent chat voice response text', () => {
  it('removes fenced and inline code before speech', () => {
    let text = sanitizeVoiceResponseText(`
Готово.
\`\`\`js
console.log('secret');
\`\`\`
Запустите \`npm test\` после этого.
`);

    assert.match(text, /Готово/);
    assert.match(text, /Запустите\s+после этого/);
    assert.doesNotMatch(text, /console\.log/);
    assert.doesNotMatch(text, /npm test/);
  });

  it('drops commands, stack traces, json fragments, and markdown tables', () => {
    let text = sanitizeVoiceResponseText(`
Я исправил обработку.
git status
{"ok":true}
| file | status |
| --- | --- |
at render (/tmp/app.js:10:2)
Проверка прошла.
`);

    assert.equal(text, 'Я исправил обработку. Проверка прошла.');
  });

  it('keeps readable link text while removing raw urls', () => {
    let text = sanitizeVoiceResponseText('Смотри [отчет](https://example.test/report) и https://example.test/raw.');

    assert.equal(text, 'Смотри отчет');
  });

  it('removes quoted and inline technical tokens that agents mention as prose', () => {
    let text = sanitizeVoiceResponseText('onDone/resolve перенесены в ".finally()" после _pullMessages(). Финальный ответ готов.');

    assert.match(text, /Финальный ответ готов/);
    assert.doesNotMatch(text, /\.finally/);
    assert.doesNotMatch(text, /_pullMessages/);
    assert.doesNotMatch(text, /onDone/);
    assert.doesNotMatch(text, /resolve/);
  });

  it('summarizes operational commit and push replies instead of reading hashes', () => {
    let text = sanitizeVoiceResponseText('Готово. Закоммичено и запушено: - **`49c370c`** — `fix: deduplicate pull-timer message updates to prevent full re-renders` - **`d14c3e2..49c370c`** → `origin/main`');

    assert.equal(text, 'Готово. Изменения закоммичены и запушены.');
  });

  it('summarizes technical root-cause replies that would become fragmented', () => {
    let text = sanitizeVoiceResponseText('Нашёл причину. `_pullMessages` в `chat-ws-client.js` каждые 2 секунды заменяет `this.$.messages` и триггерит перерендер. Фикс — добавить проверку в `setMessages`.');

    assert.equal(text, 'Нашёл причину. Проблема была в периодическом обновлении сообщений: чат заново заменял список и перерисовывал транскрипт. Фикс добавляет проверку, чтобы не обновлять список без изменений.');
  });

  it('summarizes low-value operational English status lines', () => {
    let text = sanitizeVoiceResponseText('Changes already staged. Let me check the submodule and commit everything.');

    assert.equal(text, 'Агент проверяет изменения перед коммитом.');
  });

  it('keeps natural hyphenated words readable while removing cli flags', () => {
    let text = sanitizeVoiceResponseText('agent-portal использует route-based selection, но команду --force читать не нужно.');

    assert.equal(text, 'agent portal использует route based selection, но команду читать не нужно.');
  });

  it('keeps short natural quoted phrases but drops long quoted blocks', () => {
    let text = sanitizeVoiceResponseText('Он сказал «проверь статус» и пропустил "это очень длинная цитата которую не нужно целиком читать голосом пользователю".');

    assert.equal(text, 'Он сказал проверь статус и пропустил.');
  });

  it('limits long responses at a sentence boundary when possible', () => {
    let text = sanitizeVoiceResponseText('Первое предложение. Второе предложение. Третье предложение.', { maxChars: 42 });

    assert.equal(text, 'Первое предложение. Второе предложение.');
  });
});
