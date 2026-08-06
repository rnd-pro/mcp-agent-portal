import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeVoiceResponseText } from '../chat/voice-response-sanitizer.js';

test('keeps plain prose unchanged (trimmed)', () => {
  const out = sanitizeVoiceResponseText('The feeder is restored and the crew is on site.');
  assert.equal(out, 'The feeder is restored and the crew is on site.');
});

test('strips fenced code blocks', () => {
  const out = sanitizeVoiceResponseText('Done. ```js\nconst x = 1;\nrun();\n``` All good.');
  assert.ok(!out.includes('const x'), 'code removed');
  assert.ok(out.includes('Done'));
  assert.ok(out.includes('All good'));
});

test('drops shell command and stack-trace lines', () => {
  const out = sanitizeVoiceResponseText('Status update.\nnpm run build\n  at foo (bar.js:1)\nDeployment finished.');
  assert.ok(!out.includes('npm run build'));
  assert.ok(!out.includes('bar.js'));
  assert.ok(out.includes('Status update'));
  assert.ok(out.includes('Deployment finished'));
});

test('removes urls and inline code, keeps surrounding words', () => {
  const out = sanitizeVoiceResponseText('See https://example.com/x and run `git status` now.');
  assert.ok(!out.includes('http'));
  assert.ok(!out.includes('git status'));
  assert.ok(out.includes('See'));
  assert.ok(out.includes('now'));
});

test('truncates long text at a sentence boundary within maxChars', () => {
  const long = ('Sentence one is here. ').repeat(60); // > 900 chars
  const out = sanitizeVoiceResponseText(long, { maxChars: 100 });
  assert.ok(out.length <= 100);
  assert.ok(/[.!?]$/.test(out), 'ends at a sentence stop');
});

test('summarize hook short-circuits and returns verbatim', () => {
  const out = sanitizeVoiceResponseText('anything at all', { summarize: () => 'Связь есть.' });
  assert.equal(out, 'Связь есть.');
});

test('summarize hook returning empty falls through to general filter', () => {
  const out = sanitizeVoiceResponseText('Plain reply.', { summarize: () => '' });
  assert.equal(out, 'Plain reply.');
});

test('handles null/empty input', () => {
  assert.equal(sanitizeVoiceResponseText(null), '');
  assert.equal(sanitizeVoiceResponseText(''), '');
});
