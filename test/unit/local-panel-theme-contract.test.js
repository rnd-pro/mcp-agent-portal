import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

describe('local panel theme contract', () => {
  it('keeps context, skill, and agent list panels on symbiote theme tokens', () => {
    for (let relative of [
      'web/panels/CtxPanel/CtxPanel.css.js',
      'web/panels/SkillManager/SkillManager.css.js',
      'web/panels/SkillManager/SkillMetadata.js',
      'web/panels/ActiveContext/ActiveContext.js',
      'web/panels/AgentListPanel/AgentListItem.js',
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      for (let literal of [
        '#888',
        '#f87171',
        'Georgia',
        'SF Mono',
        'Fira Code',
        "fontFamily: 'monospace'",
        'font-family: monospace',
        'var(--sn-font,',
      ]) {
        assert.equal(source.includes(literal), false, `${relative} must not copy provider styling with ${literal}`);
      }
    }
  });
});
