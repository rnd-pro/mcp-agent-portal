import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  resolveNativePanelPresentationOffset,
  resolveNativePanelPresentationPosition,
} from '../demo/native-panels-webgl-lab-layout.js';

let windows = [
  { id: 'project', position: [-0.5, 0, 0], role: 'window' },
  { id: 'source', position: [0, 0, 0], role: 'window' },
  { id: 'agent-chat', position: [0.5, 0, 0], role: 'window' },
];

test('native panel presentation separates adjacent windows without changing their measured geometry', () => {
  assert.deepEqual(
    windows.map((panel) => resolveNativePanelPresentationOffset(panel, windows, 0.06)),
    [
      [-0.06, 0, 0],
      [0, 0, 0],
      [0.06, 0, 0],
    ],
  );
});

test('native panel presentation centers layout controls inside the new window gaps', () => {
  assert.deepEqual(
    resolveNativePanelPresentationOffset({ id: 'left-resizer', position: [-0.25, 0, 0] }, windows, 0.06),
    [-0.03, 0, 0],
  );
  assert.deepEqual(
    resolveNativePanelPresentationOffset({ id: 'right-resizer', position: [0.25, 0, 0] }, windows, 0.06),
    [0.03, 0, 0],
  );
});

test('native panel presentation keeps an individual drag offset above measured and gap positions', () => {
  assert.deepEqual(
    resolveNativePanelPresentationPosition(windows[0], windows, 0.06, [0.2, -0.1, 0]),
    [-0.36, -0.1, 0],
  );
});

test('native panel presentation rejects invalid gap values', () => {
  assert.throws(
    () => resolveNativePanelPresentationOffset(windows[0], windows, -0.01),
    /non-negative finite gap/,
  );
});
