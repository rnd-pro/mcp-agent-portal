import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

function extractBlock(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing block: ${marker}`);
  const openingBrace = source.indexOf('{', start);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(openingBrace + 1, index);
  }
  assert.fail(`Unclosed block: ${marker}`);
}

test('ChatComposer CSS layout <=480px block has no three-row grid override for .composer-body', () => {
  const css = fs.readFileSync('chat/ChatComposer/ChatComposer.css.js', 'utf8');
  const narrowBlock = extractBlock(css, '@container chat-composer (width <= 480px)');
  assert.ok(!narrowBlock.includes('.composer-body'), 'Should not override .composer-body layout in narrow block');
  assert.ok(!narrowBlock.includes('grid-row: 3'), 'Should not place controls on a third row');
  assert.ok(!narrowBlock.includes('grid-template-rows'), 'Should preserve the base two-row composer layout');
});

test('ChatComposer JS templates bind accessibleName via aria-label', () => {
  const js = fs.readFileSync('chat/ChatComposer/ChatComposer.js', 'utf8');
  assert.match(js, /<select class="composer-footer-select"[^>]*'@aria-label': 'accessibleName'/);
  assert.match(js, /<input class="composer-footer-checkbox"[^>]*'@aria-label': 'accessibleName'/);
  assert.match(js, /accessibleName = String\(item\.title \|\| item\.label \|\| item\.id \|\| ''\)/);
});
