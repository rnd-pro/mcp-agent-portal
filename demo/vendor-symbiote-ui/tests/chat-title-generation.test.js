import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChatTitleRequestNote } from '../chat/chat-title-generation.js';

test('returns a non-empty string for supported locales', () => {
  for (const locale of ['en', 'ru', 'es']) {
    const note = buildChatTitleRequestNote(locale);
    assert.equal(typeof note, 'string');
    assert.ok(note.length > 0, `expected non-empty note for ${locale}`);
    assert.ok(note.includes('<chat-title>'), `expected chat-title tag for ${locale}`);
  }
});

test('localizes English, Russian, and Spanish distinctly', () => {
  const en = buildChatTitleRequestNote('en');
  const ru = buildChatTitleRequestNote('ru');
  const es = buildChatTitleRequestNote('es');

  assert.ok(en.includes('Internal instruction'));
  assert.ok(ru.includes('Служебная инструкция'));
  assert.ok(es.includes('Instruccion interna'));

  assert.notEqual(en, ru);
  assert.notEqual(en, es);
  assert.notEqual(ru, es);
});

test('falls back to English for unknown locale', () => {
  const fallback = buildChatTitleRequestNote('de');
  assert.equal(fallback, buildChatTitleRequestNote('en'));
});

test('defaults to English when no locale is provided', () => {
  assert.equal(buildChatTitleRequestNote(), buildChatTitleRequestNote('en'));
});
