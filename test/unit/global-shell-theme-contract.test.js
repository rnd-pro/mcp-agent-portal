import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

let OWNED_THEME_FILES = [
  'web/style.css',
  'web/panels/AgentChat/AgentChat.css.js',
];

let REMOVED_FALLBACK_LITERALS = [
  '#1a1a1a',
  '#222222',
  '#f0f0f0',
  '#999999',
  '#999',
  '#555',
  "'Inter', -apple-system, sans-serif",
  "'JetBrains Mono', 'Fira Code', monospace",
];

describe('global shell theme contract', () => {
  it('does not restore provider color or font fallbacks in owned shell CSS', () => {
    for (let relative of OWNED_THEME_FILES) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');

      for (let literal of REMOVED_FALLBACK_LITERALS) {
        assert.equal(
          source.includes(literal),
          false,
          `${relative} must consume symbiote-ui tokens instead of fallback literal ${literal}`,
        );
      }
    }
  });

  it('keeps project accent as product data while ending its chain at provider text token', () => {
    let source = fs.readFileSync(path.join(ROOT, 'web/style.css'), 'utf8');

    assert.ok(
      source.includes('color: var(--project-accent, var(--sn-text));'),
      'project name must keep project accent with provider token fallback',
    );
    assert.equal(
      source.includes('var(--project-accent, var(--sn-text,'),
      false,
      'project accent fallback chain must not include copied provider literals',
    );
  });

  it('uses provider font tokens for base and mono typography', () => {
    let globalCss = fs.readFileSync(path.join(ROOT, 'web/style.css'), 'utf8');
    let chatCss = fs.readFileSync(
      path.join(ROOT, 'web/panels/AgentChat/AgentChat.css.js'),
      'utf8',
    );

    assert.ok(globalCss.includes('font-family: var(--sn-font);'));
    assert.ok(chatCss.includes('font-family: var(--sn-font);'));
    assert.ok(globalCss.includes('font-family: var(--sn-font-mono);'));
  });
});
