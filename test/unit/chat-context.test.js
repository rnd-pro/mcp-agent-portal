import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractAttachedFilePaths,
  formatAttachedContextBlock,
  mergeAttachedContext,
  removeAttachedContext,
} from '../../web/services/chat-context.js';
import {
  CHAT_GOAL_STATUSES,
  buildPromptWithChatGoal,
  filterChatGoalQueue,
  formatChatGoalIntentPromptBlock,
  formatChatGoalPromptBlock,
  formatChatGoalQueuePromptBlock,
  normalizeChatGoalQueueMessage,
  normalizeChatGoalInput,
  toChatGoalContextItem,
} from '../../src/iso/chat-goals.js';

test('mergeAttachedContext normalizes and deduplicates files', () => {
  let context = mergeAttachedContext([], { path: 'web/app.js' });
  context = mergeAttachedContext(context, { path: 'web/app.js', source: 'graph' });

  assert.equal(context.length, 1);
  assert.equal(context[0].key, 'file:web/app.js');
  assert.equal(context[0].name, 'app.js');
  assert.equal(context[0].source, 'graph');
});

test('mergeAttachedContext stores graph cluster context', () => {
  let context = mergeAttachedContext([], {
    type: 'graph-cluster',
    clusterId: 'web-dashboard',
    label: 'Web Dashboard',
    description: 'Browser UI',
    paths: ['web/'],
  });

  assert.equal(context[0].key, 'graph-cluster:web-dashboard');
  assert.equal(context[0].icon, 'account_tree');
  assert.deepEqual(context[0].paths, ['web/']);
});

test('removeAttachedContext removes by stable key', () => {
  let context = mergeAttachedContext([], { path: 'web/app.js' });
  context = mergeAttachedContext(context, { type: 'graph-cluster', clusterId: 'web', paths: ['web/'] });

  assert.deepEqual(removeAttachedContext(context, 'file:web/app.js').map((item) => item.key), [
    'graph-cluster:web',
  ]);
});

test('formatAttachedContextBlock emits structured context payload', () => {
  let context = mergeAttachedContext([], { path: 'web/app.js' });
  context = mergeAttachedContext(context, {
    type: 'graph-cluster',
    clusterId: 'backend',
    label: 'Backend',
    description: 'Server code',
    paths: ['src/node/'],
  });

  let block = formatAttachedContextBlock(context);

  assert.match(block, /^\[Attached Context\]\n\[/);
  assert.match(block, /"type": "file"/);
  assert.match(block, /"clusterId": "backend"/);
  assert.match(block, /"pathPatterns": \[/);
});

test('formatAttachedContextBlock supports graph story beats', () => {
  let context = mergeAttachedContext([], {
    type: 'graph-story-beat',
    storyId: 'compact-flow',
    beatId: 'api-route',
    storyLabel: 'Compact Flow',
    beatLabel: 'API Route',
    narrative: 'Route maps UI request to project-graph compact.',
    nodes: ['web/app.js'],
    clusterId: 'web-dashboard',
    focusPath: 'web/app.js',
  });

  let block = formatAttachedContextBlock(context);

  assert.equal(context[0].key, 'graph-story-beat:compact-flow:api-route');
  assert.match(block, /"type": "graph-story-beat"/);
  assert.match(block, /"beatId": "api-route"/);
  assert.match(block, /"focusPath": "web\/app.js"/);
});

test('extractAttachedFilePaths returns only structured file context hints', () => {
  let context = mergeAttachedContext([], { path: 'web/app.js', source: 'autocomplete' });
  context = mergeAttachedContext(context, { path: 'web/app.js', source: 'manual' });
  context = mergeAttachedContext(context, {
    type: 'graph-cluster',
    clusterId: 'backend',
    label: 'Backend',
    paths: ['src/node/'],
  });

  assert.deepEqual(extractAttachedFilePaths(context), ['web/app.js']);
});

test('chat goals normalize lifecycle input and prompt context', () => {
  let normalized = normalizeChatGoalInput({
    title: '  Ship chat goals  ',
    description: '  Goal orchestration in chat. ',
    context: ['Agent Portal', 'MCP'],
    scenarios: [{ title: 'Goal intent' }, 'orchestrator updates'],
    status: 'done',
  });

  assert.deepEqual(CHAT_GOAL_STATUSES, ['active', 'paused', 'blocked', 'completed']);
  assert.equal(normalized.title, 'Ship chat goals');
  assert.equal(normalized.description, 'Goal orchestration in chat.');
  assert.equal(normalized.status, 'completed');
  assert.deepEqual(normalized.context, ['Agent Portal', 'MCP']);
  assert.deepEqual(normalized.scenarios, ['Goal intent', 'orchestrator updates']);

  let goal = {
    id: 'goal-1',
    title: 'Publish latest build',
    status: 'active',
    description: 'Release and verify npm package.',
    context: ['symbiote-ui', 'agent-portal'],
    scenarios: ['goal intent', 'MCP tool'],
  };
  let block = formatChatGoalPromptBlock(goal);

  assert.match(block, /\[Active Goal\]/);
  assert.match(block, /"id": "goal-1"/);
  assert.match(block, /"status": "active"/);
  assert.match(block, /goal intent/);
  assert.deepEqual(toChatGoalContextItem(goal), {
    type: 'goal',
    key: 'goal:goal-1',
    goalId: 'goal-1',
    name: 'Publish latest build',
    title: 'Goal: Publish latest build',
    icon: 'flag',
    status: 'active',
  });
  assert.match(buildPromptWithChatGoal('Proceed.', goal), /^\[Active Goal\]/);
  assert.equal(buildPromptWithChatGoal(`${block}\n\nProceed.`, goal), `${block}\n\nProceed.`);

  let intentBlock = formatChatGoalIntentPromptBlock({ chatId: 'chat-1', projectId: 'project-1' });
  assert.match(intentBlock, /^\[Goal Intent\]/);
  assert.match(intentBlock, /"chatId": "chat-1"/);
  assert.match(intentBlock, /"projectId": "project-1"/);
  assert.match(intentBlock, /create_goal/);

  let queueItem = normalizeChatGoalQueueMessage({
    id: 'message-1',
    text: '  Restart with this correction. ',
    delivery: 'now',
    status: 'pending',
  });
  assert.equal(queueItem.text, 'Restart with this correction.');
  assert.equal(queueItem.delivery, 'goal');
  assert.equal(queueItem.status, 'queued');

  let queuedGoal = { ...goal, queue: [queueItem, { id: 'old', text: 'done', status: 'applied' }] };
  assert.deepEqual(filterChatGoalQueue(queuedGoal, { status: 'queued' }).map(item => item.id), ['message-1']);
  let queueBlock = formatChatGoalQueuePromptBlock(goal, [queueItem]);
  assert.match(queueBlock, /^\[Goal Queue\]/);
  assert.match(queueBlock, /"delivery": "goal"/);
  assert.match(queueBlock, /Restart with this correction/);
});
