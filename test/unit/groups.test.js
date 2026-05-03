import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TEST_CWD = path.join(os.tmpdir(), `agent-pool-groups-test-${Date.now()}`);

describe('groups.js', () => {
  let createGroup, listGroups, getGroup, deleteGroup, getGroupNextModel;

  before(async () => {
    const mod = await import('../../packages/agent-pool-mcp/src/tools/groups.js');
    createGroup = mod.createGroup;
    listGroups = mod.listGroups;
    getGroup = mod.getGroup;
    deleteGroup = mod.deleteGroup;
    getGroupNextModel = mod.getGroupNextModel;

    if (!fs.existsSync(TEST_CWD)) {
      fs.mkdirSync(TEST_CWD, { recursive: true });
    }
  });

  after(() => {
    if (fs.existsSync(TEST_CWD)) {
      fs.rmSync(TEST_CWD, { recursive: true, force: true });
    }
  });

  it('createGroup creates a group with rotation settings', () => {
    const res = createGroup(TEST_CWD, {
      name: 'test-group',
      rotation_mode: 'round_robin',
      fallback_profiles: ['modelA', 'modelB', 'modelC']
    });

    assert.strictEqual(res.name, 'test-group');
    assert.strictEqual(res.created, true);

    const group = getGroup(TEST_CWD, 'test-group');
    assert.strictEqual(group.rotation_mode, 'round_robin');
    assert.deepStrictEqual(group.fallback_profiles, ['modelA', 'modelB', 'modelC']);
  });

  it('getGroupNextModel with error_fallback always returns first model', () => {
    createGroup(TEST_CWD, {
      name: 'error-group',
      rotation_mode: 'error_fallback',
      fallback_profiles: ['primary', 'secondary']
    });

    assert.strictEqual(getGroupNextModel(TEST_CWD, 'error-group'), 'primary');
    assert.strictEqual(getGroupNextModel(TEST_CWD, 'error-group'), 'primary'); // Does not rotate
  });

  it('getGroupNextModel with round_robin rotates cyclically and persists', () => {
    // We created test-group with modelA, modelB, modelC
    assert.strictEqual(getGroupNextModel(TEST_CWD, 'test-group'), 'modelA');
    assert.strictEqual(getGroupNextModel(TEST_CWD, 'test-group'), 'modelB');
    assert.strictEqual(getGroupNextModel(TEST_CWD, 'test-group'), 'modelC');
    assert.strictEqual(getGroupNextModel(TEST_CWD, 'test-group'), 'modelA'); // Wraps around

    // Check persistence in file
    const stateFile = path.join(TEST_CWD, '.agents', 'group-states.json');
    assert.ok(fs.existsSync(stateFile));
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    assert.strictEqual(state['test-group'].currentIndex, 1);
  });

  it('listGroups and getGroup basic CRUD', () => {
    const list = listGroups(TEST_CWD);
    assert.strictEqual(list.length, 2); // test-group, error-group
    
    assert.ok(list.find(g => g.name === 'test-group'));
  });

  it('deleteGroup removes the group', () => {
    const deleted = deleteGroup(TEST_CWD, 'error-group');
    assert.strictEqual(deleted, true);
    
    const group = getGroup(TEST_CWD, 'error-group');
    assert.strictEqual(group, null);
    
    const list = listGroups(TEST_CWD);
    assert.strictEqual(list.length, 1);
  });
});
