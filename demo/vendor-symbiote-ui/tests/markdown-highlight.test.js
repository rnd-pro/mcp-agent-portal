import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderMarkdown } from '../display/highlight.js';

test('renderMarkdown applies syntax highlighting to fenced JS code blocks', () => {
  const markdown = '```js\nconst x = 42;\n```';
  const html = renderMarkdown(markdown);

  assert.match(html, /<pre class="md-code-block">/);
  assert.match(html, /<code class="language-js">/);
  assert.match(html, /<span class="t-kw">const<\/span>/);
  assert.match(html, /<span class="t-num">42<\/span>/);
});

test('renderMarkdown applies syntax highlighting to fenced JSON code blocks', () => {
  const markdown = '```json\n{"status": "ok"}\n```';
  const html = renderMarkdown(markdown);

  assert.match(html, /<pre class="md-code-block">/);
  assert.match(html, /<code class="language-json">/);
  assert.match(html, /<span class="t-tl-prop">"status"<\/span>/);
  assert.match(html, /<span class="t-str">"ok"<\/span>/);
});

test('renderMarkdown applies syntax highlighting to fenced C++ code blocks', () => {
  const markdown = '```cpp\nclass SequenceFSM {\npublic:\n    int transition(Event e);\n};\n```';
  const html = renderMarkdown(markdown);

  assert.match(html, /<code class="language-cpp">/);
  assert.match(html, /<span class="t-kw">class<\/span>/);
  assert.match(html, /<span class="t-kw">public<\/span>/);
  assert.match(html, /<span class="t-kw">int<\/span>/);
  assert.match(html, /<span class="t-fn">transition<\/span>/);
});

test('renderMarkdown handles unclosed fenced code blocks gracefully', () => {
  const markdown = '```js\nlet a = 1;';
  const html = renderMarkdown(markdown);

  assert.match(html, /<pre class="md-code-block">/);
  assert.match(html, /<code class="language-js">/);
  assert.match(html, /<span class="t-kw">let<\/span>/);
});

test('renderMarkdown omits class attribute for fenced code blocks with empty/omitted language', () => {
  const markdown = '```\nplain text\n```';
  const html = renderMarkdown(markdown);

  assert.match(html, /<pre class="md-code-block">/);
  assert.match(html, /<code>plain text<\/code>/);
  assert.ok(!html.includes('class="language-"'));
});
