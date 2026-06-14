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
  let graphs;

  before(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'task-cache-test-'));
    graphs = [];
    let mod = await import('../../src/node/state-graph.js');
    StateGraph = mod.StateGraph;
  });

  after(async () => {
    for (let graph of graphs) {
      await graph.flushChatWrites();
      graph.flush();
    }
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  function createStateGraph(options) {
    let graph = new StateGraph(options);
    graphs.push(graph);
    return graph;
  }

  it('uses environment paths for default storage locations', async () => {
    let envDir = path.join(tmpDir, 'env-defaults');
    let previous = {
      PORTAL_STATE_DIR: process.env.PORTAL_STATE_DIR,
      PORTAL_STATE_PATH: process.env.PORTAL_STATE_PATH,
      PORTAL_WAL_PATH: process.env.PORTAL_WAL_PATH,
      PORTAL_CONFIG_PATH: process.env.PORTAL_CONFIG_PATH,
      PORTAL_CHATS_DIR: process.env.PORTAL_CHATS_DIR,
    };
    process.env.PORTAL_STATE_DIR = envDir;
    process.env.PORTAL_STATE_PATH = path.join(envDir, 'state.json');
    process.env.PORTAL_WAL_PATH = path.join(envDir, 'state.wal');
    process.env.PORTAL_CONFIG_PATH = path.join(envDir, 'agent-portal.json');
    process.env.PORTAL_CHATS_DIR = path.join(envDir, 'chats');
    try {
      let mod = await import(`../../src/node/state-graph.js?env=${Date.now()}-${Math.random()}`);
      let graph = new mod.StateGraph();
      graphs.push(graph);

      assert.equal(graph._snapshotPath, process.env.PORTAL_STATE_PATH);
      assert.equal(graph._walPath, process.env.PORTAL_WAL_PATH);
      assert.equal(graph._chatsDir, process.env.PORTAL_CHATS_DIR);
    } finally {
      for (let [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('stores full task metadata in StateGraph', () => {
    let sg = createStateGraph({
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
        adapter: 'antigravity',
        startedAt: Date.now(),
        parentTaskId: null,
      },
    }], 'agent-pool:created');

    let task = sg.get(`tasks/${taskId}`);
    assert.ok(task, 'Task should exist in state');
    assert.equal(task.status, 'running');
    assert.equal(task.adapter, 'antigravity');
  });

  it('pushes task events to the ring buffer', () => {
    let sg = createStateGraph({
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
    let sg = createStateGraph({
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
    let sg = createStateGraph({
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

    let sg = createStateGraph({ snapshotPath: snapPath, walPath });
    sg.load();

    let task = sg.get('tasks/task-lost');
    assert.equal(task.status, 'lost', 'Running task should be marked as lost after restart');
    assert.ok(task.error, 'Should have error message');
  });

  it('links child tasks to parent tasks', () => {
    let sg = createStateGraph({
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
    let sg = createStateGraph({
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

  it('keeps root chat delegation on orchestrator while preserving resource group and approval mode', () => {
    let sg = createStateGraph({
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
        resource_group: null,
        approval_mode: null,
      },
    }], 'test');

    sg.updateChat('chat-001', {
      agent: 'code-reviewer',
      resource_group: 'review',
      approval_mode: 'plan',
      unknown: 'ignored',
    }, 'test');

    let chat = sg.get('chats/chat-001');
    assert.equal(chat.agent, 'orchestrator');
    assert.equal(chat.resource_group, 'review');
    assert.equal(chat.approval_mode, 'plan');
    assert.equal(chat.unknown, undefined);
  });

  it('stores quick-start resource group in new chat metadata and file data', () => {
    let sg = createStateGraph({
      snapshotPath: path.join(tmpDir, 'chat-create-meta-snap.json'),
      walPath: path.join(tmpDir, 'chat-create-meta-wal.log'),
    });

    let { id } = sg.createChat({
      name: 'Quick start',
      projectId: 'project-1',
      agent: 'orchestrator',
      resource_group: 'implementation',
      approval_mode: 'auto_edit',
    }, 'mcp');

    assert.equal(sg.get(`chats/${id}`).resource_group, 'implementation');
    assert.equal(sg.get(`chats/${id}`).origin, 'mcp');
    assert.equal(sg.getChat(id).resource_group, 'implementation');
    assert.equal(sg.getChat(id).agent, 'orchestrator');
    assert.equal(sg.getChat(id).origin, 'mcp');
  });

  it('keeps chat reads current while chat files persist asynchronously', async () => {
    let chatDir = path.join(tmpDir, 'chat-files');
    let sg = createStateGraph({
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
    assert.deepEqual(
      (await fsp.readdir(chatDir)).filter((entry) => entry.endsWith('.tmp')),
      [],
      'chat persistence must not leave temporary files after atomic writes',
    );

    sg.deleteChat(id, 'test');
    assert.equal(sg.getChat(id), null);
    await sg.flushChatWrites();
  });

  it('returns bounded chat message pages for tail, before, and offset reads', async () => {
    let chatDir = path.join(tmpDir, 'chat-page-files');
    let sg = createStateGraph({
      snapshotPath: path.join(tmpDir, 'chat-page-snap.json'),
      walPath: path.join(tmpDir, 'chat-page-wal.log'),
      chatsDir: chatDir,
    });

    let { id } = sg.createChat({ name: 'Paged chat' }, 'test');
    for (let i = 0; i < 7; i++) {
      sg.appendChatMessage(id, { role: i % 2 ? 'assistant' : 'user', text: `message-${i}` });
    }

    let tail = sg.getChatMessagePage(id, { limit: 3 });
    assert.deepEqual(tail.messages.map((msg) => msg.text), ['message-4', 'message-5', 'message-6']);
    assert.equal(tail.total, 7);
    assert.equal(tail.start, 4);
    assert.equal(tail.end, 7);
    assert.equal(tail.hasBefore, true);
    assert.equal(tail.hasAfter, false);

    let older = sg.getChatMessagePage(id, { before: tail.start, limit: 2 });
    assert.deepEqual(older.messages.map((msg) => msg.text), ['message-2', 'message-3']);
    assert.equal(older.hasBefore, true);
    assert.equal(older.hasAfter, true);

    let middle = sg.getChatMessagePage(id, { offset: 1, limit: 3 });
    assert.deepEqual(middle.messages.map((msg) => msg.text), ['message-1', 'message-2', 'message-3']);
    assert.equal(middle.hasBefore, true);
    assert.equal(middle.hasAfter, true);
  });

  it('evicts clean full-chat cache entries without dropping pending chat writes', async () => {
    let chatDir = path.join(tmpDir, 'chat-cache-limit-files');
    let sg = createStateGraph({
      snapshotPath: path.join(tmpDir, 'chat-cache-limit-snap.json'),
      walPath: path.join(tmpDir, 'chat-cache-limit-wal.log'),
      chatsDir: chatDir,
      chatCacheLimit: 2,
    });

    let chatIds = [];
    for (let i = 0; i < 4; i++) {
      let { id } = sg.createChat({ name: `Cache ${i}` }, 'test');
      chatIds.push(id);
      sg.appendChatMessage(id, { role: 'user', text: `message-${i}` });
    }

    assert.ok(sg._chatCache.size >= 4, 'pending writes stay cached until persisted');
    await sg.flushChatWrites();

    assert.ok(sg._chatCache.size <= 2, `cache should be bounded after writes flush, got ${sg._chatCache.size}`);
    assert.equal(sg.getChat(chatIds[0]).messages[0].text, 'message-0');
    assert.ok(sg._chatCache.size <= 2, 'reading an evicted chat must keep the cache bounded');
  });

  it('creates, binds, pauses, resumes, blocks, completes, and deletes chat goals', async () => {
    let chatDir = path.join(tmpDir, 'goal-chat-files');
    let sg = createStateGraph({
      snapshotPath: path.join(tmpDir, 'goal-chat-snap.json'),
      walPath: path.join(tmpDir, 'goal-chat-wal.log'),
      chatsDir: chatDir,
    });

    let { id: chatId } = sg.createChat({ name: 'Goal Chat', projectId: 'project-1' }, 'test');
    let goal = sg.createChatGoal({
      chatId,
      projectId: 'project-1',
      title: 'Ship goal support',
      description: 'Create, pause, block, complete, and delete goals from chat.',
      context: ['state graph', 'mcp tools'],
      scenarios: ['goal intent'],
      createdBy: 'orchestrator',
    }, 'test');

    assert.equal(goal.status, 'active');
    assert.equal(sg.get(`goals/${goal.id}`).chatId, chatId);
    assert.equal(sg.get(`chats/${chatId}`).activeGoalId, goal.id);
    assert.equal(sg.getChat(chatId).activeGoalId, goal.id);

    let queued = sg.enqueueChatGoalMessage(goal.id, {
      text: 'Check the browser before finishing.',
      delivery: 'after',
    }, 'test');
    assert.equal(queued.item.status, 'queued');
    assert.equal(queued.item.delivery, 'after');
    assert.equal(sg.listChatGoalQueue(goal.id).length, 1);

    let applied = sg.enqueueChatGoalMessage(goal.id, {
      text: 'Restart the goal with this correction.',
      delivery: 'goal',
      status: 'applied',
    }, 'test');
    assert.equal(applied.item.delivery, 'goal');
    assert.equal(applied.item.status, 'applied');
    assert.ok(applied.item.appliedAt);

    let marked = sg.updateChatGoalQueueMessage(goal.id, queued.item.id, { status: 'applied' }, 'test');
    assert.equal(marked.item.status, 'applied');
    assert.ok(marked.item.appliedAt);
    assert.equal(sg.listChatGoalQueue(goal.id).length, 0);

    sg.enqueueChatGoalMessage(goal.id, { text: 'Queue me', delivery: 'after' }, 'test');
    let cleared = sg.clearChatGoalQueue(goal.id, {}, 'test');
    assert.equal(cleared.cleared.length, 1);
    assert.equal(sg.listChatGoalQueue(goal.id).length, 0);

    let paused = sg.updateChatGoal(goal.id, {
      status: 'paused',
      reason: 'User paused the goal',
      updatedBy: 'user',
    }, 'test');
    assert.equal(paused.status, 'paused');
    assert.equal(paused.pausedReason, 'User paused the goal');
    assert.equal(sg.get(`chats/${chatId}`).activeGoalId, goal.id);
    assert.equal(sg.getChat(chatId).activeGoalId, goal.id);

    let resumed = sg.updateChatGoal(goal.id, {
      status: 'active',
      updatedBy: 'user',
    }, 'test');
    assert.equal(resumed.status, 'active');
    assert.equal(sg.get(`chats/${chatId}`).activeGoalId, goal.id);
    assert.equal(sg.getChat(chatId).activeGoalId, goal.id);

    let blocked = sg.updateChatGoal(goal.id, {
      status: 'blocked',
      reason: 'Waiting for npm auth',
      updatedBy: 'orchestrator',
    }, 'test');
    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.blockedReason, 'Waiting for npm auth');
    assert.equal(sg.get(`chats/${chatId}`).activeGoalId, null);
    assert.equal(sg.getChat(chatId).activeGoalId, null);

    sg.selectChatGoal(chatId, goal.id, 'test');
    let completed = sg.updateChatGoal(goal.id, {
      status: 'completed',
      reason: 'Verified in browser',
      updatedBy: 'orchestrator',
    }, 'test');
    assert.equal(completed.status, 'completed');
    assert.ok(completed.completedAt);
    assert.equal(sg.get(`chats/${chatId}`).activeGoalId, null);
    assert.equal(sg.getChat(chatId).activeGoalId, null);

    assert.deepEqual(sg.listChatGoals({ chatId }).map(item => item.id), [goal.id]);

    let deleteGoal = sg.createChatGoal({ chatId, title: 'Delete me' }, 'test');
    assert.equal(sg.get(`chats/${chatId}`).activeGoalId, deleteGoal.id);
    let deleted = sg.deleteChatGoal(deleteGoal.id, 'test');
    assert.equal(deleted.status, 'deleted');
    assert.equal(sg.getChatGoal(deleteGoal.id), null);
    assert.equal(sg.get(`chats/${chatId}`).activeGoalId, null);
    assert.equal(sg.getChat(chatId).activeGoalId, null);
  });

  it('clears pending chat tasks only when the terminal event matches the current task', async () => {
    let chatDir = path.join(tmpDir, 'task-restart-chat-files');
    let sg = createStateGraph({
      snapshotPath: path.join(tmpDir, 'task-restart-chat-snap.json'),
      walPath: path.join(tmpDir, 'task-restart-chat-wal.log'),
      chatsDir: chatDir,
    });

    let { id: chatId } = sg.createChat({ name: 'Restart Chat' }, 'test');
    sg.updateChatTask(chatId, 'task-old');
    sg.updateChatTask(chatId, 'task-new');
    sg.updateChatTask(chatId, null, { expectedTaskId: 'task-old' });
    assert.equal(sg.getChat(chatId).pendingTaskId, 'task-new');
    assert.equal(sg.get(`chats/${chatId}`).pendingTaskId, 'task-new');

    sg.updateChatTask(chatId, null, { expectedTaskId: 'task-new' });
    assert.equal(sg.getChat(chatId).pendingTaskId, undefined);
    assert.equal(sg.get(`chats/${chatId}`).pendingTaskId, null);
  });
});
