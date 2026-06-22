import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StateGraph } from '../../src/node/state-graph.js';

// resetToFreshInstall wipes every runtime/cache collection plus on-disk chat files back to the default
// shape, preserves user settings by default, drops lazily-created runtime keys, and leaves the default
// workflow board to be re-seeded on next read (so the app looks freshly installed).
describe('state-graph resetToFreshInstall', () => {
  let dir;
  let sg;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-reset-'));
    sg = new StateGraph({
      snapshotPath: path.join(dir, 'state.json'),
      walPath: path.join(dir, 'state.wal'),
      chatsDir: path.join(dir, 'chats'),
      oldConfigPath: path.join(dir, 'no-such-old-config.json'),
    });
    sg.load();
  });

  afterEach(async () => {
    try { await sg.flushChatWrites(); } catch { /* none */ }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function seed() {
    sg.commit([
      { op: 'set', path: 'workflowBoards/b1', value: { id: 'b1' } },
      { op: 'set', path: 'workflowCards/c1', value: { id: 'c1', title: 'Test card' } },
      { op: 'set', path: 'workflowRuns/r1', value: { id: 'r1' } },
      { op: 'set', path: 'goals/g1', value: { id: 'g1', title: 'Goal' } },
      { op: 'set', path: 'tasks/t1', value: { id: 't1', status: 'lost' } },
      { op: 'set', path: 'layouts/l1', value: { x: 1 } },
      { op: 'set', path: 'projects/p1', value: { id: 'p1' } },
      // lazily-created top-level runtime key not in the default shape
      { op: 'set', path: 'workflowQueueEntries/q1', value: { id: 'q1' } },
      { op: 'set', path: 'settings/providerModels', value: { claude: ['x'] } },
      { op: 'set', path: 'settings/telegramToken', value: 'secret-token' },
    ], 'test');
  }

  it('clears runtime collections + chat files, keeps settings, drops extra runtime keys', () => {
    seed();
    let chat = sg.createChat({ name: 'hello' }, 'test');
    sg._flushChatFilesSync();
    let chatFile = path.join(dir, 'chats', `${chat.id}.json`);
    assert.ok(fs.existsSync(chatFile), 'chat file exists before reset');
    assert.equal(Object.keys(sg.get('workflowCards')).length, 1, 'seeded card present');

    let result = sg.resetToFreshInstall();

    for (let col of ['workflowBoards', 'workflowCards', 'workflowTransitions', 'workflowChecks',
      'workflowRuns', 'workflowLeases', 'goals', 'tasks', 'projects', 'layouts', 'chats']) {
      assert.deepEqual(sg.get(col), {}, `${col} cleared`);
    }
    assert.equal(sg.get('workflowQueueEntries'), undefined, 'lazily-created runtime key deleted');

    // settings preserved
    assert.equal(sg.get('settings/telegramToken'), 'secret-token', 'settings kept');
    assert.deepEqual(sg.get('settings/providerModels'), { claude: ['x'] }, 'provider models kept');

    // chat file + in-memory chat gone
    assert.ok(!fs.existsSync(chatFile), 'chat file removed');
    assert.ok(result.clearedChatFiles >= 1, 'reported at least one cleared chat file');
    assert.equal(sg.getChat(chat.id), null, 'chat no longer retrievable');
  });

  it('keepSettings:false resets settings to the default shape', () => {
    seed();
    sg.resetToFreshInstall({ keepSettings: false });
    assert.deepEqual(
      sg.get('settings'),
      { mcpServers: {}, globalCli: {}, providerModels: {}, adapters: {} },
      'settings reset to default',
    );
  });
});
