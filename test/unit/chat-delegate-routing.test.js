import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StateGraph } from '../../src/node/state-graph.js';
import { prepareDelegateTaskCall } from '../../src/node/proxy/chat-delegate-routing.js';

describe('chat delegate routing', () => {
  let tmpDir;
  let sg;
  let proxyManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-delegate-routing-'));
    sg = new StateGraph({
      snapshotPath: path.join(tmpDir, 'state.json'),
      walPath: path.join(tmpDir, 'state.wal'),
      chatsDir: path.join(tmpDir, 'chats'),
    });
    proxyManager = { projectRoot: tmpDir, broadcastMonitor() {} };
  });

  afterEach(async () => {
    await sg.flushChatWrites();
    sg.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('applies chat orchestration defaults to same-chat MCP delegation', async () => {
    let projectPath = path.join(tmpDir, 'project');
    let project = sg.addProject({ path: projectPath, name: 'Project' });
    let chat = sg.createChat({
      name: 'Main',
      projectId: project.id,
      agent: 'orchestrator',
      provider: 'antigravity',
      model: 'default',
      approval_mode: 'yolo',
      resource_group: 'reasoning-heavy',
      goalIntentActive: true,
    }, 'test');

    let prepared = await prepareDelegateTaskCall(proxyManager, 'delegate_task', {
      chat_id: chat.id,
      prompt: 'Plan the work',
    }, { stateGraph: sg, source: 'test' });

    assert.equal(prepared.args.agent_slug, 'orchestrator');
    assert.equal(prepared.args.resource_group, 'reasoning-heavy');
    assert.equal(prepared.args.approval_mode, 'yolo');
    assert.equal(prepared.args.provider, undefined);
    assert.equal(prepared.args.model, undefined);
    assert.equal(prepared.args.cwd, projectPath);
    assert.match(prepared.args.prompt, /^\[Goal Intent\]/);
  });

  it('injects active goal context for MCP delegate calls bound to a chat', async () => {
    let chat = sg.createChat({ name: 'Goal chat', agent: 'orchestrator' }, 'test');
    let goal = sg.createChatGoal({ chatId: chat.id, title: 'Ship MCP parity' }, 'test');

    let prepared = await prepareDelegateTaskCall(proxyManager, 'delegate_task', {
      chat_id: chat.id,
      prompt: 'Continue',
    }, { stateGraph: sg, source: 'test' });

    assert.match(prepared.args.prompt, /^\[Active Goal\]/);
    assert.match(prepared.args.prompt, new RegExp(goal.id));
  });

  it('injects selected queued goal messages into chat-bound MCP delegation', async () => {
    let chat = sg.createChat({ name: 'Goal queue chat', agent: 'orchestrator' }, 'test');
    let goal = sg.createChatGoal({ chatId: chat.id, title: 'Ship queue parity' }, 'test');
    let queued = sg.enqueueChatGoalMessage(goal.id, {
      id: 'queued-1',
      text: 'Apply this queued correction.',
      delivery: 'after',
    }, 'test');
    sg.enqueueChatGoalMessage(goal.id, {
      id: 'queued-2',
      text: 'Do not apply this queued note yet.',
      delivery: 'after',
    }, 'test');

    let prepared = await prepareDelegateTaskCall(proxyManager, 'delegate_task', {
      chat_id: chat.id,
      prompt: 'Continue the active goal.',
      goal_message_ids: [queued.item.id],
    }, { stateGraph: sg, source: 'test' });

    assert.match(prepared.args.prompt, /^\[Active Goal\]/);
    assert.match(prepared.args.prompt, /\[Goal Queue\]/);
    assert.match(prepared.args.prompt, /Apply this queued correction\./);
    assert.doesNotMatch(prepared.args.prompt, /Do not apply this queued note yet\./);
    assert.ok(prepared.args.prompt.indexOf('[Goal Queue]') > prepared.args.prompt.indexOf('[Active Goal]'));
    assert.equal(prepared.args.goal_message_ids, undefined);
    assert.equal(prepared.args.goalQueueMessages, undefined);
  });

  it('creates child chats for MCP sub-delegation without leaking parent resource group to explicit agents', async () => {
    let parent = sg.createChat({
      name: 'Parent',
      agent: 'orchestrator',
      resource_group: 'reasoning-heavy',
      approval_mode: 'yolo',
    }, 'test');
    sg.createChatGoal({ chatId: parent.id, title: 'Parent goal' }, 'test');

    let prepared = await prepareDelegateTaskCall(proxyManager, 'delegate_task', {
      parent_chat_id: parent.id,
      agent_slug: 'backend-engineer',
      prompt: 'Implement the backend slice',
    }, { stateGraph: sg, source: 'test' });

    assert.ok(prepared.createdChat?.id);
    assert.equal(prepared.args.chat_id, prepared.createdChat.id);
    assert.equal(prepared.createdChat.parentChatId, parent.id);
    assert.equal(prepared.createdChat.agent, 'backend-engineer');
    assert.equal(prepared.args.agent_slug, 'backend-engineer');
    assert.equal(prepared.args.resource_group, undefined);
    assert.equal(prepared.args.approval_mode, undefined);
    assert.match(prepared.args.prompt, /^\[Active Goal\]/);
  });

  it('inherits parent resource group for default orchestrator MCP sub-delegation', async () => {
    let parent = sg.createChat({
      name: 'Parent',
      agent: 'orchestrator',
      provider: 'claude',
      model: 'deepseek/deepseek-v4-pro',
      resource_group: 'reasoning-heavy',
      approval_mode: 'yolo',
    }, 'test');

    let prepared = await prepareDelegateTaskCall(proxyManager, 'delegate_task', {
      parent_chat_id: parent.id,
      prompt: 'Continue orchestration',
    }, { stateGraph: sg, source: 'test' });

    assert.equal(prepared.args.agent_slug, 'orchestrator');
    assert.equal(prepared.args.resource_group, 'reasoning-heavy');
    assert.equal(prepared.args.approval_mode, 'yolo');
    assert.equal(prepared.args.provider, undefined);
    assert.equal(prepared.args.model, undefined);
  });

  it('adds compact project graph focus context from files hints', async () => {
    let projectPath = path.join(tmpDir, 'project');
    let project = sg.addProject({ path: projectPath, name: 'Project' });
    let chat = sg.createChat({
      name: 'Main',
      projectId: project.id,
      agent: 'backend-engineer',
    }, 'test');
    let calls = [];
    proxyManager.requestFromChild = async (server, method, payload) => {
      calls.push({ server, method, payload });
      if (payload.name === 'get_skeleton') {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              L: {
                DR: 'DemoRoute',
                HF: 'handleFocus',
                OR: 'OtherRoute',
              },
              n: {
                DR: { f: 'src/demo.js', l: 12, m: ['HF'] },
                OR: { f: 'src/other.js', l: 8, m: [] },
              },
              X: {
                'src/demo.js': ['HF'],
              },
              I: {
                'src/demo.js': [{ s: 'node:path' }, { s: './service.js' }],
              },
              W: {
                DR: {
                  tag: 'demo-route',
                  file: 'src/demo.js',
                  template: 'src/demo.tpl.js',
                  style: 'src/demo.css.js',
                  children: ['child-card'],
                  events: ['click'],
                  dispatches: ['route-ready'],
                  subscriptions: ['route/items'],
                  bindings: ['onclick:onRouteClick'],
                  tokens: ['--sn-text'],
                },
              },
            }),
          }],
        };
      }
      if (payload.name === 'navigate' && payload.arguments.action === 'deps') {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              symbol: payload.arguments.symbol,
              imports: ['node:path'],
              usedBy: ['App'],
              calls: ['Svc.handle'],
              files: ['src/demo.tpl.js', 'src/demo.css.js'],
              elements: ['CC'],
              web: {
                tag: 'demo-route',
                template: 'src/demo.tpl.js',
                style: 'src/demo.css.js',
              },
            }),
          }],
        };
      }
      throw new Error(`Unexpected project graph call: ${payload.name}`);
    };

    let prepared = await prepareDelegateTaskCall(proxyManager, 'delegate_task', {
      chat_id: chat.id,
      prompt: 'Update the focused route',
      files: [path.join(projectPath, 'src/demo.js')],
    }, { stateGraph: sg, source: 'test' });

    assert.equal(prepared.args.agent_slug, 'orchestrator');
    assert.deepEqual(prepared.args.files, [path.join(projectPath, 'src/demo.js')]);
    assert.deepEqual(prepared.args.focus_graph.files, ['src/demo.js']);
    assert.deepEqual(prepared.args.focus_graph.imports, [{
      file: 'src/demo.js',
      sources: ['node:path', './service.js'],
    }]);
    assert.deepEqual(prepared.args.focus_graph.symbols.map(symbol => symbol.id), ['DR', 'HF']);
    assert.deepEqual(prepared.args.focus_graph.web, [{
      symbol: 'DR',
      name: 'DemoRoute',
      tag: 'demo-route',
      file: 'src/demo.js',
      template: 'src/demo.tpl.js',
      style: 'src/demo.css.js',
      children: ['child-card'],
      events: ['click'],
      dispatches: ['route-ready'],
      subscriptions: ['route/items'],
      bindings: ['onclick:onRouteClick'],
      tokens: ['--sn-text'],
    }]);
    assert.deepEqual(prepared.args.focus_graph.dependencies.map(dep => dep.symbol), ['DR', 'HF']);
    assert.deepEqual(prepared.args.focus_graph.dependencies[0].files, ['src/demo.tpl.js', 'src/demo.css.js']);
    assert.deepEqual(prepared.args.focus_graph.dependencies[0].elements, ['CC']);
    assert.deepEqual(prepared.args.focus_graph.dependencies[0].web, {
      tag: 'demo-route',
      template: 'src/demo.tpl.js',
      style: 'src/demo.css.js',
    });
    assert.equal(calls[0].payload.name, 'get_skeleton');
    assert.equal(calls.filter(call => call.payload.name === 'navigate').length, 2);
  });

  it('does not load project graph focus context when context mode is off', async () => {
    let chat = sg.createChat({ name: 'Main', agent: 'backend-engineer' }, 'test');
    let calls = [];
    proxyManager.requestFromChild = async (...args) => {
      calls.push(args);
      return {};
    };

    let prepared = await prepareDelegateTaskCall(proxyManager, 'delegate_task', {
      chat_id: chat.id,
      prompt: 'Update the focused route',
      files: ['src/demo.js'],
      context_mode: 'off',
    }, { stateGraph: sg, source: 'test' });

    assert.deepEqual(prepared.args.files, ['src/demo.js']);
    assert.equal(prepared.args.agent_slug, 'orchestrator');
    assert.equal(prepared.args.focus_graph, undefined);
    assert.equal(calls.length, 0);
  });
});
