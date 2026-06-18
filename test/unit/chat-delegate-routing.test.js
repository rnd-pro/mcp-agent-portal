import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StateGraph } from '../../src/node/state-graph.js';
import { extractResourceGroupDiagnostics, parseResourceGroupDiagnostics, prepareDelegateTaskCall } from '../../src/node/proxy/chat-delegate-routing.js';

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
    assert.deepEqual(prepared.delegationPolicy, {
      accessMode: 'yolo',
      accessModeSource: 'chat',
      readOnly: false,
      resourceGroup: 'reasoning-heavy',
      routingOverride: false,
      sessionInherited: false,
    });
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

  it('does not reuse saved chat sessions when routing is overridden', async () => {
    let chat = sg.createChat({
      name: 'Main',
      agent: 'orchestrator',
      provider: 'claude',
      model: 'deepseek/deepseek-v4-pro',
      resource_group: 'implementation',
    }, 'test');
    sg.updateChatSession(chat.id, 'claude-session');

    let inherited = await prepareDelegateTaskCall(proxyManager, 'delegate_task', {
      chat_id: chat.id,
      prompt: 'Continue same route',
    }, { stateGraph: sg, source: 'test' });
    assert.equal(inherited.args.session_id, 'claude-session');

    let switched = await prepareDelegateTaskCall(proxyManager, 'delegate_task', {
      chat_id: chat.id,
      prompt: 'Switch to Codex read-only',
      resource_group: 'orchestration-readonly',
    }, { stateGraph: sg, source: 'test' });
    assert.equal(switched.args.session_id, undefined);
    assert.equal(switched.args.resource_group, 'orchestration-readonly');
    assert.equal(switched.delegationPolicy.accessMode, null);
    assert.equal(switched.delegationPolicy.accessModeSource, 'agent_pool_resource_group');
    assert.equal(switched.delegationPolicy.readOnly, true);
    assert.equal(switched.delegationPolicy.routingOverride, true);
  });

  it('treats resource_group none as an explicit group clear', async () => {
    let chat = sg.createChat({
      name: 'Main',
      agent: 'orchestrator',
      provider: 'claude',
      model: 'deepseek/deepseek-v4-pro',
      resource_group: 'reasoning-heavy',
    }, 'test');
    sg.updateChatSession(chat.id, 'claude-session');

    let prepared = await prepareDelegateTaskCall(proxyManager, 'delegate_task', {
      chat_id: chat.id,
      prompt: 'Continue without a group',
      resource_group: 'none',
      provider: 'codex',
      model: 'gpt-test',
    }, { stateGraph: sg, source: 'test' });

    assert.equal(prepared.args.resource_group, undefined);
    assert.equal(prepared.args.provider, 'codex');
    assert.equal(prepared.args.model, 'gpt-test');
    assert.equal(prepared.args.session_id, undefined);
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

describe('parse resource group diagnostics', () => {
  it('parses missing resource group error with available alternatives', () => {
    let errorText = `❌ Resource group \`nonexistent\` not found.

Available resource groups (2):
  - \`orchestration-readonly\` (provider: codex, model: gpt-5, capacity: 0/3)
  - \`reasoning-heavy\` (provider: claude, model: deepseek/deepseek-v4-pro, capacity: 1/2, fallback: codex/gpt-5)`;

    let diagnostics = parseResourceGroupDiagnostics(errorText);

    assert.equal(diagnostics.errorKind, 'not_found');
    assert.equal(diagnostics.groupName, 'nonexistent');
    assert.equal(diagnostics.availableCount, 2);
    assert.equal(diagnostics.reason.includes('not configured'), true);

    assert.equal(diagnostics.availableGroups[0].name, 'orchestration-readonly');
    assert.equal(diagnostics.availableGroups[0].provider, 'codex');
    assert.equal(diagnostics.availableGroups[0].model, 'gpt-5');
    assert.deepEqual(diagnostics.availableGroups[0].capacity, { active: 0, max: 3 });

    assert.equal(diagnostics.availableGroups[1].name, 'reasoning-heavy');
    assert.equal(diagnostics.availableGroups[1].provider, 'claude');
    assert.equal(diagnostics.availableGroups[1].model, 'deepseek/deepseek-v4-pro');
    assert.deepEqual(diagnostics.availableGroups[1].capacity, { active: 1, max: 2 });
    assert.deepEqual(diagnostics.availableGroups[1].fallbackProfiles, ['codex/gpt-5']);
  });

  it('parses at-capacity resource group error with alternatives', () => {
    let errorText = `⚠️ Resource group \`reasoning-heavy\` is at capacity (2/2 active tasks). Wait for an existing task in this group to complete, or use an available alternative.

Available resource groups (1):
  - \`implementation\` (provider: opencode, model: default, capacity: 2/4)`;

    let diagnostics = parseResourceGroupDiagnostics(errorText);

    assert.equal(diagnostics.errorKind, 'at_capacity');
    assert.equal(diagnostics.groupName, 'reasoning-heavy');
    assert.deepEqual(diagnostics.capacity, { active: 2, max: 2 });
    assert.equal(diagnostics.availableCount, 1);
    assert.equal(diagnostics.reason.includes('no available capacity'), true);

    assert.equal(diagnostics.availableGroups[0].name, 'implementation');
    assert.equal(diagnostics.availableGroups[0].provider, 'opencode');
    assert.equal(diagnostics.availableGroups[0].model, 'default');
    assert.deepEqual(diagnostics.availableGroups[0].capacity, { active: 2, max: 4 });
  });

  it('returns null for non-resource-group errors', () => {
    assert.equal(parseResourceGroupDiagnostics('Some other error happened'), null);
    assert.equal(parseResourceGroupDiagnostics(''), null);
    assert.equal(parseResourceGroupDiagnostics(null), null);
  });

  it('extracts diagnostics from task result object', () => {
    let taskResult = {
      content: [{
        type: 'text',
        text: `❌ Resource group \`missing-group\` not found.

Available resource groups (1):
  - \`orchestration-readonly\` (provider: codex)`,
      }],
    };

    let diagnostics = extractResourceGroupDiagnostics(taskResult);
    assert.equal(diagnostics.errorKind, 'not_found');
    assert.equal(diagnostics.groupName, 'missing-group');
    assert.equal(diagnostics.availableCount, 1);
  });

  it('returns null from task result without resource group errors', () => {
    let taskResult = {
      content: [{ type: 'text', text: 'Some non-rg error' }],
    };

    assert.equal(extractResourceGroupDiagnostics(taskResult), null);
    assert.equal(extractResourceGroupDiagnostics({ content: [] }), null);
    assert.equal(extractResourceGroupDiagnostics(null), null);
  });

  it('parses error without any available groups', () => {
    let errorText = `❌ Resource group \`missing-group\` not found.

No other resource groups are available in this workspace.`;

    let diagnostics = parseResourceGroupDiagnostics(errorText);
    assert.equal(diagnostics.errorKind, 'not_found');
    assert.equal(diagnostics.groupName, 'missing-group');
    assert.equal(diagnostics.availableCount, 0);
    assert.deepEqual(diagnostics.availableGroups, []);
  });

  it('parses at-capacity error with no other groups having capacity', () => {
    let errorText = `⚠️ Resource group \`reasoning-heavy\` is at capacity (2/2 active tasks). Wait for an existing task in this group to complete, or use an available alternative.

No other resource groups currently have capacity in this workspace.`;

    let diagnostics = parseResourceGroupDiagnostics(errorText);
    assert.equal(diagnostics.errorKind, 'at_capacity');
    assert.equal(diagnostics.groupName, 'reasoning-heavy');
    assert.deepEqual(diagnostics.capacity, { active: 2, max: 2 });
    assert.equal(diagnostics.availableCount, 0);
    assert.deepEqual(diagnostics.availableGroups, []);
  });
});
