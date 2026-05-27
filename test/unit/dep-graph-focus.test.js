import test from 'node:test';
import assert from 'node:assert/strict';

import { findConnectionPath, resolveSymbolFile } from 'symbiote-node/graph';

test('resolveSymbolFile returns the file for a skeleton symbol', () => {
  const skeleton = {
    n: {
      'runTask()': { f: 'src/tasks.js' },
      'missingFile()': {},
    },
  };

  assert.equal(resolveSymbolFile(skeleton, 'runTask()'), 'src/tasks.js');
  assert.equal(resolveSymbolFile(skeleton, 'missingFile()'), null);
  assert.equal(resolveSymbolFile(skeleton, 'unknown()'), null);
  assert.equal(resolveSymbolFile(null, 'runTask()'), null);
});

test('findConnectionPath returns the shortest connection id path', () => {
  const connections = [
    { id: 'ab', from: 'a', to: 'b' },
    { id: 'bc', from: 'b', to: 'c' },
    { id: 'ad', from: 'a', to: 'd' },
    { id: 'dc', from: 'd', to: 'c' },
    { id: 'ce', from: 'c', to: 'e' },
  ];

  assert.deepEqual(findConnectionPath(connections, 'a', 'c'), ['ab', 'bc']);
  assert.deepEqual(findConnectionPath(connections, 'a', 'e'), ['ab', 'bc', 'ce']);
});

test('findConnectionPath returns empty when there is no useful path', () => {
  assert.deepEqual(findConnectionPath([{ id: 'ab', from: 'a', to: 'b' }], 'b', 'a'), []);
  assert.deepEqual(findConnectionPath([], 'a', 'b'), []);
  assert.deepEqual(findConnectionPath([{ id: 'ab', from: 'a', to: 'b' }], 'a', 'a'), []);
});
