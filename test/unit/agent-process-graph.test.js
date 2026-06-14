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
    let agents = [
      { slug: 'orchestrator', icon: 'hub', color: '#1565C0' },
      { slug: 'code-reviewer', icon: 'rate_review', color: '#F9A825' },
    ];
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
    let uiChildChat = {
      id: 'ui-child-chat',
      parentChatId: 'root-chat',
      name: 'UI implementation',
      agent: 'ui-engineer',
      lastTaskStatus: 'done',
      messages: [],
    };

    let model = buildAgentProcessGraphModel({
      chat: rootChat,
      chats: [rootChat, childChat, uiChildChat],
      childChats: [childChat, uiChildChat],
      agents,
    });
    let summary = summarizeAgentProcessGraphModel(model);
    let rootAgent = nodeByKind(model, 'agent.process.agent').find(node => node.params.chatId === 'root-chat');
    let childAgent = nodeByKind(model, 'agent.process.childAgent').find(node => node.params.chatId === 'child-chat');
    let rootPrompt = model.nodes.find(node => node.id === 'message:root-chat:message:0:user');
    let delegateTool = model.nodes.find(node => node.id === 'tool:root-chat:tool:1');
    let childTool = model.nodes.find(node => node.id === 'tool:child-chat:tool:0');
    let fallbackNode = model.nodes.find(node => node.id === 'fallback:root-chat:fallback:2');
    let delegatedFile = model.nodes.find(node => node.id === 'file:web/panels/AgentChat/AgentChat.js');

    assert.equal(model.metadata.chatId, 'root-chat');
    assert.equal(model.metadata.rootNodeId, 'agent:root-chat:orchestrator');
    assert.equal(summary.metadata.childChatCount, 2);
    assert.equal(summary.metadata.toolCount, 2);
    assert.equal(summary.metadata.messageCount, 2);
    assert.equal(nodeByKind(model, 'agent.process.chat').length, 0);
    assert.equal(rootAgent.design.color, '#1565C0');
    assert.equal(rootAgent.design.icon, 'hub');
    assert.equal(rootAgent.design.canvas.icon, 'hub');
    assert.equal(childAgent.design.color, '#F9A825');
    assert.equal(childAgent.design.icon, 'rate_review');
    assert.deepEqual(
      { chatId: rootPrompt.params.chatId, messageIndex: rootPrompt.params.messageIndex, eventType: rootPrompt.params.eventType },
      { chatId: 'root-chat', messageIndex: 0, eventType: 'message' },
    );
    assert.deepEqual(
      { chatId: delegateTool.params.chatId, messageIndex: delegateTool.params.messageIndex, eventType: delegateTool.params.eventType },
      { chatId: 'root-chat', messageIndex: 1, eventType: 'tool' },
    );
    assert.deepEqual(
      { chatId: childTool.params.chatId, messageIndex: childTool.params.messageIndex, eventType: childTool.params.eventType },
      { chatId: 'child-chat', messageIndex: 0, eventType: 'tool' },
    );
    assert.deepEqual(
      { chatId: fallbackNode.params.chatId, messageIndex: fallbackNode.params.messageIndex, eventType: fallbackNode.params.eventType },
      { chatId: 'root-chat', messageIndex: 2, eventType: 'fallback' },
    );
    assert.deepEqual(
      {
        sourceChatId: delegatedFile.params.sourceChatId,
        sourceMessageIndex: delegatedFile.params.sourceMessageIndex,
        sourceEventType: delegatedFile.params.sourceEventType,
      },
      { sourceChatId: 'root-chat', sourceMessageIndex: 1, sourceEventType: 'tool' },
    );
    assert.ok(nodeByKind(model, 'agent.process.parallelBatch').some(node => node.params.childChatCount === 2 && node.design.icon === 'sync'));
    assert.ok(nodeByKind(model, 'agent.process.merge').some(node => node.params.childChatCount === 2 && node.design.icon === 'merge'));
    assert.ok(nodeByKind(model, 'agent.process.message').some(node => node.params.role === 'user'));
    assert.ok(nodeByKind(model, 'agent.process.message').some(node => node.params.role === 'agent'));
    assert.ok(nodeByKind(model, 'agent.process.goal').some(node => node.label === 'Finish process graph' && node.design.icon === 'track_changes'));
    assert.ok(nodeByKind(model, 'agent.process.childAgent').some(node => node.params.chatId === 'child-chat'));
    assert.ok(nodeByKind(model, 'agent.process.tool').some(node => node.params.name === 'delegate_task_readonly' && node.design.icon === 'sync'));
    assert.ok(nodeByKind(model, 'agent.process.tool').some(node => node.params.name === 'shell' && node.design.icon === 'terminal'));
    assert.ok(nodeByKind(model, 'agent.process.providerFallback').some(node => node.params.reason.includes('OpenCode CLI') && node.design.icon === 'sync_problem'));
    assert.ok(nodeByKind(model, 'agent.process.file').some(node => node.params.path === 'web/panels/AgentChat/AgentChat.js' && node.design.icon === 'description'));
    assert.ok(nodeByKind(model, 'agent.process.file').some(node => node.params.path === 'web/services/agent-process-graph.js'));
    assert.ok(model.edges.some(edge => edge.kind === 'agent.process.delegate'));
    assert.ok(model.edges.some(edge => edge.kind === 'agent.process.parallelStart'));
    assert.ok(model.edges.some(edge => edge.kind === 'agent.process.parallelResult'));
    assert.ok(model.edges.some(edge => edge.kind === 'agent.process.parallelMerge'));
    assert.ok(model.edges.some(edge => edge.kind === 'agent.process.file.read'));
    assert.ok(model.views.canvas.roots.includes('agent:root-chat:orchestrator'));
    assert.ok(model.views.canvas.roots.includes('file:web/services/agent-process-graph.js'));
  });

  it('keeps absolute chat message indexes when the graph is built from a message window', () => {
    let model = buildAgentProcessGraphModel({
      chat: {
        id: 'windowed-chat',
        agent: 'orchestrator',
        messageWindow: { startIndex: 40, count: 2, totalItems: 42, hasOlder: true },
        messages: [
          { role: 'user', text: 'Inspect web/panels/AgentChat/AgentChat.js' },
          { role: 'tool', name: 'shell', input: { cmd: 'rg AgentChat web/panels/AgentChat/AgentChat.js' }, result: 'ok' },
        ],
      },
    });

    let prompt = model.nodes.find(node => node.kind === 'agent.process.message');
    let tool = model.nodes.find(node => node.kind === 'agent.process.tool');
    let file = model.nodes.find(node => node.kind === 'agent.process.file');

    assert.equal(prompt.params.messageIndex, 40);
    assert.equal(tool.params.messageIndex, 41);
    assert.equal(file.params.sourceMessageIndex, 41);
    assert.equal(model.nodes.some(node => node.id === 'message:windowed-chat:message:40:user'), true);
    assert.equal(model.nodes.some(node => node.id === 'tool:windowed-chat:tool:41'), true);
  });

  it('adds development map tasks, latest tools, prompt hints, and state errors without raw internals', () => {
    let model = buildAgentProcessGraphModel({
      chat: {
        id: 'root-chat',
        agent: 'orchestrator',
      },
      developmentMap: {
        schemaVersion: 1,
        stateError: 'list_tasks unavailable',
        rootChatId: 'root-chat',
        primaryTaskId: 'task-root',
        subagentMap: {
          nodes: [{
            chatId: 'root-chat',
            name: 'Root',
            agent: 'orchestrator',
            runningTaskCount: 1,
            totalTaskCount: 1,
            toolCount: 1,
            toolUsageMs: 1500,
          }, {
            chatId: 'child-chat',
            parentChatId: 'root-chat',
            name: 'Implementation',
            agent: 'frontend-engineer',
            runningTaskCount: 0,
            totalTaskCount: 1,
            taskIds: ['task-child'],
            toolCount: 1,
            toolUsageMs: 300,
          }],
          edges: [{ from: 'root-chat', to: 'child-chat', kind: 'agent.delegates' }],
        },
        taskMap: {
          byId: {
            'task-root': {
              id: 'task-root',
              chatId: 'root-chat',
              status: 'running',
              elapsedMs: 5000,
              toolCount: 1,
              toolUsageMs: 1500,
              latestTool: { name: 'shell' },
            },
          },
        },
        latestTools: [{
          name: 'shell',
          detail: 'node --test',
          status: 'success',
          chatId: 'root-chat',
          taskId: 'task-root',
          usageMs: 1500,
          timingSource: 'tool_result',
          rawInput: 'raw-session-token',
        }],
        promptHintMap: {
          hints: [{
            id: 'poll-current-task',
            label: 'Poll current task',
            tool: 'get_chat_task_result',
            priority: 'high',
            chatId: 'root-chat',
            taskId: 'task-root',
            prompt: 'raw-session-token',
            reason: 'Refresh without raw Agent Pool tools.',
          }, {
            id: 'continue-chat',
            label: 'Continue chat',
            tool: 'resume_chat',
            priority: 'normal',
            chatId: 'root-chat',
            taskId: 'task-root',
            prompt: 'Continue from the current development map and verify the scoped result.',
            reason: 'Keeps orchestration context attached to the chat.',
          }],
        },
        usage: {
          runningTasks: 1,
          totalTasks: 2,
          subagents: 1,
          toolUses: 2,
          toolUsageMs: 1800,
        },
      },
    });
    let summary = summarizeAgentProcessGraphModel(model);
    let taskNode = nodeByKind(model, 'agent.process.task')[0];
    let latestToolNode = nodeByKind(model, 'agent.process.latestTool')[0];
    let hintNodes = nodeByKind(model, 'agent.process.promptHint');
    let hintNode = hintNodes.find(node => node.params.id === 'poll-current-task');
    let safeHintNode = hintNodes.find(node => node.params.id === 'continue-chat');
    let errorNode = nodeByKind(model, 'agent.process.stateError')[0];

    assert.equal(nodeByKind(model, 'agent.process.childAgent').some(node => node.params.chatId === 'child-chat'), true);
    assert.equal(taskNode.params.taskId, 'task-root');
    assert.equal(taskNode.params.toolUsageMs, 1500);
    assert.equal(latestToolNode.params.name, 'shell');
    assert.equal(latestToolNode.params.usageMs, 1500);
    assert.equal(latestToolNode.params.timingSource, 'tool_result');
    assert.equal('input' in latestToolNode.params, false);
    assert.equal('result' in latestToolNode.params, false);
    assert.equal(hintNode.params.tool, 'get_chat_task_result');
    assert.equal('prompt' in hintNode.params, false);
    assert.equal('promptPreview' in hintNode.params, false);
    assert.equal(safeHintNode.params.promptPreview, 'Continue from the current development map and verify the scoped result.');
    assert.equal(errorNode.params.source, 'developmentMap');
    assert.equal(summary.metadata.developmentMap.runningTasks, 1);
    assert.equal(summary.metadata.developmentMap.latestToolCount, 1);
    assert.equal(summary.metadata.developmentMap.promptHintCount, 2);
    assert.equal(JSON.stringify(model).includes('raw-session-token'), false);
    assert.equal(model.edges.some(edge => edge.kind === 'agent.process.latestTool'), true);
    assert.equal(model.edges.some(edge => edge.kind === 'agent.process.promptHint'), true);
  });

  it('returns a canvas graph model consumable by symbiote-ui canvas-graph', () => {
    let canvasModel = buildAgentProcessCanvasGraphModel({
      chat: {
        id: 'root',
        name: 'Root',
        agent: 'orchestrator',
        messages: [{ role: 'tool', name: 'get_skeleton', input: { path: 'web/app.js' }, result: 'ok' }],
      },
      agents: [{ slug: 'orchestrator', icon: 'hub', color: '#1565C0' }],
    });

    assert.ok(Array.isArray(canvasModel.nodes));
    assert.ok(Array.isArray(canvasModel.edges));
    assert.ok(Array.isArray(canvasModel.rootNodes));
    assert.ok(canvasModel.rootNodes.includes('agent:root:orchestrator'));
    assert.ok(canvasModel.rootNodes.includes('file:web/app.js'));
    assert.ok(canvasModel.nodes.some(node => node.id === 'agent:root:orchestrator'));
    assert.equal(canvasModel.nodes.find(node => node.id === 'agent:root:orchestrator').color, '#1565C0');
    assert.equal(canvasModel.nodes.find(node => node.id === 'agent:root:orchestrator').icon, 'hub');
    assert.equal(canvasModel.nodes.find(node => node.id.startsWith('tool:')).icon, 'account_tree');
    assert.equal(canvasModel.nodes.find(node => node.id === 'file:web/app.js').icon, 'description');
    assert.equal(canvasModel.nodes.some(node => node.id === 'chat:root'), false);
    assert.ok(canvasModel.nodes.some(node => node.id === 'file:web/app.js'));
    assert.ok(canvasModel.edges.some(edge => edge.from.startsWith('tool:')));
  });

  it('persists graph canvas layout per chat id in the panel adapter', () => {
    let source = fs.readFileSync(
      path.join(ROOT, 'web/panels/AgentProcessGraph/AgentProcessGraph.js'),
      'utf8',
    );
    let template = fs.readFileSync(
      path.join(ROOT, 'web/panels/AgentProcessGraph/AgentProcessGraph.tpl.js'),
      'utf8',
    );
    let css = fs.readFileSync(
      path.join(ROOT, 'web/panels/AgentProcessGraph/AgentProcessGraph.css.js'),
      'utf8',
    );
    let globalCss = fs.readFileSync(
      path.join(ROOT, 'web/style.css'),
      'utf8',
    );

    assert.match(source, /import \{ persistLayout, persistUiValue, readLayout, readUiValue \} from '\.\.\/\.\.\/common\/ui-state\.js';/);
    assert.match(source, /const DEFAULT_LAYOUT_ALGORITHM = 'organic';/);
    assert.match(source, /const LAYOUT_ALGORITHMS = new Set\(\['organic', 'oil-cloud', 'spring'\]\);/);
    assert.match(source, /const LAYOUT_ALGORITHM_PATH = 'ui\/preferences\/agentProcessGraph\/layoutAlgorithm';/);
    assert.match(source, /function normalizeLayoutAlgorithm\(value\)/);
    assert.match(source, /import \{ fetchDevelopmentMap \} from '\.\.\/\.\.\/services\/orchestration-development-map\.js';/);
    assert.match(source, /async function fetchAgents\(\)/);
    assert.match(source, /fetchJson\(`\/api\/agents\?ts=\$\{Date\.now\(\)\}`\)/);
    assert.match(source, /fetchDevelopmentMap\(\{\n\s+chatId: chat\.id,/);
    assert.match(source, /buildAgentProcessGraphModel\(\{ chat, chats, childChats, agents, developmentMap \}\)/);
    assert.match(source, /buildAgentProcessCanvasGraphModel\(\{ chat, chats, childChats, agents, developmentMap \}\)/);
    assert.match(source, /_renderDevelopmentMapSummary\(developmentMap\)/);
    assert.match(source, /let chatChanged = this\._currentChatId !== chat\.id;/);
    assert.match(source, /this\._currentChatId = chat\.id;/);
    assert.match(source, /function processGraphLayoutKey\(chatId\)/);
    assert.match(source, /agent-process-graph:\$\{encodeURIComponent\(String\(chatId \|\| 'active'\)\)\}:layout/);
    assert.match(source, /function isLayoutSnapshotUsable\(snapshot, canvasModel = \{\}\)/);
    assert.match(source, /matchedPositions >= Math\.max\(2, Math\.ceil\(nodes\.length \* 0\.5\)\)/);
    assert.match(source, /addEventListener\('layout-snapshot', this\._onLayoutSnapshot\)/);
    assert.match(source, /addEventListener\('file-selected', this\._onGraphNodeSelected\)/);
    assert.match(source, /dashEvents\.addEventListener\('chat-live-updated', this\._onChatLiveUpdate\)/);
    assert.match(source, /dashEvents\.removeEventListener\('chat-live-updated', this\._onChatLiveUpdate\)/);
    assert.match(source, /_handleChatLiveUpdate\(detail = \{\}\)/);
    assert.match(source, /this\._scheduleRefresh\(detail\.source === 'pull' \? 0 : 35\)/);
    assert.match(source, /function getNodeChatEventTarget\(node = \{\}\)/);
    assert.match(source, /function findChatMessageTarget\(messageIndex\)/);
    assert.match(source, /getMessageWindow\?\.\(\)/);
    assert.match(source, /let localIndex = messageIndex - startIndex;/);
    assert.match(source, /getScrollContainer\?\.\(\)/);
    assert.match(source, /function scrollChatMessageTargetIntoView/);
    assert.match(source, /container\.scrollTo\(\{ top: targetTop, behavior: 'smooth' \}\)/);
    assert.match(source, /setRouteChatId\(target\.chatId\)/);
    assert.match(source, /querySelectorAll\('chat-message-item'\)/);
    assert.match(source, /data-process-sync-active/);
    assert.match(source, /requestAnimationFrame\(\(\) => scrollChatMessageTargetIntoView\(messageTarget\)\)/);
    assert.match(source, /_clearChatSyncHighlight\(\)/);
    assert.match(source, /setLayoutSnapshot\?\.\(layoutSnapshot \|\| null\)/);
    assert.match(source, /const PROCESS_GRAPH_MESSAGE_LIMIT = 160;/);
    assert.match(source, /body: JSON\.stringify\(\{ id: chatId, includeMessages: false \}\)/);
    assert.match(source, /fetchJson\('\/api\/chats\/messages\/page'/);
    assert.match(source, /messageWindow: \{/);
    assert.match(source, /setForceLayoutOptions\?\.\(\{\n\s+layoutAlgorithm: this\._layoutAlgorithm \|\| DEFAULT_LAYOUT_ALGORITHM,\n\s+\}, \{ restart \}\)/);
    assert.match(source, /persistUiValue\(LAYOUT_ALGORITHM_PATH, nextAlgorithm, LAYOUT_ALGORITHM_KEY\)/);
    assert.match(source, /resetLayoutState\?\.\(\)/);
    assert.match(source, /_fitAfterLayout\(\{ restoreLayout: Boolean\(layoutSnapshot\) && !chatChanged \}\)/);
    assert.match(source, /this\._currentChatId = null;/);
    assert.match(source, /persistLayout\(this\._layoutKey, snapshot\)/);
    assert.match(source, /if \(\(this\._nodeCount \|\| 0\) > 1\) \{\n\s+this\._fitAll\(\);/);
    assert.match(source, /fitView\?\.\(\{ padding: 48, animate: true \}\)/);
    assert.match(source, /fitNodes\?\.\(\[this\._rootNodeId\]/);
    assert.match(source, /animateNodeAppearance\?\.\(null, \{ durationMs: 520, staggerMs: 4 \}\)/);
    assert.match(source, /_persistCurrentLayoutSnapshot\(didFit \? 700 : 0\)/);
    assert.match(template, /data-field="layout-algorithm"/);
    assert.match(template, /data-development-map-summary/);
    assert.match(template, /<option value="organic">/);
    assert.match(template, /<option value="oil-cloud">/);
    assert.match(template, /<option value="spring">/);
    assert.match(css, /\.apg-layout-picker select/);
    assert.match(css, /\.apg-map-summary/);
    assert.match(globalCss, /chat-message-item\[data-process-sync-active\]/);
    assert.match(globalCss, /process-sync-message-pulse/);
  });
});
