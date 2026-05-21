// @ctx task-state-cache tests
// Real-time task state caching in StateGraph

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('Task State Cache — StateGraph integration', () => {
  let tmpDir;
  let StateGraph;

  before(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'task-cache-test-'));
    let mod = await import('../../src/node/state-graph.js');
    StateGraph = mod.StateGraph;
  });

  after(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('stores full task metadata in StateGraph', () => {
    let sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 't1-snap.json'),
      walPath: path.join(tmpDir, 't1-wal.log'),
    });

    let taskId = 'task-001';
    sg.commit([{
      op: 'set',
      path: `tasks/${taskId}`,
      value: {
        status: 'running',
        prompt: 'test task',
        adapter: 'gemini',
        startedAt: Date.now(),
        parentTaskId: null,
      },
    }], 'agent-pool:created');

    let task = sg.get(`tasks/${taskId}`);
    assert.ok(task, 'Task should exist in state');
    assert.equal(task.status, 'running');
    assert.equal(task.adapter, 'gemini');
  });

  it('pushes task events to the ring buffer', () => {
    let sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 't2-snap.json'),
      walPath: path.join(tmpDir, 't2-wal.log'),
    });

    let taskId = 'task-002';
    sg.set(`tasks/${taskId}`, { status: 'running', events: [] }, 'test');

    sg.commit([{ op: 'push', path: `tasks/${taskId}/events`, value: { type: 'message', text: 'hello', ts: 1 } }], 'event');
    sg.commit([{ op: 'push', path: `tasks/${taskId}/events`, value: { type: 'tool_use', name: 'read_file', ts: 2 } }], 'event');
    sg.commit([{ op: 'push', path: `tasks/${taskId}/events`, value: { type: 'message', text: 'done', ts: 3 } }], 'event');

    let events = sg.get(`tasks/${taskId}/events`);
    assert.equal(events.length, 3);
    assert.equal(events[0].type, 'message');
    assert.equal(events[1].type, 'tool_use');
    assert.equal(events[2].text, 'done');
  });

  it('updates task status and result on completion', () => {
    let sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 't3-snap.json'),
      walPath: path.join(tmpDir, 't3-wal.log'),
    });

    let taskId = 'task-003';
    sg.set(`tasks/${taskId}`, { status: 'running', events: [] }, 'test');

    sg.merge(`tasks/${taskId}`, {
      status: 'done',
      completedAt: Date.now(),
      result: 'Task completed successfully',
    }, 'agent-pool:done');

    let task = sg.get(`tasks/${taskId}`);
    assert.equal(task.status, 'done');
    assert.ok(task.completedAt);
    assert.equal(task.result, 'Task completed successfully');
  });

  it('returns task events for delta sync', () => {
    let sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 't4-snap.json'),
      walPath: path.join(tmpDir, 't4-wal.log'),
    });

    let v0 = sg.version;
    sg.set(`tasks/t4`, { status: 'running', events: [] }, 'test');
    sg.commit([{ op: 'push', path: 'tasks/t4/events', value: { type: 'message', ts: 1 } }], 'event');
    sg.commit([{ op: 'push', path: 'tasks/t4/events', value: { type: 'tool_use', ts: 2 } }], 'event');

    let patches = sg.getPatches(v0);
    assert.ok(patches, 'Should return patches');
    assert.ok(patches.length >= 3, `Should have at least 3 patches, got ${patches.length}`);
  });

  it('marks running tasks as lost after restart', async () => {
    let snapPath = path.join(tmpDir, 't5-snap.json');
    let walPath = path.join(tmpDir, 't5-wal.log');

    await fsp.mkdir(path.join(tmpDir), { recursive: true });
    await fsp.writeFile(snapPath, JSON.stringify({
      _v: 1,
      _ts: Date.now(),
      tasks: {
        'task-lost': { status: 'running', prompt: 'will be lost' },
      },
      chats: {},
      projects: {},
      settings: {},
      ui: {},
    }));

    let sg = new StateGraph({ snapshotPath: snapPath, walPath });
    sg.load();

    let task = sg.get('tasks/task-lost');
    assert.equal(task.status, 'lost', 'Running task should be marked as lost after restart');
    assert.ok(task.error, 'Should have error message');
  });

  it('links child tasks to parent tasks', () => {
    let sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 't6-snap.json'),
      walPath: path.join(tmpDir, 't6-wal.log'),
    });

    sg.set('tasks/parent-001', { status: 'running', events: [] }, 'test');
    sg.set('tasks/child-001', { status: 'running', parentTaskId: 'parent-001', events: [] }, 'test');
    sg.set('tasks/child-002', { status: 'running', parentTaskId: 'parent-001', events: [] }, 'test');

    let parent = sg.get('tasks/parent-001');
    let child1 = sg.get('tasks/child-001');
    let child2 = sg.get('tasks/child-002');

    assert.ok(parent, 'Parent task should exist');
    assert.equal(child1.parentTaskId, 'parent-001');
    assert.equal(child2.parentTaskId, 'parent-001');
  });

  it('preserves task event history in StateGraph', () => {
    let sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 't7-snap.json'),
      walPath: path.join(tmpDir, 't7-wal.log'),
    });

    let taskId = 'task-ring';
    sg.set(`tasks/${taskId}`, { status: 'running', events: [] }, 'test');

    for (let i = 0; i < 250; i++) {
      sg.commit([{ op: 'push', path: `tasks/${taskId}/events`, value: { type: 'message', i, ts: i } }], 'event');
    }

    let events = sg.get(`tasks/${taskId}/events`);
    assert.ok(events.length === 250, `Should have 250 events, got ${events.length}`);
  });

  it('preserves agent and approval mode in chat metadata updates', () => {
    let sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'chat-meta-snap.json'),
      walPath: path.join(tmpDir, 'chat-meta-wal.log'),
    });

    sg.commit([{
      op: 'set',
      path: 'chats/chat-001',
      value: {
        id: 'chat-001',
        name: 'Chat',
        agent: null,
        approval_mode: null,
      },
    }], 'test');

    sg.updateChat('chat-001', {
      agent: 'code-reviewer',
      approval_mode: 'plan',
      unknown: 'ignored',
    }, 'test');

    let chat = sg.get('chats/chat-001');
    assert.equal(chat.agent, 'code-reviewer');
    assert.equal(chat.approval_mode, 'plan');
    assert.equal(chat.unknown, undefined);
  });

  it('keeps chat reads current while chat files persist asynchronously', async () => {
    let chatDir = path.join(tmpDir, 'chat-files');
    let sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'chat-file-snap.json'),
      walPath: path.join(tmpDir, 'chat-file-wal.log'),
      chatsDir: chatDir,
    });

    let { id } = sg.createChat({ name: 'StateGraph chat' }, 'test');
    sg.appendChatMessage(id, { role: 'assistant', text: 'saved' });

    assert.equal(sg.getChat(id).messages[0].text, 'saved');

    await sg.flushChatWrites();
    let raw = await fsp.readFile(path.join(chatDir, `${id}.json`), 'utf8');
    assert.equal(JSON.parse(raw).messages[0].text, 'saved');

    sg.deleteChat(id, 'test');
    assert.equal(sg.getChat(id), null);
    await sg.flushChatWrites();
  });
});
