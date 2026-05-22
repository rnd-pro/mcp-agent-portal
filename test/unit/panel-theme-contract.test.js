import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

const PANEL_THEME_FILES = [
  'web/panels/PipelineManager/PipelineStep.js',
  'web/panels/ProjectItem/ProjectItem.css.js',
  'web/panels/Marketplace/McpServerCard.js',
  'web/panels/Marketplace/ContextCard.js',
  'web/panels/Marketplace/Marketplace.css.js',
  'web/panels/RuntimeControl/RuntimeControl.css.js',
  'web/panels/ToolExplorer/ToolCard.js',
];

describe('portal panel theme contract', () => {
  it('keeps reusable product panels on symbiote-node font tokens', () => {
    for (let relative of PANEL_THEME_FILES) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');

      for (let literal of [
        'var(--sn-font,',
        'var(--sn-font-mono,',
        'font-family: monospace',
        'ui-monospace',
        'SFMono-Regular',
        'JetBrains Mono',
        'Fira Code',
        'Menlo',
        'Monaco',
        'Consolas',
        '-apple-system',
        'sans-serif',
      ]) {
        assert.equal(
          source.includes(literal),
          false,
          `${relative} must not copy provider font fallback ${literal}`
        );
      }
    }
  });

  it('uses provider typography tokens where owned panels set font families', () => {
    for (let relative of PANEL_THEME_FILES) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      let fontDeclarations = source.match(/font-family:\s*[^;]+;/g) ?? [];

      for (let declaration of fontDeclarations) {
        assert.match(
          declaration,
          /font-family:\s*var\(--sn-font(?:-mono)?\);/,
          `${relative} must use --sn-font or --sn-font-mono without local fallbacks`
        );
      }
    }
  });
});
