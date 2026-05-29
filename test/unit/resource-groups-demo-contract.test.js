import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

describe('resource groups demo contract', () => {
  it('publishes realistic resource group lanes with multiple model profiles', async () => {
    let { groups } = await import('../../demo/mock-data.js');
    let names = groups.map(group => group.name);

    assert.deepEqual(
      names,
      [
        'reasoning-heavy',
        'implementation',
        'review',
        'verification',
        'deepseek-pro-audit',
        'ui-implementation-deepseek',
      ]
    );

    for (let group of groups) {
      assert.ok(Array.isArray(group.profiles), `${group.name} must expose profile cells`);
      assert.ok(group.profiles.length >= 2, `${group.name} must render as a kanban column with multiple model cells`);
      assert.ok(group.rotation_mode, `${group.name} must include rotation policy`);
      assert.ok(group.max_agents, `${group.name} must include concurrency limit`);
      assert.ok(Array.isArray(group.agents), `${group.name} must map agents to the public lane`);
    }
  });

  it('keeps public demo model names current and removes test-only groups', () => {
    let source = fs.readFileSync(path.join(ROOT, 'demo/mock-data.js'), 'utf8');

    for (let stale of [
      'Frontend Team',
      'Research Squad',
      'modelA',
      'modelB',
      'modelC',
      'openrouter/test-model',
      'gemini-3.1-pro-preview',
      'gemini-3.1-flash-lite-preview',
      'gemini-3-pro-preview',
      'gemini-3-flash-preview',
      'gpt-4.5',
      'deepseek-chat',
      'deepseek-reasoner',
    ]) {
      assert.equal(source.includes(stale), false, `demo/mock-data.js must not expose stale or test-only value: ${stale}`);
    }
    for (let stalePattern of [
      /(?<![\w-])claude-sonnet-4(?![\w-])/,
      /(?<![\w-])claude-opus-4(?![\w-])/,
      /(?<![\w/-])deepseek-v4(?![\w/-])/,
    ]) {
      assert.equal(stalePattern.test(source), false, `demo/mock-data.js must not expose stale model pattern: ${stalePattern}`);
    }
  });

  it('renders resource group profile metadata without inline styles', () => {
    let source = fs.readFileSync(path.join(ROOT, 'web/panels/GroupManager/GroupManager.js'), 'utf8');

    assert.ok(source.includes('gm-agent-list'), 'GroupManager must show group agent ownership');
    assert.ok(source.includes('profile.label || provider'), 'GroupManager must render profile labels when demo data provides them');
    assert.equal(source.includes('style.'), false, 'GroupManager must keep styling in CSS');
  });
});
