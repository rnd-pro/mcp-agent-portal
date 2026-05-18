import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatAttachedContextBlock,
  mergeAttachedContext,
  removeAttachedContext,
} from '../../web/services/chat-context.js';

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
