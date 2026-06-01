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

  it('limits long responses at a sentence boundary when possible', () => {
    let text = sanitizeVoiceResponseText('Первое предложение. Второе предложение. Третье предложение.', { maxChars: 42 });

    assert.equal(text, 'Первое предложение. Второе предложение.');
  });
});
