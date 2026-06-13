import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

const {
  buildAgentProcessCanvasGraphModel,
  buildAgentProcessGraphModel,
  summarizeAgentProcessGraphModel,
} = await import('../../web/services/agent-process-graph.js?agent-process-graph-test');

function nodeByKind(model, kind) {
  return model.nodes.filter(node => node.kind === kind);
}

describe('agent process graph model', () => {
  it('starts a new chat with one orchestrator node', () => {
    let model = buildAgentProcessGraphModel({
      chat: {
        id: 'new-chat',
        agent: 'orchestrator',
        messages: [],
      },
    });

    assert.equal(model.nodes.length, 1);
    assert.equal(model.edges.length, 0);
    assert.equal(model.metadata.rootNodeId, 'agent:new-chat:orchestrator');
    assert.deepEqual(model.views.canvas.roots, ['agent:new-chat:orchestrator']);
    assert.equal(model.nodes[0].kind, 'agent.process.agent');
    assert.equal(model.nodes[0].label, 'orchestrator');
    assert.equal(nodeByKind(model, 'agent.process.chat').length, 0);
  });

  it('maps prompts, responses, active goal, child agents, tool calls, fallback events, and file references', () => {
    let rootChat = {
      id: 'root-chat',
      name: 'UI orchestration',
      agent: 'orchestrator',
      resource_group: 'reasoning-heavy',
      pendingTaskId: 'task-root',
      activeGoalId: 'goal-1',
      activeGoal: { id: 'goal-1', title: 'Finish process graph', status: 'active' },
      messages: [
        {
          role: 'user',
          text: 'Audit web/panels/AgentChat/AgentChat.js before changing the process graph',
        },
        {
          role: 'tool',
          name: 'delegate_task_readonly',
          input: {
            agent_slug: 'code-reviewer',
            files: ['web/panels/AgentChat/AgentChat.js', 'src/node/proxy/task-router.js'],
          },
          result: 'Task delegated: child-chat',
          streaming: false,
        },
        {
          role: 'system',
          text: 'Provider fallback: opencode/default -> mock/default. Reason: OpenCode CLI unavailable',
        },
        {
          role: 'agent',
          text: 'Delegated review is complete.',
        },
      ],
    };
    let childChat = {
      id: 'child-chat',
      parentChatId: 'root-chat',
      name: 'Code review',
      agent: 'code-reviewer',
      lastTaskStatus: 'done',
      messages: [
        {
          role: 'tool',
          name: 'shell',
          input: { cmd: "sed -n '1,80p' web/services/agent-process-graph.js" },
          result: 'ok',
          streaming: false,
        },
      ],
    };

    let model = buildAgentProcessGraphModel({
      chat: rootChat,
      chats: [rootChat, childChat],
      childChats: [childChat],
    });
    let summary = summarizeAgentProcessGraphModel(model);

    assert.equal(model.metadata.chatId, 'root-chat');
    assert.equal(model.metadata.rootNodeId, 'agent:root-chat:orchestrator');
    assert.equal(summary.metadata.childChatCount, 1);
    assert.equal(summary.metadata.toolCount, 2);
    assert.equal(summary.metadata.messageCount, 2);
    assert.equal(nodeByKind(model, 'agent.process.chat').length, 0);
    assert.ok(nodeByKind(model, 'agent.process.agent').some(node => node.params.chatId === 'root-chat'));
    assert.ok(nodeByKind(model, 'agent.process.message').some(node => node.params.role === 'user'));
    assert.ok(nodeByKind(model, 'agent.process.message').some(node => node.params.role === 'agent'));
    assert.ok(nodeByKind(model, 'agent.process.goal').some(node => node.label === 'Finish process graph'));
    assert.ok(nodeByKind(model, 'agent.process.childAgent').some(node => node.params.chatId === 'child-chat'));
    assert.ok(nodeByKind(model, 'agent.process.tool').some(node => node.params.name === 'delegate_task_readonly'));
    assert.ok(nodeByKind(model, 'agent.process.providerFallback').some(node => node.params.reason.includes('OpenCode CLI')));
    assert.ok(nodeByKind(model, 'agent.process.file').some(node => node.params.path === 'web/panels/AgentChat/AgentChat.js'));
    assert.ok(nodeByKind(model, 'agent.process.file').some(node => node.params.path === 'web/services/agent-process-graph.js'));
    assert.ok(model.edges.some(edge => edge.kind === 'agent.process.delegate'));
    assert.ok(model.edges.some(edge => edge.kind === 'agent.process.file.read'));
    assert.ok(model.views.canvas.roots.includes('agent:root-chat:orchestrator'));
    assert.ok(model.views.canvas.roots.includes('file:web/services/agent-process-graph.js'));
  });

  it('returns a canvas graph model consumable by symbiote-ui canvas-graph', () => {
    let canvasModel = buildAgentProcessCanvasGraphModel({
      chat: {
        id: 'root',
        name: 'Root',
        agent: 'orchestrator',
        messages: [{ role: 'tool', name: 'get_skeleton', input: { path: 'web/app.js' }, result: 'ok' }],
      },
    });

    assert.ok(Array.isArray(canvasModel.nodes));
    assert.ok(Array.isArray(canvasModel.edges));
    assert.ok(Array.isArray(canvasModel.rootNodes));
    assert.ok(canvasModel.rootNodes.includes('agent:root:orchestrator'));
    assert.ok(canvasModel.rootNodes.includes('file:web/app.js'));
    assert.ok(canvasModel.nodes.some(node => node.id === 'agent:root:orchestrator'));
    assert.equal(canvasModel.nodes.some(node => node.id === 'chat:root'), false);
    assert.ok(canvasModel.nodes.some(node => node.id === 'file:web/app.js'));
    assert.ok(canvasModel.edges.some(edge => edge.from.startsWith('tool:')));
  });

  it('persists graph canvas layout per chat id in the panel adapter', () => {
    let source = fs.readFileSync(
      path.join(ROOT, 'web/panels/AgentProcessGraph/AgentProcessGraph.js'),
      'utf8',
    );

    assert.match(source, /import \{ persistLayout, readLayout \} from '\.\.\/\.\.\/common\/ui-state\.js';/);
    assert.match(source, /function processGraphLayoutKey\(chatId\)/);
    assert.match(source, /agent-process-graph:\$\{encodeURIComponent\(String\(chatId \|\| 'active'\)\)\}:layout/);
    assert.match(source, /function isLayoutSnapshotUsable\(snapshot, canvasModel = \{\}\)/);
    assert.match(source, /matchedPositions >= Math\.max\(2, Math\.ceil\(nodes\.length \* 0\.5\)\)/);
    assert.match(source, /addEventListener\('layout-snapshot', this\._onLayoutSnapshot\)/);
    assert.match(source, /setLayoutSnapshot\?\.\(layoutSnapshot \|\| null\)/);
    assert.match(source, /persistLayout\(this\._layoutKey, snapshot\)/);
    assert.match(source, /if \(\(this\._nodeCount \|\| 0\) > 1\) \{\n\s+this\._fitAll\(\);/);
    assert.match(source, /fitView\?\.\(\{ padding: 48, animate: true \}\)/);
    assert.match(source, /fitNodes\?\.\(\[this\._rootNodeId\]/);
    assert.match(source, /animateNodeAppearance\?\.\(null, \{ durationMs: 520, staggerMs: 4 \}\)/);
    assert.match(source, /_persistCurrentLayoutSnapshot\(didFit \? 700 : 0\)/);
  });
});
